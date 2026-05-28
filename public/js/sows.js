(function () {
  // openModal / closeModal provided by app.js
  var sowActionMap = {};
  var sowClientMap = {};
  var sowDocumentUploadMode = 'with-quote';
  var sowFormSubmitting = false;
  var quoteSideNoteMarker = '\n\n---SIDE_NOTE---\n';

  function setSowFormSubmitting(isSubmitting) {
    sowFormSubmitting = !!isSubmitting;
    var form = document.getElementById('sowForm');
    if (!form) return;
    var submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton) return;
    submitButton.disabled = sowFormSubmitting;
    var label = submitButton.querySelector('.sow-submit-label');
    if (label) {
      label.textContent = sowFormSubmitting ? 'Saving...' : 'Save';
    } else {
      submitButton.textContent = sowFormSubmitting ? 'Saving...' : 'Save';
    }
  }

  window.openSowDocumentUploadModal = async function () {
    document.getElementById('sowDocumentUploadForm').reset();
    document.getElementById('sowDocumentReferenceDate').value = toDateInputValue(new Date());
    sowDocumentUploadMode = 'with-quote';
    updateSowDocumentUploadMode();
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
    var startLastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    var targetMonthIndex = start.getMonth() + count;
    if (start.getDate() === startLastDay) {
      var endLastDay = new Date(start.getFullYear(), targetMonthIndex + 1, 0).getDate();
      return toDateInputValue(new Date(start.getFullYear(), targetMonthIndex, endLastDay));
    }
    var anniversary = new Date(start.getFullYear(), targetMonthIndex, 1);
    var anniversaryLastDay = new Date(anniversary.getFullYear(), anniversary.getMonth() + 1, 0).getDate();
    anniversary.setDate(Math.min(start.getDate(), anniversaryLastDay));
    anniversary.setDate(anniversary.getDate() - 1);
    return toDateInputValue(anniversary);
  }

  function getInclusiveMonthSpan(startValue, endValue) {
    var start = parseDateInput(startValue);
    var end = parseDateInput(endValue);
    if (!start || !end) return '';
    if (end < start) return '';
    return getEffectiveMonthCount(startValue, endValue);
  }

  function getEffectiveMonthCount(startValue, endValue) {
    var start = parseDateInput(startValue);
    var end = parseDateInput(endValue);
    if (!start || !end || end < start) return 0;
    var monthDiff = ((end.getFullYear() - start.getFullYear()) * 12) + (end.getMonth() - start.getMonth());
    return Math.max(monthDiff + (end.getDate() > start.getDate() ? 1 : 0), 1);
  }

  function calculateSowItemTotal(row) {
    if (!row) return 0;
    var monthlyAmount = parseFloat(row.querySelector('.si-amt').value) || 0;
    var quantity = parseInt(row.querySelector('.si-qty').value, 10) || 1;
    var months = getEffectiveMonthCount(row.querySelector('.si-valid-from').value, row.querySelector('.si-valid-to').value);
    return Math.round(monthlyAmount * quantity * months * 100) / 100;
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

  function extractStructuredField(notes, label, nextLabels) {
    var raw = String(notes || '');
    var escapedLabel = String(label || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var lookAhead = (nextLabels || []).map(function (item) {
      return '\\n' + String(item || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':';
    }).join('|');
    var endOfInput = '(?![\\s\\S])';
    var pattern = new RegExp('^\\s*' + escapedLabel + ':\\s*\\n?([\\s\\S]*?)(?=' + (lookAhead || endOfInput) + '|' + endOfInput + ')', 'im');
    var match = raw.match(pattern);
    return match ? match[1].trim() : '';
  }

  function getMailFormatNotes(notes) {
    var raw = String(notes || '');
    var markerIndex = raw.indexOf(quoteSideNoteMarker);
    return markerIndex === -1 ? raw : raw.slice(0, markerIndex);
  }

  function getQuoteCandidateLabel(quote) {
    return extractStructuredField(getMailFormatNotes(quote && quote.notes), 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']) || '';
  }

  function getQuoteRoleLabel(quote) {
    if (quote && quote.primary_description) return String(quote.primary_description).trim();
    if (quote && quote.item_descriptions && quote.item_descriptions.length) return String(quote.item_descriptions[0] || '').trim();
    return extractStructuredField(getMailFormatNotes(quote && quote.notes), 'Designation', ['Dear', 'Body', 'Regards']) || '';
  }

  function populateSowDocumentClientOptions() {
    var sel = document.getElementById('sowDocumentClient');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select</option>';
    Object.keys(sowClientMap).forEach(function (key) {
      var client = sowClientMap[key];
      sel.innerHTML += '<option value="' + client.id + '">' + escapeHtml(getClientDisplayName(client)) + '</option>';
    });
  }

  function updateSowDocumentUploadMode() {
    var useQuote = sowDocumentUploadMode === 'with-quote';
    document.getElementById('sowDocumentQuoteFields').classList.toggle('hidden', !useQuote);
    document.getElementById('sowDocumentManualFields').classList.toggle('hidden', useQuote);
    document.getElementById('sowDocumentQuote').required = useQuote;
    document.getElementById('sowDocumentClient').required = !useQuote;
    document.getElementById('sowDocumentCandidate').required = !useQuote;
    document.getElementById('sowDocumentReferenceDate').required = !useQuote;
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
    document.getElementById('sowDate').value = toDateInputValue(new Date());
    document.getElementById('sowEffectiveMonths').value = '';
    setSowFormSubmitting(false);
    openModal('sowModal');
  };
  window.closeSOWModal = function () {
    setSowFormSubmitting(false);
    closeModal('sowModal');
  };

  var statusBadge = function (s) {
    var map = { Draft: 'badge-processing', 'Amendment Draft': 'badge-processing', Signed: 'badge-success', Active: 'badge-success', Inactive: 'badge-warning', Expired: 'badge-warning', Terminated: 'badge-error' };
    return '<span class="' + (map[s] || 'badge-processing') + '">' + s + '</span>';
  };

  function formatRoleSummary(sow) {
    var roles = Array.isArray(sow.roles) ? sow.roles : [];
    var text = roles.filter(Boolean).join(', ') || sow.role_summary || '---';
    return '<div class="table-cell-box table-cell-text" title="' + escapeHtml(text) + '">' + escapeHtml(text) + '</div>';
  }

  function isCleanPersonName(value) {
    return /^[A-Za-z ]+$/.test(String(value || '').trim());
  }

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      sowClientMap = {};
      (res.data || []).forEach(function (client) {
        sowClientMap[String(client.id)] = client;
      });
      populateSowDocumentClientOptions();
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
        var role = getQuoteRoleLabel(q) || 'Role not set';
        sel.innerHTML += '<option value="' + q.id + '">' + escapeHtml(q.quote_number) + ' (' + escapeHtml(role) + ')</option>';
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
        var candidate = getQuoteCandidateLabel(q);
        var role = getQuoteRoleLabel(q);
        var descriptor = [role, candidate].filter(Boolean).join(' / ');
        var label = q.quote_number || '';
        if (descriptor) label += ' | ' + descriptor;
        sel.innerHTML += '<option value="' + q.id + '">' + escapeHtml(label) + '</option>';
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
      var approvalMap = await loadMyPendingApprovalMap('sows');
      updateSowsSummary(res.data || []);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-on-surface-variant py-8">No SOWs found</td></tr>';
      } else {
        sowActionMap = {};
        tbody.innerHTML = res.data.map(function (s) {
          var client = sowClientMap[String(s.client_id)] || null;
          var clientDisplay = client ? getClientDisplayName(client) : (s.client_name || '');
          var clientFullName = client ? (client.client_name || clientDisplay) : (s.client_name || clientDisplay);
          var VALID_TRANSITIONS = { Draft: ['Signed'], 'Amendment Draft': ['Signed'], Signed: ['Inactive'], Active: ['Inactive'], Inactive: ['Active'], Expired: [], Terminated: [] };
          var allowed = VALID_TRANSITIONS[s.status] || [];
          var approvalBadge = adminApprovalAwaitedBadge(approvalMap['sow:' + s.id]);
          sowActionMap[s.id] = {
            id: s.id,
            clientId: s.client_id,
            status: s.status,
            allowed: allowed.slice()
          };

          var actionsHtml = '<button class="btn-secondary btn-sm table-action-trigger inline-flex items-center justify-center" title="Open SOW actions" aria-label="Open SOW actions" onclick="openSOWActions(' + s.id + ')"><span class="material-symbols-outlined text-base">more_horiz</span></button>';

          return '<tr>' +
            '<td><div class="table-cell-box table-cell-stack"><span class="entity-pill entity-pill-strong">' + escapeHtml(s.sow_number) + '</span></div></td>' +
            '<td><div class="table-cell-box table-cell-stack"><span class="entity-pill" title="' + escapeHtml(clientFullName) + '">' + escapeHtml(clientDisplay) + '</span><span class="table-cell-secondary" title="' + escapeHtml(clientFullName) + '">' + escapeHtml(clientFullName) + '</span></div></td>' +
            '<td>' + formatRoleSummary(s) + '</td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(s.sow_date) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(s.effective_start) + '</span></div></td>' +
            '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(s.effective_end) + '</span></div></td>' +
            '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(s.total_value) + '</span></div></td>' +
            '<td><div class="table-cell-box flex-col gap-1">' + statusBadge(s.status) + approvalBadge + '</div></td>' +
            '<td class="text-center"><div class="table-cell-box table-cell-center">' + actionsHtml + '</div></td>' +
            '</tr>';
        }).join('');
        Array.from(tbody.querySelectorAll('tr')).forEach(function (row, index) {
          var s = res.data[index];
          if (!s) return;
          var client = sowClientMap[String(s.client_id)] || null;
          var clientDisplay = client ? getClientDisplayName(client) : (s.client_name || '');
          var roles = Array.isArray(s.roles) ? s.roles.join(' ') : (s.role_summary || '');
          row.setAttribute('data-sow-search', [
            s.sow_number || '',
            s.base_sow_number || '',
            clientDisplay || '',
            s.client_name || '',
            roles || '',
            s.status || '',
          ].join(' ').toLowerCase());
        });
      }
      initTableSort('sowsTable');
      if (document.getElementById('sowsSearch') && document.getElementById('sowsSearch').value.trim()) {
        applySowSearch();
      } else {
        updateSowsVisibleCount();
      }
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  window.openSOWActions = async function (id) {
    var actionState = sowActionMap[id];
    var container = document.getElementById('sowActionList');
    var title = document.getElementById('sowActionTitle');
    var STATUS_LABELS = { Signed: 'Mark Signed', Active: 'Mark Active', Inactive: 'Mark Inactive', Expired: 'Mark Expired', Terminated: 'Terminate', Draft: 'Revert to Draft' };

    if (!actionState || !container || !title) return;

    title.textContent = 'SOW Actions';
    container.innerHTML = '<div class="py-3"><div class="loading-spinner"></div></div>';
    openModal('sowActionModal');

    var linkedPOs = [];
    try {
      var associations = await apiCall('GET', '/api/sows/' + actionState.id + '/associations');
      linkedPOs = ((associations.data && associations.data.purchaseOrders) || []).filter(function (po) {
        return po && po.po_number;
      });
    } catch { /* Keep actions available even if association lookup fails. */ }

    var linkedPoLabel = linkedPOs.map(function (po) { return po.po_number; }).join(', ');
    container.innerHTML = linkedPOs.length
      ? '<div class="sow-linked-po-note"><span class="material-symbols-outlined">link</span><span><strong>Linked to ' + escapeHtml(linkedPoLabel) + '</strong><small>Existing purchase order connection</small></span></div>'
      : '';
    container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runSOWActionView(' + actionState.id + ')"><span class="material-symbols-outlined">visibility</span><span><strong>View details</strong><small>Open SOW summary, line items, and notes</small></span></button>';

    if (actionState.status === 'Draft' || actionState.status === 'Amendment Draft' || actionState.status === 'Signed' || actionState.status === 'Active') {
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runSOWActionEdit(' + actionState.id + ')"><span class="material-symbols-outlined">edit</span><span><strong>Edit SOW</strong><small>Update dates, role items, value, and notes</small></span></button>';
    }

    actionState.allowed.forEach(function (st) {
      var icon = st === 'Inactive' ? 'pause_circle' : (st === 'Active' ? 'play_circle' : 'task_alt');
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runSOWActionStatus(' + actionState.id + ', \'' + st + '\')"><span class="material-symbols-outlined">' + icon + '</span><span><strong>' + (STATUS_LABELS[st] || st) + '</strong><small>Change the lifecycle status for this SOW</small></span></button>';
    });

    if (actionState.status === 'Signed' || actionState.status === 'Active') {
      var linkPoLabel = linkedPOs.length ? 'Link new PO' : 'Link PO';
      var linkPoHelp = linkedPOs.length ? 'Create another purchase order linked to this SOW' : 'Start a purchase order linked to this SOW';
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runSOWActionLinkPO(' + actionState.id + ', ' + actionState.clientId + ')"><span class="material-symbols-outlined">receipt_long</span><span><strong>' + linkPoLabel + '</strong><small>' + linkPoHelp + '</small></span></button>';
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runSOWActionAmendment(' + actionState.id + ')"><span class="material-symbols-outlined">edit_document</span><span><strong>Make amendment</strong><small>Create an amendment draft from this SOW</small></span></button>';
    }

    if (actionState.status === 'Draft' || actionState.status === 'Amendment Draft') {
      container.innerHTML += '<button type="button" class="action-sheet-btn action-sheet-btn-danger" onclick="runSOWActionDelete(' + actionState.id + ')"><span class="material-symbols-outlined">delete</span><span><strong>Delete SOW</strong><small>Remove this draft SOW from the register</small></span></button>';
    }
  };

  window.closeSOWActions = function () {
    closeModal('sowActionModal');
  };

  window.runSOWActionView = function (id) {
    closeSOWActions();
    viewSOW(id);
  };

  window.runSOWActionEdit = function (id) {
    closeSOWActions();
    editSOW(id);
  };

  window.runSOWActionStatus = async function (id, status) {
    closeSOWActions();
    if (status === 'Inactive') {
      var ok = await confirmSowInactive(id);
      if (!ok) return;
    } else if (status === 'Active') {
      var activateOk = await confirmAction('Mark SOW Active', 'This will make the SOW available again for rate cards and billing. Continue?');
      if (!activateOk) return;
    }
    changeSOWStatus(id, status);
  };

  async function confirmSowInactive(id) {
    var detailText = '';
    try {
      var res = await apiCall('GET', '/api/sows/' + id + '/associations');
      var pos = res.data.purchaseOrders || [];
      var rateCards = res.data.rateCards || [];
      var poLabel = pos.length === 1 ? '1 purchase order' : pos.length + ' purchase orders';
      var rcLabel = rateCards.length === 1 ? '1 rate card' : rateCards.length + ' rate cards';
      if (pos.length || rateCards.length) {
        var poDetails = pos.map(function (po) {
          return '- PO ' + (po.po_number || 'number not added') + ': ' + (po.status || 'Status not set');
        }).join('\n');
        detailText = '\n\nLinked information:\n- ' + poLabel + ' connected\n- ' + rcLabel + ' connected';
        if (poDetails) detailText += '\n' + poDetails;
        detailText += '\n- Existing linked POs will stay as they are';
      }
    } catch (err) { /* ignore association lookup failure */ }
    return confirmAction('Mark SOW Inactive', 'This will inactivate the SOW.\n\nWhat changes:\n- Stops billing for active rate cards linked to this SOW\n- Prevents new rate cards and POs from using this SOW\n- You can mark it active again later' + detailText);
  }

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
    if (item && item.id) row.setAttribute('data-sow-item-id', item.id);
    var defaultFrom = (item && item.valid_from) || document.getElementById('sowStart').value || '';
    var defaultTo = (item && item.valid_to) || document.getElementById('sowEnd').value || '';
    var sowStart = document.getElementById('sowStart').value || '';
    var sowEnd = document.getElementById('sowEnd').value || '';
    row.innerHTML =
      '<td><input type="text" class="si-role" value="' + (item ? escapeHtml(item.role_position) : '') + '" required></td>' +
      '<td><input type="number" class="si-qty" value="' + (item ? item.quantity : 1) + '" min="1"></td>' +
      '<td><input type="number" class="si-amt" value="' + (item ? item.amount : '') + '" step="0.01" min="0"></td>' +
      '<td class="text-right"><span class="si-total table-amount-pill">' + formatCurrency(0) + '</span></td>' +
      '<td><div class="sow-duration-grid"><label><span>From</span><input type="date" class="si-valid-from" value="' + escapeHtml(defaultFrom) + '" min="' + escapeHtml(sowStart) + '" max="' + escapeHtml(sowEnd) + '" required></label><label><span>Till</span><input type="date" class="si-valid-to" value="' + escapeHtml(defaultTo) + '" min="' + escapeHtml(defaultFrom || sowStart) + '" max="' + escapeHtml(sowEnd) + '" required></label></div></td>' +
      '<td><button type="button" class="btn-danger btn-sm inline-flex items-center" onclick="this.closest(\'tr\').remove();recalcSOW()"><span class="material-symbols-outlined text-base">close</span></button></td>';
    tbody.appendChild(row);

    row.querySelector('.si-amt').addEventListener('input', recalcSOW);
    row.querySelector('.si-qty').addEventListener('input', recalcSOW);
    row.querySelector('.si-valid-from').addEventListener('change', function () {
      var till = row.querySelector('.si-valid-to');
      till.min = this.value || sowStart;
      if (till.value && this.value && till.value < this.value) till.value = this.value;
      recalcSOW();
    });
    row.querySelector('.si-valid-to').addEventListener('change', recalcSOW);
    recalcSOW();
  }

  window.recalcSOW = function () {
    var total = 0;
    document.querySelectorAll('#sowItemsBody tr').forEach(function (row) {
      var lineTotal = calculateSowItemTotal(row);
      var totalEl = row.querySelector('.si-total');
      if (totalEl) totalEl.textContent = formatCurrency(lineTotal);
      total += lineTotal;
    });
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
      html += '<table class="stitch-table"><thead><tr><th>Role / Position</th><th class="text-center">Qty</th><th class="text-right">Monthly Amount</th><th class="text-right">Total</th><th>Duration</th></tr></thead><tbody>';
      s.items.forEach(function (item) {
        var duration = (item.valid_from || item.valid_to) ? (formatDate(item.valid_from) + ' to ' + formatDate(item.valid_to)) : 'Full SOW duration';
        var itemTotal = Math.round((Number(item.amount || 0) * Number(item.quantity || 1) * getEffectiveMonthCount(item.valid_from || s.effective_start, item.valid_to || s.effective_end)) * 100) / 100;
        html += '<tr><td>' + escapeHtml(item.role_position) + '</td><td class="text-center">' + item.quantity + '</td><td class="text-right">' + formatCurrency(item.amount) + '</td><td class="text-right">' + formatCurrency(itemTotal) + '</td><td>' + escapeHtml(duration) + '</td></tr>';
      });
      html += '</tbody></table>';
      html += '</div>';
      document.getElementById('sowDetailContent').innerHTML = html;
      openModal('sowDetailModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.changeSOWStatus = async function (id, status) {
    try {
      var res = await apiCall('PATCH', '/api/sows/' + id + '/status', { status: status });
      if (handleApprovalResponse(res, loadSOWs)) return;
      showToast('SOW status updated to ' + status, 'success');
      loadSOWs();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.deleteSOW = async function (id) {
    var confirmed = await confirmAction('Delete SOW', 'Are you sure you want to delete this SOW? This cannot be undone.');
    if (!confirmed) return;
    try {
      var res = await apiCall('DELETE', '/api/sows/' + id);
      if (handleApprovalResponse(res, loadSOWs)) return;
      showToast('SOW deleted', 'success');
      loadSOWs();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  document.getElementById('sowForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (sowFormSubmitting) return;
    if (document.getElementById('sowStart').value && document.getElementById('sowEnd').value && document.getElementById('sowStart').value > document.getElementById('sowEnd').value) {
      showToast('Start date must be less than or equal to end date', 'danger');
      return;
    }
    var items = [];
    document.querySelectorAll('#sowItemsBody tr').forEach(function (row) {
      var itemId = parseInt(row.getAttribute('data-sow-item-id'), 10);
      items.push({
        id: Number.isFinite(itemId) ? itemId : undefined,
        role_position: row.querySelector('.si-role').value.trim(),
        quantity: parseInt(row.querySelector('.si-qty').value, 10) || 1,
        amount: parseFloat(row.querySelector('.si-amt').value) || 0,
        valid_from: row.querySelector('.si-valid-from').value,
        valid_to: row.querySelector('.si-valid-to').value,
      });
    });
    for (var i = 0; i < items.length; i += 1) {
      if (!items[i].valid_from || !items[i].valid_to) {
        showToast('Select duration dates for every SOW line item', 'danger');
        return;
      }
      if (items[i].valid_from > items[i].valid_to) {
        showToast('Line item duration start must be before duration end', 'danger');
        return;
      }
      if (items[i].valid_from < document.getElementById('sowStart').value || items[i].valid_to > document.getElementById('sowEnd').value) {
        showToast('Line item duration must stay within the SOW effective dates', 'danger');
        return;
      }
    }
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
      setSowFormSubmitting(true);
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
    finally { setSowFormSubmitting(false); }
  });

  document.getElementById('sowStart').addEventListener('input', function () {
    syncSowMonthsFromEnd();
    recalcSOW();
  });

  document.getElementById('sowEnd').addEventListener('input', function () {
    syncSowMonthsFromEnd();
    recalcSOW();
  });

  document.getElementById('sowDocumentUploadForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var fileInput = document.getElementById('sowDocumentFile');
    if (!fileInput.files || !fileInput.files[0]) {
      showToast('Please choose a SOW file to upload', 'danger');
      return;
    }
    var fd = new FormData();
    fd.append('upload_mode', sowDocumentUploadMode);
    if (sowDocumentUploadMode === 'with-quote') {
      fd.append('quote_id', document.getElementById('sowDocumentQuote').value);
    } else {
      var candidateName = document.getElementById('sowDocumentCandidate').value.trim();
      if (candidateName && !isCleanPersonName(candidateName)) {
        showToast('Candidate name can contain only letters and spaces', 'danger');
        return;
      }
      fd.append('client_id', document.getElementById('sowDocumentClient').value);
      fd.append('candidate_name', candidateName);
      fd.append('role', document.getElementById('sowDocumentRole').value.trim());
      fd.append('sow_number', document.getElementById('sowDocumentManualSowNumber').value.trim());
      fd.append('reference_date', document.getElementById('sowDocumentReferenceDate').value);
    }
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
  document.querySelectorAll('input[name="sowDocumentUploadMode"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      sowDocumentUploadMode = this.value;
      updateSowDocumentUploadMode();
    });
  });
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

  function applySowSearch() {
    var input = document.getElementById('sowsSearch');
    var tbody = document.getElementById('sowsBody');
    var query = input ? input.value.toLowerCase().trim() : '';
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(function (row) {
      if (row.querySelector('td[colspan]')) { row.style.display = ''; return; }
      var indexed = row.getAttribute('data-sow-search') || row.textContent.toLowerCase();
      row.style.display = indexed.indexOf(query) !== -1 ? '' : 'none';
    });
    updateSowsVisibleCount();
  }

  document.getElementById('sowsSearch').addEventListener('input', function () {
    setTimeout(applySowSearch, 120);
  });

  loadClients().then(function () {
    loadSOWs();
    loadLinkedDocumentLibrary();
  });
})();
