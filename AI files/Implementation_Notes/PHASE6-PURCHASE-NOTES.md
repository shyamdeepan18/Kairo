# Phase 6 — Purchase Module: Activity Notes

_Date: 2026-07-01 · Status: schema done, services/routes pending · To discuss later_

## What was done this session

- Created `packages/db/src/schema/purchase.ts` — the complete Drizzle schema for the
  **PR → PO → GRN → Invoice → Payment** flow.
- Wired it into `packages/db/src/schema/index.ts` (`export * from './purchase.js'`).

### Tables added (11)

| Table | Role |
|---|---|
| `suppliers` | Vendor master (GSTIN/PAN, state code, terms, credit limit, TDS, bank details) |
| `purchaseRequisitions` / `…Lines` | PR — internal request, no supplier/GL, tracks `orderedQty` |
| `purchaseOrders` / `…Lines` | PO — supplier commitment, `receiptStatus`/`billingStatus`, running `receivedQty`/`billedQty` |
| `goodsReceiptNotes` / `…Lines` | GRN — received/accepted/rejected qty, QC, batch capture, `valuationRatePaise`, `journalEntryId` |
| `purchaseInvoices` / `…Lines` | Supplier bill — supplier inv no/date, ITC eligibility, reverse charge, `paymentStatus` |
| `purchasePayments` / `purchasePaymentAllocations` | Payment settling many invoices; unallocated = advance |

- Shared `documentHeader()` factory gives every header the standard document columns
  (status, fiscal year, paise amount trio, full workflow stamps, `custom_data`).
- Line tables carry traceability FKs: `requisitionLineId` → `poLineId` → `grnLineId`
  (drill-down + 3-way match).

### Verified (static — `tsc` not run; registry blocked, no deps installed)

- No duplicate table/type/enum names across schema files.
- All FK targets exist (`items`, `itemBatches`, `taxCodes`, `journalEntries`, company tables).
- All 5 purchase document types already have transitions registered in the StatusEngine.

## Verified about existing pieces

- **Posting templates — already exist ✅.** `BUILT_IN_TEMPLATES` in
  `apps/api/src/services/posting-templates.ts` registers:
  - `purchase.grn` → `purchaseGrnTemplate` (DR Inventory + Input GST / CR GR-IR clearing)
  - `purchase.invoice` → `purchaseInvoiceTemplate` (DR GR-IR clearing / CR Accounts Payable)
  - `purchase.payment` → `purchasePaymentTemplate` (DR Accounts Payable / CR Bank/Cash)
  - Routes only need to build the posting `ctx` and call `postingEngine.post()`.

## Open items / gaps to discuss

1. **Number-series seeding — NOT done ⚠️.**
   - `NumberSeriesService.ensureSeries()` exists but is never called; no number-series seed file.
   - `next(tx, companyId, 'purchase.po', …)` will **throw** until a `document_number_series`
     row exists for each purchase type.
   - Needs: `seedPurchaseNumberSeries(companyId)` calling `ensureSeries` for
     `purchase.requisition` / `po` / `grn` / `invoice` / `payment` (prefixes e.g. PR, PO, GRN, PINV, PPAY),
     wired into company onboarding (or a seed script).

2. **No migration generated.** Schema is TypeScript-only across the whole project
   (`packages/db/src/migrations/` is empty). Run `pnpm db:generate` then `pnpm db:migrate`
   on a machine where deps install. The documented `db:migrate` step currently does nothing.

3. **Money type deviation.** Purchase monetary columns use `bigint` paise (avoids the
   ~₹2.14 Cr integer-paise ceiling). Accounting/tax/inventory still use `integer` paise.
   Values flow as JS numbers so engine math is unaffected, but DB column types differ —
   consider aligning older tables later.

## Not yet built (next steps)

- [ ] Number-series seeding helper (blocker for creating any purchase document).
- [ ] Purchase services (PR/PO/GRN/Invoice/Payment create + submit/approve + partial-fulfilment updates).
- [ ] Purchase REST routes (`/api/purchase/*`) using `authorize()` with the existing `purchase.*` permissions.
- [ ] Wire `purchaseRoutes` into `apps/api/src/index.ts` (currently commented out).
- [ ] GRN must also post stock via the Inventory engine (Phase 5, built by a parallel session) in the same tx as the GL post.

## Context note

A separate session built the Phase 5 Inventory module in this same folder (~19:17–19:23 on
2026-06-30): `schema/inventory.ts`, `valuation-engine.ts`, `stock-ledger.ts`, `uom-service.ts`,
plus edits to `index.ts`, `fastify.d.ts`, `posting-templates.ts`, `accounting.ts`. The Purchase
schema above references that work (`items`, `itemBatches`). Coordinate before editing shared
files (`index.ts`, `fastify.d.ts`, `posting-templates.ts`).
