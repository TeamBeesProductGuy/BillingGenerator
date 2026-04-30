(function () {
  var leaveCalendarState = {};

  function setupUploadZone(zoneId, inputId, nameId) {
    var zone = document.getElementById(zoneId);
    var input = document.getElementById(inputId);
    var nameEl = document.getElementById(nameId);
    if (!zone || !input) return;

    ['dragenter', 'dragover'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) {
        e.preventDefault();
        zone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) {
        e.preventDefault();
        zone.classList.remove('dragover');
      });
    });

    zone.addEventListener('drop', function (e) {
      var files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        if (nameEl) nameEl.textContent = files[0].name;
      }
    });

    input.addEventListener('change', function () {
      if (nameEl) nameEl.textContent = input.files.length > 0 ? input.files[0].name : '';
    });
  }

  // Tab switching
  window.switchAttTab = function (tabId) {
    document.querySelectorAll('.att-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.att-tab-pane').forEach(function (pane) {
      if (pane.id === tabId) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });
  };

  // Helper: convert YYYY-MM to YYYYMM for API
  function monthInputToYYYYMM(inputValue) {
    if (!inputValue) return '';
    return inputValue.replace('-', '');
  }

  function getDaysInSelectedMonth() {
    var monthRaw = document.getElementById('attMonth').value;
    if (!monthRaw || monthRaw.indexOf('-') === -1) return 30;
    var parts = monthRaw.split('-');
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10);
    if (!year || !month) return 30;
    return new Date(year, month, 0).getDate();
  }

  function selectedLeaveEntries() {
    return Object.keys(leaveCalendarState)
      .map(function (dayKey) {
        return {
          day_number: parseInt(dayKey, 10),
          leave_units: leaveCalendarState[dayKey],
        };
      })
      .filter(function (entry) {
        return entry.day_number && (entry.leave_units === 1 || entry.leave_units === 0.5);
      })
      .sort(function (a, b) { return a.day_number - b.day_number; });
  }

  function syncLeaveCountFromCalendar() {
    var total = selectedLeaveEntries().reduce(function (sum, item) {
      return sum + item.leave_units;
    }, 0);
    document.getElementById('attLeaveCount').value = total > 0 ? String(total) : '';
    document.getElementById('attLeaveEntries').value = JSON.stringify(selectedLeaveEntries());
  }

  function renderLeaveCalendar() {
    var cal = document.getElementById('attLeaveCalendar');
    if (!cal) return;
    var days = getDaysInSelectedMonth();
    cal.innerHTML = '';
    for (var d = 1; d <= days; d++) {
      var units = Number(leaveCalendarState[d] || 0);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-day', String(d));
      btn.className = 'h-9 rounded-lg border text-xs font-semibold transition-colors ' +
        (units === 1
          ? 'bg-error/20 border-error/40 text-error'
          : (units === 0.5
            ? 'bg-warning/15 border-warning/30 text-warning'
            : 'bg-surface-container-high border-outline-variant/20 text-on-surface'));
      btn.textContent = d;
      cal.appendChild(btn);
    }
  }

  function toggleLeaveDay(day) {
    var current = Number(leaveCalendarState[day] || 0);
    if (current === 0) leaveCalendarState[day] = 1;
    else if (current === 1) leaveCalendarState[day] = 0.5;
    else delete leaveCalendarState[day];
    renderLeaveCalendar();
    syncLeaveCountFromCalendar();
  }

  function resetLeaveCalendar() {
    leaveCalendarState = {};
    renderLeaveCalendar();
    syncLeaveCountFromCalendar();
  }

  // Auto-fill month inputs with previous month
  function autoFillMonthInputs() {
    var defaultVal = getDefaultBillingMonthInput(); // YYYY-MM
    ['attMonth', 'attUploadMonth', 'summaryMonth'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = defaultVal;
    });
  }
  autoFillMonthInputs();
  renderLeaveCalendar();
  setupUploadZone('attUploadZone', 'attFile', 'attFileName');

  function clearAttendanceEmployeeDetails() {
    document.getElementById('attEmpName').value = '';
    document.getElementById('attManager').value = '';
    document.getElementById('attClient').value = '';
    document.getElementById('attLeavesAllowed').value = '';
    document.getElementById('attLeavesAllowed').setAttribute('data-original', '');
    document.getElementById('attRateCardId').value = '';
  }

  async function lookupAttendanceEmployee() {
    var empCode = document.getElementById('attEmpCode').value.trim();
    if (!empCode) {
      clearAttendanceEmployeeDetails();
      return;
    }
    try {
      var res = await apiCall('GET', '/api/attendance/employee/' + encodeURIComponent(empCode));
      document.getElementById('attEmpName').value = res.data.emp_name || '';
      document.getElementById('attManager').value = res.data.reporting_manager || '';
      document.getElementById('attClient').value = res.data.client_name || '';
      document.getElementById('attRateCardId').value = res.data.rate_card_id ? String(res.data.rate_card_id) : '';
      var allowedVal = res.data.leaves_allowed !== undefined && res.data.leaves_allowed !== null
        ? String(res.data.leaves_allowed)
        : '';
      document.getElementById('attLeavesAllowed').value = allowedVal;
      document.getElementById('attLeavesAllowed').setAttribute('data-original', allowedVal);
    } catch (err) {
      clearAttendanceEmployeeDetails();
      showToast(err.message, 'danger');
    }
  }

  // Manual entry
  document.getElementById('attManualForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var empCode = document.getElementById('attEmpCode').value.trim();
    var empName = document.getElementById('attEmpName').value.trim();
    var manager = document.getElementById('attManager').value.trim();
    var monthRaw = document.getElementById('attMonth').value.trim();
    var month = monthInputToYYYYMM(monthRaw);
    var leaveCount = document.getElementById('attLeaveCount').value;
    var leaveEntries = selectedLeaveEntries();
    var leavesAllowedRaw = String(document.getElementById('attLeavesAllowed').value || '').trim();
    var leavesAllowed = leavesAllowedRaw ? parseInt(leavesAllowedRaw, 10) : null;
    if (leavesAllowedRaw && (!Number.isFinite(leavesAllowed) || leavesAllowed < 0)) {
      showToast('Leaves Allowed must be a non-negative integer', 'danger');
      return;
    }

    var leaves;
    if (leaveEntries.length > 0) {
      leaves = leaveEntries.reduce(function (sum, item) { return sum + item.leave_units; }, 0);
    } else if (leaveCount) {
      leaves = parseFloat(leaveCount);
    } else {
      leaves = 0;
    }

    try {
      if (!empName || !document.getElementById('attClient').value.trim()) {
        await lookupAttendanceEmployee();
        empName = document.getElementById('attEmpName').value.trim();
        manager = document.getElementById('attManager').value.trim();
      }
      if (!empName || !document.getElementById('attClient').value.trim()) {
        throw new Error('Employee details could not be resolved from the employee code');
      }

      // If user edits leaves allowed, persist it to the linked rate card so billing uses it.
      var rcId = String(document.getElementById('attRateCardId').value || '').trim();
      var originalAllowed = String(document.getElementById('attLeavesAllowed').getAttribute('data-original') || '').trim();
      if (rcId && leavesAllowed !== null && String(leavesAllowed) !== originalAllowed) {
        await apiCall('PATCH', '/api/rate-cards/' + encodeURIComponent(rcId) + '/leaves-allowed', { leaves_allowed: leavesAllowed });
        document.getElementById('attLeavesAllowed').setAttribute('data-original', String(leavesAllowed));
      }

      await apiCall('POST', '/api/attendance/bulk', {
        emp_code: empCode, emp_name: empName, reporting_manager: manager,
        billing_month: month, leaves: leaves, leave_entries: leaveEntries,
      });
      showToast('Attendance submitted successfully!', 'success');
      document.getElementById('attManualForm').reset();
      autoFillMonthInputs();
      resetLeaveCalendar();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  // Upload Excel
  document.getElementById('attUploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fd = new FormData();
    fd.append('file', document.getElementById('attFile').files[0]);
    fd.append('billingMonth', monthInputToYYYYMM(document.getElementById('attUploadMonth').value.trim()));

    try {
      var res = await apiCall('POST', '/api/attendance/upload', fd);
      var d = res.data;
      var resultDiv = document.getElementById('attUploadResult');
      resultDiv.classList.remove('hidden');
      var isWarning = d.errors > 0;
      resultDiv.innerHTML =
        '<div class="rounded-xl p-4 mt-3 ' + (isWarning ? 'bg-warning/10 border border-warning/20 text-warning' : 'bg-success/10 border border-success/20 text-success') + '">' +
        'Imported: <strong>' + d.imported + '</strong> employees | Errors: <strong>' + d.errors + '</strong>' +
        (d.errorDetails && d.errorDetails.length > 0 ? '<ul class="mt-2 ml-4 list-disc text-sm">' + d.errorDetails.map(function (e) { return '<li>' + escapeHtml(e.error_message) + '</li>'; }).join('') + '</ul>' : '') +
        '</div>';
    } catch (err) { showToast(err.message, 'danger'); }
  });

  // Summary
  document.getElementById('btnLoadSummary').addEventListener('click', async function () {
    var monthRaw = document.getElementById('summaryMonth').value.trim();
    var month = monthInputToYYYYMM(monthRaw);
    if (!month) { showToast('Please select a billing month', 'warning'); return; }
    var tbody = document.getElementById('summaryBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/attendance/summary?billingMonth=' + month);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-on-surface-variant py-6">No attendance data for this month</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (r) {
          var billingHours = r.billable_hours !== undefined && r.billable_hours !== null
            ? Number(r.billable_hours)
            : Math.round((Number(r.days_present) || 0) * 8.5 * 100) / 100;
          return '<tr>' +
            '<td><strong>' + escapeHtml(r.emp_code) + '</strong></td>' +
            '<td>' + escapeHtml(r.emp_name || '') + '</td>' +
            '<td class="text-center">' + r.days_present + '</td>' +
            '<td class="text-center">' + billingHours + '</td>' +
            '<td class="text-center">' + r.leaves_taken + '</td>' +
            '<td class="text-center">' + r.total_days + '</td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('summaryTable');
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  });

  // Initialize search for summary table
  initTableSearch('attSummarySearch', 'summaryBody');
  document.getElementById('attEmpCode').addEventListener('blur', lookupAttendanceEmployee);
  document.getElementById('attEmpCode').addEventListener('change', lookupAttendanceEmployee);
  document.getElementById('attMonth').addEventListener('change', resetLeaveCalendar);
  document.getElementById('attLeaveCalendar').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-day]');
    if (!btn) return;
    var day = parseInt(btn.getAttribute('data-day'), 10);
    if (!day) return;
    toggleLeaveDay(day);
  });
})();
