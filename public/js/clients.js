(function () {
  var PHONE_RULES = {
    '+91': { min: 10, max: 10 },
    '+1': { min: 10, max: 10 },
    '+44': { min: 10, max: 10 },
    '+61': { min: 9, max: 9 },
    '+65': { min: 8, max: 8 },
    '+971': { min: 9, max: 9 },
  };

  var clientsData = [];

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
      if (rule.min === rule.max) return 'Phone number must be exactly ' + rule.min + ' digits for ' + code;
      return 'Phone number must be between ' + rule.min + ' and ' + rule.max + ' digits for ' + code;
    }
    return null;
  }

  function getPrimaryContact(client) {
    if (!client || !client.contacts || client.contacts.length === 0) return null;
    return client.contacts[0];
  }

  function updateClientFormByType() {
    var type = document.getElementById('contractType').value;
    var contractualFields = document.getElementById('contractualFields');
    var permanentFields = document.getElementById('permanentFields');

    if (type === 'Permanent') {
      contractualFields.classList.add('hidden');
      permanentFields.classList.remove('hidden');
      document.getElementById('clientEntityType').value = 'Permanent';
    } else {
      contractualFields.classList.remove('hidden');
      permanentFields.classList.add('hidden');
      document.getElementById('clientEntityType').value = 'Contractual';
    }
  }

  function createContactRow(contact) {
    var contactData = contact || {};
    var parsed = splitPhone(contactData.phone || '');
    var row = document.createElement('div');
    row.className = 'rounded-xl border border-outline-variant/15 p-3 space-y-3';
    row.innerHTML =
      '<div class="flex items-center justify-between">' +
        '<div class="text-xs uppercase tracking-[0.15em] text-on-surface-variant font-semibold">Contact</div>' +
        '<button type="button" class="text-error text-xs font-semibold uppercase tracking-[0.15em] remove-contact-btn">Remove</button>' +
      '</div>' +
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        '<div><label class="block text-[11px] text-on-surface-variant mb-1">Name *</label><input type="text" class="contact-name" value="' + escapeHtml(contactData.contact_name || '') + '"></div>' +
        '<div><label class="block text-[11px] text-on-surface-variant mb-1">Email</label><input type="email" class="contact-email" value="' + escapeHtml(contactData.email || '') + '"></div>' +
        '<div><label class="block text-[11px] text-on-surface-variant mb-1">Phone</label><div class="grid grid-cols-3 gap-2"><select class="contact-phone-code">' +
          '<option value="+91">+91</option><option value="+1">+1</option><option value="+44">+44</option><option value="+61">+61</option><option value="+65">+65</option><option value="+971">+971</option>' +
        '</select><input type="text" class="contact-phone col-span-2" value="' + escapeHtml(parsed.number) + '"></div></div>' +
        '<div><label class="block text-[11px] text-on-surface-variant mb-1">Designation</label><input type="text" class="contact-designation" value="' + escapeHtml(contactData.designation || '') + '"></div>' +
      '</div>';

    row.querySelector('.contact-phone-code').value = parsed.code;
    row.querySelector('.remove-contact-btn').addEventListener('click', function () {
      row.remove();
      ensureMinimumContactRow();
    });
    return row;
  }

  function ensureMinimumContactRow() {
    var container = document.getElementById('permanentContactsList');
    if (container.children.length === 0) {
      container.appendChild(createContactRow());
    }
  }

  window.addPermanentContactRow = function (contact) {
    document.getElementById('permanentContactsList').appendChild(createContactRow(contact));
  };

  function clearPermanentContacts() {
    var container = document.getElementById('permanentContactsList');
    container.innerHTML = '';
    ensureMinimumContactRow();
  }

  function readPermanentContacts() {
    var rows = Array.from(document.querySelectorAll('#permanentContactsList > div'));
    var contacts = [];

    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      var name = row.querySelector('.contact-name').value.trim();
      var email = row.querySelector('.contact-email').value.trim();
      var code = row.querySelector('.contact-phone-code').value;
      var phoneNumber = row.querySelector('.contact-phone').value.trim();
      var designation = row.querySelector('.contact-designation').value.trim();
      var phoneValidation = validatePhone(code, phoneNumber);
      if (phoneValidation) throw new Error(phoneValidation);
      if (!name) throw new Error('Each contact person must have a name');

      contacts.push({
        contact_name: name,
        email: email,
        phone: buildPhone(code, phoneNumber),
        designation: designation,
      });
    }

    if (contacts.length === 0) throw new Error('At least one contact person is required for permanent clients');
    return contacts;
  }

  function mapContractualClients(rows) {
    return (rows || []).map(function (item) {
      return {
        id: item.id,
        contract_type: 'Contractual',
        client_name: item.client_name,
        abbreviation: item.abbreviation || '',
        address: item.address || '',
        contact_person: item.contact_person || '',
        email: item.email || '',
        phone: item.phone || '',
        billing_pattern: '',
        billing_rate: '',
        industry: item.industry || '',
        raw: item,
      };
    });
  }

  function mapPermanentClients(rows) {
    return (rows || []).map(function (item) {
      var primaryContact = getPrimaryContact(item);
      return {
        id: item.id,
        contract_type: 'Permanent',
        client_name: item.client_name,
        abbreviation: item.abbreviation || '',
        address: item.address || '',
        contact_person: primaryContact ? primaryContact.contact_name : '',
        email: primaryContact ? (primaryContact.email || '') : '',
        phone: primaryContact ? (primaryContact.phone || '') : '',
        billing_pattern: item.billing_pattern || '',
        billing_rate: item.billing_rate || '',
        industry: '',
        raw: item,
      };
    });
  }

  function renderClients(rows) {
    var tbody = document.getElementById('clientsBody');
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" class="text-center text-on-surface-variant py-8">No clients found. Add one!</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (c) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(c.client_name) + '</strong></td>' +
        '<td>' + escapeHtml(c.abbreviation || '') + '</td>' +
        '<td>' + escapeHtml(c.contract_type) + '</td>' +
        '<td>' + escapeHtml(c.address || '') + '</td>' +
        '<td>' + escapeHtml(c.contact_person || '') + '</td>' +
        '<td>' + escapeHtml(c.email || '') + '</td>' +
        '<td>' + escapeHtml(c.phone || '') + '</td>' +
        '<td>' + escapeHtml(c.billing_pattern || '-') + '</td>' +
        '<td class="text-right">' + (c.billing_rate ? Number(c.billing_rate).toFixed(2) : '-') + '</td>' +
        '<td class="text-center">' +
          '<div class="inline-flex items-center gap-1">' +
            '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editClient(' + c.id + ', \'' + c.contract_type + '\')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>' +
            '<button class="btn-danger btn-sm inline-flex items-center" onclick="deleteClient(' + c.id + ', \'' + c.contract_type + '\', \'' + escapeHtml(c.client_name).replace(/'/g, "\\'") + '\')" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>' +
          '</div>' +
        '</td>' +
      '</tr>';
    }).join('');

    initTableSort('clientsTable');
  }

  async function loadClients() {
    var tbody = document.getElementById('clientsBody');
    showLoading(tbody);
    try {
      var permanentListPromise = apiCall('GET', '/api/permanent/clients')
        .catch(async function (err) {
          if (err && err.message && err.message.indexOf('404') !== -1) {
            return apiCall('GET', '/api/clients/permanent');
          }
          throw err;
        });

      var responses = await Promise.all([
        apiCall('GET', '/api/clients'),
        permanentListPromise,
      ]);

      var combined = mapContractualClients(responses[0].data).concat(mapPermanentClients(responses[1].data));
      clientsData = combined;
      renderClients(clientsData);
    } catch (err) {
      showToast(err.message, 'danger');
      hideLoading(tbody);
    }
  }

  function resetModalState() {
    document.getElementById('clientForm').reset();
    document.getElementById('clientId').value = '';
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('contractType').value = 'Contractual';
    clearPermanentContacts();
    updateClientFormByType();
    window.clientEdit = null;
  }

  window.openClientModal = function () {
    resetModalState();
    openModal('clientModal');
  };

  window.closeClientModal = function () {
    closeModal('clientModal');
    resetModalState();
  };

  window.editClient = async function (id, contractType) {
    try {
      if (contractType === 'Permanent') {
        var permanentRes;
        try {
          permanentRes = await apiCall('GET', '/api/permanent/clients/' + id);
        } catch (err) {
          if (err && err.message && err.message.indexOf('404') !== -1) {
            permanentRes = await apiCall('GET', '/api/clients/permanent/' + id);
          } else {
            throw err;
          }
        }
        var p = permanentRes.data;
        resetModalState();
        window.clientEdit = id;
        document.getElementById('clientModalTitle').textContent = 'Edit Client';
        document.getElementById('contractType').value = 'Permanent';
        updateClientFormByType();
        document.getElementById('permanentClientName').value = p.client_name || '';
        document.getElementById('permanentClientAbbreviation').value = p.abbreviation || '';
        document.getElementById('permanentClientAddress').value = p.address || '';
        document.getElementById('permanentClientBillingAddress').value = p.billing_address || '';
        document.getElementById('permanentBillingPattern').value = p.billing_pattern || 'Monthly';
        document.getElementById('permanentBillingRate').value = p.billing_rate || '';
        document.getElementById('permanentContactsList').innerHTML = '';
        (p.contacts || []).forEach(function (contact) { addPermanentContactRow(contact); });
        ensureMinimumContactRow();
      } else {
        var contractualRes = await apiCall('GET', '/api/clients/' + id);
        var c = contractualRes.data;
        resetModalState();
        window.clientEdit = id;
        document.getElementById('clientModalTitle').textContent = 'Edit Client';
        document.getElementById('contractType').value = 'Contractual';
        updateClientFormByType();
        document.getElementById('clientName').value = c.client_name || '';
        document.getElementById('clientAbbreviation').value = c.abbreviation || '';
        document.getElementById('contactPerson').value = c.contact_person || '';
        document.getElementById('clientEmail').value = c.email || '';
        var phoneParts = splitPhone(c.phone || '');
        document.getElementById('clientPhoneCountryCode').value = phoneParts.code;
        document.getElementById('clientPhone').value = phoneParts.number;
        document.getElementById('clientAddress').value = c.address || '';
        document.getElementById('clientIndustry').value = c.industry || '';
      }

      openModal('clientModal');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.deleteClient = async function (id, contractType, name) {
    var confirmed = await confirmAction('Delete Client', 'Are you sure you want to delete client "' + name + '"? This cannot be undone.');
    if (!confirmed) return;

    try {
      if (contractType === 'Permanent') {
        try {
          await apiCall('DELETE', '/api/permanent/clients/' + id);
        } catch (err) {
          if (err && err.message && err.message.indexOf('404') !== -1) {
            await apiCall('DELETE', '/api/clients/permanent/' + id);
          } else {
            throw err;
          }
        }
      } else {
        await apiCall('DELETE', '/api/clients/' + id);
      }
      showToast('Client deleted', 'success');
      loadClients();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  document.getElementById('contractType').addEventListener('change', updateClientFormByType);

  document.getElementById('clientForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var contractType = document.getElementById('contractType').value;

    try {
      if (contractType === 'Permanent') {
        var permanentPayload = {
          client_name: document.getElementById('permanentClientName').value.trim(),
          abbreviation: document.getElementById('permanentClientAbbreviation').value.trim(),
          address: document.getElementById('permanentClientAddress').value.trim(),
          billing_address: document.getElementById('permanentClientBillingAddress').value.trim(),
          billing_pattern: document.getElementById('permanentBillingPattern').value,
          billing_rate: parseFloat(document.getElementById('permanentBillingRate').value),
          contacts: readPermanentContacts(),
        };

        if (!permanentPayload.client_name) throw new Error('Permanent client name is required');
        if (!permanentPayload.abbreviation) throw new Error('Permanent client abbreviation is required');
        if (!permanentPayload.billing_rate || permanentPayload.billing_rate <= 0) throw new Error('Billing rate must be greater than 0');

        if (window.clientEdit) {
          try {
            await apiCall('PUT', '/api/permanent/clients/' + window.clientEdit, permanentPayload);
          } catch (err) {
            if (err && err.message && err.message.indexOf('404') !== -1) {
              await apiCall('PUT', '/api/clients/permanent/' + window.clientEdit, permanentPayload);
            } else {
              throw err;
            }
          }
          showToast('Permanent client updated', 'success');
        } else {
          try {
            await apiCall('POST', '/api/permanent/clients', permanentPayload);
          } catch (err) {
            if (err && err.message && err.message.indexOf('404') !== -1) {
              await apiCall('POST', '/api/clients/permanent', permanentPayload);
            } else {
              throw err;
            }
          }
          showToast('Permanent client created', 'success');
        }
      } else {
        var phoneCountryCode = document.getElementById('clientPhoneCountryCode').value;
        var phoneNumber = document.getElementById('clientPhone').value.trim();
        var phoneValidation = validatePhone(phoneCountryCode, phoneNumber);
        if (phoneValidation) throw new Error(phoneValidation);

        var contractualPayload = {
          client_name: document.getElementById('clientName').value.trim(),
          abbreviation: document.getElementById('clientAbbreviation').value.trim(),
          contact_person: document.getElementById('contactPerson').value.trim(),
          email: document.getElementById('clientEmail').value.trim(),
          phone: buildPhone(phoneCountryCode, phoneNumber),
          address: document.getElementById('clientAddress').value.trim(),
          industry: document.getElementById('clientIndustry').value.trim(),
        };

        if (window.clientEdit) {
          await apiCall('PUT', '/api/clients/' + window.clientEdit, contractualPayload);
          showToast('Client updated', 'success');
        } else {
          await apiCall('POST', '/api/clients', contractualPayload);
          showToast('Client created', 'success');
        }
      }

      closeClientModal();
      loadClients();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });

  initTableSearch('clientsSearch', 'clientsBody');
  resetModalState();
  loadClients();
})();
