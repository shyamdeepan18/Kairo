# ERP — Do-Later Backlog

_Paused 2026-07-01 to focus on the permission / settings design. Items below are
deferred coding work, grouped by area. Cross-references: PHASE6/7/8 + IMPLEMENTATION notes._

## Cross-cutting (affects all transactional modules)

- [ ] **Generate + commit Drizzle migrations** (`pnpm db:generate`) so the DB is creatable via
      `db:migrate`; then switch deploy back to `DB_BOOTSTRAP=migrate`.
- [ ] **Commit `pnpm-lock.yaml`** and restore `--frozen-lockfile` in both Dockerfiles (reproducible builds).
- [x] **Per-company onboarding bootstrap** — `POST /api/companies/:id/bootstrap` endpoint implemented for COA + number-series seeding.
- [ ] **Promote `documentHeader()` factory** to a shared helper (currently duplicated in
      purchase.ts / sales.ts / manufacturing.ts schemas, and route helpers duplicated across route files).
- [ ] **Tax engine integration** — replace client-provided per-line tax with `TaxEngine.compute()`
      (derive CGST/SGST/IGST from tax codes + place of supply) across Purchase and Sales.

## Purchase (Phase 6)

- [x] Enforce monetary approval limits on PO approve (`PermissionService.withinApprovalLimit()` enforced).
- [x] GRN GL: post precise CGST/SGST/IGST split instead of a single aggregate tax line.

## Sales (Phase 7)

- [x] Generate outbound e-invoice IRN on invoice approve (`IrpClient` + `TaxEngine` IRN payload generation).
- [x] Create stock reservations on SO approval (`reservedQty` / `stock_reservations` write).
- [x] Credit-limit check gate on SO/Delivery approval (`creditLimitPaise` / `creditHold` checks enforced).

## Manufacturing (Phase 8)

- [x] Absorb labour + overhead into WIP from `production_order_operations` (work-center rates).
- [x] GL-post standard-cost variance at close (`production_variance` account).
- [ ] Dedicated semi-finished inventory category (receipts currently → `inventory_finished`).
- [ ] Subcontracting (job-work) posting template (movement types already exist in inventory).

## Deployment (Phase 9)

- [ ] Optional TLS/HTTPS in nginx (or Caddy auto-certs) for internet-reachable installs.
- [ ] Per-service resource limits sized to customer hardware.
- [ ] Documented restore drill (`pg_restore -F c` from `./backups/*.dump`).

## Frontend (Completed)

- [x] All module screens (suppliers/customers/items masters; PR/PO/GRN/PInv/Payment;
      Quotation/SO/Delivery/SInv/Receipt; formulas/work-orders) + dashboards/reports, Journal Vouchers,
      Trial Balance, GST Reports, Print Engine, 3-Way Match Verification.

## Permissions / settings (Completed)

- [x] Enforce `user_warehouse_access` (`hasWarehouseAccess()` in PermissionService).
- [ ] Add settings permission codes for number series / tax codes / document config / account config.
- [x] Segregation of duties (maker ≠ checker) on document approvals.
- [ ] (Further proposals captured in the permission-model visualization.)
