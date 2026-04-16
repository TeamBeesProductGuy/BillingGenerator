(function () {
  var remindersData = [];

  function badgeForDueDate(dueDate) {
    var due = new Date(dueDate);
    var today = new Date();
    due.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    var diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return '<span class="badge-error">Overdue ' + Math.abs(diffDays) + 'd</span>';
    if (diffDays === 0) return '<span class="badge-warning">Due Today</span>';
    return '<span class="badge-processing">Due in ' + diffDays + 'd</span>';
  }

  function renderReminders(data) {
    var tbody = document.getElementById('remindersBody');
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-on-surface-variant py-8">No reminders in -3 to +3 day window.</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function (reminder) {
      var client = reminder.client || {};
      var order = reminder.order || {};
      var clientName = getClientDisplayName(client) || '-';
      return '<tr>' +
        '<td>' + formatDate(reminder.due_date) + '<div class="mt-1">' + badgeForDueDate(reminder.due_date) + '</div></td>' +
        '<td>' + escapeHtml(clientName) + '</td>' +
        '<td>' + escapeHtml(order.candidate_name || '') + '</td>' +
        '<td>' + escapeHtml(order.position_role || '') + '</td>' +
        '<td class="text-right">' + formatCurrency(order.bill_amount || 0) + '</td>' +
        '<td><input type="email" id="reminderEmail1-' + reminder.id + '" value="' + escapeHtml(reminder.email_primary || '') + '" placeholder="first@email.com"></td>' +
        '<td><input type="email" id="reminderEmail2-' + reminder.id + '" value="' + escapeHtml(reminder.email_secondary || '') + '" placeholder="second@email.com"></td>' +
        '<td class="text-center">' +
          '<div class="inline-flex items-center gap-1">' +
            '<button class="btn-secondary btn-sm inline-flex items-center" onclick="saveReminderEmails(' + reminder.id + ')"><span class="material-symbols-outlined text-base">save</span></button>' +
            '<button class="btn-secondary btn-sm inline-flex items-center" onclick="openExtendReminderModal(' + reminder.id + ', \'' + reminder.due_date + '\')"><span class="material-symbols-outlined text-base">event_repeat</span></button>' +
            '<button class="btn-danger btn-sm inline-flex items-center" onclick="closeReminder(' + reminder.id + ')"><span class="material-symbols-outlined text-base">task_alt</span></button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    initTableSort('remindersTable');
  }

  async function loadReminders() {
    var tbody = document.getElementById('remindersBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/permanent/reminders');
      remindersData = res.data || [];
      renderReminders(remindersData);
    } catch (err) {
      showToast(err.message, 'danger');
      hideLoading(tbody);
    }
  }

  window.reloadReminders = function () {
    loadReminders();
  };

  window.saveReminderEmails = async function (id) {
    try {
      var email1 = document.getElementById('reminderEmail1-' + id).value.trim();
      var email2 = document.getElementById('reminderEmail2-' + id).value.trim();
      await apiCall('PATCH', '/api/permanent/reminders/' + id + '/emails', {
        email_primary: email1,
        email_secondary: email2,
      });
      showToast('Reminder emails updated', 'success');
      loadReminders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.closeReminder = async function (id) {
    var confirmed = await confirmAction('Close Reminder', 'Are you sure you want to close this reminder?');
    if (!confirmed) return;
    try {
      await apiCall('PATCH', '/api/permanent/reminders/' + id + '/close');
      showToast('Reminder closed', 'success');
      loadReminders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.openExtendReminderModal = function (id, dueDate) {
    document.getElementById('extendReminderForm').reset();
    document.getElementById('extendReminderId').value = id;
    document.getElementById('extendReminderDate').value = dueDate;
    openModal('extendReminderModal');
  };

  window.closeExtendReminderModal = function () {
    closeModal('extendReminderModal');
  };

  document.getElementById('extendReminderForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var reminderId = document.getElementById('extendReminderId').value;
    var dueDate = document.getElementById('extendReminderDate').value;
    try {
      await apiCall('PATCH', '/api/permanent/reminders/' + reminderId + '/extend', { due_date: dueDate });
      showToast('Reminder date extended', 'success');
      closeExtendReminderModal();
      loadReminders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  initTableSearch('remindersSearch', 'remindersBody');
  loadReminders();
})();
