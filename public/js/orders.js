(function () {
  var permanentClients = [];
  var ordersData = [];
  var orderActionMap = {};

  function normalizeInvoiceDueIn(value) {
    if (value === 'Weekly') return '7 days';
    if (value === 'Monthly') return '30 days';
    if (value === 'Quarterly') return '90 days';
    return value || '';
  }

  function addDays(date, days) {
    var base = new Date(date);
    base.setDate(base.getDate() + days);
    return base;
  }

  function toISODate(date) {
    return date.toISOString().slice(0, 10);
  }

  function calculateNextBillDate(doj, billingPattern) {
    if (!doj || !billingPattern) return '';
    var date = new Date(doj);
    if (Number.isNaN(date.getTime())) return '';
    var normalized = normalizeInvoiceDueIn(billingPattern);
    if (normalized === 'Immediate') return toISODate(date);
    if (normalized === '7 days') return toISODate(addDays(date, 7));
    if (normalized === '30 days') return toISODate(addDays(date, 30));
    if (normalized === '60 days') return toISODate(addDays(date, 60));
    if (normalized === '90 days') return toISODate(addDays(date, 90));
    return '';
  }

  function updateComputedFields() {
    var clientId = parseInt(document.getElementById('orderClient').value, 10);
    var doj = document.getElementById('orderDateOfJoining').value;
    var ctc = parseFloat(document.getElementById('orderCTCOffered').value || 0);
    var client = permanentClients.find(function (item) { return item.id === clientId; });

    var nextBillDate = '';
    var billAmount = 0;
    if (client && doj) {
      nextBillDate = calculateNextBillDate(doj, client.billing_pattern);
    }
    if (client && ctc > 0) {
      billAmount = ctc * (Number(client.billing_rate || 0) / 100);
    }

    document.getElementById('orderNextBillDate').value = nextBillDate;
    document.getElementById('orderBillAmount').value = billAmount > 0 ? formatCurrency(billAmount) : '';
  }

  function isOrderCancelled(order) {
    return Boolean(order && (order.is_cancelled || order.cancelled_at));
  }

  function splitOrders(data) {
    var groups = { active: [], cancelled: [] };
    (data || []).forEach(function (order) {
      groups[isOrderCancelled(order) ? 'cancelled' : 'active'].push(order);
    });
    return groups;
  }

  function updateCountLabel(id, value) {
    var count = document.getElementById(id);
    if (count) count.textContent = value === 1 ? '1 row' : value + ' rows';
  }

  function updateOrdersSummary(data) {
    var groups = splitOrders(data);
    var items = groups.active;
    var summary = document.getElementById('ordersSummary');
    var clientCount = new Set(items.map(function (order) { return order.client_id; }).filter(Boolean)).size;
    var upcomingCount = items.filter(function (order) {
      var invoiceStatus = order.reminder ? String(order.reminder.invoice_status || 'pending').toLowerCase() : 'pending';
      return !!order.next_bill_date && invoiceStatus !== 'sent';
    }).length;
    if (summary) {
      var cards = summary.querySelectorAll('.table-summary-value');
      if (cards[0]) cards[0].textContent = items.length;
      if (cards[1]) cards[1].textContent = clientCount;
      if (cards[2]) cards[2].textContent = upcomingCount;
    }
    updateCountLabel('ordersTableCount', items.length);
    updateCountLabel('cancelledOrdersTableCount', groups.cancelled.length);
  }

  function updateOrdersVisibleCount() {
    function visibleRows(tbodyId) {
      var tbody = document.getElementById(tbodyId);
      if (!tbody) return 0;
      return Array.from(tbody.querySelectorAll('tr')).filter(function (row) {
        return !row.querySelector('td[colspan]') && row.style.display !== 'none';
      }).length;
    }
    updateCountLabel('ordersTableCount', visibleRows('ordersBody'));
    updateCountLabel('cancelledOrdersTableCount', visibleRows('cancelledOrdersBody'));
  }

  function renderOrderRow(order, isCancelled) {
    var clientName = order.client ? getClientDisplayName(order.client) : ('Client #' + order.client_id);
    if (!isCancelled) {
      orderActionMap[order.id] = {
        id: order.id,
        reminderId: order.reminder ? order.reminder.id : null,
        reminderStatus: order.reminder ? (order.reminder.status || 'Open') : null,
        invoiceNumber: order.reminder ? (order.reminder.invoice_number || '') : '',
        invoiceDate: order.reminder ? (order.reminder.invoice_date || '') : '',
        invoiceStatus: order.reminder ? (order.reminder.invoice_status || 'pending') : 'pending',
        paymentStatus: order.reminder ? (order.reminder.payment_status || 'pending') : 'pending',
      };
    }
    var invoiceStatus = order.reminder ? String(order.reminder.invoice_status || 'pending').toLowerCase() : 'pending';
    var paymentStatus = order.reminder ? String(order.reminder.payment_status || 'pending').toLowerCase() : 'pending';
    var invoiceDueDisplay = isCancelled
      ? '<span class="badge-error">Cancelled</span>'
      : (invoiceStatus === 'sent'
        ? '<span class="badge-success">Invoice Sent</span>'
        : '<span class="table-date-chip">' + (order.next_bill_date ? formatDate(order.next_bill_date) : 'TBD') + '</span>');
    var statusPrimary = isCancelled ? 'Cancelled' : (invoiceStatus === 'sent' ? 'Sent' : 'Pending');
    var finalCell = isCancelled
      ? '<span class="table-date-chip">' + (order.cancelled_at ? formatDate(order.cancelled_at) : '-') + '</span>'
      : '<button class="btn-secondary btn-sm table-action-trigger inline-flex items-center justify-center" title="Open order actions" aria-label="Open order actions" onclick="openOrderActions(' + order.id + ')"><span class="material-symbols-outlined text-base">more_horiz</span></button>';
    return '<tr>' +
      '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(clientName) + '">' + escapeHtml(clientName) + '</span></div></td>' +
      '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(order.candidate_name || '') + '</span></div></td>' +
      '<td><div class="table-cell-box table-cell-text">' + escapeHtml(order.requisition_description || '---') + '</div></td>' +
      '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(order.position_role || '') + '">' + escapeHtml(order.position_role || '---') + '</span></div></td>' +
      '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(order.date_of_joining) + '</span></div></td>' +
      '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(order.ctc_offered) + '</span></div></td>' +
      '<td><div class="table-cell-box">' + invoiceDueDisplay + '</div></td>' +
      '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(order.bill_amount) + '</span></div></td>' +
      '<td><div class="table-cell-box table-cell-text table-cell-invoice">' + escapeHtml(order.reminder && order.reminder.invoice_number ? order.reminder.invoice_number : '---') + '</div></td>' +
      '<td><div class="table-cell-box"><span class="table-date-chip">' + (order.reminder && order.reminder.invoice_date ? formatDate(order.reminder.invoice_date) : '-') + '</span></div></td>' +
      '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(statusPrimary) + '</span><span class="table-cell-secondary">' + escapeHtml(paymentStatus === 'paid' ? 'Paid' : 'Pending') + '</span></div></td>' +
      '<td><div class="table-cell-box table-cell-text table-cell-remarks">' + escapeHtml(order.remarks || '---') + '</div></td>' +
      '<td class="text-center"><div class="table-cell-box table-cell-center">' + finalCell + '</div></td>' +
    '</tr>';
  }

  function applyOrdersSearch() {
    var input = document.getElementById('ordersSearch');
    var query = input ? input.value.toLowerCase().trim() : '';
    ['ordersBody', 'cancelledOrdersBody'].forEach(function (tbodyId) {
      var tbody = document.getElementById(tbodyId);
      if (!tbody) return;
      tbody.querySelectorAll('tr').forEach(function (row) {
        if (row.querySelector('td[colspan]')) {
          row.style.display = '';
          return;
        }
        row.style.display = row.textContent.toLowerCase().indexOf(query) !== -1 ? '' : 'none';
      });
    });
    updateOrdersVisibleCount();
  }

  function renderOrders(data) {
    var tbody = document.getElementById('ordersBody');
    var cancelledTbody = document.getElementById('cancelledOrdersBody');
    var groups = splitOrders(data);
    updateOrdersSummary(data);
    orderActionMap = {};

    if (!groups.active.length) {
      tbody.innerHTML = '<tr><td colspan="13" class="text-center text-on-surface-variant py-8">No active orders found. Create one!</td></tr>';
    } else {
      tbody.innerHTML = groups.active.map(function (order) { return renderOrderRow(order, false); }).join('');
    }

    if (cancelledTbody) {
      if (!groups.cancelled.length) {
        cancelledTbody.innerHTML = '<tr><td colspan="13" class="text-center text-on-surface-variant py-8">No cancelled orders yet.</td></tr>';
      } else {
        cancelledTbody.innerHTML = groups.cancelled.map(function (order) { return renderOrderRow(order, true); }).join('');
      }
    }

    initTableSort('ordersTable');
    initTableSort('cancelledOrdersTable');
    applyOrdersSearch();
    updateOrdersVisibleCount();
  }

  async function loadPermanentClients() {
    var res = await apiCall('GET', '/api/permanent/clients');
    permanentClients = res.data || [];

    var select = document.getElementById('orderClient');
    select.innerHTML = '<option value="">Select client</option>';
    permanentClients.forEach(function (client) {
      select.innerHTML += '<option value="' + client.id + '">' + escapeHtml(getClientDisplayName(client)) + '</option>';
    });
  }

  async function loadOrders() {
    var tbody = document.getElementById('ordersBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/permanent/orders');
      ordersData = res.data || [];
      renderOrders(ordersData);
    } catch (err) {
      showToast(err.message, 'danger');
      hideLoading(tbody);
    }
  }

  window.openOrderActions = function (id) {
    var actionState = orderActionMap[id];
    var container = document.getElementById('orderActionList');
    var title = document.getElementById('orderActionTitle');
    if (!actionState || !container || !title) return;

    title.textContent = 'Order Actions';
    container.innerHTML = '';
    if (String(actionState.paymentStatus || '').toLowerCase() !== 'paid') {
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runOrderActionEdit(' + id + ')"><span class="material-symbols-outlined">edit</span><span><strong>Edit order</strong><small>Update candidate, role, billing, and dates</small></span></button>';
    }
    if (actionState.reminderId && actionState.reminderStatus === 'Open') {
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runOrderActionInvoice(' + id + ')"><span class="material-symbols-outlined">receipt_long</span><span><strong>Set Invoice Details</strong><small>Save invoice number and invoice date</small></span></button>';
    }
    if (actionState.reminderId) {
      var nextPaymentStatus = String(actionState.paymentStatus || '').toLowerCase() === 'paid' ? 'pending' : 'paid';
      var paymentLabel = nextPaymentStatus === 'paid' ? 'Mark paid' : 'Mark pending';
      container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runOrderActionPayment(' + id + ', \'' + nextPaymentStatus + '\')"><span class="material-symbols-outlined">payments</span><span><strong>' + paymentLabel + '</strong><small>Change the payment status for this order</small></span></button>';
    }
    container.innerHTML += '<button type="button" class="action-sheet-btn action-sheet-btn-danger" onclick="runOrderActionDelete(' + id + ')"><span class="material-symbols-outlined">delete</span><span><strong>Cancel order</strong><small>Move this order to the cancelled list</small></span></button>';
    openModal('orderActionModal');
  };

  window.closeOrderActions = function () {
    closeModal('orderActionModal');
  };

  window.runOrderActionEdit = function (id) {
    closeOrderActions();
    editOrder(id);
  };

  window.runOrderActionDelete = function (id) {
    closeOrderActions();
    deleteOrder(id);
  };

  window.runOrderActionInvoice = function (id) {
    var state = orderActionMap[id] || {};
    closeOrderActions();
    if (!state.reminderId) {
      showToast('No open reminder found for this order', 'warning');
      return;
    }
    openOrderInvoiceSentModal(state.reminderId, state.invoiceNumber || '', state.invoiceDate || '');
  };

  window.runOrderActionPayment = async function (id, status) {
    var state = orderActionMap[id] || {};
    closeOrderActions();
    if (!state.reminderId) {
      showToast('No reminder found for this order', 'warning');
      return;
    }
    try {
      await apiCall('PATCH', '/api/permanent/reminders/' + state.reminderId + '/payment-status', {
        payment_status: status,
      });
      showToast('Payment status updated', 'success');
      loadOrders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.openOrderModal = function () {
    document.getElementById('orderForm').reset();
    document.getElementById('orderId').value = '';
    document.getElementById('orderModalTitle').textContent = 'Create Order';
    document.getElementById('orderNextBillDate').value = '';
    document.getElementById('orderBillAmount').value = '';
    window.orderEdit = null;
    openModal('orderModal');
  };

  window.closeOrderModal = function () {
    closeModal('orderModal');
    document.getElementById('orderForm').reset();
    window.orderEdit = null;
  };

  window.openOrderInvoiceSentModal = function (reminderId, invoiceNumber, invoiceDate) {
    document.getElementById('orderInvoiceSentForm').reset();
    document.getElementById('orderInvoiceReminderId').value = reminderId;
    document.getElementById('orderInvoiceNumber').value = invoiceNumber || '';
    document.getElementById('orderInvoiceDate').value = invoiceDate || '';
    openModal('orderInvoiceSentModal');
  };

  window.closeOrderInvoiceSentModal = function () {
    closeModal('orderInvoiceSentModal');
  };

  window.editOrder = async function (id) {
    try {
      var res = await apiCall('GET', '/api/permanent/orders/' + id);
      var order = res.data;
      window.orderEdit = id;
      document.getElementById('orderModalTitle').textContent = 'Edit Order';
      document.getElementById('orderId').value = order.id;
      document.getElementById('orderClient').value = order.client_id;
      document.getElementById('orderCandidateName').value = order.candidate_name || '';
      document.getElementById('orderRequisitionDescription').value = order.requisition_description || '';
      document.getElementById('orderPositionRole').value = order.position_role || '';
      document.getElementById('orderDateOfOffer').value = order.date_of_offer || '';
      document.getElementById('orderDateOfJoining').value = order.date_of_joining || '';
      document.getElementById('orderCTCOffered').value = order.ctc_offered || '';
      document.getElementById('orderRemarks').value = order.remarks || '';
      updateComputedFields();
      openModal('orderModal');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.deleteOrder = async function (id) {
    var confirmed = await confirmAction('Cancel Order', 'Move this order to the Cancelled Orders table?');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/permanent/orders/' + id);
      showToast('Order moved to cancelled orders', 'success');
      loadOrders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  document.getElementById('orderClient').addEventListener('change', updateComputedFields);
  document.getElementById('orderDateOfJoining').addEventListener('change', updateComputedFields);
  document.getElementById('orderCTCOffered').addEventListener('input', updateComputedFields);

  document.getElementById('orderForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var candidateName = document.getElementById('orderCandidateName').value.trim();
    if (!/^[A-Za-z ]+$/.test(candidateName)) {
      showToast('Candidate name can contain only letters and spaces', 'danger');
      return;
    }
    var payload = {
      client_id: parseInt(document.getElementById('orderClient').value, 10),
      candidate_name: candidateName,
      requisition_description: document.getElementById('orderRequisitionDescription').value.trim(),
      position_role: document.getElementById('orderPositionRole').value.trim(),
      date_of_offer: document.getElementById('orderDateOfOffer').value,
      date_of_joining: document.getElementById('orderDateOfJoining').value,
      ctc_offered: parseFloat(document.getElementById('orderCTCOffered').value),
      remarks: document.getElementById('orderRemarks').value.trim(),
    };

    try {
      if (window.orderEdit) {
        await apiCall('PUT', '/api/permanent/orders/' + window.orderEdit, payload);
        showToast('Order updated', 'success');
      } else {
        await apiCall('POST', '/api/permanent/orders', payload);
        showToast('Order created', 'success');
      }
      closeOrderModal();
      loadOrders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  document.getElementById('orderInvoiceSentForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var reminderId = document.getElementById('orderInvoiceReminderId').value;
    var invoiceNumber = document.getElementById('orderInvoiceNumber').value.trim();
    var invoiceDate = document.getElementById('orderInvoiceDate').value;
    try {
      await apiCall('PATCH', '/api/permanent/reminders/' + reminderId + '/invoice-sent', {
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
      });
      showToast('Invoice status updated', 'success');
      closeOrderInvoiceSentModal();
      loadOrders();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  var ordersSearchInput = document.getElementById('ordersSearch');
  if (ordersSearchInput) {
    var ordersSearchTimer = null;
    ordersSearchInput.addEventListener('input', function () {
      clearTimeout(ordersSearchTimer);
      ordersSearchTimer = setTimeout(applyOrdersSearch, 200);
    });
  }

  loadPermanentClients()
    .then(loadOrders)
    .catch(function (err) {
      showToast(err.message, 'danger');
    });
})();
