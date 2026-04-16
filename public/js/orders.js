(function () {
  var permanentClients = [];
  var ordersData = [];

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

  function renderOrders(data) {
    var tbody = document.getElementById('ordersBody');
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-on-surface-variant py-8">No orders found. Create one!</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(function (order) {
      var clientName = order.client ? getClientDisplayName(order.client) : ('Client #' + order.client_id);
      return '<tr>' +
        '<td>' + escapeHtml(clientName) + '</td>' +
        '<td><strong>' + escapeHtml(order.candidate_name || '') + '</strong></td>' +
        '<td>' + escapeHtml(order.position_role || '') + '</td>' +
        '<td>' + formatDate(order.date_of_joining) + '</td>' +
        '<td class="text-right">' + formatCurrency(order.ctc_offered) + '</td>' +
        '<td>' + formatDate(order.next_bill_date) + '</td>' +
        '<td class="text-right">' + formatCurrency(order.bill_amount) + '</td>' +
        '<td>' + escapeHtml(order.remarks || '') + '</td>' +
        '<td class="text-center">' +
          '<div class="inline-flex items-center gap-1">' +
            '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editOrder(' + order.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>' +
            '<button class="btn-danger btn-sm inline-flex items-center" onclick="deleteOrder(' + order.id + ')" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    initTableSort('ordersTable');
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

  window.editOrder = async function (id) {
    try {
      var res = await apiCall('GET', '/api/permanent/orders/' + id);
      var order = res.data;
      window.orderEdit = id;
      document.getElementById('orderModalTitle').textContent = 'Edit Order';
      document.getElementById('orderId').value = order.id;
      document.getElementById('orderClient').value = order.client_id;
      document.getElementById('orderCandidateName').value = order.candidate_name || '';
      document.getElementById('orderPositionRole').value = order.position_role || '';
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
      position_role: document.getElementById('orderPositionRole').value.trim(),
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

  initTableSearch('ordersSearch', 'ordersBody');

  loadPermanentClients()
    .then(loadOrders)
    .catch(function (err) {
      showToast(err.message, 'danger');
    });
})();
