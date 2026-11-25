---
name: erp-financial-validation
description: Reusable AI QA intelligence for deep transactional, inventory valuation, and double-entry General Ledger reconciliation across all ERP workflows.
---

# ERP Financial Validation & Accounting Invariants QA Skill

This skill documents the mathematical models, double-entry journal templates, inventory subledger valuation invariants, and diagnostic procedures used for deep transactional and financial validation across Kairo ERP.

---

## 1. Core Invariants & System Axioms

1. **Movement-Based Inventory (Stock Ledger)**
   - Stock quantities are never directly updated.
   - Every physical inward or outward movement inserts an immutable row into `stock_ledger_entries`.
   - On-hand quantity is the cumulative sum of `stock_ledger_entries.quantity`.
   - Valuations follow Weighted Average Cost (WAC):
     $$\text{New WAC} = \frac{(\text{Current Qty} \times \text{Current WAC}) + (\text{Inward Qty} \times \text{Inward Rate})}{\text{Current Qty} + \text{Inward Qty}}$$

2. **Perpetual Inventory Double-Entry Accounting**
   - Every physical movement or financial claim posts balanced double-entry vouchers to `journal_entries` and `journal_entry_lines`.
   - Fundamental Equilibrium Axiom:
     $$\sum \text{Debit Amount (Paise)} = \sum \text{Credit Amount (Paise)}$$
   - All monetary calculations are performed in integer **paise** ($1\text{ INR} = 100\text{ paise}$) to eliminate floating-point drift.

3. **Append-Only Financial Ledger**
   - Journal entries and lines are strictly append-only.
   - Posted vouchers are never updated or deleted; cancellations generate compensatory reversing journal entries.

---

## 2. Standard Financial Impact Patterns

### A. Procure-to-Pay (P2P)

| Stage | Document | Inventory Impact | General Ledger Entry | Subledger Impact |
|---|---|---|---|---|
| **1. Purchase Order** | `purchase.order` | None (0) | *No financial entry* | Committed PO backlog |
| **2. Goods Receipt** | `purchase.grn` | $+Q$ Inward (WAC) | **DR** 1310 Raw Materials / Asset<br>**CR** 2510 GR/IR Clearing | Increases on-hand stock |
| **3. Purchase Invoice** | `purchase.invoice` | None (0) | **DR** 2510 GR/IR Clearing<br>**CR** 2310 Creditors (Trade AP) | Increases Vendor AP balance |
| **4. Payment** | `purchase.payment` | None (0) | **DR** 2310 Creditors (Trade AP)<br>**CR** 1520 Bank Account | Decreases Vendor AP balance to 0 |

#### GR/IR Clearing Zero-Balance Invariant
Upon invoice approval matching a GRN, the GR/IR Clearing account (`2510`) must net to **0**:
$$\text{GR/IR Balance} = \text{Debit}_{\text{Invoice}} - \text{Credit}_{\text{GRN}} = 0$$

### B. Order-to-Cash (O2C)

| Stage | Document | Inventory Impact | General Ledger Entry | Subledger Impact |
|---|---|---|---|---|
| **1. Sales Order** | `sales.order` | None (Reservations) | *No financial entry* | $+Q$ Reserved, Available decreases |
| **2. Delivery Challan** | `sales.delivery` | $-Q$ Outward (COGS) | **DR** 4110 Cost of Goods Sold<br>**CR** 1330 Finished Goods Asset | Decreases on-hand stock, releases reservation |
| **3. Sales Invoice** | `sales.invoice` | None (0) | **DR** 1410 Debtors (Trade AR)<br>**CR** 3010 Sales Revenue | Increases Customer AR balance |
| **4. Payment Receipt** | `sales.receipt` | None (0) | **DR** 1520 Bank Account<br>**CR** 1410 Debtors (Trade AR) | Clears Customer AR balance to 0 |

#### Gross Margin Verification Formula
$$\text{Gross Margin} = \text{Recognized Revenue (3010)} - \text{Recognized COGS (4110)}$$

---

## 3. Financial Validator Test Engine API

The QA automation framework provides `FinancialValidator` (`tests/helpers/financial-validator.ts`) for zero-drift verification:

```typescript
import { FinancialValidator } from '../helpers/financial-validator.js';

const finValidator = new FinancialValidator();

// 1. Validate Double-Entry for any source document
const journals = await finValidator.getDocumentJournal(docId);
expect(journals[0].totalDebitPaise).toBe(expectedPaise);
expect(journals[0].totalCreditPaise).toBe(expectedPaise);

// 2. Validate Inventory Subledger & WAC
await finValidator.assertInventorySubledger(itemId, warehouseId, expectedQty, expectedValuationPaise);

// 3. Validate Party Balance (AP / AR)
const partyBal = await finValidator.getPartyBalance('supplier', supplierId);
expect(partyBal.outstandingPaise).toBe(expectedPaise);

// 4. Validate GR/IR Accrual Zero-Net Balance
await finValidator.assertGrnClearingBalance(companyId, 0);

// 5. Validate Global Accounting Equilibrium across the entire database
const equilibrium = await finValidator.assertGlobalAccountingEquilibrium();
expect(equilibrium.globalDebitPaise).toBe(equilibrium.globalCreditPaise);
```

---

## 4. Diagnostic Runbook for Financial & Inventory Failures

### Symptom 1: `PO line received quantity not updating`
- **Root Cause:** When creating the GRN, the line items were missing `poLineId`.
- **Solution:** Query the approved PO detail `GET /purchase/orders/:id` and assign `poLineId: po.lines[0].id` to the GRN line item.

### Symptom 2: `Stock reservations not recorded on Sales Order approval`
- **Root Cause:** The Sales Order lines did not specify `warehouseId`.
- **Solution:** Ensure `warehouseId` is provided on each line item of `POST /sales/orders` so the reservation engine knows which warehouse stock pool to lock.

### Symptom 3: `Invalid input on Payments / Receipts API (400)`
- **Purchase Payment:** Requires `paymentMode: 'bank_transfer'` (or cash/cheque/upi), `paidAmountPaise`, and `allocations: [{ invoiceId, allocatedAmountPaise }]`.
- **Customer Receipt:** Requires `receiptMode: 'bank_transfer'`, `receivedAmountPaise`, and `allocations: [{ invoiceId, allocatedAmountPaise }]`.

