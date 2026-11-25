# ERP Transaction Operational, Inventory & Financial Impact Matrix

This matrix documents the functional, inventory movement, valuation, accounts payable, accounts receivable, tax, and general ledger impact for every transactional lifecycle supported by Kairo ERP.

---

## 1. Executive Summary & Principles

In accordance with ERP Core Invariants:
1. **Movement-Based Inventory:** Stock balances are never directly updated. Every quantity modification stems from an atomic entry in `stock_ledger_entries`.
2. **Double-Entry Equilibrium:** Every posted journal entry strictly adheres to $\sum \text{Debit} = \sum \text{Credit} > 0$.
3. **Perpetual Inventory & Receipt Accrual (GRNI):** Inward physical stock is capitalized at Goods Receipt Note (GRN) into `inventory_raw_material` (or `inventory_finished`) against suspense account `grn_clearing`. The subsequent Purchase Invoice clears `grn_clearing` and establishes the `accounts_payable` liability.
4. **Perpetual Cost of Goods Sold (COGS):** Outward physical dispatch via Delivery Challan removes stock at Weighted Average Cost (WAC), debiting `cogs` (`raw_material_consumed` / `4110`) and crediting `inventory_finished` (`1330`). The subsequent Sales Invoice recognizes `sales_revenue` (`3010`) and `accounts_receivable` (`1410`).

---

## 2. Complete Transaction Impact Matrix

| Module | Transaction Type | Source Doc | Target Doc | Inventory Impact | Qty Impact | Valuation Impact | Debit Account (Category / Code) | Credit Account (Category / Code) | AP Impact | AR Impact | Tax Impact | Financial Statement Impact | Reversal Behavior | Automated QA Test Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Procurement** | **Purchase Order (PO)** | Purchase Requisition | GRN | None | None (Physical 0) | None | None | None | None | None | None | Commitment only (Off Balance Sheet) | Cancel PO | **Automated** (`deep-p2p-financial.spec.ts`) |
| **Purchasing** | **Goods Receipt Note (GRN)** | Purchase Order | Purchase Invoice | `purchase_receipt` | $+Q$ | $+Q \times \text{Rate}$ | `inventory_raw_material` (`1310`) | `grn_clearing` (`2510`) | None | None | Input GST $\to$ `grn_tax_clearing` (`2511`) | Increases Assets (Current Assets: Inventory), Increases Current Liabilities (GRNI Accrual) | Return to Vendor (`purchase.return`) | **Automated** (`deep-p2p-financial.spec.ts`) |
| **Purchasing** | **Landed Cost Voucher (LCV)** | GRN | Item Cost Layer | None | $0$ (Capitalization) | $+ \Delta \text{Freight/Landed}$ | `inventory_raw_material` (`1310`) | `freight_clearing` / Cash (`1520`) | None | None | None | Capitalizes freight into Inventory Asset; increases WAC | Reversal JV | **Automated** (`p2p-api.spec.ts`) |
| **Accounts Payable** | **Purchase Invoice (Bill)** | GRN / PO | Payment | None | $0$ | None | `grn_clearing` (`2510`) | `accounts_payable` (`2310`) | $+ \text{Payable}$ | None | Clears `grn_tax_clearing` $\to$ claims Input GST | Clears Current Liabilities (GRNI Suspense), Recognizes Trade Creditors | Debit Note (`purchase.debit_note`) | **Automated** (`deep-p2p-financial.spec.ts`) |
| **Accounts Payable** | **Purchase Debit Note** | Purchase Invoice | None | None | $0$ | None | `accounts_payable` (`2310`) | `grn_clearing` (`2510`) | $- \text{Payable}$ | None | Reverses Input GST | Reduces Trade Creditors, Reduces Purchases/Clearing | Cancel Debit Note | **Automated** (`p2p-api.spec.ts`) |
| **Treasury / Cash** | **Vendor Payment** | Purchase Invoice | Bank Statement | None | $0$ | None | `accounts_payable` (`2310`) | `bank` (`1520`) / `cash` (`1510`) | $- \text{Payable}$ (Clears to 0) | None | None | Reduces Current Assets (Bank), Reduces Current Liabilities (AP) | Payment Cancellation / Reversal | **Automated** (`deep-p2p-financial.spec.ts`) |
| **Sales** | **Sales Quotation** | Inquiry | Sales Order | None | None | None | None | None | None | None | None | Quotation pipeline only | Cancel Quotation | **Automated** (`smoke.spec.ts`) |
| **Sales** | **Sales Order (SO)** | Sales Quotation | Delivery Challan | Soft Reservation (`stock_reservations`) | Physical 0 (Avail $-Q$) | None | None | None | None | None | None | Customer order backlog (Off Balance Sheet) | Cancel SO | **Automated** (`deep-o2c-financial.spec.ts`) |
| **Sales / Dispatch** | **Delivery Challan (Shipment)** | Sales Order | Sales Invoice | `sales_delivery` | $-Q$ (Release Reservation) | $-Q \times \text{WAC}$ | `cogs` / `raw_material_consumed` (`4110`) | `inventory_finished` (`1330`) / Raw (`1310`) | None | None | None | P&L: Increases Cost of Goods Sold; Balance Sheet: Reduces Inventory Asset | Sales Return (`sales.return`) | **Automated** (`deep-o2c-financial.spec.ts`) |
| **Accounts Receivable** | **Sales Invoice** | Delivery Challan | Customer Receipt | None | $0$ | None | `accounts_receivable` (`1410`) | `sales_revenue` (`3010`) | None | $+ \text{Receivable}$ | Credits `output_cgst`/`sgst`/`igst` (`2411-2413`) | P&L: Recognizes Sales Revenue; Balance Sheet: Increases Accounts Receivable & GST Payable | Credit Note (`sales.credit_note`) | **Automated** (`deep-o2c-financial.spec.ts`) |
| **Accounts Receivable** | **Sales Credit Note** | Sales Invoice | None | None | $0$ | None | `sales_revenue` (`3010`) | `accounts_receivable` (`1410`) | None | $- \text{Receivable}$ | Reverses Output GST | Reduces Sales Revenue, Reduces Accounts Receivable | Cancel Credit Note | **Automated** (`o2c-api.spec.ts`) |
| **Treasury / Cash** | **Customer Payment Receipt** | Sales Invoice | Bank Statement | None | $0$ | None | `bank` (`1520`) / `cash` (`1510`) | `accounts_receivable` (`1410`) | None | $- \text{Receivable}$ (Clears to 0) | None | Increases Current Assets (Bank), Decreases Current Assets (AR) | Payment Cancellation / Reversal | **Automated** (`deep-o2c-financial.spec.ts`) |
| **Subcontracting** | **Job Work Order (JWO)** | Production BOM | Outward Challan | None | None | None | None | None | None | None | None | Subcontracting commitment | Cancel JWO | **Automated** (`subcontracting-api.spec.ts`) |
| **Subcontracting** | **Outward Subcon Challan (JWC)** | Job Work Order | Inward Receipt | `subcon_issue` OUT, `transfer_receipt` IN | Plant $-Q$, Subcon $+Q$ | Company Net $0$ | None (Consignment transfer) | None (Consignment transfer) | None | None | Transport Delivery Challan (Sec 143) | Balance Sheet: Inventory reclassified from Plant to Consignment Warehouse | Return Challan | **Automated** (`subcontracting-api.spec.ts`) |
| **Subcontracting** | **Inward Subcon Receipt (JWR)** | Job Work Order | Vendor Service Bill | Raw: `issue_to_production`, FG: `subcon_receipt` | Raw Subcon $-Q$, FG Plant $+Q_{\text{fg}}$ | Rolled-up: $\text{RawCost} + \text{ServiceFee}$ | `inventory_finished` (`1330`) | `inventory_wip` (`1320`) & `accounts_payable` (`2310`) | $+ \text{Service Fee}$ | None | None | Balance Sheet: Raw Material & Service Fee capitalized into Finished Goods Asset | Material Return | **Automated** (`subcontracting-api.spec.ts`) |
| **Manufacturing** | **Production Order** | Formula / BOM | Issue / Receipt | None | None | None | None | None | None | None | None | Production plan | Cancel Order | **Automated** (`accounting-api.spec.ts`) |
| **Manufacturing** | **Material Issue to WIP** | Production Order | Production Receipt | `issue_to_production` | $-Q$ | $-Q \times \text{WAC}$ | `inventory_wip` (`1320`) | `inventory_raw_material` (`1310`) | None | None | None | Balance Sheet: Reclassifies Raw Material to WIP Inventory | Issue Reversal | **Automated** (`accounting-api.spec.ts`) |
| **Manufacturing** | **Production Receipt (FG)** | Production Order | Work Order Close | `production_receipt` | $+Q_{\text{fg}}$ | Actual / Standard Cost | `inventory_finished` (`1330`) | `inventory_wip` (`1320`) | None | None | Optional: `production_variance` (`4910`) | Balance Sheet: Reclassifies WIP to Finished Goods Inventory | FG Disassembly | **Automated** (`accounting-api.spec.ts`) |
| **Inventory Core** | **Stock Adjustment** | Physical Audit | None | `adjustment_in` / `adjustment_out` | $\pm Q$ | $\pm Q \times \text{WAC}$ | `inventory_raw_material` / `stock_adjustment` (`4900`) | `stock_adjustment` (`4900`) / `inventory_raw_material` | None | None | None | P&L: Recognizes Inventory Shrinkage or Gain; Balance Sheet: Updates Inventory Asset | Counter Adjustment | **Automated** (`database-invariants.spec.ts`) |
| **Inventory Core** | **Warehouse Transfer** | Internal Request | Destination Receipt | `transfer_issue` OUT, `transfer_receipt` IN | Source $-Q$, Dest $+Q$ | Valuation preserved | `inventory_raw_material` (Dest) | `inventory_raw_material` (Source) | None | None | None | Balance Sheet: Inter-warehouse stock reclassification | Reverse Transfer | **Automated** (`database-invariants.spec.ts`) |
| **General Ledger** | **Manual Journal Voucher (JV)** | Voucher Entry | Audit Trail | None | $0$ | None | Mapped Debit Account | Mapped Credit Account | None | None | Tax line posting | Direct Balance Sheet & P&L Adjustment | Reversal JV | **Automated** (`accounting-api.spec.ts`) |

---

## 3. Detailed Financial Accounting Lifecycles

### A. Procure-to-Pay (P2P) Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Buyer
    participant PO as Purchase Order
    participant GRN as Goods Receipt Note
    participant SLE as Stock Ledger (SLE)
    participant Inv as Inventory Asset (1310)
    participant GRNI as GR/IR Clearing (2510)
    participant Bill as Purchase Invoice
    participant AP as Accounts Payable (2310)
    participant Bank as Bank Account (1520)

    Buyer->>PO: 1. Create PO (100 units @ 10 INR = 1,000 INR)
    Note over PO: No physical inventory changes; No GL entries
    Buyer->>GRN: 2. Receive Goods (100 units)
    GRN->>SLE: 3. Insert movement (purchase_receipt, +100 units, Rate = 10 INR)
    GRN->>Inv: 4. DR Inventory Asset (1310): 1,000 INR
    GRN->>GRNI: 5. CR GR/IR Clearing (2510): 1,000 INR
    Note over GRNI: Accrual established; Vendor not yet liable
    Buyer->>Bill: 6. Book Vendor Invoice (1,000 INR)
    Bill->>GRNI: 7. DR GR/IR Clearing (2510): 1,000 INR (Clears to 0)
    Bill->>AP: 8. CR Accounts Payable (2310): 1,000 INR (Supplier liability)
    Buyer->>Bank: 9. Pay Vendor (1,000 INR)
    Bank->>AP: 10. DR Accounts Payable (2310): 1,000 INR (Outstanding -> 0)
    Bank->>Bank: 11. CR Bank Account (1520): 1,000 INR
```

### B. Order-to-Cash (O2C) Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Seller
    participant SO as Sales Order
    participant Res as Stock Reservation
    participant DC as Delivery Note
    participant SLE as Stock Ledger (SLE)
    participant COGS as COGS / Material Consumed (4110)
    participant Inv as Inventory Asset (1330/1310)
    participant Invce as Sales Invoice
    participant AR as Accounts Receivable (1410)
    participant Rev as Sales Revenue (3010)
    participant Bank as Bank Account (1520)

    Seller->>SO: 1. Create SO (10 units @ 20 INR = 200 INR)
    SO->>Res: 2. Reserve 10 units against on-hand stock
    Note over SO: Physical on-hand unchanged; Revenue not recognized
    Seller->>DC: 3. Dispatch & Ship (10 units)
    DC->>Res: 4. Release reservation (-10 units)
    DC->>SLE: 5. Insert movement (sales_delivery, -10 units @ 10 INR WAC)
    DC->>COGS: 6. DR Cost of Goods Sold (4110): 100 INR
    DC->>Inv: 7. CR Inventory Asset (1310/1330): 100 INR
    Seller->>Invce: 8. Issue Customer Tax Invoice (200 INR)
    Invce->>AR: 9. DR Accounts Receivable (1410): 200 INR (Customer debt)
    Invce->>Rev: 10. CR Sales Revenue (3010): 200 INR (P&L Income)
    Seller->>Bank: 11. Receive Customer Payment (200 INR)
    Bank->>Bank: 12. DR Bank Account (1520): 200 INR
    Bank->>AR: 13. CR Accounts Receivable (1410): 200 INR (Outstanding -> 0)
```

---

## 4. Key Accounting Invariants Enforced

1. **Perpetual Inventory Reconciliation:**
   $$\sum_{\text{movements}} \text{quantity} = \text{stock\_balances.quantity\_on\_hand}$$
   $$\sum_{\text{lines}} (\text{quantity} \times \text{valuation\_rate}) = \text{GL Balance}(\text{Inventory Asset } 1310/1330)$$
2. **GRNI Clearing Equilibrium:**
   $$\text{Balance}(\text{GR/IR Clearing } 2510) = \sum \text{GRN Net} - \sum \text{Invoice Net} \equiv 0 \quad (\text{after full 3-way match})$$
3. **Subledger Control Account Reconciliation:**
   $$\text{Balance}(\text{AP Control } 2310) \equiv \sum_{\text{suppliers}} \text{Outstanding Balance}$$
   $$\text{Balance}(\text{AR Control } 1410) \equiv \sum_{\text{customers}} \text{Outstanding Balance}$$
4. **General Ledger Balance:**
   $$\sum_{\text{all lines}} \text{debit\_amount\_paise} \equiv \sum_{\text{all lines}} \text{credit\_amount\_paise}$$

