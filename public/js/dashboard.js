(function () {
    "use strict";

    // -----------------------------------------------------------
    //  Chart.js Loader
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

    var chartInstance = null;

    function renderRevenueChart(billingRuns) {
        var canvas = document.getElementById("revenueChart");
        if (!canvas || !window.Chart) return;
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

        var monthMap = {};
        billingRuns.forEach(function (r) {
            var m = r.billing_month;
            if (!monthMap[m]) monthMap[m] = 0;
            monthMap[m] += Number(r.total_amount) || 0;
        });

        var sortedMonths = Object.keys(monthMap).sort();
        var last6 = sortedMonths.slice(-6);
        var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

        var labels = last6.map(function (m) {
            var mo = parseInt(m.substring(4, 6), 10) - 1;
            return monthNames[mo] + " " + m.substring(0, 4);
        });
        var amounts = last6.map(function (m) { return monthMap[m]; });

        chartInstance = new Chart(canvas, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{
                    label: "Revenue",
                    data: amounts,
                    backgroundColor: "rgba(195, 192, 255, 0.3)",
                    borderColor: "#c3c0ff",
                    borderWidth: 1,
                    borderRadius: 8,
                    barPercentage: 0.6,
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
                        grid: { color: "rgba(70, 69, 85, 0.15)" },
                        ticks: {
                            color: "#918fa1",
                            callback: function (value) { return formatCurrency(value); }
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: "#918fa1" }
                    }
                }
            }
        });
    }

    // -----------------------------------------------------------
    //  Format billing month YYYYMM to readable
    // -----------------------------------------------------------
    function formatBillingMonth(m) {
        if (!m || m.length < 6) return m;
        var monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        var mo = parseInt(m.substring(4, 6), 10) - 1;
        return monthNames[mo] + " " + m.substring(0, 4);
    }

    // -----------------------------------------------------------
    //  Load Dashboard
    // -----------------------------------------------------------
    async function loadDashboard() {
        try {
            var res = await apiCall("GET", "/api/dashboard/stats");
            var data = res.data;
            var counts = data.counts;
            var recentRuns = data.recentRuns;
            var poAlerts = data.poAlerts;

            // Stats
            document.getElementById("statTotalClients").textContent = counts.clients;
            document.getElementById("statActiveEmployees").textContent = counts.employees;
            document.getElementById("statActivePOs").textContent = counts.activePOs;
            document.getElementById("statBillingRuns").textContent = counts.billingRuns;
            document.getElementById("statPendingQuotes").textContent = counts.pendingQuotes;

            // Total revenue
            var totalRevenue = 0;
            recentRuns.forEach(function (r) { totalRevenue += Number(r.total_amount) || 0; });
            var revenueEl = document.getElementById("statTotalRevenue");
            if (revenueEl) revenueEl.textContent = formatCurrency(totalRevenue);

            // Recent runs sidebar
            var runsList = document.getElementById("recentRunsList");
            if (recentRuns.length === 0) {
                runsList.innerHTML = '<div class="text-on-surface-variant text-sm text-center py-4">No billing runs yet</div>';
            } else {
                runsList.innerHTML = recentRuns.slice(0, 5).map(function (r) {
                    var monthLabel = formatBillingMonth(r.billing_month);
                    var monthShort = monthLabel.substring(0, 3).toUpperCase();
                    return '<div class="flex items-center justify-between p-3 rounded-xl hover:bg-surface-container-high transition-colors cursor-pointer group">' +
                        '<div class="flex items-center gap-3">' +
                        '<div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface-variant group-hover:text-primary">' +
                        monthShort + '</div>' +
                        '<div><p class="text-sm font-semibold">' + monthLabel + '</p>' +
                        '<p class="text-[10px] text-on-surface-variant">ID: BR-' + r.id + '</p></div></div>' +
                        '<div class="text-right">' +
                        '<p class="text-sm font-bold">' + formatCurrency(r.total_amount) + '</p>' +
                        (r.error_count > 0
                            ? '<span class="badge-error">Errors</span>'
                            : '<span class="badge-success">Success</span>') +
                        '</div></div>';
                }).join("");
            }

            // PO Alerts
            var alertsList = document.getElementById("poAlertsList");
            if (poAlerts.length === 0) {
                alertsList.innerHTML = '<div class="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-2">' +
                    '<span class="material-symbols-outlined text-emerald-400">check_circle</span> No alerts</div>';
            } else {
                alertsList.innerHTML = poAlerts.map(function (a) {
                    var pct = a.consumption_pct || 0;
                    var colorClass = pct >= 80 ? "text-error" : pct >= 60 ? "text-tertiary" : "text-emerald-400";
                    return '<div class="p-3 rounded-xl bg-surface-container-high/50 border border-outline-variant/10">' +
                        '<div class="flex justify-between mb-1">' +
                        '<span class="text-sm font-semibold">' + escapeHtml(a.po_number) + '</span>' +
                        '<span class="' + colorClass + ' font-bold text-sm">' + pct.toFixed(1) + '%</span></div>' +
                        '<p class="text-[10px] text-on-surface-variant">' + escapeHtml(a.client_name) + ' | Ends: ' + formatDate(a.end_date) + '</p></div>';
                }).join("");
            }

            // Billing History Table
            var historyBody = document.getElementById("billingHistoryBody");
            if (recentRuns.length === 0) {
                historyBody.innerHTML = '<tr><td colspan="6" class="text-center text-on-surface-variant py-8">No billing runs yet</td></tr>';
            } else {
                historyBody.innerHTML = recentRuns.map(function (r) {
                    return '<tr class="hover:bg-surface-container-low transition-colors">' +
                        '<td class="px-6 py-5 text-sm font-semibold">' + formatBillingMonth(r.billing_month) + '</td>' +
                        '<td class="px-6 py-5 text-sm text-center">' + r.total_employees + '</td>' +
                        '<td class="px-6 py-5 text-sm font-bold text-right">' + formatCurrency(r.total_amount) + '</td>' +
                        '<td class="px-6 py-5 text-center">' +
                        (r.error_count > 0
                            ? '<span class="badge-error">' + r.error_count + '</span>'
                            : '<span class="badge-success">0</span>') +
                        '</td>' +
                        '<td class="px-6 py-5 text-sm">' + formatDate(r.created_at) + '</td>' +
                        '<td class="px-6 py-5 text-center">' +
                        '<button onclick="downloadFile(\'/api/billing/runs/' + r.id + '/download\')" class="inline-flex items-center justify-center w-8 h-8 rounded-lg hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors" title="Download">' +
                        '<span class="material-symbols-outlined text-lg">download</span></button></td></tr>';
                }).join("");
            }

            // Init table search & sort
            initTableSearch("billingHistorySearch", "billingHistoryBody");
            initTableSort("billingHistoryTable");

            // Chart
            await loadChartJs();
            renderRevenueChart(recentRuns);

        } catch (err) {
            showToast("Failed to load dashboard: " + err.message, "error");
        }
    }

    loadDashboard();

    var refreshBtn = document.getElementById("btnRefreshDashboard");
    if (refreshBtn) refreshBtn.addEventListener("click", loadDashboard);
})();
