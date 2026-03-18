# TeamBees Billing Engine

Automated monthly billing engine for employee rate card and attendance-based invoicing with Purchase Order tracking.

## Features

- **Billing Generation** - From Excel files or stored database records
- **Rate Card Management** - Employee billing rates with PO linkage and Excel import/export
- **Attendance Tracking** - Manual entry or bulk Excel upload
- **Purchase Orders** - Auto-consumption from billing, threshold alerts, renewal with employee migration
- **Quotes** - Full lifecycle with PDF export and convert-to-PO workflow
- **Statements of Work** - SOW management with auto-generated numbers and PO linkage
- **Dashboard** - Stats, revenue chart, PO alerts, billing history
- **Authentication** - Supabase Auth (JWT-based)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (JWT) |
| Excel | ExcelJS |
| PDF | PDFKit |
| Frontend | Vanilla JS + Tailwind CSS (CDN) |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template and configure Supabase credentials
cp .env.example .env

# Run database schema in Supabase SQL Editor
# → database/supabase_schema.sql

# Start development server
npm run dev
```

Open **http://localhost:3000** in your browser.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| SUPABASE_URL | Yes | Supabase project URL |
| SUPABASE_ANON_KEY | Yes | Supabase anonymous key |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Supabase service role key |
| PORT | No | Server port (default: 3000) |
| BILLING_DIVISOR | No | `actual` or `30` (default: actual) |

See [.env.example](.env.example) for all options.

## Billing Formula

```
ChargeableDays = DaysInMonth - LeavesTaken + LeavesAllowed
InvoiceAmount  = (ChargeableDays / Divisor) x MonthlyRate
```

Invoice amounts are automatically deducted from linked Purchase Orders.

## API Endpoints

All routes require `Authorization: Bearer <token>` header.

| Resource | Base Path |
|----------|-----------|
| Billing | `/api/billing` |
| Clients | `/api/clients` |
| Rate Cards | `/api/rate-cards` |
| Attendance | `/api/attendance` |
| Quotes | `/api/quotes` |
| SOWs | `/api/sows` |
| Purchase Orders | `/api/purchase-orders` |
| Dashboard | `/api/dashboard` |
| Health Check | `/health` (no auth) |

See [DOCUMENTATION.md](DOCUMENTATION.md) for full API reference.

## Project Structure

```
├── config/          # Environment + database config
├── controllers/     # HTTP request handlers
├── models/          # Supabase data access layer
├── services/        # Business logic (billing, Excel, validation)
├── validators/      # Joi request schemas
├── middleware/       # Auth, error handling, upload, validation
├── routes/          # Express route definitions
├── database/        # SQL schema + migrations
├── public/          # Frontend SPA (HTML + JS + CSS)
└── data/            # Sample Excel files
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start with auto-restart (nodemon) |
| `npm run db:seed` | Seed database with sample data |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |

## Documentation

- [DOCUMENTATION.md](DOCUMENTATION.md) - Full technical documentation
- [CHANGELOG.md](CHANGELOG.md) - Version history and changes

## Author

TeamBees
