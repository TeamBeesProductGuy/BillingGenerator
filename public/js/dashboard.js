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

    // Quote is a nice-to-have paper trail; the contract starts at SOW. So missing
    // a quote alone shouldn't flag a chain as broken — only PO and rate card count.
    function vcEffectivelyComplete(row) {
        return Boolean(row.hasPo && row.hasRateCard);
    }

    function vcMissingList(row) {
        var missing = [];
        if (!row.hasPo) missing.push("PO");
        if (!row.hasRateCard) missing.push("Rate Card");
        return missing;
    }

    // One labelled link in a chain track: green when present (shows what it points to),
    // amber when missing. The optional `tone` lets us downgrade non-blocking gaps
    // (like a missing quote) to a muted neutral instead of a loud warning.
    function vcSegment(done, label, icon, tone) {
        var missingCls = tone === "muted"
            ? "bg-surface-container-highest text-on-surface-variant"
            : "bg-warning/10 text-warning";
        var cls = done ? "bg-success/10 text-success" : missingCls;
        return '<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold whitespace-nowrap ' + cls + '">' +
            '<span class="material-symbols-outlined" style="font-size:12px;line-height:1">' + (done ? "check" : icon) + "</span>" +
            escapeHtml(label) + "</span>";
    }

    function vcConnector(flowing) {
        return '<span class="material-symbols-outlined shrink-0 ' + (flowing ? "text-success/50" : "text-on-surface-variant/30") + '" style="font-size:14px;line-height:1">chevron_right</span>';
    }

    // A single value-chain row shared by both the "needs attention" and "all links" views.
    function renderVcRow(row) {
        var complete = vcEffectivelyComplete(row);
        var missingCount = vcMissingList(row).length;

        var quoteLabel = row.hasQuote ? (row.quote_number || "Quote") : "No quote";
        var poLabel;
        if (!row.hasPo) {
            poLabel = "No PO";
        } else if (row.po_numbers && row.po_numbers.length) {
            poLabel = row.po_numbers.join(", ");
            if (row.po_count > row.po_numbers.length) poLabel += " +" + (row.po_count - row.po_numbers.length);
        } else {
            poLabel = (row.po_count || 0) + " PO";
        }
        var rcLabel = row.hasRateCard ? (row.rate_card_count + " rate card" + (row.rate_card_count === 1 ? "" : "s")) : "No rate card";

        var leadIcon = complete ? "bg-success/12 text-success" : "bg-warning/12 text-warning";
        var badge = complete
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/12 text-success whitespace-nowrap"><span class="material-symbols-outlined" style="font-size:13px;line-height:1">check</span>Complete</span>'
            : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/12 text-warning whitespace-nowrap"><span class="material-symbols-outlined" style="font-size:13px;line-height:1">link_off</span>' + missingCount + " missing</span>";

        return '<a href="#sows" onclick="return openEntityFromDashboard(\'sow\',' + row.sow_id + ')" class="block p-3 rounded-xl bg-surface-container-high/40 border border-outline-variant/10 hover:border-primary/25 hover:bg-surface-container-high transition-all no-underline">' +
            '<div class="flex items-center justify-between gap-3 mb-2.5">' +
                '<div class="flex items-center gap-2.5 min-w-0">' +
                    '<span class="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ' + leadIcon + '"><span class="material-symbols-outlined text-[18px]">' + (complete ? "verified" : "link_off") + "</span></span>" +
                    '<div class="min-w-0">' +
                        '<p class="text-sm font-semibold text-on-surface truncate">' + escapeHtml(row.sow_number || "—") + "</p>" +
                        '<p class="text-[11px] text-on-surface-variant truncate">' + escapeHtml(row.client_name || "") + " · " + escapeHtml(row.status || "") + "</p>" +
                    "</div>" +
                "</div>" + badge +
            "</div>" +
            '<div class="flex items-center gap-1 overflow-x-auto styled-scrollbar pb-0.5">' +
                vcSegment(row.hasQuote, quoteLabel, "request_quote", "muted") + vcConnector(row.hasQuote) +
                vcSegment(true, "SOW", "description") + vcConnector(row.hasPo) +
                vcSegment(row.hasPo, poLabel, "local_shipping") + vcConnector(row.hasPo && row.hasRateCard) +
                vcSegment(row.hasRateCard, rcLabel, "badge") +
            "</div>" +
            "</a>";
    }

    function renderValueChain(vc) {
        lastValueChain = vc || {};
        var completionEl = document.getElementById("valueChainCompletion");
        var summaryEl = document.getElementById("valueChainSummary");
        var total = lastValueChain.total || 0;
        // Recompute against the relaxed definition (PO + Rate Card required;
        // missing quote no longer counts against completeness).
        var allRows = lastValueChain.all || [];
        var complete = allRows.length
            ? allRows.filter(vcEffectivelyComplete).length
            : (lastValueChain.complete || 0);
        var pct = total > 0 ? Math.round((complete / total) * 100) : 0;

        if (completionEl) {
            var pctColorClass = pct >= 80 ? "text-success" : pct >= 50 ? "text-primary" : "text-warning";
            completionEl.innerHTML =
                '<div class="rounded-xl border border-outline-variant/10 bg-gradient-to-br from-primary/10 via-surface-container-high/30 to-accent/5 p-4">' +
                    '<div class="flex items-end justify-between gap-3 mb-2.5">' +
                        '<div>' +
                            '<div class="text-[10px] uppercase tracking-[0.18em] text-on-surface-variant font-bold">Chain completion</div>' +
                            '<div class="text-2xl font-headline font-bold text-on-surface mt-0.5">' + complete +
                                '<span class="text-base font-medium text-on-surface-variant"> / ' + total + " live SOW" + (total === 1 ? "" : "s") + "</span></div>" +
                        "</div>" +
                        '<div class="text-3xl font-headline font-bold ' + pctColorClass + '">' + pct + "%</div>" +
                    "</div>" +
                    '<div class="h-2.5 rounded-full bg-surface-container-highest overflow-hidden">' +
                        '<div class="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style="width:' + pct + '%"></div>' +
                    "</div>" +
                "</div>";
        }

        if (summaryEl) {
            var pills = [
                { label: "Complete", value: complete, tone: "success", icon: "verified" },
                // Missing-quote is informational only — never tinted as a warning.
                { label: "No Quote", value: lastValueChain.missingQuote || 0, tone: "muted", icon: "request_quote" },
                { label: "No PO", value: lastValueChain.missingPo || 0, tone: (lastValueChain.missingPo ? "warning" : "muted"), icon: "local_shipping" },
                { label: "No Rate Card", value: lastValueChain.missingRateCard || 0, tone: (lastValueChain.missingRateCard ? "warning" : "muted"), icon: "badge" }
            ];
            summaryEl.innerHTML = pills.map(function (p) {
                var chipCls = p.tone === "success" ? "bg-success/12 text-success" : p.tone === "warning" ? "bg-warning/12 text-warning" : "bg-surface-container-highest text-on-surface-variant";
                var numCls = p.tone === "success" ? "text-success" : p.tone === "warning" ? "text-warning" : "text-on-surface";
                return '<div class="rounded-xl bg-surface-container-high/40 border border-outline-variant/10 px-3 py-2.5 flex items-center gap-2.5">' +
                    '<span class="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 ' + chipCls + '"><span class="material-symbols-outlined text-[18px]">' + p.icon + "</span></span>" +
                    '<div class="min-w-0">' +
                        '<div class="text-lg font-bold leading-none ' + numCls + '">' + p.value + "</div>" +
                        '<div class="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold mt-1 truncate">' + p.label + "</div>" +
                    "</div>" +
                "</div>";
            }).join("");
        }

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
            listEl.innerHTML = allRows.map(renderVcRow).join("");
            return;
        }

        // Default: chains needing attention. Skip rows whose only gap is a missing
        // quote — those are intentionally treated as a soft signal, not a blocker.
        var rows = (vc.incomplete || []).filter(function (row) {
            return !vcEffectivelyComplete(row);
        });
        if (metaEl) {
            metaEl.textContent = rows.length + " need attention";
        }
        if (rows.length === 0) {
            listEl.innerHTML = '<div class="flex flex-col items-center justify-center gap-1.5 text-on-surface-variant text-sm py-6">' +
                '<span class="material-symbols-outlined text-success text-3xl">verified</span>' +
                '<span>Every live SOW has a complete value chain</span></div>';
            return;
        }
        listEl.innerHTML = rows.map(renderVcRow).join("");
    }

    function setVcTab(view) {
        vcView = view === "all" ? "all" : "attention";
        var attentionBtn = document.getElementById("vcTabAttention");
        var allBtn = document.getElementById("vcTabAll");
        var active = "px-3 py-1.5 text-[11px] font-bold rounded-md transition-all bg-surface text-on-surface shadow-sm";
        var inactive = "px-3 py-1.5 text-[11px] font-semibold rounded-md transition-all text-on-surface-variant hover:text-on-surface";
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
