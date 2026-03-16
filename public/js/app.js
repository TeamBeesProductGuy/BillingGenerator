/* ============================================================
   TeamBees Billing Engine - Client-Side Router & Shared Utilities
   Stitch Design System (Tailwind + Material Symbols)
   ============================================================ */

(function () {
    "use strict";

    var ROUTES = ["dashboard", "billing", "rate-cards", "attendance", "quotes", "purchase-orders", "clients"];
    var DEFAULT_ROUTE = "dashboard";
    var currentPage = null;
    var pageCache = {};

    var PAGE_TITLES = {
        "dashboard": "Dashboard",
        "billing": "Billing",
        "clients": "Clients",
        "rate-cards": "Rate Cards",
        "attendance": "Attendance",
        "quotes": "Quotes",
        "purchase-orders": "Purchase Orders"
    };

    // -----------------------------------------------------------
    //  Router
    // -----------------------------------------------------------
    async function navigate() {
        var hash = (location.hash || "").replace(/^#\/?/, "").toLowerCase();
        if (!hash || !ROUTES.includes(hash)) {
            hash = DEFAULT_ROUTE;
            history.replaceState(null, "", "#" + hash);
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
    //  API Call
    // -----------------------------------------------------------
    window.apiCall = async function apiCall(method, url, data) {
        var options = { method: method.toUpperCase(), headers: {} };
        if (data !== undefined && data !== null) {
            if (data instanceof FormData) {
                options.body = data;
            } else {
                options.headers["Content-Type"] = "application/json";
                options.body = JSON.stringify(data);
            }
        }
        var response = await fetch(url, options);
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
    //  Toast Notifications
    // -----------------------------------------------------------
    window.showToast = function showToast(message, type) {
        if (type === "error") type = "danger";
        type = type || "info";
        var container = document.getElementById("toast-container");
        if (!container) return;

        var iconMap = { success: "check_circle", danger: "error", warning: "warning", info: "info" };
        var el = document.createElement("div");
        el.className = "toast-notification toast-" + type;
        el.innerHTML =
            '<span class="material-symbols-outlined toast-icon">' + (iconMap[type] || "info") + '</span>' +
            '<div class="toast-body">' + message + '</div>' +
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
    //  Confirm Dialog
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

            var resolved = false;
            function cleanup() {
                modal.classList.add("hidden");
                modal.classList.remove("flex");
                okBtn.removeEventListener("click", onOk);
                cancelBtn.removeEventListener("click", onCancel);
                resolve(resolved);
            }
            function onOk() { resolved = true; cleanup(); }
            function onCancel() { cleanup(); }

            var okBtn = document.getElementById("confirmOkBtn");
            var cancelBtn = document.getElementById("confirmCancelBtn");
            okBtn.addEventListener("click", onOk);
            cancelBtn.addEventListener("click", onCancel);
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
        var month = now.getMonth();
        if (month === 0) { month = 12; year--; }
        return String(year) + String(month).padStart(2, "0");
    };

    window.getDefaultBillingMonthInput = function () {
        var yyyymm = getDefaultBillingMonth();
        return yyyymm.substring(0, 4) + "-" + yyyymm.substring(4, 6);
    };

    // -----------------------------------------------------------
    //  Dark Mode
    // -----------------------------------------------------------
    function initDarkMode() {
        var saved = localStorage.getItem("darkMode");
        if (saved === "false") {
            document.documentElement.classList.remove("dark");
        } else {
            document.documentElement.classList.add("dark");
            localStorage.setItem("darkMode", "true");
        }
        updateDarkModeIcon();
    }

    window.toggleDarkMode = function () {
        var isDark = document.documentElement.classList.contains("dark");
        if (isDark) {
            document.documentElement.classList.remove("dark");
            localStorage.setItem("darkMode", "false");
        } else {
            document.documentElement.classList.add("dark");
            localStorage.setItem("darkMode", "true");
        }
        updateDarkModeIcon();
    };

    function updateDarkModeIcon() {
        var isDark = document.documentElement.classList.contains("dark");
        var icon = document.getElementById("darkModeIcon");
        var label = document.getElementById("darkModeLabel");
        var dot = document.getElementById("darkModeDot");
        if (icon) icon.textContent = isDark ? "dark_mode" : "light_mode";
        if (label) label.textContent = isDark ? "Dark Mode" : "Light Mode";
        if (dot) {
            dot.style.right = isDark ? "4px" : "auto";
            dot.style.left = isDark ? "auto" : "4px";
        }
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
    //  Table Search & Sort
    // -----------------------------------------------------------
    window.initTableSearch = function (searchInputId, tbodyId) {
        var input = document.getElementById(searchInputId);
        if (!input) return;
        input.addEventListener("input", function () {
            var query = this.value.toLowerCase().trim();
            var tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            tbody.querySelectorAll("tr").forEach(function (row) {
                if (row.querySelector("td[colspan]")) { row.style.display = ""; return; }
                row.style.display = row.textContent.toLowerCase().indexOf(query) !== -1 ? "" : "none";
            });
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
    document.addEventListener("DOMContentLoaded", function () {
        initDarkMode();

        var toggle = document.getElementById("sidebar-toggle");
        if (toggle) toggle.addEventListener("click", window.toggleMobileSidebar);

        var overlay = document.getElementById("sidebar-overlay");
        if (overlay) overlay.addEventListener("click", window.closeMobileSidebar);

        navigate();
    });

    window.addEventListener("hashchange", navigate);
})();
