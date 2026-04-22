const { supabase } = require('../config/database');

const TABLE = 'permanent_clients';
const CONTACTS_TABLE = 'permanent_client_contacts';

async function attachContacts(clients) {
  if (!clients || clients.length === 0) return clients || [];
  const ids = clients.map((c) => c.id);
  const { data: contacts, error } = await supabase
    .from(CONTACTS_TABLE)
    .select('*')
    .in('client_id', ids)
    .eq('is_active', true)
    .order('id');
  if (error) throw new Error(error.message);

  const contactMap = {};
  (contacts || []).forEach((contact) => {
    if (!contactMap[contact.client_id]) contactMap[contact.client_id] = [];
    contactMap[contact.client_id].push(contact);
  });

  return clients.map((client) => ({
    ...client,
    contacts: contactMap[client.id] || [],
  }));
}

const PermanentClientModel = {
  async findAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('client_name');
    if (error) throw new Error(error.message);
    return attachContacts(data || []);
  },

  async findById(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const rows = await attachContacts([data]);
    return rows[0] || null;
  },

  async findByNameAndAddress(clientName, address, excludeId) {
    const normalizedName = String(clientName || '').trim().toLowerCase();
    const normalizedAddress = String(address || '').trim().toLowerCase();

    let query = supabase
      .from(TABLE)
      .select('id, client_name, address')
      .eq('is_active', true);
    if (excludeId) query = query.neq('id', excludeId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return (data || []).find((client) => {
      return String(client.client_name || '').trim().toLowerCase() === normalizedName &&
        String(client.address || '').trim().toLowerCase() === normalizedAddress;
    }) || null;
  },

  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        client_name: data.client_name,
        abbreviation: data.abbreviation || null,
        address: data.address || null,
        billing_address: data.billing_address || null,
        billing_pattern: data.billing_pattern,
        billing_rate: data.billing_rate,
      })
      .select('id')
      .single();
    if (error) throw new Error(error.message);

    if (data.contacts && data.contacts.length > 0) {
      const payload = data.contacts.map((contact) => ({
        client_id: row.id,
        contact_name: contact.contact_name,
        email: contact.email || null,
        phone: contact.phone || null,
        designation: contact.designation || null,
      }));
      const { error: contactError } = await supabase
        .from(CONTACTS_TABLE)
        .insert(payload);
      if (contactError) throw new Error(contactError.message);
    }

    return row.id;
  },

  async update(id, data) {
    const { error } = await supabase
      .from(TABLE)
      .update({
        client_name: data.client_name,
        abbreviation: data.abbreviation || null,
        address: data.address || null,
        billing_address: data.billing_address || null,
        billing_pattern: data.billing_pattern,
        billing_rate: data.billing_rate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw new Error(error.message);

    const { error: deactivateError } = await supabase
      .from(CONTACTS_TABLE)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('client_id', id)
      .eq('is_active', true);
    if (deactivateError) throw new Error(deactivateError.message);

    if (data.contacts && data.contacts.length > 0) {
      const payload = data.contacts.map((contact) => ({
        client_id: id,
        contact_name: contact.contact_name,
        email: contact.email || null,
        phone: contact.phone || null,
        designation: contact.designation || null,
      }));
      const { error: contactError } = await supabase
        .from(CONTACTS_TABLE)
        .insert(payload);
      if (contactError) throw new Error(contactError.message);
    }
  },

  async softDelete(id) {
    const now = new Date().toISOString();
    const [{ error: clientError }, { error: contactError }] = await Promise.all([
      supabase.from(TABLE).update({ is_active: false, updated_at: now }).eq('id', id),
      supabase.from(CONTACTS_TABLE).update({ is_active: false, updated_at: now }).eq('client_id', id),
    ]);
    if (clientError) throw new Error(clientError.message);
    if (contactError) throw new Error(contactError.message);
  },
};

module.exports = PermanentClientModel;
