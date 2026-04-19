# Project Architecture: InfoBill (Product Sales Management)

This document provides an in-depth overview of the system architecture, technology stack, data models, background processes, and rules for the InfoBill Point of Sale (POS) & Billing application.

## 1. System Overview
The application is a standalone, offline-first POS system designed to run as a desktop application. It employs a modern layered architecture composed of a React front end, a Python Flask back end, and an Electron desktop wrapper for native capabilities. All data is persisted locally using SQLite.

## 2. Technology Stack

### Frontend (Client Layer)
- **Framework:** React 18
- **Build Tool:** Create React App (react-scripts)
- **Routing:** React Router v7
- **UI & Animations:** Framer Motion (for fluid UI transitions), FontAwesome & React Icons
- **Data Visualization:** Recharts
- **Networking:** Axios (HTTP client), Socket.io-client for real-time updates proxying to the local backend port (5050).

### Backend (API & Business Logic Layer)
- **Framework:** Flask (Python)
- **ORM & Database:** SQLAlchemy with SQLite for reliable local storage without external installations.
- **Cross-Origin Resource Sharing:** Flask-CORS
- **Multithreading:** Built-in Python `threading` for background tasks (e.g., dashboard refresh, reminder checking).

### Desktop Native Layer
- **Environment:** Electron.js wrapper
- **Packaging:** Electron Builder for generating Windows installation packages (`.exe`) and managing auto-updates via `electron-updater`.
- **Inter-Process Communication:** Secure IPC bridge (`electron/preload.js`).

---

## 3. Core Modules & Endpoints

The backend is modularized into **12 distinct Flask Blueprints** registered in `app.py`. Each blueprint lives in the `routes/` directory (except `auth.py` at the backend root). Every mutating endpoint is guarded by the `@require_auth` decorator, which is a **no-op pass-through** when PIN login is disabled in Settings, and enforces a valid JWT `Bearer` token when enabled. All routes use the centralized `@safe_route` error handler.

### Overview Table

| Blueprint | Prefix | File | Responsibility |
|-----------|--------|------|----------------|
| `products_bp` | `/api/products` | `routes/products.py` | Product CRUD, image upload (auto background removal), soft/permanent delete |
| `billing_bp` | `/api/bill` | `routes/billing.py` | Checkout, bill CRUD, cancel, reprint, daily token reset |
| `summary_bp` | `/api/summary` | `routes/summary.py` | Dashboard analytics, date/range summaries, pre-aggregated lookups |
| `categories_bp` | `/api/categories` | `routes/categories.py` | Category CRUD, usage checks, safe deactivation |
| `inventory_bp` | `/api/inventory` | `routes/inventory.py` | Stock management, low-stock alerts, stock adjustments, locked-item guards |
| `workers_bp` | *(no prefix)* | `routes/workers.py` | Employee lifecycle, attendance, advances, salary generation |
| `expenses_bp` | `/api/expenses` | `routes/expenses.py` | Expense tracking with optional line-items, inventory auto-restock |
| `reports_bp` | `/api/reports` | `routes/reports.py` | Excel/CSV/XML export (daily, weekly, monthly, expenses) |
| `pos_bp` | `/api/pos` | `routes/pos.py` | Single-request POS bootstrap aggregation endpoint |
| `settings_bp` | *(no prefix)* | `routes/settings.py` | Key-value settings store (printer, shop profile, theme) |
| `reminders_bp` | `/api/reminders` | `routes/reminders.py` | Reminder CRUD, snooze, dismiss, auto-advance for repeating reminders |
| `auth_bp` | `/api/auth` | `auth.py` | PIN setup, login, JWT issue/verify, auth status check |

---

### 3.1 Products (`/api/products`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/products` | No | Get all products (cached). Query params: `include_inactive`, `include_deleted`, `include_stock`. |
| `GET` | `/api/products/<product_id>` | No | Get a single product by ID. |
| `POST` | `/api/products` | Yes | Create a product. Validates via `ProductCreateSchema`. Auto-resolves `category_id` from name. Invalidates cache. |
| `PUT` | `/api/products/<product_id>` | Yes | Update product fields (name, price, category, active, favorite). Auto-renames image file on name change. |
| `DELETE` | `/api/products/<product_id>` | Yes | **Soft-delete** (deactivate) by default. Pass `?permanent=true` + `x-admin-password` header for hard delete (also removes image from disk). |
| `POST` | `/api/products/<product_id>/image` | Yes | Upload product image. Runs **rembg** (u2netp model) for automatic background removal; saves as PNG. |
| `DELETE` | `/api/products/<product_id>/image` | Yes | Delete product image from disk and DB. |
| `POST` | `/api/products/reset-database` | Yes | **Dangerous:** Clears ALL products and bills. Requires `password` in body matching `RESET_PASSWORD` from config. |

### 3.2 Billing (`/api/bill`)

| Method | Endpoint | Auth | Rate Limit | Description |
|--------|----------|------|------------|-------------|
| `POST` | `/api/bill/create` | Yes | 60/min | Create a bill. Validates each product against DB (must be active). Calculates total server-side. Optionally triggers thermal printer. Updates `DailySalesSummary` via aggregation service. |
| `GET` | `/api/bill/<bill_no>` | No | — | Get a specific bill by number. |
| `GET` | `/api/bill/today` | No | — | Get all bills for today. Supports `?page=N&per_page=N` pagination. |
| `GET` | `/api/bill/date/<YYYY-MM-DD>` | No | — | Get all bills for a specific date. |
| `GET` | `/api/bill/next-number` | No | — | Get the next sequential bill number for today. |
| `GET` | `/api/bill/management/all` | No | — | Get ALL bills (including cancelled). Optional `?date=` filter. |
| `PUT` | `/api/bill/<bill_no>/cancel` | Yes | — | Cancel a bill. Re-aggregates daily summary. |
| `PUT` | `/api/bill/<bill_no>/update` | Yes | — | Update an existing bill's items/total. Re-validates all products. |
| `POST` | `/api/bill/print/<bill_no>` | Yes | — | Reprint an existing bill via thermal printer. |
| `DELETE` | `/api/bill/clear` | Yes | — | **Dangerous:** Clear ALL bills. Requires `password` in body. |

### 3.3 Summary (`/api/summary`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/summary/today` | No | Today's sales summary (total sales, bills, avg value, peak hour, category breakdown). |
| `GET` | `/api/summary/date/<YYYY-MM-DD>` | No | Summary for a specific date. Validates date range 2020–2030. |
| `GET` | `/api/summary/top-products` | No | Top selling products for today. `?limit=N` (max 100, default 10). |
| `GET` | `/api/summary/quick-stats` | No | Lightweight dashboard stats (bills count, sales, avg bill, peak hour). |
| `GET` | `/api/summary/product-sales` | No | Detailed per-product sales breakdown. Optional `?date=` for a specific date. |
| `GET` | `/api/summary/range` | No | Aggregated summary for a range type (`week`, `month`, etc). `?range=week&date=YYYY-MM-DD`. |
| `GET` | `/api/summary/aggregated` | No | **Pre-aggregated** daily summaries from `DailySalesSummary` table. `?start=YYYY-MM-DD&end=YYYY-MM-DD`. Returns daily array + computed totals/net profit. |

### 3.4 Categories (`/api/categories`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/categories` | No | Get all categories (cached). `?include_inactive=true` to include deactivated. |
| `POST` | `/api/categories` | Yes | Create a new category. Duplicate name check enforced. |
| `PUT` | `/api/categories/<category_id>` | Yes | Update category name/description/active status. Duplicate name guard. |
| `DELETE` | `/api/categories/<category_id>` | Yes | **Safe delete:** If category is in use by products, it is *deactivated* instead of deleted. |
| `GET` | `/api/categories/<category_id>/usage` | No | Check if a category is referenced by any products. |

### 3.5 Inventory (`/api/inventory`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/inventory` | No | Get all inventory items with status. |
| `GET` | `/api/inventory/low-stock` | No | Get items below their `min_stock` threshold. |
| `GET` | `/api/inventory/<item_id>` | No | Get a specific inventory item. |
| `POST` | `/api/inventory/create` | Yes | Create a new inventory item linked to a product. Fails if product is already linked or inactive. |
| `PUT` | `/api/inventory/<item_id>` | Yes | Update inventory details. **Blocked** if the linked product is inactive (`is_locked`). |
| `POST` | `/api/inventory/adjust` | Yes | Adjust stock level (+/−). Also blocked for locked (inactive product) items. |
| `DELETE` | `/api/inventory/<item_id>` | Yes | Delete inventory item. Blocked for locked items. |

### 3.6 Workers (`/api/workers`)

> **Note:** This blueprint does **not** use a `url_prefix`. All routes are defined with full paths inline.

#### Worker CRUD
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/workers` | No | Get all workers with today's attendance status and current salary-cycle advance totals. |
| `GET` | `/api/workers/<worker_id>` | No | Get a specific worker with current cycle stats (advance, net payable). |
| `POST` | `/api/workers` | Yes | Create a new worker. |
| `PUT` | `/api/workers/<worker_id>` | Yes | Update worker details (name, role, salary, phone, etc). |
| `DELETE` | `/api/workers/<worker_id>` | Yes | **Soft-delete** — sets status to inactive. |

#### Advances
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/workers/<worker_id>/advance` | Yes | Record an advance payment. Also creates a linked `Expense` entry automatically. |
| `GET` | `/api/workers/<worker_id>/advances` | No | Get all advances for a worker. |
| `GET` | `/api/workers/<worker_id>/expenses` | No | Get all expenses linked to a specific worker. |

#### Salary
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/workers/<worker_id>/salary-history` | No | Get salary payment history. |
| `POST` | `/api/workers/<worker_id>/generate-salary` | Yes | Generate salary record for a given month/year. Calculates `base - advances = final`. |
| `POST` | `/api/salary/<payment_id>/pay` | Yes | Mark a salary payment as paid. |
| `GET` | `/api/workers/salary/status` | No | Check salary status for all workers for a given month/year. |

#### Attendance
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/workers/<worker_id>/attendance` | No | Get attendance history for a worker. |
| `POST` | `/api/workers/<worker_id>/attendance` | Yes | Mark attendance (Present/Absent/Half-day) with optional check-in/out times. |
| `PUT` | `/api/workers/<worker_id>/attendance` | Yes | Update an attendance record (e.g., add check-out time). |
| `POST` | `/api/workers/attendance/bulk` | Yes | Bulk-mark all active workers as Present for today. |
| `GET` | `/api/workers/attendance/status` | No | Check if attendance has been marked for today. |

#### Stats
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/workers/stats` | No | Aggregate stats: total/active workers, present today, total salary, net payable for current cycle. |

### 3.7 Expenses (`/api/expenses`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/expenses` | No | Get expenses with filters: `?range=today|week|month|year`, `?category=`, `?worker_id=`, `?limit=N`. |
| `GET` | `/api/expenses/<expense_id>` | No | Get a specific expense with its line-items. |
| `POST` | `/api/expenses` | Yes | Create an expense. Supports optional `items[]` array with line-items. **Auto-restocks** inventory if category is `Supplies` and a matching inventory product exists. Updates `DailySalesSummary`. |
| `PUT` | `/api/expenses/<expense_id>` | Yes | Update expense fields and/or replace line-items. |
| `DELETE` | `/api/expenses/<expense_id>` | Yes | Hard-delete an expense. Re-aggregates daily summary. |

### 3.8 Reports (`/api/reports`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/reports/excel/today` | No | Export sales report as `.xlsx`. `?date=YYYY-MM-DD` for specific date. `?type=simple|summary|detailed`. Generates sample report if no bills exist for today. |
| `GET` | `/api/reports/csv/today` | No | Export today's bills as raw CSV. |
| `GET` | `/api/reports/preview/excel` | No | Preview Excel data as JSON without downloading. |
| `GET` | `/api/reports/preview/xml` | No | Preview XML representation of today's bills. |
| `GET` | `/api/reports/available-reports` | No | List all available report types with endpoint metadata. |
| `GET` | `/api/reports/excel/monthly` | No | Monthly product-wise sales report. `?month=N&year=N`. |
| `GET` | `/api/reports/excel/weekly` | No | Weekly product-wise sales report. `?date=YYYY-MM-DD`. |
| `GET` | `/api/reports/excel/expenses` | No | Export expenses report. `?range=today|week|month|year`. |

### 3.9 POS Bootstrap (`/api/pos`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/pos/bootstrap` | No | **Single aggregation endpoint** that returns everything the POS screen needs in one request: products (with stock), categories, active workers, all settings, and the next bill number. Eliminates 5+ separate API calls on POS load. Leverages in-memory cache for all data except `next_bill_number` (always fresh). Also returns `_cache_stats`. |

### 3.10 Settings (`/api/settings`)

> **Note:** This blueprint does **not** use a `url_prefix`. Routes are defined with full paths.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/settings` | No | Get all settings as a key-value dict (cached). |
| `PUT` | `/api/settings` | Yes | Update settings. Accepts a JSON dict `{key: value}` or array `[{key, value}]`. Invalidates cache. |

### 3.11 Reminders (`/api/reminders`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/reminders` | No | Get all reminders for a user. `?user_id=admin`, `?include_dismissed=true`. |
| `POST` | `/api/reminders` | Yes | Create a new reminder with `title`, `reminder_time` (ISO), `repeat_type` (once/daily/weekly/monthly). |
| `POST` | `/api/reminders/<id>/snooze` | Yes | Snooze a triggered reminder by N minutes (`?minutes=5`). Resets status to `pending`. |
| `PUT/POST` | `/api/reminders/<id>/dismiss` | Yes | Dismiss a reminder. **Repeating reminders** automatically advance to the next occurrence instead of being marked completed. |
| `DELETE` | `/api/reminders/<id>` | Yes | Permanently delete a reminder. |

### 3.12 Authentication (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/status` | No | Returns whether PIN auth is enabled globally and whether a PIN has been configured. |
| `POST` | `/api/auth/setup` | No* | First-time PIN setup (4–6 digits). If a PIN already exists, requires `current_pin` for verification. Auto-enables `require_pin_login`. Returns JWT. |
| `POST` | `/api/auth/login` | No | Authenticate with PIN. Returns 8-hour JWT token. If auth is disabled, returns token without requiring PIN. |
| `GET` | `/api/auth/verify` | Yes | Simple ping to validate that the current JWT token is still valid. |

> **Auth Model:** PIN is hashed with **bcrypt**. Tokens are **HS256 JWT** with an 8-hour expiry (typical business shift). The `require_auth` decorator checks the `require_pin_login` setting on every request — when disabled, all `@require_auth` endpoints become freely accessible.

---

## 4. Deep-Dive: Data Models (SQLAlchemy ERD)

Data is modeled to reflect daily retail workflows and employee lifecycle management. The key models are:

### POS & Inventory
- **Product & Category:** Central repository for items sold. `Product` uses UUID/Custom ID (e.g., `COLD123`) and relates to a `Category`.
- **Inventory:** Tracks exact item stocks. Handles both `DIRECT_SALE` and `RAW_MATERIAL` inputs. Auto-decrements upon billing based on recipes or direct 1:1 mapping.
- **Bill:** Stores finalized checkout interactions. Uniquely identified by a daily sequential `bill_no`. Employs `idx_daily_bill_unique` to prevent race conditions during checkout. Items are persisted as JSON for historical immutability.

### Pre-Aggregated Analytics
- **DailySalesSummary:** *crucial for performance*. Instead of running expensive aggregate queries across millions of `Bill` rows, this table acts as a daily cache storing total sales, total orders, expenses, net profit, and a JSON array of top-selling products. It is reconciled natively.

### Worker & Expense Management System
*(Note: Categorized under the logical schema `worker`)*
- **Worker:** Main employee entity (name, role, base salary, join_date).
- **Attendance:** Logs check-in/check-out and status (Present, Absent, Half-day).
- **Advance & SalaryPayment:** Handles salary deductions if workers take an advance sum, and orchestrates end-of-month final salary payout configurations.
- **Expense & ExpenseItem:** P&L tracking mechanism handling non-product outflows (utilities, worker advances turned into firm expenses).

### Reminders
- **Reminder:** A configurable alert system containing fields like `triggered_at`, `status` and `repeat_type` (once, daily, weekly, monthly).

---

## 5. Background Processes & Jobs

The application doesn't just respond to REST requests; it relies on self-healing and maintaining tasks running on separate daemon threads initialized via `app.py`.

### 1. Dashboard Refresher (`dashboard_refresher.py`)
- **Action:** Runs in a persistent background loop.
- **Trigger:** Reconciles metrics at Midnight (12:01 AM).
- **Responsibility:** Re-calculates and populates the `DailySalesSummary` table for the previous day. Ensures that dashboard dashboard load time remains instant regardless of database magnitude.
- **Cleanup:** Archiving old bills to free up working memory if necessary.

### 2. Reminder Micro-Checker
- **Action:** Runs every 10 seconds.
- **Responsibility:** Polls the database for active reminders where `reminder_time <= now()` and `status == 'pending'`. If conditions meet, it marks it as `triggered`. The Frontend interacts via long polling or fetching to show immediate alerts to the user.

---

## 6. Flow Architectures

### The Billing Flow (Checkout Event)
1. **Frontend Initiation:** User compiles cart in POS interface and hits 'Print Bill' or `Enter`.
2. **Payload:** Axios POST request to `/api/bill/create` contains items, total amount, and customer details.
3. **Daily Token Generation:** System calculates `MAX(bill_no)` for the *current calendar date* to ensure numbering systematically resets every morning.
4. **Transaction (ACID):**
   - The `Bill` object is committed.
   - Corresponding `Inventory` objects are fetched, and their `stock` floating values are deducted.
   - Real-time updates push via Thread locks.
5. **Hardware Invocation (Printer Service):** The `printer_service.py` is invoked to construct ESC/POS byte sequences based on the system's `settings` (58mm vs 80mm). Sending raw bytes via USB/Network to the selected local thermal printer.
6. **Summary Cache Update:** The `DailySalesSummary` for the current date is momentarily appended to reflect live dashboard metrics.

### System Initialization Flow
1. **Launcher (`Product_Sales_Start.bat`):** Triggers `concurrently` script.
2. **Setup:** If running locally, Python virtual environments prepare via `first_time_start.bat`. On production Electron, it boots pre-compiled binaries.
3. **Database Spin-up:** `app.py` triggers `create_all()`. Additional patches like `ALTER TABLE for active reminders` fallback securely if models evolved across updates.
4. **Ports Setup:** Flask listens on port `5050` (`0.0.0.0` for local area network casting capability), React serves on `3050`.

---

## 7. Configuration & File System

The Electron instance and Python backend manipulate local folders specifically categorized for portability:

* `backend/data/products.db`: The Holy Grail SQLite store holding all transactions.
* `backend/data/images/`: Storage for product thumbnail assets uploaded from the frontend.
* `backend/data/Sound/`: UI interaction sound effects.
* `/exports`: The dumping ground for generated Daily Excel logic handled by `excel_service.py`.

## 8. Extensibility Rules
- **No Direct Mutation on Bills:** Historic bills use dumped stringified JSON for inner items. Never join relationships to dynamic product state, as past pricing must remain immutable.
- **Data Access Patterns:** All dashboard reads should utilize `DailySalesSummary` or custom DB abstractions from `sqlite_db_service.py` and `summary_service.py`.
- **Port Mapping:** The frontend specifies `proxy: http://localhost:5050` directly in its `package.json` to bypass CORS headaches naturally during pure-React operation, while Flask handles CORS dynamically using `flask_cors`.
