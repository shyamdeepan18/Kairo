# Defect Summary & Bug Triage Log

## 1. Summary of Application Defects & Resolution Status

| Bug ID | Title | Module | Severity | Priority | Status | Root Cause & Resolution |
|---|---|---|---|---|---|---|
| **BUG-001** | Missing State Transitions for JWO, BOM, Sales Return & Credit Note | Manufacturing & Sales | Critical | High | **RESOLVED & VERIFIED** | Registered `'manufacturing.job_work_order'`, `'manufacturing.bom'`, `'sales.return'`, and `'sales.credit_note'` in `status-engine.ts`. Subcontracting suite verified 100% green. |
| **BUG-002** | Unhandled Database Unique Constraint 500 Crash | Purchasing, Sales, Masters | High | High | **RESOLVED & VERIFIED** | Created `apps/api/src/plugins/error-handler.ts` translating Postgres constraint codes (`23505`, `23503`, `23514`, `23502`, `22P02`) into friendly HTTP 409/400 validation messages across all 23 unique constraints. |
| **BUG-003** | System Admin Module Suppression & Stale License Cache on Bundle Switch | Admin & Governance | Medium | Medium | **RESOLVED & VERIFIED** | Added System Admin bypass to `requireModule` so platform owners are never locked out; added `licenseService.invalidate(id)` to blueprint apply and module toggle endpoints to purge Redis immediately. |
| **BUG-004** | Hardcoded UOM in Landed Cost Voucher Post (`PCS` vs Item Primary UOM) | Purchasing & Valuation | High | High | **RESOLVED & VERIFIED** | `POST /landed-cost-vouchers/:id/post` hardcoded `uom: 'PCS'` on inventory movement, throwing 500 `No conversion found: PCS -> NOS`. Fixed by looking up the item's actual `primaryUom`. |
| **BUG-005** | Drizzle Column Name Mismatch in LCV Resolution (`items.uom` vs `items.primaryUom`) | Purchasing | Medium | High | **RESOLVED & VERIFIED** | Querying non-existent `items.uom` threw 500 `Cannot convert undefined or null to object`. Fixed to query `items.primaryUom`. |

---

## 2. Defect Detail: BUG-001
- **Defect File:** [`docs/qa/BUG_REPORTS/BUG-001-JWO-TRANSITION-MISSING.md`](file:///Users/shyam18/SEGA/docs/qa/BUG_REPORTS/BUG-001-JWO-TRANSITION-MISSING.md)
- **Symptom:** Submitting a Job Work Order threw HTTP 409 Conflict: `Invalid transition for manufacturing.job_work_order: draft → submitted. Allowed: none (terminal state)`.
- **Root Cause:** Document type was omitted from `TRANSITIONS` in `status-engine.ts`.
- **Resolution:** Added full state machine lifecycle for `manufacturing.job_work_order`, `manufacturing.bom`, `sales.return`, and `sales.credit_note`.
- **Verification:** `tests/integration/api/subcontracting-api.spec.ts` passes end-to-end (Draft $\to$ Submit $\to$ Approve $\to$ Outward Challan $\to$ Inward Receipt $\to$ Cost roll-up $\to$ GL journal validation).

---

## 3. Defect Detail: BUG-002
- **Defect File:** [`docs/qa/BUG_REPORTS/BUG-002-DUPLICATE-KEY-500-INTERNAL-ERROR.md`](file:///Users/shyam18/SEGA/docs/qa/BUG_REPORTS/BUG-002-DUPLICATE-KEY-500-INTERNAL-ERROR.md)
- **Symptom:** Submitting a duplicate Vendor ID, Customer Code, or Item Code threw HTTP 500 Internal Server Error with raw Postgres constraint details.
- **Root Cause:** Absence of Fastify global database error handler.
- **Resolution:** Global Fastify plugin [error-handler.ts](file:///Users/shyam18/SEGA/ERP/apps/api/src/plugins/error-handler.ts) registered in [index.ts](file:///Users/shyam18/SEGA/ERP/apps/api/src/index.ts). Parses `error.detail` and returns clean HTTP 409 Conflict with human-readable warning messages.
- **Verification:** `tests/integration/api/duplicate-validation.spec.ts` verified for Vendors, Customers, and Item Groups.

---

## 4. Defect Detail: BUG-003
- **Symptom:** Applying an Industry Bundle suppressed the Admin user with 403 Forbidden on unbundled screens, and Redis cached disabled status for 10 minutes.
- **Root Cause:** `requireModule` middleware did not bypass for System Admins; `apply-blueprint` never called Redis cache invalidation.
- **Resolution:** Updated `requireModule` in `require-module.ts` to allow `isSystemAdmin` bypass; added `licenseService.invalidate(id)` in `admin.ts`.

---

## 5. Defect Detail: BUG-004
- **Symptom:** Approving and posting a Landed Cost Voucher (`POST /purchase/landed-cost-vouchers/:id/post`) failed with HTTP 500: `No conversion found: PCS → NOS for item <uuid>`.
- **Root Cause:** When posting the value-absorption stock ledger entry (`adjustment_in` with quantity 0 and valuation amount), `uom` was hardcoded to `'PCS'` instead of using the item's actual unit of measure.
- **Resolution:** Updated `purchase.ts` to look up each allocated item's actual `primaryUom` from the `items` table and pass it to `stockLedger.post()`.
- **Verification:** `tests/integration/api/extended-modules.spec.ts` passes Landed Cost Voucher lifecycle with verified valuation roll-up and balanced GL entries.

---

## 6. Defect Detail: BUG-005
- **Symptom:** Querying item details during Landed Cost Voucher posting threw HTTP 500: `Cannot convert undefined or null to object`.
- **Root Cause:** The select statement referenced `items.uom`, which was undefined in the Drizzle ORM schema (the schema column name is `items.primaryUom`).
- **Resolution:** Corrected the select query in `purchase.ts` to use `items.primaryUom`.
- **Verification:** Verified by live execution of `extended-modules.spec.ts`.
