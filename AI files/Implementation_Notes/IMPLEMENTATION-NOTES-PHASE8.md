# Phase 8 — Manufacturing: Implementation Notes

_Date: 2026-07-01 · Status: schema + services + routes implemented, wired into the API_

Unified discrete + process model (one schema, behaviour selected by
`manufacturingType`). See PHASE8-MANUFACTURING-DESIGN.md for the design rationale.

## Files

| File | Purpose |
|---|---|
| `packages/db/src/schema/manufacturing.ts` | work_centers; production_formulas + inputs/outputs/operations; production_orders + materials/outputs/operations/costs |
| `apps/api/src/services/production-costing.ts` | strategy functions: `scaleFactor`, `explodeInputQty`, `allocateProductionCost`, `perUnitRate`, `computeVariance` |
| `apps/api/src/plugins/manufacturing.ts` | registers `manufacturing.bom` StatusEngine transitions |
| `apps/api/src/routes/manufacturing.ts` | `/api/manufacturing` endpoints |
| `packages/shared/src/validators/manufacturing.ts` | zod schemas (work center, formula, order, issue, receive) |
| `packages/db/src/seeds/number-series.ts` | `seedManufacturingNumberSeries` (BOM/MO + accounting.jv) |
| `apps/api/src/index.ts`, `schema/index.ts`, `shared/index.ts` | wiring/exports |

## Endpoints

- **Work centers** — create, list.
- **Formulas (BOM/recipe)** — create (inputs+outputs+operations), list, get, submit/approve/reject
  (`manufacturing.bom`). Discrete formula validated to exactly one output; exactly one primary required.
- **Production orders** — create (explodes the formula by `scaleFactor = plannedQty / batchSize`
  into materials/outputs/operations + a costs row), list, get, submit/approve/cancel.
  - **`/orders/:id/issue`** → stock OUT `issue_to_production` at WAC + GL `manufacturing.issue`
    (DR WIP / CR RM/Stores); rolls issued value onto material lines and into `wipValuePaise` + costs.
  - **`/orders/:id/receive`** → `allocateProductionCost(wip, outputs, type)` → stock IN
    `production_receipt` / `by_product_receipt` at per-unit allocated cost + GL `manufacturing.receipt`
    (DR FG/Scrap / CR WIP) per output; relieves WIP; updates produced qty + valuation.
  - **`/orders/:id/close`** → records residual WIP as variance, stamps `actualEndDate`, status → closed.

## How discrete + process share the code

- One `production_formulas` tree; discrete = one output row, process = many. Same create/explode path.
- `allocateProductionCost` is the only real branch: discrete (or single output) → all WIP to the
  primary; process → by-products at NRV first, remainder split across primary + co-products.
- WIP is the convergence account for both: RM → WIP (issue) → FG (receive). Existing
  `manufacturing.issue` / `manufacturing.receipt` posting templates are reused unchanged.
- Reuses Document Engine (status/number/audit), Inventory (`issue_to_production`,
  `production_receipt`, `by_product_receipt`, `productionOrderId`), Posting, and the seeded
  `manufacturing.*` permissions.

## Verified

- All new files pass Node type-strip syntax checks.
- Every permission code used resolves in the seed; no duplicate table/type/enum names; index wired.
- NOT verified by `tsc` (registry blocked, `node_modules` absent) and not runtime-tested.

## Known simplifications / follow-ups

1. **Cost allocation is simplified at the route layer** — `receive` passes `basis='by_value'` with
   `marketRatePaise=0`, so co-products currently split by an equal share. Wiring the formula's
   `costAllocationBasis` + `marketRatePaise` into the allocation call is the follow-up (the strategy
   function already supports percent / by_weight / by_value / nrv).
2. **Labour + overhead not yet absorbed** — WIP = materials only; operation actual mins/labour/overhead
   aren't posted into WIP. `production_order_operations` exists for it.
3. **Standard-cost variance not GL-posted** — `computeVariance` returns qty variance; residual WIP at
   close is recorded as a variance figure but not posted to a variance account.
4. **Receipt inventory category** is simplified: by-product → `inventory_scrap`, everything else →
   `inventory_finished` (semi-finished also → finished).
5. **COA categories** `inventory_wip`, `inventory_finished`, `inventory_scrap`, `production_variance`,
   `stock_adjustment` must be mapped in the company account config or the posting `resolve()` throws.
6. **No migration** — run `pnpm db:generate && pnpm db:migrate`, then `seedManufacturingNumberSeries(companyId)`
   and re-run the permissions seed.
7. `documentHeader()` factory duplicated across schema modules (cleanup: promote to shared).

## Run order (per company)

```bash
pnpm db:generate && pnpm db:migrate
npx tsx packages/db/src/seeds/permissions.ts
# per company:
npx tsx packages/db/src/seeds/number-series.ts <companyId>   # purchase + sales + manufacturing + JV
# then: create + approve a formula → create production order → issue → receive → close
```

## Post-review fixes (2026-07-01)

- **Bug fix (schema):** `production_formulas` was missing `rejectedBy/rejectedAt` and
  `cancelledBy/cancelledAt`. The `manufacturing.bom` lifecycle transitions to rejected/cancelled and
  `StatusEngine.prepare()` stamps those columns, so a reject/cancel would have failed at runtime.
  Columns added.
- **Cost allocation wired (resolves follow-up #1):** `/orders/:id/receive` now reads each formula
  output's `costAllocationBasis` + `costAllocationPercent` + `marketRatePaise` and passes them to
  `allocateProductionCost`, so co-products/by-products split WIP per the formula config (percent /
  by_weight / by_value / nrv) instead of an equal share.
- **Added** `POST /formulas/:id/cancel` (approved → cancelled), now that the stamp columns exist.

Still open: labour/overhead absorption into WIP, GL-posting standard-cost variance, a dedicated
semi-finished inventory category, and migration generation.
