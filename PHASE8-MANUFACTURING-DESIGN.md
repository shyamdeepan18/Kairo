# Phase 8 — Manufacturing Module: Design

_Date: 2026-07-01 · Status: design only (no code yet) · Target: hybrid discrete + process_

## The problem

Discrete (BOM / work orders) and process (recipe / batch) manufacturing look like two
different worlds. The temptation is two table trees and two engines. That bifurcation is
what we want to avoid.

## Core principle: model OUTPUTS as a line table

A discrete BOM has one parent output; a process recipe has many (primary + co-products +
by-products). If **every production definition has an inputs table AND an outputs table**,
then a discrete BOM is simply a formula whose output table has exactly one row. One shape,
not two. This single decision removes most of the pressure to fork.

`manufacturingType ∈ {discrete, process}` is a **discriminator that selects behavior**, not
a discriminator that selects tables.

| Concern | Discrete | Process | Unified handling |
|---|---|---|---|
| Outputs | 1 parent | primary + co/by-products | rows in `formula_outputs`; discrete = 1 row |
| Quantities | often integral | fractional (kg/L/m) | `numeric(18,4)` everywhere |
| Routing | central | coarse/none | optional `formula_operations`; 0 rows valid |
| Tracking | serial common | batch/potency | reuse inventory `itemBatches`/`itemSerials` + `properties` JSONB |
| Yield | usage variance | yield variance | same expected vs produced columns; close-time calc |
| Type-specific fields | revision, drawing | concentration, target yield % | L2 `custom_data` (Document Engine), not new columns |

## Schema (one tree, discriminated)

```
production_formulas        header: company, code, version, manufacturingType,
                                   batchSize + baseUom, status, effective dates
  ├─ formula_inputs        item, qtyPerBatch, uom, scrapPercent, isOptional, substituteGroup
  ├─ formula_outputs       item, qtyPerBatch, uom, outputType(primary|co_product|by_product),
                                   costAllocationBasis(% | by_weight | by_value | nrv)
  └─ formula_operations    (optional) seq, workCenterId, setupMins, runMinsPerUnit, overheadRatePaise

work_centers               master: code, capacity, labour + overhead rate/hr

production_orders          header: docType 'manufacturing.order', formulaId, manufacturingType,
                                   plannedQty / batchSize, scaleFactor, targetWarehouse, dates, status
  ├─ production_order_materials   exploded inputs: item, requiredQty, issuedQty, warehouse, batchId
  ├─ production_order_outputs     expected + actual: item, outputType, expectedQty, producedQty,
                                        batchId, costAllocatedPaise
  ├─ production_order_operations  per-order ops: status, actual setup/run mins, workCenterId
  └─ production_order_costs       WIP accumulation: materialPaise, labourPaise, overheadPaise, variancePaise
```

A production order is an instance of a formula scaled by `scaleFactor = plannedQty / batchSize`.
Explosion multiplies every input/output/operation line by that factor. Process yields multiple
output rows; discrete yields one — same code path. Money in **paise (bigint)**, quantities
`numeric(18,4)`, consistent with the purchase/sales modules.

## How the codebase stays single

One `ProductionEngine` owns the lifecycle — **plan → release → issue → record output → close**
— identical for both types. Only three small **strategy functions** are selected by
`manufacturingType`:

1. `explodeFormula(formula, scaleFactor)` — output count differs, logic is shared.
2. `allocateCost(wipTotal, outputs)` — discrete relieves all WIP to its single output;
   process splits WIP across co-products by `costAllocationBasis` and books by-products at NRV.
   This is the one genuinely divergent step (~30 lines behind an interface).
3. `computeVariance(order)` — discrete → material-usage + operation variance; process → yield
   variance. Same return shape (variance lines), different formula.

Everything else is shared infrastructure that already exists:

- **Document Engine** — `manufacturing.order` status transitions already registered; numbering,
  audit, L1/L2 custom fields work unchanged.
- **Inventory** — movement types already defined: `issue_to_production` (OUT),
  `production_receipt` / `by_product_receipt` (IN), `subcon_issue`/`subcon_receipt`;
  `stockLedgerEntries.productionOrderId` already links movements to the order. Co-products are
  just extra receipt lines.
- **Posting** — `manufacturing.issue` (DR WIP / CR RM inventory) and `manufacturing.receipt`
  (DR FG inventory / CR WIP) templates already exist. **WIP is the convergence account**: both
  types flow RM → WIP → FG; "discrete vs process" only changes how WIP is *split* on output.
- **Permissions** — `manufacturing.bom.*`, `manufacturing.order.*`, `manufacturing.mrp.run` seeded.

## Gaps to close when building Phase 8

- No manufacturing schema files yet (greenfield) — but it plugs into the scaffolding above.
- Permission naming says `manufacturing.bom.*` while the unified table is `production_formulas`
  — keep "BOM" as the user-facing alias, or rename the permission (minor).
- Costing depth (operation/overhead absorption, variance accounts) needs COA categories that
  may not be seeded yet (`wip`, `cogs` variants, variance accounts).
- Subcontracting (job-work) movement types exist in inventory but have no posting template.
- A `sales.delivery`-style runtime registration may be needed if new posting templates are added
  without editing the shared `posting-templates.ts`.

## Suggested build order (when greenlit)

1. `schema/manufacturing.ts` (formulas + inputs/outputs/operations, work_centers, orders + children) — mirror purchase/sales conventions.
2. `ProductionEngine` service + the 3 strategy functions; register any new posting templates in a `plugins/manufacturing.ts`.
3. Routes `/api/manufacturing/*` (formulas/BOMs, work orders: plan/release/issue/receive/close) using `manufacturing.*` permissions.
4. Seed `manufacturing.order` number series; add WIP/variance COA categories.
