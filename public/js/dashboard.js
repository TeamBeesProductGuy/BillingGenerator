(function () {
    "use strict";

    // -----------------------------------------------------------
    //  Chart.js loader
    // -----------------------------------------------------------
    function loadChartJs() {
        return new Promise(function (resolve) {
            if (window.Chart) return resolve();
            var script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/chart.js";
            script.onload = resolve;
            script.onerror = function () {
                showToast("Failed to load Chart.js — revenue chart unavailable", "warning");
                resolve();
            };
            document.head.appendChild(script);
        });
    }

    var revenueChart = null;

    // Value Chain Health card state (toggled between "needs attention" and "all links").
    var lastValueChain = null;
    var vcView = "attention";

    // -----------------------------------------------------------
    //  Helpers
    // -----------------------------------------------------------
    var MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    function formatBillingMonth(m) {
        if (!m || String(m).length < 6) return m;
        var s = String(m);
        var mo = parseInt(s.substring(4, 6), 10) - 1;
        return MONTH_NAMES[mo] + " " + s.substring(0, 4);
    }

    function formatBillingMonthShort(m) {
        if (!m || String(m).length < 6) return m;
        var s = String(m);
        var mo = parseInt(s.substring(4, 6), 10) - 1;
        return MONTH_NAMES[mo] + " '" + s.substring(2, 4);
    }

    function formatCompactCurrency(value) {
        var n = Number(value) || 0;
        var abs = Math.abs(n);
        if (abs >= 1e7) return "₹" + (n / 1e7).toFixed(2) + "Cr";
        if (abs >= 1e5) return "₹" + (n / 1e5).toFixed(2) + "L";
        if (abs >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "K";
        return "₹" + n.toFixed(0);
    }

    function getThemeColor(name, alpha) {
        var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        if (!value) return "";
        if (alpha === undefined) return value;
        if (value.indexOf(" ") !== -1) return "rgb(" + value + " / " + alpha + ")";
        return value;
    }

    function daysLeftBadge(days) {
        if (days === null || days === undefined) return '';
        var cls = days <= 3 ? 'badge-error' : days <= 7 ? 'badge-warning' : 'badge-processing';
        return '<span class="' + cls + '">' + days + 'd left</span>';
    }

    function pctColor(pct) {
        if (pct >= 95) return 'text-error';
        if (pct >= 85) return 'text-warning';
        if (pct >= 70) return 'text-tertiary';
        return 'text-success';
    }

    // Deep-link from a dashboard card straight to a specific SOW or PO. The destination
    // page consumes `pendingOpenEntity` on load and opens that exact record.
    window.openEntityFromDashboard = function (type, id) {
        try {
            sessionStorage.setItem("pendingOpenEntity", JSON.stringify({ type: type, id: id }));
        } catch (e) { /* sessionStorage unavailable — fall back to plain navigation */ }
        location.hash = type === "po" ? "#purchase-orders" : "#sows";
        return false;
    };

    // -----------------------------------------------------------
    //  Renderers
    // -----------------------------------------------------------
    function renderKPIs(counts, financials) {
        document.getElementById("kpiClients").textContent = counts.clients || 0;
        document.getElementById("kpiEmployees").textContent = counts.employees || 0;
        document.getElementById("kpiSOWs").textContent = counts.activeSOWs || 0;
        document.getElementById("kpiPOs").textContent = counts.activePOs || 0;

        var alertsBadge = document.getElementById("kpiPOAlertsBadge");
        if (counts.poAlerts > 0) {
            alertsBadge.textContent = counts.poAlerts;
            alertsBadge.classList.remove("hidden");
        } else {
            alertsBadge.classList.add("hidden");
        }

        document.getElementById("kpiRevenueMTD").textContent = formatCurrency(financials.revenueMTD || 0);
        document.getElementById("kpiRevenue12M").textContent = "Last 12M: " + formatCurrency(financials.revenueLast12M || 0);
        document.getElementById("kpiPOCommitted").textContent = formatCurrency(financials.poCommitted || 0);
        document.getElementById("kpiPOConsumed").textContent = formatCurrency(financials.poConsumed || 0);
        document.getElementById("kpiPORemaining").textContent = formatCurrency(financials.poRemaining || 0);

        var pct = Math.min(100, Math.max(0, Number(financials.poConsumedPct || 0)));
        var pctEl = document.getElementById("kpiPOConsumedPct");
        pctEl.textContent = pct.toFixed(1) + "%";
        pctEl.className = "text-xs font-bold " + pctColor(pct);
        document.getElementById("kpiPOConsumedBar").style.width = pct + "%";
    }

    function renderExpiringPos(items) {
        var el = document.getElementById("expiringPosList");
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-4">' +
                '<span class="material-symbols-outlined text-success">check_circle</span>No POs expiring soon</div>';
            return;
        }
        el.innerHTML = items.map(function (p) {
            return '<a href="#purchase-orders" onclick="return openEntityFromDashboard(\'po\',' + p.id + ')" class="block p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors no-underline">' +
                '<div class="flex items-start justify-between gap-2 mb-1">' +
                '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-semibold text-on-surface truncate">' + escapeHtml(p.po_number) + '</p>' +
                '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(p.client_name) + '</p>' +
                '</div>' + daysLeftBadge(p.days_left) + '</div>' +
                '<div class="flex items-center justify-between text-[11px] text-on-surface-variant mt-1">' +
                '<span>Ends ' + formatDate(p.end_date) + '</span>' +
                '<span class="font-semibold">' + formatCompactCurrency(p.remaining_value) + ' left</span>' +
                '</div></a>';
        }).join("");
    }

    function renderExpiringSows(items) {
        var el = document.getElementById("expiringSowsList");
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-4">' +
                '<span class="material-symbols-outlined text-success">check_circle</span>No SOWs expiring soon</div>';
            return;
        }
        el.innerHTML = items.map(function (s) {
            return '<a href="#sows" onclick="return openEntityFromDashboard(\'sow\',' + s.id + ')" class="block p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors no-underline">' +
                '<div class="flex items-start justify-between gap-2 mb-1">' +
                '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-semibold text-on-surface truncate">' + escapeHtml(s.sow_number) + '</p>' +
                '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(s.client_name) + '</p>' +
                '</div>' + daysLeftBadge(s.days_left) + '</div>' +
                '<div class="flex items-center justify-between text-[11px] text-on-surface-variant mt-1">' +
                '<span>Ends ' + formatDate(s.effective_end) + '</span>' +
                '<span class="font-semibold">' + formatCompactCurrency(s.total_value) + ' value</span>' +
                '</div></a>';
        }).join("");
    }

    function renderHighConsumption(items) {
        var el = document.getElementById("highConsumptionPosList");
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-4">' +
                '<span class="material-symbols-outlined text-success">check_circle</span>All POs healthy</div>';
            return;
        }
        el.innerHTML = items.map(function (p) {
            var pct = Math.min(100, Math.max(0, Number(p.consumption_pct || 0)));
            var barColor = pct >= 95 ? 'bg-error' : pct >= 85 ? 'bg-warning' : 'bg-tertiary';
            return '<a href="#purchase-orders" onclick="return openEntityFromDashboard(\'po\',' + p.id + ')" class="block p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors no-underline">' +
                '<div class="flex items-start justify-between gap-2 mb-1">' +
                '<div class="min-w-0 flex-1">' +
                '<p class="text-sm font-semibold text-on-surface truncate">' + escapeHtml(p.po_number) + '</p>' +
                '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(p.client_name) + '</p>' +
                '</div>' +
                '<span class="font-bold text-sm ' + pctColor(pct) + '">' + pct.toFixed(1) + '%</span>' +
                '</div>' +
                '<div class="h-1.5 rounded-full bg-surface-container-highest overflow-hidden mt-2"><div class="h-full ' + barColor + '" style="width:' + pct + '%"></div></div>' +
                '<p class="text-[11px] text-on-surface-variant mt-1.5">' + formatCompactCurrency(p.consumed_value) + ' of ' + formatCompactCurrency(p.po_value) + '</p>' +
                '</a>';
        }).join("");
    }

    function renderTopClients(items) {
        var el = document.getElementById("topClientsList");
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="text-on-surface-variant text-sm text-center py-4">No revenue in the last 12 months</div>';
            return;
        }
        var max = items.reduce(function (m, c) { return Math.max(m, Number(c.total || 0)); }, 0);
        el.innerHTML = items.map(function (c, idx) {
            var pct = max > 0 ? (Number(c.total || 0) / max) * 100 : 0;
            var rankColors = ['bg-primary', 'bg-accent', 'bg-tertiary', 'bg-success', 'bg-on-surface-variant'];
            var color = rankColors[idx] || 'bg-on-surface-variant';
            return '<div>' +
                '<div class="flex items-center justify-between mb-1">' +
                '<span class="text-sm font-semibold truncate text-on-surface flex items-center gap-2">' +
                '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface-container-high text-[10px] font-bold">' + (idx + 1) + '</span>' +
                escapeHtml(c.client_name) + '</span>' +
                '<span class="text-xs font-bold">' + formatCompactCurrency(c.total) + '</span>' +
                '</div>' +
                '<div class="h-2 rounded-full bg-surface-container-high overflow-hidden">' +
                '<div class="h-full ' + color + ' transition-all" style="width:' + pct + '%"></div>' +
                '</div></div>';
        }).join("");
    }

    function renderRecentRuns(items) {
        var el = document.getElementById("recentRunsList");
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="px-5 py-6 text-center text-on-surface-variant text-sm">No service requests yet</div>';
            return;
        }
        el.innerHTML = items.map(function (r) {
            var monthLabel = formatBillingMonth(r.billing_month);
            var monthShort = MONTH_NAMES[parseInt(String(r.billing_month).substring(4, 6), 10) - 1] || '';
            var errorBadge = r.error_count > 0
                ? '<span class="badge-error">' + r.error_count + ' err</span>'
                : '<span class="badge-success">Clean</span>';
            return '<div class="flex items-center justify-between gap-3 px-5 py-3 hover:bg-surface-container-low transition-colors">' +
                '<div class="flex items-center gap-3 min-w-0">' +
                '<div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-on-surface-variant flex-shrink-0">' + monthShort + '</div>' +
                '<div class="min-w-0">' +
                '<p class="text-sm font-semibold truncate">' + monthLabel + '</p>' +
                '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(r.client_name || '-') + ' • ' + (r.total_employees || 0) + ' emp</p>' +
                '</div></div>' +
                '<div class="text-right flex-shrink-0">' +
                '<p class="text-sm font-bold">' + formatCurrency(r.total_amount) + '</p>' +
                errorBadge +
                '</div></div>';
        }).join("");
    }

    function vcStepDots(row) {
        var steps = [
            { label: "Quote", done: row.hasQuote },
            { label: "SOW", done: true },
            { label: "PO", done: row.hasPo },
            { label: "Rate Card", done: row.hasRateCard }
        ];
        return steps.map(function (st, i) {
            var color = st.done ? "bg-success/15 text-success" : "bg-warning/15 text-warning";
            var dot = '<span class="inline-flex items-center justify-center w-5 h-5 rounded-full ' + color + '" title="' + st.label + (st.done ? " linked" : " missing") + '">' +
                '<span class="material-symbols-outlined" style="font-size:13px;line-height:1">' + (st.done ? "check" : "priority_high") + "</span></span>";
            var conn = i < steps.length - 1
                ? '<span class="inline-block w-2 h-px ' + (st.done && steps[i + 1].done ? "bg-success/40" : "bg-outline-variant/40") + '"></span>'
                : "";
            return dot + conn;
        }).join("");
    }

    function vcMissingList(row) {
        var missing = [];
        if (!row.hasQuote) missing.push("Quote");
        if (!row.hasPo) missing.push("PO");
        if (!row.hasRateCard) missing.push("Rate Card");
        return missing;
    }

    // A small labelled pill showing whether a link exists and, when it does, what it points to.
    function vcChip(done, label, icon) {
        var cls = done ? "bg-success/12 text-success" : "bg-warning/12 text-warning";
        return '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ' + cls + '">' +
            '<span class="material-symbols-outlined" style="font-size:12px;line-height:1">' + icon + "</span>" +
            escapeHtml(label) + "</span>";
    }

    function renderValueChain(vc) {
        lastValueChain = vc || {};
        var summaryEl = document.getElementById("valueChainSummary");
        if (!summaryEl) return;

        var tiles = [
            { label: "Live SOWs", value: lastValueChain.total || 0, accent: "text-on-surface", icon: "description" },
            { label: "Complete", value: lastValueChain.complete || 0, accent: "text-success", icon: "verified" },
            { label: "No Quote", value: lastValueChain.missingQuote || 0, accent: (lastValueChain.missingQuote ? "text-warning" : "text-on-surface-variant"), icon: "request_quote" },
            { label: "No PO", value: lastValueChain.missingPo || 0, accent: (lastValueChain.missingPo ? "text-warning" : "text-on-surface-variant"), icon: "local_shipping" },
            { label: "No Rate Card", value: lastValueChain.missingRateCard || 0, accent: (lastValueChain.missingRateCard ? "text-warning" : "text-on-surface-variant"), icon: "badge" }
        ];
        summaryEl.innerHTML = tiles.map(function (t) {
            return '<div class="rounded-xl bg-surface-container-high/40 border border-outline-variant/10 p-3">' +
                '<div class="flex items-center gap-1.5 mb-1"><span class="material-symbols-outlined text-[14px] text-on-surface-variant">' + t.icon + "</span>" +
                '<span class="text-[10px] uppercase tracking-[0.15em] text-on-surface-variant font-semibold">' + t.label + "</span></div>" +
                '<div class="text-xl font-headline font-bold ' + t.accent + '">' + t.value + "</div>" +
                "</div>";
        }).join("");

        renderValueChainList();
    }

    function renderValueChainList() {
        var listEl = document.getElementById("valueChainList");
        var metaEl = document.getElementById("valueChainListMeta");
        if (!listEl) return;
        if (!lastValueChain) return; // data not loaded yet — keep the placeholder
        var vc = lastValueChain;

        if (vcView === "all") {
            var allRows = vc.all || [];
            var allTotal = vc.allTotal || allRows.length;
            if (metaEl) {
                metaEl.textContent = allTotal + " live SOW" + (allTotal === 1 ? "" : "s") +
                    (allTotal > allRows.length ? " (showing " + allRows.length + ")" : "");
            }
            if (allRows.length === 0) {
                listEl.innerHTML = '<div class="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-4">' +
                    '<span class="material-symbols-outlined">info</span>No live (Signed/Active) SOWs yet</div>';
                return;
            }
            listEl.innerHTML = allRows.map(function (row) {
                var statusBadge = row.complete
                    ? '<span class="badge-success whitespace-nowrap">Complete</span>'
                    : '<span class="badge-warning whitespace-nowrap">Missing: ' + escapeHtml(vcMissingList(row).join(", ")) + "</span>";
                var quoteLabel = row.hasQuote ? (row.quote_number || "Quote linked") : "No quote";
                var poLabel;
                if (!row.hasPo) {
                    poLabel = "No PO";
                } else if (row.po_numbers && row.po_numbers.length) {
                    poLabel = row.po_numbers.join(", ");
                    if (row.po_count > row.po_numbers.length) poLabel += " +" + (row.po_count - row.po_numbers.length);
                } else {
                    poLabel = row.po_count + " linked";
                }
                var rcLabel = row.hasRateCard ? (row.rate_card_count + " rate card" + (row.rate_card_count === 1 ? "" : "s")) : "No rate card";
                return '<a href="#sows" onclick="return openEntityFromDashboard(\'sow\',' + row.sow_id + ')" class="block p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors no-underline">' +
                    '<div class="flex items-center justify-between gap-2 mb-2">' +
                    '<div class="min-w-0">' +
                    '<p class="text-sm font-semibold text-on-surface truncate">' + escapeHtml(row.sow_number || "—") + "</p>" +
                    '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(row.client_name || "") + " · " + escapeHtml(row.status || "") + "</p>" +
                    "</div>" + statusBadge + "</div>" +
                    '<div class="flex flex-wrap items-center gap-1.5">' +
                    vcChip(row.hasQuote, quoteLabel, "request_quote") +
                    '<span class="text-on-surface-variant text-[11px]">→</span>' +
                    vcChip(row.hasPo, poLabel, "local_shipping") +
                    '<span class="text-on-surface-variant text-[11px]">→</span>' +
                    vcChip(row.hasRateCard, rcLabel, "badge") +
                    "</div>" +
                    "</a>";
            }).join("");
            return;
        }

        // Default: chains needing attention.
        var rows = vc.incomplete || [];
        if (metaEl) {
            var totalIncomplete = vc.incompleteTotal || rows.length;
            metaEl.textContent = totalIncomplete + " need attention" + (totalIncomplete > rows.length ? " (showing " + rows.length + ")" : "");
        }
        if (rows.length === 0) {
            listEl.innerHTML = '<div class="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-4">' +
                '<span class="material-symbols-outlined text-success">check_circle</span>All live SOWs have a complete value chain</div>';
            return;
        }
        listEl.innerHTML = rows.map(function (row) {
            return '<a href="#sows" onclick="return openEntityFromDashboard(\'sow\',' + row.sow_id + ')" class="block p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:bg-surface-container-high transition-colors no-underline">' +
                '<div class="flex items-center justify-between gap-2 mb-2">' +
                '<div class="min-w-0">' +
                '<p class="text-sm font-semibold text-on-surface truncate">' + escapeHtml(row.sow_number || "—") + "</p>" +
                '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(row.client_name || "") + " · " + escapeHtml(row.status || "") + "</p>" +
                "</div>" +
                '<span class="badge-warning whitespace-nowrap">Missing: ' + escapeHtml(vcMissingList(row).join(", ")) + "</span>" +
                "</div>" +
                '<div class="inline-flex items-center">' + vcStepDots(row) + "</div>" +
                "</a>";
        }).join("");
    }

    function setVcTab(view) {
        vcView = view === "all" ? "all" : "attention";
        var attentionBtn = document.getElementById("vcTabAttention");
        var allBtn = document.getElementById("vcTabAll");
        var active = "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors bg-surface text-on-surface shadow-sm";
        var inactive = "px-3 py-1 text-[11px] font-semibold rounded-md transition-colors text-on-surface-variant hover:text-on-surface";
        if (attentionBtn) attentionBtn.className = vcView === "attention" ? active : inactive;
        if (allBtn) allBtn.className = vcView === "all" ? active : inactive;
        renderValueChainList();
    }

    function renderRevenueChart(trend) {
        var canvas = document.getElementById("revenueChart");
        if (!canvas || !window.Chart) return;
        if (revenueChart) { revenueChart.destroy(); revenueChart = null; }

        var labels = (trend || []).map(function (p) { return formatBillingMonthShort(p.billing_month); });
        var amounts = (trend || []).map(function (p) { return Number(p.total) || 0; });

        var totalEl = document.getElementById("revenueTrendTotal");
        if (totalEl) totalEl.textContent = "Total: " + formatCurrency(amounts.reduce(function (a, b) { return a + b; }, 0));

        var primary = getThemeColor("--color-primary") || "#F4B740";
        var primaryRgb = getThemeColor("--color-primary-rgb") || "244 183 64";
        var fillColor = primaryRgb.indexOf(" ") !== -1 ? "rgba(" + primaryRgb.replace(/\s+/g, ",") + ", 0.25)" : primary;

        revenueChart = new Chart(canvas, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Revenue",
                    data: amounts,
                    backgroundColor: fillColor,
                    borderColor: primary,
                    borderWidth: 1.5,
                    borderRadius: 6,
                    barPercentage: 0.65,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) { return formatCurrency(ctx.parsed.y); }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: "rgba(120,120,120,0.08)" },
                        ticks: {
                            color: getThemeColor("--color-text-muted") || "#888",
                            callback: function (value) { return formatCompactCurrency(value); }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: getThemeColor("--color-text-muted") || "#888" }
                    }
                }
            }
        });
    }

    // -----------------------------------------------------------
    //  Load
    // -----------------------------------------------------------
    async function loadDashboard() {
        try {
            var res = await apiCall("GET", "/api/dashboard/stats");
            var d = res.data || {};
            renderKPIs(d.counts || {}, d.financials || {});
            renderExpiringPos(d.expiringPos);
            renderExpiringSows(d.expiringSows);
            renderHighConsumption(d.highConsumptionPos);
            renderValueChain(d.valueChain);
            renderTopClients(d.topClients);
            renderRecentRuns(d.recentRuns);
            await loadChartJs();
            renderRevenueChart(d.revenueTrend);
            var stamp = document.getElementById("dashboardLastUpdated");
            if (stamp) stamp.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        } catch (err) {
            showToast("Failed to load dashboard: " + (err && err.message ? err.message : err), "error");
        }
    }

    loadDashboard();

    // Value Chain Health view toggle.
    setVcTab(vcView);
    var vcTabAttention = document.getElementById("vcTabAttention");
    var vcTabAll = document.getElementById("vcTabAll");
    if (vcTabAttention) vcTabAttention.addEventListener("click", function () { setVcTab("attention"); });
    if (vcTabAll) vcTabAll.addEventListener("click", function () { setVcTab("all"); });

    var refreshBtn = document.getElementById("btnRefreshDashboard");
    if (refreshBtn) refreshBtn.addEventListener("click", loadDashboard);

    var trackerBtn = document.getElementById("btnDownloadTracker");
    if (trackerBtn) {
        trackerBtn.addEventListener("click", function () {
            downloadFile("/api/dashboard/tracker/export", "Order_Tracker.xlsx");
        });
    }
})();
