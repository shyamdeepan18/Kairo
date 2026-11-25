# Database Schema & Entity Guide

## 1. Key Tables by Functional Area

### Tenancy & Security (`packages/db/src/schema/auth.ts`, `company.ts`)
- `users`: User profiles, Argon2id `password_hash`, `is_system_admin`, `is_active`.
- `sessions`: Active refresh tokens, `active_company_id`, `active_plant_id`, expiration timestamps.
- `companies`: Legal entity profile, `gstin`, `state_code`, `base_currency`.
- `plants`: Manufacturing and warehouse plants tied to companies.
- `warehouses`: Storage locations (`warehouse_type`: `raw_material`, `finished_goods`, `transit`, `consignment`, `scrap`).

### Inventory (`packages/db/src/schema/inventory.ts`)
- `stock_ledger_entries`: Append-only movement log. Direction derived from `movement_type`. Tracks `quantity`, `valuation_rate_paise`, `valuation_amount_paise`.
- `stock_balances`: Materialized snapshot by `(company_id, plant_id, warehouse_id, item_id, batch_id)`. Tracks `quantity_on_hand`, `quantity_reserved`, `quantity_ordered`.
- `stock_reservations`: Active order reservations (`status = 'active' | 'fulfilled' | 'cancelled'`).

### Purchasing (`packages/db/src/schema/purchase.ts`)
- `purchase_orders`, `purchase_order_lines`: PO records with quantities, rates, and approval status.
- `goods_receipt_notes`, `goods_receipt_note_lines`: Physical inward receipts.
- `purchase_invoices`, `purchase_invoice_lines`: 3-way match bills.
- `purchase_payments`, `purchase_payment_allocations`: Vendor remittances.

### Sales (`packages/db/src/schema/sales.ts`)
- `sales_orders`, `sales_order_lines`: Customer contract lines with `reserved_qty` tracking.
- `delivery_notes`, `delivery_note_lines`: Physical dispatch challans.
- `sales_invoices`, `sales_invoice_lines`: Customer tax billing.
- `sales_receipts`, `sales_receipt_allocations`: Inward customer collections.

### Accounting (`packages/db/src/schema/accounting.ts`)
- `chart_of_accounts`: Ledger accounts with subtypes (`bank`, `cash`, `accounts_payable`, `accounts_receivable`, `inventory_asset`, `cogs`, `sales_revenue`).
- `journal_entries`: Voucher headers with `entry_number`, `posting_date`, `fiscal_year`.
- `journal_entry_lines`: Voucher debit/credit entries (`debit_amount_paise`, `credit_amount_paise`).
- `projects`, `project_budgets`: Project accounting contracts (GAP 8).

