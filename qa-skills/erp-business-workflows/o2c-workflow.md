# Order-to-Cash (O2C) Business Workflow Runbook

## 1. Sequence & Lifecycle
1. **Customer & Stock Setup:**
   - Customer master created with credit limit and billing address.
   - Finished goods item verified on hand in warehouse (via prior production or GRN).
2. **Sales Order (SO):**
   - Created in `draft` status.
   - Transition: `POST /api/sales/orders/:id/submit` $\to$ `submitted`.
   - Transition: `POST /api/sales/orders/:id/approve` $\to$ `approved`.
   - **Automated Actions:**
     - Validates customer credit limit.
     - Creates active hard reservation in `stock_reservations`.
     - Updates `stock_balances.quantity_reserved`.
3. **Delivery Challan (Dispatch):**
   - Created in `draft` with reference to `soId` and `soLineId`.
   - Optional automated FEFO batch recommendation: `GET /api/sales/fefo-recommendations`.
   - Transition: Submit $\to$ Approve.
   - **Automated Actions:**
     - Appends outward SLE (`movement_type = 'sales_delivery'`).
     - Snaps unit valuation rate from instant moving WAC.
     - Releases reservation row in `stock_reservations` (`status = 'fulfilled'`).
     - Inserts balanced Journal Voucher:
       - **DR** Cost of Goods Sold (COGS) Account (at snapped WAC)
       - **CR** Inventory Asset Account
4. **Sales Invoice (Tax Billing):**
   - Created in `draft` referencing `soId` and `deliveryId`.
   - Transition: Submit $\to$ Approve.
   - **Automated Actions:**
     - Inserts balanced Journal Voucher:
       - **DR** Customer Accounts Receivable
       - **CR** Sales Revenue Account
       - **CR** Output GST Accounts (CGST/SGST or IGST)
5. **Customer Payment Receipt:**
   - Created with `receivedAmountPaise` and invoice allocations.
   - Transition: Submit $\to$ Approve.
   - **Automated Actions:**
     - Inserts balanced Journal Voucher:
       - **DR** Bank / Cash Account
       - **CR** Customer Accounts Receivable

