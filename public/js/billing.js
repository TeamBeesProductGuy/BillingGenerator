(function () {
  var currentRunId = null;
  var currentRequestStatus = null;
  var currentPoCandidatesByEmp = {};
  var currentBillingItems = [];
  var managerGroups = {};
  var currentBillingMonth = '';
  var managerEditSyncBaseDays = 0;
  var managerEditLeavesAllowed = 0;
  var managerEditSyncing = false;
  var billingClientMap = {};

  window.switchBillingTab = function (tabId) {
    document.querySelectorAll('.billing-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.billing-tab-pane').forEach(function (pane) {
      pane.classList.toggle('hidden', pane.id !== tabId);
    });
  };

  function setupFileZone(zoneId, inputId, nameId) {
    var zone = document.getElementById(zoneId);
    var input = document.getElementById(inputId);
    var nameEl = document.getElementById(nameId);
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) { e.preventDefault(); zone.classList.remove('dragover'); });
    });
    zone.addEventListener('drop', function (e) {
      var files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        nameEl.textContent = files[0].name;
      }
    });
    input.addEventListener('change', function () {
      nameEl.textContent = input.files.length > 0 ? input.files[0].name : '';
    });
  }

  function monthInputToYYYYMM(inputValue) {
    return inputValue.replace('-', '');
  }

  function autoFillBillingMonth() {
    var value = getDefaultBillingMonthInput();
    var el1 = document.getElementById('billingMonth');
    var el2 = document.getElementById('dbBillingMonth');
    if (el1 && !el1.value) el1.value = value;
    if (el2 && !el2.value) el2.value = value;
  }

  function statusBadge(status) {
    var map = {
      Pending: 'badge-processing',
      'Partially Accepted': 'badge-warning',
      Accepted: 'badge-success',
      Rejected: 'badge-error'
    };
    return '<span class="' + (map[status] || 'badge-processing') + '">' + escapeHtml(status || 'Pending') + '</span>';
  }

  function setDecisionButtonsEnabled(enabled) {
    document.getElementById('acceptRequestBtn').disabled = !enabled;
    document.getElementById('rejectRequestBtn').disabled = !enabled;
  }

  function updateDecisionPresentation(status) {
    var actions = document.getElementById('decisionActions');
    var message = document.getElementById('decisionStatusMessage');
    var helpText = document.getElementById('decisionHelpText');

    if (status === 'Accepted') {
      actions.classList.add('hidden');
      message.classList.remove('hidden');
      message.className = 'text-sm font-semibold text-success';
      message.textContent = 'This service request was accepted by the client.';
      helpText.textContent = 'PO consumption has already been applied for this service request.';
      return;
    }

    if (status === 'Rejected') {
      actions.classList.add('hidden');
      message.classList.remove('hidden');
      message.className = 'text-sm font-semibold text-error';
      message.textContent = 'This service request was rejected by the client.';
      helpText.textContent = 'This service request remains downloadable, but no PO consumption was applied.';
      return;
    }

    actions.classList.remove('hidden');
    message.classList.add('hidden');
    message.textContent = '';
    helpText.textContent = status === 'Partially Accepted'
      ? 'Some manager approvals have been accepted. Approve remaining manager groups as confirmations arrive.'
      : 'Accept all to store PO consumption for every pending item, or approve by reporting manager below.';
  }

  function setDownloadLinks(runId, downloadUrl) {
    document.getElementById('downloadLink').setAttribute('data-url', downloadUrl || ('/api/billing/runs/' + runId + '/download'));
    document.getElementById('downloadBillingWorkingBtn').setAttribute('data-url', '/api/billing/runs/' + runId + '/download/billing_working');
    document.getElementById('downloadManagerSummaryBtn').setAttribute('data-url', '/api/billing/runs/' + runId + '/download/manager_summary');
    document.getElementById('downloadErrorReportBtn').setAttribute('data-url', '/api/billing/runs/' + runId + '/download/error_report');
  }

  function renderClientCheckboxPicker(clients) {
    var allToggle = document.getElementById('dbClientAll');
    var list = document.getElementById('dbClientList');
    if (!allToggle || !list) return;

    var items = clients || [];
    list.innerHTML = '';

    if (items.length === 0) {
      list.innerHTML = '<div class="px-2 py-3 text-xs text-on-surface-variant">No clients found.</div>';
      allToggle.checked = false;
      allToggle.disabled = true;
      return;
    }

    allToggle.disabled = false;
    allToggle.checked = true;

    items.forEach(function (client) {
      var id = 'dbClient_' + client.id;
      var label = escapeHtml(getClientDisplayName(client));
      list.innerHTML +=
        '<label class="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-surface-container-high/60">' +
          '<input type="checkbox" class="db-client-checkbox h-4 w-4 accent-black" id="' + id + '" value="' + client.id + '" disabled>' +
          '<span class="text-sm text-on-surface">' + label + '</span>' +
        '</label>';
    });

    var checkboxes = function () {
      return Array.from(document.querySelectorAll('.db-client-checkbox'));
    };

    allToggle.onchange = function () {
      var checked = allToggle.checked;
      checkboxes().forEach(function (cb) {
        cb.disabled = checked;
        cb.checked = false;
      });
    };

    list.onchange = function () {
      var boxes = checkboxes();
      var selected = boxes.filter(function (cb) { return cb.checked; }).length;
      allToggle.checked = selected === 0;
      boxes.forEach(function (cb) {
        cb.disabled = allToggle.checked;
      });
    };

    if (items.length === 1) {
      allToggle.checked = true;
    }
  }

  function getInitials(name, fallback) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return String(fallback || '?').slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function renderMissingPoInputs(items, poCandidatesByEmp) {
    var missing = items.filter(function (item) { return !item.po_id && (item.approval_status || 'Pending') === 'Pending'; });
    var section = document.getElementById('missingPoSection');
    var body = document.getElementById('missingPoBody');
    var countEl = document.getElementById('missingPoCount');
    if (missing.length === 0) {
      section.classList.add('hidden');
      body.innerHTML = '';
      if (countEl) countEl.textContent = '';
      return;
    }
    if (countEl) countEl.textContent = '· ' + missing.length + ' row' + (missing.length === 1 ? '' : 's') + ' need a PO';

    body.innerHTML = missing.map(function (item) {
      var itemKey = item.id ? ('item:' + item.id) : ('emp:' + item.emp_code + ':sow:' + (item.sow_id || ''));
      var candidates = (poCandidatesByEmp && (poCandidatesByEmp[itemKey] || poCandidatesByEmp[item.emp_code])) || [];
      var amountStr = formatCurrency(item.invoice_amount || 0);
      var rowAttrs = 'data-row-emp="' + escapeHtml(item.emp_code) + '"' +
        ' data-row-item-id="' + escapeHtml(item.id || '') + '"' +
        ' data-row-client-id="' + escapeHtml(item.client_id || '') + '"' +
        ' data-row-sow-id="' + escapeHtml(item.sow_id || '') + '"' +
        ' data-row-sow-number="' + escapeHtml(item.sow_number || '') + '"' +
        ' data-row-amount="' + escapeHtml(String(item.invoice_amount || 0)) + '"';

      var sowMatched = candidates.filter(function (po) { return po.sow_match; });
      var otherClient = candidates.filter(function (po) { return !po.sow_match; });

      function optionHtml(po) {
        var sowSuffix = po.sow_number ? (' · SOW ' + escapeHtml(po.sow_number)) : ' · No SOW';
        return '<option value="' + po.id + '" data-po-number="' + escapeHtml(po.po_number || '') + '" data-remaining="' + (po.remaining_value || 0) + '">' +
          escapeHtml(po.po_number || ('PO #' + po.id)) + sowSuffix + ' · ' + escapeHtml(formatCurrency(po.remaining_value || 0)) + ' left' +
          '</option>';
      }

      var selectInner = '<option value="">Select a Purchase Order…</option>';
      if (sowMatched.length > 0) {
        selectInner += '<optgroup label="✓ Linked to this SOW">' + sowMatched.map(optionHtml).join('') + '</optgroup>';
      }
      if (otherClient.length > 0) {
        selectInner += '<optgroup label="Other POs for this client">' + otherClient.map(optionHtml).join('') + '</optgroup>';
      }

      var pickerSection = candidates.length > 0
        ? '<select class="missing-po-select w-full max-w-sm" data-item-id="' + escapeHtml(item.id || '') + '" data-emp-code="' + escapeHtml(item.emp_code) + '">' + selectInner + '</select>'
        : '<div class="inline-flex items-center gap-2 max-w-sm px-3 py-2.5 rounded-lg bg-warning/5 border border-warning/20 text-warning text-xs">' +
            '<span class="material-symbols-outlined text-[16px]">info</span>' +
            '<span>No Active POs for this client yet — use <strong>Link New PO</strong> to add one.</span>' +
          '</div>';

      var sowPill = item.sow_number
        ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent/10 text-accent text-[11px] font-semibold">SOW ' + escapeHtml(item.sow_number) + '</span>'
        : '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-warning/10 text-warning text-[11px] font-semibold"><span class="material-symbols-outlined text-[13px]">link_off</span>No SOW</span>';

      var initials = getInitials(item.emp_name, item.emp_code);

      return '<div class="missing-po-row group rounded-2xl bg-surface-container shadow-sm border border-outline-variant/15 overflow-hidden transition-all hover:shadow-md hover:border-primary/25" ' + rowAttrs + '>' +
        '<div class="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 bg-gradient-to-r from-surface-container-high to-surface-container border-b border-outline-variant/10">' +
          '<div class="flex items-center gap-3 min-w-0">' +
            '<div class="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold ring-2 ring-primary/5 shrink-0">' + escapeHtml(initials) + '</div>' +
            '<div class="min-w-0">' +
              '<div class="font-semibold text-sm text-on-surface leading-tight truncate">' + escapeHtml(item.emp_name || item.emp_code) + '</div>' +
              '<div class="text-[11px] text-on-surface-variant font-mono mt-0.5">' + escapeHtml(item.emp_code) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<div class="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md bg-surface-container-highest">' +
              '<span class="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold">Invoice</span>' +
              '<span class="font-semibold text-sm text-on-surface">' + amountStr + '</span>' +
            '</div>' +
            sowPill +
          '</div>' +
        '</div>' +
        '<div class="px-5 py-4 space-y-2.5">' +
          '<div class="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-end">' +
            '<div>' +
              '<label class="block text-[11px] font-semibold text-on-surface-variant mb-1.5 uppercase tracking-wider">Assign Purchase Order</label>' +
              pickerSection +
            '</div>' +
            '<button type="button" class="missing-po-create-btn btn-secondary inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold shrink-0">' +
              '<span class="material-symbols-outlined text-[18px]">add_circle</span>Link New PO' +
            '</button>' +
          '</div>' +
          '<div class="missing-po-status text-xs min-h-[18px] inline-flex items-center gap-1.5"></div>' +
        '</div>' +
      '</div>';
    }).join('');
    section.classList.remove('hidden');
    wireMissingPoEvents();
    consumePendingPoLinkFromBilling();
  }

  function setRowStatus(row, kind, message) {
    var el = row.querySelector('.missing-po-status');
    if (!el) return;
    var colorClass = 'text-on-surface-variant';
    var icon = '';
    if (kind === 'ok') { colorClass = 'text-success'; icon = 'check_circle'; }
    else if (kind === 'error') { colorClass = 'text-error'; icon = 'error'; }
    else if (kind === 'warn') { colorClass = 'text-warning'; icon = 'warning'; }
    el.className = 'missing-po-status text-xs mt-1.5 min-h-[16px] inline-flex items-center gap-1 ' + colorClass;
    el.innerHTML = message
      ? (icon ? '<span class="material-symbols-outlined text-[14px]">' + icon + '</span>' : '') + escapeHtml(message)
      : '';
  }

  function showSelectBalanceForRow(row, optionEl) {
    if (!optionEl || !optionEl.value) {
      setRowStatus(row, '', '');
      return;
    }
    var remaining = Number(optionEl.getAttribute('data-remaining') || 0);
    var amount = Number(row.getAttribute('data-row-amount') || 0);
    var poNumber = optionEl.getAttribute('data-po-number') || '';
    if (remaining < amount) {
      setRowStatus(row, 'warn', poNumber + ' has only ' + formatCurrency(remaining) + ' remaining vs ' + formatCurrency(amount) + ' invoice.');
    } else {
      setRowStatus(row, 'ok', poNumber + ' covers this row · ' + formatCurrency(remaining) + ' remaining.');
    }
  }

  function stashPoCreationContext(row) {
    var clientId = row.getAttribute('data-row-client-id') || '';
    var sowId = row.getAttribute('data-row-sow-id') || '';
    if (!clientId) {
      showToast('No client linked to this row — cannot pre-fill PO form.', 'warning');
      return;
    }
    sessionStorage.setItem('pendingPoLinkContext', JSON.stringify({
      clientId: parseInt(clientId, 10),
      sowId: sowId ? parseInt(sowId, 10) : null
    }));
    sessionStorage.setItem('pendingPoReturn', JSON.stringify({
      returnTo: 'billing',
      runId: currentRunId,
      itemId: row.getAttribute('data-row-item-id') || null,
      empCode: row.getAttribute('data-row-emp') || null
    }));
    location.hash = '#purchase-orders';
  }

  function wireMissingPoEvents() {
    var rows = document.querySelectorAll('#missingPoBody .missing-po-row');
    rows.forEach(function (row) {
      var select = row.querySelector('.missing-po-select');
      var createBtn = row.querySelector('.missing-po-create-btn');

      if (select) {
        select.addEventListener('change', function () {
          var optionEl = select.options[select.selectedIndex];
          showSelectBalanceForRow(row, optionEl);
        });
      }

      if (createBtn) {
        createBtn.addEventListener('click', function () {
          stashPoCreationContext(row);
        });
      }
    });
  }

  function consumePendingPoLinkFromBilling() {
    var raw = sessionStorage.getItem('pendingPoBillingAttachment');
    if (!raw) return;
    sessionStorage.removeItem('pendingPoBillingAttachment');
    try {
      var info = JSON.parse(raw);
      if (!info || (!info.poId && !info.poNumber)) return;
      var row = null;
      if (info.itemId) row = document.querySelector('#missingPoBody .missing-po-row[data-row-item-id="' + info.itemId + '"]');
      if (!row && info.empCode) row = document.querySelector('#missingPoBody .missing-po-row[data-row-emp="' + info.empCode + '"]');
      if (!row) return;
      var select = row.querySelector('.missing-po-select');
      if (!select) return;
      var matched = false;
      Array.from(select.options).forEach(function (opt) {
        if (matched) return;
        if (info.poId && String(opt.value) === String(info.poId)) {
          select.value = opt.value;
          matched = true;
        } else if (info.poNumber && opt.getAttribute('data-po-number') === info.poNumber) {
          select.value = opt.value;
          matched = true;
        }
      });
      if (matched) {
        showSelectBalanceForRow(row, select.options[select.selectedIndex]);
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setRowStatus(row, 'warn', 'PO ' + (info.poNumber || '#' + info.poId) + ' was created but isn\'t in the dropdown yet. Refresh to reload candidates.');
      }
    } catch (e) { /* ignore */ }
  }

  function formatDurationDate(dateKey) {
    if (!dateKey) return '';
    var parts = String(dateKey).split('-');
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return Number(parts[2]) + '-' + (months[Math.max(0, Math.min(11, Number(parts[1]) - 1))] || parts[1]) + '-' + parts[0];
  }

  function toDateKey(value) {
    if (!value) return null;
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  }

  function normalizeServiceDuration(status, note, billingMonth, chargingDate) {
    if (status !== 'Outside SOW Role Duration') return status;
    var match = String(note || '').match(/SOW role duration\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|open)\s+to\s+([0-9]{4}-[0-9]{2}-[0-9]{2}|open)/i);
    if (!match || !billingMonth || String(billingMonth).length < 6) return status;
    var year = Number(String(billingMonth).slice(0, 4));
    var month = Number(String(billingMonth).slice(4, 6));
    var monthStart = year + '-' + String(month).padStart(2, '0') + '-01';
    var monthEnd = new Date(year, month, 0).toISOString().slice(0, 10);
    var roleStart = match[1] === 'open' ? monthStart : match[1];
    var roleEnd = match[2] === 'open' ? monthEnd : match[2];
    var start = [monthStart, roleStart, toDateKey(chargingDate)].filter(Boolean).sort().pop();
    var end = [monthEnd, roleEnd].filter(Boolean).sort()[0];
    if (!start || !end || start > end) return status;
    return formatDurationDate(start) + ' to ' + formatDurationDate(end);
  }

  function normalizeItems(items) {
    return (items || []).map(function (item) {
      var billingMonth = item.billing_month || currentBillingMonth || '';
      return {
        client_name: item.client_name,
        client_abbreviation: item.client_abbreviation || item.abbreviation || '',
        emp_code: item.emp_code,
        emp_name: item.emp_name,
        reporting_manager: item.reporting_manager,
        monthly_rate: item.monthly_rate,
        allowed_leaves: item.allowed_leaves !== undefined ? item.allowed_leaves : item.leaves_allowed,
        leaves_taken: item.leaves_taken,
        days_present: item.days_present,
        billing_hours: item.billing_hours,
        billing_method: item.billing_method,
        billing_status: normalizeServiceDuration(item.billing_status, item.billing_note, billingMonth, item.charging_date),
        billing_note: item.billing_note,
        service_description: item.service_description || item.role_position || '',
        role_position: item.role_position || item.service_description || '',
        chargeable_days: item.chargeable_days,
        invoice_amount: item.invoice_amount,
        po_id: item.po_id || null,
        po_number: item.po_number || null,
        client_id: item.client_id || null,
        sow_id: item.sow_id || null,
        sow_number: item.sow_number || null,
        quote_id: item.quote_id || null,
        quote_number: item.quote_number || null,
        billing_month: billingMonth,
        id: item.id || null,
        approval_status: item.approval_status || 'Pending',
        approved_at: item.approved_at || null,
        approved_by_manager: item.approved_by_manager || null,
        po_consumed_at: item.po_consumed_at || null
      };
    });
  }

  function deriveClientLabel(summary, items, errors, runClientId) {
    var fromSummary = summary && (summary.clientLabel || summary.client_label);
    if (fromSummary) return fromSummary;
    var summaryList = summary && (summary.clientAbbreviations || summary.client_abbreviations);
    if (summaryList && summaryList.length) return summaryList.join(', ');
    var seen = {};
    var labels = [];
    (items || []).concat(errors || []).forEach(function (item) {
      var label = String(item.client_abbreviation || '').trim();
      var key = label.toLowerCase();
      if (!label || seen[key]) return;
      seen[key] = true;
      labels.push(label);
    });
    if (labels.length) return labels.join(', ');
    var client = runClientId ? billingClientMap[String(runClientId)] : null;
    if (client) return client.abbreviation || getClientDisplayName(client);
    return labels.length ? labels.join(', ') : '-';
  }

  function formatDateWithTime(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
    var datePart = formatDate(value);
    var timePart = date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return '<div class="leading-relaxed"><div>' + escapeHtml(datePart) + '</div><div class="table-cell-secondary">' + escapeHtml(timePart) + '</div></div>';
  }

  function getErrorEmpName(errorItem) {
    if (!errorItem) return '-';
    if (errorItem.emp_name) return errorItem.emp_name;
    var match = String(errorItem.error_message || '').match(/\(([^)]+)\)/);
    return match ? match[1] : '-';
  }

  function getErrorClient(errorItem) {
    if (!errorItem) return '-';
    if (errorItem.client_abbreviation) return errorItem.client_abbreviation;
    if (errorItem.abbreviation) return errorItem.abbreviation;
    if (errorItem.client_name) return errorItem.client_name;
    if (errorItem.client_id && billingClientMap[String(errorItem.client_id)]) {
      var client = billingClientMap[String(errorItem.client_id)];
      return client.abbreviation || getClientDisplayName(client);
    }
    return '-';
  }

  function cleanErrorMessage(message) {
    var text = String(message || '').trim();
    var isWarning = /^WARNING:/i.test(text);
    var clean = text.replace(/^WARNING:\s*/i, '').trim();
    if (/found in Rate Card but missing in Attendance/i.test(clean) || /No attendance record found/i.test(clean)) {
      clean = 'Attendance not found';
    } else if (/found in Attendance but missing in Rate Card/i.test(clean)) {
      clean = 'Rate card not found';
    } else if (/has no PO assignment/i.test(clean)) {
      clean = 'PO not assigned';
    } else if (/charging date .* after billing month/i.test(clean)) {
      clean = 'Charging date after service month';
    } else if (/SOW role duration is not active/i.test(clean)) {
      clean = 'SOW role inactive for service month';
    } else if (/Missing sow_number/i.test(clean)) {
      clean = 'SOW missing';
    } else if (/Invalid monthly_rate/i.test(clean)) {
      clean = 'Invalid monthly rate';
    } else if (/Invalid leaves_allowed/i.test(clean)) {
      clean = 'Invalid allowed leaves';
    } else if (/Missing emp_code/i.test(clean)) {
      clean = 'Employee code missing';
    }
    return isWarning && clean.indexOf('WARNING:') !== 0 ? 'WARNING: ' + clean : clean;
  }

  function managerKey(value) {
    return String(value || 'Unassigned').trim() || 'Unassigned';
  }

  function monthLabel(value) {
    var raw = String(value || '');
    if (/^\d{6}$/.test(raw)) {
      var year = raw.slice(0, 4);
      var month = parseInt(raw.slice(4, 6), 10) - 1;
      return new Date(Number(year), month, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
    }
    return raw || '-';
  }

  function serviceDescriptionHtml(item) {
    return escapeHtml(buildServiceDescription(item)).replace(/\n/g, '<br>');
  }

  function sowNumberLabel(value) {
    var raw = String(value || '').trim();
    if (!raw) return 'Not linked';
    return raw.replace(/^sow\s*(no\.?|#)?\s*/i, '').trim() || raw;
  }

  function buildServiceDescription(item) {
    var role = String(item.service_description || item.role_position || 'Service').trim();
    var roleLine = /\bservices$/i.test(role) ? role : role + ' services';
    var candidate = item.emp_name || 'Candidate';
    return roleLine + ' for\nSow no. ' + sowNumberLabel(item.sow_number) + ' (' + candidate + ')';
  }

  function uniqueJoined(values, separator) {
    var seen = {};
    return (values || []).map(function (value) {
      return String(value || '').trim();
    }).filter(function (value) {
      var key = value.toLowerCase();
      if (!value || seen[key]) return false;
      seen[key] = true;
      return true;
    }).join(separator || ', ');
  }

  function uniqueValues(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (v) {
      var s = String(v == null ? '' : v).trim();
      if (!s) return;
      var key = s.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(s);
    });
    return out;
  }

  function aggregateManagerRows(rows) {
    var map = {};
    (rows || []).forEach(function (item) {
      var key = [
        String(item.reporting_manager || 'Unassigned').trim().toLowerCase(),
        String(item.emp_code || '').trim().toLowerCase(),
        String(item.emp_name || '').trim().toLowerCase()
      ].join('|');
      if (!map[key]) {
        map[key] = Object.assign({}, item, {
          invoice_amount: 0,
          billing_hours: item.billing_hours !== null && item.billing_hours !== undefined ? 0 : null,
          _sowNumbers: [],
          _poNumbers: [],
          _quoteNumbers: [],
          _serviceDescriptions: []
        });
      }
      map[key].invoice_amount = Math.round(((parseFloat(map[key].invoice_amount) || 0) + (parseFloat(item.invoice_amount) || 0)) * 100) / 100;
      if (map[key].billing_hours !== null) {
        map[key].billing_hours = Math.round(((parseFloat(map[key].billing_hours) || 0) + (parseFloat(item.billing_hours) || 0)) * 100) / 100;
      }
      map[key]._sowNumbers.push(item.sow_number);
      map[key]._poNumbers.push(item.po_number);
      map[key]._quoteNumbers.push(item.quote_number);
      map[key]._serviceDescriptions.push(item.service_description || item.role_position);
    });
    return Object.keys(map).map(function (key) {
      var item = map[key];
      var serviceDescription = uniqueJoined(item._serviceDescriptions) || item.service_description || item.role_position;
      var sowNumber = uniqueJoined(item._sowNumbers.map(sowNumberLabel), ' & ');
      var poNumber = uniqueJoined(item._poNumbers, ' & ');
      var quoteNumber = uniqueJoined(item._quoteNumbers, ' & ');
      return Object.assign({}, item, {
        service_description: serviceDescription,
        role_position: serviceDescription,
        sow_number: sowNumber,
        po_number: poNumber,
        quote_number: quoteNumber
      });
    });
  }

  function isSgtcBillingItem(item) {
    return item && item.billing_method === 'sgtc_hours';
  }

  function toTwoDecimalInput(value) {
    var number = Math.max(Number(value || 0), 0);
    if (!Number.isFinite(number)) return 0;
    return Math.trunc(number * 100) / 100;
  }

  function sgtcBillingHours(leavesTaken, leavesAllowed, effectiveDays) {
    var leaves = Number(leavesTaken || 0);
    var allowed = Number(leavesAllowed || 0);
    var activeDays = Number(effectiveDays || 0);
    var baseHours = Math.min(toTwoDecimalInput(activeDays * 8.5), 170);
    var extraLeaveDays = Math.max(leaves - allowed, 0);
    return Math.max(toTwoDecimalInput(baseHours - (extraLeaveDays * 8.5)), 0);
  }

  function managerApproved(rows) {
    return rows.length > 0 && rows.every(function (item) { return item.approval_status === 'Accepted'; });
  }

  function managerClientLabel(rows) {
    return uniqueJoined((rows || []).map(function (item) {
      return item.client_abbreviation || item.client_name || '';
    })) || '-';
  }

  function downloadManagerAttendance(managerName) {
    if (!currentRunId) return;
    downloadFile('/api/billing/runs/' + currentRunId + '/manager-attendance?manager=' + encodeURIComponent(managerName || ''));
  }

  function renderManagerApprovals(items) {
    var section = document.getElementById('managerApprovalSection');
    var body = document.getElementById('managerApprovalBody');
    var groups = {};
    (items || []).forEach(function (item) {
      var key = managerKey(item.reporting_manager);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    var names = Object.keys(groups).sort();
    if (names.length === 0) {
      section.classList.add('hidden');
      body.innerHTML = '';
      return;
    }

    managerGroups = groups;
    body.innerHTML = names.map(function (name) {
      var rows = groups[name];
      var total = rows.reduce(function (sum, item) { return sum + (parseFloat(item.invoice_amount) || 0); }, 0);
      var pending = rows.filter(function (item) { return item.approval_status === 'Pending'; }).length;
      var accepted = rows.filter(function (item) { return item.approval_status === 'Accepted'; }).length;
      var rejected = rows.filter(function (item) { return item.approval_status === 'Rejected'; }).length;
      var approved = managerApproved(rows);
      var clientLabel = managerClientLabel(rows);
      var statusText = accepted + ' accepted';
      if (pending) statusText += ', ' + pending + ' pending';
      if (rejected) statusText += ', ' + rejected + ' rejected';
      var uniquePos = uniqueValues(rows.map(function (r) { return r.po_number; }));
      var uniqueSows = uniqueValues(rows.map(function (r) { return r.sow_number; }));
      var uniqueQuotes = uniqueValues(rows.map(function (r) { return r.quote_number; }));
      var missingPos = rows.filter(function (r) { return !r.po_number; }).length;
      var chipsHtml = '<div class="flex flex-wrap items-center gap-1.5 text-[11px]">' +
        '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">' + uniquePos.length + ' PO' + (uniquePos.length === 1 ? '' : 's') + (missingPos > 0 ? ' <span class="text-error font-semibold">· ' + missingPos + ' missing</span>' : '') + '</span>' +
        '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">' + uniqueSows.length + ' SOW' + (uniqueSows.length === 1 ? '' : 's') + '</span>' +
        '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant">' + uniqueQuotes.length + ' Quote' + (uniqueQuotes.length === 1 ? '' : 's') + '</span>' +
      '</div>';
      var actionHtml = approved
        ? '<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">' +
            '<span class="badge-success inline-flex items-center justify-center">Approved</span>' +
            '<button type="button" class="btn-secondary btn-sm manager-attendance-btn" data-manager="' + escapeHtml(name) + '">Download Attendance</button>' +
            '<button type="button" class="btn-secondary btn-sm manager-view-btn" data-manager="' + escapeHtml(name) + '">View</button>' +
          '</div>'
        : '<div class="grid grid-cols-1 sm:grid-cols-5 gap-2">' +
            '<button type="button" class="btn-primary btn-sm manager-approve-btn" data-manager="' + escapeHtml(name) + '">Approve</button>' +
            '<button type="button" class="btn-secondary btn-sm manager-edit-btn" data-manager="' + escapeHtml(name) + '">Edit Request</button>' +
            '<button type="button" class="btn-secondary btn-sm manager-mail-btn" data-manager="' + escapeHtml(name) + '">Send Mail</button>' +
            '<button type="button" class="btn-secondary btn-sm manager-attendance-btn" data-manager="' + escapeHtml(name) + '">Download Attendance</button>' +
            '<button type="button" class="btn-secondary btn-sm manager-view-btn" data-manager="' + escapeHtml(name) + '">View</button>' +
          '</div>';
      return '<div class="rounded-xl border border-outline-variant/15 bg-surface-container p-4 space-y-3">' +
        '<div class="flex items-start justify-between gap-3">' +
          '<div><div class="text-xs text-on-surface-variant">Reporting Manager</div><div class="font-semibold text-on-surface">' + escapeHtml(name) + '</div><div class="mt-1 text-xs text-on-surface-variant">Client: <span class="font-semibold text-on-surface">' + escapeHtml(clientLabel) + '</span></div></div>' +
          '<div class="text-right"><div class="text-xs text-on-surface-variant">Amount</div><div class="font-semibold">' + formatCurrency(total) + '</div></div>' +
        '</div>' +
        '<div class="text-xs text-on-surface-variant">' + rows.length + ' candidate(s) | ' + escapeHtml(statusText) + '</div>' +
        chipsHtml +
        actionHtml +
      '</div>';
    }).join('');
    section.classList.remove('hidden');
  }

  window.closeManagerViewModal = function () {
    closeModal('managerViewModal');
  };

  window.closeManagerEditModal = function () {
    closeModal('managerEditModal');
  };

  window.closeManagerMailModal = function () {
    closeModal('managerMailModal');
  };

  window.closeConnectionMapModal = function () {
    closeModal('connectionMapModal');
  };

  function openConnectionMap() {
    var items = currentBillingItems || [];
    if (items.length === 0) {
      showToast('Generate or load a service request first', 'warning');
      return;
    }
    // Group: quote_number → sow_number → po_number → [items]
    var tree = {};
    items.forEach(function (it) {
      var q = it.quote_number || '__noquote__';
      var s = it.sow_number || '__nosow__';
      var p = it.po_number || '__nopo__';
      if (!tree[q]) tree[q] = {};
      if (!tree[q][s]) tree[q][s] = {};
      if (!tree[q][s][p]) tree[q][s][p] = [];
      tree[q][s][p].push(it);
    });

    var quotes = Object.keys(tree).sort(function (a, b) {
      if (a === '__noquote__') return 1;
      if (b === '__noquote__') return -1;
      return String(a).localeCompare(String(b));
    });

    var html = quotes.map(function (q) {
      var qLabel = q === '__noquote__'
        ? '<span class="text-error font-semibold">No Quote linked</span>'
        : '<a href="#quotes" class="inline-flex items-center gap-1 text-tertiary font-semibold hover:underline no-underline">Quote ' + escapeHtml(q) + '</a>';
      var sowKeys = Object.keys(tree[q]).sort();
      var sowsHtml = sowKeys.map(function (s) {
        var sLabel = s === '__nosow__'
          ? '<span class="text-error font-semibold">No SOW linked</span>'
          : '<a href="#sows" class="inline-flex items-center gap-1 text-accent font-semibold hover:underline no-underline">SOW ' + escapeHtml(s) + '</a>';
        var poKeys = Object.keys(tree[q][s]).sort();
        var posHtml = poKeys.map(function (p) {
          var pLabel = p === '__nopo__'
            ? '<span class="inline-flex items-center gap-1 text-error font-semibold"><span class="material-symbols-outlined text-[14px]">error</span>No PO linked</span>'
            : '<a href="#purchase-orders" class="inline-flex items-center gap-1 text-primary font-semibold hover:underline no-underline">PO ' + escapeHtml(p) + '</a>';
          var candidates = tree[q][s][p];
          var poTotal = candidates.reduce(function (sum, c) { return sum + (parseFloat(c.invoice_amount) || 0); }, 0);
          var candidatesHtml = candidates.map(function (c) {
            return '<div class="flex items-center justify-between gap-2 pl-6 py-1 text-xs">' +
              '<span><span class="font-semibold text-on-surface">' + escapeHtml(c.emp_code || '') + ' — ' + escapeHtml(c.emp_name || '') + '</span>' +
              '<span class="text-on-surface-variant"> · ' + escapeHtml(c.reporting_manager || 'Unassigned') + '</span></span>' +
              '<span class="font-semibold">' + formatCurrency(c.invoice_amount || 0) + '</span>' +
            '</div>';
          }).join('');
          return '<div class="pl-5 mt-2 border-l-2 border-outline-variant/30 ml-2">' +
            '<div class="flex items-center justify-between gap-2 text-xs">' + pLabel + '<span class="text-on-surface-variant">' + candidates.length + ' candidate' + (candidates.length === 1 ? '' : 's') + ' · ' + formatCurrency(poTotal) + '</span></div>' +
            candidatesHtml +
          '</div>';
        }).join('');
        return '<div class="pl-3 mt-2 border-l-2 border-outline-variant/20 ml-2">' +
          '<div class="text-sm">' + sLabel + '</div>' +
          posHtml +
        '</div>';
      }).join('');
      return '<div class="rounded-xl border border-outline-variant/15 bg-surface-container p-4">' +
        '<div class="text-sm font-bold">' + qLabel + '</div>' +
        sowsHtml +
      '</div>';
    }).join('');

    document.getElementById('connectionMapBody').innerHTML = html || '<div class="text-center text-on-surface-variant py-6">No items to map</div>';
    openModal('connectionMapModal');
  }

  var connectionMapBtn = document.getElementById('btnConnectionMap');
  if (connectionMapBtn) connectionMapBtn.addEventListener('click', openConnectionMap);

  function openManagerMail(managerName) {
    document.getElementById('managerMailForm').reset();
    document.getElementById('managerMailManagerName').value = managerName;
    document.getElementById('managerMailSubtitle').textContent = 'Create a draft for ' + managerName;
    document.getElementById('managerMailSubjectPreview').textContent = 'Attendance Sheet and Service Request for ' + monthLabel(currentBillingMonth);
    openModal('managerMailModal');
  }

  function linkagePillsHtml(item) {
    var pills = [];
    if (item.po_number) {
      pills.push('<a href="#purchase-orders" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-semibold no-underline hover:bg-primary/20" title="View Purchase Orders">' + escapeHtml(item.po_number) + '</a>');
    } else {
      pills.push('<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-error/10 text-error text-[11px] font-semibold" title="No PO linked"><span class="material-symbols-outlined text-[12px]">error</span>No PO</span>');
    }
    if (item.sow_number) {
      pills.push('<a href="#sows" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-accent/10 text-accent text-[11px] font-semibold no-underline hover:bg-accent/20" title="View SOWs">' + escapeHtml(item.sow_number) + '</a>');
    }
    if (item.quote_number) {
      pills.push('<a href="#quotes" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-tertiary/10 text-tertiary text-[11px] font-semibold no-underline hover:bg-tertiary/20" title="View Quotes">' + escapeHtml(item.quote_number) + '</a>');
    }
    return '<div class="flex flex-wrap gap-1">' + pills.join('') + '</div>';
  }

  function openManagerView(managerName) {
    var rows = aggregateManagerRows(managerGroups[managerName] || []);
    var showHoursColumn = rows.some(isSgtcBillingItem);
    document.getElementById('managerViewHoursHeader').classList.toggle('hidden', !showHoursColumn);
    document.getElementById('managerViewTitle').textContent = 'Manager Summary: ' + managerName;
    document.getElementById('managerViewBody').innerHTML = rows.map(function (item, index) {
      var hours = isSgtcBillingItem(item) && item.billing_hours !== null && item.billing_hours !== undefined
        ? item.billing_hours
        : '-';
      return '<tr>' +
        '<td class="text-center">' + (index + 1) + '</td>' +
        '<td>' + serviceDescriptionHtml(item) + '</td>' +
        '<td class="text-center">' + escapeHtml(managerName) + '</td>' +
        '<td>' + linkagePillsHtml(item) + '</td>' +
        (showHoursColumn ? '<td class="text-center">' + escapeHtml(String(hours)) + '</td>' : '') +
        '<td class="text-center">' + escapeHtml(monthLabel(currentBillingMonth || item.billing_month || '')) + '</td>' +
        '<td class="text-right">' + formatCurrency(item.invoice_amount || 0) + '</td>' +
      '</tr>';
    }).join('');
    openModal('managerViewModal');
  }

  function fillManagerEditCandidate(item) {
    if (!item) return;
    var isSgtc = isSgtcBillingItem(item);
    managerEditSyncBaseDays = toTwoDecimalInput(Number(item.days_present || 0) + Number(item.leaves_taken || 0));
    managerEditLeavesAllowed = toTwoDecimalInput(item.allowed_leaves !== undefined ? item.allowed_leaves : item.leaves_allowed);
    document.getElementById('managerEditItemId').value = item.id;
    document.getElementById('managerEditPresent').value = item.days_present || 0;
    document.getElementById('managerEditLeaves').value = item.leaves_taken || 0;
    document.getElementById('managerEditHours').value = item.billing_hours !== null && item.billing_hours !== undefined ? item.billing_hours : '';
    document.getElementById('managerEditHoursField').classList.toggle('hidden', !isSgtc);
    document.getElementById('managerEditHours').disabled = !isSgtc;
    document.getElementById('managerEditMeta').innerHTML =
      '<div><strong>' + escapeHtml(item.emp_code || '') + ' - ' + escapeHtml(item.emp_name || '') + '</strong></div>' +
      '<div class="mt-1">' + serviceDescriptionHtml(item) + '</div>' +
      '<div class="mt-1">Current amount: ' + formatCurrency(item.invoice_amount || 0) + '</div>' +
      (isSgtc
        ? '<div class="mt-1">SGTC hourly billing: billing hours drive the amount.</div>'
        : '<div class="mt-1">Non-SGTC billing: leaves taken drive the amount; billing hours are not used.</div>');
  }

  function openManagerEdit(managerName) {
    var rows = (managerGroups[managerName] || []).filter(function (item) { return item.approval_status !== 'Accepted'; });
    if (rows.length === 0) {
      showToast('Approved manager requests cannot be edited', 'warning');
      return;
    }
    var select = document.getElementById('managerEditCandidate');
    select.innerHTML = rows.map(function (item) {
      return '<option value="' + item.id + '">' + escapeHtml(item.emp_code + ' - ' + item.emp_name) + '</option>';
    }).join('');
    select.onchange = function () {
      var itemId = this.value;
      fillManagerEditCandidate(rows.find(function (item) { return String(item.id) === String(itemId); }));
    };
    fillManagerEditCandidate(rows[0]);
    openModal('managerEditModal');
  }

  function showResults(data) {
    var resultsEl = document.getElementById('billingResults');
    resultsEl.classList.remove('hidden');

    currentRunId = data.billingRunId || data.id || null;
    currentRequestStatus = data.requestStatus || data.request_status || 'Pending';
    currentPoCandidatesByEmp = data.poCandidatesByEmp || {};
    currentBillingMonth = (data.summary && (data.summary.billingMonth || data.summary.billing_month)) || data.billing_month || '';
    var blockedByErrors = !!data.blockedByErrors;

    document.getElementById('resTotalEmp').textContent = data.summary.totalEmployees;
    document.getElementById('resTotalAmount').textContent = formatCurrency(data.summary.totalAmount);
    document.getElementById('resErrors').textContent = data.summary.errorCount;
    document.getElementById('resDays').textContent = data.summary.daysInMonth;
    setDownloadLinks(currentRunId, data.downloadUrl);

    var items = normalizeItems(data.billingItems || data.items || []);
    var errors = data.errors || [];
    currentBillingItems = items;
    var clientLabel = deriveClientLabel(data.summary, items, errors, data.client_id || data.clientId || null);
    document.getElementById('resClients').textContent = clientLabel;
    document.getElementById('resClients').title = clientLabel;
    var itemsBody = document.getElementById('billingItemsBody');
    if (items.length === 0) {
      itemsBody.innerHTML = '<tr><td colspan="13" class="text-center text-on-surface-variant py-6">No service request items</td></tr>';
    } else {
      itemsBody.innerHTML = items.map(function (i) {
        var billingHours = i.billing_hours !== null && i.billing_hours !== undefined ? i.billing_hours : '-';
        var clientDisplay = i.client_abbreviation || i.client_name || '';
        return '<tr>' +
          '<td title="' + escapeHtml(i.client_name || clientDisplay) + '">' + escapeHtml(clientDisplay) + '</td>' +
          '<td>' + escapeHtml(i.emp_code) + '</td>' +
          '<td>' + escapeHtml(i.emp_name) + '</td>' +
          '<td>' + escapeHtml(i.reporting_manager || '') + '</td>' +
          '<td class="text-right">' + formatCurrency(i.monthly_rate) + '</td>' +
          '<td class="text-center">' + i.allowed_leaves + '</td>' +
          '<td class="text-center">' + i.leaves_taken + '</td>' +
          '<td class="text-center">' + (i.days_present !== undefined && i.days_present !== null ? i.days_present : '-') + '</td>' +
          '<td class="text-center">' + billingHours + '</td>' +
          '<td class="text-center">' + escapeHtml(i.billing_status || 'Active') + '</td>' +
          '<td class="text-center">' + statusBadge(i.approval_status || 'Pending') + '</td>' +
          '<td class="text-center">' + i.chargeable_days + '</td>' +
          '<td class="text-right font-bold">' + formatCurrency(i.invoice_amount) + '</td>' +
          '</tr>';
      }).join('');
    }

    var errorsCard = document.getElementById('errorsCard');
    var errorsBody = document.getElementById('errorsBody');
    if (errors.length > 0) {
      errorsCard.classList.remove('hidden');
      errorsBody.innerHTML = errors.map(function (e) {
        return '<tr><td>' + escapeHtml(e.emp_code || '-') + '</td><td>' + escapeHtml(getErrorEmpName(e)) + '</td><td>' + escapeHtml(getErrorClient(e)) + '</td><td>' + escapeHtml(cleanErrorMessage(e.error_message)) + '</td></tr>';
      }).join('');
    } else {
      errorsCard.classList.add('hidden');
      errorsBody.innerHTML = '';
    }

    var decisionCard = document.getElementById('decisionCard');
    if (blockedByErrors) {
      decisionCard.classList.remove('hidden');
      document.getElementById('decisionActions').classList.add('hidden');
      var message = document.getElementById('decisionStatusMessage');
      message.classList.remove('hidden');
      message.className = 'text-sm font-semibold text-error';
      message.textContent = 'Errors found. Please check the error report before generating a service request.';
      document.getElementById('decisionHelpText').textContent = 'No service request was generated because the validation step found errors.';
      document.getElementById('missingPoSection').classList.add('hidden');
      document.getElementById('missingPoBody').innerHTML = '';
      document.getElementById('managerApprovalSection').classList.add('hidden');
      document.getElementById('managerApprovalBody').innerHTML = '';
    } else if (currentRequestStatus === 'Pending' || currentRequestStatus === 'Partially Accepted') {
      decisionCard.classList.remove('hidden');
      updateDecisionPresentation(currentRequestStatus);
      setDecisionButtonsEnabled(true);
      renderMissingPoInputs(items, currentPoCandidatesByEmp);
      renderManagerApprovals(items);
    } else {
      decisionCard.classList.remove('hidden');
      updateDecisionPresentation(currentRequestStatus);
      setDecisionButtonsEnabled(false);
      document.getElementById('missingPoSection').classList.add('hidden');
      document.getElementById('missingPoBody').innerHTML = '';
      renderManagerApprovals(items);
    }
  }

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      billingClientMap = {};
      (res.data || []).forEach(function (client) {
        billingClientMap[String(client.id)] = client;
      });
      renderClientCheckboxPicker(res.data || []);
    } catch (e) { /* ignore */ }
  }

  async function reviewRun(id) {
    try {
      var res = await apiCall('GET', '/api/billing/runs/' + id);
      var run = res.data;
      showResults({
        id: run.id,
        billingRunId: run.id,
        billing_month: run.billing_month,
        client_id: run.client_id || null,
        summary: {
          totalEmployees: run.total_employees,
          totalAmount: run.total_amount,
          errorCount: run.error_count,
          daysInMonth: run.items && run.items.length > 0 ? run.items[0].days_in_month : 0,
          billingMonth: run.billing_month,
          clientLabel: run.clientLabel || run.client_label || ''
        },
        errors: run.errors || [],
        billingItems: run.items || [],
        requestStatus: run.request_status || 'Pending',
        downloadUrl: '/api/billing/runs/' + run.id + '/download',
        poCandidatesByEmp: run.poCandidatesByEmp || {}
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async function loadHistory() {
    var tbody = document.getElementById('billingHistoryBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/billing/runs');
      var approvalMap = {};
      try { approvalMap = await loadMyPendingApprovalMap('billing'); } catch (_e) {}
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8">' +
          '<div class="flex flex-col items-center gap-2 text-on-surface-variant">' +
          '<span class="material-symbols-outlined text-4xl opacity-40">inbox</span>' +
          '<h6 class="text-sm font-semibold">No service requests yet</h6>' +
          '<p class="text-xs">Generate your first service request to see it here</p></div></td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (r) {
          var pendingDelete = approvalMap['billing_run:' + r.id];
          var deleteBtn;
          if (pendingDelete) {
            deleteBtn = '<button disabled class="btn-secondary btn-sm inline-flex items-center gap-1 opacity-50 cursor-not-allowed" title="Delete request pending admin approval"><span class="material-symbols-outlined text-base">hourglass_top</span></button>';
          } else {
            deleteBtn = '<button onclick="window.deleteServiceRequest(' + r.id + ')" class="btn-secondary btn-sm inline-flex items-center gap-1 text-error" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>';
          }
          var actions = '<div class="inline-flex items-center gap-1">' +
            '<button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download\')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Download"><span class="material-symbols-outlined text-base">download</span></button>' +
            '<button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download/billing_working\')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Service Request"><span class="material-symbols-outlined text-base">table_view</span></button>' +
            '<button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download/manager_summary\')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Manager Approval Request"><span class="material-symbols-outlined text-base">table_chart</span></button>' +
            '<button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download/error_report\')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Error Report"><span class="material-symbols-outlined text-base">warning</span></button>' +
            '<button onclick="window.reviewServiceRequest(' + r.id + ')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Review"><span class="material-symbols-outlined text-base">visibility</span></button>' +
            deleteBtn +
          '</div>';
          var statusCellExtra = pendingDelete ? '<div class="mt-1">' + adminApprovalAwaitedBadge(pendingDelete) + '</div>' : '';
          return '<tr>' +
            '<td><strong>' + escapeHtml(r.billing_month) + '</strong></td>' +
            '<td>' + (r.clientLabel || r.client_label || r.client_abbreviation
              ? '<span class="entity-pill">' + escapeHtml(r.clientLabel || r.client_label || r.client_abbreviation) + '</span>'
              : '') + '</td>' +
            '<td class="text-center">' + r.total_employees + '</td>' +
            '<td class="text-right">' + formatCurrency(r.total_amount) + '</td>' +
            '<td class="text-center">' + (r.error_count > 0 ? '<span class="badge-error">' + r.error_count + '</span>' : '<span class="badge-success">0</span>') + '</td>' +
            '<td>' + statusBadge(r.request_status || 'Pending') + statusCellExtra + '</td>' +
            '<td>' + formatDateWithTime(r.created_at) + '</td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
        }).join('');
      }
    } catch (e) { /* ignore */ }
  }

  window.deleteServiceRequest = async function (id) {
    var isAdmin = typeof getCurrentUserIsAdmin === 'function' && getCurrentUserIsAdmin();
    var message = isAdmin
      ? 'Are you sure you want to delete this service request? This will reverse any PO consumption tied to it and cannot be undone.'
      : 'Are you sure you want to delete this service request? This action requires admin approval.';
    var confirmed = await confirmAction('Delete Service Request', message);
    if (!confirmed) return;
    try {
      var res = await apiCall('DELETE', '/api/billing/runs/' + id);
      if (handleApprovalResponse(res, loadHistory)) return;
      showToast('Service request deleted', 'success');
      loadHistory();
    } catch (err) {
      showToast(err.message || 'Failed to delete service request', 'danger');
    }
  };

  async function generateRequest(endpoint, body, isFormData) {
    var res = await apiCall('POST', endpoint, body);
    if (res.data && res.data.blockedByErrors) {
      showToast('Errors found. Check the error report before proceeding.', 'warning');
    } else {
      showToast('Service request generated successfully!', 'success');
    }
    showResults(res.data);
    loadHistory();
    return res;
  }

  async function decideCurrentRun(decision, approvedManagers) {
    if (!currentRunId) return;
    if (decision === 'Accepted') {
      var managerList = (approvedManagers || []).filter(Boolean);
      var message = managerList.length > 0
        ? 'Please confirm you are approving the service request items for the correct reporting manager: ' + managerList.join(', ') + '. PO consumption will be applied only for this manager group.'
        : 'Please confirm you have checked all reporting manager approvals. This will approve all pending service request items and apply PO consumption for them.';
      var confirmed = await confirmAction('Confirm Manager Approval', message);
      if (!confirmed) return;
    }
    setDecisionButtonsEnabled(false);
    try {
      var poAssignments = [];
      document.querySelectorAll('#missingPoBody .missing-po-row').forEach(function (row) {
        var select = row.querySelector('.missing-po-select');
        if (!select) return;
        var empCode = row.getAttribute('data-row-emp');
        var itemId = row.getAttribute('data-row-item-id');
        var selectedPoId = select.value.trim() ? parseInt(select.value.trim(), 10) : null;
        if (selectedPoId) {
          poAssignments.push({
            emp_code: empCode,
            item_id: itemId ? parseInt(itemId, 10) : null,
            po_id: selectedPoId
          });
        }
      });

      var res = await apiCall('POST', '/api/billing/runs/' + currentRunId + '/decision', {
        decision: decision,
        poAssignments: poAssignments,
        approvedManagers: approvedManagers || []
      });
      currentRequestStatus = res.data.requestStatus;
      showToast('Service request ' + currentRequestStatus.toLowerCase(), currentRequestStatus === 'Accepted' ? 'success' : 'warning');
      setDecisionButtonsEnabled(false);
      await reviewRun(currentRunId);
      loadHistory();
    } catch (err) {
      showToast(err.message, 'danger');
      setDecisionButtonsEnabled(true);
    }
  }

  window.approveManagerGroup = function (managerName) {
    decideCurrentRun('Accepted', [managerName]);
  };

  document.getElementById('managerApprovalBody').addEventListener('click', function (e) {
    var btn = e.target.closest('.manager-approve-btn');
    if (btn && !btn.disabled) {
      window.approveManagerGroup(btn.getAttribute('data-manager') || '');
      return;
    }
    var editBtn = e.target.closest('.manager-edit-btn');
    if (editBtn) {
      openManagerEdit(editBtn.getAttribute('data-manager') || '');
      return;
    }
    var mailBtn = e.target.closest('.manager-mail-btn');
    if (mailBtn) {
      openManagerMail(mailBtn.getAttribute('data-manager') || '');
      return;
    }
    var attendanceBtn = e.target.closest('.manager-attendance-btn');
    if (attendanceBtn) {
      downloadManagerAttendance(attendanceBtn.getAttribute('data-manager') || '');
      return;
    }
    var viewBtn = e.target.closest('.manager-view-btn');
    if (viewBtn) {
      openManagerView(viewBtn.getAttribute('data-manager') || '');
    }
  });

  function syncManagerEditAttendance(source) {
    if (managerEditSyncing) return;
    managerEditSyncing = true;
    var presentEl = document.getElementById('managerEditPresent');
    var leavesEl = document.getElementById('managerEditLeaves');
    var hoursEl = document.getElementById('managerEditHours');
    if (source === 'leaves') {
      var leaves = Math.min(toTwoDecimalInput(leavesEl.value), managerEditSyncBaseDays);
      leavesEl.value = leaves;
      presentEl.value = toTwoDecimalInput(managerEditSyncBaseDays - leaves);
    } else {
      var present = Math.min(toTwoDecimalInput(presentEl.value), managerEditSyncBaseDays);
      presentEl.value = present;
      leavesEl.value = toTwoDecimalInput(managerEditSyncBaseDays - present);
    }
    if (!hoursEl.disabled) {
      hoursEl.value = sgtcBillingHours(leavesEl.value, managerEditLeavesAllowed, managerEditSyncBaseDays);
    }
    managerEditSyncing = false;
  }

  document.getElementById('managerEditPresent').addEventListener('input', function () {
    syncManagerEditAttendance('present');
  });

  document.getElementById('managerEditLeaves').addEventListener('input', function () {
    syncManagerEditAttendance('leaves');
  });

  document.getElementById('managerEditForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var itemId = document.getElementById('managerEditItemId').value;
    if (!currentRunId || !itemId) return;
    try {
      var res = await apiCall('PATCH', '/api/billing/runs/' + currentRunId + '/items/' + itemId, {
        days_present: parseFloat(document.getElementById('managerEditPresent').value) || 0,
        leaves_taken: parseFloat(document.getElementById('managerEditLeaves').value) || 0,
        billing_hours: document.getElementById('managerEditHours').disabled || document.getElementById('managerEditHours').value === '' ? null : (parseFloat(document.getElementById('managerEditHours').value) || 0),
      });
      showToast('Candidate service request recalculated', 'success');
      closeManagerEditModal();
      if (res.data && res.data.run) {
        var run = res.data.run;
        showResults({
          id: run.id,
          billingRunId: run.id,
          billing_month: run.billing_month,
          summary: {
            totalEmployees: run.total_employees,
            totalAmount: run.total_amount,
            errorCount: run.error_count,
            daysInMonth: run.items && run.items.length > 0 ? run.items[0].days_in_month : 0,
            billingMonth: run.billing_month,
          },
          errors: run.errors || [],
          billingItems: run.items || [],
          requestStatus: run.request_status || res.data.requestStatus || 'Pending',
          downloadUrl: '/api/billing/runs/' + run.id + '/download',
          poCandidatesByEmp: run.poCandidatesByEmp || {},
        });
      } else {
        await reviewRun(currentRunId);
      }
      loadHistory();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  document.getElementById('managerMailForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!currentRunId) return;
    var managerName = document.getElementById('managerMailManagerName').value;
    var submitBtn = this.querySelector('button[type="submit"]');
    var originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="material-symbols-outlined text-base">hourglass_top</span> Creating Draft...';
    }
    try {
      var res = await apiCall('POST', '/api/billing/runs/' + currentRunId + '/manager-draft', {
        manager_name: managerName,
        to: document.getElementById('managerMailTo').value.trim(),
        cc: document.getElementById('managerMailCc').value.trim(),
      });
      var url = res.data && (res.data.webLink || res.data.composeUrl);
      if (url) {
        var opened = window.open(url, '_blank');
        if (!opened) {
          window.location.href = url;
        }
      }
      closeManagerMailModal();
      showToast('Draft created in Outlook Web', 'success');
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      }
    }
  });

  setupFileZone('rateCardZone', 'rateCardFile', 'rateCardFileName');
  setupFileZone('attendanceZone', 'attendanceFile', 'attendanceFileName');
  autoFillBillingMonth();

  document.getElementById('billingFileForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('btnGenerate');
    btn.disabled = true;
    btn.innerHTML = '<div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div> Processing...';

    try {
      var fd = new FormData();
      fd.append('rateCardFile', document.getElementById('rateCardFile').files[0]);
      fd.append('attendanceFile', document.getElementById('attendanceFile').files[0]);
      fd.append('billingMonth', monthInputToYYYYMM(document.getElementById('billingMonth').value.trim()));
      await generateRequest('/api/billing/generate', fd, true);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined">settings</span> Generate Service Request';
    }
  });

  document.getElementById('billingDbForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('btnGenerateDb');
    btn.disabled = true;
    btn.innerHTML = '<div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div> Processing...';

    try {
      var allToggle = document.getElementById('dbClientAll');
      var clientCheckboxes = Array.from(document.querySelectorAll('.db-client-checkbox'));
      var checkedClientIds = clientCheckboxes
        .filter(function (checkbox) { return checkbox.checked && checkbox.value; })
        .map(function (checkbox) { return parseInt(checkbox.value, 10); })
        .filter(function (value) { return Number.isInteger(value) && value > 0; });
      var clientIds = checkedClientIds.length > 0 || !(allToggle && allToggle.checked) ? checkedClientIds : [];
      var billingMonth = monthInputToYYYYMM(document.getElementById('dbBillingMonth').value.trim());
      var body = { billingMonth: billingMonth };
      if (clientIds.length > 0) body.clientIds = clientIds;
      await generateRequest('/api/billing/generate-from-db', body, false);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined">database</span> Generate Service Request';
    }
  });

  document.getElementById('acceptRequestBtn').addEventListener('click', function () {
    decideCurrentRun('Accepted');
  });

  document.getElementById('rejectRequestBtn').addEventListener('click', function () {
    decideCurrentRun('Rejected');
  });

  document.getElementById('resErrorsCard').addEventListener('click', function () {
    var target = document.getElementById('errorsCard');
    if (!target || target.classList.contains('hidden')) {
      showToast('No errors for this service request', 'info');
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  window.reviewServiceRequest = reviewRun;

  loadClients();
  loadHistory();
  consumePendingPoBillingReview();

  function consumePendingPoBillingReview() {
    var raw = sessionStorage.getItem('pendingPoBillingReview');
    if (!raw) return;
    sessionStorage.removeItem('pendingPoBillingReview');
    try {
      var info = JSON.parse(raw);
      if (info && info.runId) reviewRun(info.runId);
    } catch (e) { /* ignore */ }
  }
})();
