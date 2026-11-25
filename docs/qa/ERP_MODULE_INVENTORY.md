# Kairo ERP — Comprehensive Module Inventory & Feature Matrix

**Document Version:** 1.0.0  
**Scope:** Complete functional inventory across all discovered application tiers (UI screens, API endpoints, database schemas, and business services).

---

## 1. Authentication & Multi-Tenant Access

- **Business Purpose:** Secure session handling, tenant (company) and plant boundary selection, Argon2id credential verification, license seat cap enforcement, and JWT token rotation.
- **Available Screens:**
  - `/login`: Email/identifier and password login form.
  - `/select-company`: Tenant company card selection and plant dropdown picker.
- **Master Data Dependencies:** `users`, `companies`, `plants`, `company_license`, `company_users`.
- **Transactional Dependencies:** `sessions` table (tracks active refresh tokens and bound context).
- **Key APIs:**
  - `POST /api/auth/login`: Issue short-lived access JWT and refresh cookie.
  - `POST /api/auth/select-context`: Bind active `companyId` and `plantId` to session.
  - `POST /api/auth/refresh`: Rotate refresh token and re-issue JWT.
  - `POST /api/auth/logout`: Invalidate session.
  - `GET /api/auth/me`: Decode active token claims.
  - `GET /api/auth/context-options`: Query authorized companies for the user.
- **Database Tables:** `users`, `sessions`, `companies`, `plants`, `company_license`, `company_users`.
- **Business Validations:**
  - Seat license enforcement: Active distinct sessions cannot exceed `max_users`.
  - Inactive user and inactive company rejection.
  - Mandatory tenant binding before accessing operational endpoints.
- **Current Test Coverage:** Partial manual API curl verification; zero automated UI E2E test scripts.
- **Testing Gaps:** E2E automated browser login, context switching, seat limit boundary testing, session expiration recovery.

---

## 2. Super-Admin & Platform Governance

- **Business Purpose:** Platform owner management of companies, plants, user invitations, role definitions, module licensing, dynamic industry blueprints, and system health telemetry.
- **Available Screens:**
  - `/admin`: Super-admin control portal with tabs for Companies, Users & Roles, Licenses, Diagnostics & Audit Logs, and Industry Blueprints.
- **Master Data Dependencies:** `companies`, `roles`, `permissions`, `company_license`.
- **Transactional Dependencies:** `audit_logs`, `system_settings`.
- **Key APIs:**
  - `GET /api/admin/companies`: List all tenant companies.
  - `POST /api/admin/companies`: Create new company + default COA + number series.
  - `GET /api/admin/blueprints`: Retrieve industry blueprint presets.
  - `POST /api/admin/companies/:id/apply-blueprint`: Apply industry modules dynamically.
  - `POST /api/admin/stock-adjustments/override`: Super-admin direct stock correction with mandatory audit justification ($\ge 20$ characters).
  - `GET /api/admin/diagnostics/health`: Health status across DB, Redis, and services.
- **Database Tables:** `companies`, `plants`, `company_license`, `company_modules`, `roles`, `permissions`, `audit_logs`.
- **Business Validations:**
  - Strict system-admin gate (`is_system_admin = true`).
  - Minimum audit reason length for stock overrides.
  - Prevention of deleting companies with active transactional history.
- **Current Test Coverage:** No automated E2E tests.
- **Testing Gaps:** Blueprint application verification, company provisioning lifecycle, override validation.

---

## 3. Settings & Company Configuration

- **Business Purpose:** Granular configuration of operational plants, warehouses, number series sequences, chart of accounts, tax codes, user permissions, approval limits, and dynamic custom fields.
- **Available Screens:**
  - `/settings/company`: Legal profile, GSTIN, PAN, currency, fiscal year.
  - `/settings/plants`: Plant setup and warehouse hierarchy (raw, FG, transit, quarantine).
  - `/settings/users`: User management and company role assignment.
  - `/settings/roles`: Custom role definition and permission checkboxes.
  - `/settings/approval-limits`: Threshold limits per user per document type.
  - `/settings/number-series`: Prefix, suffix, length, and auto-increment sequences.
  - `/settings/coa`: Hierarchical Chart of Accounts tree view.
  - `/settings/tax-codes`: GST tax rates (CGST, SGST, IGST) and HSN mapping.
  - `/settings/custom-fields`: User-defined dynamic fields (L2 engine).
  - `/settings/user-guide`: Integrated ERP manual.
- **Master Data Dependencies:** `companies`, `plants`.
- **Transactional Dependencies:** `document_number_series`, `chart_of_accounts`, `tax_codes`.
- **Key APIs:**
  - `GET/POST/PATCH /api/settings/plants`: Manage plants and warehouses.
  - `GET/POST/PUT /api/settings/roles`: Manage roles and permission matrices.
  - `GET/POST/PATCH /api/settings/number-series`: Sequence management.
  - `GET/POST /api/settings/coa`: Chart of Accounts maintenance.
  - `GET/POST /api/settings/custom-fields`: Dynamic schema configuration.
- **Database Tables:** `plants`, `warehouses`, `document_number_series`, `chart_of_accounts`, `tax_codes`, `user_approval_limits`, `custom_field_definitions`.
- **Business Validations:**
  - Duplicate code prevention (e.g. duplicate plant code or warehouse code).
  - Prohibiting deletion of accounts that contain posted journal lines.
  - Unique prefix and fiscal year combination in number series.
- **Current Test Coverage:** None.
- **Testing Gaps:** Role and permission updates reflected dynamically, number series concurrency tests.

---

## 4. Master Data Management (Masters)

- **Business Purpose:** Centralized maintenance of core entities: items, item groups, units of measure (UOM), customers, and suppliers.
- **Available Screens:**
  - `/masters/items`: Item catalogue with primary/secondary UOM, WAC rate, HSN code, batch/serial tracking flags, catch-weight tolerances.
  - `/masters/item-groups`: Category classification for accounting defaults.
  - `/masters/uom`: Base UOM and conversion factors.
  - `/masters/suppliers`: Vendor master, GSTIN, bank details, default payment terms.
  - `/masters/customers`: Customer master, credit limit, billing/shipping addresses.
  - `/masters/suppliers/:id` & `/masters/customers/:id`: Detailed 360-degree party dossiers.
- **Master Data Dependencies:** `companies`.
- **Transactional Dependencies:** `items`, `suppliers`, `customers`.
- **Key APIs:**
  - `GET/POST/PATCH /api/masters/items`
  - `GET/POST/PATCH /api/masters/item-groups`
  - `GET/POST/PATCH /api/masters/uom`
  - `GET/POST/PATCH /api/purchase/suppliers`
  - `GET/POST/PATCH /api/sales/customers`
- **Database Tables:** `items`, `item_groups`, `uom`, `uom_conversions`, `suppliers`, `customers`, `customer_addresses`.
- **Business Validations:**
  - Valid 15-character GSTIN structure where applicable.
  - Positive non-zero conversion factors between UOMs.
  - Prevention of deleting items or parties linked to existing transactions.
- **Current Test Coverage:** None.
- **Testing Gaps:** Full CRUD automation, search/pagination, master-data dependency validation.

---

## 5. Procure-to-Pay (P2P) Module

- **Business Purpose:** End-to-end purchasing lifecycle: material requisition, blanket contracts, purchase orders, gate receipts (GRN), landed cost apportioning (LCV), 3-way matching invoice entry, returns to vendor (RTV), debit notes, and payment vouchers.
- **Available Screens:**
  - `/purchase/requisitions`: Internal purchase requisitions.
  - `/purchase/blanket-orders`: Long-term rate contracts and call-off monitoring.
  - `/purchase/orders`: Purchase order creation, submission, approval, cancellation.
  - `/purchase/grn`: Physical goods inward receipt and warehouse allocation.
  - `/purchase/landed-cost-vouchers`: Post-GRN freight and customs WAC capitalization.
  - `/purchase/invoices`: Vendor tax invoice entry and 3-way match verification.
  - `/purchase/payments`: Outward vendor payment settlements.
  - `/purchase/returns`: Return to Vendor (RTV) with stock deduction.
  - `/purchase/debit-notes`: Price and quantity debit adjustments against bills.
- **Master Data Dependencies:** `suppliers`, `items`, `warehouses`, `tax_codes`, `chart_of_accounts`.
- **Transactional Dependencies:** `stock_ledger_entries`, `journal_entries`, `accounts_payable`.
- **Key APIs:**
  - `/api/purchase/requisitions` (CRUD + approval)
  - `/api/purchase/blanket-orders` (Quota management)
  - `/api/purchase/orders` (CRUD, submit, approve, cancel, short-close)
  - `/api/purchase/grns` (Inward receipt $\to$ writes SLE + AP clearing GL)
  - `/api/purchase/landed-cost-vouchers` (Apportions freight into item WAC)
  - `/api/purchase/invoices` (Clears AP clearing $\to$ Books Vendor AP + Input GST)
  - `/api/purchase/payments` (Clears Vendor AP $\to$ Books Bank/Cash Credit)
  - `/api/purchase/returns` (Outward SLE $\to$ Reverses AP Clearing)
  - `/api/purchase/debit-notes` (Reverses Vendor AP $\to$ Credits Expense/Asset)
- **Database Tables:** `purchase_requisitions`, `blanket_purchase_orders`, `purchase_orders`, `purchase_order_lines`, `goods_receipt_notes`, `goods_receipt_note_lines`, `landed_cost_vouchers`, `lcv_allocated_items`, `purchase_invoices`, `purchase_payments`, `purchase_returns`, `debit_notes`.
- **Business Validations:**
  - Cannot approve GRN exceeding PO quantity (without authorized tolerance).
  - 3-Way matching assertions (PO Rate vs GRN Qty vs Bill Amount).
  - WAC recalculation upon GRN and Landed Cost allocation.
- **Current Test Coverage:** Partial manual API curl; zero E2E Playwright tests.
- **Testing Gaps:** Full P2P cycle automation with multi-receipts, partial invoicing, LCV impact, and GL balance validation.

---

## 6. Order-to-Cash (O2C) Module

- **Business Purpose:** Complete customer sales journey: quotations, sales orders, automated inventory reservation, FEFO batch selection, delivery challan dispatch, sales invoicing, customer receipts, credit notes, sales returns, and single-screen Quick Invoice counter POS.
- **Available Screens:**
  - `/sales/quotations`: Sales quotation proposals.
  - `/sales/orders`: Sales order booking and reservation activation.
  - `/sales/delivery`: Delivery Challan dispatch with batch FEFO picker.
  - `/sales/quick-invoice`: Single-screen counter sale (atomic SLE + GL).
  - `/sales/invoices`: Tax invoice generation and revenue recognition.
  - `/sales/receipts`: Customer payments and advance receipts.
  - `/sales/returns`: Inward customer return with stock restoration.
  - `/sales/credit-notes`: Customer credit note adjustments.
- **Master Data Dependencies:** `customers`, `items`, `warehouses`, `tax_codes`, `chart_of_accounts`.
- **Transactional Dependencies:** `stock_reservations`, `stock_ledger_entries`, `journal_entries`.
- **Key APIs:**
  - `/api/sales/quotations`
  - `/api/sales/orders` (Submit, approve, cancel $\to$ creates/releases `stock_reservations`)
  - `/api/sales/fefo-recommendations` (Batch selection by earliest expiry date)
  - `/api/sales/deliveries` (Physical dispatch $\to$ writes Outward SLE + COGS GL)
  - `/api/sales/invoices` (Recognizes Revenue + Output GST $\to$ Debits Customer AR)
  - `/api/sales/receipts` (Credits Customer AR $\to$ Debits Bank/Cash)
  - `/api/sales/quick-invoice` (Atomic execution of delivery, bill, and payment)
  - `/api/sales/returns` & `/api/sales/credit-notes`
- **Database Tables:** `sales_quotations`, `sales_orders`, `sales_order_lines`, `stock_reservations`, `delivery_notes`, `delivery_note_lines`, `sales_invoices`, `sales_invoice_lines`, `sales_receipts`, `sales_returns`, `credit_notes`.
- **Business Validations:**
  - Credit limit enforcement on customer master.
  - Prevention of dispatching expired batches.
  - Negative inventory prevention on dispatch.
- **Current Test Coverage:** Zero automated E2E tests.
- **Testing Gaps:** Complete O2C cycle, partial deliveries, backorders, FEFO verification, and dual-entry balancing.

---

## 7. Inventory & Warehouse Management Module

- **Business Purpose:** Real-time stock visibility, movement audit ledger, inter-warehouse transfers with in-transit tracking, and physical stock adjustments.
- **Available Screens:**
  - `/inventory/stock`: Current stock on-hand, allocated, and available balances by warehouse.
  - `/inventory/ledger`: Chronological audit trail of all physical and valuation movements.
  - `/inventory/transfers`: Inter-plant and intra-plant stock transfers via transit warehouses.
  - `/inventory/adjustments`: Physical inventory variance write-offs and corrections.
- **Master Data Dependencies:** `items`, `warehouses`, `plants`.
- **Transactional Dependencies:** `stock_ledger_entries`, `stock_balances`, `journal_entries`.
- **Key APIs:**
  - `GET /api/inventory/stock-balances`
  - `GET /api/inventory/stock-ledger`
  - `POST /api/inventory/transfers` (submit $\to$ approve $\to$ dispatch $\to$ receive)
  - `POST /api/inventory/adjustments` (submit $\to$ approve $\to$ writes SLE + Stock Adjustment GL)
- **Database Tables:** `stock_balances`, `stock_ledger_entries`, `stock_transfers`, `stock_transfer_lines`, `stock_adjustments`, `stock_adjustment_lines`.
- **Business Validations:**
  - Stock transfers must pass through `transit` warehouse for physical custody tracking.
  - Physical adjustments must post to Inventory Adjustment Expense/Gain GL accounts.
- **Current Test Coverage:** Zero automated tests.
- **Testing Gaps:** Multi-step transfers, stock adjustments, batch/serial drill-down.

---

## 8. Manufacturing & Subcontracting Module

- **Business Purpose:** Multi-stage manufacturing operations, Bill of Materials (BOM) explosion, work center capacity & cost absorption, shopfloor routing execution, and outside job work subcontracting (GAP 4).
- **Available Screens:**
  - `/manufacturing/bom`: BOM formula definition with scrap % and component lines.
  - `/manufacturing/work-centres`: Machine and labor hourly rate configuration.
  - `/manufacturing/orders`: Work orders with material issue, operation completion, and FG receipt.
  - `/manufacturing/subcontracting`: Outside job work orders, outward raw challans, and inward FG receipts.
- **Master Data Dependencies:** `items`, `work_centres`, `warehouses`, `suppliers`.
- **Transactional Dependencies:** `production_orders`, `job_work_orders`, `stock_ledger_entries`, `journal_entries`.
- **Key APIs:**
  - `/api/manufacturing/boms`
  - `/api/manufacturing/work-centers`
  - `/api/manufacturing/orders` (issue $\to$ operation complete $\to$ complete receipt)
  - `/api/manufacturing/job-work-orders` (Submit, approve)
  - `/api/manufacturing/job-work-challans` (Dispatch raw materials to vendor virtual warehouse)
  - `/api/manufacturing/job-work-receipts` (Receive FG + consume raw materials + capitalize processing fee)
- **Database Tables:** `bom_headers`, `bom_lines`, `work_centres`, `routings`, `production_orders`, `production_order_materials`, `production_order_operations`, `job_work_orders`, `job_work_challans`, `job_work_receipts`.
- **Business Validations:**
  - Cost roll-up: Raw material + Labor + Machine runtime + Packaging = FG Unit Valuation.
  - Subcontracting: Raw materials issued must balance against raw materials consumed + scrap.
- **Current Test Coverage:** Zero automated tests.
- **Testing Gaps:** End-to-end subcontracting lifecycle, dynamic multi-stage routing absorption, WIP clearance.

---

## 9. Accounting & Financial General Ledger

- **Business Purpose:** Append-only double-entry financial ledger, Journal Vouchers (JV), Project Accounting & Job Costing (GAP 8), Bank Reconciliation & statement ingestion (GAP 10), and period locking.
- **Available Screens:**
  - `/accounting/jv`: Manual journal vouchers.
  - `/accounting/projects`: Project contracts, budget vs actual (BvA) telemetry, live margins.
  - `/accounting/bank-reconciliation`: Bank statement upload, candidate matching, and auto-clearing.
  - `/accounting/trial-balance`, `/accounting/profit-loss`, `/accounting/balance-sheet`, `/accounting/gst`.
- **Master Data Dependencies:** `chart_of_accounts`, `companies`, `projects`.
- **Transactional Dependencies:** `journal_entries`, `journal_entry_lines`, `bank_statements`.
- **Key APIs:**
  - `GET/POST /api/accounting/jv`
  - `GET/POST/PATCH /api/accounting/projects`
  - `GET /api/accounting/projects/:id/summary` (Live BvA)
  - `POST /api/accounting/bank-statements/import`
  - `POST /api/accounting/bank-reconciliation/reconcile`
- **Database Tables:** `journal_entries`, `journal_entry_lines`, `fiscal_years`, `fiscal_periods`, `projects`, `project_budgets`, `bank_accounts`, `bank_statements`, `bank_statement_lines`, `bank_reconciliations`.
- **Business Validations:**
  - $\sum \text{Debits} = \sum \text{Credits}$ invariant.
  - Period locking: Blocks writes to closed periods.
  - Immutability of posted lines.
- **Current Test Coverage:** Zero automated E2E tests.
- **Testing Gaps:** Balanced JV verification, project cost roll-up, automated bank match engine.

---

## 10. Reporting & Print Engine

- **Business Purpose:** Real-time financial and operational statements, customer/vendor statements of account, and printable vouchers.
- **Available Screens:**
  - `/reports/inventory` (Stock Ledger Report)
  - `/reports/finance` (General Ledger Report)
  - `/reports/sales` (Sales Report)
  - `/reports/purchase` (Purchase Report)
  - `/print/:docType/:id` (Voucher printing)
- **Database Tables:** Source tables across all modules (Read-Only).
- **Business Validations:** Purely derived from source tables; zero stored recalculated balances.
- **Current Test Coverage:** Zero automated tests.

