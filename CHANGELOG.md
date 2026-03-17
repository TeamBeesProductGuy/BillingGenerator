# Changelog

All notable changes to the TeamBees Billing Engine are documented here.

---

## [Unreleased] - 2026-03-17

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
