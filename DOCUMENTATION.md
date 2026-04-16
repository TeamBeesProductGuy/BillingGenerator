# Billing Engine - Technical Documentation

## 1. Overview

A Node.js/Express-based billing engine that automates monthly invoice calculations from employee rate card and attendance data. The system supports Excel file upload and database-driven billing, generates structured Excel output, integrates with Purchase Orders for automatic value consumption tracking, and now includes a separate Permanent-client workflow (Phase 2) with Orders and Reminders.

### Key Features
- **Excel-based Billing Generation** - Upload Rate Card + Attendance Excel files to generate billing output
- **Database-driven Billing** - Generate billing from stored rate cards and attendance data
- **Rate Card Management** - CRUD storage for employee rate cards with Excel import/export, mandatory SOW linkage, optional PO linkage, and frontend-only hourly-to-monthly entry support with optional cap hours
- **Attendance Management** - Manual entry with leave calendar (full/half-day) or bulk Excel upload (including alternate legend-based formats)
- **Quote Generation** - Create, preview, manage, and export client quotes as branded Word `.docx` documents with structured mail-format fields, FY-based quote numbering, SOW linking, and terminate workflow
- **Statement of Work (SOW)** - Full lifecycle management with amendment support, plus linked-document library (upload/list/search/download/delete)
- **Purchase Order Management** - PO tracking with optional manual PO numbering, threshold alerts, renewal, and SOW linkage
- **Controlled PO Consumption** - Billing generates a pending service request first; PO consumption happens only once the client accepts it
- **Phase 2: Permanent Flow** - Independent flow from contractual workflow: Permanent Clients → Orders → Reminders
- **Authentication** - Supabase Auth with JWT-based API protection
- **Downloadable Output** - Generated billing workbooks plus separate worksheet downloads for Billing_Working, Manager_Summary, and Error_Report
- **Strict Workflow Enforcement** - Client → SOW → PO → Rate Card → Billing (each step requires the previous)

---

## 2. Setup & Installation

### Prerequisites
- Node.js v18+ (tested on v24.13.0)
- npm
- Supabase project (for PostgreSQL database + authentication)

### Installation
```bash
cd "Billing Generator"
npm install
```

### Database Setup
1. Create a Supabase project at https://supabase.com
2. Open the SQL Editor in the Supabase Dashboard
3. Run the full schema from `database/supabase_schema.sql` (includes Phase 2 permanent-flow tables)
4. Copy the project URL, anon key, and service role key

### Environment Configuration
Copy `.env.example` to `.env` and fill in values:
```bash
cp .env.example .env
```

### Running
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

The application starts at `http://localhost:<PORT>`. If `PORT` is not set, the default is **3000**.

### Environment Variables (.env)
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Environment |
| UPLOAD_DIR | ./uploads | Temporary upload directory |
| OUTPUT_DIR | ./output | Generated billing files directory |
| LOG_LEVEL | dev | Morgan log level |
| MAX_FILE_SIZE | 10485760 | Max upload file size in bytes (10MB) |
| CORS_ORIGINS | * | Comma-separated origins or * |
| BILLING_DIVISOR | actual | `actual` = days in month, `30` = fixed 30-day divisor |
| SUPABASE_URL | (required) | Supabase project URL |
| SUPABASE_ANON_KEY | (required) | Supabase anonymous/public key |
| SUPABASE_SERVICE_ROLE_KEY | (required) | Supabase service role key (bypasses RLS) |

---

## 3. Architecture

### Tech Stack
| Layer | Technology | Purpose |
|-------|-----------|---------|
| Runtime | Node.js | Server-side JavaScript |
| Framework | Express.js | HTTP server, routing, middleware |
| Database | Supabase (PostgreSQL) | Managed PostgreSQL with views, RPC functions, triggers |
| Auth | Supabase Auth | JWT-based authentication |
| Excel | ExcelJS | Full-featured Excel read/write with styles |
| Document Export | JSZip + OpenXML | Native `.docx` quote generation |
| PDF | PDFKit | Internal/legacy quote PDF generation route (UI currently exposes DOCX download only) |
| Upload | Multer | Multipart file upload handling |
| Validation | Joi | Declarative schema validation |
| Security | Helmet + CORS + express-rate-limit | HTTP headers, CORS, rate limiting |
| Logging | Morgan | HTTP request logging |
| Frontend | Vanilla JS + Tailwind CSS (CDN) | SPA with hash-based routing |
| Icons | Material Symbols (Outlined) | Google Material Design icons |
| Design System | Stitch | Custom dark theme design system |

### Design Decisions
1. **Supabase PostgreSQL** - Managed PostgreSQL with built-in auth, views, RPC functions, and triggers. Backend uses `service_role` key (bypasses RLS) for full DB access; frontend uses `anon` key for auth only.
2. **Normalized Attendance** - Attendance stored as one row per employee per day (vs. 31 columns). Better for queries, aggregation, and variable month lengths.
3. **Service Layer Pattern** - Business logic isolated in services, separate from controllers (HTTP handling) and models (data access).
4. **Error Collection over Error Throwing** - Billing errors are collected and reported (in Error_Report sheet), not thrown. The system produces output even when some employees have issues.
5. **SPA with Hash Routing** - Single `index.html` with hash-based client-side routing. No build tools, instantly servable by Express.
6. **Decision-based PO Consumption** - Billing generation creates a reviewable service request first. Linked PO values are consumed only after the request is explicitly accepted, preventing accidental double-consumption.

### Project Structure
```
billing-engine/
├── server.js                    # Entry point - starts Express after DB init
├── app.js                       # Express configuration, middleware, route mounting
├── package.json                 # Dependencies and scripts
├── .env                         # Environment configuration (not committed)
├── .env.example                 # Environment template
│
├── config/
│   ├── env.js                   # Environment variable loader
│   └── database.js              # Supabase client initialization
│
├── database/
│   ├── supabase_schema.sql      # Full PostgreSQL schema (tables, views, functions, triggers)
│   ├── schema.sql               # Legacy SQLite schema (reference only)
│   ├── seed.js                  # Database seed script
│   └── migrations/              # SQL migrations (includes permanent-flow migration)
│
├── middleware/
│   ├── auth.js                  # JWT authentication via Supabase Auth
│   ├── catchAsync.js            # Async error wrapper for controllers
│   ├── errorHandler.js          # AppError class + centralized error handler
│   ├── upload.js                # Multer configuration for Excel uploads
│   └── validate.js              # Joi validation middleware factory
│
├── models/                      # Data access layer (Supabase queries)
│   ├── client.model.js          # Client CRUD
│   ├── permanentClient.model.js # Permanent client CRUD + contact groups
│   ├── permanentOrder.model.js  # Permanent orders CRUD + client mapping
│   ├── permanentReminder.model.js # Reminder tracking for permanent orders
│   ├── rateCard.model.js        # Rate card CRUD + bulk operations + PO linkage
│   ├── attendance.model.js      # Attendance CRUD + summaries
│   ├── billing.model.js         # Billing run history + items + errors
│   ├── quote.model.js           # Quote CRUD + line items
│   ├── purchaseOrder.model.js   # PO CRUD + consumption tracking + linked employees
│   └── sow.model.js             # SOW CRUD + items
│
├── services/                    # Business logic layer
│   ├── excelParser.service.js   # Parse Rate Card & Attendance Excel files
│   ├── excelWriter.service.js   # Generate billing Excel workbooks + single-sheet downloads
│   ├── billing.service.js       # Core billing calculation engine
│   ├── permanentBilling.service.js # Permanent billing calculations (next bill date, amount)
│   ├── quoteDocx.service.js     # Native .docx quote generation
│   ├── validation.service.js    # Business rule validations
│   └── poTracker.service.js     # PO consumption & expiry alert logic
│
├── validators/                  # Joi validation schemas
│   ├── billing.validator.js     # Billing request schemas
│   ├── client.validator.js      # Client request schemas
│   ├── permanentClient.validator.js # Permanent client schemas
│   ├── permanentOrder.validator.js # Permanent order schemas
│   ├── permanentReminder.validator.js # Reminder action schemas
│   ├── rateCard.validator.js    # Rate card request schemas
│   ├── attendance.validator.js  # Attendance request schemas
│   ├── quote.validator.js       # Quote request schemas
│   ├── purchaseOrder.validator.js # PO request schemas
│   └── sow.validator.js         # SOW request schemas
│
├── controllers/                 # HTTP request handlers
│   ├── billing.controller.js    # Billing generation + service-request decision flow
│   ├── client.controller.js     # Client management
│   ├── permanentClient.controller.js # Permanent client management
│   ├── permanentOrder.controller.js # Permanent order management
│   ├── permanentReminder.controller.js # Permanent reminder management
│   ├── rateCard.controller.js   # Rate card management + Excel upload/export
│   ├── attendance.controller.js # Attendance management
│   ├── quote.controller.js      # Quote management + DOCX/PDF export
│   ├── purchaseOrder.controller.js # PO management + consumption + renewal
│   └── sow.controller.js        # SOW management
│
├── routes/                      # Express route definitions
│   ├── index.js                 # Route aggregator (applies auth middleware)
│   ├── billing.routes.js
│   ├── client.routes.js
│   ├── permanentClient.routes.js
│   ├── permanentOrder.routes.js
│   ├── permanentReminder.routes.js
│   ├── rateCard.routes.js
│   ├── attendance.routes.js
│   ├── quote.routes.js
│   ├── purchaseOrder.routes.js
│   ├── sow.routes.js
│   ├── dashboard.routes.js
│   └── samples.routes.js
│
├── public/                      # Static frontend (SPA)
│   ├── index.html               # Main shell with sidebar navigation
│   ├── css/styles.css           # Stitch design system + custom styles
│   ├── js/
│   │   ├── app.js               # Client-side router + shared utilities
│   │   ├── login.js             # Supabase Auth login/signup
│   │   ├── dashboard.js         # Dashboard page logic
│   │   ├── billing.js           # Billing generation UI
│   │   ├── clients.js           # Client management UI
│   │   ├── orders.js            # Permanent orders UI
│   │   ├── reminders.js         # Permanent reminders UI
│   │   ├── rate-cards.js        # Rate card management UI
│   │   ├── attendance.js        # Attendance management UI
│   │   ├── quotes.js            # Quote management UI
│   │   ├── purchase-orders.js   # PO management UI
│   │   └── sows.js              # SOW management UI
│   └── pages/                   # HTML partial templates
│       ├── login.html
│       ├── dashboard.html
│       ├── billing.html
│       ├── clients.html
│       ├── orders.html
│       ├── reminders.html
│       ├── rate-cards.html
│       ├── attendance.html
│       ├── quotes.html
│       ├── purchase-orders.html
│       └── sows.html
│
├── uploads/                     # Temporary uploaded files (auto-cleaned)
├── output/                      # Generated billing Excel files
└── data/                        # Sample Excel files for testing
    ├── TestRateCard.xlsx
    └── TestAttendance.xlsx
```

---

## 4. Authentication

### Architecture
- **Backend**: Uses Supabase `service_role` key (bypasses RLS) for full database access
- **Frontend**: Uses Supabase `anon` key for authentication only (login/signup)
- **Middleware**: `middleware/auth.js` verifies JWT tokens via `supabaseAuth.auth.getUser(token)`
- **Route Protection**: All `/api/*` routes require authentication (`routes/index.js` applies `requireAuth`)
- **Frontend Auth Flow**: Login page at `public/pages/login.html`, token stored in localStorage, sent as `Authorization: Bearer <token>` via `apiCall()` in app.js

### Login/Signup
Users authenticate via the Supabase Auth UI. The frontend calls `supabase.auth.signInWithPassword()` or `supabase.auth.signUp()`.

---

## 5. Data Flow

### Billing Generation (from files)
```
1. User uploads Rate Card + Attendance Excel files + billing month
2. Multer saves files to /uploads
3. excelParser.service parses both files → records[] + errors[]
4. po_number strings from Excel are resolved to po_id integers via DB lookup
5. validation.service cross-validates emp_codes between files
6. billing.service calculates billing (pro-rata for mid-month reporting, cap at 30 days)
7. excelWriter.service generates Billing_Working_For_YYYYMM.xlsx (3 sheets: Billing_Working, Manager_Summary, Error_Report)
8. billing.model saves run + items + errors to database
9. A pending billing/service request is stored for review
10. Response includes summary, items, errors, download URL, request status, and any PO-assignment suggestions
11. Uploaded files are cleaned up
```

### Billing Generation (from database)
```
1. User selects client (optional) + billing month
2. Rate cards fetched from rate_cards_view (includes SOW and optional PO linkage from DB)
3. Attendance fetched from attendance table (aggregated via RPC)
4. Same calculation → Excel generation → DB save as Pending service request
```

### Service Request Decision Pipeline
```
Billing Generated (file upload or DB)
    ↓
calculateBilling() → billingItems with po_id on each item
    ↓
billing_runs row created with request_status = "Pending"
    ↓
Client reviews run in UI
    ↓
Accept or Reject exactly once
    ↓
If Accepted: consume_po RPC inserts po_consumption_log + updates consumed_value
If Rejected: run remains downloadable but no PO value is consumed
Both outcomes are then locked in the UI
```

---

## 6. Core Billing Logic

### Formula
```
DaysInMonth    = actual calendar days in YYYYMM (e.g., Feb 2026 = 28)
EffectiveDays  = DaysInMonth (or pro-rated if charging_date / date_of_reporting falls in billing month)
LeavesTaken    = count of "L" in attendance (days 1..DaysInMonth only)
ChargeableDays = min(EffectiveDays - LeavesTaken + LeavesAllowed, 30)   // capped at 30, min 0
InvoiceAmount  = (ChargeableDays / Divisor) × MonthlyRate
```

The **Divisor** is configurable via the `BILLING_DIVISOR` environment variable:
- `actual` (default) — uses the actual number of days in the month
- `30` — always divides by 30 (fixed billing month assumption)

### Date of Reporting (Pro-rata)
If an employee's `charging_date` (also accepted from uploads as `date_of_reporting`) falls within the billing month, billing is pro-rated:
- **EffectiveDays** = DaysInMonth - ReportingDay + 1 (bill from reporting date to month-end)
- If that date is **after** the billing month, the employee is skipped entirely with an error
- If that date is **before** the billing month (or not set), full month is billed

### Chargeable Days Cap
- Maximum chargeable days is **30** (hard cap)
- Minimum chargeable days is **0** (no negative billing)

### Example 1: Normal (EMP001, Feb 2026, Divisor = 30)
```
DaysInMonth = 28, EffectiveDays = 28 (no charging_date)
LeavesTaken = 2, LeavesAllowed = 2
ChargeableDays = min(28 - 2 + 2, 30) = 28
InvoiceAmount = (28 / 30) × 50,000 = 46,666.67
```

### Example 2: Pro-rata (EMP002, Mar 2026, reports 15th, Divisor = 30)
```
DaysInMonth = 31, EffectiveDays = 31 - 15 + 1 = 17
LeavesTaken = 1, LeavesAllowed = 1
ChargeableDays = min(17 - 1 + 1, 30) = 17
InvoiceAmount = (17 / 30) × 150,000 = 85,000.00
```

### Example 3: Cap Applied (EMP003, Mar 2026, 0 leaves, 2 allowed, Divisor = 30)
```
DaysInMonth = 31, EffectiveDays = 31
LeavesTaken = 0, LeavesAllowed = 2
ChargeableDays = min(31 - 0 + 2, 30) = 30  (capped from 33)
InvoiceAmount = (30 / 30) × 180,000 = 180,000.00
```

### Key Points
- `DaysInMonth` is dynamically derived from the YYYYMM input using `new Date(year, month, 0).getDate()`
- `LeavesAllowed` acts as a "free leave" buffer - it adds back days that would otherwise be deducted
- `ChargeableDays` is capped at 30 and cannot go negative
- `EffectiveDays` reflects pro-rata when an employee joins mid-month
- Monetary values are rounded to 2 decimal places
- Invoice amounts are only deducted from linked POs when the generated service request is accepted

---

## 7. Input File Specifications

### Rate Card Excel (Sheet1)
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| client_name | Text | Yes | Client name |
| emp_code | Text | Yes | Unique employee identifier |
| emp_name | Text | Yes | Employee name |
| doj | Date/Text | No | Date of joining |
| reporting_manager | Text | No | Manager name |
| monthly_rate | Number | Yes | Monthly billing rate (positive) |
| leaves_allowed | Number | Yes | Leaves per month (non-negative) |
| sow_number | Text | Yes | Existing SOW number used to resolve `sow_id` |
| po_number | Text | No | Optional PO number (resolved to `po_id` if it matches an active PO) |
| charging_date | Date/Text | No | Employee reporting / charging start date |

Column names are matched case-insensitively with alias support (e.g., "Employee Code" maps to "emp_code", "PO" maps to "po_number", "date_of_reporting" maps to "charging_date").

### Attendance Excel (Sheet1)
| Column | Type | Required | Description |
|--------|------|----------|-------------|
| emp_code | Text | Yes | Employee identifier |
| emp_name | Text | No | Employee name |
| reporting_manager | Text | No | Manager name |
| 1, 2, 3, ... 31 | Text | Yes | Daily status: "P" (Present) or "L" (Leave) |

Days beyond the actual month length are ignored.

### Output: Billing_Working_For_YYYYMM.xlsx

**Sheet 1: Billing_Working**
| Column | Description |
|--------|-------------|
| Client Name | From rate card |
| Reporting Manager | From rate card or attendance |
| Emp Code | Employee identifier |
| Emp Name | Employee name |
| Date of Reporting | Employee's reporting start date (for pro-rata) |
| Monthly Rate | Billing rate |
| Allowed Leaves | From rate card |
| Leaves Taken | Counted from attendance |
| Effective Days | Billable days (pro-rated if mid-month reporting) |
| Chargeable Days | Calculated (capped at 30, min 0) |
| Invoice Amount | Calculated amount; consumed from linked PO only if the service request is later accepted |

Includes a TOTAL row at the bottom and auto-filter on all columns.

**Sheet 2: Manager_Summary**
| Column | Description |
|--------|-------------|
| Reporting Manager | Manager name (grouped) |
| Employee Count | Number of employees under this manager |
| Total Monthly Rate | Sum of monthly rates for the group |
| Total Invoice Amount | Sum of invoice amounts for the group |

Sorted alphabetically by manager name with a TOTAL row at the bottom.

**Sheet 3: Error_Report**
| Column | Description |
|--------|-------------|
| Emp Code | Employee identifier (or row reference) |
| Error Message | Detailed error description |

---

## 8. API Reference

All API routes require authentication via `Authorization: Bearer <token>` header.

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/billing/generate` | Upload files + generate billing (multipart) |
| POST | `/api/billing/generate-from-db` | Generate from stored data (JSON body: `{clientId?, billingMonth}`) |
| GET | `/api/billing/runs` | List billing run history (`?limit=&offset=`) |
| GET | `/api/billing/runs/:id` | Get run details with items + errors |
| POST | `/api/billing/runs/:id/decision` | Accept or reject a pending service request |
| GET | `/api/billing/runs/:id/download` | Download generated Excel workbook |
| GET | `/api/billing/runs/:id/download/billing_working` | Download only the `Billing_Working` worksheet as Excel |
| GET | `/api/billing/runs/:id/download/manager_summary` | Download only the `Manager_Summary` worksheet as Excel |
| GET | `/api/billing/runs/:id/download/error_report` | Download only the `Error_Report` worksheet as Excel |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | List all active clients |
| GET | `/api/clients/:id` | Get single client |
| POST | `/api/clients` | Create client (includes `industry` field) |
| PUT | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Soft-delete client |

### Phase 2: Permanent Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/permanent/clients` | List active permanent clients with contact groups |
| GET | `/api/permanent/clients/:id` | Get one permanent client |
| POST | `/api/permanent/clients` | Create permanent client |
| PUT | `/api/permanent/clients/:id` | Update permanent client |
| DELETE | `/api/permanent/clients/:id` | Soft-delete permanent client |

Backward-compatible aliases are also mounted:
- `/api/clients/permanent`
- `/api/clients/permanent/:id`

### Rate Cards
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rate-cards` | List rate cards (`?clientId=`) |
| GET | `/api/rate-cards/:id` | Get single rate card |
| POST | `/api/rate-cards` | Create rate card (requires `sow_id`, optional `po_id`, stores `monthly_rate`) |
| PUT | `/api/rate-cards/:id` | Update rate card |
| DELETE | `/api/rate-cards/:id` | Soft-delete rate card |
| POST | `/api/rate-cards/upload` | Bulk upload from Excel |
| GET | `/api/rate-cards/export` | Export to Excel download |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance` | Get attendance (`?empCode=&billingMonth=`) |
| GET | `/api/attendance/summary` | Get month summary (`?billingMonth=`) |
| POST | `/api/attendance` | Submit single day |
| POST | `/api/attendance/bulk` | Submit full month for one employee (supports decimal leaves and `leave_entries` for full/half-day) |
| POST | `/api/attendance/upload` | Bulk upload from Excel (supports standard and Vocera-style attendance layouts) |
| DELETE | `/api/attendance` | Delete employee's month data |

### Quotes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quotes` | List quotes (`?clientId=&status=`) |
| GET | `/api/quotes/:id` | Get quote with line items |
| POST | `/api/quotes` | Create quote (items include `location`) |
| PUT | `/api/quotes/:id` | Update draft quote |
| PATCH | `/api/quotes/:id/status` | Change status (enforced transitions) |
| DELETE | `/api/quotes/:id` | Delete draft quote |
| GET | `/api/quotes/:id/download` | Download quote as branded Word `.docx` |
| GET | `/api/quotes/:id/pdf` | PDF export route (backend available; current UI uses DOCX download) |
| POST | `/api/quotes/:id/convert-to-sow` | Create or link a SOW from an accepted quote |

#### Quote Status Transitions
```
Draft → Sent → Accepted
                Sent → Rejected → Draft
Any status → Expired
```

- In the Quotes UI, accepted quotes expose a **Terminate** action.
- Terminate is implemented as a status update to `Expired` (no DB schema change required).
- When terminate is used from `Accepted`, the linked SOW document folder is also deleted (if present).

#### Quote Notes / Mail Format
- The UI exposes structured quote-mail fields for **Subject**, **Candidate Name**, **Dear / Recipient**, **Mail Body**, **Regards / Sender**, **Designation**, plus an internal **Side Note** field.
- Both values are stored inside the existing `quotes.notes` column using an internal marker, so no schema change is required.
- Only the structured **Mail Format** content is included in the exported documents; **Side Note** is for internal reference only.
- The exported document includes the TeamBees logo, quote number, quote date, client name, client address, structured subject line, mail body, quote item table, structured signoff, and footer block.
- Quote DOCX download filename format is:
  `<client_abbreviation>_<first_line_item_description>_<candidate_name>_<quote_date_YYYYMMDD>.docx`
- If **Candidate Name** is provided, the exported subject line is rendered as `Subject: <subject> ("<candidate>")`.
- If **Designation** is provided, it is rendered on the next line below the sender as `(<designation>)`.
- The body template includes:
  `1. Cost of resource (per man month):`
  `2. Prevailing taxes, GST extra as applicable`
  `3. Location: ...`
  `4. This Quote is valid till <N days>`
- The frontend keeps `valid_until` defaulted to **quote date + 10 days**, but users can edit it manually; the mail body validity line is updated accordingly.

#### Quote Numbering
- New quote numbers follow the format `TBC-<financial-year>-<serial>`.
- Financial year is April to March.
- Example: a quote created on **2026-04-07** is numbered `TBC-2627-001`.
- The serial resets for each financial year.
- Quote revisions continue to use the base quote number with the existing revision suffix format `R(<n>)`.

### Statements of Work (SOW)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sows` | List SOWs (`?clientId=&status=`) |
| GET | `/api/sows/:id` | Get SOW with items |
| POST | `/api/sows` | Create SOW (auto-generated number: `SOW-YYYYMMDD-NNN`) |
| POST | `/api/sows/:id/amend` | Create an amendment draft from a signed SOW |
| PUT | `/api/sows/:id` | Update Draft or Amendment Draft SOW |
| PATCH | `/api/sows/:id/status` | Change SOW status |
| DELETE | `/api/sows/:id` | Delete Draft or Amendment Draft SOW |
| GET | `/api/sows/documents` | List linked-document folders and files |
| POST | `/api/sows/documents/upload` | Upload SOW doc (PDF/DOC/DOCX) and store generated quote DOCX in the same folder |
| GET | `/api/sows/documents/download?folder=&file=` | Download a file from a linked-document folder |
| DELETE | `/api/sows/documents?folder=` | Delete a linked-document folder |

#### SOW Status Transitions
```
Draft → Signed → Expired / Terminated
Signed → Make Amendment → Amendment Draft → Signed
```

#### SOW Linked Document Library
- Folder naming format:
  `<client_abbreviation>_<candidate_name>_<quote_date_YYYYMMDD>`
- Each folder stores:
  generated quote DOCX + uploaded SOW file (`.pdf`, `.doc`, or `.docx`)
- SOW tab includes in-app folder browsing with:
  search by folder name, per-file download, and folder delete

### Purchase Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchase-orders` | List POs (`?clientId=&status=`) |
| GET | `/api/purchase-orders/:id` | Get PO with consumption log + linked employees |
| POST | `/api/purchase-orders` | Create PO (required `sow_id`, optional `po_number`, optional `quote_id`) |
| PUT | `/api/purchase-orders/:id` | Update PO |
| PATCH | `/api/purchase-orders/:id/consume` | Manual consumption (`{amount, description}`) |
| GET | `/api/purchase-orders/alerts` | Get POs nearing threshold or expiry |
| PATCH | `/api/purchase-orders/:id/renew` | Renew PO (marks old as Renewed, creates new, migrates employees) |

### Phase 2: Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/permanent/orders` | List all permanent orders |
| GET | `/api/permanent/orders/:id` | Get one permanent order |
| POST | `/api/permanent/orders` | Create order (server computes `next_bill_date` and `bill_amount`) |
| PUT | `/api/permanent/orders/:id` | Update order (recomputes billing fields) |
| DELETE | `/api/permanent/orders/:id` | Delete order |

Backward-compatible aliases are also mounted:
- `/api/orders/permanent`
- `/api/orders/permanent/:id`

### Phase 2: Reminders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/permanent/reminders` | List open reminders in window `referenceDate-3` to `referenceDate+3` (default `referenceDate=today`) |
| PATCH | `/api/permanent/reminders/:id/emails` | Save/update two reminder email IDs |
| PATCH | `/api/permanent/reminders/:id/close` | Close/end reminder |
| PATCH | `/api/permanent/reminders/:id/extend` | Extend reminder due date |

Backward-compatible aliases are also mounted:
- `/api/reminders/permanent`

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Summary stats + recent runs + PO alerts |

### Samples
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/samples/rate-card` | Download sample rate card Excel |
| GET | `/api/samples/attendance` | Download sample attendance Excel |

### Health Check (No Auth Required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health + DB status + uptime |

### Response Format
All API responses follow this envelope:
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Error message" }
```

---

## 9. Database Schema

### Tables
1. **clients** - Contractual client information with `industry` field and soft-delete
2. **permanent_clients** - Permanent client master with billing pattern and billing rate
3. **permanent_client_contacts** - Repeatable contact groups for permanent clients
4. **permanent_orders** - Candidate-level placement/order records for permanent clients
5. **permanent_reminders** - Reminder tracking for permanent billing follow-up
6. **rate_cards** - Employee rate cards linked to clients and POs (UNIQUE: client_id + emp_code)
7. **attendance** - Daily attendance records (UNIQUE: emp_code + billing_month + day_number) with `leave_units` support for half-day leave
8. **billing_runs** - Audit log of billing generations
9. **billing_items** - Per-employee calculation results for each run (`leaves_taken` supports fractional values)
10. **billing_errors** - Per-employee errors for each run
11. **quotes** + **quote_items** - Quote management with line items; exported primarily as branded `.docx`
12. **sows** + **sow_items** - Statement of Work with role/position items and amendment draft workflow
13. **purchase_orders** - PO tracking with value consumption and SOW linkage
14. **po_consumption_log** - Consumption event history (auto + manual)
15. **employee_po_history** - Assignment history when employees move between POs
16. **audit_log** - General audit trail

### Key Relationships
- `rate_cards.client_id` → `clients.id`
- `permanent_client_contacts.client_id` → `permanent_clients.id`
- `permanent_orders.client_id` → `permanent_clients.id`
- `permanent_reminders.order_id` → `permanent_orders.id`
- `rate_cards.po_id` → `purchase_orders.id` (employee-to-PO linkage)
- `billing_items.billing_run_id` → `billing_runs.id` (CASCADE)
- `billing_errors.billing_run_id` → `billing_runs.id` (CASCADE)
- `quotes.client_id` → `clients.id`
- `quote_items.quote_id` → `quotes.id` (CASCADE)
- `sows.client_id` → `clients.id`
- `sows.quote_id` → `quotes.id`
- `sow_items.sow_id` → `sows.id` (CASCADE)
- `purchase_orders.client_id` → `clients.id`
- `purchase_orders.sow_id` → `sows.id`
- `purchase_orders.quote_id` → `quotes.id`
- `po_consumption_log.po_id` → `purchase_orders.id`
- `po_consumption_log.billing_run_id` → `billing_runs.id`
- `employee_po_history.rate_card_id` → `rate_cards.id`
- `employee_po_history.po_id` → `purchase_orders.id`

### Views
- **rate_cards_view** - rate_cards + client_name + po_number
- **quotes_view** - quotes + client_name
- **sows_view** - sows + client_name
- **purchase_orders_view** - purchase_orders + client_name + sow_number + consumption_pct + remaining_value + linked_employees count

### Database Functions (RPC)
- **get_attendance_summary(billing_month)** - Aggregated attendance per employee
- **consume_po(po_id, amount, description, billing_run_id)** - Atomic PO consumption (insert log + update value + auto-mark Exhausted)
- **renew_po(...)** - Atomic PO renewal (mark old as Renewed + create new + log history + migrate employees)
- **get_po_alerts()** - POs exceeding threshold or expiring within 30 days
- **check_and_update_expired_pos()** - Mark expired POs
- **get_dashboard_stats()** - All dashboard stats in a single call

### Triggers
- **trg_rate_card_po_client** - Ensures a rate card's `po_id` references a PO belonging to the same client
- **trg_po_sow_client** - Ensures a PO's `sow_id` references a SOW belonging to the same client

---

## 10. Validation Rules

### Rate Card
- Required columns present: emp_code, emp_name, monthly_rate, leaves_allowed, sow_number
- emp_code unique within the file
- monthly_rate must be a positive number
- leaves_allowed must be a non-negative integer
- sow_number must match an existing SOW
- po_number is optional; if provided, it must match an Active PO for the selected client/SOW context
- In the manual Rate Card form, users may choose `Hourly Rate` mode; the UI computes `monthly_rate = hourly_rate × min(hours_worked_in_month, cap_hours)`, and only `monthly_rate` is stored

### Attendance
- Standard layout: required columns `emp_code` + day number columns
- Alternate (Vocera-style) layout is supported:
  header row auto-detection, employee-name-based matching to rate card when `emp_code` column is absent
- Supported present codes: `P`, `PR`, `ODW`, `WFH`
- Supported full-leave codes: `L`, `CL`, `SL`, `EL`, `HL`, `WO`, `PRTO`, `A`
- Supported half-leave codes: `HDL`, `HDS`, `HD`
- Manual attendance UI supports half-day via calendar toggles:
  `Full Leave -> Half Leave -> Present`
- `Number of Leaves` accepts `0.5` increments (for example, `4.5`)
- `leave_entries` payload accepts `{ day_number, leave_units }` with `leave_units` in `{1, 0.5}`
- Days beyond month length are ignored

### Cross-validation
- Employees in Rate Card but missing in Attendance → Error
- Employees in Attendance but missing in Rate Card → Error

### Billing Month
- Format: YYYYMM (6 digits)
- Year: 2020-2099
- Month: 01-12

---

## 11. Error Handling

Errors are categorized and reported:

| Error Type | Description |
|------------|-------------|
| Missing column | Required column not found in uploaded file |
| Invalid value | Non-numeric rate, negative leaves, etc. |
| Duplicate emp_code | Same employee code appears multiple times |
| Missing in Rate Card | Employee in attendance but not in rate card |
| Missing in Attendance | Employee in rate card but not in attendance |
| File format | Invalid file type or corrupted Excel |
| Validation | Invalid billing month format |
| PO consumption | Acceptance-time PO lookup/consumption failed (logged but non-fatal) |
| PO assignment warning | Employee has no linked PO; billing still generates and warning is logged |

Fatal errors (bad file, missing month, cross-validation failures) return HTTP 400. Employee-level warnings are collected in the Error_Report sheet while valid employees are still processed. PO consumption errors are included during service-request acceptance and do not alter the original generated workbook.

---

## 12. Edge Cases Handled

1. **Variable month lengths** - DaysInMonth dynamically calculated (28/29/30/31)
2. **Leap years** - February correctly returns 29 days for leap years
3. **Header name variations** - Case-insensitive matching with aliases ("Employee Code" → emp_code)
4. **Excel date formats** - Handles both JavaScript Date objects and string dates for DOJ and charging/reporting dates
5. **Empty rows** - Skipped during parsing
6. **Partial data** - Employees with errors are reported; valid employees are still billed
7. **Excess day columns** - Columns 29-31 ignored for months with fewer days
8. **PO number resolution** - File-upload billing resolves `po_number` strings to `po_id` integers via database lookup
9. **Decision locking** - Accepted/rejected service requests cannot be actioned again from the UI
10. **PO exhaustion** - Auto-marks PO as "Exhausted" when consumed_value >= po_value
11. **PO-client integrity** - Database trigger prevents assigning a rate card to a PO from a different client
12. **SOW-client integrity** - Database trigger prevents linking a PO to a SOW from a different client
13. **Date of Reporting pro-rata** - Employees reporting mid-month are billed only from their reporting date
14. **Future reporting date** - Employees whose charging/reporting date is after the billing month are skipped with an error
15. **Chargeable days cap** - Maximum 30 chargeable days per employee per month
16. **Negative billing prevention** - Chargeable days cannot go below 0
17. **SOW amendment safety** - Signed SOWs are preserved; amendments create new SOW records with unique numbers and `Amendment Draft` status
18. **PO warning non-blocking** - Missing PO assignment is treated as a warning and does not block billing output generation
19. **Half-day compatibility fallback** - If legacy DB schema still stores integer `billing_items.leaves_taken`, billing insert falls back safely instead of failing at runtime

### Required Migration for Full Half-Day Persistence
- Run:
  `database/migrations/006_attendance_half_day_leave_units.sql`
- This migration adds:
  `attendance.leave_units` and fractional `billing_items.leaves_taken`, and updates `get_attendance_summary` for half-day math

---

## 13. Security

- **Authentication**: JWT-based via Supabase Auth on all API routes
- **Rate Limiting**: 100 requests per minute per IP on `/api` routes
- **HTTP Headers**: Helmet.js for security headers
- **CORS**: Configurable origins (default: allow all)
- **File Upload**: Multer with 10MB size limit, Excel files only
- **Input Validation**: Joi schemas on all POST/PUT/PATCH routes
- **SQL Injection**: Prevented by Supabase client (parameterized queries)
- **XSS Prevention**: `escapeHtml()` used in frontend rendering

---

## 14. Testing

### Manual Test with Sample Files
```bash
# Start the server
npm run dev

# Open browser
http://localhost:<PORT>

# Login with Supabase credentials
# Navigate to Billing page
# Upload data/TestRateCard.xlsx and data/TestAttendance.xlsx
# Enter billing month: 202602
# Click Generate
# Download the output file
```

### Expected Results for Test Data (Feb 2026, 28 days, divisor=30)
| Emp Code | Monthly Rate | Leaves Taken | Leaves Allowed | Chargeable Days | Invoice Amount |
|----------|-------------|--------------|----------------|-----------------|----------------|
| EMP001 | 50,000 | 2 | 2 | 28 | 46,666.67 |
| EMP002 | 60,000 | 3 | 1 | 26 | 52,000.00 |
| EMP003 | 45,000 | 0 | 2 | 30 | 45,000.00 |
| EMP004 | 70,000 | 4 | 3 | 27 | 63,000.00 |
| EMP005 | 55,000 | 1 | 2 | 29 | 53,166.67 |
| **Total** | | | | | **259,833.34** |

---

## 15. Phase 2 (Permanent Flow) - Implementation Notes

### Scope Delivered
1. **Contract Type split in Client modal**
   - `Contractual` keeps existing behavior unchanged
   - `Permanent` opens independent data model fields
2. **Permanent Client creation/edit**
   - Name, Abbreviation, Address, Billing Address
   - Repeatable contact persons (name, email, phone with country code, designation)
   - Billing Pattern (`Weekly`, `Monthly`, `Quarterly`) + Billing Rate (% of CTC)
3. **Orders module**
   - New Orders tab with create/edit/delete
   - Fields: client, candidate name, role, date of joining, CTC, remarks
   - Auto-calculations:
     - `next_bill_date` based on client billing pattern + DOJ
     - `bill_amount = ctc_offered * (billing_rate/100)`
4. **Reminders module**
   - New Reminders tab
   - Reminder list window: 3 days before due date to 3 days after due date
   - Inputs for two reminder email IDs
   - Actions: close/end reminder, extend reminder date

### Routing and Compatibility
- Primary Phase 2 API paths:
  - `/api/permanent/clients`
  - `/api/permanent/orders`
  - `/api/permanent/reminders`
- Backward-compatible aliases are also mounted for resilience:
  - `/api/clients/permanent`
  - `/api/orders/permanent`
  - `/api/reminders/permanent`

### Database Changes
- Added Supabase migration:
  - `database/migrations/008_add_permanent_flow.sql`
- Included in full schema:
  - `database/supabase_schema.sql`

### Current Reminder Email Status
- Email addresses are stored and managed in reminders.
- Automatic outbound email delivery is **not yet implemented** in this phase.
- To enable delivery, add provider integration (SMTP/Resend/etc.) + scheduler/cron + send-log/idempotency.
