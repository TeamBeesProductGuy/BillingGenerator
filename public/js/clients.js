(function () {
  var PHONE_RULES = {
    '+91': { min: 10, max: 10 },
    '+1': { min: 10, max: 10 },
    '+44': { min: 10, max: 10 },
    '+61': { min: 9, max: 9 },
    '+65': { min: 8, max: 8 },
    '+971': { min: 9, max: 9 },
  };

  function splitPhone(fullPhone) {
    var raw = String(fullPhone || '').trim();
    if (!raw) return { code: '+91', number: '' };
    for (var code in PHONE_RULES) {
      if (raw.indexOf(code) === 0) {
        return { code: code, number: raw.slice(code.length).replace(/\D/g, '') };
      }
    }
    return { code: '+91', number: raw.replace(/\D/g, '') };
  }

  function buildPhone(code, number) {
    var num = String(number || '').replace(/\D/g, '');
    if (!num) return '';
    return String(code || '+91') + num;
  }

  function validatePhone(code, number) {
    var num = String(number || '').replace(/\D/g, '');
    if (!num) return null;
    var rule = PHONE_RULES[code];
    if (!rule) return 'Please select a valid country code';
    if (num.length < rule.min || num.length > rule.max) {
      if (rule.min === rule.max) {
        return 'Phone number must be exactly ' + rule.min + ' digits for ' + code;
      }
      return 'Phone number must be between ' + rule.min + ' and ' + rule.max + ' digits for ' + code;
    }
    return null;
  }

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
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-on-surface-variant py-8">No clients found. Add one!</td></tr>';
    } else {
      tbody.innerHTML = data.map(function (c) {
        return '<tr>' +
          '<td><strong>' + escapeHtml(c.client_name) + '</strong></td>' +
          '<td>' + escapeHtml(c.abbreviation || '') + '</td>' +
          '<td>' + escapeHtml(c.address || '') + '</td>' +
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
      document.getElementById('clientAbbreviation').value = c.abbreviation || '';
      document.getElementById('contactPerson').value = c.contact_person || '';
      document.getElementById('clientEmail').value = c.email || '';
      var phoneParts = splitPhone(c.phone || '');
      document.getElementById('clientPhoneCountryCode').value = phoneParts.code;
      document.getElementById('clientPhone').value = phoneParts.number;
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
    var phoneCountryCode = document.getElementById('clientPhoneCountryCode').value;
    var phoneNumber = document.getElementById('clientPhone').value.trim();
    var phoneValidation = validatePhone(phoneCountryCode, phoneNumber);
    if (phoneValidation) {
      showToast(phoneValidation, 'danger');
      return;
    }
    var data = {
      client_name: document.getElementById('clientName').value.trim(),
      abbreviation: document.getElementById('clientAbbreviation').value.trim(),
      contact_person: document.getElementById('contactPerson').value.trim(),
      email: document.getElementById('clientEmail').value.trim(),
      phone: buildPhone(phoneCountryCode, phoneNumber),
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
