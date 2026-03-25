(function () {
  var currentRunId = null;
  var currentRequestStatus = null;

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
      Accepted: 'badge-success',
      Rejected: 'badge-error'
    };
    return '<span class="' + (map[status] || 'badge-processing') + '">' + escapeHtml(status || 'Pending') + '</span>';
  }

  function setDecisionButtonsEnabled(enabled) {
    document.getElementById('acceptRequestBtn').disabled = !enabled;
    document.getElementById('rejectRequestBtn').disabled = !enabled;
  }

  function renderMissingPoInputs(items) {
    var missing = items.filter(function (item) { return !item.po_id; });
    var section = document.getElementById('missingPoSection');
    var body = document.getElementById('missingPoBody');
    if (missing.length === 0) {
      section.classList.add('hidden');
      body.innerHTML = '';
      return;
    }

    body.innerHTML = missing.map(function (item) {
      return '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-surface-container-high p-3">' +
        '<div><div class="text-xs text-on-surface-variant">Employee</div><div class="font-semibold">' + escapeHtml(item.emp_code) + ' - ' + escapeHtml(item.emp_name) + '</div></div>' +
        '<div><div class="text-xs text-on-surface-variant">Amount</div><div class="font-semibold">' + formatCurrency(item.invoice_amount) + '</div></div>' +
        '<div><label class="block text-xs text-on-surface-variant mb-1">PO Number</label><input type="text" class="missing-po-input" data-emp-code="' + escapeHtml(item.emp_code) + '" placeholder="Enter PO number"></div>' +
      '</div>';
    }).join('');
    section.classList.remove('hidden');
  }

  function normalizeItems(items) {
    return (items || []).map(function (item) {
      return {
        client_name: item.client_name,
        emp_code: item.emp_code,
        emp_name: item.emp_name,
        reporting_manager: item.reporting_manager,
        monthly_rate: item.monthly_rate,
        allowed_leaves: item.allowed_leaves !== undefined ? item.allowed_leaves : item.leaves_allowed,
        leaves_taken: item.leaves_taken,
        chargeable_days: item.chargeable_days,
        invoice_amount: item.invoice_amount,
        po_id: item.po_id || null
      };
    });
  }

  function showResults(data) {
    var resultsEl = document.getElementById('billingResults');
    resultsEl.classList.remove('hidden');

    currentRunId = data.billingRunId || data.id || null;
    currentRequestStatus = data.requestStatus || data.request_status || 'Pending';

    document.getElementById('resTotalEmp').textContent = data.summary.totalEmployees;
    document.getElementById('resTotalAmount').textContent = formatCurrency(data.summary.totalAmount);
    document.getElementById('resErrors').textContent = data.summary.errorCount;
    document.getElementById('resDays').textContent = data.summary.daysInMonth;
    document.getElementById('downloadLink').setAttribute('data-url', data.downloadUrl || ('/api/billing/runs/' + currentRunId + '/download'));

    var items = normalizeItems(data.billingItems || data.items || []);
    var itemsBody = document.getElementById('billingItemsBody');
    if (items.length === 0) {
      itemsBody.innerHTML = '<tr><td colspan="9" class="text-center text-on-surface-variant py-6">No service request items</td></tr>';
    } else {
      itemsBody.innerHTML = items.map(function (i) {
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

    var errors = data.errors || [];
    var errorsCard = document.getElementById('errorsCard');
    var errorsBody = document.getElementById('errorsBody');
    if (errors.length > 0) {
      errorsCard.classList.remove('hidden');
      errorsBody.innerHTML = errors.map(function (e) {
        return '<tr><td>' + escapeHtml(e.emp_code || '-') + '</td><td>' + escapeHtml(e.error_message) + '</td></tr>';
      }).join('');
    } else {
      errorsCard.classList.add('hidden');
      errorsBody.innerHTML = '';
    }

    var decisionCard = document.getElementById('decisionCard');
    if (currentRequestStatus === 'Pending') {
      decisionCard.classList.remove('hidden');
      setDecisionButtonsEnabled(true);
      renderMissingPoInputs(items);
    } else {
      decisionCard.classList.add('hidden');
      setDecisionButtonsEnabled(false);
    }
  }

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

  async function reviewRun(id) {
    try {
      var res = await apiCall('GET', '/api/billing/runs/' + id);
      var run = res.data;
      showResults({
        id: run.id,
        billingRunId: run.id,
        summary: {
          totalEmployees: run.total_employees,
          totalAmount: run.total_amount,
          errorCount: run.error_count,
          daysInMonth: run.items && run.items.length > 0 ? run.items[0].days_in_month : 0
        },
        errors: run.errors || [],
        billingItems: run.items || [],
        requestStatus: run.request_status || 'Pending',
        downloadUrl: '/api/billing/runs/' + run.id + '/download'
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
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-8">' +
          '<div class="flex flex-col items-center gap-2 text-on-surface-variant">' +
          '<span class="material-symbols-outlined text-4xl opacity-40">inbox</span>' +
          '<h6 class="text-sm font-semibold">No service requests yet</h6>' +
          '<p class="text-xs">Generate your first service request to see it here</p></div></td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (r) {
          var actions = '<div class="inline-flex items-center gap-1">' +
            '<button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download\')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Download"><span class="material-symbols-outlined text-base">download</span></button>' +
            '<button onclick="window.reviewServiceRequest(' + r.id + ')" class="btn-secondary btn-sm inline-flex items-center gap-1" title="Review"><span class="material-symbols-outlined text-base">visibility</span></button>' +
          '</div>';
          return '<tr>' +
            '<td><strong>' + escapeHtml(r.billing_month) + '</strong></td>' +
            '<td class="text-center">' + r.total_employees + '</td>' +
            '<td class="text-right">' + formatCurrency(r.total_amount) + '</td>' +
            '<td class="text-center">' + (r.error_count > 0 ? '<span class="badge-error">' + r.error_count + '</span>' : '<span class="badge-success">0</span>') + '</td>' +
            '<td>' + statusBadge(r.request_status || 'Pending') + '</td>' +
            '<td>' + formatDate(r.created_at) + '</td>' +
            '<td>' + actions + '</td>' +
            '</tr>';
        }).join('');
      }
    } catch (e) { /* ignore */ }
  }

  async function generateRequest(endpoint, body, isFormData) {
    var res = await apiCall('POST', endpoint, body);
    showToast('Service request generated successfully!', 'success');
    showResults(res.data);
    loadHistory();
    return res;
  }

  async function decideCurrentRun(decision) {
    if (!currentRunId) return;
    setDecisionButtonsEnabled(false);
    try {
      var poAssignments = [];
      document.querySelectorAll('.missing-po-input').forEach(function (input) {
        if (input.value.trim()) {
          poAssignments.push({
            emp_code: input.getAttribute('data-emp-code'),
            po_number: input.value.trim()
          });
        }
      });

      var res = await apiCall('POST', '/api/billing/runs/' + currentRunId + '/decision', {
        decision: decision,
        poAssignments: poAssignments
      });
      currentRequestStatus = res.data.requestStatus;
      showToast('Service request ' + currentRequestStatus.toLowerCase(), currentRequestStatus === 'Accepted' ? 'success' : 'warning');
      document.getElementById('decisionCard').classList.add('hidden');
      await reviewRun(currentRunId);
      loadHistory();
    } catch (err) {
      showToast(err.message, 'danger');
      setDecisionButtonsEnabled(true);
    }
  }

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
      var clientId = document.getElementById('dbClientId').value;
      var billingMonth = monthInputToYYYYMM(document.getElementById('dbBillingMonth').value.trim());
      var body = { billingMonth: billingMonth };
      if (clientId) body.clientId = parseInt(clientId, 10);
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

  window.reviewServiceRequest = reviewRun;

  loadClients();
  loadHistory();
})();
