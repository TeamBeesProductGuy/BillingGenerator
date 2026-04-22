(function () {
  var permanentClients = [];
  var ordersData = [];
  var orderActionMap = {};

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
    if (billingPattern === 'Weekly') return toISODate(addDays(date, 7));
    if (billingPattern === 'Monthly') {
      date.setMonth(date.getMonth() + 1);
      return toISODate(date);
    }
    if (billingPattern === 'Quarterly') {
      date.setMonth(date.getMonth() + 3);
      return toISODate(date);
    }
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

  function updateOrdersSummary(data) {
    var items = data || [];
    var summary = document.getElementById('ordersSummary');
    var count = document.getElementById('ordersTableCount');
    var clientCount = new Set(items.map(function (order) { return order.client_id; }).filter(Boolean)).size;
    var upcomingCount = items.filter(function (order) { return !!order.next_bill_date; }).length;
    if (summary) {
      var cards = summary.querySelectorAll('.table-summary-value');
      if (cards[0]) cards[0].textContent = items.length;
      if (cards[1]) cards[1].textContent = clientCount;
      if (cards[2]) cards[2].textContent = upcomingCount;
    }
    if (count) count.textContent = items.length === 1 ? '1 row' : items.length + ' rows';
  }

  function updateOrdersVisibleCount() {
    var tbody = document.getElementById('ordersBody');
    var count = document.getElementById('ordersTableCount');
    if (!tbody || !count) return;
    var visible = Array.from(tbody.querySelectorAll('tr')).filter(function (row) {
      return !row.querySelector('td[colspan]') && row.style.display !== 'none';
    }).length;
    count.textContent = visible === 1 ? '1 row' : visible + ' rows';
  }

  function renderOrders(data) {
    var tbody = document.getElementById('ordersBody');
    updateOrdersSummary(data);
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-on-surface-variant py-8">No orders found. Create one!</td></tr>';
      return;
    }

    orderActionMap = {};
    tbody.innerHTML = data.map(function (order) {
      var clientName = order.client ? getClientDisplayName(order.client) : ('Client #' + order.client_id);
      orderActionMap[order.id] = {
        id: order.id,
        reminderId: order.reminder ? order.reminder.id : null,
        invoiceNumber: order.reminder ? (order.reminder.invoice_number || '') : '',
        invoiceDate: order.reminder ? (order.reminder.invoice_date || '') : '',
      };
      return '<tr>' +
        '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(clientName) + '">' + escapeHtml(clientName) + '</span></div></td>' +
        '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(order.candidate_name || '') + '</span><span class="table-cell-secondary">' + escapeHtml(order.position_role || '') + '</span></div></td>' +
        '<td><div class="table-cell-box table-cell-text">' + escapeHtml(order.requisition_description || '---') + '</div></td>' +
        '<td><div class="table-cell-box"><span class="entity-pill" title="' + escapeHtml(order.position_role || '') + '">' + escapeHtml(order.position_role || '---') + '</span></div></td>' +
        '<td><div class="table-cell-box"><span class="table-date-chip">' + (order.date_of_offer ? formatDate(order.date_of_offer) : 'Pending') + '</span></div></td>' +
        '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(order.date_of_joining) + '</span></div></td>' +
        '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(order.ctc_offered) + '</span></div></td>' +
        '<td><div class="table-cell-box"><span class="table-date-chip">' + (order.next_bill_date ? formatDate(order.next_bill_date) : 'TBD') + '</span></div></td>' +
        '<td class="text-right"><div class="table-cell-box table-cell-amount"><span class="table-amount-pill">' + formatCurrency(order.bill_amount) + '</span></div></td>' +
        '<td><div class="table-cell-box table-cell-text table-cell-remarks">' + escapeHtml(order.remarks || '---') + '</div></td>' +
        '<td class="text-center"><div class="table-cell-box table-cell-center">' +
          '<button class="btn-secondary btn-sm table-action-trigger inline-flex items-center justify-center" title="Open order actions" aria-label="Open order actions" onclick="openOrderActions(' + order.id + ')"><span class="material-symbols-outlined text-base">more_horiz</span></button>' +
        '</div></td>' +
      '</tr>';
    }).join('');

    initTableSort('ordersTable');
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
    container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runOrderActionEdit(' + id + ')"><span class="material-symbols-outlined">edit</span><span><strong>Edit order</strong><small>Update candidate, role, billing, and dates</small></span></button>';
    container.innerHTML += '<button type="button" class="action-sheet-btn" onclick="runOrderActionInvoice(' + id + ')"><span class="material-symbols-outlined">receipt_long</span><span><strong>Set Invoice Details</strong><small>Save invoice number and invoice date</small></span></button>';
    container.innerHTML += '<button type="button" class="action-sheet-btn action-sheet-btn-danger" onclick="runOrderActionDelete(' + id + ')"><span class="material-symbols-outlined">delete</span><span><strong>Delete order</strong><small>Remove this order from the active list</small></span></button>';
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
    var confirmed = await confirmAction('Delete Order', 'Are you sure you want to delete this order?');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/permanent/orders/' + id);
      showToast('Order deleted', 'success');
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
    var payload = {
      client_id: parseInt(document.getElementById('orderClient').value, 10),
      candidate_name: document.getElementById('orderCandidateName').value.trim(),
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

  initTableSearch('ordersSearch', 'ordersBody');
  document.getElementById('ordersSearch').addEventListener('input', function () {
    setTimeout(updateOrdersVisibleCount, 250);
  });

  loadPermanentClients()
    .then(loadOrders)
    .catch(function (err) {
      showToast(err.message, 'danger');
    });
})();
