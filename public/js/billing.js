(function () {
  // ---- Tab Switching ----
  window.switchBillingTab = function (tabId) {
    document.querySelectorAll('.billing-tab').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.billing-tab-pane').forEach(function (pane) {
      if (pane.id === tabId) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });
  };

  // ---- Drag & Drop File Upload Zones ----
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

  setupFileZone('rateCardZone', 'rateCardFile', 'rateCardFileName');
  setupFileZone('attendanceZone', 'attendanceFile', 'attendanceFileName');

  // ---- Auto-fill billing month with previous month ----
  function autoFillBillingMonth() {
    var value = getDefaultBillingMonthInput(); // YYYY-MM
    var el1 = document.getElementById('billingMonth');
    var el2 = document.getElementById('dbBillingMonth');
    if (el1 && !el1.value) el1.value = value;
    if (el2 && !el2.value) el2.value = value;
  }

  // Helper: convert YYYY-MM to YYYYMM for API
  function monthInputToYYYYMM(inputValue) {
    return inputValue.replace('-', '');
  }

  autoFillBillingMonth();

  // Load clients for the dropdown
  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      var sel = document.getElementById('dbClientId');
      if (sel) {
        res.data.forEach(function (c) {
          sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.client_name) + '</option>';
        });
      }
    } catch (e) { /* ignore */ }
  }

  // Load billing history
  async function loadHistory() {
    var tbody = document.getElementById('billingHistoryBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/billing/runs');
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8">' +
          '<div class="flex flex-col items-center gap-2 text-on-surface-variant">' +
          '<span class="material-symbols-outlined text-4xl opacity-40">inbox</span>' +
          '<h6 class="text-sm font-semibold">No billing runs yet</h6>' +
          '<p class="text-xs">Generate your first billing to see it here</p></div></td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (r) {
          return '<tr>' +
            '<td><strong>' + escapeHtml(r.billing_month) + '</strong></td>' +
            '<td class="text-center">' + r.total_employees + '</td>' +
            '<td class="text-right">' + formatCurrency(r.total_amount) + '</td>' +
            '<td class="text-center">' + (r.error_count > 0 ? '<span class="badge-error">' + r.error_count + '</span>' : '<span class="badge-success">0</span>') + '</td>' +
            '<td>' + formatDate(r.created_at) + '</td>' +
            '<td><button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download\')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Download"><span class="material-symbols-outlined text-base">download</span></button></td>' +
            '</tr>';
        }).join('');
      }
    } catch (e) { /* ignore */ }
  }

  // Show results
  function showResults(data) {
    var resultsEl = document.getElementById('billingResults');
    resultsEl.classList.remove('hidden');
    document.getElementById('resTotalEmp').textContent = data.summary.totalEmployees;
    document.getElementById('resTotalAmount').textContent = formatCurrency(data.summary.totalAmount);
    document.getElementById('resErrors').textContent = data.summary.errorCount;
    document.getElementById('resDays').textContent = data.summary.daysInMonth;
    document.getElementById('downloadLink').setAttribute('data-url', data.downloadUrl);

    var itemsBody = document.getElementById('billingItemsBody');
    if (data.billingItems.length === 0) {
      itemsBody.innerHTML = '<tr><td colspan="9" class="text-center text-on-surface-variant py-6">No billing items</td></tr>';
    } else {
      itemsBody.innerHTML = data.billingItems.map(function (i) {
        return '<tr>' +
          '<td>' + escapeHtml(i.client_name) + '</td>' +
          '<td>' + escapeHtml(i.emp_code) + '</td>' +
          '<td>' + escapeHtml(i.emp_name) + '</td>' +
          '<td>' + escapeHtml(i.reporting_manager || '') + '</td>' +
          '<td class="text-right">' + formatCurrency(i.monthly_rate) + '</td>' +
          '<td class="text-center">' + i.allowed_leaves + '</td>' +
          '<td class="text-center">' + i.leaves_taken + '</td>' +
          '<td class="text-center">' + i.chargeable_days + '</td>' +
          '<td class="text-right font-bold">' + formatCurrency(i.invoice_amount) + '</td>' +
          '</tr>';
      }).join('');
    }

    var errorsCard = document.getElementById('errorsCard');
    var errorsBody = document.getElementById('errorsBody');
    if (data.errors && data.errors.length > 0) {
      errorsCard.classList.remove('hidden');
      errorsBody.innerHTML = data.errors.map(function (e) {
        return '<tr><td>' + escapeHtml(e.emp_code) + '</td><td>' + escapeHtml(e.error_message) + '</td></tr>';
      }).join('');
    } else {
      errorsCard.classList.add('hidden');
    }

    loadHistory();
  }

  // Generate from files
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

      var res = await apiCall('POST', '/api/billing/generate', fd);
      showToast('Billing generated successfully!', 'success');
      showResults(res.data);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined">settings</span> Generate';
    }
  });

  // Generate from DB
  document.getElementById('billingDbForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('btnGenerateDb');
    btn.disabled = true;
    btn.innerHTML = '<div class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent mr-2"></div> Processing...';

    try {
      var clientId = document.getElementById('dbClientId').value;
      var billingMonth = monthInputToYYYYMM(document.getElementById('dbBillingMonth').value.trim());
      var body = { billingMonth: billingMonth };
      if (clientId) body.clientId = parseInt(clientId, 10);

      var res = await apiCall('POST', '/api/billing/generate-from-db', body);
      showToast('Billing generated successfully!', 'success');
      showResults(res.data);
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined">database</span> Generate from DB';
    }
  });

  loadClients();
  loadHistory();
})();
