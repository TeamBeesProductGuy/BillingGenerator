# TeamBees Billing Generator Documentation

## 1. Overview

TeamBees Billing Generator is a Node.js and Express application that centralizes contractual billing, service-request approvals, commercial document management, purchase order tracking, and permanent hiring invoice follow-up.

The application serves an authenticated browser-based workspace from `public/` and stores business data in Supabase PostgreSQL with Supabase Auth. It replaces spreadsheet-heavy billing operations with a controlled workflow where client records, quotes, SOWs, purchase orders, rate cards, attendance, billing runs, approval decisions, and reminder activity remain connected.

This document is the repository source of truth for product scope, architecture, setup, API surface, operating controls, and deployment notes.

## 2. Business Problem

Many billing teams run monthly invoicing through disconnected Excel files, email approvals, manually updated purchase order trackers, and separate follow-up lists. That creates operational risk:

- rate cards and attendance can drift out of sync
- SOW and PO references are difficult to validate before billing
- invoice amounts are recalculated manually every month
- PO consumption can be updated before business approval is complete
- manager approvals are hard to audit when they live only in email
- permanent hiring invoices need repeated manual reminder tracking
- leadership has limited visibility into billing status, PO risk, and follow-up activity

The system addresses these gaps by turning billing into a structured service-request lifecycle.

## 3. Solution Summary

TeamBees Billing Generator provides one operational workspace for:

- contractual client master data
- permanent hiring client master data
- quote creation, amendment, document download, PDF export, and SOW conversion
- SOW lifecycle management with document upload and PO linking
- purchase order tracking, status changes, renewal, association lookup, and consumption
- rate card management with Excel import/export and billing controls
- attendance entry, upload, monthly summaries, and employee lookup
- service request generation from uploaded Excel files or stored database records
- run-level and manager-level approval workflows
- item-level service request corrections before approval
- automatic PO consumption only after acceptance
- manager approval draft email creation through Microsoft Graph
- permanent hiring client, order, invoice, payment, and reminder tracking
- dashboard metrics, PO alerts, tracker export, and activity logs

## 4. Business Scope

### 4.1 Client Types

The application supports two important client operating models:

- **Contractual clients** - clients billed through rate cards, attendance, SOWs, purchase orders, service requests, manager approvals, and PO consumption.
- **Permanent hiring clients** - clients handled through permanent hiring orders, invoice sent tracking, payment status, reminder dates, reminder emails, closing, and follow-up extension.

These workflows are separated in the UI and API so each business process can keep the right fields, controls, and follow-up behavior, while still living inside one TeamBees operations system.

### 4.2 Contractual Billing

The contractual workflow covers:

- clients
- quotes
- statements of work
- purchase orders
- rate cards
- attendance
- service request generation
- service request review, correction, acceptance, rejection, and partial acceptance
- purchase order consumption after approval

### 4.3 Permanent Hiring Operations

The permanent workflow covers:

- permanent clients
- permanent orders
- open reminders
- invoice sent tracking
- payment status tracking
- reminder email sending
- reminder closing and extension

### 4.4 Operational Goals

The product is designed to:

- reduce manual billing errors
- keep commercial documents connected from quote to SOW to PO to invoice
- make attendance and rate-card mismatches visible before billing proceeds
- prevent premature PO consumption
- support reporting-manager approval slices
- provide downloadable working files and tracker exports
- give operations and finance teams a reliable audit trail

## 5. Current Application Flow

### 5.1 Authentication

Authentication is handled by Supabase Auth.

1. The user signs in through the browser UI.
2. The frontend receives a Supabase session.
3. API requests include `Authorization: Bearer <token>`.
4. Backend auth middleware validates the token.
5. Protected API handlers use a request-scoped Supabase client.

All `/api` routes are protected. `/health` remains public for uptime checks.

### 5.2 Service Request Generation

Billing runs are called service requests in the UI. A run can be generated from:

- uploaded Rate Card and Attendance Excel files
- stored Supabase rate-card and attendance records

The generator validates the billing month, resolves client, SOW, and PO relationships where possible, cross-checks rate cards against attendance, calculates billable days or hours, writes a billing workbook, stores run details, and records warnings/errors.

Fatal errors can create a blocked run with an error report. Non-fatal warnings remain attached to the run while allowing review.

### 5.3 Calculation Rules

The billing service currently supports:

- month divisor from `BILLING_DIVISOR` or actual days in month
- charging-date prorating
- allowed leave adjustment
- attendance-based present day calculation
- half-day and day-level leave unit handling
- SOW role duration windows
- billing pause windows
- billing disable-from dates
- inactive SOW and inactive PO exclusion
- no-invoice and inactive billing flags
- SGTC-specific hour-based prorating using 170 monthly hours and 8.5 hours per present day

### 5.4 Review and Approval

Generated service requests remain pending until reviewed.

Before approval, operators can:

- open run details
- review calculated rows and error reports
- adjust item-level attendance values
- assign missing POs
- download the complete workbook
- download individual worksheets
- create reporting-manager approval draft emails

Approval behavior:

- rejected runs mark pending items as rejected
- accepted items consume linked PO value
- approval can be scoped by reporting manager
- mixed accepted/rejected state becomes partially accepted
- approved items cannot be edited afterward

### 5.5 Purchase Order Consumption

PO consumption is intentionally delayed until service request acceptance. This protects PO balances from changing while a run is still pending, under correction, or rejected.

Consumption is grouped by PO and recorded against the billing run so duplicate consumption for the same run can be avoided.

### 5.6 Permanent Reminder Flow

Permanent reminders can be managed manually through the UI and API. When Microsoft Graph configuration is present and the scheduler is enabled:

1. Due reminders are selected.
2. Emails are sent through Graph.
3. Reminder records are updated with sent or failed state.
4. Operators can update email recipients, invoice sent status, payment status, close reminders, or extend follow-up dates.

### 5.7 Contractual Client Workflow

The contractual client workflow moves through:

1. Create or maintain the contractual client.
2. Prepare quotes, amendments, downloads, PDFs, and SOW conversion where needed.
3. Maintain SOWs, linked documents, purchase orders, rate cards, and reporting managers.
4. Upload or maintain attendance.
5. Generate a monthly service request from Excel files or stored database records.
6. Review validation warnings and errors.
7. Correct pending service request rows and assign missing POs if required.
8. Create manager approval drafts or approve/reject by reporting manager or full run.
9. Consume PO value only after accepted items are approved.
10. Download workbooks, worksheets, and tracker outputs for finance evidence.

### 5.8 Permanent Hiring Client Workflow

The permanent hiring workflow moves through:

1. Create or maintain the permanent client.
2. Create permanent orders with the required business and candidate details.
3. Track invoice sent state for each follow-up item.
4. Track payment status and due reminder state.
5. Update reminder recipients when needed.
6. Send reminder email through Microsoft Graph when configured.
7. Extend reminder dates for continued follow-up.
8. Close reminders once payment or follow-up is complete.
9. Use dashboard, reminder lists, and activity records for operational visibility.

## 6. Feature Areas

### 6.1 Dashboard

The dashboard provides operational visibility with summary statistics, PO alerts, recent activity, and tracker export generation.

### 6.2 Client Management

The system has dedicated support for both contractual and permanent client workflows.

Contractual client records provide the common directory used across quotes, SOWs, purchase orders, rate cards, attendance, and service requests.

Permanent client records support the permanent hiring workflow, including permanent orders, invoice tracking, payment status, and reminder follow-up.

### 6.3 Quotes

Quotes support lifecycle management, amendments, document download, PDF export, status updates, deletion, and conversion into SOW records.

### 6.4 Statements of Work

SOWs manage work agreements, status, amendments, item duration data, linked documents, PO document linking, and association lookup.

### 6.5 Purchase Orders

Purchase orders track PO number, value, consumed value, status, linked client/SOW, employee associations, alerts, renewal, status updates, and manual or approval-driven consumption.

### 6.6 Rate Cards

Rate cards define employee billing data including client, SOW, PO, employee code/name, reporting manager, service description, monthly rate, leave allowance, reporting date, billing flags, pause/disable windows, and Excel import/export.

### 6.7 Attendance

Attendance can be entered manually, submitted in bulk, uploaded from Excel, summarized by month, queried by employee, and deleted by filter or month.

### 6.8 Service Requests

Service requests cover monthly billing generation, run history, detail review, downloadable Excel outputs, item correction, manager approval draft creation, acceptance, rejection, partial acceptance, PO assignment, and post-approval PO consumption.

### 6.9 Permanent Modules

Permanent client, order, and reminder modules manage permanent hiring follow-up from client/order creation through invoice sent state, payment status, reminder emails, closing, and extensions.

### 6.10 Activity Logs

Activity logs record key operational actions such as service request generation and manager draft creation for audit visibility.

### 6.11 Sample Exports

The app provides downloadable sample Excel templates for rate cards and attendance.

## 7. Technical Architecture

### 7.1 Stack

- Node.js runtime
- Express web server
- Supabase PostgreSQL
- Supabase Auth
- vanilla JavaScript frontend
- Tailwind CDN and Material Symbols in the UI
- ExcelJS for workbook generation
- PDFKit for quote PDF output
- Microsoft Graph for reminder and manager draft mail flows
- Joi validation
- Helmet, CORS, Morgan, and Express rate limiting

### 7.2 Frontend

The frontend is a browser SPA served by Express.

Key characteristics:

- no separate frontend build pipeline
- `public/index.html` provides the shell
- page fragments live in `public/pages/`
- page scripts live in `public/js/`
- shared styling lives in `public/css/styles.css`
- authenticated navigation loads pages by hash route

Current UI routes:

- `dashboard`
- `billing` / Service Requests
- `clients`
- `rate-cards`
- `attendance`
- `quotes`
- `sows`
- `purchase-orders`
- `orders`
- `reminders`
- `activity-logs`

### 7.3 Backend

The backend is organized into:

- `routes/` for API route definitions
- `controllers/` for request orchestration
- `services/` for billing, Excel, document, mail, validation, scheduler, and logging logic
- `models/` for Supabase data access
- `validators/` for Joi schemas
- `middleware/` for auth, validation, upload, error handling, and async wrapping
- `config/` for environment and database setup

### 7.4 Database

The data layer is Supabase PostgreSQL.

The repository includes:

- `database/supabase_schema.sql` for the bootstrap schema
- `database/schema.sql` for supporting schema material
- `database/migrations/` for incremental changes
- `database/seed.js` for sample data

Recent migrations cover user isolation, permanent billing fields, reminders, activity logs, manager-level approval, SOW item duration, inactive SOW/PO billing behavior, and client/SOW/PO associations.

## 8. Repository Structure

- `app.js` - Express app setup, middleware, API mount, static serving, health check, SPA fallback
- `server.js` - server bootstrap
- `config/` - runtime and database configuration
- `controllers/` - API request handlers
- `database/` - schema, migrations, and seed script
- `middleware/` - auth, validation, upload, error, and async helpers
- `models/` - Supabase model layer
- `public/` - SPA pages, scripts, CSS, images, and fonts
- `routes/` - API route definitions
- `services/` - billing calculations, Excel writing/parsing, mail, reminders, PO tracking, activity logging
- `validators/` - request validation schemas
- `uploads/` - uploaded source files
- `output/` - generated workbooks and documents

## 9. Configuration

Environment values are loaded from `.env`.

Supported configuration includes:

- `PORT`
- `NODE_ENV`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPLOAD_DIR`
- `OUTPUT_DIR`
- `LOG_LEVEL`
- `MAX_FILE_SIZE`
- `CORS_ORIGINS`
- `BILLING_DIVISOR`
- `MS_TENANT_ID`
- `MS_CLIENT_ID`
- `MS_CLIENT_SECRET`
- `MS_SENDER_UPN`
- `MS_GRAPH_SCOPE`
- `REMINDER_PRIMARY_RECIPIENTS`
- `REMINDER_SECONDARY_RECIPIENTS`
- `REMINDER_SECOND_EMAIL_MODE`
- `REMINDER_SAVE_TO_SENT_ITEMS`
- `REMINDER_FREQUENCY_HOURS`
- `REMINDER_SCHEDULER_ENABLED`

Runtime notes:

- `PORT` defaults to `3000`
- `NODE_ENV` defaults to `development`
- upload and output folders resolve relative to the repository by default
- API request JSON/body size is limited to `1mb`
- upload size defaults to 10 MB
- API rate limit is 100 requests per minute per client
- CORS defaults to open in development if no allowlist is configured
- production CORS defaults to same-origin unless `CORS_ORIGINS` is set
- the reminder scheduler starts only when enabled and Graph configuration is complete

## 10. Setup and Local Run

### 10.1 Install Dependencies

```bash
npm install
```

### 10.2 Configure Environment

1. Create `.env`.
2. Add Supabase project values.
3. Add Microsoft Graph values if email flows should run.
4. Set upload/output directories and CORS values as needed.

### 10.3 Apply Database Schema

Apply `database/supabase_schema.sql` in Supabase, then apply relevant files in `database/migrations/` in order.

### 10.4 Start the App

Development:

```bash
npm run dev
```

Production-style:

```bash
npm start
```

### 10.5 Seed Sample Data

```bash
npm run db:seed
```

### 10.6 Code Quality

```bash
npm run lint
npm run format
```

## 11. API Reference

### 11.1 Health

- `GET /health`

### 11.2 Dashboard

- `GET /api/dashboard/stats`
- `GET /api/dashboard/tracker/export`

### 11.3 Service Requests

- `POST /api/billing/generate`
- `POST /api/billing/generate-from-db`
- `GET /api/billing/runs`
- `GET /api/billing/runs/:id`
- `PATCH /api/billing/runs/:id/items/:itemId`
- `POST /api/billing/runs/:id/manager-draft`
- `POST /api/billing/runs/:id/decision`
- `GET /api/billing/runs/:id/download`
- `GET /api/billing/runs/:id/download/:worksheet`

Valid worksheet downloads:

- `billing_working`
- `manager_summary`
- `error_report`

### 11.4 Clients

- `GET /api/clients`
- `GET /api/clients/:id`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`

### 11.5 Rate Cards

- `GET /api/rate-cards`
- `GET /api/rate-cards/export`
- `GET /api/rate-cards/:id`
- `POST /api/rate-cards`
- `POST /api/rate-cards/upload`
- `PUT /api/rate-cards/:id`
- `PATCH /api/rate-cards/:id/leaves-allowed`
- `DELETE /api/rate-cards/:id`

### 11.6 Attendance

- `GET /api/attendance`
- `GET /api/attendance/summary`
- `GET /api/attendance/employee/:empCode`
- `POST /api/attendance`
- `POST /api/attendance/bulk`
- `POST /api/attendance/upload`
- `DELETE /api/attendance`
- `DELETE /api/attendance/by-month`

### 11.7 Quotes

- `GET /api/quotes`
- `GET /api/quotes/amendments`
- `GET /api/quotes/:id`
- `POST /api/quotes`
- `PUT /api/quotes/:id`
- `POST /api/quotes/:id/amend`
- `PATCH /api/quotes/:id/status`
- `DELETE /api/quotes/:id`
- `GET /api/quotes/:id/download`
- `GET /api/quotes/:id/pdf`
- `POST /api/quotes/:id/convert-to-sow`

### 11.8 SOWs

- `GET /api/sows`
- `GET /api/sows/documents`
- `GET /api/sows/documents/download`
- `DELETE /api/sows/documents`
- `POST /api/sows/documents/upload`
- `POST /api/sows/documents/link-po`
- `GET /api/sows/:id/associations`
- `GET /api/sows/:id`
- `POST /api/sows`
- `POST /api/sows/:id/amend`
- `PUT /api/sows/:id`
- `PATCH /api/sows/:id/status`
- `DELETE /api/sows/:id`

### 11.9 Purchase Orders

- `GET /api/purchase-orders/alerts`
- `GET /api/purchase-orders`
- `GET /api/purchase-orders/:id/employees`
- `GET /api/purchase-orders/:id/associations`
- `GET /api/purchase-orders/:id`
- `POST /api/purchase-orders`
- `PUT /api/purchase-orders/:id`
- `PATCH /api/purchase-orders/:id/status`
- `PATCH /api/purchase-orders/:id/consume`
- `PATCH /api/purchase-orders/:id/renew`

### 11.10 Permanent Modules

Canonical routes:

- `GET /api/permanent/clients`
- `GET /api/permanent/clients/:id`
- `POST /api/permanent/clients`
- `PUT /api/permanent/clients/:id`
- `DELETE /api/permanent/clients/:id`
- `GET /api/permanent/orders`
- `GET /api/permanent/orders/:id`
- `POST /api/permanent/orders`
- `PUT /api/permanent/orders/:id`
- `DELETE /api/permanent/orders/:id`
- `GET /api/permanent/reminders`
- `PATCH /api/permanent/reminders/:id/emails`
- `PATCH /api/permanent/reminders/:id/payment-status`
- `PATCH /api/permanent/reminders/:id/invoice-sent`
- `POST /api/permanent/reminders/:id/send-mail`
- `PATCH /api/permanent/reminders/:id/close`
- `PATCH /api/permanent/reminders/:id/extend`

Backward-compatible aliases:

- `/api/clients/permanent`
- `/api/orders/permanent`
- `/api/reminders/permanent`

### 11.11 Activity Logs

- `GET /api/activity-logs`

### 11.12 Samples

- `GET /api/samples/rate-card`
- `GET /api/samples/attendance`

## 12. Data and File Handling

### 12.1 Uploads

Uploaded files are used for:

- service request source files
- rate card import
- attendance import
- linked SOW and PO documents

### 12.2 Generated Output

Generated output includes:

- full service request workbooks
- individual service request worksheets
- quote documents
- quote PDFs
- dashboard tracker exports

### 12.3 File Handling Notes

- upload size limits are enforced by middleware
- generated files are written to the configured output directory
- upload and output directories are configurable
- this repository does not include object-storage integration

## 13. Security and Operational Controls

The application includes:

- Helmet security headers
- environment-aware CORS
- API rate limiting
- Supabase JWT validation
- request-scoped Supabase clients
- Joi request validation
- centralized error responses
- upload limits
- protected `/api` routes
- public `/health` endpoint
- graceful reminder scheduler startup/shutdown behavior

## 14. Deployment and Hosting

The repository is hosting-agnostic and does not include Docker, Kubernetes, or platform-specific deployment manifests.

The current production model is a Node.js server hosted on AWS Lightsail with Supabase for authentication and PostgreSQL storage.

Typical deployment checklist:

1. Deploy the latest application code.
2. Install or refresh dependencies.
3. Apply database schema and migrations.
4. Confirm environment variables.
5. Restart the Node.js process.
6. Check `/health`.
7. Validate login, dashboard, service request generation, and at least one protected API.

## 15. Client Presentation Narrative

The client-facing story should position the platform as an operational control layer for billing:

- Problem: contractual billing and permanent hiring follow-up are spread across spreadsheets, emails, documents, and manual trackers.
- Solution: a connected billing generator that keeps contractual clients, permanent clients, commercial documents, attendance, approvals, reminders, and PO consumption in one workflow.
- Value: fewer errors, faster monthly billing, stronger audit visibility, controlled approvals, and clearer finance operations.
- Differentiator: PO value is consumed only after approval, with manager-level review and downloadable evidence.
- Outcome: TeamBees can present contractual billing status, permanent hiring follow-up, commercial linkage, approval state, and finance actions confidently from one system.

## 16. Maintainer Notes

- Keep `DOCUMENTATION.md` as the long-form source of truth.
- Keep `README.md` concise and pointed to this document.
- Update this document when route behavior, billing calculations, database workflow, deployment assumptions, or client-facing features change.

## 17. Summary

TeamBees Billing Generator is a lightweight but complete billing operations platform. It combines authenticated data management, Excel-based generation, approval controls, PO tracking, commercial document workflows, permanent hiring follow-up, reminders, activity logs, and exports in a single Express and Supabase application.
