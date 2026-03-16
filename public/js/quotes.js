(function () {
  // Modal helpers
  function openModal(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.remove('hidden'); el.classList.add('flex'); }
  }
  function closeModal(id) {
    var el = document.getElementById(id);
    if (el) { el.classList.add('hidden'); el.classList.remove('flex'); }
  }

  window.openQuoteModal = function () {
    document.getElementById('quoteForm').reset();
    document.getElementById('quoteItemsBody').innerHTML = '';
    document.getElementById('quoteModalTitle').textContent = 'Create Quote';
    document.getElementById('quoteId').value = '';
    window.quoteEdit = null;
    addItemRow();
    openModal('quoteModal');
  };
  window.closeQuoteModal = function () { closeModal('quoteModal'); };
  window.closeConvertPoModal = function () { closeModal('convertPoModal'); };

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
          sel.innerHTML += '<option value="' + c.id + '">' + escapeHtml(c.client_name) + '</option>';
        });
      });
    } catch (e) { /* ignore */ }
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
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-on-surface-variant py-8">No quotes found</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (q) {
          var actionsHtml = '<div class="inline-flex items-center gap-1">';
          if (q.status === 'Draft') {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editQuote(' + q.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>';
          }
          actionsHtml += '<a href="/api/quotes/' + q.id + '/download" class="btn-secondary btn-sm inline-flex items-center no-underline" title="Download"><span class="material-symbols-outlined text-base">download</span></a>';

          // Status actions
          actionsHtml += '<div class="relative inline-block" id="quoteMenu' + q.id + '">';
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="toggleQuoteMenu(' + q.id + ')" title="More"><span class="material-symbols-outlined text-base">more_vert</span></button>';
          actionsHtml += '<div class="quote-dropdown hidden absolute right-0 top-full mt-1 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl py-1 z-50 min-w-[160px]">';
          actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();changeQuoteStatus(' + q.id + ',\'Sent\')">Mark Sent</a>';
          actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();changeQuoteStatus(' + q.id + ',\'Accepted\')">Accept</a>';
          actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();changeQuoteStatus(' + q.id + ',\'Rejected\')">Reject</a>';
          if (q.status === 'Accepted') {
            actionsHtml += '<div class="border-t border-outline-variant/10 my-1"></div>';
            actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-green-400 hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();convertToPO(' + q.id + ')">Convert to PO</a>';
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
            '<td class="text-right">' + formatCurrency(q.subtotal) + '</td>' +
            '<td class="text-right">' + formatCurrency(q.tax_amount) + '</td>' +
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
    var subtotal = 0;
    document.querySelectorAll('.qi-amt').forEach(function (el) { subtotal += parseFloat(el.value) || 0; });
    var taxPct = parseFloat(document.getElementById('quoteTax').value) || 0;
    var tax = Math.round(subtotal * taxPct / 100 * 100) / 100;
    document.getElementById('quoteSubtotal').textContent = formatCurrency(subtotal);
    document.getElementById('quoteTaxAmt').textContent = formatCurrency(tax);
    document.getElementById('quoteTotal').textContent = formatCurrency(subtotal + tax);
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
      document.getElementById('quoteTax').value = q.tax_percent;
      document.getElementById('quoteNotes').value = q.notes || '';
      document.getElementById('quoteItemsBody').innerHTML = '';
      q.items.forEach(function (item) { addItemRow(item); });
      recalcQuote();
      openModal('quoteModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.changeQuoteStatus = async function (id, status) {
    try {
      await apiCall('PATCH', '/api/quotes/' + id + '/status', { status: status });
      showToast('Quote status updated to ' + status, 'success');
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

  window.convertToPO = function (id) {
    document.getElementById('convertQuoteId').value = id;
    document.getElementById('convertPoForm').reset();
    document.getElementById('convertQuoteId').value = id;
    openModal('convertPoModal');
  };

  document.getElementById('quoteForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var items = [];
    document.querySelectorAll('#quoteItemsBody tr').forEach(function (row) {
      items.push({
        description: row.querySelector('.qi-desc').value.trim(),
        quantity: parseInt(row.querySelector('.qi-qty').value, 10) || 1,
        unit_rate: parseFloat(row.querySelector('.qi-rate').value) || 0,
        amount: parseFloat(row.querySelector('.qi-amt').value) || 0,
      });
    });
    var data = {
      client_id: parseInt(document.getElementById('quoteClient').value, 10),
      quote_date: document.getElementById('quoteDate').value,
      valid_until: document.getElementById('quoteValidUntil').value,
      tax_percent: parseFloat(document.getElementById('quoteTax').value) || 18,
      notes: document.getElementById('quoteNotes').value.trim(),
      items: items,
    };
    try {
      if (window.quoteEdit) {
        await apiCall('PUT', '/api/quotes/' + window.quoteEdit, data);
        showToast('Quote updated', 'success');
      } else {
        await apiCall('POST', '/api/quotes', data);
        showToast('Quote created', 'success');
      }
      closeQuoteModal();
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('convertPoForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var quoteId = document.getElementById('convertQuoteId').value;
    try {
      await apiCall('POST', '/api/quotes/' + quoteId + '/convert-to-po', {
        po_number: document.getElementById('convertPoNumber').value.trim(),
        po_date: document.getElementById('convertPoDate').value,
        start_date: document.getElementById('convertStartDate').value,
        end_date: document.getElementById('convertEndDate').value,
      });
      showToast('Purchase Order created!', 'success');
      closeConvertPoModal();
      loadQuotes();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  document.getElementById('btnAddQuoteItem').addEventListener('click', function () { addItemRow(); });
  document.getElementById('quoteTax').addEventListener('input', recalcQuote);
  document.getElementById('quoteFilterClient').addEventListener('change', loadQuotes);
  document.getElementById('quoteFilterStatus').addEventListener('change', loadQuotes);

  // Initialize search
  initTableSearch('quotesSearch', 'quotesBody');

  loadClients().then(loadQuotes);
})();
