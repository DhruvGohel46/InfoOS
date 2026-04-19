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

## 4. Deep-Dive: Data Models (SQLAlchemy)

All models are defined in `models.py` using Flask-SQLAlchemy. The database is **PostgreSQL** (via `psycopg2-binary`), not SQLite. Worker-related tables live in a dedicated `worker` schema.

### 4.1 Settings

| Column | Type | Notes |
|--------|------|-------|
| `key` | String(255) | **PK** — e.g. `printer_name`, `shop_name`, `require_pin_login`, `admin_pin_hash` |
| `value` | Text | Flexible key-value store |
| `group_name` | String(50) | Logical grouping |
| `updated_at` | DateTime | Auto-updated |

### 4.2 Category → Product (One-to-Many)

**Category** (`categories`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer | **PK**, auto-increment |
| `name` | String(255) | **Unique**, required |
| `description` | Text | Optional |
| `active` | Boolean | Default `true` |

**Product** (`products`)

| Column | Type | Notes |
|--------|------|-------|
| `product_id` | String(50) | **PK** — custom ID like `COLD123` |
| `name` | String(255) | Required |
| `price` | Float | Required |
| `category_id` | Integer | **FK** → `categories.id` |
| `category` | String(255) | Legacy text field for backwards compatibility |
| `image_filename` | String(255) | Filename in `data/images/` |
| `active` | Boolean | Default `true` (soft-delete flag) |
| `favorite` | Boolean | Default `false` |

**Indexes:** `idx_products_category_id`, `idx_products_active`
**Relationship:** `Product.category_rel` → `Category` (backref: `Category.products`)

### 4.3 Inventory

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer | **PK** |
| `name` | String(255) | Required |
| `type` | String(50) | `DIRECT_SALE` or `RAW_MATERIAL` |
| `unit` | String(20) | `piece`, `packet`, `kg`, `liter`, `gram`, `ml`, `box`, `bottle` |
| `stock` | Float | Current stock level |
| `unit_price` | Float | Cost per unit (for raw materials) |
| `alert_threshold` | Float | Low-stock alert trigger |
| `max_stock_history` | Float | Highest recorded stock level |
| `product_id` | String(50) | **FK** → `products.product_id` (nullable, one-to-one) |

**Relationship:** `Inventory.product` → `Product` (backref: `Product.inventory`, `uselist=False`)

### 4.4 Bill

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer | **PK**, auto-increment |
| `bill_no` | Integer | Daily sequential number (resets each day) |
| `customer_name` | String(255) | Optional |
| `total_amount` | Float | Server-calculated total |
| `today_token` | Integer | Optional daily token number |
| `payment_method` | String(50) | Default `CASH` |
| `items` | Text | **JSON string** — immutable snapshot of items at checkout time |
| `status` | String(50) | `CONFIRMED`, `VOIDED` |

**Constraints:** `UniqueConstraint('bill_no', 'created_at', name='idx_daily_bill_unique')`
**Indexes:** `idx_bills_created_at_no`, `idx_bills_status`

### 4.5 Worker Management (Schema: `worker`)

**Worker** (`worker.workers`)

| Column | Type | Notes |
|--------|------|-------|
| `worker_id` | String(36) | **PK**, UUID |
| `name` | String(255) | Required |
| `phone`, `email` | String | Contact |
| `role` | String(100) | e.g. `Chef`, `Waiter`, `Manager` |
| `salary` | Float | Monthly base salary |
| `join_date` | Date | Employment start |
| `status` | String(20) | `active` / `inactive` |
| `photo` | Text | Base64 string or URL |

**Relationships:** `Worker.advances`, `Worker.salary_payments`, `Worker.attendance_records`, `Worker.expenses`

**Advance** (`worker.advances`) — Records advance payments per worker. FK → `worker.workers.worker_id`.

**SalaryPayment** (`worker.salary_payments`) — Monthly salary records with `base_salary`, `advance_deduction`, `final_salary`, `paid` flag, `paid_date`.

**Attendance** (`worker.attendance`) — Daily attendance with `status` (Present/Absent/Half-day), `check_in`/`check_out` as Time fields. **Index:** `idx_attendance_worker_date`.

### 4.6 Expense & ExpenseItem

**Expense** (`expenses`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | String(36) | **PK**, UUID |
| `title` | String(255) | Required |
| `category` | String(100) | `Salary`, `Utilities`, `Supplies`, etc. |
| `amount` | Float | Total expense amount |
| `payment_method` | String(50) | Default `Cash` |
| `worker_id` | String(36) | **FK** → `worker.workers.worker_id` (nullable) |
| `notes` | Text | Optional |

**Relationships:** `Expense.worker` → `Worker`, `Expense.items` → `ExpenseItem[]` (cascade delete-orphan)
**Index:** `idx_expenses_date`

**ExpenseItem** (`expense_items`) — Line items with `product_id`, `quantity` (string, e.g. `"2 kg"`), `purchase_price`, `subtotal`.

### 4.7 Reminder

| Column | Type | Notes |
|--------|------|-------|
| `id` | String(36) | **PK**, UUID |
| `user_id` | String(50) | Default `admin` |
| `title` | String(255) | Required |
| `description` | Text | Optional |
| `reminder_time` | DateTime | When to trigger |
| `status` | String(20) | `pending` → `triggered` → `completed` |
| `repeat_type` | String(20) | `once`, `daily`, `weekly`, `monthly` |
| `is_active` | Boolean | Default `true` |
| `is_dismissed` | Boolean | Default `false` |
| `triggered_at` | DateTime | First trigger timestamp |
| `last_triggered_at` | DateTime | Last trigger timestamp |

**Indexes:** `idx_reminder_status_time`, `idx_user_id`

### 4.8 DailySalesSummary (Pre-Aggregated Analytics)

| Column | Type | Notes |
|--------|------|-------|
| `date` | Date | **PK** — one row per calendar day |
| `total_sales` | Float | Sum of all non-voided bills |
| `total_orders` | Integer | Count of non-voided bills |
| `total_expenses` | Float | Sum of all expenses for the day |
| `net_profit` | Float | `total_sales - total_expenses` |
| `average_bill_value` | Float | `total_sales / total_orders` |
| `top_products_json` | Text | JSON array of top 10 products by revenue |

**Updated by:** `aggregation_service.py` (real-time after every bill/expense) and `dashboard_refresher.py` (nightly reconciliation).

---

## 5. Service Layer & Infrastructure

### 5.1 Backend Services (`services/`)

| Service | File | Responsibility |
|---------|------|----------------|
| `DatabaseService` | `db_service.py` (35KB) | Core data access layer for products, bills, categories, inventory, settings. All CRUD operations. |
| `SummaryService` | `summary_service.py` (22KB) | Analytics engine: daily/weekly/monthly summaries, top products, range aggregations, product-wise breakdowns. |
| `AggregationService` | `aggregation_service.py` | Upserts `DailySalesSummary` rows. Called real-time (after bill/expense) + nightly. Includes `backfill_summaries()` for migration. |
| `PrinterService` | `printer_service.py` | ESC/POS thermal printer driver. Constructs byte sequences for 58mm/80mm widths. Uses `pywin32` for Windows printer access. |
| `ExcelService` | `excel_service.py` | Legacy CSV export service. |
| `ExcelXLSXService` | `excel_xlsx_service.py` (33KB) | Full `.xlsx` report generation using `openpyxl`. Daily, weekly, monthly, expenses reports with styled formatting. |
| `WorkerService` | `worker_service.py` | Salary cycle computation, advance tracking, attendance operations, bulk operations. Finance cycle date calculation. |
| `ReminderService` | `reminder_service.py` | Extended reminder operations. |
| `SQLiteDBService` | `sqlite_db_service.py` (37KB) | Alternative raw SQL query layer for complex analytics. |

### 5.2 In-Memory Cache (`cache.py`)

Uses `cachetools.TTLCache` with thread-safe locking (`threading.Lock`). Replaces Redis for single-server deployment.

| Cache Domain | TTL | Purpose |
|-------------|-----|---------|
| `products` | 5 min | Active/all product lists |
| `products_with_stock` | 5 min | Products joined with inventory stock |
| `categories` | 5 min | Active/all categories |
| `settings` | 10 min | All key-value settings |
| `workers` | 10 min | Active workers |

**API:** `cache.get(domain, key)`, `cache.set(domain, key, value)`, `cache.invalidate(domain)`, `cache.invalidate_all()`, `cache.stats()`.
Every write endpoint calls `cache.invalidate()` for relevant domains.

### 5.3 Error Handling (`error_handler.py`)

Centralized, production-grade error handling with:
- **Custom exceptions:** `ValidationError` (400), `NotFoundError` (404), `ConflictError` (409), `AuthorizationError` (401), `AppError` (base, 500)
- **`@safe_route` decorator:** Wraps all route handlers. Catches `AppError` → structured response, `ValueError` → 400, unhandled `Exception` → 500 with full traceback logging
- **Consistent JSON shape:** `{ "success": false, "error": "message", "code": "MACHINE_CODE" }`
- **Global handlers** registered for 400, 404, 405, 409, 500

### 5.4 Request Validation (`validators.py`)

All POST/PUT payloads are validated via **Marshmallow** schemas before reaching business logic:

`BillCreateSchema`, `BillUpdateSchema`, `ProductCreateSchema`, `ProductUpdateSchema`, `WorkerCreateSchema`, `WorkerUpdateSchema`, `AdvanceCreateSchema`, `AttendanceSchema`, `SalaryGenerateSchema`, `InventoryCreateSchema`, `InventoryUpdateSchema`, `StockAdjustSchema`, `ExpenseCreateSchema`, `ExpenseUpdateSchema`, `CategoryCreateSchema`, `CategoryUpdateSchema`, `ReminderCreateSchema`, `SettingItemSchema`

All schemas use `Meta: unknown = EXCLUDE` to silently drop unexpected fields.

### 5.5 Rate Limiting (`limiter.py`)

Uses `Flask-Limiter` with `get_remote_address` key function:
- **Global defaults:** 1000/day, 100/hour per IP
- **Per-endpoint:** `/api/bill/create` is limited to 60/minute

### 5.6 Configuration (`config.py`)

| Setting | Value | Notes |
|---------|-------|-------|
| Database | PostgreSQL via `DATABASE_URL` env var | Connection pool: 10 + 20 overflow, 1hr recycle, pre-ping health checks |
| `DATA_DIR` | `backend/data/` (dev) or AppData (prod) | Overridable via `POS_DATA_DIR` env var |
| `SECRET_KEY` | From env or fallback | Used for JWT signing |
| `RESET_PASSWORD` | From env or fallback | Required for dangerous operations (DB reset, permanent delete) |
| Flask port | `5050` (configurable via `--port` CLI arg) | Listens on `0.0.0.0` for LAN access |
| React port | `3050` | Set in frontend's `package.json` start script |

---

## 6. Background Processes & Jobs

Two daemon threads are started from `app.py` on server boot:

### 6.1 Dashboard Refresher (`dashboard_refresher.py`)
- **Library:** `schedule` (runs pending jobs in a `while True` loop, checks every 60s)
- **Scheduled:** Daily at `00:01` (midnight)
- **Actions:**
  1. Reconciles yesterday's `DailySalesSummary` via `aggregation_service.update_daily_summary(yesterday)`
  2. Reconciles today's summary as a safety net
- **Logging:** Writes to `dashboard_refresh.log`
- **Manual trigger:** `python dashboard_refresher.py --immediate`

### 6.2 Reminder Micro-Checker (inline in `app.py`)
- **Frequency:** Every 10 seconds
- **Logic:** Queries `Reminder` where `status == 'pending'` AND `reminder_time <= now()`
- **Action:** Sets `status = 'triggered'`, records `triggered_at` and `last_triggered_at`
- **Fault tolerance:** On error, rolls back DB session and calls `db.session.remove()` to prevent poisoned sessions

### 6.3 Real-Time Aggregation (`aggregation_service.py`)
Not a background thread, but called synchronously (non-blocking) after:
- Every `POST /api/bill/create` 
- Every `PUT /api/bill/<id>/cancel`
- Every `POST /api/expenses`
- Every `DELETE /api/expenses/<id>`

Performs: Sales aggregation (count + sum), expense aggregation (sum), top-10 products computation, and upserts the `DailySalesSummary` row.

---

## 7. Flow Architectures

### 7.1 Billing Flow (Checkout)
```
User → POS Screen → Axios POST /api/bill/create
  ├─ Marshmallow validates payload (BillCreateSchema)
  ├─ Each product validated against DB (must exist + be active)
  ├─ Total calculated server-side (price × qty per item)
  ├─ Bill committed to DB with daily sequential bill_no
  ├─ Inventory stock auto-decremented
  ├─ If print=true → PrinterService constructs ESC/POS bytes → thermal printer
  ├─ DailySalesSummary upserted via aggregation_service
  ├─ Cache invalidated (products, products_with_stock)
  └─ 201 response with bill details
```

### 7.2 POS Bootstrap (Screen Load)
```
POS Screen Mount → Axios GET /api/pos/bootstrap
  └─ Single response contains:
       ├─ Products with stock (cached, 5min TTL)
       ├─ Categories (cached, 5min TTL)
       ├─ Active workers (cached, 10min TTL)
       ├─ All settings (cached, 10min TTL)
       ├─ Next bill number (always fresh DB query)
       └─ Cache stats for debugging
```
Replaces 5 separate API calls with 1.

### 7.3 Salary Cycle Flow
```
Worker advance recorded → Expense entry auto-created
  └─ At month end: POST /api/workers/<id>/generate-salary
       ├─ Calculates finance cycle dates
       ├─ Sums advances in current cycle
       ├─ final_salary = base_salary - advance_deduction
       └─ SalaryPayment record created (paid=false)
             └─ POST /api/salary/<id>/pay → marks paid=true
```

### 7.4 System Initialization Flow
```
1. Launcher: first_time_start.bat (first run) or InfoOS_Start.bat
2. Electron app.whenReady():
   ├─ startBackend() → spawns Python process with --data-dir and --port
   │   ├─ Dev: python backend/app.py
   │   └─ Prod: resources/backend/backend.exe (PyInstaller bundle)
   ├─ waitForBackend() → polls GET /health every 1 second
   └─ createWindow() → loads React app
       ├─ Dev: http://localhost:3050 (+ opens DevTools)
       └─ Prod: frontend/build/index.html
3. Backend app.py __main__:
   ├─ Creates Flask app (dev or production config)
   ├─ db.create_all() → ensures tables exist
   ├─ Database health check (SELECT 1)
   ├─ Creates data directories (data/, bills/, archive/, exports/)
   ├─ Starts dashboard refresher thread
   └─ Flask.run(host='0.0.0.0', port=5050, use_reloader=False)
```

### 7.5 Electron Security Model
- `nodeIntegration: false`, `contextIsolation: true`, `enableRemoteModule: false`
- **Preload bridge** (`preload.js`): Exposes limited `electronAPI` via `contextBridge`:
  - `getAppVersion()`, `getPlatform()`, `getSystemInfo()`
  - `onNewBill(callback)` — IPC listener for menu shortcut
  - `writeLog(level, message)` — writes to `data/logs/frontend.log`
- **CSP Header** injected: `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: http://localhost:* http://127.0.0.1:*`
- Right-click context menu disabled
- External links open in system browser, not Electron

---

## 8. Frontend Architecture

### 8.1 Tech Stack
React 18 + Create React App, React Router v7, Framer Motion, Recharts, Axios, Socket.io-client, FontAwesome + React Icons.

### 8.2 Directory Structure
```
frontend/src/
├── api/                  # API client modules
│   ├── api.js            # Core Axios instance & product/bill APIs
│   ├── expenses.js       # Expense API calls
│   ├── pos.js            # POS bootstrap API
│   ├── reminderAPI.js    # Reminder CRUD + polling
│   ├── settings.js       # Settings API
│   └── workers.js        # Worker/attendance/salary APIs
├── components/
│   ├── common/           # Reusable UI: modals, toasts, spinners, alerts
│   ├── expenses/         # Expense management components
│   ├── layout/           # PageContainer wrapper
│   ├── screens/          # Main page components (8 screens)
│   │   ├── Analytics.jsx     # Dashboard with Recharts
│   │   ├── Bill.jsx          # POS checkout interface
│   │   ├── CategoryManagement.jsx
│   │   ├── Expenses.jsx
│   │   ├── Inventory.jsx
│   │   ├── Management.jsx    # Product management
│   │   ├── Reminders.jsx
│   │   └── Settings.jsx      # Shop, printer, theme settings
│   ├── system/           # System-level components
│   ├── ui/               # Low-level UI primitives
│   └── workers/          # Worker management (10 components)
├── context/              # React Context providers
│   ├── AlertContext.js       # Global alert/notification state
│   ├── POSDataContext.jsx    # POS bootstrap data provider
│   ├── ReminderContext.jsx   # Reminder polling & state
│   ├── SettingsContext.js    # App settings provider
│   ├── ThemeContext.js       # Dark/light theme toggle
│   └── ToastContext.js       # Toast notification system
├── hooks/                # Custom React hooks
├── services/
│   └── workerService.js  # Worker-specific service utilities
├── styles/               # CSS stylesheets
├── utils/                # Utility functions
├── App.jsx               # Root component with routing
└── index.js              # Entry point
```

### 8.3 Data Flow
- **Proxy:** `package.json` sets `"proxy": "http://localhost:5050"` — all `/api/*` calls are forwarded to Flask during development
- **POS screen:** Uses `POSDataContext` which calls `/api/pos/bootstrap` once on mount
- **Reminders:** `ReminderContext` polls for triggered reminders and shows `ReminderAlertModalPortal` as an overlay
- **Theme:** `ThemeContext` provides `isDark` flag for conditional styling across all components

---

## 9. Configuration & File System

### 9.1 Directory Layout

| Path | Purpose |
|------|---------|
| `backend/data/products.db` | Legacy SQLite path (now PostgreSQL via `DATABASE_URL`) |
| `backend/data/images/` | Product images (PNG, background-removed via rembg) |
| `backend/data/Sound/` | UI sound effects served via `/api/sounds/<filename>` |
| `backend/data/exports/` | Generated Excel/CSV reports |
| `backend/data/bills/` | Bill data directory |
| `backend/data/archive/` | Archived data |
| `backend/data/logs/` | Frontend log files (written via Electron IPC) |
| `backend/dashboard_refresh.log` | Dashboard refresher log |

### 9.2 Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:dharmik@localhost:5432/rebill_db` |
| `POS_DATA_DIR` | Data directory override | `backend/data/` |
| `SECRET_KEY` | JWT signing key | Fallback dev key |
| `RESET_PASSWORD` | Admin reset password | Fallback value |
| `PRINTER_NAME` | Default printer | `Default Printer` |
| `SHOP_NAME` | Shop display name | `FAST FOOD SHOP` |
| `SHOP_ADDRESS` | Receipt address | Placeholder |
| `SHOP_PHONE` | Receipt phone | Placeholder |
| `TAX_RATE` | Tax as decimal (0.18 = 18%) | `0.0` |
| `REPORTS_FOLDER` | External reports directory | `D:\Sales Data of other product` |

---

## 10. Extensibility Rules & Conventions

1. **Immutable Bill History:** Bill items are stored as stringified JSON. Never join to live product tables for historical data — past pricing must remain frozen.
2. **Dashboard Reads:** Always use `DailySalesSummary` or `SummaryService` for analytics. Never scan the full `bills` table for aggregations.
3. **Cache Discipline:** Every write endpoint must call `cache.invalidate()` for affected domains. Never serve stale data to the POS.
4. **Schema Validation First:** All POST/PUT payloads must pass through a Marshmallow schema before reaching business logic. Schemas use `EXCLUDE` for unknown fields.
5. **Error Contract:** All API errors return `{ success: false, error: "message", code: "MACHINE_CODE" }`. Use custom exception classes, never raw `abort()`.
6. **Auth Decorator:** Use `@require_auth` on all mutating endpoints. It's a no-op when PIN is disabled, so there's zero overhead.
7. **Worker Schema Isolation:** All worker-related tables use the `worker` PostgreSQL schema. Foreign keys reference `worker.workers.worker_id`.
8. **Soft Deletes:** Products and workers use soft-delete (set `active=false` / `status='inactive'`). Only permanent delete requires admin password.
9. **Image Processing:** All product images are processed through `rembg` (u2netp model) for background removal before storage.
10. **Port Convention:** Backend on `5050`, Frontend on `3050`. Frontend `proxy` in `package.json` handles API forwarding in dev mode. Flask `CORS` handles it in production.
