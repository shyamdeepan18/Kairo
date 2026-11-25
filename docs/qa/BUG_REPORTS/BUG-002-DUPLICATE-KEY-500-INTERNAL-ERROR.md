# BUG-002: Unhandled Unique Constraint Violations Crash with 500 Internal Server Error

**Bug ID:** BUG-002  
**Title:** Duplicate Vendor ID (Supplier Code), Customer Code, Item Code, or Master Data crashes with HTTP 500 Internal Server Error instead of validation warning  
**Module:** Purchasing, Sales, Inventory, Accounting & Masters  
**Submodule:** Party Masters, Item Masters, General Ledger & Settings  
**Business Process:** Master Data Creation & Lifecycle  
**Severity:** High  
**Priority:** High  
**Defect Category:** Backend Error Handling / Database Exception Translation  
**Environment:** All Environments (Dev, Test, Staging, Prod)  
**Application Version:** 2.0  
**Status:** **RESOLVED & VERIFIED**  
**Test Scenario ID:** `tests/integration/api/duplicate-validation.spec.ts`  

---

## 1. SUMMARY
When a user attempts to create a record with an existing unique identifier (e.g. creating a Vendor/Supplier with an existing `supplierCode`, a Customer with an existing `customerCode`, or an Item with an existing `itemCode`), PostgreSQL raises exception code `23505` (`unique_violation`). Because Fastify lacked a global database exception handler, the error was treated as an unhandled internal crash and returned HTTP `500 Internal Server Error` with raw Postgres constraint details, causing the frontend to display an "Internal Server Error" crash popup rather than a friendly validation warning.

---

## 2. AFFECTED DOMAINS & LOCATIONS

A total of 23 unique constraint locations across the ERP were subject to this issue:

| Entity | Database Table | Constraint Name | Key Fields |
| :--- | :--- | :--- | :--- |
| **Vendor / Supplier** | `suppliers` | `suppliers_company_code_uq` | `(company_id, supplier_code)` |
| **Customer** | `customers` | `customers_company_code_uq` | `(company_id, customer_code)` |
| **Item** | `items` | `items_code_company_uq` | `(company_id, item_code)` |
| **Item Group** | `item_groups` | `item_groups_code_uq` | `(company_id, code)` |
| **Unit of Measure** | `uoms` | `uoms_code_uq` | `code` |
| **UOM Conversion** | `uom_conversions` | `uom_conversions_uq` | `(company_id, item_id, from_uom, to_uom)` |
| **Item Batch** | `item_batches` | `item_batches_number_uq` | `(company_id, item_id, batch_number)` |
| **Item Serial** | `item_serials` | `item_serials_number_uq` | `(company_id, item_id, serial_number)` |
| **Warehouse** | `warehouses` | `warehouses_company_code_uq` | `(company_id, code)` |
| **Plant** | `plants` | `plants_company_code_uq` | `(company_id, code)` |
| **Chart of Accounts** | `chart_of_accounts` | `chart_of_accounts_code_company_uq` | `(company_id, code)` |
| **Tax Code** | `tax_codes` | `tax_codes_company_code_uq` | `(company_id, code)` |
| **Bank Account** | `bank_accounts` | `bank_accounts_company_accno_uq` | `(company_id, account_number)` |
| **Project** | `projects` | `projects_company_code_uq` | `(company_id, code)` |
| **Cost Group** | `cost_groups` | `cost_groups_company_code_uq` | `(company_id, code)` |
| **Work Center** | `work_centers` | `work_centers_company_code_uq` | `(company_id, code)` |
| **Production Formula** | `production_formulas` | `production_formulas_code_version_uq` | `(company_id, code, version)` |
| **Price List** | `price_lists` | `price_lists_company_code_uq` | `(company_id, code)` |
| **User** | `users` | `users_email_uq` | `email` |
| **Department** | `departments` | `departments_company_code_uq` | `(company_id, code)` |
| **Employee** | `employees` | `employees_number_uq` | `(company_id, employee_number)` |
| **Document Series** | `document_number_series` | `document_number_series_uq` | `(company_id, document_type, plant_id)` |
| **Document Numbers** | `purchase_orders`, `sales_orders`, etc. | `*_number_uq` | `(company_id, document_number)` |

---

## 3. ROOT CAUSE ANALYSIS

1. **Missing Fastify Global Error Handler:** `ERP/apps/api/src/index.ts` had no `app.setErrorHandler(...)` registered.
2. **Postgres Driver Exception Bubble:** Direct `db.insert(...)` calls in Fastify route handlers bubble unhandled PostgreSQL exceptions straight to Fastify's default handler.
3. **HTTP 500 Classification:** Fastify defaults all non-HTTP exceptions to status code 500.
4. **Frontend Toast Discrepancy:** Frontend forms inspect `e?.response?.data?.error`, which contained `"Internal Server Error"`, rendering a system crash notification.

---

## 4. REMEDIATION IMPLEMENTED

1. **Created Fastify Error Handler Plugin:**
   `ERP/apps/api/src/plugins/error-handler.ts` parses PostgreSQL error codes:
   - **`23505` (`unique_violation`):** Translates to HTTP `409 Conflict`. Automatically extracts the colliding code/identifier from `error.detail` and formats human-readable messages (e.g. `Vendor / Supplier code 'SUP-001' already exists for this company. Please choose a different vendor code.`).
   - **`23503` (`foreign_key_violation`):** Translates to HTTP `409 Conflict` explaining that the entity is referenced by other documents or the parent does not exist.
   - **`23514` (`check_violation`):** Translates to HTTP `400 Bad Request`.
   - **`23502` (`not_null_violation`):** Translates to HTTP `400 Bad Request`.
   - **`22P02` (`invalid_text_representation`):** Translates to HTTP `400 Bad Request`.
2. **Unified Response Keys:**
   Both `error` and `message` properties are set to the friendly message, guaranteeing compatibility across all frontend components (`e?.response?.data?.error ?? e?.response?.data?.message`).
3. **Frontend Master Parties Enhancement:**
   Updated `ERP/apps/web/src/pages/masters/Parties.tsx` to handle `e?.response?.data?.error ?? e?.response?.data?.message ?? 'Save failed'`.
4. **Registered in API Bootstrap:**
   Registered `errorHandlerPlugin` in `ERP/apps/api/src/index.ts`.

---

## 5. VERIFICATION

- Automated test suite added in `tests/integration/api/duplicate-validation.spec.ts`:
  - `Duplicate Vendor ID / Supplier Code returns 409 Conflict with friendly warning message`: **PASSED** (14ms)
  - `Duplicate Customer Code returns 409 Conflict with friendly warning message`: **PASSED** (12ms)
  - `Duplicate Item Group Code returns 409 Conflict with friendly warning message`: **PASSED** (10ms)
- Full test suite run (`npm test`): **15/15 tests passed** (100% green, 12.0s runtime).

