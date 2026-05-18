(function () {
  "use strict";

  var currentProfile = null;

  function statusBadge(status) {
    var value = status || "Pending";
    var map = { Pending: "badge-warning", Approved: "badge-success", Rejected: "badge-error" };
    return '<span class="' + (map[value] || "badge-processing") + '">' + escapeHtml(value) + '</span>';
  }

  async function loadProfile() {
    try {
      var res = await apiCall("GET", "/api/profile/me");
      currentProfile = res.data || {};
      document.getElementById("settingsName").value = currentProfile.name || "";
      document.getElementById("settingsEmail").value = currentProfile.email || "";
      var isAdmin = Boolean(currentProfile.is_admin || (typeof getCurrentUserIsAdmin === "function" && getCurrentUserIsAdmin()));
      var profileNotice = document.getElementById("settingsProfileNotice");
      var emailNotice = document.getElementById("settingsEmailNotice");
      var nameButtonLabel = document.getElementById("settingsNameButtonLabel");
      var emailButtonLabel = document.getElementById("settingsEmailButtonLabel");
      if (profileNotice) {
        profileNotice.textContent = isAdmin
          ? "Admin user name changes are applied immediately."
          : "User name changes are sent for admin approval.";
      }
      if (emailNotice) {
        emailNotice.textContent = isAdmin
          ? "Admin email changes are applied immediately."
          : "Email changes are sent for admin approval.";
      }
      if (nameButtonLabel) nameButtonLabel.textContent = isAdmin ? "Update Name" : "Request Name Update";
      if (emailButtonLabel) emailButtonLabel.textContent = isAdmin ? "Update Email" : "Request Email Update";
      var pendingSection = document.getElementById("settingsPendingRequestsSection");
      if (pendingSection) pendingSection.classList.toggle("hidden", isAdmin);
      document.getElementById("settingsPasswordNotice").textContent = isAdmin
        ? "Admin password changes are applied immediately."
        : (currentProfile.password_change_requires_approval
          ? "Password changes now require admin approval."
          : "This is your first password change, so it will be applied immediately.");
    } catch (err) {
      showToast("Failed to load settings: " + err.message, "danger");
    }
  }

  async function loadApprovals() {
    var tbody = document.getElementById("settingsApprovalsBody");
    if (!tbody) return;
    if (currentProfile && currentProfile.is_admin) return;
    showLoading(tbody);
    try {
      var res = await apiCall("GET", "/api/admin/approvals/mine?status=Pending");
      var rows = (res.data || []).filter(function (row) { return row.module === "profile"; });
      if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-on-surface-variant py-8">No pending profile requests</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(function (row) {
        return '<tr>' +
          '<td><div class="table-cell-box"><span class="entity-pill">' + escapeHtml(row.action_label || "-") + '</span></div></td>' +
          '<td><div class="table-cell-box table-cell-text min-w-[280px]">' + escapeHtml(row.permission_message || "-") + '</div></td>' +
          '<td><div class="table-cell-box"><span class="table-date-chip">' + formatDate(row.created_at) + '</span></div></td>' +
          '<td><div class="table-cell-box">' + statusBadge(row.status) + '</div></td>' +
          '</tr>';
      }).join("");
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-error py-8">' + escapeHtml(err.message) + '</td></tr>';
    }
  }

  function resetPasswordForm() {
    document.getElementById("settingsPassword").value = "";
    document.getElementById("settingsConfirmPassword").value = "";
  }

  var nameForm = document.getElementById("settingsNameForm");
  if (nameForm) {
    nameForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var name = document.getElementById("settingsName").value.trim();
      if (!name) {
        showToast("User name is required", "danger");
        return;
      }
      if (currentProfile && name === (currentProfile.name || "")) {
        showToast("No user name change to submit", "info");
        return;
      }
      try {
        var res = await apiCall("PATCH", "/api/profile/me", { name: name });
        if (handleApprovalResponse(res, loadApprovals)) return;
        showToast("User name updated", "success");
        await loadProfile();
      } catch (err) {
        showToast("Failed to submit user name update: " + err.message, "danger");
      }
    });
  }

  var emailForm = document.getElementById("settingsEmailForm");
  if (emailForm) {
    emailForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var email = document.getElementById("settingsEmail").value.trim();
      if (!email) {
        showToast("Email is required", "danger");
        return;
      }
      if (currentProfile && email.toLowerCase() === String(currentProfile.email || "").toLowerCase()) {
        showToast("No email change to submit", "info");
        return;
      }
      try {
        var res = await apiCall("PATCH", "/api/profile/me", { email: email });
        if (handleApprovalResponse(res, loadApprovals)) return;
        showToast("Email updated", "success");
        await loadProfile();
      } catch (err) {
        showToast("Failed to submit email update: " + err.message, "danger");
      }
    });
  }

  var passwordForm = document.getElementById("settingsPasswordForm");
  if (passwordForm) {
    passwordForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var password = document.getElementById("settingsPassword").value;
      var confirm = document.getElementById("settingsConfirmPassword").value;
      if (password.length < 8) {
        showToast("Password must be at least 8 characters", "danger");
        return;
      }
      if (password !== confirm) {
        showToast("Password confirmation does not match", "danger");
        return;
      }
      try {
        var res = await apiCall("POST", "/api/profile/password", { password: password });
        resetPasswordForm();
        if (handleApprovalResponse(res, loadApprovals)) return;
        showToast("Password updated", "success");
        await loadProfile();
      } catch (err) {
        showToast("Failed to change password: " + err.message, "danger");
      }
    });
  }

  var refreshBtn = document.getElementById("settingsRefreshApprovals");
  if (refreshBtn) refreshBtn.addEventListener("click", loadApprovals);

  loadProfile().then(loadApprovals);
})();
