/* ============================================================
   TeamBees Service Request Engine - Client-Side Router & Shared Utilities
   Stitch Design System (Tailwind + Material Symbols)
   ============================================================ */

(function () {
    "use strict";

    // -----------------------------------------------------------
    //  Supabase Auth Config
    // -----------------------------------------------------------
    var SUPABASE_URL = "https://rupzjxvjvedbdanuqwhj.supabase.co";
    var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1cHpqeHZqdmVkYmRhbnVxd2hqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NDUyODcsImV4cCI6MjA4OTIyMTI4N30.ZzKidn48g_cu0zWdfmL8LX8stiYVHavcSthBOL1bJ9g";

    var supabaseClient = null;
    var currentSession = null;

    function initSupabase() {
        if (window.supabase && window.supabase.createClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            window._supabaseClient = supabaseClient;
        }
    }

    // -----------------------------------------------------------
    //  Routes & State
    // -----------------------------------------------------------
    var ROUTES = ["dashboard", "billing", "rate-cards", "attendance", "quotes", "sows", "purchase-orders", "clients", "orders", "reminders"];
    var DEFAULT_ROUTE = "dashboard";
    var SIGNIN_PATH = "/signin";
    var currentPage = null;
    var pageCache = {};

    var PAGE_TITLES = {
        "dashboard": "Dashboard",
        "billing": "Service Requests",
        "clients": "Clients",
        "rate-cards": "Rate Cards",
        "attendance": "Attendance",
        "quotes": "Quotes",
        "sows": "Statements of Work",
        "purchase-orders": "Purchase Orders",
        "orders": "Orders",
        "reminders": "Reminders"
    };

    // -----------------------------------------------------------
    //  Auth Flow
    // -----------------------------------------------------------
    function showApp() {
        var sidebar = document.getElementById("sidebar");
        var mainContent = document.querySelector("main");
        if (sidebar) sidebar.style.display = "";
        if (mainContent) mainContent.style.display = "";
    }

    function hideApp() {
        var sidebar = document.getElementById("sidebar");
        var mainContent = document.querySelector("main");
        if (sidebar) sidebar.style.display = "none";
        if (mainContent) mainContent.style.display = "none";
    }

    async function showLoginPage() {
        hideApp();
        if (location.pathname !== SIGNIN_PATH || location.hash) {
            history.replaceState(null, "", SIGNIN_PATH);
        }
        var loginContainer = document.getElementById("login-container");
        if (!loginContainer) {
            loginContainer = document.createElement("div");
            loginContainer.id = "login-container";
            loginContainer.className = "fixed inset-0 z-[999] bg-background overflow-y-auto";
            document.body.insertBefore(loginContainer, document.body.firstChild);
        }
        loginContainer.style.display = "";

        try {
            if (!pageCache["login"]) {
                var resp = await fetch("/pages/login.html");
                if (!resp.ok) throw new Error("Login page not found");
                pageCache["login"] = await resp.text();
            }
            loginContainer.innerHTML = pageCache["login"];
            var prev = document.getElementById("page-script");
            if (prev) prev.remove();
            var script = document.createElement("script");
            script.id = "page-script";
            script.src = "/js/login.js?_=" + Date.now();
            document.body.appendChild(script);
        } catch (err) {
            loginContainer.innerHTML = '<div class="p-8 text-error">Failed to load login page: ' + err.message + '</div>';
        }
    }

    function hideLoginPage() {
        var loginContainer = document.getElementById("login-container");
        if (loginContainer) loginContainer.style.display = "none";
    }

    function updateUserDisplay() {
        var emailEl = document.getElementById("userEmail");
        if (emailEl && currentSession && currentSession.user) {
            emailEl.textContent = currentSession.user.email;
        }
    }

    window.onAuthSuccess = function (session) {
        currentSession = session;
        if (location.pathname === SIGNIN_PATH || location.pathname !== "/") {
            history.replaceState(null, "", "/#" + DEFAULT_ROUTE);
        } else if (!location.hash) {
            history.replaceState(null, "", "/#" + DEFAULT_ROUTE);
        }
        hideLoginPage();
        showApp();
        updateUserDisplay();
        navigate();
    };

    window.handleLogout = async function () {
        if (supabaseClient) {
            await supabaseClient.auth.signOut();
        }
        currentSession = null;
        currentPage = null;
        showLoginPage();
    };

    async function checkAuth() {
        if (!supabaseClient) return null;
        var result = await supabaseClient.auth.getSession();
        if (result.data && result.data.session) {
            currentSession = result.data.session;
            return result.data.session;
        }
        return null;
    }

    // -----------------------------------------------------------
    //  Router
    // -----------------------------------------------------------
    async function navigate() {
        if (!currentSession) {
            await showLoginPage();
            return;
        }

        var hash = (location.hash || "").replace(/^#\/?/, "").toLowerCase();
        if (!hash || !ROUTES.includes(hash)) {
            hash = DEFAULT_ROUTE;
            history.replaceState(null, "", "/#" + hash);
        }
        if (hash === currentPage) return;
        currentPage = hash;

        updateActiveNav(hash);
        updatePageHeader(hash);

        var appContent = document.getElementById("app-content");
        try {
            appContent.innerHTML =
                '<div class="flex items-center justify-center min-h-[40vh]">' +
                '<div class="loading-spinner"></div></div>';

            if (!pageCache[hash]) {
                var resp = await fetch("/pages/" + hash + ".html");
                if (!resp.ok) throw new Error("Page not found");
                pageCache[hash] = await resp.text();
            }
            appContent.innerHTML = pageCache[hash];
            await loadPageScript(hash);
        } catch (err) {
            appContent.innerHTML =
                '<div class="p-8"><div class="bg-error/10 border border-error/20 rounded-xl p-6 text-error">' +
                '<span class="material-symbols-outlined align-middle mr-2">error</span>' +
                'Failed to load page: <strong>' + escapeHtml(hash) + '</strong><br>' +
                '<span class="text-on-surface-variant text-sm">' + escapeHtml(err.message) + '</span></div></div>';
        }
        closeMobileSidebar();
    }

    function loadPageScript(page) {
        return new Promise(function (resolve) {
            var prev = document.getElementById("page-script");
            if (prev) prev.remove();
            var script = document.createElement("script");
            script.id = "page-script";
            script.src = "/js/" + page + ".js?_=" + Date.now();
            script.onload = resolve;
            script.onerror = resolve;
            document.body.appendChild(script);
        });
    }

    function updateActiveNav(page) {
        document.querySelectorAll(".sidebar-link").forEach(function (link) {
            if (link.getAttribute("data-page") === page) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    function updatePageHeader(page) {
        var title = PAGE_TITLES[page] || page;
        var pageTitle = document.getElementById("pageTitle");
        var breadcrumbPage = document.getElementById("breadcrumbPage");
        if (pageTitle) pageTitle.textContent = title;
        if (breadcrumbPage) breadcrumbPage.textContent = title;
    }

    // -----------------------------------------------------------
    //  Mobile sidebar
    // -----------------------------------------------------------
    window.toggleMobileSidebar = function () {
        var sidebar = document.getElementById("sidebar");
        var overlay = document.getElementById("sidebar-overlay");
        sidebar.classList.toggle("-translate-x-full");
        sidebar.classList.toggle("open");
        overlay.classList.toggle("hidden");
        overlay.classList.toggle("show");
    };

    window.closeMobileSidebar = function () {
        var sidebar = document.getElementById("sidebar");
        var overlay = document.getElementById("sidebar-overlay");
        if (sidebar && !sidebar.classList.contains("-translate-x-full")) {
            sidebar.classList.add("-translate-x-full");
            sidebar.classList.remove("open");
        }
        if (overlay) {
            overlay.classList.add("hidden");
            overlay.classList.remove("show");
        }
    };

    // -----------------------------------------------------------
    //  Modal Helpers (centralized open/close with scroll lock + escape + backdrop)
    // -----------------------------------------------------------
    function openModalCount() {
        return document.querySelectorAll(".fixed.z-\\[200\\].flex:not(.hidden)").length;
    }

    window.openModal = function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.remove("hidden");
            el.classList.add("flex");
            document.body.classList.add("modal-open");
        }
    };

    window.closeModal = function (id) {
        var el = document.getElementById(id);
        if (el) {
            el.classList.add("hidden");
            el.classList.remove("flex");
            // Only remove scroll lock if no other modals are open
            if (openModalCount() === 0) {
                document.body.classList.remove("modal-open");
            }
        }
    };

    // Close topmost modal on Escape key
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        // Find all visible modals (z-[200])
        var modals = document.querySelectorAll(".fixed.z-\\[200\\].flex:not(.hidden)");
        if (modals.length === 0) return;
        var topModal = modals[modals.length - 1];
        // Try to find a close button within the modal
        var closeBtn = topModal.querySelector("[onclick*='close']");
        if (closeBtn) {
            closeBtn.click();
        } else {
            closeModal(topModal.id);
        }
    });

    // Close modal on backdrop (overlay) click
    document.addEventListener("click", function (e) {
        var target = e.target;
        // Only if clicking directly on the overlay element (not its children)
        if (target.classList.contains("fixed") &&
            target.classList.contains("z-[200]") &&
            target.classList.contains("flex") &&
            !target.classList.contains("hidden")) {
            var closeBtn = target.querySelector("[onclick*='close']");
            if (closeBtn) {
                closeBtn.click();
            } else {
                closeModal(target.id);
            }
        }
    });

    // -----------------------------------------------------------
    //  API Call (with auth token)
    // -----------------------------------------------------------
    window.apiCall = async function apiCall(method, url, data) {
        var options = { method: method.toUpperCase(), headers: {} };

        // Require auth token for protected API calls
        var isApiCall = typeof url === "string" && url.indexOf("/api/") === 0;
        if (isApiCall && (!currentSession || !currentSession.access_token)) {
            currentSession = null;
            currentPage = null;
            showLoginPage();
            throw new Error("Authentication required. Please log in again.");
        }

        if (currentSession && currentSession.access_token) {
            options.headers["Authorization"] = "Bearer " + currentSession.access_token;
        }

        if (data !== undefined && data !== null) {
            if (data instanceof FormData) {
                options.body = data;
            } else {
                options.headers["Content-Type"] = "application/json";
                options.body = JSON.stringify(data);
            }
        }
        var response = await fetch(url, options);

        // Handle 401 - redirect to login
        if (response.status === 401) {
            currentSession = null;
            currentPage = null;
            showLoginPage();
            throw new Error("Session expired. Please log in again.");
        }

        var contentType = response.headers.get("content-type") || "";
        var parsed;
        if (contentType.includes("application/json")) {
            parsed = await response.json();
        } else {
            parsed = await response.text();
        }
        if (!response.ok) {
            var errMsg = (parsed && (parsed.error || parsed.message)) || "Request failed with status " + response.status;
            throw new Error(errMsg);
        }
        return parsed;
    };

    // -----------------------------------------------------------
    //  Authenticated File Download
    // -----------------------------------------------------------
    window.downloadFile = async function (url, filename) {
        try {
            var options = { method: "GET", headers: {} };
            if (currentSession && currentSession.access_token) {
                options.headers["Authorization"] = "Bearer " + currentSession.access_token;
            }
            var response = await fetch(url, options);

            if (response.status === 401) {
                currentSession = null;
                currentPage = null;
                showLoginPage();
                showToast("Session expired. Please log in again.", "danger");
                return;
            }
            if (!response.ok) {
                var errText = await response.text();
                try { errText = JSON.parse(errText).error || errText; } catch (e) { /* use raw */ }
                throw new Error(errText || "Download failed");
            }

            // Derive filename from Content-Disposition header or URL
            if (!filename) {
                var cd = response.headers.get("Content-Disposition") || "";
                var match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (match) {
                    filename = match[1].replace(/['"]/g, "");
                } else {
                    filename = url.split("/").pop().split("?")[0] || "download";
                }
            }

            var blob = await response.blob();
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        } catch (err) {
            showToast("Download failed: " + err.message, "danger");
        }
    };

    // -----------------------------------------------------------
    //  Toast Notifications (capped at 5)
    // -----------------------------------------------------------
    var MAX_TOASTS = 5;

    window.showToast = function showToast(message, type) {
        if (type === "error") type = "danger";
        type = type || "info";
        var container = document.getElementById("toast-container");
        if (!container) return;

        // Cap toasts — remove oldest if at limit
        while (container.children.length >= MAX_TOASTS) {
            dismissToast(container.firstElementChild);
        }

        var iconMap = { success: "check_circle", danger: "error", warning: "warning", info: "info" };
        var el = document.createElement("div");
        el.className = "toast-notification toast-" + type;
        el.innerHTML =
            '<span class="material-symbols-outlined toast-icon">' + (iconMap[type] || "info") + '</span>' +
            '<div class="toast-body">' + escapeHtml(message) + '</div>' +
            '<button class="toast-close" aria-label="Close"><span class="material-symbols-outlined" style="font-size:16px">close</span></button>' +
            '<div class="toast-progress"></div>';

        container.appendChild(el);
        el.querySelector(".toast-close").addEventListener("click", function () { dismissToast(el); });
        setTimeout(function () { dismissToast(el); }, 4000);
    };

    function dismissToast(el) {
        if (!el || el.classList.contains("toast-removing")) return;
        el.classList.add("toast-removing");
        el.addEventListener("animationend", function () { el.remove(); });
    }

    window.showAlert = function (message, type) { window.showToast(message, type); };

    // -----------------------------------------------------------
    //  Confirm Dialog (with Escape support)
    // -----------------------------------------------------------
    window.confirmAction = function confirmAction(titleOrMessage, message) {
        var title, body;
        if (message === undefined) { title = "Confirm"; body = titleOrMessage; }
        else { title = titleOrMessage; body = message; }

        return new Promise(function (resolve) {
            var modal = document.getElementById("confirmModal");
            document.getElementById("confirmTitle").textContent = title;
            document.getElementById("confirmBody").textContent = body;
            modal.classList.remove("hidden");
            modal.classList.add("flex");
            document.body.classList.add("modal-open");

            var resolved = false;
            function cleanup() {
                modal.classList.add("hidden");
                modal.classList.remove("flex");
                if (openModalCount() === 0) {
                    document.body.classList.remove("modal-open");
                }
                okBtn.removeEventListener("click", onOk);
                cancelBtn.removeEventListener("click", onCancel);
                document.removeEventListener("keydown", onEscape);
                resolve(resolved);
            }
            function onOk() { resolved = true; cleanup(); }
            function onCancel() { cleanup(); }
            function onEscape(e) { if (e.key === "Escape") cleanup(); }

            var okBtn = document.getElementById("confirmOkBtn");
            var cancelBtn = document.getElementById("confirmCancelBtn");
            okBtn.addEventListener("click", onOk);
            cancelBtn.addEventListener("click", onCancel);
            document.addEventListener("keydown", onEscape);
        });
    };

    // -----------------------------------------------------------
    //  Loading States
    // -----------------------------------------------------------
    window.showLoading = function showLoading(container) {
        if (typeof container === "string") container = document.getElementById(container);
        if (!container) return;
        container.setAttribute("data-prev-content", container.innerHTML);
        container.innerHTML = '<div class="loading-spinner"></div>';
    };

    window.hideLoading = function hideLoading(container) {
        if (typeof container === "string") container = document.getElementById(container);
        if (!container) return;
        var prev = container.getAttribute("data-prev-content");
        if (prev !== null) {
            container.innerHTML = prev;
            container.removeAttribute("data-prev-content");
        } else {
            var spinner = container.querySelector(".loading-spinner");
            if (spinner) spinner.remove();
        }
    };

    // -----------------------------------------------------------
    //  Billing Month Helpers
    // -----------------------------------------------------------
    window.getDefaultBillingMonth = function () {
        var now = new Date();
        var year = now.getFullYear();
        var month = now.getMonth(); // 0-indexed, so Jan=0, which means "previous month" = Dec of last year
        if (month === 0) { month = 12; year--; }
        return String(year) + String(month).padStart(2, "0");
    };

    window.getDefaultBillingMonthInput = function () {
        var yyyymm = getDefaultBillingMonth();
        return yyyymm.substring(0, 4) + "-" + yyyymm.substring(4, 6);
    };

    // -----------------------------------------------------------
    //  Dark Mode (always on)
    // -----------------------------------------------------------
    function initDarkMode() {
        document.documentElement.classList.add("dark");
    }

    // -----------------------------------------------------------
    //  Formatting Utilities
    // -----------------------------------------------------------
    window.formatCurrency = function (num) {
        if (num === null || num === undefined || isNaN(num)) return "\u20B90.00";
        num = Number(num);
        var isNeg = num < 0;
        num = Math.abs(num);
        var parts = num.toFixed(2).split(".");
        var intPart = parts[0], decPart = parts[1];
        var result = "";
        if (intPart.length <= 3) { result = intPart; }
        else {
            var last3 = intPart.slice(-3);
            var remaining = intPart.slice(0, -3);
            var groups = [];
            while (remaining.length > 2) { groups.unshift(remaining.slice(-2)); remaining = remaining.slice(0, -2); }
            if (remaining.length > 0) groups.unshift(remaining);
            result = groups.join(",") + "," + last3;
        }
        return (isNeg ? "-" : "") + "\u20B9" + result + "." + decPart;
    };

    window.formatDate = function (str) {
        if (!str) return "";
        try {
            var d = new Date(str);
            if (isNaN(d.getTime())) return str;
            var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
        } catch (e) { return str; }
    };

    window.escapeHtml = function (str) {
        if (str === null || str === undefined) return "";
        var div = document.createElement("div");
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    };

    window.getClientDisplayName = function (client) {
        if (!client) return "";
        var abbreviation = String(client.abbreviation || "").trim();
        var clientName = String(client.client_name || "").trim();
        var address = String(client.address || "").trim();
        if (abbreviation) {
            return address ? abbreviation + " (" + address + ")" : abbreviation;
        }
        return address ? clientName + " (" + address + ")" : clientName;
    };

    // -----------------------------------------------------------
    //  Cache & Reload Helpers
    // -----------------------------------------------------------
    window.clearPageCache = function (page) {
        if (page) delete pageCache[page];
        else Object.keys(pageCache).forEach(function (k) { delete pageCache[k]; });
    };

    window.reloadCurrentPage = function () {
        if (currentPage) {
            clearPageCache(currentPage);
            currentPage = null;
            navigate();
        }
    };

    // -----------------------------------------------------------
    //  Table Search (with debounce) & Sort
    // -----------------------------------------------------------
    window.initTableSearch = function (searchInputId, tbodyId) {
        var input = document.getElementById(searchInputId);
        if (!input) return;
        var debounceTimer = null;
        input.addEventListener("input", function () {
            var self = this;
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                var query = self.value.toLowerCase().trim();
                var tbody = document.getElementById(tbodyId);
                if (!tbody) return;
                tbody.querySelectorAll("tr").forEach(function (row) {
                    if (row.querySelector("td[colspan]")) { row.style.display = ""; return; }
                    row.style.display = row.textContent.toLowerCase().indexOf(query) !== -1 ? "" : "none";
                });
            }, 200);
        });
    };

    window.initTableSort = function (tableId) {
        var table = typeof tableId === "string" ? document.getElementById(tableId) : tableId;
        if (!table) return;
        var headers = table.querySelectorAll("th.sortable");
        headers.forEach(function (th) {
            th.style.cursor = "pointer";
            th.style.userSelect = "none";
            if (!th.querySelector(".sort-icon")) {
                th.insertAdjacentHTML("beforeend", ' <span class="material-symbols-outlined sort-icon" style="font-size:14px;opacity:0.4;vertical-align:middle">unfold_more</span>');
            }
            th.addEventListener("click", function () {
                var colIdx = parseInt(th.getAttribute("data-sort-key"), 10);
                var sortType = th.getAttribute("data-sort-type") || "string";
                var tbody = table.querySelector("tbody");
                if (!tbody) return;

                var currentDir = th.getAttribute("data-sort-dir") || "none";
                var newDir = currentDir === "asc" ? "desc" : "asc";
                headers.forEach(function (h) {
                    h.setAttribute("data-sort-dir", "none");
                    var icon = h.querySelector(".sort-icon");
                    if (icon) { icon.textContent = "unfold_more"; icon.style.opacity = "0.4"; }
                });
                th.setAttribute("data-sort-dir", newDir);
                var icon = th.querySelector(".sort-icon");
                if (icon) {
                    icon.textContent = newDir === "asc" ? "expand_less" : "expand_more";
                    icon.style.opacity = "1";
                }

                var rows = Array.from(tbody.querySelectorAll("tr")).filter(function (r) { return !r.querySelector("td[colspan]"); });
                rows.sort(function (a, b) {
                    var cellA = a.querySelectorAll("td")[colIdx];
                    var cellB = b.querySelectorAll("td")[colIdx];
                    if (!cellA || !cellB) return 0;
                    var valA = cellA.textContent.trim(), valB = cellB.textContent.trim();
                    if (sortType === "number" || sortType === "currency") {
                        var numA = parseFloat(valA.replace(/[^0-9.\-]/g, "")) || 0;
                        var numB = parseFloat(valB.replace(/[^0-9.\-]/g, "")) || 0;
                        return newDir === "asc" ? numA - numB : numB - numA;
                    } else if (sortType === "date") {
                        return newDir === "asc" ? new Date(valA) - new Date(valB) : new Date(valB) - new Date(valA);
                    }
                    return newDir === "asc" ? valA.localeCompare(valB, undefined, { sensitivity: "base" }) : valB.localeCompare(valA, undefined, { sensitivity: "base" });
                });
                rows.forEach(function (r) { tbody.appendChild(r); });
            });
        });
    };

    // -----------------------------------------------------------
    //  Initialization
    // -----------------------------------------------------------
    document.addEventListener("DOMContentLoaded", async function () {
        hideApp();
        initDarkMode();
        initSupabase();

        var toggle = document.getElementById("sidebar-toggle");
        if (toggle) toggle.addEventListener("click", window.toggleMobileSidebar);

        var overlay = document.getElementById("sidebar-overlay");
        if (overlay) overlay.addEventListener("click", window.closeMobileSidebar);

        // Check existing auth session
        var session = await checkAuth();
        if (session) {
            showApp();
            updateUserDisplay();
            navigate();
        } else {
            showLoginPage();
        }

        // Listen for auth state changes (e.g. token refresh)
        if (supabaseClient) {
            supabaseClient.auth.onAuthStateChange(function (event, session) {
                if (event === "SIGNED_OUT" || !session) {
                    currentSession = null;
                    currentPage = null;
                    showLoginPage();
                } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
                    currentSession = session;
                }
            });
        }
    });

    window.addEventListener("hashchange", navigate);
})();
