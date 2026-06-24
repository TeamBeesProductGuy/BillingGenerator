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
      var isAdmin = Boolean(currentProfile.is_admin || (typeof getCurrentUserIsAdmin === "function" && getCurrentUserIsAdmin()));
      var displayName = document.getElementById("settingsDisplayName");
      var displayEmail = document.getElementById("settingsDisplayEmail");
      if (displayName) displayName.textContent = currentProfile.name || "-";
      if (displayEmail) displayEmail.textContent = currentProfile.email || "-";
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

  // ---- Appearance / theme toggle ----
  (function initThemeToggle() {
    var wrap = document.getElementById("themeToggle");
    if (!wrap) return;
    var opts = wrap.querySelectorAll(".theme-opt");
    function currentTheme() {
      try {
        var saved = localStorage.getItem("theme");
        if (saved === "dark" || saved === "light") return saved;
      } catch (_e) {}
      return document.documentElement.classList.contains("dark") ? "dark" : "light";
    }
    function paint() {
      var cur = currentTheme();
      opts.forEach(function (b) {
        var active = b.getAttribute("data-theme") === cur;
        b.classList.toggle("bg-background", active);
        b.classList.toggle("text-on-surface", active);
        b.classList.toggle("shadow-sm", active);
        b.classList.toggle("text-on-surface-variant", !active);
      });
    }
    opts.forEach(function (b) {
      b.addEventListener("click", function () {
        var theme = b.getAttribute("data-theme");
        if (typeof window.setTheme === "function") window.setTheme(theme);
        else document.documentElement.classList.toggle("dark", theme === "dark");
        paint();
      });
    });
    paint();
  })();

  loadProfile().then(loadApprovals);
})();
