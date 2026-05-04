(function () {
  var remindersData = [];
  var reminderActionMap = {};
  var defaultPrimaryRecipient = 'jatinder@teambeescorp.com';
  var defaultSecondaryRecipient = 'tanmay@teambeescorp.com';
  var reminderSectionConfigs = [
    {
      key: 'active',
      title: 'Active reminders',
      description: 'Open reminders closest to today.',
      empty: 'No reminders are currently in the active send window.',
      icon: 'notifications_active',
      accentClass: 'reminder-section-active',
    },
    {
      key: 'upcoming',
      title: 'Upcoming reminders',
      description: 'Future reminders that will become active later.',
      empty: 'No upcoming reminders are scheduled right now.',
      icon: 'schedule',
      accentClass: 'reminder-section-upcoming',
    },
    {
      key: 'past',
      title: 'Past reminders',
      description: 'Past due reminders remain visible here until you close them.',
      empty: 'No past reminders to review.',
      icon: 'history',
      accentClass: 'reminder-section-past',
    },
    {
      key: 'closed',
      title: 'Closed reminders',
      description: 'Completed reminders kept here for visibility and reference.',
      empty: 'No closed reminders yet.',
      icon: 'task_alt',
      accentClass: 'reminder-section-closed',
    },
  ];

  function startOfDay(value) {
    var date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function getDueDayDiff(dueDate) {
    var due = startOfDay(dueDate);
    var today = startOfDay(new Date());
    return Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }

  function getReminderBucket(reminder) {
    if (String(reminder.payment_status || '').toLowerCase() === 'paid'
      && String(reminder.invoice_status || '').toLowerCase() === 'sent') {
      return 'closed';
    }
    if (String(reminder.status || '').toLowerCase() === 'closed') return 'closed';
    var diffDays = getDueDayDiff(reminder.due_date);
    if (diffDays < -3) return 'past';
    if (diffDays > 3) return 'upcoming';
    return 'active';
  }

  function badgeForDueDate(dueDate) {
    var diffDays = getDueDayDiff(dueDate);
    if (diffDays < 0) return '<span class="badge-error">Overdue ' + Math.abs(diffDays) + 'd</span>';
    if (diffDays === 0) return '<span class="badge-warning">Due Today</span>';
    return '<span class="badge-processing">Due in ' + diffDays + 'd</span>';
  }

  function badgeForBucket(bucket) {
    if (bucket === 'active') return '<span class="badge-warning">Active Window</span>';
    if (bucket === 'upcoming') return '<span class="badge-processing">Upcoming</span>';
    if (bucket === 'closed') return '<span class="badge-success">Closed</span>';
    return '<span class="badge-error">Past Due</span>';
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

  function renderReminderRow(reminder) {
    var client = reminder.client || {};
    var order = reminder.order || {};
    var clientName = getClientDisplayName(client) || '-';
    var bucket = getReminderBucket(reminder);
    var invoiceSent = String(reminder.invoice_status || '').toLowerCase() === 'sent';
    var dueBadges = [badgeForBucket(bucket)];
    if (bucket === 'past' && invoiceSent) {
      dueBadges = [badgeForInvoiceStatus(reminder.invoice_status)];
    } else if (bucket !== 'closed') {
      dueBadges.unshift(badgeForDueDate(reminder.due_date));
    }

    reminderActionMap[reminder.id] = {
      id: reminder.id,
      status: reminder.status || 'Open',
      paymentStatus: reminder.payment_status || 'pending',
      invoiceNumber: reminder.invoice_number || '',
      invoiceDate: reminder.invoice_date || '',
      dueDate: reminder.due_date,
      emailPrimary: reminder.email_primary || defaultPrimaryRecipient,
      emailSecondary: reminder.email_secondary || defaultSecondaryRecipient,
    };

    return '<tr class="reminder-row" data-reminder-id="' + reminder.id + '" data-bucket="' + bucket + '">' +
      '<td><div class="reminder-cell-stack"><div class="reminder-cell-title">' + formatDate(reminder.due_date) + '</div><div class="mt-1 flex flex-wrap gap-2">' + dueBadges.join('') + '</div></div></td>' +
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
        (bucket === 'closed'
          ? '<span class="badge-success">Closed</span>'
          : '<button class="btn-secondary btn-sm reminder-action-trigger inline-flex items-center justify-center" title="Open reminder actions" aria-label="Open reminder actions" onclick="openReminderActions(' + reminder.id + ')"><span class="material-symbols-outlined text-base">more_horiz</span></button>') +
      '</td>' +
    '</tr>';
  }

  function renderSection(section, reminders) {
    var count = reminders.length;
    var tableId = 'remindersTable-' + section.key;
    var tbodyId = 'remindersBody-' + section.key;
    var countLabel = count === 1 ? '1 reminder' : count + ' reminders';

    return '<section class="stat-card !p-0 overflow-hidden reminder-board-section ' + section.accentClass + '" data-section-key="' + section.key + '">' +
      '<div class="reminder-section-header">' +
        '<div class="reminder-section-header-main">' +
          '<div class="reminder-section-icon"><span class="material-symbols-outlined">' + section.icon + '</span></div>' +
          '<div>' +
            '<h3 class="reminder-section-title">' + section.title + '</h3>' +
            '<p class="reminder-section-description">' + section.description + '</p>' +
          '</div>' +
        '</div>' +
        '<div class="reminder-section-count">' + countLabel + '</div>' +
      '</div>' +
      (count === 0
        ? '<div class="reminder-empty-state">' + section.empty + '</div>'
        : '<div class="overflow-x-auto">' +
            '<table class="stitch-table reminder-section-table" id="' + tableId + '">' +
              '<thead>' +
                '<tr>' +
                  '<th class="sortable" data-sort-key="0">Remarks</th>' +
                  '<th class="sortable" data-sort-key="1">Client</th>' +
                  '<th class="sortable" data-sort-key="2">Candidate</th>' +
                  '<th class="sortable" data-sort-key="3">Role</th>' +
                  '<th class="sortable text-right" data-sort-key="4" data-sort-type="currency">Bill Amount</th>' +
                  '<th>Payment Status</th>' +
                  '<th>Invoice Status</th>' +
                  '<th>Primary Email</th>' +
                  '<th>Secondary Email</th>' +
                  '<th class="text-center">Actions</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="' + tbodyId + '">' + reminders.map(renderReminderRow).join('') + '</tbody>' +
            '</table>' +
          '</div>') +
    '</section>';
  }

  function updateSummaryCards(grouped) {
    var summary = document.getElementById('reminderSummary');
    if (!summary) return;
    var values = [
      grouped.active.length,
      grouped.upcoming.length,
      grouped.past.length,
      grouped.closed.length,
    ];
    var cards = summary.querySelectorAll('.reminder-summary-card');
    cards.forEach(function (card, index) {
      var valueEl = card.querySelector('.reminder-summary-value');
      if (valueEl) valueEl.textContent = values[index];
    });
  }

  function groupReminders(data) {
    return data.reduce(function (acc, reminder) {
      acc[getReminderBucket(reminder)].push(reminder);
      return acc;
    }, { active: [], upcoming: [], past: [], closed: [] });
  }

  function applyReminderSearch() {
    var input = document.getElementById('remindersSearch');
    var query = input ? input.value.toLowerCase().trim() : '';

    reminderSectionConfigs.forEach(function (section) {
      var boardSection = document.querySelector('[data-section-key="' + section.key + '"]');
      if (!boardSection) return;

      var rows = boardSection.querySelectorAll('tbody tr.reminder-row');
      var visibleCount = 0;

      rows.forEach(function (row) {
        var matches = row.textContent.toLowerCase().indexOf(query) !== -1;
        row.style.display = matches ? '' : 'none';
        if (matches) visibleCount += 1;
      });

      var emptyEl = boardSection.querySelector('.reminder-search-empty');
      if (rows.length > 0) {
        if (visibleCount === 0) {
          if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.className = 'reminder-empty-state reminder-search-empty';
            boardSection.appendChild(emptyEl);
          }
          emptyEl.textContent = 'No reminders in this section match your search.';
        } else if (emptyEl) {
          emptyEl.remove();
        }
      }

      boardSection.style.display = '';
    });
  }

  function renderReminders(data) {
    var board = document.getElementById('remindersBoard');
    if (!board) return;

    reminderActionMap = {};

    if (!data || data.length === 0) {
      updateSummaryCards({ active: [], upcoming: [], past: [], closed: [] });
      board.innerHTML = '<div class="stat-card !p-0 overflow-hidden"><div class="reminder-empty-state">No reminders found.</div></div>';
      return;
    }

    var grouped = groupReminders(data);
    updateSummaryCards(grouped);
    board.innerHTML = reminderSectionConfigs.map(function (section) {
      return renderSection(section, grouped[section.key]);
    }).join('');

    board.querySelectorAll('.reminder-section-table').forEach(function (table) {
      initTableSort(table);
    });

    applyReminderSearch();
  }

  async function loadReminders() {
    var board = document.getElementById('remindersBoard');
    if (board) {
      board.innerHTML = '<div class="stat-card !p-0 overflow-hidden"><div class="p-6"><div class="loading-spinner"></div></div></div>';
    }

    try {
      var res = await apiCall('GET', '/api/permanent/reminders');
      remindersData = res.data || [];
      renderReminders(remindersData);
    } catch (err) {
      showToast(err.message, 'danger');
      if (board) {
        board.innerHTML = '<div class="stat-card !p-0 overflow-hidden"><div class="reminder-empty-state">Failed to load reminders.</div></div>';
      }
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
      var modalPrimaryEl = document.getElementById('reminderEmailPrimary');
      var modalSecondaryEl = document.getElementById('reminderEmailSecondary');
      var email1 = modalPrimaryEl ? modalPrimaryEl.value.trim() : '';
      var email2 = modalSecondaryEl ? modalSecondaryEl.value.trim() : '';
      await apiCall('PATCH', '/api/permanent/reminders/' + id + '/emails', {
        email_primary: email1,
        email_secondary: email2,
      });
      showToast('Reminder emails updated', 'success');
      closeReminderEmailModal();
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
  var searchInput = document.getElementById('remindersSearch');
  if (searchInput) {
    searchInput.addEventListener('input', applyReminderSearch);
  }
  loadReminders();
})();
