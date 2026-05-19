(function () {
    "use strict";

    var MODULES = [
        { key: "clients", label: "Clients" },
        { key: "sows", label: "SOW" },
        { key: "quotes", label: "Quotes" },
        { key: "purchase_orders", label: "PO" },
        { key: "rate_cards", label: "Rate Card" },
        { key: "attendance", label: "Attendance" },
        { key: "billing", label: "Service Request" },
        { key: "orders", label: "Orders" },
        { key: "reminders", label: "Reminders" },
    ];
    var CONTRACTUAL_MODULE_KEYS = ["clients", "quotes", "sows", "purchase_orders", "rate_cards", "attendance", "billing"];
    var PERMANENT_MODULE_KEYS = ["clients", "orders", "reminders"];
    var ADMIN_EMAILS = ["jatinder@teambeescorp.com", "jatinder@teambeescrop.com"];
    var adminUsersById = {};
    var adminClients = [];
    var permissionState = {
        create: { searchText: "", draftByKey: {} },
        edit: { searchText: "", draftByKey: {} },
    };

    function statusBadge(status) {
        var value = status || "Pending";
        var map = {
            Pending: "badge-warning",
            Approved: "badge-success",
            Rejected: "badge-error",
        };
        return '<span class="' + (map[value] || "badge-processing") + '">' + escapeHtml(value) + '</span>';
    }

    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value == null ? "--" : value;
    }

    function jsString(value) {
        return escapeHtml(String(value || "")).replace(/'/g, "\\'");
    }

    function userStatusBadge(user) {
        return user.email_confirmed_at
            ? '<span class="badge-success">Confirmed</span>'
            : '<span class="badge-warning">Unconfirmed</span>';
    }

    function passwordStatusBadge(user) {
        return user.password_changed_once
            ? '<span class="badge-success">Changed</span>'
            : '<span class="badge-warning" title="First password change has not been completed">Pending</span>';
    }

    function isAdminAccount(user) {
        return ADMIN_EMAILS.indexOf(String(user && user.email || "").trim().toLowerCase()) !== -1;
    }

    function renderPermissionsSummary(permissions) {
        var allowed = MODULES.filter(function (module) {
            return permissions && permissions[module.key] === true;
        });
        if (allowed.length === MODULES.length) {
            return '<div class="admin-permission-chip-list"><span class="admin-permission-chip"><span class="material-symbols-outlined text-sm">done_all</span>All Modules</span></div>';
        }
        if (allowed.length === 0) {
            return '<div class="admin-permission-chip-list"><span class="admin-permission-chip admin-permission-chip-muted">No module access</span></div>';
        }
        return '<div class="admin-permission-chip-list">' + allowed.map(function (module) {
            return '<span class="admin-permission-chip">' + escapeHtml(module.label) + '</span>';
        }).join("") + '</div>';
    }

    function clientKey(clientType, clientId) {
        return String(clientType || "contractual") + ":" + String(clientId || "");
    }

    function clientByKey(key) {
        return adminClients.find(function (client) {
            return clientKey(client.client_type, client.id) === key;
        }) || null;
    }

    function clientLabelByKey(key) {
        var client = clientByKey(key);
        if (client) return client.label || client.client_name || key;
        var parsed = parseClientValue(key);
        return (parsed.client_type === "permanent" ? "Permanent" : "Contractual") + " Client #" + parsed.client_id;
    }

    function parseClientValue(value) {
        var parts = String(value || "").split(":");
        return {
            client_type: parts[0] || "contractual",
            client_id: parts[1] || "",
        };
    }

    function allowedModuleLabels(permissions) {
        return MODULES.filter(function (module) {
            return permissions && permissions[module.key] === true;
        }).map(function (module) { return module.label; });
    }

    function modulesForClientType(clientType) {
        var keys = String(clientType || "contractual") === "permanent"
            ? PERMANENT_MODULE_KEYS
            : CONTRACTUAL_MODULE_KEYS;
        return keys.map(function (key) {
            return MODULES.find(function (module) { return module.key === key; });
        }).filter(Boolean);
    }

    function renderClientPermissionsSummary(user) {
        var clientPermissions = user.client_permissions || {};
        var keys = Object.keys(clientPermissions).filter(function (key) {
            return allowedModuleLabels(clientPermissions[key].permissions).length > 0;
        }).sort(function (a, b) {
            return clientLabelByKey(a).localeCompare(clientLabelByKey(b));
        });
        if (keys.length === 0) return renderPermissionsSummary(user.permissions || {});
        return '<div class="admin-permission-chip-list">' + keys.map(function (key) {
            var labels = allowedModuleLabels(clientPermissions[key].permissions);
            return '<span class="admin-permission-chip" title="' + escapeHtml(labels.join(", ")) + '">' +
                '<span class="material-symbols-outlined text-sm">business</span>' +
                escapeHtml(clientLabelByKey(key)) +
                '<small>' + labels.length + '</small>' +
                '</span>';
        }).join("") + '</div>';
    }

    function emptyPermissions() {
        var result = {};
        MODULES.forEach(function (module) { result[module.key] = false; });
        return result;
    }

    function clonePermissions(permissions) {
        var result = emptyPermissions();
        MODULES.forEach(function (module) {
            result[module.key] = permissions && permissions[module.key] === true;
        });
        return result;
    }

    async function loadStats() {
        try {
            var res = await apiCall("GET", "/api/admin/stats");
            var counts = (res.data && res.data.counts) || {};
            setText("adminTotalClients", counts.clients || 0);
            setText("adminTotalEmployees", counts.employees || 0);
            setText("adminTotalUsers", counts.users || 0);
        } catch (err) {
            showToast("Failed to load admin stats: " + err.message, "danger");
        }
    }

    async function loadAdminClients() {
        try {
            var res = await apiCall("GET", "/api/admin/clients");
            adminClients = res.data || [];
            renderAdminClientOptions();
        } catch (err) {
            adminClients = [];
            showToast("Failed to load clients for permissions: " + err.message, "danger");
        }
    }

    function renderAdminClientOptions() {
        renderPermissionMatrix("create");
        renderPermissionMatrix("edit");
    }

    function scrollToUsersTable() {
        var table = document.getElementById("adminUsersTable");
        if (!table) return;
        var section = table.closest("section") || table;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
        section.classList.add("admin-users-section-highlight");
        window.setTimeout(function () {
            section.classList.remove("admin-users-section-highlight");
        }, 1400);
    }

    function renderActions(row) {
        if (row.status !== "Pending") {
            return '<span class="text-xs text-on-surface-variant">No action</span>';
        }
        return '<div class="table-action-group justify-center">' +
            '<button class="btn-secondary btn-sm inline-flex items-center gap-1" onclick="approveAdminRequest(\'' + escapeHtml(row.id).replace(/'/g, "\\'") + '\')">' +
            '<span class="material-symbols-outlined text-base">check</span>Approve</button>' +
            '<button class="btn-danger btn-sm inline-flex items-center gap-1" onclick="rejectAdminRequest(\'' + escapeHtml(row.id).replace(/'/g, "\\'") + '\')">' +
            '<span class="material-symbols-outlined text-base">close</span>Reject</button>' +
            '</div>';
    }

    function renderUserActions(user) {
        var editButton = '<button class="btn-secondary btn-sm inline-flex items-center gap-1" onclick="openAdminEditUser(\'' + jsString(user.id) + '\')">' +
            '<span class="material-symbols-outlined text-base">edit</span>Edit</button>';
        if (isAdminAccount(user)) {
            return '<div class="table-action-group justify-center">' + editButton + '</div>';
        }
        return '<div class="table-action-group justify-center">' + editButton +
            '<button class="btn-danger btn-sm inline-flex items-center gap-1" onclick="deleteAdminUser(\'' + jsString(user.id) + '\', \'' + jsString(user.email) + '\')">' +
            '<span class="material-symbols-outlined text-base">delete</span>Delete</button></div>';
    }

    async function loadUsers() {
        var tbody = document.getElementById("adminUsersBody");
        if (!tbody) return;
        showLoading(tbody);
        try {
            var res = await apiCall("GET", "/api/admin/users");
            var rows = res.data || [];
            adminUsersById = {};
            rows.forEach(function (user) {
                adminUsersById[user.id] = user;
            });
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-on-surface-variant py-8">No users found</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(function (user) {
                return '<tr>' +
                    '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(user.name || user.email || '-') + '</span><span class="table-cell-secondary">' + escapeHtml(user.email || '') + '</span></div></td>' +
                    '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(user.created_at) + '</span></div></td>' +
                    '<td><div class="table-cell-box"><span class="table-date-chip">' + (user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never') + '</span></div></td>' +
                    '<td><div class="table-cell-box">' + userStatusBadge(user) + '</div></td>' +
                    '<td><div class="table-cell-box table-cell-center admin-password-cell">' + passwordStatusBadge(user) + '</div></td>' +
                    '<td><div class="table-cell-box">' + renderClientPermissionsSummary(user) + '</div></td>' +
                    '<td class="text-center"><div class="table-cell-box table-cell-center">' + renderUserActions(user) + '</div></td>' +
                    '</tr>';
            }).join("");
            initTableSort("adminUsersTable");
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-error py-8">' + escapeHtml(err.message) + '</td></tr>';
        }
    }

    async function loadApprovals() {
        var tbody = document.getElementById("adminApprovalsBody");
        if (!tbody) return;
        showLoading(tbody);
        try {
            var res = await apiCall("GET", "/api/admin/approvals");
            var rows = res.data || [];
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-on-surface-variant py-8">No approval requests found</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(function (row) {
                return '<tr>' +
                    '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(row.requester_name || row.requester_email || '-') + '</span><span class="table-cell-secondary">' + escapeHtml(row.requester_email || '') + '</span></div></td>' +
                    '<td><div class="table-cell-box table-cell-text min-w-[180px]">' + escapeHtml(row.role_description || '-') + '</div></td>' +
                    '<td><div class="table-cell-box"><span class="entity-pill">' + escapeHtml(row.client_name || '-') + '</span></div></td>' +
                    '<td><div class="table-cell-box table-cell-text min-w-[280px]">' + escapeHtml(row.permission_message || '-') + '</div></td>' +
                    '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(row.created_at) + ' ' + new Date(row.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + '</span></div></td>' +
                    '<td><div class="table-cell-box">' + statusBadge(row.status) + '</div></td>' +
                    '<td class="text-center"><div class="table-cell-box table-cell-center">' + renderActions(row) + '</div></td>' +
                    '</tr>';
            }).join("");
            initTableSort("adminApprovalsTable");
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-error py-8">' + escapeHtml(err.message) + '</td></tr>';
        }
    }

    async function decide(id, action) {
        var verb = action === "approve" ? "approve" : "reject";
        var confirmed = await confirmAction("Confirm Action", "Are you sure you want to " + verb + " this request?");
        if (!confirmed) return;
        try {
            await apiCall("POST", "/api/admin/approvals/" + id + "/" + action);
            showToast("Approval request " + (action === "approve" ? "approved" : "rejected"), "success");
            loadStats();
            loadApprovals();
            loadUsers();
            if (typeof refreshAdminApprovalBadge === "function") refreshAdminApprovalBadge();
        } catch (err) {
            showToast("Failed to " + verb + " request: " + err.message, "danger");
        }
    }

    function openUserModal() {
        var form = document.getElementById("adminUserForm");
        if (form) form.reset();
        var send = document.getElementById("adminSendCredentials");
        if (send) send.checked = true;
        var search = document.getElementById("adminCreatePermissionSearch");
        if (search) search.value = "";
        initializePermissionDraft("create", null);
        renderPermissionMatrix("create");
        openModal("adminUserModal");
    }

    function closeUserModal() {
        closeModal("adminUserModal");
    }

    function closeEditUserModal() {
        closeModal("adminEditUserModal");
    }

    window.approveAdminRequest = function (id) {
        decide(id, "approve");
    };

    window.rejectAdminRequest = function (id) {
        decide(id, "reject");
    };

    window.deleteAdminUser = async function (id, email) {
        var confirmed = await confirmAction("Confirm Action", "Are you sure you want to delete user " + email + "?");
        if (!confirmed) return;
        try {
            await apiCall("DELETE", "/api/admin/users/" + encodeURIComponent(id));
            showToast("User deleted", "success");
            loadStats();
            loadUsers();
        } catch (err) {
            showToast("Failed to delete user: " + err.message, "danger");
        }
    };

    window.openAdminEditUser = function (id) {
        var user = adminUsersById[id];
        if (!user) {
            showToast("User not found in current table", "danger");
            return;
        }
        document.getElementById("adminEditUserId").value = user.id;
        document.getElementById("adminEditUserName").value = user.name || "";
        document.getElementById("adminEditUserEmail").value = user.email || "";
        document.getElementById("adminEditUserPassword").value = "";
        var search = document.getElementById("adminPermissionSearch");
        if (search) {
            search.value = "";
            permissionState.edit.searchText = "";
        }
        initializePermissionDraft("edit", user);
        renderPermissionMatrix("edit");
        openModal("adminEditUserModal");
    };

    var trackerBtn = document.getElementById("adminDownloadTracker");
    if (trackerBtn) {
        trackerBtn.addEventListener("click", function () {
            downloadFile("/api/dashboard/tracker/export", "Order_Tracker.xlsx");
        });
    }

    var refreshBtn = document.getElementById("adminRefreshApprovals");
    if (refreshBtn) refreshBtn.addEventListener("click", loadApprovals);

    var openUserBtn = document.getElementById("adminOpenUserModal");
    if (openUserBtn) openUserBtn.addEventListener("click", openUserModal);

    var totalUsersCard = document.getElementById("adminTotalUsersCard");
    if (totalUsersCard) {
        totalUsersCard.addEventListener("click", scrollToUsersTable);
        totalUsersCard.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scrollToUsersTable();
            }
        });
    }

    ["adminCloseUserModal", "adminCancelUserModal"].forEach(function (id) {
        var btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", closeUserModal);
    });

    ["adminCloseEditUserModal", "adminCancelEditUserModal"].forEach(function (id) {
        var btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", closeEditUserModal);
    });

    var userForm = document.getElementById("adminUserForm");
    if (userForm) {
        userForm.addEventListener("submit", async function (e) {
            e.preventDefault();
            var sendCredentials = document.getElementById("adminSendCredentials").checked;
            var payload = {
                name: document.getElementById("adminUserName").value.trim(),
                email: document.getElementById("adminUserEmail").value.trim(),
                password: document.getElementById("adminUserPassword").value.trim(),
                sendCredentials: sendCredentials,
                client_permissions: collectPermissionMatrix("create"),
            };
            try {
                var res = await apiCall("POST", "/api/admin/users", payload);
                closeUserModal();
                loadStats();
                loadUsers();
                if (res.data && res.data.temporaryPassword) {
                    if (res.data.mailStatus === "failed") {
                        showToast("User created, but email failed. Temporary password: " + res.data.temporaryPassword, "warning");
                    } else {
                        showToast("User created. Temporary password: " + res.data.temporaryPassword, "success");
                    }
                } else {
                    showToast(sendCredentials ? "User created and credentials emailed" : "User created", "success");
                }
            } catch (err) {
                showToast("Failed to create user: " + err.message, "danger");
            }
        });
    }

    var editUserForm = document.getElementById("adminEditUserForm");
    if (editUserForm) {
        editUserForm.addEventListener("submit", async function (e) {
            e.preventDefault();
        });
    }

    function getEditingUserId() {
        return document.getElementById("adminEditUserId").value;
    }

    async function saveUserName() {
        var id = getEditingUserId();
        var name = document.getElementById("adminEditUserName").value.trim();
        if (!name) {
            showToast("Name is required", "danger");
            return;
        }
        try {
            await apiCall("PUT", "/api/admin/users/" + encodeURIComponent(id), { name: name });
            await loadUsers();
            showToast("Name updated", "success");
        } catch (err) {
            showToast("Failed to update name: " + err.message, "danger");
        }
    }

    async function saveUserEmail() {
        var id = getEditingUserId();
        var email = document.getElementById("adminEditUserEmail").value.trim();
        if (!email) {
            showToast("Email is required", "danger");
            return;
        }
        try {
            await apiCall("PUT", "/api/admin/users/" + encodeURIComponent(id), { email: email });
            await loadUsers();
            showToast("Email updated", "success");
        } catch (err) {
            showToast("Failed to update email: " + err.message, "danger");
        }
    }

    async function saveUserPassword() {
        var id = getEditingUserId();
        var passwordInput = document.getElementById("adminEditUserPassword");
        var password = passwordInput.value.trim();
        if (!password) {
            showToast("Enter a new password first", "danger");
            return;
        }
        try {
            await apiCall("PUT", "/api/admin/users/" + encodeURIComponent(id), { password: password });
            passwordInput.value = "";
            await loadUsers();
            showToast("Password updated", "success");
        } catch (err) {
            showToast("Failed to update password: " + err.message, "danger");
        }
    }

    async function saveUserPermissions() {
        var id = getEditingUserId();
        var clientPermissions = collectPermissionMatrix("edit");
        try {
            await apiCall("PUT", "/api/admin/users/" + encodeURIComponent(id) + "/permissions", {
                client_permissions: clientPermissions,
            });
            await loadUsers();
            var user = adminUsersById[id];
            initializePermissionDraft("edit", user);
            renderPermissionMatrix("edit");
            showToast("Permissions updated", "success");
        } catch (err) {
            showToast("Failed to update permissions: " + err.message, "danger");
        }
    }

    function currentPermissionEntries() {
        var id = getEditingUserId();
        var user = adminUsersById[id] || {};
        return user.client_permissions || {};
    }

    function permissionConfig(mode) {
        var isCreate = mode === "create";
        return {
            mode: isCreate ? "create" : "edit",
            state: permissionState[isCreate ? "create" : "edit"],
            matrixId: isCreate ? "adminCreatePermissionMatrix" : "adminPermissionMatrix",
            countId: isCreate ? "adminCreateAssignedClientCount" : "adminAssignedClientCount",
        };
    }

    function initializePermissionDraft(mode, user) {
        var config = permissionConfig(mode);
        var entries = (user && user.client_permissions) || {};
        config.state.draftByKey = {};
        adminClients.forEach(function (client) {
            var key = clientKey(client.client_type, client.id);
            config.state.draftByKey[key] = clonePermissions(entries[key] ? entries[key].permissions : {});
        });
        Object.keys(entries).forEach(function (key) {
            if (!config.state.draftByKey[key]) {
                config.state.draftByKey[key] = clonePermissions(entries[key].permissions);
            }
        });
    }

    function syncPermissionDraftFromDom(mode) {
        var config = permissionConfig(mode);
        document.querySelectorAll("#" + config.matrixId + " [data-client-permission-row]").forEach(function (row) {
            var key = row.getAttribute("data-client-key");
            if (!key) return;
            var permissions = config.state.draftByKey[key] || emptyPermissions();
            row.querySelectorAll("[data-module-key]").forEach(function (input) {
                permissions[input.getAttribute("data-module-key")] = input.checked === true;
            });
            config.state.draftByKey[key] = permissions;
        });
    }

    function assignedClientKeys(mode, options) {
        if (!options || options.sync !== false) syncPermissionDraftFromDom(mode);
        var entries = permissionConfig(mode).state.draftByKey;
        return Object.keys(entries).filter(function (key) {
            return allowedModuleLabels(entries[key]).length > 0;
        });
    }

    function updateAssignedClientCount(mode, options) {
        var config = permissionConfig(mode);
        var count = document.getElementById(config.countId);
        if (!count) return;
        var keys = assignedClientKeys(mode, options);
        if (count) count.textContent = keys.length === 1 ? "1 client" : keys.length + " clients";
    }

    function renderPermissionTable(config, clientType, title, subtitle, moduleKeys, clients) {
        var modules = moduleKeys.map(function (key) {
            return MODULES.find(function (module) { return module.key === key; });
        }).filter(Boolean);
        if (clients.length === 0) {
            return '<div class="admin-permission-group">' +
                '<div class="admin-permission-group-header"><div><h5>' + escapeHtml(title) + '</h5><p>' + escapeHtml(subtitle) + '</p></div><span>0 clients</span></div>' +
                '<div class="admin-permission-empty">No ' + escapeHtml(title.toLowerCase()) + ' match this search.</div>' +
                '</div>';
        }
        return '<div class="admin-permission-group admin-permission-group-' + escapeHtml(clientType) + '">' +
            '<div class="admin-permission-group-header"><div><h5>' + escapeHtml(title) + '</h5><p>' + escapeHtml(subtitle) + '</p></div><span>' + clients.length + (clients.length === 1 ? ' client' : ' clients') + '</span></div>' +
            '<div class="admin-permission-matrix-scroll">' +
            '<table class="admin-permission-table">' +
            '<thead><tr><th>Client</th>' +
            modules.map(function (module) { return '<th>' + escapeHtml(module.label) + '</th>'; }).join("") +
            '<th>Quick</th></tr></thead>' +
            '<tbody>' + clients.map(function (client) {
                var key = clientKey(client.client_type, client.id);
                var permissions = config.state.draftByKey[key] || emptyPermissions();
                var checkedCount = allowedModuleLabels(permissions).length;
                return '<tr data-client-permission-row data-client-key="' + escapeHtml(key) + '" data-client-type="' + escapeHtml(client.client_type || "contractual") + '" data-client-id="' + escapeHtml(client.id) + '">' +
                    '<td><div class="admin-permission-client-name">' +
                    '<strong>' + escapeHtml(client.label || client.client_name || key) + '</strong>' +
                    '<span>' + escapeHtml(checkedCount + " modules") + '</span>' +
                    '</div></td>' +
                    modules.map(function (module) {
                        var inputId = config.mode + "_perm_" + key.replace(/[^a-zA-Z0-9]/g, "_") + "_" + module.key;
                        var checked = permissions[module.key] === true ? " checked" : "";
                        return '<td><label class="admin-permission-cell" for="' + escapeHtml(inputId) + '">' +
                            '<input id="' + escapeHtml(inputId) + '" type="checkbox" data-module-key="' + escapeHtml(module.key) + '"' + checked + '>' +
                            '<span class="sr-only">' + escapeHtml(module.label) + '</span>' +
                            '</label></td>';
                    }).join("") +
                    '<td><div class="admin-permission-row-actions">' +
                    '<button type="button" data-permission-row-all>All</button>' +
                    '<button type="button" data-permission-row-clear>Clear</button>' +
                    '</div></td>' +
                    '</tr>';
            }).join("") + '</tbody></table></div></div>';
    }

    function renderPermissionMatrix(mode) {
        var config = permissionConfig(mode);
        var holder = document.getElementById(config.matrixId);
        if (!holder) return;
        var search = String(config.state.searchText || "").trim().toLowerCase();
        var clients = adminClients.filter(function (client) {
            var label = String(client.label || client.client_name || "").toLowerCase();
            return !search || label.indexOf(search) !== -1 || String(client.abbreviation || "").toLowerCase().indexOf(search) !== -1;
        });
        updateAssignedClientCount(mode, { sync: false });

        if (adminClients.length === 0) {
            holder.innerHTML = '<div class="admin-permission-empty">No active clients found.</div>';
            return;
        }

        if (clients.length === 0) {
            holder.innerHTML = '<div class="admin-permission-empty">No clients match this search.</div>';
            return;
        }

        var contractualClients = clients.filter(function (client) { return client.client_type !== "permanent"; });
        var permanentClients = clients.filter(function (client) { return client.client_type === "permanent"; });
        holder.innerHTML =
            renderPermissionTable(config, "contractual", "Contractual Clients", "Clients, Quotes, SOW, PO, Rate Card, Attendance, Service Request", CONTRACTUAL_MODULE_KEYS, contractualClients) +
            renderPermissionTable(config, "permanent", "Permanent Clients", "Clients, Orders, Reminders", PERMANENT_MODULE_KEYS, permanentClients);

        holder.querySelectorAll("[data-permission-row-all]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var row = this.closest("[data-client-permission-row]");
                if (!row) return;
                row.querySelectorAll("[data-module-key]").forEach(function (input) { input.checked = true; });
                syncPermissionDraftFromDom(mode);
                updateAssignedClientCount(mode);
            });
        });
        holder.querySelectorAll("[data-permission-row-clear]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var row = this.closest("[data-client-permission-row]");
                if (!row) return;
                row.querySelectorAll("[data-module-key]").forEach(function (input) { input.checked = false; });
                syncPermissionDraftFromDom(mode);
                updateAssignedClientCount(mode);
            });
        });
        holder.querySelectorAll("[data-module-key]").forEach(function (input) {
            input.addEventListener("change", function () {
                syncPermissionDraftFromDom(mode);
                updateAssignedClientCount(mode);
            });
        });
    }

    function collectPermissionMatrix(mode) {
        var config = permissionConfig(mode);
        syncPermissionDraftFromDom(mode);
        return adminClients.map(function (client) {
            var key = clientKey(client.client_type, client.id);
            var allowedKeys = modulesForClientType(client.client_type).map(function (module) { return module.key; });
            var permissions = emptyPermissions();
            allowedKeys.forEach(function (moduleKey) {
                permissions[moduleKey] = config.state.draftByKey[key] && config.state.draftByKey[key][moduleKey] === true;
            });
            return {
                client_type: client.client_type || "contractual",
                client_id: client.id,
                permissions: permissions,
            };
        });
    }

    function clearVisiblePermissions(mode) {
        var config = permissionConfig(mode);
        adminClients.forEach(function (client) {
            config.state.draftByKey[clientKey(client.client_type, client.id)] = emptyPermissions();
        });
        renderPermissionMatrix(mode);
    }

    [
        ["adminSaveName", saveUserName],
        ["adminSaveEmail", saveUserEmail],
        ["adminSavePassword", saveUserPassword],
        ["adminSavePermissions", saveUserPermissions],
    ].forEach(function (pair) {
        var btn = document.getElementById(pair[0]);
        if (btn) btn.addEventListener("click", pair[1]);
    });

    var editClear = document.getElementById("adminClearPermissions");
    if (editClear) editClear.addEventListener("click", function () { clearVisiblePermissions("edit"); });

    var createClear = document.getElementById("adminCreateClearPermissions");
    if (createClear) createClear.addEventListener("click", function () { clearVisiblePermissions("create"); });

    var permissionSearch = document.getElementById("adminPermissionSearch");
    if (permissionSearch) permissionSearch.addEventListener("input", function () {
        permissionState.edit.searchText = this.value || "";
        renderPermissionMatrix("edit");
    });

    var createPermissionSearch = document.getElementById("adminCreatePermissionSearch");
    if (createPermissionSearch) createPermissionSearch.addEventListener("input", function () {
        permissionState.create.searchText = this.value || "";
        renderPermissionMatrix("create");
    });
    loadStats();
    loadAdminClients().then(loadUsers);
    loadApprovals();
})();
