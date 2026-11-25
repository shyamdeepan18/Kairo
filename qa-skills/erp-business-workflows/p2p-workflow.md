# Procure-to-Pay (P2P) Business Workflow Runbook

## 1. Sequence & Lifecycle
1. **Supplier & Item Setup:**
   - Supplier created with registered GSTIN and payment terms.
   - Item created with `itemType: 'raw_material'` and base UOM.
2. **Purchase Order (PO):**
   - Created in `draft` status.
   - Transition: `POST /api/purchase/orders/:id/submit` $\to$ `status = 'submitted'`.
   - Transition: `POST /api/purchase/orders/:id/approve` $\to$ `status = 'approved'`.
3. **Goods Receipt Note (GRN):**
   - Created in `draft` with reference to `poId` and `poLineId`.
   - Transition: `POST /api/purchase/grns/:id/submit` $\to$ `submitted`.
   - Transition: `POST /api/purchase/grns/:id/approve` $\to$ `approved`.
   - **Automated Actions:**
     - Appends SLE (`movement_type = 'purchase_receipt'`, positive qty).
     - Updates `stock_balances.quantity_on_hand` and recalculates WAC.
     - Inserts balanced Journal Voucher:
       - **DR** Inventory Asset Account
       - **CR** AP Clearing Account (Unbilled Inward Liability)
4. **Purchase Invoice (3-Way Match):**
   - Created in `draft` referencing `poId`, `grnLineId`, vendor invoice number & date.
   - Transition: Submit $\to$ Approve.
   - **Automated Actions:**
     - Inserts balanced Journal Voucher:
       - **DR** AP Clearing Account
       - **DR** Input GST Accounts (CGST/SGST or IGST)
       - **CR** Vendor Accounts Payable
5. **Vendor Payment:**
   - Created with `paidAmountPaise` and invoice allocations.
   - Transition: Submit $\to$ Approve.
   - **Automated Actions:**
     - Inserts balanced Journal Voucher:
       - **DR** Vendor Accounts Payable
       - **CR** Bank / Cash Account

