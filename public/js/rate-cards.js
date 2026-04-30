(function () {
  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)
  var rateCardClientMap = {};
  var rateCardRowMap = {};
  var currentSowDetail = null;
  var rcDojEditedByUser = false;

  function normalizeClientKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function isSgtcHourlyProratedClient(client) {
    var key = normalizeClientKey(client && ((getClientDisplayName(client) || client.client_name || client.name || '') + ' ' + (client.abbreviation || '')));
    var isSgtcClient = key.indexOf('SGTC') !== -1 || key.indexOf('STRYKERGLOBALTECHNOLOGYCENTER') !== -1;
    return isSgtcClient
      && (
        key.indexOf('GGN') !== -1
        || key.indexOf('GURGAON') !== -1
        || key.indexOf('GURUGRAM') !== -1
        || key.indexOf('BLR') !== -1
        || key.indexOf('BANGALORE') !== -1
        || key.indexOf('BENGALURU') !== -1
        || key.indexOf('STRYKERGLOBALTECHNOLOGYCENTER') !== -1
      );
  }

  function updateRateModeAvailability() {
    var selectedClient = rateCardClientMap[String(document.getElementById('rcClient').value)] || null;
    var rateMode = document.getElementById('rcRateMode');
    var hourlyOption = rateMode.querySelector('option[value="hourly"]');
    var helper = document.getElementById('rcRateHelper');
    var isSgtc = isSgtcHourlyProratedClient(selectedClient);
    if (hourlyOption) hourlyOption.disabled = isSgtc;
    if (isSgtc && rateMode.value === 'hourly') rateMode.value = 'monthly';
    if (helper) {
      helper.textContent = isSgtc
        ? 'SGTC GGN/BLR bills from monthly rate only; backend prorates by present days x 8.5 hours against 170 monthly hours.'
        : '';
      helper.classList.toggle('hidden', !isSgtc);
    }
    toggleRateMode(rateMode.value);
  }

  function applyClientDefaultLeaves(force) {
    var selectedClient = rateCardClientMap[String(document.getElementById('rcClient').value)] || null;
    var leavesInput = document.getElementById('rcLeaves');
    if (!selectedClient || !leavesInput) return;
    if (force || !window.rcEdit) {
      leavesInput.value = selectedClient.leaves_allowed || selectedClient.default_leaves_allowed || 0;
    }
  }

  function setBillingWindowVisibility() {
    var pauseChecked = document.getElementById('rcPauseBilling').checked;
    var disableChecked = document.getElementById('rcDisableBilling').checked;
    document.getElementById('rcPauseBillingDates').classList.toggle('hidden', !pauseChecked);
    document.getElementById('rcDisableBillingDates').classList.toggle('hidden', !disableChecked);
  }

  function resetBillingWindowFields() {
    document.getElementById('rcPauseBilling').checked = false;
    document.getElementById('rcPauseStartDate').value = '';
    document.getElementById('rcPauseEndDate').value = '';
    document.getElementById('rcDisableBilling').checked = false;
    document.getElementById('rcDisableFromDate').value = '';
    setBillingWindowVisibility();
  }

  function isBillingDisabledForCapacity(row) {
    return row.no_invoice || row.billing_active === false || row.disable_billing;
  }

  function toggleRateMode(mode) {
    var monthlySection = document.getElementById('rcMonthlyRateSection');
    var hourlySection = document.getElementById('rcHourlyRateSection');
    var computedSection = document.getElementById('rcHourlyComputedSection');
    var monthlyInput = document.getElementById('rcRate');
    var hourlyRateInput = document.getElementById('rcHourlyRate');
    var hoursWorkedInput = document.getElementById('rcHoursWorked');
    var capHoursInput = document.getElementById('rcCapHours');

    var isHourly = mode === 'hourly';
    monthlySection.classList.toggle('hidden', isHourly);
    hourlySection.classList.toggle('hidden', !isHourly);
    computedSection.classList.toggle('hidden', !isHourly);
    monthlyInput.required = !isHourly;
    hourlyRateInput.required = isHourly;
    hoursWorkedInput.required = isHourly;
    capHoursInput.required = isHourly;

    if (!isHourly) {
      hourlyRateInput.value = '';
      hoursWorkedInput.value = '';
      capHoursInput.value = '';
      document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(parseFloat(monthlyInput.value) || 0);
    } else {
      recalcHourlyMonthlyRate();
    }
  }

  function recalcHourlyMonthlyRate() {
    var hourlyRate = parseFloat(document.getElementById('rcHourlyRate').value) || 0;
    var hoursWorked = parseFloat(document.getElementById('rcHoursWorked').value) || 0;
    var capHours = parseFloat(document.getElementById('rcCapHours').value) || 0;
    var billableHours = Math.min(hoursWorked, capHours);
    var monthlyRate = Math.round(hourlyRate * billableHours * 100) / 100;
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
    document.getElementById('rcServiceDescription').value = '';
    document.getElementById('rcServiceDescriptionOptions').innerHTML = '';
    document.getElementById('rcSowRoleCapacity').classList.add('hidden');
    document.getElementById('rcSowRoleCapacity').innerHTML = '';
    resetBillingWindowFields();
    rcDojEditedByUser = false;
    document.getElementById('rcRateMode').value = 'monthly';
    document.getElementById('rcHourlyRate').value = '';
    document.getElementById('rcHoursWorked').value = '';
    document.getElementById('rcCapHours').value = '';
    document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(0);
    toggleRateMode('monthly');
    updateRateModeAvailability();
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
    document.getElementById('rcServiceDescription').value = '';
    document.getElementById('rcServiceDescriptionOptions').innerHTML = '';
    document.getElementById('rcSowRoleCapacity').classList.add('hidden');
    document.getElementById('rcSowRoleCapacity').innerHTML = '';
    resetBillingWindowFields();
    rcDojEditedByUser = false;
    document.getElementById('rcRateMode').value = 'monthly';
    document.getElementById('rcHourlyRate').value = '';
    document.getElementById('rcHoursWorked').value = '';
    document.getElementById('rcCapHours').value = '';
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
  window.closeRCLinkPOModal = function () { closeModal('rcLinkPOModal'); };

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      rateCardClientMap = {};
      (res.data || []).forEach(function (client) {
        rateCardClientMap[String(client.id)] = client;
      });
      ['rcFilterClient', 'rcClient', 'uploadRCClient'].forEach(function (id) {
        var sel = document.getElementById(id);
        if (!sel) return;
        var existing = sel.querySelector('option');
        sel.innerHTML = existing ? existing.outerHTML : '<option value="">All</option>';
        res.data.forEach(function (c) {
          sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(getClientDisplayName(c)) + '</option>';
        });
      });
    } catch (e) { /* ignore */ }
  }

  async function loadPOsForClient(clientId) {
    var sel = document.getElementById('rcPO');
    sel.innerHTML = '<option value="">PO to be added</option>';
    if (!clientId) return;
    try {
      var res = await apiCall('GET', '/api/purchase-orders?clientId=' + clientId + '&status=Active');
      res.data.forEach(function (po) {
        sel.innerHTML += '<option value="' + po.id + '">' + escapeHtml(po.po_number) + '</option>';
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
        if (sow.status === 'Expired' || sow.status === 'Terminated') return;
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
      currentSowDetail = sow;
      var html = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">';
      html += '<div><span class="text-on-surface-variant">SOW ID:</span> <strong>' + escapeHtml(sow.sow_number) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Status:</span> <strong>' + escapeHtml(sow.status) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Client:</span> <strong>' + escapeHtml(sow.client_name) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Start / DOJ Client:</span> <strong>' + formatDate(sow.effective_start) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Total Value:</span> <strong>' + formatCurrency(sow.total_value) + '</strong></div>';
      html += '</div>';
      autofillDojFromSow(sow);
      if (sow.items && sow.items.length > 0) {
        html += '<div class="mt-3 space-y-1">';
        sow.items.forEach(function (item) {
          html += '<div class="rounded-lg bg-surface-container-high p-3">' +
            '<div><strong>' + escapeHtml(item.role_position) + '</strong></div>' +
            '<div class="text-xs text-on-surface-variant">Qty: ' + item.quantity + ' | Amount: ' + formatCurrency(item.amount) + '</div>' +
          '</div>';
        });
        html += '</div>';
        if (!document.getElementById('rcServiceDescription').value.trim()) {
          document.getElementById('rcServiceDescription').value = String(sow.items[0].role_position || '').toUpperCase();
        }
      }
      content.innerHTML = html;
      preview.classList.remove('hidden');
      renderSowRoleCapacityPreview();
    } catch (e) {
      currentSowDetail = null;
      preview.classList.add('hidden');
      content.innerHTML = '';
      renderSowRoleCapacityPreview();
    }
  }

  function autofillDojFromSow(sow) {
    var dojInput = document.getElementById('rcDoj');
    var reportingInput = document.getElementById('rcChargingDate');
    if (!dojInput || !sow || !sow.effective_start) return;
    if (!rcDojEditedByUser || !dojInput.value) {
      dojInput.value = sow.effective_start;
      if (reportingInput && !reportingInput.value) {
        reportingInput.value = sow.effective_start;
      }
    }
  }

  function validateRateCardDates() {
    var doj = document.getElementById('rcDoj').value;
    var reporting = document.getElementById('rcChargingDate').value;
    if (!reporting && doj) {
      document.getElementById('rcChargingDate').value = doj;
      reporting = doj;
    }
    if (doj && reporting && doj > reporting) {
      showToast('Date of Joining must be less than or equal to Date of Reporting', 'danger');
      return false;
    }
    return true;
  }

  function normalizeComparableText(value) {
    return String(value || '').trim().toUpperCase();
  }

  function resolveSowCapacityTarget() {
    var serviceKey = normalizeComparableText(document.getElementById('rcServiceDescription').value);
    var items = currentSowDetail.items || [];
    var matchedItem = serviceKey ? items.find(function (item) {
      return normalizeComparableText(item.role_position) === serviceKey;
    }) : null;
    if (matchedItem) {
      return {
        serviceKey: serviceKey,
        allowedEmployees: parseInt(matchedItem.quantity, 10) || 0,
        allowedAmount: parseFloat(matchedItem.amount) || 0,
        label: matchedItem.role_position || document.getElementById('rcServiceDescription').value,
        scoped: true,
      };
    }
    return {
      serviceKey: '',
      allowedEmployees: items.reduce(function (sum, item) { return sum + (parseInt(item.quantity, 10) || 0); }, 0),
      allowedAmount: currentSowDetail.total_value || items.reduce(function (sum, item) { return sum + (parseFloat(item.amount) || 0); }, 0),
      label: currentSowDetail.sow_number || 'selected SOW',
      scoped: false,
    };
  }

  function getSowRoleUsage(sowId, serviceKey, editingId) {
    return Object.keys(rateCardRowMap).map(function (id) { return rateCardRowMap[id]; }).filter(function (row) {
      if (String(row.sow_id || '') !== String(sowId || '')) return false;
      if (String(row.id) === String(editingId || '')) return false;
      if (isBillingDisabledForCapacity(row)) return false;
      if (serviceKey && normalizeComparableText(row.service_description) !== serviceKey) return false;
      return true;
    }).length;
  }

  function renderSowRoleCapacityPreview() {
    var box = document.getElementById('rcSowRoleCapacity');
    var options = document.getElementById('rcServiceDescriptionOptions');
    if (!box || !currentSowDetail || !currentSowDetail.items || currentSowDetail.items.length === 0) {
      if (box) {
        box.classList.add('hidden');
        box.innerHTML = '';
      }
      if (options) options.innerHTML = '';
      return;
    }

    if (options) {
      options.innerHTML = currentSowDetail.items.map(function (item) {
        return '<option value="' + escapeHtml(String(item.role_position || '').toUpperCase()) + '"></option>';
      }).join('');
    }

    var selectedKey = normalizeComparableText(document.getElementById('rcServiceDescription').value);
    var rows = currentSowDetail.items.map(function (item) {
      var role = String(item.role_position || '').toUpperCase();
      var roleKey = normalizeComparableText(role);
      var allowed = parseInt(item.quantity, 10) || 0;
      var used = getSowRoleUsage(currentSowDetail.id, roleKey, window.rcEdit);
      var remaining = Math.max(allowed - used, 0);
      var active = selectedKey && selectedKey === roleKey;
      return '<div class="flex items-center justify-between gap-3 ' + (active ? 'font-semibold text-on-surface' : '') + '">' +
        '<span>' + escapeHtml(role) + '</span>' +
        '<span>' + remaining + ' left of ' + allowed + '</span>' +
      '</div>';
    });

    box.innerHTML = rows.join('');
    box.classList.remove('hidden');
  }

  function validateAgainstSelectedSOW(monthlyRate, editingId) {
    if (!currentSowDetail || !currentSowDetail.items || currentSowDetail.items.length === 0) return true;
    var sowId = String(currentSowDetail.id);
    var target = resolveSowCapacityTarget();
    var activeRows = Object.keys(rateCardRowMap).map(function (id) { return rateCardRowMap[id]; }).filter(function (row) {
      if (String(row.sow_id || '') !== sowId) return false;
      if (String(row.id) === String(editingId || '')) return false;
      if (isBillingDisabledForCapacity(row)) return false;
      if (target.scoped && normalizeComparableText(row.service_description) !== target.serviceKey) return false;
      return true;
    });
    var allowedEmployees = target.allowedEmployees;
    var allowedAmount = target.allowedAmount;
    var billingDisabled = document.getElementById('rcDisableBilling').checked;
    var newCount = activeRows.length + (billingDisabled ? 0 : 1);
    var newAmount = activeRows.reduce(function (sum, row) { return sum + (parseFloat(row.monthly_rate) || 0); }, 0);
    if (!billingDisabled) newAmount += monthlyRate;
    if (allowedEmployees > 0 && newCount > allowedEmployees) {
      showToast('Rate card employee count exceeds SOW quantity for ' + target.label, 'danger');
      return false;
    }
    if (allowedAmount > 0 && newAmount > allowedAmount) {
      showToast('Rate card amount exceeds SOW amount for ' + target.label, 'danger');
      return false;
    }
    return true;
  }

  function updateRateCardSummary(rows) {
    var summary = document.getElementById('rcSummary');
    var count = document.getElementById('rcTableCount');
    var items = rows || [];
    var uniqueClients = new Set(items.map(function (row) { return row.client_name || ''; }).filter(Boolean)).size;
    if (summary) {
      var cards = summary.querySelectorAll('.table-summary-value');
      if (cards[0]) cards[0].textContent = items.length;
      if (cards[1]) cards[1].textContent = uniqueClients;
      if (cards[2]) cards[2].textContent = items.length;
    }
    if (count) count.textContent = items.length === 1 ? '1 row' : items.length + ' rows';
  }

  function updateRateCardVisibleCount() {
    var tbody = document.getElementById('rcBody');
    var summary = document.getElementById('rcSummary');
    var count = document.getElementById('rcTableCount');
    if (!tbody) return;
    var visible = Array.from(tbody.querySelectorAll('tr')).filter(function (row) {
      return !row.querySelector('td[colspan]') && row.style.display !== 'none';
    }).length;
    if (summary) {
      var cards = summary.querySelectorAll('.table-summary-value');
      if (cards[2]) cards[2].textContent = visible;
    }
    if (count) count.textContent = visible === 1 ? '1 row' : visible + ' rows';
  }

  async function loadRateCards() {
    var tbody = document.getElementById('rcBody');
    showLoading(tbody);
    try {
      var clientId = document.getElementById('rcFilterClient').value;
      var url = clientId ? '/api/rate-cards?clientId=' + clientId : '/api/rate-cards';
      var res = await apiCall('GET', url);
      updateRateCardSummary(res.data || []);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center text-on-surface-variant py-8">No rate cards found</td></tr>';
      } else {
        rateCardRowMap = {};
        tbody.innerHTML = res.data.map(function (r) {
          rateCardRowMap[r.id] = r;
          var client = rateCardClientMap[String(r.client_id)] || null;
          var clientDisplay = client ? getClientDisplayName(client) : (r.client_name || '');
          var billingPaused = r.pause_billing;
          var billingDisabled = r.no_invoice || r.billing_active === false || r.disable_billing;
          var billingLabel = billingDisabled ? 'Disabled' : (billingPaused ? 'Paused' : 'Invoice');
          var billingClass = billingDisabled ? 'badge-warning' : (billingPaused ? 'badge-warning' : 'badge-success');
          return '<tr>' +
            '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(clientDisplay) + '">' + escapeHtml(clientDisplay) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="entity-pill entity-pill-strong" title="' + escapeHtml(r.emp_code || '') + '">' + escapeHtml(r.emp_code || '') + '</span></div></td>' +
            '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(r.emp_name || '') + '</span><span class="table-cell-secondary">' + escapeHtml(r.sow_number ? ('SOW ' + r.sow_number) : 'No SOW linked') + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + (r.doj ? formatDate(r.doj) : 'Not set') + '</span></div></td>' +
            '<td><div class="table-cell-box table-cell-text">' + escapeHtml(r.reporting_manager || '---') + '</div></td>' +
            '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(r.monthly_rate) + '</span></div></td>' +
            '<td class="text-center"><div class="table-cell-box table-cell-center"><span class="table-count-badge">' + r.leaves_allowed + '</span></div></td>' +
            '<td><div class="table-cell-box table-cell-text" title="' + escapeHtml(r.service_description || '') + '">' + escapeHtml(r.service_description || '-') + '</div></td>' +
            '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(r.sow_number || 'Not linked') + '">' + escapeHtml(r.sow_number || 'Not linked') + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + (r.charging_date ? formatDate(r.charging_date) : 'Pending') + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(r.po_number || 'PO to be added') + '">' + escapeHtml(r.po_number || 'PO to be added') + '</span></div></td>' +
            '<td class="text-center"><div class="table-cell-box table-cell-center"><span class="' + billingClass + '">' + billingLabel + '</span></div></td>' +
            '<td class="text-center"><div class="table-cell-box table-cell-center"><div class="table-action-group">' +
              '<button class="btn-secondary btn-sm inline-flex items-center" onclick="openRCLinkPO(' + r.id + ')" title="Link PO"><span class="material-symbols-outlined text-base">add_link</span></button>' +
              '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editRC(' + r.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>' +
              '<button class="btn-danger btn-sm inline-flex items-center" onclick="deleteRC(' + r.id + ')" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>' +
              '</div></div></td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('rcTable');
      updateRateCardVisibleCount();
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
      rcDojEditedByUser = Boolean(r.doj);
      document.getElementById('rcManager').value = r.reporting_manager || '';
      document.getElementById('rcServiceDescription').value = r.service_description || '';
      document.getElementById('rcPauseBilling').checked = Boolean(r.pause_billing);
      document.getElementById('rcPauseStartDate').value = r.pause_start_date || '';
      document.getElementById('rcPauseEndDate').value = r.pause_end_date || '';
      document.getElementById('rcDisableBilling').checked = Boolean(r.disable_billing || r.no_invoice || r.billing_active === false);
      document.getElementById('rcDisableFromDate').value = r.disable_from_date || '';
      setBillingWindowVisibility();
      document.getElementById('rcRate').value = r.monthly_rate;
      document.getElementById('rcRateMode').value = 'monthly';
      document.getElementById('rcHourlyRate').value = '';
      document.getElementById('rcHoursWorked').value = '';
      document.getElementById('rcCapHours').value = '';
      document.getElementById('rcComputedMonthlyRate').textContent = formatCurrency(r.monthly_rate || 0);
      toggleRateMode('monthly');
      updateRateModeAvailability();
      document.getElementById('rcLeaves').value = r.leaves_allowed;
      document.getElementById('rcChargingDate').value = r.charging_date || '';
      document.getElementById('rcModalTitle').textContent = 'Edit Rate Card';
      window.rcEdit = r.id;
      await renderSowPreview(r.sow_id || '');
      renderSowRoleCapacityPreview();
      openModal('rcModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.openRCLinkPO = async function (id) {
    var row = rateCardRowMap[id];
    if (!row) return;
    document.getElementById('rcLinkPOCardId').value = row.id;
    document.getElementById('rcLinkPOClientId').value = row.client_id;
    document.getElementById('rcLinkPOSowId').value = row.sow_id || '';
    var sel = document.getElementById('rcLinkPOSelect');
    sel.innerHTML = '<option value="">Select PO</option>';
    try {
      var res = await apiCall('GET', '/api/purchase-orders?clientId=' + row.client_id + '&status=Active');
      (res.data || []).forEach(function (po) {
        sel.innerHTML += '<option value="' + po.id + '">' + escapeHtml(po.po_number) + '</option>';
      });
      if (row.po_id) sel.value = String(row.po_id);
      openModal('rcLinkPOModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.createPOLaterFromRC = function () {
    var clientId = document.getElementById('rcLinkPOClientId').value;
    var sowId = document.getElementById('rcLinkPOSowId').value;
    sessionStorage.setItem('pendingPoLinkContext', JSON.stringify({ clientId: parseInt(clientId, 10), sowId: sowId ? parseInt(sowId, 10) : null }));
    closeRCLinkPOModal();
    location.hash = '#purchase-orders';
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

    if (!Number.isFinite(monthlyRate) || monthlyRate < 0) {
      showToast(rateMode === 'hourly' ? 'Enter valid hourly rate, hours worked, and cap hours' : 'Enter a valid monthly rate', 'danger');
      return;
    }
    var pauseBilling = document.getElementById('rcPauseBilling').checked;
    var pauseStartDate = document.getElementById('rcPauseStartDate').value || null;
    var pauseEndDate = document.getElementById('rcPauseEndDate').value || null;
    var disableBilling = document.getElementById('rcDisableBilling').checked;
    var disableFromDate = document.getElementById('rcDisableFromDate').value || null;
    if (pauseBilling && (!pauseStartDate || !pauseEndDate)) {
      showToast('Pause billing requires from and to dates', 'danger');
      return;
    }
    if (pauseStartDate && pauseEndDate && pauseStartDate > pauseEndDate) {
      showToast('Pause billing from date must be before to date', 'danger');
      return;
    }
    if (disableBilling && !disableFromDate) {
      showToast('Disable billing requires a from date', 'danger');
      return;
    }
    if (!validateRateCardDates()) return;
    if (!validateAgainstSelectedSOW(monthlyRate, window.rcEdit)) return;

    var data = {
      client_id: parseInt(document.getElementById('rcClient').value, 10),
      emp_code: document.getElementById('rcEmpCode').value.trim(),
      emp_name: document.getElementById('rcEmpName').value.trim(),
      doj: document.getElementById('rcDoj').value || null,
      reporting_manager: document.getElementById('rcManager').value.trim(),
      service_description: document.getElementById('rcServiceDescription').value.trim(),
      monthly_rate: monthlyRate,
      leaves_allowed: parseInt(document.getElementById('rcLeaves').value, 10) || 0,
      charging_date: document.getElementById('rcChargingDate').value || null,
      sow_id: parseInt(document.getElementById('rcSOW').value, 10),
      po_id: poVal ? parseInt(poVal, 10) : null,
      billing_active: true,
      no_invoice: false,
      pause_billing: pauseBilling,
      pause_start_date: pauseStartDate,
      pause_end_date: pauseEndDate,
      disable_billing: disableBilling,
      disable_from_date: disableFromDate,
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

  document.getElementById('rcLinkPOForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var cardId = document.getElementById('rcLinkPOCardId').value;
    var poId = document.getElementById('rcLinkPOSelect').value;
    var row = rateCardRowMap[cardId];
    if (!row || !poId) { showToast('Select PO to link', 'danger'); return; }
    try {
      await apiCall('PUT', '/api/rate-cards/' + cardId, {
        client_id: row.client_id,
        emp_code: row.emp_code,
        emp_name: row.emp_name,
        doj: row.doj || null,
        reporting_manager: row.reporting_manager || '',
        service_description: row.service_description || '',
        monthly_rate: parseFloat(row.monthly_rate),
        leaves_allowed: parseInt(row.leaves_allowed, 10) || 0,
        charging_date: row.charging_date || null,
        sow_id: row.sow_id,
        po_id: parseInt(poId, 10),
        billing_active: row.billing_active !== false,
        no_invoice: Boolean(row.no_invoice),
        pause_billing: Boolean(row.pause_billing),
        pause_start_date: row.pause_start_date || null,
        pause_end_date: row.pause_end_date || null,
        disable_billing: Boolean(row.disable_billing),
        disable_from_date: row.disable_from_date || null,
      });
      showToast('PO linked', 'success');
      closeRCLinkPOModal();
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
  document.getElementById('rcCapHours').addEventListener('input', recalcHourlyMonthlyRate);

  // Load POs when client changes in the form
  document.getElementById('rcClient').addEventListener('change', function () {
    loadSOWsForClient(this.value);
    loadPOsForClient(this.value);
    applyClientDefaultLeaves(true);
    updateRateModeAvailability();
  });

  document.getElementById('rcSOW').addEventListener('change', function () {
    currentSowDetail = null;
    document.getElementById('rcServiceDescription').value = '';
    renderSowRoleCapacityPreview();
    renderSowPreview(this.value);
  });

  document.getElementById('rcServiceDescription').addEventListener('input', renderSowRoleCapacityPreview);
  document.getElementById('rcPauseBilling').addEventListener('change', setBillingWindowVisibility);
  document.getElementById('rcDisableBilling').addEventListener('change', function () {
    setBillingWindowVisibility();
    renderSowRoleCapacityPreview();
  });

  document.getElementById('rcDoj').addEventListener('change', function () {
    rcDojEditedByUser = Boolean(this.value);
    if (!document.getElementById('rcChargingDate').value) {
      document.getElementById('rcChargingDate').value = this.value;
    }
  });

  // Initialize search
  initTableSearch('rcSearch', 'rcBody');
  document.getElementById('rcSearch').addEventListener('input', function () {
    setTimeout(updateRateCardVisibleCount, 250);
  });

  loadClients().then(loadRateCards);
})();
