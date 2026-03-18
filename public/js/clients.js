(function () {
  // Store loaded data for search/sort
  var clientsData = [];

  // openModal / closeModal provided by app.js (with scroll lock + Escape + backdrop)

  window.openClientModal = function () {
    document.getElementById('clientForm').reset();
    document.getElementById('clientId').value = '';
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    window.clientEdit = null;
    openModal('clientModal');
  };

  window.closeClientModal = function () {
    closeModal('clientModal');
    document.getElementById('clientForm').reset();
    document.getElementById('clientId').value = '';
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    window.clientEdit = null;
  };

  async function loadClients() {
    var tbody = document.getElementById('clientsBody');
    showLoading(tbody);
    try {
      var res = await apiCall('GET', '/api/clients');
      clientsData = res.data;
      renderClients(clientsData);
    } catch (err) { showToast(err.message, 'danger'); hideLoading(tbody); }
  }

  function renderClients(data) {
    var tbody = document.getElementById('clientsBody');
    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-on-surface-variant py-8">No clients found. Add one!</td></tr>';
    } else {
      tbody.innerHTML = data.map(function (c) {
        return '<tr>' +
          '<td><strong>' + escapeHtml(c.client_name) + '</strong></td>' +
          '<td>' + escapeHtml(c.contact_person || '') + '</td>' +
          '<td>' + escapeHtml(c.email || '') + '</td>' +
          '<td>' + escapeHtml(c.phone || '') + '</td>' +
          '<td>' + escapeHtml(c.industry || '') + '</td>' +
          '<td class="text-center">' +
            '<div class="inline-flex items-center gap-1">' +
            '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editClient(' + c.id + ')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>' +
            '<button class="btn-danger btn-sm inline-flex items-center" onclick="deleteClient(' + c.id + ', \'' + escapeHtml(c.client_name).replace(/'/g, "\\'") + '\')" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>' +
            '</div>' +
          '</td>' +
          '</tr>';
      }).join('');
    }
    initTableSort('clientsTable');
  }

  window.editClient = async function (id) {
    try {
      var res = await apiCall('GET', '/api/clients/' + id);
      var c = res.data;
      document.getElementById('clientId').value = c.id;
      document.getElementById('clientName').value = c.client_name;
      document.getElementById('contactPerson').value = c.contact_person || '';
      document.getElementById('clientEmail').value = c.email || '';
      document.getElementById('clientPhone').value = c.phone || '';
      document.getElementById('clientAddress').value = c.address || '';
      document.getElementById('clientIndustry').value = c.industry || '';
      document.getElementById('clientModalTitle').textContent = 'Edit Client';
      window.clientEdit = c.id;
      openModal('clientModal');
    } catch (err) { showToast(err.message, 'danger'); }
  };

  window.deleteClient = async function (id, name) {
    var confirmed = await confirmAction('Delete Client', 'Are you sure you want to delete client "' + name + '"? This cannot be undone.');
    if (!confirmed) return;
    try {
      await apiCall('DELETE', '/api/clients/' + id);
      showToast('Client deleted', 'success');
      loadClients();
    } catch (err) { showToast(err.message, 'danger'); }
  };

  document.getElementById('clientForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var data = {
      client_name: document.getElementById('clientName').value.trim(),
      contact_person: document.getElementById('contactPerson').value.trim(),
      email: document.getElementById('clientEmail').value.trim(),
      phone: document.getElementById('clientPhone').value.trim(),
      address: document.getElementById('clientAddress').value.trim(),
      industry: document.getElementById('clientIndustry').value.trim(),
    };

    try {
      if (window.clientEdit) {
        await apiCall('PUT', '/api/clients/' + window.clientEdit, data);
        showToast('Client updated', 'success');
      } else {
        await apiCall('POST', '/api/clients', data);
        showToast('Client created', 'success');
      }
      closeClientModal();
      loadClients();
    } catch (err) { showToast(err.message, 'danger'); }
  });

  // Initialize search
  initTableSearch('clientsSearch', 'clientsBody');

  loadClients();
})();
