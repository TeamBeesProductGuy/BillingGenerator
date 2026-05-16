(function () {
    "use strict";

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
        return '<div class="table-action-group justify-center">' +
            '<button class="btn-danger btn-sm inline-flex items-center gap-1" onclick="deleteAdminUser(\'' + jsString(user.id) + '\', \'' + jsString(user.email) + '\')">' +
            '<span class="material-symbols-outlined text-base">delete</span>Delete</button>' +
            '</div>';
    }

    async function loadUsers() {
        var tbody = document.getElementById("adminUsersBody");
        if (!tbody) return;
        showLoading(tbody);
        try {
            var res = await apiCall("GET", "/api/admin/users");
            var rows = res.data || [];
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-on-surface-variant py-8">No users found</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(function (user) {
                return '<tr>' +
                    '<td><div class="table-cell-box table-cell-stack"><span class="table-cell-primary">' + escapeHtml(user.name || user.email || '-') + '</span><span class="table-cell-secondary">' + escapeHtml(user.email || '') + '</span></div></td>' +
                    '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(user.created_at) + '</span></div></td>' +
                    '<td><div class="table-cell-box"><span class="table-date-chip">' + (user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never') + '</span></div></td>' +
                    '<td><div class="table-cell-box">' + userStatusBadge(user) + '</div></td>' +
                    '<td class="text-center"><div class="table-cell-box table-cell-center">' + renderUserActions(user) + '</div></td>' +
                    '</tr>';
            }).join("");
            initTableSort("adminUsersTable");
        } catch (err) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-error py-8">' + escapeHtml(err.message) + '</td></tr>';
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
        } catch (err) {
            showToast("Failed to " + verb + " request: " + err.message, "danger");
        }
    }

    function openUserModal() {
        var form = document.getElementById("adminUserForm");
        if (form) form.reset();
        var send = document.getElementById("adminSendCredentials");
        if (send) send.checked = true;
        openModal("adminUserModal");
    }

    function closeUserModal() {
        closeModal("adminUserModal");
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

    ["adminCloseUserModal", "adminCancelUserModal"].forEach(function (id) {
        var btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", closeUserModal);
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

    loadStats();
    loadUsers();
    loadApprovals();
})();
