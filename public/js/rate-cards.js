(function () {
  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)

  window.openRCModal = function () {
    document.getElementById('rcForm').reset();
    document.getElementById('rcId').value = '';
    document.getElementById('rcModalTitle').textContent = 'Add Rate Card';
    document.getElementById('rcPO').innerHTML = '<option value="">Select PO</option>';
    window.rcEdit = null;
    openModal('rcModal');
  };
  window.closeRCModal = function () {
    closeModal('rcModal');
    document.getElementById('rcForm').reset();
    document.getElementById('rcId').value = '';
    document.getElementById('rcModalTitle').textContent = 'Add Rate Card';
    document.getElementById('rcPO').innerHTML = '<option value="">Select PO</option>';
    window.rcEdit = null;
  };
  window.openUploadRCModal = function () {
    document.getElementById('uploadRCForm').reset();
    openModal('uploadRCModal');
  };
  window.closeUploadRCModal = function () {
    closeModal('uploadRCModal');
  };

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      ['rcFilterClient', 'rcClient', 'uploadRCClient'].forEach(function (id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var existing = sel.querySelector('option');
        sel.innerHTML = existing ? existing.outerHTML : '<option value="">All</option>';
        res.data.forEach(function (c) {
          sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.client_name) + '</option>';
        });
      });
    } catch (e) { /* ignore */ }
  }

  async function loadPOsForClient(clientId) {
    var sel = document.getElementById('rcPO');
    sel.innerHTML = '<option value="">Select PO</option>';
    if (!clientId) return;
    try {
      var res = await apiCall('GET', '/api/purchase-orders?clientId=' + clientId + '&status=Active');
      res.data.forEach(function (po) {
        sel.innerHTML += '<option value="' + po.id + '">' + escapeHtml(po.po_number) +
          ' (' + formatCurrency(po.remaining_value) + ' remaining)</option>';
      });
    } catch (e) { /* ignore */ }
  }

  async function loadRateCards() {
    var tbody = document.getElementById('rcBody');
    showLoading(tbody);
    try {
      var clientId = document.getElementById('rcFilterClient').value;
      var url = clientId ? '/api/rate-cards?clientId=' + clientId : '/api/rate-cards';
      var res = await apiCall('GET', url);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-on-surface-variant py-8">No rate cards found</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (r) {
          return '<tr>' +
            '<td>' + escapeHtml(r.client_name) + '</td>' +
            '<td><strong>' + escapeHtml(r.emp_code) + '</strong></td>' +
            '<td>' + escapeHtml(r.emp_name) + '</td>' +
            '<td>' + (r.doj ? formatDate(r.doj) : '') + '</td>' +
            '<td>' + escapeHtml(r.reporting_manager || '') + '</td>' +
            '<td class="text-right">' + formatCurrency(r.monthly_rate) + '</td>' +
            '<td class="text-center">' + r.leaves_allowed + '</td>' +
            '<td>' + (r.charging_date ? formatDate(r.charging_date) : '') + '</td>' +
            '<td>' + escapeHtml(r.po_number || '---') + '</td>' +
            '<td class="text-center">' +
              '<div class="inline-flex items-center gap-1">' +
              '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editRC(' + r.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>' +
              '<button class="btn-danger btn-sm inline-flex items-center" onclick="deleteRC(' + r.id + ')" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>' +
              '</div>' +
            '</td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('rcTable');
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  window.editRC = async function (id) {
    try {
      var res = await apiCall('GET', '/api/rate-cards/' + id);
      var r = res.data;
      document.getElementById('rcId').value = r.id;
      document.getElementById('rcClient').value = r.client_id;
      await loadPOsForClient(r.client_id);
      document.getElementById('rcPO').value = r.po_id || '';
      document.getElementById('rcEmpCode').value = r.emp_code;
      document.getElementById('rcEmpName').value = r.emp_name;
      document.getElementById('rcDoj').value = r.doj || '';
      document.getElementById('rcManager').value = r.reporting_manager || '';
      document.getElementById('rcRate').value = r.monthly_rate;
      document.getElementById('rcLeaves').value = r.leaves_allowed;
      document.getElementById('rcChargingDate').value = r.charging_date || '';
      document.getElementById('rcModalTitle').textContent = 'Edit Rate Card';
      window.rcEdit = r.id;
      openModal('rcModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.deleteRC = async function (id) {
    var confirmed = await confirmAction('Delete Rate Card', 'Are you sure you want to delete this rate card? This cannot be undone.');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/rate-cards/' + id);
      showToast('Rate card deleted', 'success');
      loadRateCards();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  document.getElementById('rcForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var poVal = document.getElementById('rcPO').value;
    if (!poVal) { showToast('Purchase Order is required', 'danger'); return; }
    var data = {
      client_id: parseInt(document.getElementById('rcClient').value, 10),
      emp_code: document.getElementById('rcEmpCode').value.trim(),
      emp_name: document.getElementById('rcEmpName').value.trim(),
      doj: document.getElementById('rcDoj').value || null,
      reporting_manager: document.getElementById('rcManager').value.trim(),
      monthly_rate: parseFloat(document.getElementById('rcRate').value),
      leaves_allowed: parseInt(document.getElementById('rcLeaves').value, 10) || 0,
      charging_date: document.getElementById('rcChargingDate').value || null,
      po_id: poVal ? parseInt(poVal, 10) : null,
    };
    try {
      if (window.rcEdit) {
        await apiCall('PUT', '/api/rate-cards/' + window.rcEdit, data);
        showToast('Rate card updated', 'success');
      } else {
        await apiCall('POST', '/api/rate-cards', data);
        showToast('Rate card created', 'success');
      }
      closeRCModal();
      loadRateCards();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('uploadRCForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData();
    fd.append('clientId', document.getElementById('uploadRCClient').value);
    fd.append('file', document.getElementById('uploadRCFile').files[0]);
    try {
      var res = await apiCall('POST', '/api/rate-cards/upload', fd);
      showToast('Imported ' + res.data.imported + ' rate cards (' + res.data.errors + ' errors)', res.data.errors > 0 ? 'warning' : 'success');
      closeUploadRCModal();
      loadRateCards();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('rcFilterClient').addEventListener('change', loadRateCards);

  // Load POs when client changes in the form
  document.getElementById('rcClient').addEventListener('change', function () {
    loadPOsForClient(this.value);
  });

  // Initialize search
  initTableSearch('rcSearch', 'rcBody');

  loadClients().then(loadRateCards);
})();
