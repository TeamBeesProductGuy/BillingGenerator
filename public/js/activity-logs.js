(function () {
  var allLogs = [];

  function titleCase(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, function (char) {
      return char.toUpperCase();
    });
  }

  function formatWhen(value) {
    if (!value) return '-';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
    return escapeHtml(date.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }));
  }

  function summarizeDetails(details) {
    if (!details || typeof details !== 'object') return '-';
    if (details.summary) return escapeHtml(details.summary);
    if (details.changed_fields && details.changed_fields.length) {
      return 'Changed: ' + escapeHtml(details.changed_fields.join(', '));
    }
    if (details.note) return escapeHtml(details.note);
    return escapeHtml(JSON.stringify(details));
  }

  function renderRows(rows) {
    var tbody = document.getElementById('activityLogsBody');
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-on-surface-variant py-8">No activity logs found</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (log) {
      var recordLabel = log.entity_label || [log.entity_type, log.entity_id].filter(Boolean).join(' #') || '-';
      return '<tr>' +
        '<td><div class="table-cell-box"><span class="table-date-chip">' + formatWhen(log.created_at) + '</span></div></td>' +
        '<td><div class="table-cell-box table-cell-text">' + escapeHtml(log.user_email || '-') + '</div></td>' +
        '<td><div class="table-cell-box"><span class="entity-pill">' + escapeHtml(titleCase(log.module)) + '</span></div></td>' +
        '<td><div class="table-cell-box"><span class="entity-pill">' + escapeHtml(titleCase(log.action)) + '</span></div></td>' +
        '<td><div class="table-cell-box table-cell-text">' + escapeHtml(recordLabel) + '</div></td>' +
        '<td><div class="table-cell-box table-cell-text">' + summarizeDetails(log.details) + '</div></td>' +
      '</tr>';
    }).join('');
    initTableSort('activityLogsTable');
  }

  function updateSummary(rows) {
    var cards = document.querySelectorAll('#activityLogSummary .table-summary-value');
    var modules = new Set(rows.map(function (row) { return row.module; }).filter(Boolean));
    var users = new Set(rows.map(function (row) { return row.user_email; }).filter(Boolean));
    if (cards[0]) cards[0].textContent = rows.length;
    if (cards[1]) cards[1].textContent = modules.size;
    if (cards[2]) cards[2].textContent = users.size;
    var count = document.getElementById('activityLogsCount');
    if (count) count.textContent = rows.length === 1 ? '1 row' : rows.length + ' rows';
  }

  function applyFilters() {
    var q = String(document.getElementById('activityLogsSearch').value || '').toLowerCase().trim();
    var moduleValue = document.getElementById('activityLogsModule').value;
    var actionValue = document.getElementById('activityLogsAction').value;

    var rows = allLogs.filter(function (log) {
      if (moduleValue && log.module !== moduleValue) return false;
      if (actionValue && log.action !== actionValue) return false;
      if (!q) return true;
      var haystack = [
        log.user_email,
        log.module,
        log.action,
        log.entity_type,
        log.entity_id,
        log.entity_label,
        log.details ? JSON.stringify(log.details) : '',
      ].join(' ').toLowerCase();
      return haystack.indexOf(q) !== -1;
    });

    updateSummary(rows);
    renderRows(rows);
  }

  function fillFilterOptions() {
    var moduleSelect = document.getElementById('activityLogsModule');
    var actionSelect = document.getElementById('activityLogsAction');
    var modules = Array.from(new Set(allLogs.map(function (row) { return row.module; }).filter(Boolean))).sort();
    var actions = Array.from(new Set(allLogs.map(function (row) { return row.action; }).filter(Boolean))).sort();

    moduleSelect.innerHTML = '<option value="">All modules</option>' + modules.map(function (value) {
      return '<option value="' + escapeHtml(value) + '">' + escapeHtml(titleCase(value)) + '</option>';
    }).join('');
    actionSelect.innerHTML = '<option value="">All actions</option>' + actions.map(function (value) {
      return '<option value="' + escapeHtml(value) + '">' + escapeHtml(titleCase(value)) + '</option>';
    }).join('');
  }

  async function loadLogs() {
    var tbody = document.getElementById('activityLogsBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/activity-logs?limit=300');
      allLogs = res.data || [];
      fillFilterOptions();
      applyFilters();
    } catch (err) {
      showToast(err.message, 'danger');
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-on-surface-variant py-8">Failed to load activity logs</td></tr>';
    }
  }

  document.getElementById('activityLogsSearch').addEventListener('input', applyFilters);
  document.getElementById('activityLogsModule').addEventListener('change', applyFilters);
  document.getElementById('activityLogsAction').addEventListener('change', applyFilters);

  loadLogs();
})();
