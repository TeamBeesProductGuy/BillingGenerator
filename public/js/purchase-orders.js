(function () {
  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)
  var poActionMap = {};

  window.openPOModal = function () {
    document.getElementById('poForm').reset();
    document.getElementById('poId').value = '';
    document.getElementById('poModalTitle').textContent = 'Link Purchase Order';
    document.getElementById('poSOW').innerHTML = '<option value="">Select SOW</option>';
    window.poEdit = null;
    openModal('poModal');
  };
  window.closePOModal = function () { closeModal('poModal'); document.getElementById('poForm').reset(); window.poEdit = null; };
  window.closePODetailModal = function () { closeModal('poDetailModal'); };
  window.closeConsumeModal = function () { closeModal('consumeModal'); };
  window.closeRenewModal = function () { closeModal('renewModal'); };

  var statusBadge = function (s) {
    var map = { Active: 'badge-success', Expired: 'badge-error', Exhausted: 'badge-warning', Renewed: 'badge-processing', Cancelled: 'badge-processing' };
    return '<span class="' + (map[s] || 'badge-processing') + '">' + s + '</span>';
  };

  function progressBar(pct) {
    var p = Math.min(pct, 100);
    var colorClass = p >= 80 ? 'po-progress-fill-danger' : p >= 60 ? 'po-progress-fill-warning' : 'po-progress-fill-safe';
    return '<div class="po-progress-track">' +
      '<div class="po-progress-fill ' + colorClass + '" style="width:' + p + '%"></div>' +
      '<div class="po-progress-label">' + p.toFixed(1) + '%</div>' +
      '</div>';
  }

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      ['poFilterClient', 'poClient'].forEach(function (id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var first = sel.querySelector('option');
        sel.innerHTML = first ? first.outerHTML : '';
        res.data.forEach(function (c) {
          sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(getClientDisplayName(c)) + '</option>';
        });
      });
    } catch (e) { /* ignore */ }
  }

  async function loadSOWsForClient(clientId) {
    var sel = document.getElementById('poSOW');
    sel.innerHTML = '<option value="">Select SOW</option>';
    if (!clientId) return;
    try {
      var res = await apiCall('GET', '/api/sows?clientId=' + clientId);
      res.data.forEach(function (s) {
        if (s.status === 'Signed' || s.status === 'Active') {
          sel.innerHTML += '<option value="' + s.id + '">' + escapeHtml(s.sow_number) + ' (' + escapeHtml(s.status) + ')</option>';
        }
      });
    } catch (e) { /* ignore */ }
  }

  async function consumePendingPoLinkContext() {
    var raw = sessionStorage.getItem('pendingPoLinkContext');
    if (!raw) return;

    sessionStorage.removeItem('pendingPoLinkContext');

    try {
      var context = JSON.parse(raw);
      if (!context || !context.clientId) return;

      openPOModal();
      document.getElementById('poClient').value = String(context.clientId);
      await loadSOWsForClient(context.clientId);

      if (context.sowId) {
        document.getElementById('poSOW').value = String(context.sowId);
      }
    } catch (e) {
      /* ignore malformed pending state */
    }
  }

  async function loadAlerts() {
    try {
      var res = await apiCall('GET', '/api/purchase-orders/alerts');
      var section = document.getElementById('poAlertsSection');
      if (res.data.length === 0) { section.classList.add('hidden'); return; }
      section.classList.remove('hidden');
      document.getElementById('poAlertsBody').innerHTML = res.data.map(function (a) {
        return '<tr>' +
          '<td><strong>' + escapeHtml(a.po_number) + '</strong></td>' +
          '<td>' + escapeHtml(a.client_name) + '</td>' +
          '<td>' + (a.consumption_pct ? a.consumption_pct.toFixed(1) + '%' : '0%') + '</td>' +
          '<td>' + formatDate(a.end_date) + '</td>' +
          '<td>' +
            (a.consumption_pct >= (a.alert_threshold || 80) ? '<span class="badge-error">Value</span> ' : '') +
            (new Date(a.end_date) <= new Date(Date.now() + 30*24*60*60*1000) ? '<span class="badge-warning">Expiry</span>' : '') +
          '</td>' +
          '</tr>';
      }).join('');
    } catch (e) { /* ignore */ }
  }

  async function loadPOs() {
    var tbody = document.getElementById('poBody');
    showLoading(tbody);
    try {
      var cid = document.getElementById('poFilterClient').value;
      var status = document.getElementById('poFilterStatus').value;
      var url = '/api/purchase-orders?';
      if (cid) url += 'clientId=' + cid + '&';
      if (status) url += 'status=' + status;
      var res = await apiCall('GET', url);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-on-surface-variant py-8">No purchase orders found</td></tr>';
      } else {
        poActionMap = {};
        tbody.innerHTML = res.data.map(function (po) {
          poActionMap[po.id] = {
            id: po.id,
            status: po.status,
          };

          return '<tr>' +
            '<td><span class="entity-pill entity-pill-strong">' + escapeHtml(po.po_number) + '</span></td>' +
            '<td><span class="entity-pill" title="' + escapeHtml(po.client_name) + '">' + escapeHtml(po.client_name) + '</span></td>' +
            '<td><span class="entity-pill" title="' + escapeHtml(po.sow_number || 'Not linked') + '">' + escapeHtml(po.sow_number || 'Not linked') + '</span></td>' +
            '<td>' + formatDate(po.start_date) + '</td>' +
            '<td>' + formatDate(po.end_date) + '</td>' +
            '<td class="text-right"><span class="table-amount-pill">' + formatCurrency(po.po_value) + '</span></td>' +
            '<td class="text-right"><span class="table-amount-pill">' + formatCurrency(po.consumed_value) + '</span></td>' +
            '<td>' + progressBar(po.consumption_pct || 0) + '</td>' +
            '<td>' + statusBadge(po.status) + '</td>' +
            '<td class="text-center">' + (po.linked_employees || 0) + '</td>' +
            '<td class="text-center"><button class="btn-secondary btn-sm table-action-trigger inline-flex items-center justify-center" title="Open purchase order actions" aria-label="Open purchase order actions" onclick="openPOActions(' + po.id + ')"><span class="material-symbols-outlined text-base">more_horiz</span></button></td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('poTable');
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  window.openPOActions = function (id) {
    var actionState = poActionMap[id];
    var container = document.getElementById('poActionList');
    var title = document.getElementById('poActionTitle');
    if (!actionState || !container || !title) return;

    title.textContent = 'Purchase Order Actions';
    container.innerHTML = '';
    container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runPOActionView(' + id + ')"><span class="material-symbols-outlined">visibility</span><span><strong>View details</strong><small>Open the full purchase order summary and logs</small></span></button>';
    container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runPOActionEdit(' + id + ')"><span class="material-symbols-outlined">edit</span><span><strong>Edit purchase order</strong><small>Update dates, value, linked SOW, and notes</small></span></button>';
    if (actionState.status === 'Active') {
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runPOActionConsume(' + id + ')"><span class="material-symbols-outlined">remove_circle</span><span><strong>Record consumption</strong><small>Log an amount consumed from this PO</small></span></button>';
    }
    if (['Active', 'Expired', 'Exhausted'].indexOf(actionState.status) !== -1) {
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runPOActionRenew(' + id + ')"><span class="material-symbols-outlined">autorenew</span><span><strong>Renew purchase order</strong><small>Create a new renewed PO for this engagement</small></span></button>';
    }
    openModal('poActionModal');
  };

  window.closePOActions = function () {
    closeModal('poActionModal');
  };

  window.runPOActionView = function (id) {
    closePOActions();
    viewPO(id);
  };

  window.runPOActionEdit = function (id) {
    closePOActions();
    editPO(id);
  };

  window.runPOActionConsume = function (id) {
    closePOActions();
    consumePO(id);
  };

  window.runPOActionRenew = function (id) {
    closePOActions();
    renewPO(id);
  };

  window.viewPO = async function (id) {
    try {
      var res = await apiCall('GET', '/api/purchase-orders/' + id);
      var po = res.data;
      var body = document.getElementById('poDetailBody');
      body.innerHTML =
        '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">PO Number</span><div class="text-on-surface font-medium mt-1">' + escapeHtml(po.po_number) + '</div></div>' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Client</span><div class="text-on-surface font-medium mt-1">' + escapeHtml(po.client_name) + '</div></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">PO Date</span><div class="text-on-surface font-medium mt-1">' + formatDate(po.po_date) + '</div></div>' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Start</span><div class="text-on-surface font-medium mt-1">' + formatDate(po.start_date) + '</div></div>' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">End</span><div class="text-on-surface font-medium mt-1">' + formatDate(po.end_date) + '</div></div>' +
        '</div>' +
        '<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">PO Value</span><div class="text-on-surface font-bold text-lg mt-1">' + formatCurrency(po.po_value) + '</div></div>' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Consumed</span><div class="text-on-surface font-bold text-lg mt-1">' + formatCurrency(po.consumed_value) + '</div></div>' +
          '<div><span class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Remaining</span><div class="text-on-surface font-bold text-lg mt-1">' + formatCurrency(po.remaining_value) + '</div></div>' +
        '</div>' +
        '<div class="mb-6">' + progressBar(po.consumption_pct || 0) + '</div>' +
        '<h6 class="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3">Consumption Log</h6>' +
        '<div class="overflow-x-auto">' +
        '<table class="stitch-table">' +
          '<thead><tr><th>Date</th><th class="text-right">Amount</th><th>Description</th></tr></thead>' +
          '<tbody>' +
            (po.consumptionLog && po.consumptionLog.length > 0 ?
              po.consumptionLog.map(function (l) {
                return '<tr><td>' + formatDate(l.consumed_at) + '</td><td class="text-right">' + formatCurrency(l.amount) + '</td><td>' + escapeHtml(l.description || '') + '</td></tr>';
              }).join('') :
              '<tr><td colspan="3" class="text-center text-on-surface-variant py-4">No consumption recorded</td></tr>') +
          '</tbody>' +
        '</table></div>' +
        '<h6 class="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-3 mt-6">Linked Employees</h6>' +
        '<div class="overflow-x-auto">' +
        '<table class="stitch-table">' +
          '<thead><tr><th>Emp Code</th><th>Name</th><th>Manager</th><th class="text-right">Monthly Rate</th></tr></thead>' +
          '<tbody>' +
            (po.linkedEmployees && po.linkedEmployees.length > 0 ?
              po.linkedEmployees.map(function (emp) {
                return '<tr><td><strong>' + escapeHtml(emp.emp_code) + '</strong></td>' +
                  '<td>' + escapeHtml(emp.emp_name) + '</td>' +
                  '<td>' + escapeHtml(emp.reporting_manager || '') + '</td>' +
                  '<td class="text-right">' + formatCurrency(emp.monthly_rate) + '</td></tr>';
              }).join('') :
              '<tr><td colspan="4" class="text-center text-on-surface-variant py-4">No employees linked to this PO</td></tr>') +
          '</tbody>' +
        '</table></div>';
      openModal('poDetailModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.editPO = async function (id) {
    try {
      var res = await apiCall('GET', '/api/purchase-orders/' + id);
      var po = res.data;
      window.poEdit = id;
      document.getElementById('poModalTitle').textContent = 'Edit Linked PO';
      document.getElementById('poId').value = id;
      document.getElementById('poNumber').value = po.po_number;
      document.getElementById('poClient').value = po.client_id;
      await loadSOWsForClient(po.client_id);
      document.getElementById('poSOW').value = po.sow_id || '';
      document.getElementById('poDate').value = po.po_date;
      document.getElementById('poStartDate').value = po.start_date;
      document.getElementById('poEndDate').value = po.end_date;
      document.getElementById('poValue').value = po.po_value;
      document.getElementById('poThreshold').value = po.alert_threshold;
      document.getElementById('poNotes').value = po.notes || '';
      openModal('poModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.consumePO = function (id) {
    document.getElementById('consumePoId').value = id;
    document.getElementById('consumeForm').reset();
    document.getElementById('consumePoId').value = id;
    openModal('consumeModal');
  };

  window.renewPO = function (id) {
    document.getElementById('renewPoId').value = id;
    document.getElementById('renewForm').reset();
    document.getElementById('renewPoId').value = id;
    openModal('renewModal');
  };

  document.getElementById('poForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var sowVal = document.getElementById('poSOW').value;
    if (!sowVal) { showToast('SOW is required', 'danger'); return; }
    var data = {
      po_number: document.getElementById('poNumber').value.trim(),
      client_id: parseInt(document.getElementById('poClient').value, 10),
      po_date: document.getElementById('poDate').value,
      start_date: document.getElementById('poStartDate').value,
      end_date: document.getElementById('poEndDate').value,
      po_value: parseFloat(document.getElementById('poValue').value),
      alert_threshold: parseFloat(document.getElementById('poThreshold').value) || 80,
      sow_id: sowVal ? parseInt(sowVal, 10) : null,
      notes: document.getElementById('poNotes').value.trim(),
    };
    try {
      if (window.poEdit) {
        await apiCall('PUT', '/api/purchase-orders/' + window.poEdit, data);
        showToast('PO updated', 'success');
      } else {
        await apiCall('POST', '/api/purchase-orders', data);
        showToast('PO linked', 'success');
      }
      closePOModal();
      loadPOs();
      loadAlerts();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('consumeForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var poId = document.getElementById('consumePoId').value;
    try {
      await apiCall('PATCH', '/api/purchase-orders/' + poId + '/consume', {
        amount: parseFloat(document.getElementById('consumeAmount').value),
        description: document.getElementById('consumeDesc').value.trim(),
      });
      showToast('Consumption recorded', 'success');
      closeConsumeModal();
      loadPOs();
      loadAlerts();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('renewForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var poId = document.getElementById('renewPoId').value;
    try {
      await apiCall('PATCH', '/api/purchase-orders/' + poId + '/renew', {
        po_number: document.getElementById('renewPoNumber').value.trim(),
        po_date: document.getElementById('renewPoDate').value,
        start_date: document.getElementById('renewStartDate').value,
        end_date: document.getElementById('renewEndDate').value,
        po_value: parseFloat(document.getElementById('renewPoValue').value),
        alert_threshold: parseFloat(document.getElementById('renewThreshold').value) || 80,
      });
      showToast('PO renewed', 'success');
      closeRenewModal();
      loadPOs();
      loadAlerts();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  // Load SOWs when client changes in PO form
  document.getElementById('poClient').addEventListener('change', function () {
    loadSOWsForClient(this.value);
  });

  document.getElementById('poFilterClient').addEventListener('change', loadPOs);
  document.getElementById('poFilterStatus').addEventListener('change', loadPOs);

  // Initialize search
  initTableSearch('poSearch', 'poBody');

  loadClients().then(function () {
    loadPOs();
    loadAlerts();
    return consumePendingPoLinkContext();
  });
})();
