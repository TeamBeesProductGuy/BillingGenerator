(function () {
  // openModal / closeModal provided by app.js

  window.openSOWModal = function () {
    document.getElementById('sowForm').reset();
    document.getElementById('sowItemsBody').innerHTML = '';
    document.getElementById('sowModalTitle').textContent = 'Create SOW';
    document.getElementById('sowId').value = '';
    window.sowEdit = null;
    addSowItemRow();
    openModal('sowModal');
  };
  window.closeSOWModal = function () { closeModal('sowModal'); };

  var statusBadge = function (s) {
    var map = { Draft: 'badge-processing', Signed: 'badge-success', Expired: 'badge-warning', Terminated: 'badge-error' };
    return '<span class="' + (map[s] || 'badge-processing') + '">' + s + '</span>';
  };

  async function loadClients() {
    try {
      var res = await apiCall('GET', '/api/clients');
      ['sowFilterClient', 'sowClient'].forEach(function (id) {
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
      if (res.data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-on-surface-variant py-8">No SOWs found</td></tr>';
      } else {
        tbody.innerHTML = res.data.map(function (s) {
          var VALID_TRANSITIONS = { Draft: ['Signed'], Signed: ['Expired', 'Terminated'], Expired: [], Terminated: [] };
          var STATUS_LABELS = { Signed: 'Mark Signed', Expired: 'Mark Expired', Terminated: 'Terminate', Draft: 'Revert to Draft' };
          var allowed = VALID_TRANSITIONS[s.status] || [];

          var actionsHtml = '<div class="inline-flex items-center gap-1">';
          if (s.status === 'Draft') {
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editSOW(' + s.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>';
          }
          actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="viewSOW(' + s.id + ')" title="View"><span class="material-symbols-outlined text-base">visibility</span></button>';

          // Status menu
          if (allowed.length > 0 || s.status === 'Draft') {
            actionsHtml += '<div class="relative inline-block" id="sowMenu' + s.id + '">';
            actionsHtml += '<button class="btn-secondary btn-sm inline-flex items-center" onclick="toggleSowMenu(' + s.id + ')" title="More"><span class="material-symbols-outlined text-base">more_vert</span></button>';
            actionsHtml += '<div class="sow-dropdown hidden absolute right-0 top-full mt-1 bg-surface-container-high border border-outline-variant/20 rounded-xl shadow-2xl py-1 z-50 min-w-[160px]">';
            allowed.forEach(function (st) {
              actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-on-surface hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();changeSOWStatus(' + s.id + ',\'' + st + '\')">' + (STATUS_LABELS[st] || st) + '</a>';
            });
            if (s.status === 'Draft') {
              actionsHtml += '<div class="border-t border-outline-variant/10 my-1"></div>';
              actionsHtml += '<a href="#" class="block px-4 py-2 text-sm text-error hover:bg-surface-container-highest transition-colors no-underline" onclick="event.preventDefault();deleteSOW(' + s.id + ')">Delete</a>';
            }
            actionsHtml += '</div></div>';
          }
          actionsHtml += '</div>';

          return '<tr>' +
            '<td><strong>' + escapeHtml(s.sow_number) + '</strong></td>' +
            '<td>' + escapeHtml(s.client_name) + '</td>' +
            '<td>' + formatDate(s.sow_date) + '</td>' +
            '<td>' + formatDate(s.effective_start) + '</td>' +
            '<td>' + formatDate(s.effective_end) + '</td>' +
            '<td class="text-right font-bold">' + formatCurrency(s.total_value) + '</td>' +
            '<td>' + statusBadge(s.status) + '</td>' +
            '<td class="text-center">' + actionsHtml + '</td>' +
            '</tr>';
        }).join('');
      }
      initTableSort('sowsTable');
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  window.toggleSowMenu = function (id) {
    document.querySelectorAll('.sow-dropdown').forEach(function (dd) {
      if (dd.closest('#sowMenu' + id) === null) dd.classList.add('hidden');
    });
    var menu = document.querySelector('#sowMenu' + id + ' .sow-dropdown');
    if (menu) menu.classList.toggle('hidden');
  };

  document.addEventListener('click', function (e) {
    if (!e.target.closest('[id^="sowMenu"]')) {
      document.querySelectorAll('.sow-dropdown').forEach(function (dd) { dd.classList.add('hidden'); });
    }
  });

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
      document.getElementById('sowModalTitle').textContent = 'Edit SOW';
      document.getElementById('sowId').value = id;
      document.getElementById('sowNumber').value = s.base_sow_number || s.sow_number;
      document.getElementById('sowClient').value = s.client_id;
      await loadQuotesForClient(s.client_id);
      document.getElementById('sowQuote').value = s.quote_id || '';
      document.getElementById('sowDate').value = s.sow_date;
      document.getElementById('sowStart').value = s.effective_start;
      document.getElementById('sowEnd').value = s.effective_end;
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
      if (window.sowEdit) {
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

  document.getElementById('btnAddSowItem').addEventListener('click', function () { addSowItemRow(); });
  document.getElementById('sowFilterClient').addEventListener('change', loadSOWs);
  document.getElementById('sowFilterStatus').addEventListener('change', loadSOWs);

  // Load quotes when client changes
  document.getElementById('sowClient').addEventListener('change', function () {
    loadQuotesForClient(this.value);
  });

  // Initialize search
  initTableSearch('sowsSearch', 'sowsBody');

  loadClients().then(loadSOWs);
})();
