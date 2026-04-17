(function () {
  var remindersData = [];
  var reminderActionMap = {};
  var defaultPrimaryRecipient = 'jatinder@teambeescorp.com';
  var defaultSecondaryRecipient = 'tanmay@teambeescorp.com';

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

  function badgeForPaymentStatus(status) {
    var value = String(status || 'pending').toLowerCase();
    if (value === 'paid') return '<span class="badge-success">Paid</span>';
    return '<span class="badge-warning">Pending</span>';
  }

  function badgeForInvoiceStatus(status) {
    var value = String(status || 'pending').toLowerCase();
    if (value === 'sent') return '<span class="badge-success">Invoice Sent</span>';
    return '<span class="badge-processing">Pending</span>';
  }

  function renderReminderEmail(value, fallback) {
    var email = String(value || fallback || '').trim();
    if (!email) return '<span class="reminder-email-pill reminder-email-empty">Not set</span>';
    return '<span class="reminder-email-pill" title="' + escapeHtml(email) + '">' + escapeHtml(email) + '</span>';
  }

  function renderReminders(data) {
    var tbody = document.getElementById('remindersBody');
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-on-surface-variant py-8">No reminders in -3 to +3 day window.</td></tr>';
      return;
    }

    reminderActionMap = {};
    tbody.innerHTML = data.map(function (reminder) {
      var client = reminder.client || {};
      var order = reminder.order || {};
      var clientName = getClientDisplayName(client) || '-';
      reminderActionMap[reminder.id] = {
        id: reminder.id,
        paymentStatus: reminder.payment_status || 'pending',
        invoiceNumber: reminder.invoice_number || '',
        invoiceDate: reminder.invoice_date || '',
        dueDate: reminder.due_date,
        emailPrimary: reminder.email_primary || defaultPrimaryRecipient,
        emailSecondary: reminder.email_secondary || defaultSecondaryRecipient,
      };
      return '<tr>' +
        '<td><div class="reminder-cell-stack"><div class="reminder-cell-title">' + formatDate(reminder.due_date) + '</div><div class="mt-1">' + badgeForDueDate(reminder.due_date) + '</div></div></td>' +
        '<td>' + escapeHtml(clientName) + '</td>' +
        '<td>' + escapeHtml(order.candidate_name || '') + '</td>' +
        '<td>' + escapeHtml(order.position_role || '') + '</td>' +
        '<td class="text-right"><span class="reminder-amount">' + formatCurrency(order.bill_amount || 0) + '</span></td>' +
        '<td>' +
          '<div class="reminder-status-card">' +
            '<div class="reminder-status-row">' + badgeForPaymentStatus(reminder.payment_status) + '</div>' +
            '<div class="reminder-meta-line"><span class="reminder-meta-label">Mail activity</span>Reminder mails sent: ' + (reminder.reminder_count || 0) + '</div>' +
          '</div>' +
        '</td>' +
        '<td>' +
          '<div class="reminder-status-card">' +
            '<div class="reminder-status-row">' + badgeForInvoiceStatus(reminder.invoice_status) + '</div>' +
            '<div class="reminder-meta-line"><span class="reminder-meta-label">Invoice no.</span>' + escapeHtml(reminder.invoice_number || 'Not added') + '</div>' +
            '<div class="reminder-meta-line"><span class="reminder-meta-label">Invoice date</span>' + (reminder.invoice_date ? formatDate(reminder.invoice_date) : 'Not added') + '</div>' +
          '</div>' +
        '</td>' +
        '<td><div class="reminder-email-wrap">' + renderReminderEmail(reminder.email_primary, defaultPrimaryRecipient) + '</div></td>' +
        '<td><div class="reminder-email-wrap">' + renderReminderEmail(reminder.email_secondary, defaultSecondaryRecipient) + '</div></td>' +
        '<td class="text-center">' +
          '<button class="btn-secondary btn-sm reminder-action-trigger inline-flex items-center justify-center" title="Open reminder actions" aria-label="Open reminder actions" onclick="openReminderActions(' + reminder.id + ')"><span class="material-symbols-outlined text-base">more_horiz</span></button>' +
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

  window.openReminderActions = function (id) {
    var state = reminderActionMap[id];
    var container = document.getElementById('reminderActionList');
    var title = document.getElementById('reminderActionTitle');
    if (!state || !container || !title) return;

    title.textContent = 'Reminder Actions';
    container.innerHTML = '';
    container.innerHTML += '<button type="button" class="reminder-action-sheet-btn" onclick="runReminderActionEditEmails(' + id + ')"><span class="material-symbols-outlined">alternate_email</span><span><strong>Edit emails</strong><small>Update primary and secondary recipients</small></span></button>';
    container.innerHTML += '<button type="button" class="reminder-action-sheet-btn" onclick="runReminderActionTogglePayment(' + id + ', \'' + (state.paymentStatus === 'paid' ? 'pending' : 'paid') + '\')"><span class="material-symbols-outlined">payments</span><span><strong>' + (state.paymentStatus === 'paid' ? 'Mark pending' : 'Mark paid') + '</strong><small>Change the payment status for this reminder</small></span></button>';
    container.innerHTML += '<button type="button" class="reminder-action-sheet-btn" onclick="runReminderActionSendMail(' + id + ')"><span class="material-symbols-outlined">mail</span><span><strong>Send reminder mail</strong><small>Send the reminder email to saved recipients</small></span></button>';
    container.innerHTML += '<button type="button" class="reminder-action-sheet-btn" onclick="runReminderActionInvoice(' + id + ')"><span class="material-symbols-outlined">receipt_long</span><span><strong>Update invoice</strong><small>Save invoice number and invoice date</small></span></button>';
    container.innerHTML += '<button type="button" class="reminder-action-sheet-btn" onclick="runReminderActionExtend(' + id + ')"><span class="material-symbols-outlined">event_repeat</span><span><strong>Extend reminder</strong><small>Move the due date to a later day</small></span></button>';
    container.innerHTML += '<button type="button" class="reminder-action-sheet-btn reminder-action-sheet-btn-danger" onclick="runReminderActionClose(' + id + ')"><span class="material-symbols-outlined">task_alt</span><span><strong>Close reminder</strong><small>Remove this reminder from the active queue</small></span></button>';
    openModal('reminderActionModal');
  };

  window.closeReminderActions = function () {
    closeModal('reminderActionModal');
  };

  window.runReminderActionEditEmails = function (id) {
    closeReminderActions();
    openReminderEmailModal(id);
  };

  window.runReminderActionTogglePayment = function (id, status) {
    closeReminderActions();
    updateReminderPaymentStatus(id, status);
  };

  window.runReminderActionSendMail = function (id) {
    closeReminderActions();
    sendReminderMail(id);
  };

  window.runReminderActionInvoice = function (id) {
    var state = reminderActionMap[id] || {};
    closeReminderActions();
    openInvoiceSentModal(id, state.invoiceNumber || '', state.invoiceDate || '');
  };

  window.runReminderActionExtend = function (id) {
    var state = reminderActionMap[id] || {};
    closeReminderActions();
    openExtendReminderModal(id, state.dueDate || '');
  };

  window.runReminderActionClose = function (id) {
    closeReminderActions();
    closeReminder(id);
  };

  window.openReminderEmailModal = function (id) {
    var state = reminderActionMap[id] || {};
    document.getElementById('reminderEmailForm').reset();
    document.getElementById('reminderEmailReminderId').value = id;
    document.getElementById('reminderEmailPrimary').value = state.emailPrimary || '';
    document.getElementById('reminderEmailSecondary').value = state.emailSecondary || '';
    openModal('reminderEmailModal');
  };

  window.closeReminderEmailModal = function () {
    closeModal('reminderEmailModal');
  };

  window.saveReminderEmails = async function (id) {
    try {
      var email1El = document.getElementById('reminderEmail1-' + id);
      var email2El = document.getElementById('reminderEmail2-' + id);
      var modalPrimaryEl = document.getElementById('reminderEmailPrimary');
      var modalSecondaryEl = document.getElementById('reminderEmailSecondary');
      var email1 = email1El ? email1El.value.trim() : (modalPrimaryEl ? modalPrimaryEl.value.trim() : '');
      var email2 = email2El ? email2El.value.trim() : (modalSecondaryEl ? modalSecondaryEl.value.trim() : '');
      await apiCall('PATCH', '/api/permanent/reminders/' + id + '/emails', {
        email_primary: email1,
        email_secondary: email2,
      });
      showToast('Reminder emails updated', 'success');
      if (modalPrimaryEl || modalSecondaryEl) {
        closeReminderEmailModal();
      }
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

  window.updateReminderPaymentStatus = async function (id, forcedStatus) {
    try {
      var status = forcedStatus || 'pending';
      await apiCall('PATCH', '/api/permanent/reminders/' + id + '/payment-status', {
        payment_status: status,
      });
      showToast('Payment status updated', 'success');
      loadReminders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.sendReminderMail = async function (id) {
    try {
      await apiCall('POST', '/api/permanent/reminders/' + id + '/send-mail');
      showToast('Reminder email sent', 'success');
      loadReminders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.openInvoiceSentModal = function (id, invoiceNumber, invoiceDate) {
    document.getElementById('invoiceSentForm').reset();
    document.getElementById('invoiceSentReminderId').value = id;
    document.getElementById('invoiceNumber').value = invoiceNumber || '';
    document.getElementById('invoiceDate').value = invoiceDate || '';
    openModal('invoiceSentModal');
  };

  window.closeInvoiceSentModal = function () {
    closeModal('invoiceSentModal');
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

  document.getElementById('invoiceSentForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var reminderId = document.getElementById('invoiceSentReminderId').value;
    var invoiceNumber = document.getElementById('invoiceNumber').value.trim();
    var invoiceDate = document.getElementById('invoiceDate').value;
    try {
      await apiCall('PATCH', '/api/permanent/reminders/' + reminderId + '/invoice-sent', {
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
      });
      showToast('Invoice status updated', 'success');
      closeInvoiceSentModal();
      loadReminders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  document.getElementById('reminderEmailForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var reminderId = document.getElementById('reminderEmailReminderId').value;
    await saveReminderEmails(reminderId);
  });

  initTableSearch('remindersSearch', 'remindersBody');
  loadReminders();
})();
