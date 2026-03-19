# TeamBees Billing Generator

## 1. Overview

**TeamBees Billing Generator** is an end-to-end automated billing platform built for staffing and consulting companies that deploy employees at client sites. It replaces manual spreadsheet-based invoicing with a structured, auditable workflow that tracks the complete lifecycle from client onboarding through purchase order consumption.

The platform enforces a strict business workflow — **Client → Statement of Work → Purchase Order → Rate Card → Billing** — ensuring every invoice is traceable back to a signed agreement. It calculates employee-level billing based on attendance, monthly rates, and leave policies, then auto-generates styled Excel invoices and tracks PO consumption in real time.

**Key Value Proposition**: Eliminate billing errors, enforce financial controls, and reduce invoice turnaround from days to minutes — with full audit trails and PO consumption tracking built in.

---

## 2. Problem Statement

Staffing and consulting firms face recurring billing challenges:

- **Manual Excel workflows** are error-prone — wrong rates, missed employees, incorrect leave calculations, and copy-paste mistakes lead to revenue leakage or client disputes.
- **No PO tracking** — teams lose visibility into how much of a purchase order has been consumed, leading to over-billing (client disputes) or under-billing (revenue loss).
- **Disconnected data** — client contracts, employee rate cards, attendance records, and invoices live in separate spreadsheets with no validation between them.
- **No audit trail** — when billing disputes arise, there is no reliable way to trace an invoice line item back to the original SOW, PO, and attendance record.
- **Pro-rata billing is manual** — employees who join mid-month require manual day-count adjustments that are frequently miscalculated.
- **Manager-level reporting gaps** — finance teams lack grouped summaries by reporting manager for cost center allocation.

**Current market gaps**: Existing HRMS and ERP solutions either lack staffing-specific billing logic (attendance-based rate card invoicing) or are prohibitively complex and expensive for mid-size staffing firms.

---

## 3. Solution

TeamBees Billing Generator solves these problems through:

- **Automated billing engine** that calculates invoice amounts from rate cards and attendance data using a configurable formula with pro-rata support, leave buffers, and chargeable-day caps.
- **Strict workflow enforcement** with database-level triggers ensuring every billing line traces back through Rate Card → PO → SOW → Client.
- **Real-time PO consumption tracking** that automatically deducts billed amounts from purchase orders and alerts teams when POs approach exhaustion or expiry.
- **Dual input modes** — generate billing from uploaded Excel files (for teams transitioning from spreadsheets) or directly from the database (for fully digital workflows).
- **Three-sheet Excel output** — Billing Working (detailed calculations), Manager Summary (grouped totals), and Error Report (flagged issues) — ready for client submission.

**Key Differentiators**:
- Purpose-built for staffing/consulting billing (not a generic invoicing tool)
- PO consumption pipeline with auto-exhaustion and renewal workflows
- Pro-rata and capped billing calculations out of the box
- Zero-setup dark-themed UI with no build tooling required
- Error collection philosophy — processes all valid employees and reports errors separately, never blocking an entire billing run for one bad record

---

## 4. Core Features

### 4.1 Client Management
- Full CRUD with soft-delete support
- Industry classification and contact tracking
- Searchable, sortable data tables
- Foundation entity for the entire workflow chain

### 4.2 Statement of Work (SOW)
- Auto-generated SOW numbers (`SOW-YYYYMMDD-NNN`)
- Line items for roles/positions with quantity and amount
- Status lifecycle: Draft → Active → Expired / Terminated
- Links quotes to contractual agreements

### 4.3 Quotes
- Quote creation with line items (description, quantity, unit rate, employee code, location)
- Status workflow: Draft → Sent → Accepted / Rejected → Expired
- Export to styled Excel or PDF (with company header, items table, and totals)
- One-click conversion from Accepted Quote to Purchase Order

### 4.4 Purchase Order Management
- PO creation linked to an active SOW (enforced by database trigger)
- Real-time consumption tracking with progress bars and percentage display
- Configurable alert thresholds (default 80%) and expiry warnings (30-day lookahead)
- **PO Renewal workflow** — marks old PO as "Renewed", creates a new PO, inherits the SOW, and auto-migrates all linked employees with full assignment history logging
- Manual consumption support for ad-hoc adjustments
- Linked employee visibility per PO

### 4.5 Rate Cards (Employee Billing Profiles)
- Per-employee monthly rate, leave allowance, date of joining, date of reporting, and reporting manager
- Unique constraint: one rate card per employee per client
- Must be assigned to an Active PO belonging to the same client (database trigger enforced)
- Bulk Excel import (resolves PO numbers to IDs automatically)
- Excel export for offline review

### 4.6 Attendance Tracking
- Normalized daily records (Present / Leave per employee per day)
- Three entry methods: manual single-day, bulk full-month, Excel upload
- Aggregated summary view via database function (leaves taken, days present, total days)
- Unique constraint prevents duplicate entries

### 4.7 Billing Engine
- **Two generation modes**: from uploaded Excel files or from database records
- **Billing formula**:
  ```
  EffectiveDays  = DaysInMonth (or pro-rated from date_of_reporting)
  ChargeableDays = min(EffectiveDays - LeavesTaken + LeavesAllowed, 30)
  InvoiceAmount  = (ChargeableDays / Divisor) × MonthlyRate
  ```
- **Pro-rata support**: employees joining mid-month are billed from their reporting date
- **Chargeable days cap**: hard maximum of 30 to prevent over-billing
- **Configurable divisor**: actual calendar days or fixed 30-day
- **Auto PO consumption**: billed amounts are automatically deducted from linked POs
- **Error collection**: invalid employees are logged to the Error Report sheet; valid employees are still processed
- **Three-sheet Excel output**: Billing Working, Manager Summary, Error Report
- **Billing history**: every run is stored with full line items and errors for audit

### 4.8 Dashboard
- Six stat cards: Total Clients, Active Employees, Active POs, Billing Runs, Pending Quotes, Total Revenue
- Revenue trend bar chart (last 6 months via Chart.js)
- Recent billing runs sidebar with amount and error badges
- PO alerts sidebar (threshold breaches and expiry warnings)
- Searchable billing history table with download actions
- Quick-action shortcuts to key workflows

### 4.9 Sample Templates
- Downloadable sample Excel files for rate cards and attendance
- Dynamically generated with correct column headers and formatting

---

## 5. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Browser)                          │
│                                                                     │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│   │  Login   │  │Dashboard │  │ Modules  │  │  Shared Utils    │  │
│   │(Supabase │  │(Chart.js)│  │(Clients, │  │(Router, Auth,    │  │
│   │Auth CDN) │  │          │  │ SOWs,POs,│  │ Toast, Tables,   │  │
│   │          │  │          │  │ Billing) │  │ Modals, Currency)│  │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │
│        │              │             │                  │            │
│        └──────────────┴─────────────┴──────────────────┘            │
│                     Vanilla JS SPA + Tailwind CSS                  │
│                     Hash-based routing (#dashboard, #billing...)    │
│                     Bearer token on every API call                  │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTPS (REST API)
                              │ Authorization: Bearer <JWT>
┌─────────────────────────────▼───────────────────────────────────────┐
│                     BACKEND (Node.js + Express)                     │
│                                                                     │
│   ┌────────────┐  ┌─────────────┐  ┌────────────┐  ┌───────────┐  │
│   │ Middleware  │  │ Controllers │  │  Services   │  │  Models   │  │
│   │─────────── │  │──────────── │  │──────────── │  │────────── │  │
│   │• Auth(JWT) │  │• Billing    │  │• Billing    │  │• Supabase │  │
│   │• Validate  │→ │• Clients    │→ │  Calculator │→ │  Queries  │  │
│   │• Upload    │  │• Rate Cards │  │• Excel      │  │• Views    │  │
│   │• Error     │  │• Attendance │  │  Writer     │  │• RPC      │  │
│   │• CORS      │  │• Quotes     │  │• Excel      │  │  Calls    │  │
│   │• Helmet    │  │• POs, SOWs  │  │  Parser     │  │           │  │
│   │• Rate Limit│  │• Dashboard  │  │• Validation │  │           │  │
│   └────────────┘  └─────────────┘  └────────────┘  └─────┬─────┘  │
└───────────────────────────────────────────────────────────┬─────────┘
                                                            │
                              Supabase Client (service_role key)
                                                            │
┌───────────────────────────────────────────────────────────▼─────────┐
│                    DATABASE (Supabase PostgreSQL)                    │
│                                                                     │
│   Tables (12)          Views (4)           Functions (6)            │
│   ────────────         ─────────           ──────────────           │
│   clients              rate_cards_view     get_attendance_summary   │
│   sows, sow_items      quotes_view        consume_po               │
│   quotes, quote_items  sows_view           renew_po                 │
│   purchase_orders      purchase_orders_    get_po_alerts            │
│   po_consumption_log     view              get_dashboard_stats      │
│   rate_cards                               check_expired_pos        │
│   attendance                                                        │
│   billing_runs         Triggers (2)                                 │
│   billing_items        ─────────────                                │
│   billing_errors       trg_rate_card_po_client (cross-client guard) │
│   employee_po_history  trg_po_sow_client (cross-client guard)      │
│   audit_log                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| **Frontend** | Vanilla JS, Tailwind CSS, Chart.js | UI rendering, routing, auth flow, form handling |
| **API Layer** | Express.js + Middleware | Request validation, auth, rate limiting, file uploads |
| **Business Logic** | Service classes | Billing calculations, Excel parsing/generation, PO tracking |
| **Data Access** | Supabase JS client | Query building, RPC calls, view access |
| **Database** | PostgreSQL (Supabase) | Data storage, referential integrity, triggers, functions |
| **Auth** | Supabase Auth | JWT issuance, session management, token refresh |

---

## 6. Workflow (Step-by-Step)

### Primary Billing Workflow

```
Step 1: Client Onboarding
  └─→ Create client record (name, contact, industry)

Step 2: Statement of Work
  └─→ Create SOW linked to client
  └─→ Add role/position line items
  └─→ Activate SOW

Step 3: Purchase Order
  └─→ Create PO linked to active SOW
  └─→ Set PO value, dates, alert threshold

Step 4: Rate Card Setup
  └─→ Add employees with monthly rate, leave allowance
  └─→ Assign each employee to an active PO
  └─→ (Optional) Bulk import via Excel upload

Step 5: Attendance Recording
  └─→ Upload monthly attendance Excel
  └─→ Or enter manually / bulk per employee

Step 6: Billing Generation
  └─→ Select client and billing month
  └─→ Engine calculates per-employee invoice amounts
  └─→ Pro-rata applied for mid-month joiners
  └─→ Chargeable days capped at 30

Step 7: Auto PO Consumption
  └─→ Billed amounts grouped by PO
  └─→ Each PO's consumed_value incremented
  └─→ PO auto-marked "Exhausted" if fully consumed

Step 8: Output & Review
  └─→ Download 3-sheet Excel (Working + Manager Summary + Errors)
  └─→ Review billing history and error reports
  └─→ Dashboard updated with revenue trends and PO alerts
```

### PO Renewal Workflow

```
PO approaching exhaustion / expiry
  └─→ Click "Renew" on PO
  └─→ Enter new PO value, dates
  └─→ System marks old PO as "Renewed"
  └─→ Creates new PO (inherits SOW)
  └─→ Migrates all linked employees to new PO
  └─→ Logs assignment history for audit
```

### Quote-to-PO Conversion

```
Create Quote → Add line items → Send to client
  └─→ Client accepts → Status: "Accepted"
  └─→ Click "Convert to PO"
  └─→ Select SOW to link
  └─→ PO auto-created from quote data
```

---

## 7. Tech Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Frontend** | Vanilla JavaScript | SPA with hash-based routing, no build tools |
| **UI Framework** | Tailwind CSS (CDN) | Utility-first styling with custom dark theme |
| **Icons** | Material Symbols (Google) | Consistent iconography |
| **Charts** | Chart.js (CDN) | Revenue trend visualization |
| **Backend Runtime** | Node.js | Server-side JavaScript |
| **Web Framework** | Express.js | REST API routing and middleware |
| **Authentication** | Supabase Auth | JWT-based login, session management |
| **Database** | PostgreSQL (Supabase) | Relational data storage with triggers and functions |
| **DB Client** | @supabase/supabase-js | Query builder, RPC calls, real-time (available) |
| **Excel Engine** | ExcelJS | Read/write styled Excel workbooks |
| **PDF Engine** | PDFKit | Quote PDF generation |
| **File Upload** | Multer | Multipart form handling for Excel uploads |
| **Validation** | Joi | Request schema validation |
| **Security** | Helmet, CORS, express-rate-limit | HTTP hardening, origin control, abuse prevention |
| **Logging** | Morgan | HTTP request logging |

---

## 8. Use Cases

### Use Case 1: Monthly Client Billing
A staffing firm deploys 50 employees at a client site. Each month, the HR team uploads the attendance sheet, selects the client and billing month, and generates the invoice Excel in under a minute — with per-employee breakdowns, manager summaries, and automatic PO consumption.

### Use Case 2: Mid-Month Employee Onboarding
A new employee joins a client engagement on the 15th of the month. The system automatically pro-rates their billing from day 15 to month-end, calculating the correct invoice amount without manual intervention.

### Use Case 3: PO Exhaustion Monitoring
A project manager receives dashboard alerts when a client's PO is 85% consumed. They proactively initiate a PO renewal, and the system migrates all 20 employees to the new PO while preserving the full assignment history.

### Use Case 4: Quote-to-Invoice Pipeline
The sales team creates a quote with employee-level line items, exports it as a branded PDF for the client, and upon acceptance converts it directly into a purchase order — eliminating manual re-entry and ensuring data consistency from proposal to billing.

### Use Case 5: Billing Dispute Resolution
A client disputes a line item on last month's invoice. The finance team pulls up the billing run history, drills into the specific employee's calculation (rate, leaves taken, leaves allowed, effective days, chargeable days), and traces it back to the original PO and SOW — resolving the dispute with complete transparency.

---

## 9. Future Scope

### Near-Term Enhancements
- **Multi-currency support** — handle international client billing with exchange rate management
- **Role-based access control (RBAC)** — granular permissions for finance, HR, and management users
- **Email integration** — auto-send generated invoices and PO alerts to stakeholders
- **Recurring billing automation** — schedule monthly billing runs with auto-generation and notification

### Medium-Term Features
- **Client portal** — read-only access for clients to view invoices, PO status, and employee details
- **Advanced reporting** — custom report builder with filters, grouping, and export options
- **Timesheet integration** — connect with third-party timesheet tools for automated attendance sync
- **Approval workflows** — multi-level billing approval before invoice finalization

### Scalability Vision
- **Multi-tenant architecture** — support multiple staffing companies on a single platform
- **API-first design** — public API for third-party integrations (ERP, HRMS, accounting software)
- **Real-time dashboards** — WebSocket-powered live updates for PO consumption and billing status
- **Mobile-responsive UI** — full functionality on tablets and mobile devices for on-site managers

---

## 10. Demo Script

### Setup (Before Demo)
- Ensure the application is running with sample data loaded
- Have the browser open to the login page
- Prepare a sample attendance Excel file for upload

---

### Part 1: Introduction and Dashboard (0:00 – 0:40)

**Say**: "This is TeamBees Billing Generator — an automated billing platform built for staffing and consulting companies. Let me show you how it transforms a process that typically takes hours of spreadsheet work into a few clicks."

**Show**: Log in and land on the **Dashboard**.

**Say**: "The dashboard gives you a bird's-eye view — total clients, active employees, PO status, and revenue trends. Notice the PO alerts panel on the right — it flags purchase orders that are approaching exhaustion or expiry, so you never miss a renewal."

**Show**: Point out the stat cards, revenue chart, and PO alerts sidebar.

---

### Part 2: The Workflow Chain (0:40 – 1:20)

**Say**: "The system enforces a strict business workflow. Everything starts with a Client, flows through a Statement of Work, then a Purchase Order, and finally Rate Cards for each employee. This ensures every invoice line traces back to a signed contract."

**Show**: Navigate to **Clients** → show a client record.

**Show**: Navigate to **SOWs** → show an active SOW with role items.

**Show**: Navigate to **Purchase Orders** → show a PO with the consumption progress bar, linked employees count, and consumption percentage.

**Say**: "Each Purchase Order tracks how much has been consumed in real time. The system auto-deducts from POs every time billing is generated."

---

### Part 3: Billing Generation (1:20 – 2:10)

**Say**: "Now let's generate a billing run. I'll select a client and billing month, and the engine does the rest."

**Show**: Navigate to **Billing** → select "Generate from Database" → pick a client and month → click Generate.

**Say**: "The system pulls rate cards and attendance from the database, calculates each employee's invoice amount with pro-rata support for mid-month joiners, caps chargeable days at 30, and auto-consumes from linked POs."

**Show**: Point out the billing results — employee count, total amount, any errors.

**Say**: "Let me download the output."

**Show**: Download the Excel file → open it briefly to show three sheets: **Billing Working** (detailed per-employee calculations), **Manager Summary** (grouped by reporting manager), and **Error Report**.

---

### Part 4: PO Consumption and Alerts (2:10 – 2:40)

**Show**: Navigate back to **Purchase Orders** → show the updated consumption bar after billing.

**Say**: "See how the PO consumption updated automatically. When it crosses the threshold, an alert appears on the dashboard. And when a PO is nearly exhausted, you can renew it in one click — the system creates a new PO, migrates all employees, and logs the full history."

**Show**: (If applicable) Show the renewal button or a previously renewed PO.

---

### Part 5: Closing (2:40 – 3:00)

**Say**: "To summarize — TeamBees Billing Generator automates the entire billing lifecycle from contract to invoice, enforces financial controls at every step, and gives you real-time visibility into PO consumption. What used to take a finance team hours of spreadsheet work now takes minutes, with full audit trails and zero manual calculation errors."

**Show**: Return to the **Dashboard** for a clean closing visual.

---

## 11. Conclusion

**TeamBees Billing Generator** solves a critical operational pain point for staffing and consulting firms: the error-prone, time-consuming process of manually calculating and tracking employee-based client billing.

**What makes it stand out**:

- **Purpose-built** — not a generic invoicing tool, but a billing engine designed specifically for attendance-based rate card invoicing with staffing-industry workflows.
- **Enforced integrity** — database triggers and strict workflow rules ensure every invoice is traceable, every PO is tracked, and cross-client data mixing is impossible.
- **Intelligent automation** — pro-rata calculations, chargeable-day caps, auto PO consumption, and error collection mean the system handles edge cases that spreadsheets cannot.
- **Immediate value** — zero build tooling, cloud-hosted database, and a polished dark-themed UI mean teams can be productive from day one.
- **Audit-ready** — complete billing history with per-employee calculation breakdowns, PO consumption logs, and employee assignment history provide full transparency for dispute resolution and compliance.

The platform transforms billing from a monthly burden into a reliable, automated pipeline — reducing errors, accelerating invoice delivery, and giving finance teams the visibility they need to manage client engagements with confidence.
