# Subcontracting & Outside Job Work (GAP 4) Workflow Runbook

## 1. Sequence & Lifecycle
1. **Masters Setup:**
   - Subcontractor Supplier created.
   - Raw Material Item and Output Processed Item created.
   - Raw material stock brought into plant warehouse.
   - Designated Subcontractor Virtual Warehouse identified (`warehouseType = 'consignment'`).
2. **Job Work Order (JWO):**
   - Created via `POST /api/manufacturing/job-work-orders`.
   - Defines target item, target qty, service fee per unit (`serviceRatePaise`), and BOM inputs.
   - Must transition: `draft → submitted → approved`.
   - *Note: See BUG-001 regarding missing transition definition in status engine.*
3. **Outward Challan:**
   - Created via `POST /api/manufacturing/job-work-challans`.
   - Moves raw stock from plant warehouse to vendor virtual warehouse (`movement_type = 'subcon_issue'`).
   - Material remains an asset on company balance sheet.
4. **Inward Receipt & Capitalization:**
   - Created via `POST /api/manufacturing/job-work-receipts`.
   - Consumes raw materials at vendor virtual warehouse (`movement_type = 'issue_to_production'`).
   - Receives finished item into plant warehouse (`movement_type = 'subcon_receipt'`).
   - **Cost Roll-Up Formula:**
     $$\text{FG Unit Valuation} = \frac{\sum (\text{Consumed Raw Material Costs}) + (\text{Received Qty} \times \text{serviceRatePaise})}{\text{Received Qty}}$$
   - **Balanced GL Entry:**
     - **DR** Finished Inventory Asset ($\text{FG Valuation}$)
     - **CR** Raw Material Inventory Asset (Consumed amount)
     - **CR** Subcontractor Service Payable / AP Clearing

