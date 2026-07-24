# Phase 6 (Purchase) + Phase 7 (Sales) — Implementation Notes

_Date: 2026-07-01 · Status: services + routes implemented, wired into the API_

These two modules were implemented end-to-end on top of the existing engines
(DocumentConfig, NumberSeries, StatusEngine, AuditEngine, PostingEngine,
StockLedger). They are intentionally symmetric — same helpers, same patterns.

## Files

| File | Purpose |
|---|---|
| `apps/api/src/routes/purchase.ts` | All `/api/purchase` endpoints |
| `apps/api/src/routes/sales.ts` | All `/api/sales` endpoints |
| `apps/api/src/plugins/sales.ts` | Registers `sales.delivery` COGS template + `sales.payment` status transitions |
| `apps/api/src/middleware/company-context.ts` | `resolveCompany` preHandler (companyId from body/query/`x-company-id`) |
| `packages/shared/src/validators/purchase.ts` | zod request schemas (purchase) |
| `packages/shared/src/validators/sales.ts` | zod request schemas (sales) |
| `packages/db/src/seeds/number-series.ts` | `seedPurchaseNumberSeries` / `seedSalesNumberSeries` (+ accounting.jv) |
| `packages/db/src/seeds/permissions.ts` | expanded sales perms (full view/submit/approve/cancel + `sales.receipt.*`) |
| `apps/api/src/index.ts` | registers sales plugin + purchase/sales routes |

## Endpoints (lifecycle + posting)

**Purchase** — `PR → PO → GRN → Invoice → Payment`
- Suppliers CRUD; PR/PO create+list+get+submit/approve/(reject|cancel).
- **GRN approve** → stock IN (`purchase_receipt`) + GL (`purchase.grn`: DR Inventory + Input GST / CR GR-IR), updates PO `receivedQty`/`receiptStatus`.
- **Invoice approve** → GL (`purchase.invoice`: DR GR-IR / CR AP), updates PO billing status.
- **Payment approve** → GL (`purchase.payment`: DR AP / CR Bank) + allocations bump invoice `paidAmountPaise`/`paymentStatus`.

**Sales** — `Quotation → SO → Delivery → Invoice → Receipt`
- Customers (+ addresses) CRUD; Quotation/SO create+list+get+lifecycle.
- **Delivery approve** → stock OUT (`sales_delivery`) at WAC + **COGS GL** (`sales.delivery`: DR COGS / CR Inventory); COGS read from the stock ledger's WAC snapshot and written back to delivery lines; updates SO `deliveredQty`/status.
- **Invoice approve** → GL (`sales.invoice`: DR AR / CR Revenue + Output GST), updates SO/delivery billing status.
- **Receipt approve** → GL (`sales.payment`: DR Bank / CR AR) + allocations bump invoice `receivedAmountPaise`/`paymentStatus`.

## Verified

- All new files pass Node type-strip syntax checks (`node --experimental-strip-types --check`).
- Every permission code referenced by routes exists in the seed.
- All purchase/sales tables exported; all referenced doc types have StatusEngine transitions
  (`sales.payment` registered at runtime in the sales plugin).
- NOT verified by a full `tsc` — the package registry is blocked in this environment and
  `node_modules` is not installed, so no type-level check or runtime test was possible.

## Known simplifications / follow-ups

1. **Tax is client-provided per line** (CGST/SGST/IGST amounts), summed into headers and
   posting `taxLines`. Wiring `TaxEngine.compute()` to derive tax from tax codes is the shared next step.
2. **Sales e-invoice IRN not generated** — invoice approve only sets `einvoiceStatus`; the
   `IrpClient` / `TaxEngine.buildEInvoicePayload` call is a follow-up.
3. **SO does not create stock reservations** yet (columns exist; reservation write pending).
4. **Purchase GRN GL** posts aggregate tax as a single line (precise CGST/SGST/IGST split comes with tax-engine integration).
5. **PO approve doesn't enforce the monetary approval limit** (the `authorize` amount option exists; not yet passed).
6. **No DB migration** — TS-only project-wide. Run `pnpm db:generate && pnpm db:migrate`.
7. **`documentHeader()` factory duplicated** in `purchase.ts`/`sales.ts` schemas and route helpers
   duplicated in both route files — promote to shared helpers in a cleanup pass.

## Run order (per company, before creating documents)

```bash
pnpm db:generate && pnpm db:migrate            # create tables (once)
npx tsx packages/db/src/seeds/permissions.ts   # permissions + system roles
# per company at onboarding:
#   seedCoaForCompany(companyId, userId)        # COA + account map (Phase 3)
npx tsx packages/db/src/seeds/number-series.ts <companyId>   # PR/PO/GRN/PINV/PPAY + sales + JV
```
