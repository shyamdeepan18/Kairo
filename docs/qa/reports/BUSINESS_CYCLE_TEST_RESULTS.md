# Business Cycle Test Results

## 1. Procure-to-Pay (P2P) Lifecycle Result: ✅ PASSED
- **Workflow Path:** Supplier $\to$ Raw Item $\to$ PO $\to$ GRN $\to$ Bill $\to$ Payment.
- **Verification Summary:**
  1. Vendor master created (`SUP-...`).
  2. Purchase item created (`ITEM-...`, purchase rate: 1,000 INR).
  3. PO created for 20 units @ 1,000 INR = 20,000 INR.
  4. Submitted and Approved via status engine.
  5. GRN created and approved for 20 units.
  6. Inward SLE verified: `quantity = 20`, `valuation_rate_paise = 100000`.
  7. Materialized stock balance verified: `quantity_on_hand >= 20`.
  8. GRN balanced journal entry verified: **DR** Inventory Asset / **CR** AP Clearing.
  9. Purchase invoice created, submitted, approved.
  10. Invoice balanced journal entry verified: **DR** AP Clearing / **CR** Vendor AP.
  11. Vendor payment processed and allocated against invoice.
  12. Payment balanced journal entry verified: **DR** Vendor AP / **CR** Bank Account.

---

## 2. Order-to-Cash (O2C) Lifecycle Result: ✅ PASSED
- **Workflow Path:** Customer $\to$ Inward Stock $\to$ SO $\to$ Stock Reservation $\to$ Delivery Challan $\to$ Tax Invoice $\to$ Customer Receipt.
- **Verification Summary:**
  1. Customer master created (`CUST-...`).
  2. Stock item replenished with 50 units @ 900 INR.
  3. SO booked for 15 units @ 1,500 INR = 22,500 INR.
  4. Submitted and Approved.
  5. Hard reservation verified in `stock_reservations`: `reserved_qty = 15`.
  6. Delivery Challan dispatched and approved.
  7. Outward SLE verified: `movement_type = 'sales_delivery'`, `quantity = 15`.
  8. Reservation released: `stock_reservations` verified cleared/fulfilled.
  9. COGS journal entry verified: **DR** COGS / **CR** Inventory Asset.
  10. Tax invoice created, submitted, approved.
  11. Revenue journal entry verified: **DR** Customer AR / **CR** Sales Revenue.
  12. Customer payment receipt processed.
  13. Receipt journal entry verified: **DR** Bank Account / **CR** Customer AR.

---

## 3. Subcontracting Lifecycle (GAP 4) Result: ⚠️ BLOCKED (Defect BUG-001)
- **Workflow Path:** Subcontractor Vendor $\to$ Consignment Warehouse $\to$ JWO $\to$ Outward Challan $\to$ Inward Receipt.
- **Verification Summary:**
  1. Subcontractor vendor and consignment warehouse verified.
  2. Raw material item and target finished good item created.
  3. Initial raw material stock brought into plant warehouse.
  4. JWO created in `draft` status successfully.
  5. Calling `POST /job-work-orders/:id/submit` rejected with HTTP 409: `Invalid transition for manufacturing.job_work_order: draft → submitted`.
  6. Outward Challan rejected when referencing unapproved JWO (business rule enforced).
  7. Defect reported in `docs/qa/BUG_REPORTS/BUG-001-JWO-TRANSITION-MISSING.md`.

