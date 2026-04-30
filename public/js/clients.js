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

  function parseStructuredAddress(value) {
    var raw = String(value || '').trim();
    if (!raw) {
      return { line1: '', line2: '', city: '', state: '', pincode: '' };
    }

    var parts = raw.split(/\r?\n/).map(function (part) { return part.trim(); }).filter(Boolean);
    if (parts.length < 4) {
      parts = raw.split(',').map(function (part) { return part.trim(); }).filter(Boolean);
    }

    return {
      line1: parts[0] || '',
      line2: parts.length > 4 ? (parts[1] || '') : '',
      city: parts.length > 4 ? (parts[2] || '') : (parts[1] || ''),
      state: parts.length > 4 ? (parts[3] || '') : (parts[2] || ''),
      pincode: parts.length > 4 ? (parts[4] || '') : (parts[3] || ''),
    };
  }

  function setStructuredAddress(prefix, value) {
    var parsed = parseStructuredAddress(value);
    document.getElementById(prefix + 'Line1').value = parsed.line1;
    document.getElementById(prefix + 'Line2').value = parsed.line2;
    document.getElementById(prefix + 'City').value = parsed.city;
    document.getElementById(prefix + 'State').value = parsed.state;
    document.getElementById(prefix + 'Pincode').value = parsed.pincode;
  }

  function buildStructuredAddress(prefix, required) {
    var line1 = document.getElementById(prefix + 'Line1').value.trim();
    var line2 = document.getElementById(prefix + 'Line2').value.trim();
    var city = document.getElementById(prefix + 'City').value.trim();
    var state = document.getElementById(prefix + 'State').value.trim();
    var pincode = document.getElementById(prefix + 'Pincode').value.trim();

    if (required) {
      if (!city) throw new Error('City / District is required');
      if (!state) throw new Error('State is required');
    }

    return [line1, line2, city, state, pincode].filter(Boolean).join('\n');
  }

  function renderAddressCell(value) {
    var lines = String(value || '').split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
    if (lines.length === 0) return '';
    return lines.map(function (line) { return escapeHtml(line); }).join('<br>');
  }

  function setBillingAddressSameState(isSame) {
    var checkbox = document.getElementById('permanentBillingSameAsAddress');
    var fields = document.getElementById('permanentBillingAddressFields');
    if (checkbox) checkbox.checked = !!isSame;
    if (fields) fields.classList.toggle('hidden', !!isSame);
  }

  function addressesMatch(a, b) {
    return String(a || '').trim() === String(b || '').trim();
  }

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
        '<div><label class="block text-[11px] text-on-surface-variant mb-1">Phone</label><div class="client-phone-field-grid"><select class="contact-phone-code">' +
          '<option value="+91">+91</option><option value="+1">+1</option><option value="+44">+44</option><option value="+61">+61</option><option value="+65">+65</option><option value="+971">+971</option>' +
        '</select><input type="text" class="contact-phone client-phone-input" value="' + escapeHtml(parsed.number) + '"></div></div>' +
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
        leaves_allowed: item.leaves_allowed || 0,
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

  function updateClientSummary(rows) {
    var summary = document.getElementById('clientsSummary');
    if (!summary) return;
    var permanentCount = rows.filter(function (item) { return item.contract_type === 'Permanent'; }).length;
    var contractualCount = rows.filter(function (item) { return item.contract_type === 'Contractual'; }).length;
    var cards = summary.querySelectorAll('.client-summary-card');
    if (cards[0]) cards[0].querySelector('.client-summary-value').textContent = permanentCount;
    if (cards[1]) cards[1].querySelector('.client-summary-value').textContent = contractualCount;
  }

  function renderClientActions(client) {
    return '<div class="client-actions-wrap">' +
      '<button class="btn-secondary btn-sm inline-flex items-center" onclick="editClient(' + client.id + ', \'' + client.contract_type + '\')" title="Edit"><span class="material-symbols-outlined text-base">edit</span></button>' +
      '<button class="btn-danger btn-sm inline-flex items-center" onclick="deleteClient(' + client.id + ', \'' + client.contract_type + '\', \'' + escapeHtml(client.client_name).replace(/'/g, "\\'") + '\')" title="Delete"><span class="material-symbols-outlined text-base">delete</span></button>' +
    '</div>';
  }

  function renderClientCell(content, className) {
    return '<div class="client-cell-box ' + (className || '') + '">' + content + '</div>';
  }

  function renderPermanentRows(rows) {
    return rows.map(function (c) {
      return '<tr class="client-row">' +
        '<td>' + renderClientCell('<strong>' + escapeHtml(c.client_name) + '</strong>', 'client-cell-name') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.abbreviation || ''), 'client-cell-muted') + '</td>' +
        '<td>' + renderClientCell(renderAddressCell(c.address || ''), 'client-cell-address') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.contact_person || ''), 'client-cell-text') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.email || ''), 'client-cell-text') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.phone || ''), 'client-cell-text client-cell-phone') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.billing_pattern || '-'), 'client-cell-text') + '</td>' +
        '<td>' + renderClientCell(c.billing_rate ? Number(c.billing_rate).toFixed(2) : '-', 'client-cell-text client-cell-rate') + '</td>' +
        '<td class="text-center">' + renderClientCell(renderClientActions(c), 'client-cell-actions') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderContractualRows(rows) {
    return rows.map(function (c) {
      return '<tr class="client-row">' +
        '<td>' + renderClientCell('<strong>' + escapeHtml(c.client_name) + '</strong>', 'client-cell-name') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.abbreviation || ''), 'client-cell-muted') + '</td>' +
        '<td>' + renderClientCell(renderAddressCell(c.address || ''), 'client-cell-address') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.contact_person || ''), 'client-cell-text') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.email || ''), 'client-cell-text') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.phone || ''), 'client-cell-text client-cell-phone') + '</td>' +
        '<td>' + renderClientCell(escapeHtml(c.industry || '-'), 'client-cell-text') + '</td>' +
        '<td>' + renderClientCell(String(c.leaves_allowed || 0), 'client-cell-text client-cell-rate') + '</td>' +
        '<td class="text-center">' + renderClientCell(renderClientActions(c), 'client-cell-actions') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderSection(section) {
    var tableId = section.key + 'ClientsTable';
    var tbodyId = section.key + 'ClientsBody';
    var countLabel = section.rows.length === 1 ? '1 client' : section.rows.length + ' clients';
    return '<section class="stat-card !p-0 overflow-hidden client-section-card client-section-' + section.key + '" data-client-section="' + section.key + '">' +
      '<div class="client-section-header">' +
        '<div>' +
          '<h3 class="client-section-title">' + section.title + '</h3>' +
        '</div>' +
        '<div class="client-section-count">' + countLabel + '</div>' +
      '</div>' +
      (section.rows.length === 0
        ? '<div class="client-empty-state">No ' + section.title.toLowerCase() + ' found.</div>'
        : '<div class="overflow-x-auto styled-scrollbar client-table-scroll">' +
            '<table class="stitch-table" id="' + tableId + '">' +
              section.colgroup +
              section.table +
              '<tbody id="' + tbodyId + '">' + section.renderRows(section.rows) + '</tbody>' +
            '</table>' +
          '</div>') +
    '</section>';
  }

  function applyClientsSearch() {
    var input = document.getElementById('clientsSearch');
    var query = input ? input.value.toLowerCase().trim() : '';
    document.querySelectorAll('[data-client-section]').forEach(function (section) {
      var rows = section.querySelectorAll('tbody tr.client-row');
      var visibleCount = 0;
      rows.forEach(function (row) {
        var matches = row.textContent.toLowerCase().indexOf(query) !== -1;
        row.style.display = matches ? '' : 'none';
        if (matches) visibleCount += 1;
      });
      var empty = section.querySelector('.client-search-empty');
      if (rows.length > 0 && visibleCount === 0 && query) {
        if (!empty) {
          empty = document.createElement('div');
          empty.className = 'client-empty-state client-search-empty';
          section.appendChild(empty);
        }
        empty.textContent = 'No clients in this section match your search.';
      } else if (empty) {
        empty.remove();
      }
    });
  }

  function renderClients(rows) {
    var board = document.getElementById('clientsBoard');
    if (!board) return;
    updateClientSummary(rows || []);

    var permanentRows = (rows || []).filter(function (item) { return item.contract_type === 'Permanent'; });
    var contractualRows = (rows || []).filter(function (item) { return item.contract_type === 'Contractual'; });

    var sections = [
      {
        key: 'permanent',
        title: 'Permanent Clients',
        rows: permanentRows,
        renderRows: renderPermanentRows,
        colgroup: '<colgroup>' +
          '<col style="width:220px">' +
          '<col style="width:130px">' +
          '<col style="width:240px">' +
          '<col style="width:170px">' +
          '<col style="width:220px">' +
          '<col style="width:170px">' +
          '<col style="width:150px">' +
          '<col style="width:140px">' +
          '<col style="width:120px">' +
        '</colgroup>',
        table: '<thead><tr>' +
          '<th class="sortable" data-sort-key="0">Name</th>' +
          '<th class="sortable" data-sort-key="1">Abbreviation</th>' +
          '<th class="sortable" data-sort-key="2">Address</th>' +
          '<th class="sortable" data-sort-key="3">Contact Person</th>' +
          '<th class="sortable" data-sort-key="4">Email</th>' +
          '<th class="sortable" data-sort-key="5">Phone</th>' +
          '<th class="sortable" data-sort-key="6">Billing Pattern</th>' +
          '<th class="sortable" data-sort-key="7" data-sort-type="number">Billing Rate %</th>' +
          '<th class="text-center">Actions</th>' +
        '</tr></thead>',
      },
      {
        key: 'contractual',
        title: 'Contractual Clients',
        rows: contractualRows,
        renderRows: renderContractualRows,
        colgroup: '<colgroup>' +
          '<col style="width:220px">' +
          '<col style="width:140px">' +
          '<col style="width:240px">' +
          '<col style="width:170px">' +
          '<col style="width:220px">' +
          '<col style="width:180px">' +
          '<col style="width:150px">' +
          '<col style="width:130px">' +
          '<col style="width:120px">' +
        '</colgroup>',
        table: '<thead><tr>' +
          '<th class="sortable" data-sort-key="0">Name</th>' +
          '<th class="sortable" data-sort-key="1">Abbreviation</th>' +
          '<th class="sortable" data-sort-key="2">Address</th>' +
          '<th class="sortable" data-sort-key="3">Contact Person</th>' +
          '<th class="sortable" data-sort-key="4">Email</th>' +
          '<th class="sortable" data-sort-key="5">Phone</th>' +
          '<th class="sortable" data-sort-key="6">Industry</th>' +
          '<th class="sortable" data-sort-key="7" data-sort-type="number">Default Leaves</th>' +
          '<th class="text-center">Actions</th>' +
        '</tr></thead>',
      },
    ];

    board.innerHTML = sections.map(renderSection).join('');
    sections.forEach(function (section) {
      if (section.rows.length > 0) {
        initTableSort(section.key + 'ClientsTable');
      }
    });
    applyClientsSearch();
  }

  async function loadClients() {
    var board = document.getElementById('clientsBoard');
    if (board) {
      board.innerHTML = '<div class="stat-card !p-0 overflow-hidden"><div class="p-6"><div class="loading-spinner"></div></div></div>';
    }
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
      if (board) {
        board.innerHTML = '<div class="stat-card !p-0 overflow-hidden"><div class="client-empty-state">Failed to load clients.</div></div>';
      }
    }
  }

  function resetModalState() {
    document.getElementById('clientForm').reset();
    document.getElementById('clientId').value = '';
    document.getElementById('clientModalTitle').textContent = 'Add Client';
    document.getElementById('contractType').value = 'Contractual';
    clearPermanentContacts();
    setBillingAddressSameState(true);
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
        setStructuredAddress('permanentClientAddress', p.address || '');
        setStructuredAddress('permanentClientBillingAddress', p.billing_address || '');
        setBillingAddressSameState(addressesMatch(p.address, p.billing_address));
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
        setStructuredAddress('clientAddress', c.address || '');
        document.getElementById('clientIndustry').value = c.industry || '';
        document.getElementById('clientLeavesAllowed').value = c.leaves_allowed || 0;
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
  document.getElementById('permanentBillingSameAsAddress').addEventListener('change', function () {
    setBillingAddressSameState(this.checked);
  });

  document.getElementById('clientForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var contractType = document.getElementById('contractType').value;

    try {
      if (contractType === 'Permanent') {
        var permanentPayload = {
          client_name: document.getElementById('permanentClientName').value.trim(),
          abbreviation: document.getElementById('permanentClientAbbreviation').value.trim(),
          address: buildStructuredAddress('permanentClientAddress', true),
          billing_address: document.getElementById('permanentBillingSameAsAddress').checked
            ? buildStructuredAddress('permanentClientAddress', true)
            : buildStructuredAddress('permanentClientBillingAddress', true),
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
          address: buildStructuredAddress('clientAddress', true),
          industry: document.getElementById('clientIndustry').value.trim(),
          leaves_allowed: parseInt(document.getElementById('clientLeavesAllowed').value, 10) || 0,
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

  document.getElementById('clientsSearch').addEventListener('input', applyClientsSearch);
  resetModalState();
  loadClients();
})();
