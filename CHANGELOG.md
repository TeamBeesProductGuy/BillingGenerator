# Changelog

All notable changes to the TeamBees Billing Engine are documented here.

---

## [1.4.0] - 2026-03-19

### Phase 2: Billing Engine Enhancements & Strict Workflow

#### Strict Workflow Enforcement (Client → SOW → PO → Rate Card → Billing)
- `sow_id` now required on PO creation (validators, controllers, frontend)
- `po_id` now required on Rate Card creation (validators, controllers, frontend)
- Cross-validation: SOW/PO must exist, belong to same client, and be Active
- `po_number` column required in Excel rate card uploads
- SOW inherited on PO renewal via `renew_po()` RPC function
- Database triggers: `trg_po_sow_client` (PO-SOW client match), `trg_rate_card_po_client` (RC-PO client match)
- Frontend: required attributes, JS guards, placeholder text updates on PO and Rate Card forms

#### Billing Calculation Enhancements
- **Date of Reporting pro-rata**: If `date_of_reporting` falls in billing month, bill only from that date to month-end
- **Future reporting skip**: Employees reporting after the billing month are skipped with an error
- **Chargeable days cap**: Maximum 30 chargeable days per employee (prevents over-billing)
- **Negative billing prevention**: Chargeable days floor at 0

#### Excel Output Enhancements
- Added `Date of Reporting` and `Effective Days` columns to Billing_Working sheet
- Added `Manager_Summary` sheet: grouped by reporting manager with employee count, total rate, total invoice
- Output now has 3 sheets: Billing_Working, Manager_Summary, Error_Report

#### Bug Fixes
- Fixed rate card Excel upload response: now reports `validRecords.length` (actual imports) instead of `records.length`

---

## [1.3.0] - 2026-03-18

### GST Removal & PO Auto-Consumption

#### Billing - GST Removed
- Removed GST/tax from billing calculation entirely (`billing.service.js`)
- Removed `gst_percent`, `gst_amount`, `total_with_gst` from billing runs and items (`billing.model.js`)
- Removed GST columns from billing Excel output (`excelWriter.service.js`)
- Removed `defaultGstPercent` from environment config (`config/env.js`)
- Removed GST column from dashboard billing history (`dashboard.html`, `dashboard.js`)
- Updated `supabase_schema.sql` to remove GST columns from `billing_runs` and `billing_items`

#### PO Auto-Consumption from Billing
- Billing generation now auto-deducts invoice amounts from linked POs via `consume_po` RPC
- Added `autoConsumePOs()` shared helper in `billing.controller.js` - groups billing amounts by PO and records consumption
- Both billing paths (file upload and database) now auto-consume POs
- Added `resolvePoNumbers()` function to resolve `po_number` strings from Excel uploads to `po_id` integers via database lookup
- PO consumption logged with billing run reference for full audit trail
- PO auto-marked as "Exhausted" when `consumed_value >= po_value`

#### PO Detail Modal Improvements
- PO detail view now shows linked employee list (emp_code, name, manager, monthly rate) fetched from `rate_cards` table
- `purchaseOrder.model.js` `findById` now returns both `consumptionLog` and `linkedEmployees` arrays

#### Sample Excel Updates
- Updated sample rate card (`TestRateCard.xlsx`) with `po_number` and `date_of_reporting` columns
- Updated `samples.routes.js` to generate sample rate card with all 9 columns
- Added `date_of_reporting` alias and date parsing in `excelParser.service.js`

#### Documentation
- Rewrote `DOCUMENTATION.md` to reflect current Supabase architecture, auth, SOW, PO consumption pipeline
- Updated `CHANGELOG.md` with all recent changes
- Updated `.env.example` to remove legacy SQLite/GST vars and add Supabase vars
- Created `README.md` with quick-start guide

#### Database Migration Required
```sql
-- Run in Supabase SQL Editor to remove GST columns:
ALTER TABLE billing_runs DROP COLUMN IF EXISTS gst_percent;
ALTER TABLE billing_runs DROP COLUMN IF EXISTS gst_amount;
ALTER TABLE billing_runs DROP COLUMN IF EXISTS total_with_gst;
ALTER TABLE billing_items DROP COLUMN IF EXISTS gst_percent;
ALTER TABLE billing_items DROP COLUMN IF EXISTS gst_amount;
ALTER TABLE billing_items DROP COLUMN IF EXISTS total_with_gst;
```

---

## [1.2.0] - 2026-03-18

### Phase 1: Admin Control Features

#### Client Management
- Added `industry` field to clients (validator, model, controller, HTML table + modal)

#### Quote Enhancements
- Added `location` field per quote line item (validator, model, controller, Excel download, HTML + JS)
- Enforced quote status transitions: Draft -> Sent -> Accepted/Rejected, Rejected -> Draft
- Frontend now shows only valid status actions in the dropdown menu per current status
- Added PDF export for quotes using PDFKit (new route `GET /api/quotes/:id/pdf`)
- PDF includes company header, quote info, items table with location, subtotal/tax/total, notes

#### Statement of Work (SOW) - New Feature
- Full CRUD backend: model, validator, controller, routes (`/api/sows`)
- SOW number auto-generated as `SOW-YYYYMMDD-NNN`
- Status flow: Draft -> Active -> Expired/Terminated
- SOW items (role/position, quantity, amount) with parent-child relationship
- Frontend: SOW page with table, search/filter, create/edit modal with dynamic items
- Frontend: SOW detail view modal
- Sidebar link added (icon: `description`)

#### Purchase Order Enhancements
- Added `sow_id` foreign key linking POs to SOWs
- SOW# column in PO table and SOW dropdown in PO create/edit modal
- Added Edit button in PO table actions (opens pre-filled modal for editing)
- SOW dropdown in quote convert-to-PO modal

#### Employee (Rate Card) Enhancements
- Added `date_of_reporting` field (validator, model, controller, HTML table + modal, Excel export)
- Employee-PO assignment history table (`employee_po_history`) - logged on PO renewal

#### UI/UX Improvements
- Fixed page scrolling: `min-h-screen` → `h-screen` on body, added `min-h-0` to main
- Added `styled-scrollbar` CSS class replacing `no-scrollbar`
- Fixed input text colors: added `!important` overrides for all input types in dark theme
- Fixed autofill styling for dark theme (WebKit autofill overrides)
- Added custom select arrows, date picker icons, file input styling
- Added `backdrop-blur-sm` to all 12 modal overlays
- Added `max-h-[90vh] overflow-y-auto` to rate card modal

#### Database Schema Changes
- `ALTER TABLE clients ADD COLUMN industry TEXT`
- `ALTER TABLE quote_items ADD COLUMN location TEXT`
- `ALTER TABLE rate_cards ADD COLUMN date_of_reporting TEXT`
- `CREATE TABLE sows` + `sow_items` + `sows_view`
- `ALTER TABLE purchase_orders ADD COLUMN sow_id REFERENCES sows(id)`
- Updated `purchase_orders_view` with `sow_number` via LEFT JOIN
- `CREATE TABLE employee_po_history`
- Updated `renew_po()` function to log assignment history before migrating employees
- Updated `get_dashboard_stats()` to include `activeSOWs` count

---

## [1.1.0] - 2026-03-17

### Link Employees (Rate Cards) to Purchase Orders
- Added `po_id` foreign key on `rate_cards` table linking employees to specific POs
- Updated `rate_cards_view` to include `po_number` via LEFT JOIN
- Updated `purchase_orders_view` to include `linked_employees` count
- Updated `renew_po` function to auto-migrate employees from old PO to new PO
- Added `check_rate_card_po_client` trigger ensuring PO belongs to the same client
- Backend: `po_id` support in rate card create/update/bulkCreate, new `findByPoId` method
- Backend: PO detail endpoint now returns linked employees and consumption log
- Backend: Billing from DB auto-consumes from employee-assigned POs
- Backend: Excel upload resolves `po_number` to `po_id`
- Frontend: PO dropdown in rate card create/edit modal (loads Active POs for selected client)
- Frontend: "PO#" column in rate cards table
- Frontend: "Employees" count column in purchase orders table
- Frontend: Linked employees section in PO detail modal

### UI/UX Bug Fixes
- **Auth on downloads (critical)**: All download links (`<a href>`) replaced with `downloadFile()` helper that sends Bearer auth token via `fetch()`. Previously every download returned 401 Unauthorized. Affected: dashboard billing history, billing results + history, quotes, rate cards export, attendance sample.
- **Modal improvements**: Centralized `openModal()`/`closeModal()` in app.js with body scroll lock (`body.modal-open`), Escape key to close topmost modal, backdrop click to close.
- **Toast notifications**: Capped at 5 visible (oldest auto-dismissed), message body now XSS-safe via `escapeHtml()`.
- **Confirm dialog**: Now supports Escape key to cancel.
- **Table search**: Added 200ms debounce to prevent excessive filtering on every keystroke.
- **CSS additions**: `.fade-in` page transition animation, shared `.tab-btn` styles for billing/attendance tabs, `body.modal-open` scroll lock, button `:focus-visible` outlines.
- **Removed duplicate code**: Local `openModal`/`closeModal` definitions removed from clients.js, quotes.js, rate-cards.js, purchase-orders.js — all now use the global versions from app.js.
- **Fixed tab pane class corruption**: Reverted incorrectly applied `tab-btn` class on billing and attendance tab pane `<div>` elements.
- **Chart.js load failure**: Dashboard now shows a toast warning instead of silently failing.

---

## [1.0.0] - 2026-03-16

### Supabase Migration
- Migrated from better-sqlite3 to Supabase PostgreSQL
- Added Supabase Auth (JWT-based) with login/signup UI
- Backend uses `service_role` key; frontend uses `anon` key for auth only
- All API routes require authentication via `requireAuth` middleware
- Frontend sends `Authorization: Bearer <token>` header via `apiCall()`

### Initial Features
- Client management (CRUD)
- Rate card management (CRUD + Excel upload)
- Attendance tracking (manual entry + Excel upload + summary)
- Billing generation (from Excel files or from database)
- Billing history with Excel download
- Purchase order management (create, consume, renew, alerts)
- Quotes management (create, edit, status workflow, convert to PO, Excel download)
- Dashboard with stats, revenue chart, PO alerts, billing history
- Dark mode toggle
- Responsive sidebar with mobile overlay
- Stitch design system (Tailwind CSS + Material Symbols)
