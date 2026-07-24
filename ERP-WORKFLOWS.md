# ERP — End-to-End Workflows

_Date: 2026-07-01 · How the modules and engines work together, step by step._

This is the operational map of the system built in Phases 0–9 plus the permission roadmap.
Money is in **paise** (1 ₹ = 100), quantities are `numeric(18,4)`. Every API call is
`authenticate → resolveCompany → requireModule → authorize(permission)`.

---

## 0. One-time setup

### Per installation
1. Deploy: `docker compose up -d --build` (Postgres + Redis + API + web/nginx + migrate + backup).
2. The `migrate` service creates the schema (`DB_BOOTSTRAP=migrate` once migrations are committed, or `push` for greenfield).
3. Seed global data: `permissions.ts` (permission codes + system roles), HSN/SAC master.

### Per company (onboarding)
1. Create the company (name, GSTIN, fiscal year, base currency).
2. `seedCoaForCompany()` — standard Indian chart of accounts + account-category map.
3. `seedPurchaseNumberSeries()` / `seedSalesNumberSeries()` / `seedManufacturingNumberSeries()` — document numbers (PR/PO/GRN…, QTN/SO/DN…, BOM/MO, JV).
4. Seed tax codes (GST5/12/18/28, NIL, EXEMPT).
5. **Activate modules** + install license (`/api/governance/modules`, `/license`) — gates which modules the company may use + seat cap.
6. Create plants + warehouses; create users; assign roles (and optional per-user plant/warehouse scope + approval limits).
7. (Optional) define approval workflows per document type (`/api/governance/workflows`).

---

## 1. The shared document lifecycle (every transactional doc)

```
draft ──submit──▶ submitted ──approve──▶ approved ──▶ (closed | cancelled)
                       └────reject────▶ rejected ──revise──▶ draft
```

On each step the platform engines fire automatically:

| Engine | When | Effect |
|---|---|---|
| NumberSeriesService | on create | atomic gap-free document number (inside the insert tx) |
| StatusEngine | on transition | validates the move, stamps `submittedBy/approvedBy/...` |
| AuditEngine | every create / edit / transition | append-only row in `document_audit_log` |
| Approval (item 2) | on submit (when a workflow exists) | routes through multi-level approval; else single approve + amount limit |
| PostingEngine | on the posting step | double-entry GL (`journal_entries` + lines, always balanced) |
| StockLedger | on stock movements | append-only `stock_ledger_entries` + WAC in `stock_balances` |

**Authorization (3 dimensions):** WHAT (`module.doc.action`), WHERE (plant/warehouse scope),
HOW MUCH (approval limit in paise). System admin bypasses all.

---

## 2. Purchase  `/api/purchase`  — PR → PO → GRN → Invoice → Payment

```
Requisition ──▶ Purchase Order ──▶ GRN (goods in) ──▶ Purchase Invoice ──▶ Payment
  (internal)      (commitment)      stock + GL          AP + GL              cash out + GL
```

| Step | Endpoint(s) | Status / effect |
|---|---|---|
| Vendor master | `POST /suppliers` | — |
| Requisition | `POST /requisitions` → `/submit` `/approve` | internal request, no GL/stock |
| Purchase Order | `POST /orders` (optionally from PR) → `/submit` `/approve` `/cancel` | commitment; computes line + header totals |
| Goods Receipt | `POST /grns` → `/submit` → `/approve` | **approve posts stock IN** (`purchase_receipt`) **+ GL**, bumps PO `receivedQty`/`receiptStatus` |
| Invoice | `POST /invoices` → `/submit` → `/approve` | **approve posts GL** (AP), updates PO billing status |
| Payment | `POST /payments` (with allocations) → `/submit` → `/approve` | **approve posts GL** + applies allocations to invoices |

**GL:** GRN → `DR Inventory + Input GST / CR GR-IR clearing`; Invoice → `DR GR-IR / CR Accounts Payable`;
Payment → `DR Accounts Payable / CR Bank/Cash`. (3-way match: PO ↔ GRN ↔ Invoice via line links.)

---

## 3. Sales  `/api/sales`  — Quotation → SO → Delivery → Invoice → Receipt

```
Quotation ──▶ Sales Order ──▶ Delivery (goods out) ──▶ Tax Invoice ──▶ Receipt
  (offer)     (confirmed)      stock OUT + COGS GL       revenue + GL     cash in + GL
```

| Step | Endpoint(s) | Status / effect |
|---|---|---|
| Customer master | `POST /customers`, `POST /customers/:id/addresses` | bill-to / ship-to (ship-to drives place of supply) |
| Quotation | `POST /quotations` → `/submit` `/approve` `/reject` | priced offer |
| Sales Order | `POST /orders` (from quotation) → `/submit` `/approve` `/cancel` | confirmed order |
| Delivery | `POST /deliveries` → `/submit` → `/approve` | **approve posts stock OUT** (`sales_delivery`) **+ COGS GL** at WAC; updates SO `deliveredQty` |
| Invoice | `POST /invoices` → `/submit` → `/approve` | **approve posts revenue GL**; sets e-invoice status |
| Receipt | `POST /receipts` (with allocations) → `/submit` → `/approve` | **approve posts GL** + applies to invoices |

**GL:** Delivery → `DR COGS / CR Inventory`; Invoice → `DR Accounts Receivable / CR Revenue + Output GST`;
Receipt → `DR Bank/Cash / CR Accounts Receivable`. (Two posting events on sales: COGS on dispatch, revenue on invoice.)

---

## 4. Inventory  (engine + native documents)

- **Masters:** items (type, UOM, tracking none/batch/serial, valuation = weighted average), item groups, batches, serials, UOM + conversions.
- **Stock ledger** is the single source of truth (append-only); `stock_balances` holds current qty + WAC per (company, plant, warehouse, item).
- **Movements** (all via `StockLedgerService`): `purchase_receipt`, `sales_delivery`, `transfer_in/out`, `adjustment_in/out`, `issue_to_production`, `production_receipt`, `by_product_receipt`, `subcon_in/out`. Inward needs a rate; outward issues at current WAC (snapshotted).
- **Native docs:** stock transfers (warehouse → warehouse, no GL) and stock adjustments (count/write-off → GL `DR/CR Inventory vs Stock Adjustment`).

Inventory is consumed by Purchase (GRN in), Sales (delivery out), and Manufacturing (issue/receive).

---

## 5. Manufacturing  `/api/manufacturing`  — Formula → Production Order → Issue → Receive → Close

Unified **discrete + process** model: a formula has inputs **and** outputs; discrete = one output, process = many (primary + co/by-products).

```
Formula/BOM (approved) ──▶ Production Order ──▶ Issue materials ──▶ Receive output(s) ──▶ Close
   inputs + outputs          explode × scale     stock OUT + WIP     stock IN + WIP relief    variance
```

| Step | Endpoint(s) | Status / effect |
|---|---|---|
| Work centers | `POST /work-centers` | labour/overhead rates |
| Formula (BOM/recipe) | `POST /formulas` → `/submit` `/approve` `/reject` `/cancel` | inputs/outputs/operations; discrete validated to 1 output |
| Production order | `POST /orders` → `/submit` `/approve` `/cancel` | **explodes** the formula by `scaleFactor = plannedQty / batchSize` |
| Issue | `POST /orders/:id/issue` | stock OUT (`issue_to_production`) at WAC → **DR WIP / CR RM**; accumulates WIP |
| Receive | `POST /orders/:id/receive` | **cost-allocate** WIP across outputs (by formula basis: percent/weight/value/NRV) → stock IN + **DR FG / CR WIP** |
| Close | `POST /orders/:id/close` | records residual WIP as variance, status → closed |

---

## 6. Accounting & Tax (the financial backbone)

- **Chart of accounts** is hierarchical; leaf accounts carry a **posting category** (e.g. `inventory_raw_material`, `accounts_payable`, `output_cgst`, `cogs`, `inventory_wip`). Templates emit categories, never account UUIDs — portable across companies.
- **PostingEngine** runs a registered template per document type, asserts `Σdebit = Σcredit`, and writes `journal_entries` + lines (every entry draws an `accounting.jv` number). Cancellations call `reverse()` (DR↔CR swapped).
- **Manual journal vouchers**: `accounting.jv` lifecycle for adjustments.
- **GST (Tax Engine):** rates in basis points; CGST+SGST (intra-state) vs IGST (inter-state) by place of supply; ITC offset order. Sales invoices **generate** an e-invoice IRN (IRP client, mock/production); purchase invoices store the supplier IRN.

### GL cheat-sheet
| Document | Debit | Credit |
|---|---|---|
| purchase.grn | Inventory + Input GST | GR-IR clearing + tax clearing |
| purchase.invoice | GR-IR clearing + tax clearing | Accounts Payable |
| purchase.payment | Accounts Payable | Bank / Cash |
| sales.delivery | COGS | Inventory |
| sales.invoice | Accounts Receivable | Revenue + Output GST |
| sales.receipt | Bank / Cash | Accounts Receivable |
| manufacturing.issue | WIP | RM / Stores inventory |
| manufacturing.receipt | Finished Goods | WIP (+ variance) |

---

## 7. Permissions & Governance  `/api/governance`

- **Roles → permissions**, with per-user grant/deny overrides (deny wins), plant scope, and approval limits.
- **Approval workflows** (`/workflows`): ordered levels with amount bands + role/user approvers + N-of-M.
  Flow: submit → `approvals/start` creates a request → approvers `approvals/:id/act` → on the final level the
  document is moved to approved. Enforces **maker ≠ checker**. No workflow configured ⇒ single-step approve (fallback).
- **Module activation + license** (`/modules`, `/license`): company-level gate above per-user permissions —
  the purchase/sales/manufacturing route groups reject `403 module_not_licensed` when off; seat cap on user creation.

---

## 8. Deployment & operations

- `docker compose up -d` brings up Postgres, Redis, the API, the nginx web container (port 80 / `HTTP_PORT`), the one-shot `migrate`, and a nightly `pg_dump` backup.
- Upgrades: `git pull && docker compose build && docker compose up -d` (migrate re-runs first).
- Logs rotate (json-file 10m×5); timezone `Asia/Kolkata`; data in named volumes; dumps in `./backups`.

---

## Status & module reference

- **Status transitions** (StatusEngine): registered for `purchase.requisition/po/grn/invoice/payment`,
  `sales.quotation/so/delivery/invoice/payment`, `manufacturing.bom/order`, `accounting.jv`.
- **Permission modules**: `auth`, `settings`, `purchase`, `inventory`, `accounting`, `sales`, `manufacturing`.
- **Actions**: view, create, edit, submit, approve, reject, cancel, delete, manage, run, transfer, adjust, count, issue, close, financial.

See also: `ERP architecture skill`, `PERMISSION-MODEL.md`, the `PHASE6–9` notes, and `DO-LATER-BACKLOG.md`.
