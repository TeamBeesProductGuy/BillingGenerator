(function () {
  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)
  var quoteSideNoteMarker = '\n\n---SIDE_NOTE---\n';
  var quoteMailBodyLines = [
    'Please refer to the following quote with best fitment to the requirements:',
    '1. Cost of resource (per man month):',
    '[Quote table will be inserted automatically in the Word document]',
    '2. Prevailing taxes, GST extra as applicable',
    '3. Location: [Auto-filled from line item locations]',
    '4. This Quote is valid till 10 days',
    '',
    'Kindly issue the Purchase Order (PO).'
  ];
  var defaultQuoteBody = quoteMailBodyLines.join('\n');
  var quoteValidUntilTouched = false;

  var quoteNotesTemplate = [
    'Subject:',
    '[Write subject here]',
    '',
    'Candidate:',
    '[Write candidate name here]',
    '',
    'Dear:',
    '[Write recipient name here]',
    '',
    'Body:',
    defaultQuoteBody,
    '',
    'Regards:',
    '[Write sender name here]',
    '',
    'Designation:',
    '[Write designation here]'
  ].join('\n');

  function getDefaultQuoteFormFields() {
    return {
      subject: '',
      candidateName: '',
      recipient: '',
      body: defaultQuoteBody,
      sender: '',
      designation: '',
    };
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractStructuredField(mailText, label, nextLabels) {
    var lookAhead = nextLabels.map(function (item) {
      return '\\n' + escapeRegex(item) + ':';
    }).join('|');
    var endOfInput = '(?![\\s\\S])';
    var pattern = new RegExp(
      '^\\s*' + escapeRegex(label) + ':\\s*\\n?([\\s\\S]*?)(?=' + (lookAhead || endOfInput) + '|' + endOfInput + ')',
      'im'
    );
    var match = String(mailText || '').match(pattern);
    return match ? match[1].trim() : '';
  }

  function collectQuoteItemLocations() {
    var locations = [];
    document.querySelectorAll('#quoteItemsBody .qi-loc').forEach(function (input) {
      var value = String(input.value || '').trim();
      if (!value) return;
      var exists = locations.some(function (item) { return item.toLowerCase() === value.toLowerCase(); });
      if (!exists) locations.push(value);
    });
    return locations;
  }

  function toLocalDateInputValue(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function addDaysToInputDate(dateValue, days) {
    if (!dateValue) return '';
    var parts = String(dateValue).split('-').map(function (item) { return parseInt(item, 10); });
    if (parts.length !== 3 || parts.some(isNaN)) return '';
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    date.setDate(date.getDate() + days);
    return toLocalDateInputValue(date);
  }

  function getValidityDaysText() {
    var quoteDate = document.getElementById('quoteDate').value;
    var validUntil = document.getElementById('quoteValidUntil').value;
    if (!quoteDate || !validUntil) return '10 days';
    var start = new Date(quoteDate + 'T00:00:00');
    var end = new Date(validUntil + 'T00:00:00');
    var diffMs = end.getTime() - start.getTime();
    var diffDays = Number.isFinite(diffMs) ? Math.round(diffMs / 86400000) : 10;
    if (diffDays <= 0) return '0 days';
    return diffDays === 1 ? '1 day' : diffDays + ' days';
  }

  function updateQuoteValidityLine() {
    var bodyEl = document.getElementById('quoteBody');
    if (!bodyEl) return;
    var lines = String(bodyEl.value || '').split(/\r?\n/);
    var validityLine = '4. This Quote is valid till ' + getValidityDaysText();
    var found = false;
    lines = lines.map(function (line) {
      if (/^4\.\s*This Quote is valid till\b/i.test(String(line).trim())) {
        found = true;
        return validityLine;
      }
      return line;
    });
    if (!found) {
      var insertAt = -1;
      lines.forEach(function (line, index) {
        if (/^3\.\s*Location\s*:/i.test(String(line).trim())) insertAt = index + 1;
      });
      if (insertAt === -1) {
        lines.push(validityLine);
      } else {
        lines.splice(insertAt, 0, validityLine);
      }
    }
    bodyEl.value = lines.join('\n');
  }

  function syncValidUntilFromQuoteDate(force) {
    var quoteDate = document.getElementById('quoteDate').value;
    var validUntilEl = document.getElementById('quoteValidUntil');
    if (!quoteDate || !validUntilEl) return;
    if (!force && quoteValidUntilTouched && validUntilEl.value) {
      updateQuoteValidityLine();
      return;
    }
    validUntilEl.value = addDaysToInputDate(quoteDate, 10);
    updateQuoteValidityLine();
  }

  function buildQuoteMailFormat(fields) {
    var resolved = fields || getDefaultQuoteFormFields();
    return [
      'Subject:',
      resolved.subject || '[Write subject here]',
      '',
      'Candidate:',
      resolved.candidateName || '[Write candidate name here]',
      '',
      'Dear:',
      resolved.recipient || '[Write recipient name here]',
      '',
      'Body:',
      resolved.body || defaultQuoteBody,
      '',
      'Regards:',
      resolved.sender || '[Write sender name here]',
      '',
      'Designation:',
      resolved.designation || '[Write designation here]'
    ].join('\n');
  }

  function parseQuoteMailFormat(mailText) {
    var normalized = String(mailText || '').trim();
    if (!normalized) return getDefaultQuoteFormFields();
    var structuredSubject = extractStructuredField(normalized, 'Subject', ['Candidate', 'Dear', 'Body', 'Regards', 'Designation']);
    var structuredCandidate = extractStructuredField(normalized, 'Candidate', ['Dear', 'Body', 'Regards', 'Designation']);
    var structuredRecipient = extractStructuredField(normalized, 'Dear', ['Body', 'Regards', 'Designation']);
    var structuredBody = extractStructuredField(normalized, 'Body', ['Regards', 'Designation']);
    var structuredSender = extractStructuredField(normalized, 'Regards', ['Designation']);
    var structuredDesignation = extractStructuredField(normalized, 'Designation', []);

    if (structuredSubject || structuredCandidate || structuredRecipient || structuredBody || structuredSender || structuredDesignation) {
      return {
        subject: structuredSubject === '[Write subject here]' ? '' : structuredSubject,
        candidateName: (structuredCandidate || '') === '[Write candidate name here]'
          ? ''
          : structuredCandidate,
        recipient: structuredRecipient === '[Write recipient name here]' ? '' : structuredRecipient,
        body: structuredBody || defaultQuoteBody,
        sender: structuredSender === '[Write sender name here]' ? '' : structuredSender,
        designation: structuredDesignation === '[Write designation here]' ? '' : structuredDesignation,
      };
    }

    return {
      subject: extractStructuredField(normalized, 'Subject', ['Candidate', 'Dear', 'Body', 'Regards', 'Designation']).replace(/^Subject:\s*/i, '').trim(),
      candidateName: '',
      recipient: (function () {
        var dearLine = String(normalized || '').match(/^\s*Dear\s+(.+)$/im);
        return dearLine ? dearLine[1].replace(/,\s*$/, '').trim() : '';
      })(),
      body: defaultQuoteBody,
      sender: normalized.split(/\r?\n/).filter(Boolean).slice(-1)[0] === '[Write sender name here]'
        ? ''
        : normalized.split(/\r?\n/).filter(Boolean).slice(-1)[0] || '',
      designation: '',
    };
  }

  function setQuoteMailFormFields(fields) {
    var values = fields || getDefaultQuoteFormFields();
    document.getElementById('quoteSubject').value = values.subject || '';
    document.getElementById('quoteCandidateName').value = values.candidateName || '';
    document.getElementById('quoteRecipient').value = values.recipient || '';
    document.getElementById('quoteBody').value = values.body || defaultQuoteBody;
    document.getElementById('quoteSender').value = values.sender || '';
    document.getElementById('quoteDesignation').value = values.designation || '';
  }

  function getQuoteMailFormFields() {
    return {
      subject: document.getElementById('quoteSubject').value.trim(),
      candidateName: document.getElementById('quoteCandidateName').value.trim(),
      recipient: document.getElementById('quoteRecipient').value.trim(),
      body: document.getElementById('quoteBody').value.trim() || defaultQuoteBody,
      sender: document.getElementById('quoteSender').value.trim(),
      designation: document.getElementById('quoteDesignation').value.trim(),
    };
  }

  function splitStoredQuoteNotes(notes) {
    var raw = String(notes || '');
    var markerIndex = raw.indexOf(quoteSideNoteMarker);
    if (markerIndex === -1) {
      return {
        mailFormat: raw || quoteNotesTemplate,
        sideNote: '',
      };
    }
    return {
      mailFormat: raw.slice(0, markerIndex).trim() || quoteNotesTemplate,
      sideNote: raw.slice(markerIndex + quoteSideNoteMarker.length).trim(),
    };
  }

  function buildStoredQuoteNotes(mailFormat, sideNote) {
    var mail = String(mailFormat || '').trim();
    var side = String(sideNote || '').trim();
    if (!side) return mail;
    return mail + quoteSideNoteMarker + side;
  }

  window.openQuoteModal = function () {
    document.getElementById('quoteForm').reset();
    document.getElementById('quoteItemsBody').innerHTML = '';
    document.getElementById('quoteModalTitle').textContent = 'Create Quote';
    document.getElementById('quoteId').value = '';
    quoteValidUntilTouched = false;
    setQuoteMailFormFields(getDefaultQuoteFormFields());
    document.getElementById('quoteDate').value = toLocalDateInputValue(new Date());
    syncValidUntilFromQuoteDate(true);
    document.getElementById('quoteSideNote').value = '';
    window.quoteEdit = null;
    addItemRow();
    openModal('quoteModal');
  };
  window.closeQuoteModal = function () { closeModal('quoteModal'); };
  window.closeConvertSowModal = function () { closeModal('convertSowModal'); };

  var statusBadge = function (s) {
    var map = { Draft: 'badge-processing', Sent: 'badge-processing', Accepted: 'badge-success', Rejected: 'badge-error', Expired: 'badge-warning' };
    return '<span class="' + (map[s] || 'badge-processing') + '">' + s + '</span>';
  };

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      ['quoteFilterClient', 'quoteClient'].forEach(function (id) {
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

  async function loadSowsForClient(clientId) {
    var sel = document.getElementById('convertExistingSowId');
    if (!sel) return;
    sel.innerHTML = '<option value="">Select SOW</option>';
    if (!clientId) return;
    try {
      var res = await apiCall('GET', '/api/sows?clientId=' + clientId);
      res.data.forEach(function (s) {
        sel.innerHTML += '<option value="' + s.id + '">' + escapeHtml(s.sow_number) + ' (' + escapeHtml(s.status) + ')</option>';
      });
    } catch (e) { /* ignore */ }
  }

  function syncConvertSowMode() {
    var mode = document.getElementById('convertSowMode').value;
    document.getElementById('convertExistingSowSection').classList.toggle('hidden', mode !== 'existing');
    document.getElementById('convertNewSowSection').classList.toggle('hidden', mode !== 'new');
  }

  async function loadQuotes() {
    var tbody = document.getElementById('quotesBody');
    showLoading(tbody);
    try {
      var cid = document.getElementById('quoteFilterClient').value;
      var status = document.getElementById('quoteFilterStatus').value;
      var url = '/api/quotes?';
      if (cid) url += 'clientId=' + cid + '&';
      if (status) url += 'status=' + status;
      var res = await apiCall('GET', url);
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-on-surface-variant py-8">No quotes found</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (q) {
          var actionsHtml = '<div class="inline-flex items-center gap-1">';
          if (q.status === 'Draft') {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editQuote(' + q.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>';
          }
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="viewQuote(' + q.id + ')" title="View"><span class="material-symbols-outlined text-base">visibility</span></button>';
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="downloadFile(\'/api/quotes/' + q.id + '/download\')" title="Download DOCX"><span class="material-symbols-outlined text-base">description</span></button>';

          // Status actions — show only valid transitions
          var VALID_TRANSITIONS = {
            Draft: ['Sent'],
            Sent: ['Accepted', 'Rejected'],
            Rejected: ['Draft'],
            Accepted: [],
            Expired: []
          };
          var STATUS_LABELS = { Sent: 'Mark Sent', Accepted: 'Accept', Rejected: 'Reject', Draft: 'Revert to Draft', Expired: 'Mark Expired' };
          var allowed = VALID_TRANSITIONS[q.status] || [];

          actionsHtml += '<div class="relative inline-block" id="quoteMenu' + q.id + '">';
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="toggleQuoteMenu(' + q.id + ')" title="More"><span class="material-symbols-outlined text-base">more_vert</span></button>';
          actionsHtml += '<div class="quote-dropdown hidden absolute right-0 top-full mt-1 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl py-1 z-50 min-w-[160px]">';
          allowed.forEach(function (s) {
            actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();changeQuoteStatus(' + q.id + ',\'' + s + '\')">' + (STATUS_LABELS[s] || s) + '</a>';
          });
          if (q.status === 'Accepted') {
            actionsHtml += '<div class="border-t border-outline-variant/10 my-1"></div>';
            actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-error hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();terminateQuote(' + q.id + ')">Terminate</a>';
            actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-green-400 hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();convertToSOW(' + q.id + ')">Link to SOW</a>';
          }
          if (q.status === 'Draft') {
            actionsHtml += '<div class="border-t border-outline-variant/10 my-1"></div>';
            actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-error hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();deleteQuote(' + q.id + ')">Delete</a>';
          }
          actionsHtml += '</div></div></div>';

          return '<tr>' +
            '<td><strong>' + escapeHtml(q.quote_number) + '</strong></td>' +
            '<td>' + escapeHtml(q.client_name) + '</td>' +
            '<td>' + formatDate(q.quote_date) + '</td>' +
            '<td>' + formatDate(q.valid_until) + '</td>' +
            '<td>' + statusBadge(q.status) + '</td>' +
            '<td class="text-right font-bold">' + formatCurrency(q.total_amount) + '</td>' +
            '<td class="text-center">' + actionsHtml + '</td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('quotesTable');
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  window.toggleQuoteMenu = function (id) {
    // Close all other menus first
    document.querySelectorAll('.quote-dropdown').forEach(function (dd) {
      if (dd.closest('#quoteMenu' + id) === null) dd.classList.add('hidden');
    });
    var menu = document.querySelector('#quoteMenu' + id + ' .quote-dropdown');
    if (menu) menu.classList.toggle('hidden');
  };

  // Close dropdowns when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[id^="quoteMenu"]')) {
      document.querySelectorAll('.quote-dropdown').forEach(function (dd) { dd.classList.add('hidden'); });
    }
  });

  function addItemRow(item) {
    var tbody = document.getElementById('quoteItemsBody');
    var row = document.createElement('tr');
    row.innerHTML =
      '<td><input type="text" class="qi-desc" value="' + (item ? escapeHtml(item.description) : '') + '" required></td>' +
      '<td><input type="text" class="qi-loc" value="' + (item && item.location ? escapeHtml(item.location) : '') + '" placeholder="Location"></td>' +
      '<td><input type="number" class="qi-qty" value="' + (item ? item.quantity : 1) + '" min="1"></td>' +
      '<td><input type="number" class="qi-rate" value="' + (item ? item.unit_rate : '') + '" step="0.01" min="0"></td>' +
      '<td><input type="number" class="qi-amt" value="' + (item ? item.amount : '') + '" step="0.01" readonly></td>' +
      '<td><button type="button" class="btn-danger btn-sm inline-flex items-center" onclick="this.closest(\'tr\').remove();recalcQuote()"><span class="material-symbols-outlined text-base">close</span></button></td>';
    tbody.appendChild(row);

    row.querySelector('.qi-qty').addEventListener('input', function () {
      var rate = parseFloat(row.querySelector('.qi-rate').value) || 0;
      row.querySelector('.qi-amt').value = (parseInt(this.value, 10) || 0) * rate;
      recalcQuote();
    });
    row.querySelector('.qi-rate').addEventListener('input', function () {
      var qty = parseInt(row.querySelector('.qi-qty').value, 10) || 0;
      row.querySelector('.qi-amt').value = qty * (parseFloat(this.value) || 0);
      recalcQuote();
    });
  }

  window.recalcQuote = function () {
    var total = 0;
    document.querySelectorAll('.qi-amt').forEach(function (el) { total += parseFloat(el.value) || 0; });
    document.getElementById('quoteTotal').textContent = formatCurrency(total);
  };

  window.editQuote = async function (id) {
    try {
      var res = await apiCall('GET', '/api/quotes/' + id);
      var q = res.data;
      window.quoteEdit = id;
      document.getElementById('quoteModalTitle').textContent = 'Edit Quote';
      document.getElementById('quoteId').value = id;
      document.getElementById('quoteClient').value = q.client_id;
      document.getElementById('quoteDate').value = q.quote_date;
      document.getElementById('quoteValidUntil').value = q.valid_until;
      quoteValidUntilTouched = true;
      var parsedNotes = splitStoredQuoteNotes(q.notes || '');
      setQuoteMailFormFields(parseQuoteMailFormat(parsedNotes.mailFormat));
      document.getElementById('quoteSideNote').value = parsedNotes.sideNote;
      document.getElementById('quoteItemsBody').innerHTML = '';
      q.items.forEach(function (item) { addItemRow(item); });
      recalcQuote();
      openModal('quoteModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.viewQuote = async function (id) {
    try {
      var res = await apiCall('GET', '/api/quotes/' + id);
      var q = res.data;
      var parsedNotes = splitStoredQuoteNotes(q.notes || '');
      document.getElementById('quoteDetailTitle').textContent = 'Quote: ' + q.quote_number;

      var html = '<div class="space-y-4">';
      html += '<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">';
      html += '<div><span class="text-on-surface-variant">Quote #:</span> <strong>' + escapeHtml(q.quote_number) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Client:</span> <strong>' + escapeHtml(q.client_name) + '</strong></div>';
      html += '<div><span class="text-on-surface-variant">Quote Date:</span> ' + formatDate(q.quote_date) + '</div>';
      html += '<div><span class="text-on-surface-variant">Valid Until:</span> ' + formatDate(q.valid_until) + '</div>';
      html += '<div><span class="text-on-surface-variant">Status:</span> ' + statusBadge(q.status) + '</div>';
      html += '<div><span class="text-on-surface-variant">Total:</span> <strong>' + formatCurrency(q.total_amount) + '</strong></div>';
      html += '</div>';

      html += '<h6 class="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant pt-2">Line Items</h6>';
      html += '<table class="stitch-table"><thead><tr><th>Description</th><th>Location</th><th class="text-center">Qty</th><th class="text-right">Unit Rate</th><th class="text-right">Amount</th></tr></thead><tbody>';
      q.items.forEach(function (item) {
        html += '<tr>' +
          '<td>' + escapeHtml(item.description) + '</td>' +
          '<td>' + escapeHtml(item.location || '') + '</td>' +
          '<td class="text-center">' + item.quantity + '</td>' +
          '<td class="text-right">' + formatCurrency(item.unit_rate) + '</td>' +
          '<td class="text-right">' + formatCurrency(item.amount) + '</td>' +
          '</tr>';
      });
      html += '<tr><td colspan="4" class="text-right font-bold">Total</td><td class="text-right font-bold">' + formatCurrency(q.total_amount) + '</td></tr>';
      html += '</tbody></table>';

      html += '<div class="grid grid-cols-1 gap-4 pt-2">';
      html += '<div><h6 class="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Mail Format</h6><div class="rounded-xl bg-surface-container-high p-4 text-sm whitespace-pre-wrap">' + escapeHtml(parsedNotes.mailFormat || '') + '</div></div>';
      if (parsedNotes.sideNote) {
        html += '<div><h6 class="text-sm font-bold uppercase tracking-[0.2em] text-on-surface-variant mb-2">Side Note</h6><div class="rounded-xl bg-surface-container-high p-4 text-sm whitespace-pre-wrap">' + escapeHtml(parsedNotes.sideNote) + '</div></div>';
      }
      html += '</div>';
      html += '</div>';

      document.getElementById('quoteDetailContent').innerHTML = html;
      openModal('quoteDetailModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.changeQuoteStatus = async function (id, status) {
    try {
      await apiCall('PATCH', '/api/quotes/' + id + '/status', { status: status });
      showToast('Quote status updated to ' + status, 'success');
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.terminateQuote = async function (id) {
    var confirmed = await confirmAction('Terminate Quote', 'Are you sure you want to terminate this quote? Its linked document folder will also be deleted.');
    if (!confirmed) return;
    try {
      await apiCall('PATCH', '/api/quotes/' + id + '/status', { status: 'Expired' });
      showToast('Quote terminated', 'success');
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.deleteQuote = async function (id) {
    var confirmed = await confirmAction('Delete Quote', 'Are you sure you want to delete this quote? This cannot be undone.');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/quotes/' + id);
      showToast('Quote deleted', 'success');
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.convertToSOW = async function (id) {
    document.getElementById('convertSowForm').reset();
    document.getElementById('convertQuoteId').value = id;
    document.getElementById('convertSowMode').value = 'new';
    syncConvertSowMode();
    try {
      var res = await apiCall('GET', '/api/quotes/' + id);
      await loadSowsForClient(res.data.client_id);
    } catch (e) { /* ignore */ }
    openModal('convertSowModal');
  };

  document.getElementById('quoteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var items = [];
    document.querySelectorAll('#quoteItemsBody tr').forEach(function (row) {
      items.push({
        description: row.querySelector('.qi-desc').value.trim(),
        location: row.querySelector('.qi-loc').value.trim() || null,
        quantity: parseInt(row.querySelector('.qi-qty').value, 10) || 1,
        unit_rate: parseFloat(row.querySelector('.qi-rate').value) || 0,
        amount: parseFloat(row.querySelector('.qi-amt').value) || 0,
      });
    });
    var data = {
      client_id: parseInt(document.getElementById('quoteClient').value, 10),
      quote_date: document.getElementById('quoteDate').value,
      valid_until: document.getElementById('quoteValidUntil').value,
      notes: buildStoredQuoteNotes(
        buildQuoteMailFormat(getQuoteMailFormFields()),
        document.getElementById('quoteSideNote').value
      ),
      items: items,
    };
    try {
      if (window.quoteEdit) {
        await apiCall('PUT', '/api/quotes/' + window.quoteEdit, data);
        showToast('New quote version created', 'success');
      } else {
        await apiCall('POST', '/api/quotes', data);
        showToast('Quote created', 'success');
      }
      closeQuoteModal();
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('convertSowForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var quoteId = document.getElementById('convertQuoteId').value;
    var mode = document.getElementById('convertSowMode').value;
    var payload = {
      mode: mode,
      sow_id: document.getElementById('convertExistingSowId').value ? parseInt(document.getElementById('convertExistingSowId').value, 10) : null,
      sow_number: document.getElementById('convertSowNumber').value.trim() || null,
      sow_date: document.getElementById('convertSowDate').value || null,
      effective_start: document.getElementById('convertEffectiveStart').value || null,
      effective_end: document.getElementById('convertEffectiveEnd').value || null,
      notes: document.getElementById('convertSowNotes').value.trim() || null,
    };
    try {
      await apiCall('POST', '/api/quotes/' + quoteId + '/convert-to-sow', payload);
      showToast(mode === 'existing' ? 'Quote linked to existing SOW' : 'Statement of Work created!', 'success');
      closeConvertSowModal();
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('convertSowMode').addEventListener('change', syncConvertSowMode);
  document.getElementById('btnAddQuoteItem').addEventListener('click', function () { addItemRow(); });
  document.getElementById('quoteFilterClient').addEventListener('change', loadQuotes);
  document.getElementById('quoteFilterStatus').addEventListener('change', loadQuotes);
  document.getElementById('quoteDate').addEventListener('input', function () {
    syncValidUntilFromQuoteDate(false);
  });
  document.getElementById('quoteValidUntil').addEventListener('input', function () {
    quoteValidUntilTouched = true;
    updateQuoteValidityLine();
  });

  // Initialize search
  initTableSearch('quotesSearch', 'quotesBody');
  loadClients().then(loadQuotes);
})();
