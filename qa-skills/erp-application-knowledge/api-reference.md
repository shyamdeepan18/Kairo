# API Reference & Route Conventions

All requests must carry `Authorization: Bearer <accessToken>` (after logging in and selecting context).

## 1. Authentication
- `POST /api/auth/login`: `{ email, password }` $\to$ `{ accessToken, user }` + set refresh cookie.
- `POST /api/auth/select-context`: `{ companyId, plantId }` $\to$ `{ accessToken, context }`.
- `GET /api/auth/me`: `{ user }`.
- `POST /api/auth/logout`: `{ success: true }`.

## 2. Procurement (P2P)
- `GET /api/purchase/suppliers`: Query vendors.
- `POST /api/purchase/suppliers`: Create vendor.
- `GET /api/purchase/orders`: List POs.
- `POST /api/purchase/orders`: Create PO `{ plantId, supplierId, postingDate, lines }`.
- `POST /api/purchase/orders/:id/submit`: Transition `draft → submitted`.
- `POST /api/purchase/orders/:id/approve`: Transition `submitted → approved`.
- `POST /api/purchase/grns`: Create GRN `{ plantId, supplierId, poId, warehouseId, postingDate, lines }`.
- `POST /api/purchase/grns/:id/submit`: Transition `draft → submitted`.
- `POST /api/purchase/grns/:id/approve`: Transition `submitted → approved` (Posts SLE + GL).
- `POST /api/purchase/invoices`: Create Bill `{ plantId, supplierId, poId, supplierInvoiceNumber, supplierInvoiceDate, lines }`.
- `POST /api/purchase/invoices/:id/submit` & `/approve`: Posts GL.
- `POST /api/purchase/payments`: Create payment `{ plantId, supplierId, paidAmountPaise, paymentMode, allocations }`.
- `POST /api/purchase/payments/:id/submit` & `/approve`: Posts GL.

## 3. Order-to-Cash (O2C)
- `GET/POST /api/sales/customers`: Customer management.
- `POST /api/sales/orders`: Create SO `{ plantId, customerId, postingDate, lines }`.
- `POST /api/sales/orders/:id/submit` & `/approve`: Reserves stock.
- `POST /api/sales/deliveries`: Create Delivery Challan `{ plantId, customerId, soId, warehouseId, lines }`.
- `POST /api/sales/deliveries/:id/submit` & `/approve`: Posts SLE + COGS GL, clears reservation.
- `POST /api/sales/invoices`: Create Sales Invoice `{ plantId, customerId, soId, deliveryId, lines }`.
- `POST /api/sales/invoices/:id/submit` & `/approve`: Posts Revenue GL.
- `POST /api/sales/receipts`: Create Receipt `{ plantId, customerId, receivedAmountPaise, allocations }`.
- `POST /api/sales/receipts/:id/submit` & `/approve`: Posts Bank GL.

## 4. Subcontracting & Manufacturing
- `POST /api/manufacturing/job-work-orders`: Create JWO `{ plantId, vendorId, vendorWarehouseId, targetItemId, targetQty, uom, serviceRatePaise, materials }`.
- `POST /api/manufacturing/job-work-challans`: Outward material transfer `{ plantId, jobWorkOrderId, sourceWarehouseId, lines }`.
- `POST /api/manufacturing/job-work-receipts`: Inward finished goods receipt `{ plantId, jobWorkOrderId, destinationWarehouseId, receivedQty, rawMaterialsConsumed }`.

## 5. Accounting & Reports
- `GET/POST /api/accounting/jv`: Manual double-entry Journal Vouchers.
- `GET/POST /api/accounting/projects`: Project contracts & live margin telemetry.
- `GET /api/reports/stock-ledger`: Physical movement logs.
- `GET /api/reports/general-ledger`: Financial transactions.

