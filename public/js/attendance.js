(function () {
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

  // Auto-fill month inputs with previous month
  function autoFillMonthInputs() {
    var defaultVal = getDefaultBillingMonthInput(); // YYYY-MM
    ['attMonth', 'attUploadMonth', 'summaryMonth'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.value) el.value = defaultVal;
    });
  }
  autoFillMonthInputs();

  // Manual entry
  document.getElementById('attManualForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var empCode = document.getElementById('attEmpCode').value.trim();
    var empName = document.getElementById('attEmpName').value.trim();
    var manager = document.getElementById('attManager').value.trim();
    var monthRaw = document.getElementById('attMonth').value.trim();
    var month = monthInputToYYYYMM(monthRaw);
    var leaveCount = document.getElementById('attLeaveCount').value;
    var leaveDaysStr = document.getElementById('attLeaveDays').value.trim();

    var leaves;
    if (leaveDaysStr) {
      leaves = leaveDaysStr.split(',').map(function (d) { return parseInt(d.trim(), 10); }).filter(function (d) { return !isNaN(d); });
    } else if (leaveCount) {
      leaves = parseInt(leaveCount, 10);
    } else {
      leaves = 0;
    }

    try {
      await apiCall('POST', '/api/attendance/bulk', {
        emp_code: empCode, emp_name: empName, reporting_manager: manager,
        billing_month: month, leaves: leaves,
      });
      showToast('Attendance submitted successfully!', 'success');
      document.getElementById('attManualForm').reset();
      autoFillMonthInputs();
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
        '<div class="rounded-xl p-4 mt-3 ' + (isWarning ? 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-300' : 'bg-green-500/10 border border-green-500/20 text-green-300') + '">' +
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
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-on-surface-variant py-6">No attendance data for this month</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (r) {
          return '<tr>' +
            '<td><strong>' + escapeHtml(r.emp_code) + '</strong></td>' +
            '<td>' + escapeHtml(r.emp_name || '') + '</td>' +
            '<td class="text-center">' + r.days_present + '</td>' +
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
})();
