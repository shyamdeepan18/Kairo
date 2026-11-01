---
name: erp-inventory-and-valuation
description: Architectural specification, mathematical valuation models (WAC), inventory movement invariants, and diagnostic troubleshooting runbook for the Inventory, Warehouse, Batch/FEFO, Dual-UOM Catch-Weight, and Stock Ledger modules.
---

# ERP Inventory & Stock Valuation Skill & Bug-Fixing Runbook

Use this skill whenever working on, modifying, or diagnosing bugs in:
- Stock Ledger Entries (SLE) (`stock_ledger_entries`)
- Materialized Stock Balances (`stock_balances`)
- Weighted Average Cost (WAC) Valuation Engine
- Batch & Lot Expiry Tracking & Automated FEFO Engine (GAP 5)
- Multi-UOM & Variable Catch-Weight Management (GAP 6)
- Inter-Plant & Intra-Plant Stock Transfers (`stock_transfers`, transit warehouses)
- Admin Stock Reconciliation & Overrides (`stock_reconciliations`)
- Stock Reservation Engine (`stock_reservations`)

---

## 1. Absolute Invariants of Inventory Management

1. **Strictly Movement-Based:** Inventory quantities are derived from the append-only `stock_ledger_entries` log.
2. **Never Mutate or Delete:** Deleting or directly editing rows in `stock_ledger_entries` or `stock_balances` is strictly forbidden.
3. **Pessimistic Locking:** Any movement or valuation calculation MUST acquire a `SELECT FOR UPDATE` lock on the corresponding row in `stock_balances`.
4. **Zero-Stock Reset:** When `quantityOnHand` reaches zero, running `valuationRatePaise` must be reset to zero.
5. **No Negative Inventory:** Unless a warehouse or company is explicitly flagged with `allow_negative_stock = true`, transactions resulting in negative stock must abort immediately.

---

## 2. Core Mathematical & Valuation Models

### A. Weighted Average Cost (WAC) Calculation

For any inward stock movement ($\text{Direction} = \text{IN}$):

$$\text{New WAC} = \frac{(\text{Current Qty} \times \text{Current WAC}) + (\text{Incoming Qty} \times \text{Incoming Rate})}{\text{Current Qty} + \text{Incoming Qty}}$$

For outward movements ($\text{Direction} = \text{OUT}$):
- Valuation rate is snapped from the **current WAC** at that instant.
- The unit rate remains unchanged; only quantity decreases.

### B. Valuation-Only Adjustments (Landed Cost Voucher - GAP 3)

When extra freight or customs duties are capitalized onto existing stock:
- Inward movement with $\text{Quantity} = 0$:
$$\text{New WAC} = \frac{(\text{Current Qty} \times \text{Current WAC}) + \text{Extra Apportioned Landed Amount}}{\text{Current Qty}}$$
- If $\text{Current Qty} == 0$, the extra landed cost cannot be added to non-existent inventory; it must post to `COGS Variance / Landed Expense` in the GL.

### C. Automated FEFO Reservation Algorithm (GAP 5)

When generating picking lists, reservations, or delivery challans for batch-tracked items:

```sql
SELECT 
  sb.batch_id,
  sb.warehouse_id,
  sb.quantity_on_hand,
  ib.batch_number,
  ib.expiry_date,
  ib.manufacturing_date
FROM stock_balances sb
JOIN item_batches ib ON sb.batch_id = ib.id
WHERE sb.item_id = $itemId 
  AND sb.warehouse_id = $warehouseId
  AND sb.quantity_on_hand > 0
  AND ib.qc_status = 'approved'
  AND (ib.expiry_date IS NULL OR ib.expiry_date >= $requiredDate + INTERVAL '1 day' * $minShelfLifeDays)
ORDER BY ib.expiry_date ASC NULLS LAST, ib.created_at ASC
FOR UPDATE OF sb;
```

### D. Dual UOM Catch-Weight Factor (GAP 6)

For items where units vary in actual weight (e.g. Slabs, Steel Coils, Meat):
- **Stocking UOM (Primary):** Used for physical tracking in warehouse (`PCS`, `SLABS`).
- **Billing UOM (Secondary):** Used for pricing, invoicing, and weight-based GL valuation (`KG`, `MT`).
- **Catch-Weight Ratio Verification:**
$$\text{Ratio} = \frac{\text{Secondary Qty}}{\text{Primary Qty}}$$
$$\left| \frac{\text{Ratio} - \text{Nominal Ratio}}{\text{Nominal Ratio}} \right| \le \text{Catch Weight Tolerance Pct}$$
If tolerance is exceeded, require supervisor override.

---

## 3. Stock Movement Classification

| Movement Type | Direction | Valuation Source | Triggering Document |
|---|---|---|---|
| `purchase_receipt` | IN | Line Purchase Rate | Goods Receipt Note (GRN) |
| `production_receipt` | IN | Cost Roll-Up (BOM + Labor + Machine) | Work Order Complete |
| `transfer_receipt` | IN | Snapshot from Issue SLE | Stock Transfer Inward |
| `return_from_customer` | IN | Original Dispatch Cost | Sales Return |
| `subcon_receipt` | IN | Raw Material Value + Vendor Fee | Subcontracting GRN |
| `adjustment_in` | IN | Manual / LCV Delta | Stock Adjustment / LCV |
| `sales_delivery` | OUT | Snapshot Current WAC | Delivery Challan / Invoice |
| `issue_to_production` | OUT | Snapshot Current WAC | Work Order Material Issue |
| `transfer_issue` | OUT | Snapshot Current WAC | Stock Transfer Outward |
| `subcon_issue` | OUT | Snapshot Current WAC | Job Work Outward Challan |
| `return_to_vendor` | OUT | Snapshot Current WAC | Purchase Return (RTV) |
| `scrap_write_off` | OUT | Snapshot Current WAC | Scrap Voucher |
| `adjustment_out` | OUT | Snapshot Current WAC | Stock Adjustment |

---

## 4. Diagnostic Runbook for Inventory Bug Fixing

### Bug 1: Discrepancy Between `stock_balances` and `stock_ledger_entries` (Stock Drift)
- **Symptom:** `stock_balances.quantityOnHand` displays 150 units, but summing all SLEs yields 120 units.
- **Root Causes:**
  1. A transaction failed halfway without an enclosing ACID transaction, writing `stock_balances` without SLE or vice-versa.
  2. Direct manual DB update on `stock_balances`.
- **Diagnostic Query:**
  ```sql
  SELECT 
    sb.company_id, sb.warehouse_id, sb.item_id, sb.batch_id,
    sb.quantity_on_hand AS cached_balance,
    COALESCE(SUM(
      CASE WHEN sle.movement_type IN ('purchase_receipt','production_receipt','transfer_receipt','return_from_customer','opening_balance','adjustment_in','by_product_receipt','subcon_receipt') 
           THEN sle.quantity 
           ELSE -sle.quantity END
    ), 0) AS derived_balance
  FROM stock_balances sb
  LEFT JOIN stock_ledger_entries sle 
    ON sb.company_id = sle.company_id 
   AND sb.warehouse_id = sle.warehouse_id 
   AND sb.item_id = sle.itemId
   AND (sb.batch_id = sle.batchId OR (sb.batch_id IS NULL AND sle.batchId IS NULL))
  GROUP BY sb.company_id, sb.warehouse_id, sb.item_id, sb.batch_id, sb.quantity_on_hand
  HAVING sb.quantity_on_hand != COALESCE(SUM(
    CASE WHEN sle.movement_type IN ('purchase_receipt','production_receipt','transfer_receipt','return_from_customer','opening_balance','adjustment_in','by_product_receipt','subcon_receipt') 
         THEN sle.quantity 
         ELSE -sle.quantity END
  ), 0);
  ```
- **Remediation Pattern:** Run recalculation migration script to restore `stock_balances` strictly from the historical sum of `stock_ledger_entries`.

---

### Bug 2: Race Condition Creating Negative Stock Under High Concurrency
- **Symptom:** Two simultaneous orders for 10 units each succeed when only 10 units were in stock, resulting in -10 units.
- **Root Causes:**
  - Code read available quantity, evaluated `if (available >= requested)`, and only then issued stock without locking the row.
- **Remediation Pattern:**
  Enforce `SELECT FOR UPDATE` on `stock_balances` inside the single `tx` transaction before evaluating balance or inserting SLE.

---

### Bug 3: Batch Expiry Bypass on Delivery Challan
- **Symptom:** An expired batch was dispatched to a customer.
- **Root Causes:**
  - Frontend batch selector did not validate `ib.expiry_date < CURRENT_DATE`.
  - Backend API endpoint trusted client-supplied `batchId` without verifying expiry date against server time.
- **Remediation Rule:**
  In `apps/api/src/routes/sales.ts` / delivery note validation:
  ```ts
  if (batch.expiryDate && new Date(batch.expiryDate) < new Date(deliveryDate)) {
    throw new Error(`Batch ${batch.batchNumber} expired on ${batch.expiryDate} and cannot be dispatched.`);
  }
  ```

---

## 5. Security & RBAC Codes for Inventory

| Capability | Permission Code |
|---|---|
| View Stock Ledger | `inventory.sle.view` |
| View Stock Balances | `inventory.balance.view` |
| Transfer Stock | `inventory.transfer.create`, `inventory.transfer.approve` |
| Batch Management | `inventory.batch.manage` |
| Admin Stock Reconciliation | `admin.stock_adjustment.override` |
| Scrap Write-Off | `inventory.scrap.create` |

