(function () {
  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)

  window.openPOModal = function () {
    document.getElementById('poForm').reset();
    document.getElementById('poId').value = '';
    document.getElementById('poModalTitle').textContent = 'Create Purchase Order';
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
    var color = p >= 80 ? 'bg-red-500' : p >= 60 ? 'bg-yellow-500' : 'bg-green-500';
    return '<div class="w-full bg-surface-container-highest rounded-full h-5 overflow-hidden">' +
      '<div class="' + color + ' h-full rounded-full flex items-center justify-center text-xs font-bold text-white transition-all" style="width:' + p + '%">' + p.toFixed(1) + '%</div>' +
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
          sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.client_name) + '</option>';
        });
      });
    } catch (e) { /* ignore */ }
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
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-on-surface-variant py-8">No purchase orders found</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (po) {
          var actionsHtml = '<div class="inline-flex items-center gap-1">';
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="viewPO(' + po.id + ')" title="Details"><span class="material-symbols-outlined text-base">visibility</span></button>';
          if (po.status === 'Active') {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="consumePO(' + po.id + ')" title="Consume"><span class="material-symbols-outlined text-base">remove_circle</span></button>';
          }
          if (['Active', 'Expired', 'Exhausted'].indexOf(po.status) !== -1) {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="renewPO(' + po.id + ')" title="Renew"><span class="material-symbols-outlined text-base">autorenew</span></button>';
          }
          actionsHtml += '</div>';

          return '<tr>' +
            '<td><strong>' + escapeHtml(po.po_number) + '</strong></td>' +
            '<td>' + escapeHtml(po.client_name) + '</td>' +
            '<td>' + formatDate(po.start_date) + '</td>' +
            '<td>' + formatDate(po.end_date) + '</td>' +
            '<td class="text-right">' + formatCurrency(po.po_value) + '</td>' +
            '<td class="text-right">' + formatCurrency(po.consumed_value) + '</td>' +
            '<td>' + progressBar(po.consumption_pct || 0) + '</td>' +
            '<td>' + statusBadge(po.status) + '</td>' +
            '<td class="text-center">' + (po.linked_employees || 0) + '</td>' +
            '<td class="text-center">' + actionsHtml + '</td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('poTable');
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

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
    var data = {
      po_number: document.getElementById('poNumber').value.trim(),
      client_id: parseInt(document.getElementById('poClient').value, 10),
      po_date: document.getElementById('poDate').value,
      start_date: document.getElementById('poStartDate').value,
      end_date: document.getElementById('poEndDate').value,
      po_value: parseFloat(document.getElementById('poValue').value),
      alert_threshold: parseFloat(document.getElementById('poThreshold').value) || 80,
      notes: document.getElementById('poNotes').value.trim(),
    };
    try {
      if (window.poEdit) {
        await apiCall('PUT', '/api/purchase-orders/' + window.poEdit, data);
        showToast('PO updated', 'success');
      } else {
        await apiCall('POST', '/api/purchase-orders', data);
        showToast('PO created', 'success');
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

  document.getElementById('poFilterClient').addEventListener('change', loadPOs);
  document.getElementById('poFilterStatus').addEventListener('change', loadPOs);

  // Initialize search
  initTableSearch('poSearch', 'poBody');

  loadClients().then(function () { loadPOs(); loadAlerts(); });
})();
