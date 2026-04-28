(function () {
  // openModal / closeModal provided by app.js
  var sowActionMap = {};
  var sowClientMap = {};

  window.openSowDocumentUploadModal = async function () {
    document.getElementById('sowDocumentUploadForm').reset();
    await loadAcceptedQuotesForDocumentUpload();
    openModal('sowDocumentUploadModal');
  };
  window.closeSowDocumentUploadModal = function () { closeModal('sowDocumentUploadModal'); };
  window.openSowLinkPOModal = function (folderName) {
    document.getElementById('sowLinkPOForm').reset();
    document.getElementById('sowLinkPOFolderName').value = folderName || '';
    document.getElementById('sowLinkPOFolderLabel').value = folderName || '';
    document.getElementById('sowLinkPONumber').value = '';
    openModal('sowLinkPOModal');
  };
  window.closeSowLinkPOModal = function () { closeModal('sowLinkPOModal'); };

  function formatFileSize(bytes) {
    var size = Number(bytes) || 0;
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1).replace(/\.0$/, '') + ' KB';
    return (size / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';
  }

  function toDateInputValue(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function parseDateInput(value) {
    if (!value) return null;
    var parts = String(value).split('-');
    if (parts.length !== 3) return null;
    var year = parseInt(parts[0], 10);
    var month = parseInt(parts[1], 10) - 1;
    var day = parseInt(parts[2], 10);
    if (!year || month < 0 || day < 1) return null;
    var date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function addMonthsToDateValue(startValue, months) {
    var start = parseDateInput(startValue);
    var count = parseInt(months, 10);
    if (!start || !Number.isFinite(count) || count <= 0) return '';
    var targetMonthIndex = start.getMonth() + count;
    var end = new Date(start.getFullYear(), targetMonthIndex, 1);
    var lastDay = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    end.setDate(Math.min(start.getDate(), lastDay));
    return toDateInputValue(end);
  }

  function getInclusiveMonthSpan(startValue, endValue) {
    var start = parseDateInput(startValue);
    var end = parseDateInput(endValue);
    if (!start || !end) return '';
    if (end < start) return '';
    return ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth()) + 1;
  }

  var sowDateSyncState = {
    updating: false,
  };

  function syncSowEndFromMonths() {
    if (sowDateSyncState.updating) return;
    sowDateSyncState.updating = true;
    try {
      var startValue = document.getElementById('sowStart').value;
      var monthsValue = document.getElementById('sowEffectiveMonths').value;
      var endValue = addMonthsToDateValue(startValue, monthsValue);
      if (endValue) {
        document.getElementById('sowEnd').value = endValue;
      }
    } finally {
      sowDateSyncState.updating = false;
    }
  }

  function syncSowMonthsFromEnd() {
    if (sowDateSyncState.updating) return;
    sowDateSyncState.updating = true;
    try {
      var startValue = document.getElementById('sowStart').value;
      var endValue = document.getElementById('sowEnd').value;
      var monthCount = getInclusiveMonthSpan(startValue, endValue);
      document.getElementById('sowEffectiveMonths').value = monthCount || '';
    } finally {
      sowDateSyncState.updating = false;
    }
  }

  function formatDateTime(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
    return date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function buildDocumentLibraryHtml(folders) {
    if (!folders || folders.length === 0) {
      return '<div class="rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container-high p-8 text-center text-on-surface-variant">No linked SOW document folders have been created yet.</div>';
    }

    return '<div class="space-y-4">' + folders.map(function (folder) {
      var filesHtml = (folder.files || []).length
        ? folder.files.map(function (file) {
          var downloadUrl = '/api/sows/documents/download?folder=' + encodeURIComponent(folder.folder_name) + '&file=' + encodeURIComponent(file.name);
          return '' +
            '<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-outline-variant/12 bg-surface-container-high p-4">' +
              '<div class="min-w-0">' +
                '<div class="font-medium text-on-surface break-all">' + escapeHtml(file.name) + '</div>' +
                '<div class="text-xs text-on-surface-variant mt-1">Updated ' + formatDateTime(file.modified_at) + ' • ' + formatFileSize(file.size) + '</div>' +
              '</div>' +
              '<button type="button" class="btn-secondary btn-sm inline-flex items-center gap-1.5 self-start sm:self-auto" onclick="downloadFile(\'' + downloadUrl + '\')">' +
                '<span class="material-symbols-outlined text-base">download</span>Download' +
              '</button>' +
            '</div>';
        }).join('')
        : '<div class="text-sm text-on-surface-variant">This folder is empty.</div>';

      return '' +
        '<div class="rounded-2xl border border-outline-variant/12 bg-surface p-5">' +
          '<div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">' +
            '<div>' +
              '<div class="text-base font-semibold text-on-surface break-all">' + escapeHtml(folder.folder_name) + '</div>' +
              '<div class="text-xs text-on-surface-variant mt-1">Last updated ' + formatDateTime(folder.modified_at) + '</div>' +
              '<div class="flex flex-wrap gap-2 mt-2">' +
                (folder.metadata && (folder.metadata.client_abbreviation || folder.metadata.client_name)
                  ? '<span class="badge-processing">Client: ' + escapeHtml(folder.metadata.client_abbreviation || folder.metadata.client_name) + '</span>' : '') +
                (folder.metadata && ((folder.metadata.candidate_names && folder.metadata.candidate_names.length) || folder.metadata.candidate_name)
                  ? '<span class="badge-processing">Candidate: ' + escapeHtml(((folder.metadata.candidate_names && folder.metadata.candidate_names.length) ? folder.metadata.candidate_names.join(', ') : folder.metadata.candidate_name)) + '</span>' : '') +
                (folder.metadata && folder.metadata.sow_numbers && folder.metadata.sow_numbers.length
                  ? '<span class="badge-processing">SOW: ' + escapeHtml(folder.metadata.sow_numbers.join(', ')) + '</span>' : '') +
                (folder.metadata && folder.metadata.roles && folder.metadata.roles.length
                  ? '<span class="badge-processing">Role: ' + escapeHtml(folder.metadata.roles.join(', ')) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="flex items-center gap-2 self-start">' +
              '<div class="text-xs font-semibold uppercase tracking-[0.15em] text-on-surface-variant">' + (folder.files || []).length + ' file' + ((folder.files || []).length === 1 ? '' : 's') + '</div>' +
              '<button type="button" class="btn-secondary btn-sm inline-flex items-center gap-1.5" onclick="openSowLinkPOModal(\'' + escapeHtml(folder.folder_name).replace(/'/g, "\\'") + '\')">' +
                '<span class="material-symbols-outlined text-base">attach_file</span>Link PO' +
              '</button>' +
              '<button type="button" class="btn-danger btn-sm inline-flex items-center gap-1.5" onclick="deleteLinkedDocumentFolder(\'' + escapeHtml(folder.folder_name).replace(/'/g, "\\'") + '\')">' +
                '<span class="material-symbols-outlined text-base">delete</span>Delete Folder' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div class="space-y-3">' + filesHtml + '</div>' +
        '</div>';
    }).join('') + '</div>';
  }

  window.loadLinkedDocumentLibrary = async function () {
    var container = document.getElementById('sowDocumentLibrary');
    if (!container) return;
    container.innerHTML = '<div class="loading-spinner"></div>';
    try {
      var searchValue = String((document.getElementById('sowDocumentSearch') || {}).value || '').trim();
      var clientValue = String((document.getElementById('sowDocumentFilterClient') || {}).value || '').trim();
      var candidateValue = String((document.getElementById('sowDocumentFilterCandidate') || {}).value || '').trim();
      var roleValue = String((document.getElementById('sowDocumentFilterRole') || {}).value || '').trim();
      var sowValue = String((document.getElementById('sowDocumentFilterSow') || {}).value || '').trim();

      var query = [];
      if (searchValue) query.push('search=' + encodeURIComponent(searchValue));
      if (clientValue) query.push('client=' + encodeURIComponent(clientValue));
      if (candidateValue) query.push('candidate=' + encodeURIComponent(candidateValue));
      if (roleValue) query.push('role=' + encodeURIComponent(roleValue));
      if (sowValue) query.push('sow=' + encodeURIComponent(sowValue));
      var url = '/api/sows/documents' + (query.length ? ('?' + query.join('&')) : '');

      var res = await apiCall('GET', url);
      container.innerHTML = buildDocumentLibraryHtml(res.data || []);
    } catch (err) {
      container.innerHTML = '<div class="rounded-2xl border border-outline-variant/12 bg-surface-container-high p-6 text-sm text-error">Failed to load saved documents: ' + escapeHtml(err.message) + '</div>';
    }
  };

  window.deleteLinkedDocumentFolder = async function (folderName) {
    var confirmed = await confirmAction('Delete Document Folder', 'Are you sure you want to delete this saved document folder? This will remove all linked files (quote, SOW, and PO).');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/sows/documents?folder=' + encodeURIComponent(folderName));
      showToast('Document folder deleted', 'success');
      loadLinkedDocumentLibrary();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.openSOWModal = function () {
    document.getElementById('sowForm').reset();
    document.getElementById('sowItemsBody').innerHTML = '';
    document.getElementById('sowModalTitle').textContent = 'Create SOW';
    document.getElementById('sowId').value = '';
    window.sowEdit = null;
    window.sowAmend = null;
    addSowItemRow();
    openModal('sowModal');
  };
  window.closeSOWModal = function () { closeModal('sowModal'); };

  var statusBadge = function (s) {
    var map = { Draft: 'badge-processing', 'Amendment Draft': 'badge-processing', Signed: 'badge-success', Expired: 'badge-warning', Terminated: 'badge-error' };
    return '<span class="' + (map[s] || 'badge-processing') + '">' + s + '</span>';
  };

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      sowClientMap = {};
      (res.data || []).forEach(function (client) {
        sowClientMap[String(client.id)] = client;
      });
      ['sowFilterClient', 'sowClient'].forEach(function (id) {
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

  async function loadQuotesForClient(clientId) {
    var sel = document.getElementById('sowQuote');
    sel.innerHTML = '<option value="">None</option>';
    if (!clientId) return;
    try {
      var res = await apiCall('GET', '/api/quotes?clientId=' + clientId + '&status=Accepted');
      res.data.forEach(function (q) {
        sel.innerHTML += '<option value="' + q.id + '">' + escapeHtml(q.quote_number) + ' (' + formatCurrency(q.total_amount) + ')</option>';
      });
    } catch (e) { /* ignore */ }
  }

  async function loadAcceptedQuotesForDocumentUpload() {
    var sel = document.getElementById('sowDocumentQuote');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select Accepted Quote</option>';
    try {
      var res = await apiCall('GET', '/api/quotes?status=Accepted');
      res.data.forEach(function (q) {
        sel.innerHTML += '<option value="' + q.id + '">' + escapeHtml(q.quote_number) + ' - ' + escapeHtml(q.client_name || '') + '</option>';
      });
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  function updateSowsSummary(rows) {
    var items = rows || [];
    var summary = document.getElementById('sowsSummary');
    var count = document.getElementById('sowsTableCount');
    var signed = items.filter(function (s) { return s.status === 'Signed'; }).length;
    if (summary) {
      var cards = summary.querySelectorAll('.table-summary-value');
      if (cards[0]) cards[0].textContent = items.length;
      if (cards[1]) cards[1].textContent = signed;
      if (cards[2]) cards[2].textContent = items.length;
    }
    if (count) count.textContent = items.length === 1 ? '1 row' : items.length + ' rows';
  }

  function updateSowsVisibleCount() {
    var tbody = document.getElementById('sowsBody');
    var summary = document.getElementById('sowsSummary');
    var count = document.getElementById('sowsTableCount');
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

  async function loadSOWs() {
    var tbody = document.getElementById('sowsBody');
    showLoading(tbody);
    try {
      var cid = document.getElementById('sowFilterClient').value;
      var status = document.getElementById('sowFilterStatus').value;
      var url = '/api/sows?';
      if (cid) url += 'clientId=' + cid + '&';
      if (status) url += 'status=' + status;
      var res = await apiCall('GET', url);
      updateSowsSummary(res.data || []);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-on-surface-variant py-8">No SOWs found</td></tr>';
      } else {
        sowActionMap = {};
        tbody.innerHTML = res.data.map(function (s) {
          var client = sowClientMap[String(s.client_id)] || null;
          var clientDisplay = client ? getClientDisplayName(client) : (s.client_name || '');
          var VALID_TRANSITIONS = { Draft: ['Signed'], 'Amendment Draft': ['Signed'], Signed: ['Expired', 'Terminated'], Expired: [], Terminated: [] };
          var STATUS_LABELS = { Signed: 'Mark Signed', Expired: 'Mark Expired', Terminated: 'Terminate', Draft: 'Revert to Draft' };
          var allowed = VALID_TRANSITIONS[s.status] || [];
          sowActionMap[s.id] = {
            id: s.id,
            clientId: s.client_id,
            status: s.status,
            allowed: allowed.slice()
          };

          var actionsHtml = '<div class="table-action-group">';
          if (s.status === 'Draft' || s.status === 'Amendment Draft') {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editSOW(' + s.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>';
          }
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="viewSOW(' + s.id + ')" title="View"><span class="material-symbols-outlined text-base">visibility</span></button>';

          // Status menu
          if (allowed.length > 0 || s.status === 'Draft' || s.status === 'Amendment Draft' || s.status === 'Signed') {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="openSOWActions(' + s.id + ')" title="More"><span class="material-symbols-outlined text-base">more_vert</span></button>';
          }
          actionsHtml += '</div>';

          return '<tr>' +
            '<td><div class="table-cell-box"><span class="entity-pill entity-pill-strong">' + escapeHtml(s.sow_number) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(clientDisplay) + '">' + escapeHtml(clientDisplay) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(s.sow_date) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(s.effective_start) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(s.effective_end) + '</span></div></td>' +
            '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(s.total_value) + '</span></div></td>' +
            '<td><div class="table-cell-box">' + statusBadge(s.status) + '</div></td>' +
            '<td class="text-center"><div class="table-cell-box table-cell-center">' + actionsHtml + '</div></td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('sowsTable');
      updateSowsVisibleCount();
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  window.openSOWActions = function (id) {
    var actionState = sowActionMap[id];
    var container = document.getElementById('sowActionList');
    var title = document.getElementById('sowActionTitle');
    var STATUS_LABELS = { Signed: 'Mark Signed', Expired: 'Mark Expired', Terminated: 'Terminate', Draft: 'Revert to Draft' };

    if (!actionState || !container || !title) return;

    title.textContent = 'SOW Actions';
    container.innerHTML = '';

    actionState.allowed.forEach(function (st) {
      container.innerHTML += '<button type="button" class="w-full text-left rounded-xl px-4 py-3 text-sm font-medium text-on-surface bg-surface hover:bg-surface-container-highest transition-colors" onclick="runSOWActionStatus(' + actionState.id + ', \'' + st + '\')">' + (STATUS_LABELS[st] || st) + '</button>';
    });

    if (actionState.status === 'Signed') {
      container.innerHTML += '<button type="button" class="w-full text-left rounded-xl px-4 py-3 text-sm font-medium text-on-surface bg-surface hover:bg-surface-container-highest transition-colors" onclick="runSOWActionLinkPO(' + actionState.id + ', ' + actionState.clientId + ')">Link to PO</button>';
      container.innerHTML += '<button type="button" class="w-full text-left rounded-xl px-4 py-3 text-sm font-medium text-on-surface bg-surface hover:bg-surface-container-highest transition-colors" onclick="runSOWActionAmendment(' + actionState.id + ')">Make Amendment</button>';
    }

    if (actionState.status === 'Draft' || actionState.status === 'Amendment Draft') {
      container.innerHTML += '<button type="button" class="w-full text-left rounded-xl px-4 py-3 text-sm font-medium text-error bg-surface hover:bg-surface-container-highest transition-colors" onclick="runSOWActionDelete(' + actionState.id + ')">Delete</button>';
    }

    openModal('sowActionModal');
  };

  window.closeSOWActions = function () {
    closeModal('sowActionModal');
  };

  window.runSOWActionStatus = function (id, status) {
    closeSOWActions();
    changeSOWStatus(id, status);
  };

  window.runSOWActionLinkPO = function (sowId, clientId) {
    closeSOWActions();
    linkSOWToPO(sowId, clientId);
  };

  window.runSOWActionAmendment = function (id) {
    closeSOWActions();
    makeSOWAmendment(id);
  };

  window.runSOWActionDelete = function (id) {
    closeSOWActions();
    deleteSOW(id);
  };

  window.linkSOWToPO = function (sowId, clientId) {
    sessionStorage.setItem('pendingPoLinkContext', JSON.stringify({
      sowId: sowId,
      clientId: clientId
    }));
    location.hash = '#purchase-orders';
  };

  function addSowItemRow(item) {
    var tbody = document.getElementById('sowItemsBody');
    var row = document.createElement('tr');
    row.innerHTML =
      '<td><input type="text" class="si-role" value="' + (item ? escapeHtml(item.role_position) : '') + '" required></td>' +
      '<td><input type="number" class="si-qty" value="' + (item ? item.quantity : 1) + '" min="1"></td>' +
      '<td><input type="number" class="si-amt" value="' + (item ? item.amount : '') + '" step="0.01" min="0"></td>' +
      '<td><button type="button" class="btn-danger btn-sm inline-flex items-center" onclick="this.closest(\'tr\').remove();recalcSOW()"><span class="material-symbols-outlined text-base">close</span></button></td>';
    tbody.appendChild(row);

    row.querySelector('.si-amt').addEventListener('input', recalcSOW);
  }

  window.recalcSOW = function () {
    var total = 0;
    document.querySelectorAll('.si-amt').forEach(function (el) { total += parseFloat(el.value) || 0; });
    document.getElementById('sowTotal').textContent = formatCurrency(total);
  };

  window.editSOW = async function (id) {
    try {
      var res = await apiCall('GET', '/api/sows/' + id);
      var s = res.data;
      window.sowEdit = id;
      window.sowAmend = null;
      document.getElementById('sowModalTitle').textContent = 'Edit SOW';
      document.getElementById('sowId').value = id;
      document.getElementById('sowNumber').value = s.base_sow_number || s.sow_number;
      document.getElementById('sowClient').value = s.client_id;
      await loadQuotesForClient(s.client_id);
      document.getElementById('sowQuote').value = s.quote_id || '';
      document.getElementById('sowDate').value = s.sow_date;
      document.getElementById('sowStart').value = s.effective_start;
      document.getElementById('sowEnd').value = s.effective_end;
      syncSowMonthsFromEnd();
      document.getElementById('sowNotes').value = s.notes || '';
      document.getElementById('sowItemsBody').innerHTML = '';
      s.items.forEach(function (item) { addSowItemRow(item); });
      recalcSOW();
      openModal('sowModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.makeSOWAmendment = async function (id) {
    try {
      var res = await apiCall('GET', '/api/sows/' + id);
      var s = res.data;
      window.sowEdit = null;
      window.sowAmend = id;
      document.getElementById('sowModalTitle').textContent = 'Make Amendment';
      document.getElementById('sowId').value = '';
      document.getElementById('sowNumber').value = s.base_sow_number || s.sow_number;
      document.getElementById('sowClient').value = s.client_id;
      await loadQuotesForClient(s.client_id);
      document.getElementById('sowQuote').value = s.quote_id || '';
      document.getElementById('sowDate').value = s.sow_date;
      document.getElementById('sowStart').value = s.effective_start;
      document.getElementById('sowEnd').value = s.effective_end;
      syncSowMonthsFromEnd();
      document.getElementById('sowNotes').value = s.notes || '';
      document.getElementById('sowItemsBody').innerHTML = '';
      s.items.forEach(function (item) { addSowItemRow(item); });
      recalcSOW();
      openModal('sowModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.viewSOW = async function (id) {
    try {
      var res = await apiCall('GET', '/api/sows/' + id);
      var s = res.data;
      document.getElementById('sowDetailTitle').textContent = 'SOW: ' + s.sow_number;
      var html = '<div class="space-y-4">';
      html += '<div class="grid grid-cols-2 gap-4 text-sm">';
      html += '<div><span class="text-on-surface-variant">SOW ID:</span> <strong>' + escapeHtml(s.sow_number) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Client:</span> <strong>' + escapeHtml(s.client_name) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Status:</span> ' + statusBadge(s.status) + '</div>';
      html += '<div><span class="text-on-surface-variant">SOW Date:</span> ' + formatDate(s.sow_date) + '</div>';
      html += '<div><span class="text-on-surface-variant">Total Value:</span> <strong>' + formatCurrency(s.total_value) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Effective Start:</span> ' + formatDate(s.effective_start) + '</div>';
      html += '<div><span class="text-on-surface-variant">Effective End:</span> ' + formatDate(s.effective_end) + '</div>';
      html += '</div>';
      if (s.notes) {
        html += '<div class="text-sm"><span class="text-on-surface-variant">Notes:</span> ' + escapeHtml(s.notes) + '</div>';
      }
      html += '<h6 class="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant pt-2">Line Items</h6>';
      html += '<table class="stitch-table"><thead><tr><th>Role / Position</th><th class="text-center">Qty</th><th class="text-right">Amount</th></tr></thead><tbody>';
      s.items.forEach(function (item) {
        html += '<tr><td>' + escapeHtml(item.role_position) + '</td><td class="text-center">' + item.quantity + '</td><td class="text-right">' + formatCurrency(item.amount) + '</td></tr>';
      });
      html += '</tbody></table>';
      html += '</div>';
      document.getElementById('sowDetailContent').innerHTML = html;
      openModal('sowDetailModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.changeSOWStatus = async function (id, status) {
    try {
      await apiCall('PATCH', '/api/sows/' + id + '/status', { status: status });
      showToast('SOW status updated to ' + status, 'success');
      loadSOWs();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.deleteSOW = async function (id) {
    var confirmed = await confirmAction('Delete SOW', 'Are you sure you want to delete this SOW? This cannot be undone.');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/sows/' + id);
      showToast('SOW deleted', 'success');
      loadSOWs();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  document.getElementById('sowForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var items = [];
    document.querySelectorAll('#sowItemsBody tr').forEach(function (row) {
      items.push({
        role_position: row.querySelector('.si-role').value.trim(),
        quantity: parseInt(row.querySelector('.si-qty').value, 10) || 1,
        amount: parseFloat(row.querySelector('.si-amt').value) || 0,
      });
    });
    var data = {
      sow_number: document.getElementById('sowNumber').value.trim(),
      client_id: parseInt(document.getElementById('sowClient').value, 10),
      quote_id: document.getElementById('sowQuote').value ? parseInt(document.getElementById('sowQuote').value, 10) : null,
      sow_date: document.getElementById('sowDate').value,
      effective_start: document.getElementById('sowStart').value,
      effective_end: document.getElementById('sowEnd').value,
      notes: document.getElementById('sowNotes').value.trim(),
      items: items,
    };
    try {
      if (window.sowAmend) {
        await apiCall('POST', '/api/sows/' + window.sowAmend + '/amend', data);
        showToast('Amendment draft created', 'success');
      } else if (window.sowEdit) {
        await apiCall('PUT', '/api/sows/' + window.sowEdit, data);
        showToast('New SOW version created', 'success');
      } else {
        await apiCall('POST', '/api/sows', data);
        showToast('SOW created', 'success');
      }
      closeSOWModal();
      loadSOWs();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('sowStart').addEventListener('input', function () {
    syncSowEndFromMonths();
    syncSowMonthsFromEnd();
  });

  document.getElementById('sowEffectiveMonths').addEventListener('input', function () {
    syncSowEndFromMonths();
  });

  document.getElementById('sowEnd').addEventListener('input', function () {
    syncSowMonthsFromEnd();
  });

  document.getElementById('sowDocumentUploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fileInput = document.getElementById('sowDocumentFile');
    if (!fileInput.files || !fileInput.files[0]) {
      showToast('Please choose a SOW file to upload', 'danger');
      return;
    }
    var fd = new FormData();
    fd.append('quote_id', document.getElementById('sowDocumentQuote').value);
    fd.append('file', fileInput.files[0]);
    try {
      var res = await apiCall('POST', '/api/sows/documents/upload', fd);
      showToast('Documents saved in folder ' + res.data.folderName, 'success');
      closeSowDocumentUploadModal();
      loadLinkedDocumentLibrary();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  document.getElementById('sowLinkPOForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var folderName = document.getElementById('sowLinkPOFolderName').value.trim();
    var poNumber = document.getElementById('sowLinkPONumber').value.trim();
    var fileInput = document.getElementById('sowLinkPOFile');
    if (!folderName) {
      showToast('Folder name is missing', 'danger');
      return;
    }
    if (!poNumber) {
      showToast('Please enter a PO number', 'danger');
      return;
    }
    if (!fileInput.files || !fileInput.files[0]) {
      showToast('Please choose a PO file to upload', 'danger');
      return;
    }

    var fd = new FormData();
    fd.append('folder', folderName);
    fd.append('po_number', poNumber);
    fd.append('file', fileInput.files[0]);
    try {
      var res = await apiCall('POST', '/api/sows/documents/link-po', fd);
      showToast('PO file linked in folder ' + res.data.folderName, 'success');
      closeSowLinkPOModal();
      loadLinkedDocumentLibrary();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  document.getElementById('btnAddSowItem').addEventListener('click', function () { addSowItemRow(); });
  document.getElementById('sowFilterClient').addEventListener('change', loadSOWs);
  document.getElementById('sowFilterStatus').addEventListener('change', loadSOWs);
  document.getElementById('sowDocumentSearch').addEventListener('input', loadLinkedDocumentLibrary);
  document.getElementById('sowDocumentFilterClient').addEventListener('input', loadLinkedDocumentLibrary);
  document.getElementById('sowDocumentFilterCandidate').addEventListener('input', loadLinkedDocumentLibrary);
  document.getElementById('sowDocumentFilterRole').addEventListener('input', loadLinkedDocumentLibrary);
  document.getElementById('sowDocumentFilterSow').addEventListener('input', loadLinkedDocumentLibrary);

  // Load quotes when client changes
  document.getElementById('sowClient').addEventListener('change', function () {
    loadQuotesForClient(this.value);
  });

  // Initialize search
  initTableSearch('sowsSearch', 'sowsBody');
  document.getElementById('sowsSearch').addEventListener('input', function () {
    setTimeout(updateSowsVisibleCount, 250);
  });

  loadClients().then(function () {
    loadSOWs();
    loadLinkedDocumentLibrary();
  });
})();
