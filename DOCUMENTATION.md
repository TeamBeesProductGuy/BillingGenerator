# Billing Engine - Technical Documentation

## 1. Overview

A Node.js/Express-based billing engine that automates monthly invoice calculations from employee rate card and attendance data. The system accepts Excel files, processes billing calculations server-side, and generates structured Excel output files.

### Key Features
- **Excel-based Billing Generation** - Upload Rate Card + Attendance Excel files with a billing month to generate billing output
- **Rate Card Management** - Persistent CRUD storage for employee rate cards with Excel import/export
- **Attendance Management** - Manual entry per employee or bulk Excel upload
- **Quote Generation** - Create, manage, and track client quotes with line items
- **Purchase Order Management** - PO tracking with value/time consumption and expiry alerts
- **Downloadable Output** - Generated billing Excel files with Billing_Working and Error_Report sheets

---

## 2. Setup & Installation

### Prerequisites
- Node.js v18+ (tested on v24.13.0)
- npm

### Installation
```bash
cd "d:\TeamBees\Billing Generator"
npm install
```

### Running
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

The application starts at **http://localhost:3000**

### Environment Variables (.env)
| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NODE_ENV | development | Environment |
| DB_PATH | ./database/billing.db | SQLite database file path |
| UPLOAD_DIR | ./uploads | Temporary upload directory |
| OUTPUT_DIR | ./output | Generated billing files directory |

---

## 3. Architecture

### Tech Stack
| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js | Assignment requirement |
| Framework | Express.js | Assignment requirement |
| Database | SQLite (sql.js) | Zero-setup, file-based, portable |
| Excel | ExcelJS | Full-featured read/write with styles |
| Upload | Multer | Standard Express multipart handling |
| Validation | Joi | Declarative schema validation |
| Frontend | Vanilla JS + Bootstrap 5 | No build tools, instant demo |

### Design Decisions
1. **SQLite via sql.js** - Pure JavaScript SQLite (WASM-based), no native compilation needed. Ideal for demo/interview scenarios with zero external dependencies.
2. **Normalized Attendance** - Attendance stored as one row per employee per day (vs. 31 columns). Better for queries, aggregation, and variable month lengths.
3. **Service Layer Pattern** - Business logic isolated in services, separate from controllers (HTTP handling) and models (data access).
4. **Error Collection over Error Throwing** - Billing errors are collected and reported (in Error_Report sheet), not thrown. The system produces output even when some employees have issues.
5. **SPA with Hash Routing** - Single `index.html` with hash-based client-side routing. No build tools, instantly servable by Express.

### Project Structure
```
billing-engine/
├── server.js                    # Entry point - starts Express after DB init
├── app.js                       # Express configuration, middleware, route mounting
├── package.json                 # Dependencies and scripts
├── .env                         # Environment configuration
│
├── config/
│   ├── env.js                   # Environment variable loader
│   └── database.js              # SQLite connection, initialization, helper API
│
├── database/
│   └── schema.sql               # Full database DDL (9 tables)
│
├── middleware/
│   ├── errorHandler.js          # AppError class + centralized error handler
│   ├── upload.js                # Multer configuration for Excel uploads
│   └── validate.js              # Joi validation middleware factory
│
├── models/                      # Data access layer (SQLite queries)
│   ├── client.model.js          # Client CRUD
│   ├── rateCard.model.js        # Rate card CRUD + bulk operations
│   ├── attendance.model.js      # Attendance CRUD + summaries
│   ├── billing.model.js         # Billing run history + items + errors
│   ├── quote.model.js           # Quote CRUD + line items
│   └── purchaseOrder.model.js   # PO CRUD + consumption tracking
│
├── services/                    # Business logic layer
│   ├── excelParser.service.js   # Parse Rate Card & Attendance Excel files
│   ├── excelWriter.service.js   # Generate output billing Excel
│   ├── billing.service.js       # Core billing calculation engine
│   ├── validation.service.js    # Business rule validations
│   └── poTracker.service.js     # PO consumption & expiry alert logic
│
├── controllers/                 # HTTP request handlers
│   ├── billing.controller.js    # Billing generation endpoints
│   ├── client.controller.js     # Client management endpoints
│   ├── rateCard.controller.js   # Rate card management endpoints
│   ├── attendance.controller.js # Attendance management endpoints
│   ├── quote.controller.js      # Quote management endpoints
│   └── purchaseOrder.controller.js # PO management endpoints
│
├── routes/                      # Express route definitions
│   ├── index.js                 # Route aggregator
│   ├── billing.routes.js
│   ├── client.routes.js
│   ├── rateCard.routes.js
│   ├── attendance.routes.js
│   ├── quote.routes.js
│   ├── purchaseOrder.routes.js
│   └── dashboard.routes.js
│
├── public/                      # Static frontend (SPA)
│   ├── index.html               # Main shell with sidebar navigation
│   ├── css/styles.css           # Custom styles
│   ├── js/
│   │   ├── app.js               # Client-side router + shared utilities
│   │   ├── dashboard.js         # Dashboard page logic
│   │   ├── billing.js           # Billing generation UI
│   │   ├── clients.js           # Client management UI
│   │   ├── rate-cards.js        # Rate card management UI
│   │   ├── attendance.js        # Attendance management UI
│   │   ├── quotes.js            # Quote management UI
│   │   └── purchase-orders.js   # PO management UI
│   └── pages/                   # HTML partial templates
│       ├── dashboard.html
│       ├── billing.html
│       ├── clients.html
│       ├── rate-cards.html
│       ├── attendance.html
│       ├── quotes.html
│       └── purchase-orders.html
│
├── uploads/                     # Temporary uploaded files
├── output/                      # Generated billing Excel files
└── data/                        # Sample/test Excel files
```

---

## 4. Data Flow

### Billing Generation (from files)
```
1. User uploads Rate Card + Attendance Excel files + billing month
2. Multer saves files to /uploads
3. excelParser.service parses both files → records[] + errors[]
4. validation.service cross-validates emp_codes between files
5. billing.service calculates billing for each matched employee
6. excelWriter.service generates Billing_Working_For_YYYYMM.xlsx
7. billing.model saves run + items + errors to database
8. Response includes summary, items, errors, and download URL
9. Uploaded files are cleaned up
```

### Billing Generation (from database)
```
1. User selects client + billing month
2. Rate cards fetched from rate_cards table
3. Attendance fetched from attendance table (aggregated)
4. Same calculation → Excel generation → DB save flow
```

---

## 5. Core Billing Logic

### Formula
```
DaysInMonth = actual calendar days in YYYYMM (e.g., Feb 2026 = 28)
LeavesTaken = count of "L" in attendance (days 1..DaysInMonth only)
ChargeableDays = DaysInMonth - LeavesTaken + LeavesAllowed
InvoiceAmount = (ChargeableDays / 30) × MonthlyRate
```

### Example (EMP001, Feb 2026)
```
DaysInMonth = 28
LeavesTaken = 2
LeavesAllowed = 2
ChargeableDays = 28 - 2 + 2 = 28
InvoiceAmount = (28 / 30) × 50,000 = ₹46,666.67
```

### Key Points
- `DaysInMonth` is dynamically derived from the YYYYMM input using `new Date(year, month, 0).getDate()`
- `LeavesAllowed` acts as a "free leave" buffer - it adds back days that would otherwise be deducted
- `ChargeableDays` can exceed `DaysInMonth` (e.g., 0 leaves with 2 allowed = DaysInMonth + 2)
- The divisor is always 30 (fixed billing month assumption), regardless of actual days
- Monetary values are rounded to 2 decimal places

---

## 6. Input File Specifications

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

Column names are matched case-insensitively with alias support (e.g., "Employee Code" maps to "emp_code").

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
| Monthly Rate | Billing rate |
| Allowed Leaves | From rate card |
| Leaves Taken | Counted from attendance |
| Chargeable Days | Calculated |
| Invoice Amount | Calculated |

**Sheet 2: Error_Report**
| Column | Description |
|--------|-------------|
| Emp Code | Employee identifier (or row reference) |
| Error Message | Detailed error description |

---

## 7. API Reference

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/billing/generate` | Upload files + generate billing (multipart) |
| POST | `/api/billing/generate-from-db` | Generate from stored data (JSON) |
| GET | `/api/billing/runs` | List billing run history |
| GET | `/api/billing/runs/:id` | Get run details with items + errors |
| GET | `/api/billing/runs/:id/download` | Download generated Excel file |

### Clients
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/clients` | List all active clients |
| GET | `/api/clients/:id` | Get single client |
| POST | `/api/clients` | Create client |
| PUT | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Soft-delete client |

### Rate Cards
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/rate-cards` | List rate cards (?clientId=) |
| GET | `/api/rate-cards/:id` | Get single rate card |
| POST | `/api/rate-cards` | Create rate card |
| PUT | `/api/rate-cards/:id` | Update rate card |
| DELETE | `/api/rate-cards/:id` | Soft-delete rate card |
| POST | `/api/rate-cards/upload` | Bulk upload from Excel |
| GET | `/api/rate-cards/export` | Export to Excel download |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/attendance` | Get attendance (?empCode=&billingMonth=) |
| GET | `/api/attendance/summary` | Get month summary (?billingMonth=) |
| POST | `/api/attendance` | Submit single day |
| POST | `/api/attendance/bulk` | Submit full month for one employee |
| POST | `/api/attendance/upload` | Bulk upload from Excel |
| DELETE | `/api/attendance` | Delete employee's month data |

### Quotes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/quotes` | List quotes (?clientId=&status=) |
| GET | `/api/quotes/:id` | Get quote with line items |
| POST | `/api/quotes` | Create quote |
| PUT | `/api/quotes/:id` | Update draft quote |
| PATCH | `/api/quotes/:id/status` | Change quote status |
| DELETE | `/api/quotes/:id` | Delete draft quote |
| GET | `/api/quotes/:id/download` | Download quote as Excel |
| POST | `/api/quotes/:id/convert-to-po` | Create PO from accepted quote |

### Purchase Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/purchase-orders` | List POs (?clientId=&status=) |
| GET | `/api/purchase-orders/:id` | Get PO with consumption log |
| POST | `/api/purchase-orders` | Create PO |
| PUT | `/api/purchase-orders/:id` | Update PO |
| PATCH | `/api/purchase-orders/:id/consume` | Record consumption |
| GET | `/api/purchase-orders/alerts` | Get POs nearing threshold/expiry |
| PATCH | `/api/purchase-orders/:id/renew` | Renew PO |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Summary stats + recent runs + alerts |

### Response Format
All API responses follow this envelope:
```json
// Success
{ "success": true, "data": { ... } }

// Error
{ "success": false, "error": "Error message" }
```

---

## 8. Database Schema

### Tables
1. **clients** - Client information with soft-delete
2. **rate_cards** - Employee rate cards linked to clients (UNIQUE: client_id + emp_code)
3. **attendance** - Daily attendance records (UNIQUE: emp_code + billing_month + day_number)
4. **billing_runs** - Audit log of billing generations
5. **billing_items** - Per-employee calculation results for each run
6. **billing_errors** - Per-employee errors for each run
7. **quotes** + **quote_items** - Quote management with line items
8. **purchase_orders** - PO tracking with value consumption
9. **po_consumption_log** - Consumption event history

### Key Relationships
- `rate_cards.client_id` → `clients.id`
- `billing_items.billing_run_id` → `billing_runs.id`
- `billing_errors.billing_run_id` → `billing_runs.id`
- `quotes.client_id` → `clients.id`
- `quote_items.quote_id` → `quotes.id`
- `purchase_orders.client_id` → `clients.id`
- `po_consumption_log.po_id` → `purchase_orders.id`

---

## 9. Validation Rules

### Rate Card
- Required columns present: client_name, emp_code, emp_name, monthly_rate, leaves_allowed
- emp_code unique within the file
- monthly_rate must be a positive number
- leaves_allowed must be a non-negative integer

### Attendance
- Required columns: emp_code + day number columns
- Day values must be "P" or "L" (case-insensitive, normalized to uppercase)
- emp_code unique (one row per employee)
- Days beyond month length are ignored

### Cross-validation
- Employees in Rate Card but missing in Attendance → Error
- Employees in Attendance but missing in Rate Card → Error

### Billing Month
- Format: YYYYMM (6 digits)
- Year: 2020-2099
- Month: 01-12

---

## 10. Error Handling

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

Fatal errors (bad file, missing month) return HTTP 400. Employee-level errors are collected in the Error_Report sheet while valid employees are still processed.

---

## 11. Edge Cases Handled

1. **Variable month lengths** - DaysInMonth dynamically calculated (28/29/30/31)
2. **Leap years** - February correctly returns 29 days for leap years
3. **Header name variations** - Case-insensitive matching with aliases ("Employee Code" → emp_code)
4. **Excel date formats** - Handles both JavaScript Date objects and string dates for DOJ
5. **Empty rows** - Skipped during parsing
6. **Partial data** - Employees with errors are reported; valid employees are still billed
7. **Excess day columns** - Columns 29-31 ignored for months with fewer days

---

## 12. Scalability Considerations

### Current Limitations
- SQLite is single-writer (appropriate for single-user demo)
- File-based DB limits to single-server deployment
- In-memory processing for Excel files

### Scaling Strategies
1. **Database** - Migrate to PostgreSQL for multi-user concurrent access
2. **File Processing** - Use ExcelJS streaming API for files with 1000+ rows
3. **Async Jobs** - Queue billing generation as background jobs (Bull/Redis)
4. **Caching** - Redis for rate card lookups and dashboard stats
5. **Horizontal Scaling** - Stateless Express servers behind a load balancer
6. **File Storage** - S3/Azure Blob for generated files instead of local disk
7. **API Rate Limiting** - Add rate limiting middleware for production

### Production Readiness Checklist
- [ ] Switch to PostgreSQL
- [ ] Add authentication/authorization (JWT)
- [ ] Implement request logging (Winston/Morgan)
- [ ] Add API rate limiting
- [ ] Set up HTTPS
- [ ] Docker containerization
- [ ] CI/CD pipeline
- [ ] Monitoring and alerting
- [ ] Automated backups
- [ ] Input sanitization audit

---

## 13. Testing

### Manual Test with Sample Files
```bash
# Start the server
npm run dev

# Open browser
http://localhost:3000

# Navigate to Billing page
# Upload data/TestRateCard.xlsx and data/TestAttendance.xlsx
# Enter billing month: 202602
# Click Generate
# Download the output file
```

### Expected Results for Test Data (Feb 2026, 28 days)
| Emp Code | Monthly Rate | Leaves Taken | Leaves Allowed | Chargeable Days | Invoice Amount |
|----------|-------------|--------------|----------------|-----------------|----------------|
| EMP001 | 50,000 | 2 | 2 | 28 | 46,666.67 |
| EMP002 | 60,000 | 3 | 1 | 26 | 52,000.00 |
| EMP003 | 45,000 | 0 | 2 | 30 | 45,000.00 |
| EMP004 | 70,000 | 4 | 3 | 27 | 63,000.00 |
| EMP005 | 55,000 | 1 | 2 | 29 | 53,166.67 |
| **Total** | | | | | **259,833.34** |
