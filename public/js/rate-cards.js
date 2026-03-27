(function () {
  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)

  function toggleRateMode(mode) {
    var monthlySection = document.getElementById('rcMonthlyRateSection');
    var hourlySection = document.getElementById('rcHourlyRateSection');
    var computedSection = document.getElementById('rcHourlyComputedSection');
    var monthlyInput = document.getElementById('rcRate');
    var hourlyRateInput = document.getElementById('rcHourlyRate');
    var hoursWorkedInput = document.getElementById('rcHoursWorked');

    var isHourly = mode === 'hourly';
    monthlySection.classList.toggle('hidden', isHourly);
    hourlySection.classList.toggle('hidden', !isHourly);
    computedSection.classList.toggle('hidden', !isHourly);
    monthlyInput.required = !isHourly;
    hourlyRateInput.required = isHourly;
    hoursWorkedInput.required = isHourly;

    if (!isHourly) {
      hourlyRateInput.value = '';
      hoursWorkedInput.value = '';
      document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(parseFloat(monthlyInput.value) || 0);
    } else {
      recalcHourlyMonthlyRate();
    }
  }

  function recalcHourlyMonthlyRate() {
    var hourlyRate = parseFloat(document.getElementById('rcHourlyRate').value) || 0;
    var hoursWorked = parseFloat(document.getElementById('rcHoursWorked').value) || 0;
    var monthlyRate = Math.round(hourlyRate * hoursWorked * 100) / 100;
    document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(monthlyRate);
    return monthlyRate;
  }

  window.openRCModal = function () {
    document.getElementById('rcForm').reset();
    document.getElementById('rcId').value = '';
    document.getElementById('rcModalTitle').textContent = 'Add Rate Card';
    document.getElementById('rcSOW').innerHTML = '<option value="">Select SOW</option>';
    document.getElementById('rcPO').innerHTML = '<option value="">Select PO</option>';
    document.getElementById('rcSowPreview').classList.add('hidden');
    document.getElementById('rcSowPreviewContent').innerHTML = '';
    document.getElementById('rcRateMode').value = 'monthly';
    document.getElementById('rcHourlyRate').value = '';
    document.getElementById('rcHoursWorked').value = '';
    document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(0);
    toggleRateMode('monthly');
    window.rcEdit = null;
    openModal('rcModal');
  };
  window.closeRCModal = function () {
    closeModal('rcModal');
    document.getElementById('rcForm').reset();
    document.getElementById('rcId').value = '';
    document.getElementById('rcModalTitle').textContent = 'Add Rate Card';
    document.getElementById('rcSOW').innerHTML = '<option value="">Select SOW</option>';
    document.getElementById('rcPO').innerHTML = '<option value="">Select PO</option>';
    document.getElementById('rcSowPreview').classList.add('hidden');
    document.getElementById('rcSowPreviewContent').innerHTML = '';
    document.getElementById('rcRateMode').value = 'monthly';
    document.getElementById('rcHourlyRate').value = '';
    document.getElementById('rcHoursWorked').value = '';
    document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(0);
    toggleRateMode('monthly');
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

  async function loadSOWsForClient(clientId) {
    var sel = document.getElementById('rcSOW');
    sel.innerHTML = '<option value="">Select SOW</option>';
    if (!clientId) return;
    try {
      var res = await apiCall('GET', '/api/sows?clientId=' + clientId);
      res.data.forEach(function (sow) {
        sel.innerHTML += '<option value="' + sow.id + '">' + escapeHtml(sow.sow_number) + ' (' + escapeHtml(sow.status) + ')</option>';
      });
    } catch (e) { /* ignore */ }
  }

  async function renderSowPreview(sowId) {
    var preview = document.getElementById('rcSowPreview');
    var content = document.getElementById('rcSowPreviewContent');
    if (!sowId) {
      preview.classList.add('hidden');
      content.innerHTML = '';
      return;
    }
    try {
      var res = await apiCall('GET', '/api/sows/' + sowId);
      var sow = res.data;
      var html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
      html += '<div><span class="text-on-surface-variant">SOW ID:</span> <strong>' + escapeHtml(sow.sow_number) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Status:</span> <strong>' + escapeHtml(sow.status) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Client:</span> <strong>' + escapeHtml(sow.client_name) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Total Value:</span> <strong>' + formatCurrency(sow.total_value) + '</strong></div>';
      html += '</div>';
      if (sow.items && sow.items.length > 0) {
        html += '<div class="mt-3 space-y-1">';
        sow.items.forEach(function (item) {
          html += '<div class="rounded-lg bg-surface-container-high p-3">' +
            '<div><strong>' + escapeHtml(item.role_position) + '</strong></div>' +
            '<div class="text-xs text-on-surface-variant">Qty: ' + item.quantity + ' | Amount: ' + formatCurrency(item.amount) + '</div>' +
          '</div>';
        });
        html += '</div>';
      }
      content.innerHTML = html;
      preview.classList.remove('hidden');
    } catch (e) {
      preview.classList.add('hidden');
      content.innerHTML = '';
    }
  }

  async function loadRateCards() {
    var tbody = document.getElementById('rcBody');
    showLoading(tbody);
    try {
      var clientId = document.getElementById('rcFilterClient').value;
      var url = clientId ? '/api/rate-cards?clientId=' + clientId : '/api/rate-cards';
      var res = await apiCall('GET', url);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-on-surface-variant py-8">No rate cards found</td></tr>';
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
            '<td>' + escapeHtml(r.sow_number || '---') + '</td>' +
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
      await loadSOWsForClient(r.client_id);
      await loadPOsForClient(r.client_id);
      document.getElementById('rcSOW').value = r.sow_id || '';
      document.getElementById('rcPO').value = r.po_id || '';
      document.getElementById('rcEmpCode').value = r.emp_code;
      document.getElementById('rcEmpName').value = r.emp_name;
      document.getElementById('rcDoj').value = r.doj || '';
      document.getElementById('rcManager').value = r.reporting_manager || '';
      document.getElementById('rcRate').value = r.monthly_rate;
      document.getElementById('rcRateMode').value = 'monthly';
      document.getElementById('rcHourlyRate').value = '';
      document.getElementById('rcHoursWorked').value = '';
      document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(r.monthly_rate || 0);
      toggleRateMode('monthly');
      document.getElementById('rcLeaves').value = r.leaves_allowed;
      document.getElementById('rcChargingDate').value = r.charging_date || '';
      document.getElementById('rcModalTitle').textContent = 'Edit Rate Card';
      window.rcEdit = r.id;
      await renderSowPreview(r.sow_id || '');
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
    var rateMode = document.getElementById('rcRateMode').value;
    var monthlyRate = rateMode === 'hourly'
      ? recalcHourlyMonthlyRate()
      : parseFloat(document.getElementById('rcRate').value);

    if (!monthlyRate || monthlyRate <= 0) {
      showToast(rateMode === 'hourly' ? 'Enter valid hourly rate and hours worked' : 'Enter a valid monthly rate', 'danger');
      return;
    }

    var data = {
      client_id: parseInt(document.getElementById('rcClient').value, 10),
      emp_code: document.getElementById('rcEmpCode').value.trim(),
      emp_name: document.getElementById('rcEmpName').value.trim(),
      doj: document.getElementById('rcDoj').value || null,
      reporting_manager: document.getElementById('rcManager').value.trim(),
      monthly_rate: monthlyRate,
      leaves_allowed: parseInt(document.getElementById('rcLeaves').value, 10) || 0,
      charging_date: document.getElementById('rcChargingDate').value || null,
      sow_id: parseInt(document.getElementById('rcSOW').value, 10),
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
  document.getElementById('rcRateMode').addEventListener('change', function () {
    toggleRateMode(this.value);
  });
  document.getElementById('rcHourlyRate').addEventListener('input', recalcHourlyMonthlyRate);
  document.getElementById('rcHoursWorked').addEventListener('input', recalcHourlyMonthlyRate);

  // Load POs when client changes in the form
  document.getElementById('rcClient').addEventListener('change', function () {
    loadSOWsForClient(this.value);
    loadPOsForClient(this.value);
  });

  document.getElementById('rcSOW').addEventListener('change', function () {
    renderSowPreview(this.value);
  });

  // Initialize search
  initTableSearch('rcSearch', 'rcBody');

  loadClients().then(loadRateCards);
})();
