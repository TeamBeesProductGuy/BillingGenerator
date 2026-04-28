# TeamBees Billing Engine Documentation

## 1. Overview

TeamBees Billing Engine is a Node.js and Express application for billing operations, service-request workflows, and permanent hiring follow-up. It serves a browser-based single-page application from the `public/` directory and uses Supabase for authentication and PostgreSQL-backed data storage.

The product is designed to replace fragmented spreadsheet and email-based processes with a controlled system that can:

- manage clients and commercial documents
- generate and review billing runs
- track purchase order consumption
- support permanent hiring reminders and invoice follow-up
- export business-friendly Excel workbooks and document outputs

This document is the canonical reference for the repository.

## 2. Business Scope

### 2.1 Contractual billing operations

The contractual side of the application covers:

- clients
- quotes
- statements of work
- purchase orders
- rate cards
- attendance
- billing generation and approval

### 2.2 Permanent hiring operations

The permanent workflow covers:

- permanent clients
- permanent orders
- open reminders
- invoice sent tracking
- payment status tracking
- reminder email sending

### 2.3 Operational goals

The system aims to:

- reduce manual billing errors
- keep commercial documents connected
- prevent premature purchase order consumption
- give finance and operations teams better visibility
- support structured follow-up for permanent hiring invoices

## 3. Requirements

### 3.1 Runtime requirements

- Node.js 18 or newer
- npm
- A Supabase project
- Microsoft Graph credentials if reminder email sending is enabled

### 3.2 Database requirements

- The schema in `database/supabase_schema.sql` must be applied in Supabase
- Any later migration files in `database/migrations/` must also be applied
- The app expects the required tables, views, and stored procedures to exist

### 3.3 Environment requirements

The application expects configuration for:

- server port and runtime mode
- Supabase connection details
- upload and output directories
- request logging and file upload limits
- CORS configuration
- billing divisor behavior
- Microsoft Graph mail settings

## 4. Application Flow

### 4.1 Authentication flow

Authentication is handled by Supabase Auth.

In practice:

1. The user signs in in the browser UI.
2. The frontend obtains a Supabase session token.
3. API requests include `Authorization: Bearer <token>`.
4. The backend validates the token before processing protected requests.

All API routes are protected by auth middleware except the health check endpoint.

### 4.2 Request flow

The backend uses a request-scoped Supabase client:

- the service role client is used for server initialization and health checks
- a request-specific client is created from the user bearer token
- the token-scoped client is used while handling authenticated requests

This keeps API access aligned with the signed-in user.

### 4.3 Billing flow

Billing runs can start from:

- uploaded Excel files
- database records already stored in Supabase

The application generates billing output, stores the run, and supports a review decision. Purchase order consumption is only applied after the billing decision step.

### 4.4 Reminder flow

Permanent reminders are processed through the application and, when configured, through Microsoft Graph:

1. Due reminders are found in Supabase.
2. The scheduler sends reminder emails.
3. The reminder records are updated with sent or failed status.
4. Operators can also update reminder state manually through the UI and API.

## 5. Feature Areas

### 5.1 Dashboard

The dashboard provides high-level operational visibility, including:

- summary statistics
- recent billing activity
- purchase order alerts
- tracker export generation

### 5.2 Clients

Client records store the business entities used across contractual and permanent workflows.

### 5.3 Quotes

Quotes support lifecycle management, document download, PDF export, amendment flow, and conversion to SOW records.

### 5.4 Statements of work

SOWs provide structured work agreements and support document linking, amendments, status updates, and related document management.

### 5.5 Purchase orders

Purchase orders track commercial value, consumption, renewals, alerting, and linked employee data.

### 5.6 Rate cards

Rate cards define employee billing details, including reporting manager, monthly rate, leave allowance, reporting date, and PO linkage.

### 5.7 Attendance

Attendance can be entered manually, uploaded in bulk, or imported from Excel.

### 5.8 Billing

Billing supports:

- file-based generation
- database-based generation
- run history
- download of generated output
- run-level acceptance or rejection

### 5.9 Permanent modules

Permanent client, order, and reminder modules manage the follow-up workflow for invoice and payment tracking.

### 5.10 Sample exports

The application includes sample Excel downloads for:

- rate cards
- attendance

## 6. Technical Architecture

### 6.1 Stack summary

- Node.js runtime
- Express web server
- Supabase PostgreSQL
- Supabase Auth
- vanilla JavaScript frontend
- Tailwind CDN for UI styling
- ExcelJS for workbook generation
- PDFKit for quote PDF output
- Microsoft Graph for reminder mail

### 6.2 Frontend architecture

The frontend is a browser SPA served directly by the Express server.

Key characteristics:

- no separate frontend build step in the repository
- page modules are loaded from `public/pages/` and `public/js/`
- the UI shell is served from `public/index.html`
- assets such as Tailwind, fonts, and Chart.js are loaded from CDN

### 6.3 Backend architecture

The backend is structured as:

- routes for API entry points
- controllers for request orchestration
- services for business logic and integrations
- models for database access
- middleware for auth, validation, upload, and error handling

### 6.4 Database architecture

The data layer lives in Supabase PostgreSQL.

The repository includes:

- `database/supabase_schema.sql` for the bootstrap schema
- `database/schema.sql` for legacy or supporting schema material
- `database/migrations/` for incremental changes
- `database/seed.js` for sample data

## 7. Repository Structure

- `config/` - runtime and database configuration
- `controllers/` - request handlers
- `database/` - schema, migrations, and seed scripts
- `middleware/` - auth, validation, upload, and error handling
- `models/` - Supabase data access
- `public/` - frontend pages, scripts, styles, images, and fonts
- `routes/` - API route definitions
- `services/` - Excel, document, mail, and scheduler logic
- `validators/` - Joi validation rules
- `uploads/` - uploaded source files
- `output/` - generated output files

## 8. Configuration

### 8.1 `.env.example`

The example environment file documents the expected configuration:

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
- Microsoft Graph mail settings used by the reminder scheduler

### 8.2 Environment behavior

Important runtime notes:

- `PORT` defaults to `3000`
- upload and output directories are resolved relative to the repository unless overridden
- CORS can be allowlisted or left open in development
- the reminder scheduler only starts when Graph configuration is complete

## 9. Setup and Local Run

### 9.1 Install dependencies

```bash
npm install
```

### 9.2 Configure the environment

1. Copy `.env.example` to `.env`
2. Fill in the required Supabase values
3. Add Microsoft Graph values if reminder mail should run

### 9.3 Apply the database schema

Run `database/supabase_schema.sql` in the Supabase SQL editor, then apply any relevant migrations in `database/migrations/`.

### 9.4 Start the application

```bash
npm run dev
```

For a production-style start:

```bash
npm start
```

### 9.5 Seed sample data

```bash
npm run db:seed
```

### 9.6 Code quality commands

- `npm run lint`
- `npm run format`

## 10. API Reference

### 10.1 Health

- `GET /health`

### 10.2 Dashboard

- `GET /api/dashboard/stats`
- `GET /api/dashboard/tracker/export`

### 10.3 Billing

- `POST /api/billing/generate`
- `POST /api/billing/generate-from-db`
- `GET /api/billing/runs`
- `GET /api/billing/runs/:id`
- `POST /api/billing/runs/:id/decision`
- `GET /api/billing/runs/:id/download`
- `GET /api/billing/runs/:id/download/:worksheet`

### 10.4 Clients

- `GET /api/clients`
- `GET /api/clients/:id`
- `POST /api/clients`
- `PUT /api/clients/:id`
- `DELETE /api/clients/:id`

### 10.5 Rate cards

- `GET /api/rate-cards`
- `GET /api/rate-cards/export`
- `GET /api/rate-cards/:id`
- `POST /api/rate-cards`
- `POST /api/rate-cards/upload`
- `PUT /api/rate-cards/:id`
- `PATCH /api/rate-cards/:id/leaves-allowed`
- `DELETE /api/rate-cards/:id`

### 10.6 Attendance

- `GET /api/attendance`
- `GET /api/attendance/summary`
- `GET /api/attendance/employee/:empCode`
- `POST /api/attendance`
- `POST /api/attendance/bulk`
- `POST /api/attendance/upload`
- `DELETE /api/attendance`
- `DELETE /api/attendance/by-month`

### 10.7 Quotes

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

### 10.8 SOWs

- `GET /api/sows`
- `GET /api/sows/documents`
- `GET /api/sows/documents/download`
- `DELETE /api/sows/documents`
- `POST /api/sows/documents/upload`
- `POST /api/sows/documents/link-po`
- `GET /api/sows/:id`
- `POST /api/sows`
- `POST /api/sows/:id/amend`
- `PUT /api/sows/:id`
- `PATCH /api/sows/:id/status`
- `DELETE /api/sows/:id`

### 10.9 Purchase orders

- `GET /api/purchase-orders/alerts`
- `GET /api/purchase-orders`
- `GET /api/purchase-orders/:id/employees`
- `GET /api/purchase-orders/:id`
- `POST /api/purchase-orders`
- `PUT /api/purchase-orders/:id`
- `PATCH /api/purchase-orders/:id/consume`
- `PATCH /api/purchase-orders/:id/renew`

### 10.10 Permanent modules

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

Backward-compatible aliases also exist for:

- `/api/clients/permanent`
- `/api/orders/permanent`
- `/api/reminders/permanent`

### 10.11 Samples

- `GET /api/samples/rate-card`
- `GET /api/samples/attendance`

## 11. Data and Files

### 11.1 Uploads

The application handles uploaded files for:

- billing source inputs
- rate card imports
- attendance imports
- linked commercial documents

### 11.2 Generated output

Generated files are written to the configured output directory and include:

- billing workbooks
- quote documents
- dashboard tracker exports

### 11.3 File handling notes

- the server enforces upload size limits
- output and upload directories are configurable
- the repository does not include a Docker or object-storage deployment definition

## 12. Security and Operational Controls

### 12.1 Security middleware

The app uses:

- Helmet for security headers
- CORS handling with optional allowlisting
- request rate limiting for `/api`
- structured error responses

### 12.2 Authentication

Protected endpoints rely on Supabase JWT validation.

### 12.3 Health and uptime

The health endpoint reports:

- app version
- database connectivity status
- uptime
- timestamp

### 12.4 Reminder scheduler

The reminder scheduler:

- only starts when enabled
- only starts when Microsoft Graph variables are present
- can be stopped cleanly during shutdown

## 13. Deployment and Hosting

The repository itself is hosting-agnostic. It does not include Docker, Kubernetes, or platform-specific deployment manifests.

Operationally, the current production environment is an AWS Lightsail instance running the Node.js server, with Supabase providing the database and authentication backend.

### 13.1 Production characteristics

- the app listens on the configured `PORT`
- Express serves the frontend and API from the same process
- runtime secrets are supplied through environment variables
- the database must remain reachable from the host environment

### 13.2 Typical deployment checklist

1. Deploy the application code.
2. Install or refresh dependencies.
3. Verify the Supabase schema and migrations are up to date.
4. Confirm environment variables are present.
5. Restart the Node.js process.
6. Check `/health`.
7. Validate login, dashboard, and at least one protected API.

## 14. Notes for Maintainers

- `DOCUMENTATION.md` is the source of truth for long-form documentation.
- `README.md` should remain concise and point here.

## 15. Summary

TeamBees Billing Engine provides a structured workflow for contractual billing and permanent hiring follow-up. The codebase is organized as a lightweight Express app with Supabase-backed storage, authentication, file generation, and scheduled reminder support.
