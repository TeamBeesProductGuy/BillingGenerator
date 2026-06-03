const { adminSupabase } = require('../config/database');

function buildSowRevisionNumber(baseSowNumber, versionNumber) {
  return `${baseSowNumber} A(${versionNumber})`;
}

function normalizeSowStatus(row) {
  if (!row) return row;
  if (Array.isArray(row)) return row.map(normalizeSowStatus);
  return row;
}

function uniqueStrings(values) {
  const seen = new Set();
  return (values || []).filter((value) => {
    const text = String(value || '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function enrichSowRoles(rows) {
  const items = Array.isArray(rows) ? rows : [];
  const sowIds = uniqueStrings(items.map((row) => row.id)).filter(Boolean);
  if (sowIds.length === 0) return items;

  const [rolesResult, posResult, rateCardsResult] = await Promise.all([
    adminSupabase
      .from('sow_items')
      .select('sow_id, role_position')
      .in('sow_id', sowIds),
    adminSupabase
      .from('purchase_orders')
      .select('id, po_number, sow_id, status')
      .in('sow_id', sowIds)
      .neq('status', 'Inactive')
      .order('created_at', { ascending: false }),
    adminSupabase
      .from('rate_cards')
      .select('sow_id')
      .in('sow_id', sowIds)
      .eq('is_active', true),
  ]);
  if (rolesResult.error) throw new Error(rolesResult.error.message);
  if (posResult.error) throw new Error(posResult.error.message);
  // Rate-card linkage is only used for value-chain hints; never block the SOW list on it.
  const rateCardRows = rateCardsResult.error ? [] : (rateCardsResult.data || []);

  const roleMap = {};
  (rolesResult.data || []).forEach((item) => {
    const key = String(item.sow_id);
    if (!roleMap[key]) roleMap[key] = [];
    roleMap[key].push(item.role_position);
  });

  const poMap = {};
  (posResult.data || []).forEach((po) => {
    const key = String(po.sow_id);
    if (!poMap[key]) poMap[key] = [];
    poMap[key].push({ id: po.id, po_number: po.po_number, status: po.status });
  });

  const rateCardCountMap = {};
  rateCardRows.forEach((rc) => {
    const key = String(rc.sow_id);
    rateCardCountMap[key] = (rateCardCountMap[key] || 0) + 1;
  });

  return items.map((row) => {
    const roles = uniqueStrings(roleMap[String(row.id)] || []);
    const linkedPos = poMap[String(row.id)] || [];
    return {
      ...row,
      roles,
      role_summary: roles.join(', '),
      linked_purchase_orders: linkedPos,
      linked_rate_card_count: rateCardCountMap[String(row.id)] || 0,
    };
  });
}

function toDatabaseSowStatus(status) {
  return status;
}

function isMissingColumnError(error, columnName) {
  return Boolean(error && error.message && error.message.includes(`column`) && error.message.includes(columnName));
}

function isMissingRelationError(error, relationName) {
  return Boolean(
    error &&
    error.message &&
    error.message.toLowerCase().indexOf('relation') !== -1 &&
    error.message.toLowerCase().indexOf(String(relationName || '').toLowerCase()) !== -1
  );
}

function shouldUpdateSowInPlace(existing) {
  if (!existing) return false;
  if (existing.base_sow_number === undefined || existing.version_number === undefined || existing.is_latest === undefined) {
    return true;
  }
  return existing.status === 'Draft' || existing.status === 'Amendment Draft';
}

async function getNextRevisionNumber(baseSowNumber) {
  const { data, error } = await adminSupabase.from('sows')
    .select('version_number')
    .eq('base_sow_number', baseSowNumber)
    .order('version_number', { ascending: false })
    .limit(1);

  if (isMissingColumnError(error, 'base_sow_number') || isMissingColumnError(error, 'version_number')) {
    return 1;
  }
  if (error) throw new Error(error.message);

  const currentMax = Array.isArray(data) && data.length > 0 ? (data[0].version_number || 0) : 0;
  return currentMax + 1;
}

function buildSowInsertPayload(sow, totalValue) {
  return {
    sow_number: sow.sow_number,
    base_sow_number: sow.base_sow_number,
    version_number: sow.version_number,
    parent_sow_id: sow.parent_sow_id || null,
    is_latest: sow.is_latest !== false,
    client_id: sow.client_id,
    quote_id: sow.quote_id || null,
    sow_date: sow.sow_date,
    effective_start: sow.effective_start,
    effective_end: sow.effective_end,
    total_value: totalValue,
    status: toDatabaseSowStatus(sow.status || 'Draft'),
    notes: sow.notes || null,
  };
}

function parseDateValue(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function getEffectiveMonthCount(startValue, endValue) {
  const start = parseDateValue(startValue);
  const end = parseDateValue(endValue);
  if (!start || !end) return 0;

  const monthDiff = ((end.year - start.year) * 12) + (end.month - start.month);
  if (monthDiff < 0) return 0;
  return Math.max(monthDiff + (end.day > start.day ? 1 : 0), 1);
}

function calculateSowItemTotal(item, sow) {
  const monthlyAmount = Number(item.amount || 0);
  const quantity = Number(item.quantity || 1);
  const start = item.valid_from || sow.effective_start;
  const end = item.valid_to || sow.effective_end;
  const months = getEffectiveMonthCount(start, end);
  return Math.round(monthlyAmount * quantity * months * 100) / 100;
}

function calculateSowTotalValue(sow, items) {
  const total = (items || []).reduce((sum, item) => sum + calculateSowItemTotal(item, sow), 0);
  return Math.round(total * 100) / 100;
}

function buildSowItemPayload(item, sow) {
  return {
    role_position: item.role_position,
    quantity: item.quantity,
    amount: item.amount,
    valid_from: item.valid_from || sow.effective_start,
    valid_to: item.valid_to || sow.effective_end,
  };
}

function isForeignKeyReferenceError(error) {
  const message = String(error && error.message ? error.message : '').toLowerCase();
  return Boolean(error && (error.code === '23503' || message.includes('foreign key constraint')));
}

const SOWModel = {
  async findAll(clientId, status, options) {
    const clientIdArray = Array.isArray(clientId)
      ? clientId.filter((id) => id !== null && id !== undefined)
      : (clientId !== null && clientId !== undefined ? [clientId] : []);
    const includeLinked = Boolean(options && options.includeLinked && clientIdArray.length > 0);
    let query = adminSupabase.from('sows_view').select('*').eq('is_latest', true);
    if (clientIdArray.length > 0) query = query.in('client_id', clientIdArray);
    if (status) query = query.eq('status', toDatabaseSowStatus(status));
    query = query.order('created_at', { ascending: false });
    let { data, error } = await query;

    if (isMissingColumnError(error, 'is_latest')) {
      let fallbackQuery = adminSupabase.from('sows_view').select('*');
      if (clientIdArray.length > 0) fallbackQuery = fallbackQuery.in('client_id', clientIdArray);
      if (status) fallbackQuery = fallbackQuery.eq('status', toDatabaseSowStatus(status));
      fallbackQuery = fallbackQuery.order('created_at', { ascending: false });
      const fallback = await fallbackQuery;
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);
    let rows = Array.isArray(data) ? data.slice() : [];

    if (includeLinked) {
      const { data: links, error: linkErr } = await adminSupabase
        .from('sow_client_links')
        .select('sow_id')
        .in('linked_client_id', clientIdArray);
      if (linkErr && !isMissingRelationError(linkErr, 'sow_client_links')) throw new Error(linkErr.message);

      const linkedIds = Array.from(new Set(((links || [])).map((row) => row.sow_id).filter(Boolean)));
      const existingIds = new Set(rows.map((row) => row.id));
      const missingIds = linkedIds.filter((id) => !existingIds.has(id));

      if (missingIds.length > 0) {
        let linkedQuery = adminSupabase.from('sows_view').select('*').in('id', missingIds).eq('is_latest', true);
        if (status) linkedQuery = linkedQuery.eq('status', toDatabaseSowStatus(status));
        let linkedResult = await linkedQuery.order('created_at', { ascending: false });

        if (isMissingColumnError(linkedResult.error, 'is_latest')) {
          let legacyQuery = adminSupabase.from('sows_view').select('*').in('id', missingIds);
          if (status) legacyQuery = legacyQuery.eq('status', toDatabaseSowStatus(status));
          linkedResult = await legacyQuery.order('created_at', { ascending: false });
        }

        if (linkedResult.error) throw new Error(linkedResult.error.message);
        rows = rows.concat(linkedResult.data || []);
      }
    }

    return enrichSowRoles(normalizeSowStatus(rows));
  },

  async findById(id) {
    const { data: sow, error: sErr } = await adminSupabase
      .from('sows_view')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!sow) return null;

    const { data: items, error: iErr } = await adminSupabase
      .from('sow_items')
      .select('*')
      .eq('sow_id', id)
      .order('id');
    if (iErr) throw new Error(iErr.message);

    return normalizeSowStatus({ ...sow, items });
  },

  async existsForClient(sowNumber, clientId, excludeBaseSowNumber) {
    const normalizedNumber = String(sowNumber || '').trim().toLowerCase();
    if (!normalizedNumber || !clientId) return false;

    let { data, error } = await adminSupabase.from('sows')
      .select('id, sow_number, base_sow_number')
      .eq('client_id', clientId);

    if (isMissingColumnError(error, 'base_sow_number')) {
      const fallback = await adminSupabase.from('sows')
        .select('id, sow_number')
        .eq('client_id', clientId);
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw new Error(error.message);

    const excludedBase = String(excludeBaseSowNumber || '').trim().toLowerCase();
    return (data || []).some((row) => {
      const rowNumber = String(row.sow_number || '').trim().toLowerCase();
      const rowBase = String(row.base_sow_number || '').trim().toLowerCase();
      if (excludedBase && (rowNumber === excludedBase || rowBase === excludedBase)) return false;
      return rowNumber === normalizedNumber || rowBase === normalizedNumber;
    });
  },

  async create(sow, items) {
    const sowNumber = sow.sow_number;
    const totalValue = calculateSowTotalValue(sow, items);
    const baseSowNumber = sow.base_sow_number || sowNumber;
    const versionNumber = sow.version_number || 0;
    const insertPayload = buildSowInsertPayload({
      ...sow,
      base_sow_number: baseSowNumber,
      version_number: versionNumber,
    }, totalValue);

    let { data: row, error: sErr } = await adminSupabase.from('sows')
      .insert(insertPayload)
      .select('id')
      .single();

    if (isMissingColumnError(sErr, 'base_sow_number')
      || isMissingColumnError(sErr, 'version_number')
      || isMissingColumnError(sErr, 'parent_sow_id')
      || isMissingColumnError(sErr, 'is_latest')) {
      ({ data: row, error: sErr } = await adminSupabase.from('sows')
        .insert({
          sow_number: sowNumber,
          client_id: sow.client_id,
          quote_id: sow.quote_id || null,
          sow_date: sow.sow_date,
          effective_start: sow.effective_start,
          effective_end: sow.effective_end,
          total_value: totalValue,
          status: toDatabaseSowStatus(sow.status || 'Draft'),
          notes: sow.notes || null,
        })
        .select('id')
        .single());
    }
    if (sErr) throw new Error(sErr.message);

    const sowId = row.id;
    if (items.length > 0) {
      const itemRows = items.map((item) => ({
        sow_id: sowId,
        role_position: item.role_position,
        quantity: item.quantity,
        amount: item.amount,
        valid_from: item.valid_from || sow.effective_start,
        valid_to: item.valid_to || sow.effective_end,
      }));
      const { error: iErr } = await adminSupabase.from('sow_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);
    }

    return { id: sowId, sow_number: sowNumber };
  },

  async update(id, sow, items) {
    const existing = await SOWModel.findById(id);
    if (!existing) throw new Error('SOW not found');

    if (shouldUpdateSowInPlace(existing)) {
      const totalValue = calculateSowTotalValue(sow, items);

      const { error: sErr } = await adminSupabase.from('sows')
        .update({
          sow_number: sow.sow_number,
          client_id: sow.client_id,
          quote_id: sow.quote_id || null,
          sow_date: sow.sow_date,
          effective_start: sow.effective_start,
          effective_end: sow.effective_end,
          total_value: totalValue,
          notes: sow.notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (sErr) throw new Error(sErr.message);

      const existingItems = Array.isArray(existing.items) ? existing.items : [];
      const usedExistingIds = new Set();

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const requestedId = item.id ? Number(item.id) : null;
        const matchingExisting = requestedId
          ? existingItems.find((existingItem) => Number(existingItem.id) === requestedId)
          : existingItems[index];

        if (matchingExisting && matchingExisting.id) {
          usedExistingIds.add(Number(matchingExisting.id));
          const { error: uErr } = await adminSupabase.from('sow_items')
            .update(buildSowItemPayload(item, sow))
            .eq('id', matchingExisting.id)
            .eq('sow_id', id);
          if (uErr) throw new Error(uErr.message);
        } else {
          const { error: iErr } = await adminSupabase.from('sow_items')
            .insert({
              sow_id: id,
              ...buildSowItemPayload(item, sow),
            });
          if (iErr) throw new Error(iErr.message);
        }
      }

      const removedIds = existingItems
        .map((item) => Number(item.id))
        .filter((itemId) => itemId && !usedExistingIds.has(itemId));
      if (removedIds.length > 0) {
        const { error: dErr } = await adminSupabase.from('sow_items')
          .delete()
          .eq('sow_id', id)
          .in('id', removedIds);
        if (isForeignKeyReferenceError(dErr)) {
          throw new Error('This SOW has line items linked to rate cards. Edit the existing lines instead of removing them.');
        }
        if (dErr) throw new Error(dErr.message);
      }

      return { id, sow_number: sow.sow_number || existing.sow_number };
    }

    const baseSowNumber = existing.base_sow_number || existing.sow_number;
    const versionNumber = await getNextRevisionNumber(baseSowNumber);
    const sowNumber = buildSowRevisionNumber(baseSowNumber, versionNumber);

    const created = await SOWModel.create({
      sow_number: sowNumber,
      base_sow_number: baseSowNumber,
      version_number: versionNumber,
      parent_sow_id: id,
      client_id: sow.client_id,
      quote_id: sow.quote_id || null,
      sow_date: sow.sow_date,
      effective_start: sow.effective_start,
      effective_end: sow.effective_end,
      notes: sow.notes || null,
      status: existing.status || 'Draft',
    }, items);

    const { error: archiveErr } = await adminSupabase.from('sows')
      .update({
        is_latest: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (archiveErr) throw new Error(archiveErr.message);

    return created;
  },

  async createAmendment(id, sow, items) {
    const existing = await SOWModel.findById(id);
    if (!existing) throw new Error('SOW not found');

    const baseSowNumber = existing.base_sow_number || existing.sow_number;
    const versionNumber = await getNextRevisionNumber(baseSowNumber);
    const sowNumber = buildSowRevisionNumber(baseSowNumber, versionNumber);

    return SOWModel.create({
      sow_number: sowNumber,
      base_sow_number: baseSowNumber,
      version_number: versionNumber,
      parent_sow_id: id,
      client_id: sow.client_id,
      quote_id: sow.quote_id || null,
      sow_date: sow.sow_date,
      effective_start: sow.effective_start,
      effective_end: sow.effective_end,
      notes: sow.notes || null,
      status: 'Amendment Draft',
    }, items);
  },

  async linkQuote(id, quoteId) {
    const { error } = await adminSupabase.from('sows')
      .update({ quote_id: quoteId, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async updateStatus(id, status) {
    const { error } = await adminSupabase.from('sows')
      .update({ status: toDatabaseSowStatus(status), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async getAssociations(id) {
    const [poResult, rateCardResult] = await Promise.all([
      adminSupabase.from('purchase_orders')
        .select('id, po_number, status')
        .eq('sow_id', id)
        .neq('status', 'Inactive')
        .order('created_at', { ascending: false }),
      adminSupabase.from('rate_cards')
        .select('id, emp_code, emp_name, po_id')
        .eq('sow_id', id)
        .eq('is_active', true),
    ]);
    if (poResult.error) throw new Error(poResult.error.message);
    if (rateCardResult.error) throw new Error(rateCardResult.error.message);
    return {
      purchaseOrders: poResult.data || [],
      rateCards: rateCardResult.data || [],
    };
  },

  async delete(id) {
    const { error } = await adminSupabase.from('sows').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  async hasClientLink(sowId, clientId) {
    const { data, error } = await adminSupabase
      .from('sow_client_links')
      .select('id')
      .eq('sow_id', sowId)
      .eq('linked_client_id', clientId)
      .maybeSingle();
    if (error && isMissingRelationError(error, 'sow_client_links')) return false;
    if (error) throw new Error(error.message);
    return Boolean(data);
  },

  async ensureClientLink(sowId, linkedClientId) {
    const existing = await SOWModel.hasClientLink(sowId, linkedClientId);
    if (existing) return;
    const { error } = await adminSupabase
      .from('sow_client_links')
      .insert({
        sow_id: sowId,
        linked_client_id: linkedClientId,
      });
    if (error && isMissingRelationError(error, 'sow_client_links')) {
      throw new Error('The sow_client_links table is missing. Run the Supabase SQL migration for cross-client SOW linking first.');
    }
    if (error) throw new Error(error.message);
  },
};

module.exports = SOWModel;
