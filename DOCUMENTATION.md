# TeamBees Billing Generator Documentation

## 1. Executive Summary

TeamBees Billing Generator is a business operations system built for staffing and consulting teams. It helps teams manage the full path from client documents to billing output, while also supporting follow-up workflows for permanent hiring invoices and reminders.

At a simple level, the platform helps a business answer questions like:

- Which clients are active?
- What commercial documents exist for each client?
- Which employees are billable under which purchase order?
- What attendance was recorded for the month?
- What billing should be raised?
- Has that billing been approved?
- Has the linked purchase order been reduced only after approval?
- For permanent hiring work, which reminders, invoices, and payments are still pending?

This documentation is written in layers:

1. First, it explains the product in business language.
2. Then, it explains the workflows and modules.
3. Finally, it goes deeper into the technical design, APIs, and deployment approach.

The goal is that a non-technical stakeholder can read the beginning and understand the product, while engineers and operations teams can continue deeper into the later sections.

---

## 2. What the Product Does

### 2.1 Business purpose

The system replaces fragmented spreadsheet-based billing operations with a structured process.

Instead of tracking clients, quotes, agreements, purchase orders, attendance, invoices, and reminders across many disconnected sheets and emails, the platform brings them into one system.

### 2.2 Main business areas

The product supports two major operational areas.

#### Contractual billing operations

This area covers:

- client records
- quotes
- statements of work
- purchase orders
- employee rate cards
- attendance
- billing generation
- approval and PO consumption

#### Permanent hiring follow-up

This area covers:

- permanent clients
- permanent orders
- reminders
- invoice sent tracking
- payment status tracking
- email reminder follow-up

### 2.3 Why this matters

Without a controlled system, businesses commonly face:

- billing mistakes caused by manual calculations
- missing visibility into how much of a purchase order is already used
- weak traceability between commercial documents and billing output
- difficult invoice dispute resolution
- inconsistent follow-up for permanent hiring invoices

This platform improves:

- accuracy
- auditability
- control
- visibility
- speed of monthly operations

---

## 3. Product Journey in Plain Language

### 3.1 Contractual billing journey

In simple terms, the contractual billing journey works like this:

1. A client is created.
2. A quote is prepared for that client.
3. The quote becomes a statement of work.
4. A purchase order is linked to the work.
5. Employees are attached through rate cards.
6. Attendance is recorded.
7. Billing is generated.
8. The billing is reviewed as a service request.
9. Only after approval is the purchase order balance reduced.

This is an important control. The system does not immediately reduce a purchase order just because a file was generated. It waits for an acceptance decision.

### 3.2 Permanent hiring journey

For permanent hiring, the process is different:

1. A permanent client is created.
2. A permanent order is created for a role or candidate.
3. A reminder is tracked around the expected billing date.
4. Teams can record whether the invoice was sent.
5. Teams can record whether the payment is still pending or already received.
6. Reminder emails can be sent manually or automatically.

### 3.3 Why the approval step is important

Many systems reduce purchase order value immediately when billing is generated. That creates financial risk if the billing is still under review.

This system introduces a controlled approval step:

- billing is generated first
- the result is stored
- the output is reviewed
- a decision is recorded
- only approved billing affects the purchase order balance

That makes the system safer for finance and operations teams.

---

## 4. Functional Overview

### 4.1 Billing

The billing module allows users to:

- generate billing from uploaded Excel files
- generate billing from records already stored in the system
- store each run for history and audit
- download output workbooks
- review errors without losing valid output
- accept or reject the billing request

### 4.2 Clients

The client module stores the business entities that all other operations depend on.

It supports:

- client creation
- updates
- viewing
- removal or deactivation through the application flow

### 4.3 Quotes

The quote module supports commercial proposal creation.

It includes:

- quote details
- line items
- structured text sections for business communication
- downloadable documents
- quote status management
- conversion into a statement of work

### 4.4 Statements of work

The SOW module handles formal work agreements.

It supports:

- creation
- amendment
- status updates
- document linking
- linked commercial file storage

### 4.5 Purchase orders

The purchase order module tracks:

- purchase order details
- alerts
- linked employees
- consumption activity
- renewal

### 4.6 Rate cards

Rate cards define billable employee information such as:

- employee identity
- reporting details
- leave allowance
- billable rate
- linked commercial context

### 4.7 Attendance

Attendance can be recorded through:

- manual entry
- bulk entry
- Excel upload

This information supports monthly billing calculations.

### 4.8 Dashboard and reporting

The dashboard gives a high-level operational view, including:

- overall counts
- recent billing activity
- purchase order alerts
- revenue trends
- tracker export support

### 4.9 Permanent reminders

Permanent reminder workflows support:

- reminder tracking
- invoice status updates
- payment status updates
- recipient updates
- due date extensions
- manual mail sending
- scheduled mail sending

---

## 5. How the System Is Organized

### 5.1 High-level view

The product has four main layers:

1. The browser interface used by the business team
2. The application server
3. The business-logic layer
4. The database

### 5.2 Browser interface

Users work through a browser-based single-page application.

This interface provides:

- login
- navigation between modules
- forms and tables
- dashboard views
- downloads
- reminder actions

### 5.3 Application server

The application server receives requests from the browser, validates them, runs business logic, talks to the database, and returns results.

It also:

- serves the web interface
- handles file uploads
- protects API routes
- runs the reminder scheduler

### 5.4 Business-logic layer

The system separates request handling from core business rules.

This means:

- controllers handle incoming requests
- services perform calculations and workflow logic
- models handle database access

This structure makes the application easier to maintain and extend.

### 5.5 Database layer

The database stores:

- clients
- commercial records
- purchase orders
- employee billing records
- attendance
- billing history
- reminders
- invoice and payment tracking details

---

## 6. Important Business Controls

### 6.1 Approval before PO reduction

This is one of the most important controls in the system.

The platform does not reduce purchase order value immediately when billing is generated. It stores the billing request first. A user must approve it before the related purchase order is affected.

### 6.2 Error collection instead of full failure

When some billing rows are invalid, the system does not necessarily discard the entire run. It captures the errors and still allows valid output to be produced where appropriate.

This is useful for operational teams because one bad row does not always stop the month-end process completely.

### 6.3 Traceability between commercial records and billing

The platform is designed so that billing can be traced back through the related commercial records. This improves audit readiness and dispute handling.

### 6.4 Reminder state tracking

In the permanent workflow, reminder records can track whether:

- the reminder is still open
- the invoice was sent
- the payment is pending
- the payment is complete
- reminder communication has already been sent

---

## 7. User-Facing Modules

### 7.1 Dashboard

The dashboard is the overview screen for the platform. It is intended for quick operational understanding.

Typical information shown:

- totals and counts
- recent billing runs
- purchase order alert indicators
- revenue trends

### 7.2 Clients

The client area is the foundation for all business activity in the platform. It stores the client records needed for commercial and billing flows.

### 7.3 Quotes

The quote area is used to prepare and manage commercial proposals. Quotes can later move into more formal agreement stages.

### 7.4 Statements of work

The SOW area is used to manage structured work agreements, including document linking and amendments.

### 7.5 Purchase orders

The PO area is used to manage financial approval boundaries for work being billed.

### 7.6 Rate cards

The rate card area connects employees to billable commercial context.

### 7.7 Attendance

The attendance area captures the time and leave information needed to calculate billing correctly.

### 7.8 Billing

The billing area is where monthly billing is generated, reviewed, and finalized.

### 7.9 Orders and reminders

The permanent operations area manages order follow-up, reminders, and payment progress for permanent hiring work.

---

## 8. Technical Architecture

### 8.1 Technology summary

The system uses a modern but lightweight stack:

- Node.js for server runtime
- Express for the web server and APIs
- Supabase PostgreSQL for data storage
- Supabase Auth for authentication
- vanilla JavaScript in the frontend
- Tailwind CSS for interface styling
- Excel processing libraries for import and export
- document generation for quote output
- Microsoft Graph integration for reminder email sending

### 8.2 Frontend architecture

The frontend is a single-page application.

Key characteristics:

- browser-based
- no build pipeline required for deployment
- page modules loaded dynamically
- route-based navigation inside the application shell
- direct interaction with the backend API

### 8.3 Backend architecture

The backend is an Express application that:

- exposes business APIs
- validates requests
- handles uploads
- serves static frontend files
- checks health status
- schedules reminder dispatch

### 8.4 Application layering

The codebase is intentionally layered:

- routes define API entry points
- controllers coordinate request handling
- services execute business rules
- models manage database operations
- middleware handles cross-cutting concerns like auth, validation, upload, and errors

### 8.5 Database architecture

The system uses a PostgreSQL database hosted through Supabase.

The repository includes:

- a main schema file
- migration files for incremental changes
- seed and support scripts

Database-side logic supports areas such as:

- reporting views
- workflow support
- purchase order logic
- dashboard aggregation
- reminder and invoice tracking additions

---

## 9. Repository Structure

The project is organized into clear application areas.

### 9.1 Main folders

- `config` for application configuration
- `controllers` for request handling
- `database` for schema, migrations, and seed logic
- `middleware` for authentication, validation, upload, and error handling
- `models` for database access
- `public` for the browser interface
- `routes` for API definitions
- `services` for business logic
- `validators` for request validation rules
- `uploads` for uploaded files
- `output` for generated files

### 9.2 Why this matters

This structure makes the code understandable for developers because each responsibility lives in a predictable place.

---

## 10. Setup and Environment

### 10.1 Prerequisites

To run the application, the hosting environment needs:

- a supported Node.js runtime
- package management through npm
- access to the backing database platform
- proper application configuration values

### 10.2 Application configuration

The application depends on configuration for:

- server runtime behavior
- database connectivity
- upload and output storage locations
- security and CORS behavior
- billing behavior settings
- reminder email integration

For security reasons, this documentation intentionally does not publish confidential configuration values or deployment secrets.

### 10.3 Database preparation

Before the application runs correctly, the database schema and later migrations must be applied.

This is especially important for features such as:

- billing approval workflow
- reminder email flow
- invoice tracking
- document indexing

### 10.4 Starting the application

The project supports:

- a development mode
- a standard production server start

It also includes supporting commands for:

- seeding sample data
- linting
- formatting

---

## 11. Authentication and Security

### 11.1 Authentication model

The platform uses token-based authentication through Supabase Auth.

In practice:

- users sign in through the web interface
- the frontend keeps the user session
- API requests include the user token
- protected routes reject requests without valid authentication

### 11.2 Protected APIs

All application APIs are protected except the health-check endpoint.

### 11.3 Security middleware

The backend uses common web protections such as:

- secure HTTP header handling
- cross-origin request control
- request rate limiting

### 11.4 Data sensitivity

This system handles commercially sensitive operational data. Documentation and deployment practices should avoid exposing:

- secrets
- tokens
- credentials
- server-specific confidential paths
- internal-only configuration data

---

## 12. API Overview

This section describes the main application capabilities exposed through the backend.

### 12.1 Billing APIs

Used for:

- billing generation
- billing history lookup
- service-request decisions
- file downloads

### 12.2 Client APIs

Used for:

- listing clients
- viewing a client
- creating clients
- updating clients
- removing clients

### 12.3 Rate card APIs

Used for:

- rate card management
- export
- import
- leave allowance updates

### 12.4 Attendance APIs

Used for:

- submission
- bulk upload
- summary lookup
- month-based cleanup

### 12.5 Quote APIs

Used for:

- quote lifecycle management
- document download
- status changes
- conversion into SOW records

### 12.6 SOW APIs

Used for:

- SOW lifecycle management
- amendments
- linked document upload and retrieval

### 12.7 Purchase order APIs

Used for:

- purchase order management
- alerts
- consumption actions
- renewal
- employee linkage lookup

### 12.8 Permanent workflow APIs

Used for:

- permanent client management
- permanent order management
- reminder actions
- invoice tracking updates
- payment tracking updates
- reminder email sending

### 12.9 Dashboard APIs

Used for:

- dashboard statistics
- tracker export

### 12.10 Sample file APIs

Used for:

- sample rate card downloads
- sample attendance downloads

### 12.11 Public health API

Used for:

- service health verification
- deployment and uptime checks

---

## 13. Billing Logic in More Detail

### 13.1 Billing input options

Billing can begin in two ways:

- from uploaded source files
- from records already stored in the application

This makes the system useful both for teams still using spreadsheets and for teams already working fully inside the platform.

### 13.2 Main calculation concepts

The billing calculation depends on concepts such as:

- billing month
- monthly rate
- reporting or charging date
- attendance
- leaves allowed
- effective billing days
- divisor rules

### 13.3 Business behavior

The system supports:

- pro-rated billing for employees who start within the month
- skip or error handling for invalid future billing scenarios
- controlled chargeable-day limits
- structured error reporting

### 13.4 Output

Billing output is generated as a workbook with business-friendly worksheets, including a working sheet, summary sheet, and error sheet.

The output can then be downloaded for operational use.

---

## 14. Quote and Document Handling

### 14.1 Quote documents

Quotes support document output suitable for business communication.

The application primarily generates quote documents in a modern editable format, while also maintaining an alternate export path for PDF.

### 14.2 Structured content

Quote content is not treated as just a single text block. The system supports a more structured communication format so that business messaging can be prepared more consistently.

### 14.3 Linked documents for SOWs and POs

The system also supports linked commercial document management.

This helps teams keep related business documents connected to the right agreement context instead of leaving them scattered outside the application.

---

## 15. Reminder and Mail Workflow

### 15.1 Reminder lifecycle

A reminder can move through a business process such as:

- open
- invoice sent
- payment pending
- payment completed
- closed

### 15.2 Manual reminder actions

Users can:

- update recipients
- mark invoice sent
- update payment status
- extend due dates
- close reminders
- send reminder emails manually

### 15.3 Scheduled reminder sending

The backend includes a scheduler that can check for due reminders and send emails automatically at configured intervals.

### 15.4 Operational safeguards

The scheduler is designed not to start improperly when required mail configuration is incomplete.

The reminder logic also provides resilience when some reminder-related database fields are not yet available in an older environment.

---

## 16. Data, Files, and Generated Output

### 16.1 Upload handling

The system handles file upload for areas such as:

- billing source files
- rate card imports
- attendance imports
- linked commercial documents

### 16.2 Generated files

The system generates files such as:

- billing workbooks
- quote documents
- tracker exports

### 16.3 Storage behavior

Uploaded files and generated outputs are stored in application-controlled directories configured for the environment.

This documentation intentionally does not disclose deployment-specific filesystem details.

---

## 17. Database Evolution and Migrations

### 17.1 Why migrations matter

The project has evolved over time. New features were added through database migrations, not just application code changes.

That means successful deployment depends on both:

- the application code
- the correct database version

### 17.2 Feature areas affected by migrations

Migrations are important for:

- billing approval flow
- permanent client and order support
- reminder mail support
- invoice tracking
- document indexing
- row-level isolation improvements

### 17.3 Operational recommendation

Whenever a new version of the application is deployed, the database migration status should be checked before the application is considered fully updated.

---

## 18. Deployment Architecture

### 18.1 Production hosting context

This application is deployed on an AWS Lightsail instance.

That means the production setup typically consists of:

- the application code on the Lightsail server
- a Node.js runtime on that server
- process management to keep the app running
- environment-specific configuration on the server
- connectivity from the server to the hosted database platform

### 18.2 Typical production flow

A standard production update usually follows this order:

1. Update the code on the Lightsail instance.
2. Install or refresh dependencies.
3. apply any required database migrations.
4. verify secure configuration values on the server.
5. restart the application process.
6. validate the health endpoint and main workflows.

### 18.3 Runtime management

For production reliability, the application should run under a proper process manager or service manager so that:

- it starts automatically
- it restarts on failure
- logs can be monitored

### 18.4 Post-deployment validation

After deployment, the following should be checked:

- health endpoint response
- login flow
- dashboard load
- at least one protected API
- billing generation path
- reminder workflow if mail is enabled

### 18.5 Security guidance for deployment

Production documentation and operational notes should never expose:

- credentials
- API keys
- tokens
- instance-specific sensitive file locations
- confidential configuration values

---

## 19. Scripts and Developer Workflow

The project includes commands for:

- starting the server in production mode
- running in development mode
- seeding sample data
- linting code
- formatting code

These commands support local development and operational maintenance, but production credentials and infrastructure details should always remain outside committed documentation.

---

## 20. Known Notes for Teams

### 20.1 Terminology

Different parts of the project may still use older naming in places. For example, some areas may refer to the product as a billing engine, while current business-facing wording is closer to a service-request and billing operations platform.

### 20.2 Legacy support

Some features remain available for compatibility even when another path is now the preferred path. For example, quote PDF support still exists even though the editable document path is the more current primary output.

### 20.3 Audience guidance

Non-technical readers should focus mainly on:

- sections 1 through 7
- section 18 for deployment context

Technical readers should continue into:

- sections 8 onward

---

## 21. Final Summary

TeamBees Billing Generator is a professional operations platform for managing billing and follow-up workflows in staffing and consulting environments.

Its main strengths are:

- structured business workflow
- approval-based financial control
- billing traceability
- document support
- reminder tracking
- production-friendly architecture
- operational deployment on AWS Lightsail

This document is intended to remain the primary professional documentation for the project, without exposing confidential environment details, local machine paths, or sensitive deployment information.
