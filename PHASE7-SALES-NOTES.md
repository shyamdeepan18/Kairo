# Phase 7 — Sales Module: Activity Notes

_Date: 2026-07-01 · Status: schema done, services/routes pending · To discuss later_

## What was done this session

- Created `packages/db/src/schema/sales.ts` — full Drizzle schema for the
  **Quotation → Sales Order → Delivery → Invoice → Receipt** flow.
- Wired into `packages/db/src/schema/index.ts` (`export * from './sales.js'`).
- Built to MIRROR `purchase.ts` exactly — same `documentHeader()` / `money()` / `qty()`
  helpers, same `bigint` paise, same line-level traceability and naming style.

### Tables added (12)

| Table | Role |
|---|---|
| `customers` | Customer master (GSTIN/PAN, credit limit + hold, TCS, terms, bank) |
| `customer_addresses` | Multiple bill-to / ship-to addresses; ship-to state = place of supply |
| `salesQuotations` / `…Lines` | Price offer; priced lines; tracks `orderedQty` |
| `salesOrders` / `…Lines` | Confirmed order; `deliveryStatus`/`billingStatus`; `reservedQty` |
| `deliveryNotes` / `…Lines` | Dispatch; stock OUT + **COGS** (`cogsRatePaise`/`cogsAmountPaise`); e-way-bill fields |
| `salesInvoices` / `…Lines` | Tax invoice; revenue/AR; outbound e-invoice status; export/SEZ |
| `salesReceipts` / `salesReceiptAllocations` | Customer receipt settling many invoices; advance = unallocated |

### Verified (static — `tsc` not run; registry blocked, no deps)

- No duplicate table/type/enum names across schema files.
- All FK targets exist (`items`, `itemBatches`, `taxCodes`, `journalEntries`, company tables).

## Key differences from Purchase (now encoded in schema)

- Party = **customer** with separate bill-to/ship-to (ship-to drives GST place of supply).
- **Output GST + AR + Revenue** (vs Input GST / AP).
- **Dual posting**: Delivery posts COGS (DR COGS / CR Inventory at WAC); Invoice posts Revenue.
- **Outbound e-invoice**: invoice GENERATES the IRN (Phase 4 `e_invoice_records`); only status mirrored on the invoice. Purchase only stored a supplier IRN.
- SO **reserves** stock (`salesOrderLines.reservedQty` → inventory `stockReservations`); PO incremented `quantityOrdered`.
- **Credit control** (`creditLimitPaise`, `creditHold`) gates SO/Delivery approval; TCS instead of TDS.

## Open items / gaps to discuss

1. **Receipt lifecycle not fully scaffolded ⚠️.**
   - `salesReceipts.documentType = 'sales.payment'` so the EXISTING `salesPaymentTemplate`
     posts without re-registration.
   - But StatusEngine has **no `sales.payment` transitions** and **no sales-receipt permission**
     is seeded (sales permissions stop at quotation/so/delivery/invoice/reports).

2. **No `sales.delivery` posting template ⚠️.** The Delivery schema carries COGS fields, but
   only `sales.invoice` and `sales.payment` templates are registered. A COGS template
   (DR COGS / CR Inventory) must be added and registered as `sales.delivery`.

3. **Number-series seeding** — same blocker as Purchase. Seed prefixes (QT, SO, DC, SINV, RCPT)
   per company via `ensureSeries`.

4. **No migration generated** — schema is TS-only project-wide; run `pnpm db:generate` + `db:migrate`.

5. **Money type deviation** — sales uses `bigint` paise (consistent with purchase); accounting/tax/
   inventory still use `integer` paise.

## Not yet built (next steps)

- [ ] `sales.delivery` COGS posting template + register it.
- [ ] StatusEngine transitions + permission for the sales receipt lifecycle.
- [ ] Number-series seeding helper (shared with Purchase).
- [ ] Sales services (quotation/SO/delivery/invoice/receipt; reservations; credit check; e-invoice call).
- [ ] Sales REST routes (`/api/sales/*`) using existing `sales.*` permissions.
- [ ] Promote `documentHeader()` to a shared helper (currently duplicated in purchase.ts + sales.ts).

## Context note

The `documentHeader()` factory is intentionally duplicated in `purchase.ts` and `sales.ts` to keep
the modules symmetric for now; consolidating it into a shared helper (e.g. `schema/common.ts`)
is a recommended cleanup. A parallel session built the Phase 5 Inventory module in this folder —
coordinate before editing shared files (`index.ts`, `fastify.d.ts`, `posting-templates.ts`).
