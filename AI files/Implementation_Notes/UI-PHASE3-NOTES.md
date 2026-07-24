# UI Phase 3 — Transaction screens (Purchase) · Notes

_Date: 2026-07-01 · Built in parallel with the foundation/settings/masters session (phase 2)._

Phase 3 = the transaction-document screens. This first slice is the **Purchase** module,
built to match the existing UI conventions (Ant Design, `usePlantStore`, shared `StatusBadge`
/ `AmountDisplay`, drawer-based create forms) and the routing the shell already expects.

## Files added (new only — no edits to App.tsx / AppShell.tsx)

- `apps/web/src/api/purchase.ts` — typed client for the whole purchase chain
  (suppliers, requisitions, orders, grns, invoices, payments) + `computeLine` + `apiErr`.
- `apps/web/src/pages/purchase/PurchaseOrders.tsx` — **flagship screen**: list + status filter,
  create drawer with a line-item editor (item → auto UOM/tax, qty/rate/disc, live CGST+SGST + totals),
  row actions (Submit / Approve / Cancel), and a read-only view drawer.
- `apps/web/src/pages/purchase/PurchaseRoutes.tsx` — `<PurchaseRoutes>` mapping the sidebar paths
  (`/purchase/orders` live; `/requisitions`, `/grn`, `/invoices`, `/payments` are staged placeholders).

## One-time wiring (2 lines in App.tsx — left for you to avoid clobbering the live phase-2 session)

`apps/web/src/App.tsx` already has the placeholder. To activate:

```tsx
import { PurchaseRoutes } from './pages/purchase/PurchaseRoutes';   // add with the other imports
...
// replace the commented line:
<Route path="/purchase/*" element={<PurchaseRoutes />} />
```

The sidebar nav (`/purchase/...`) is already defined in AppShell, so it lights up immediately.

## Important convention note

The masters API is **path-scoped** (`/masters/:companyId/...`), but the transaction backend
resolves the company from the request, so `api/purchase.ts` passes `companyId` as a **query param
on GETs and in the body on POSTs** (matches `resolveCompany` + `requireModule`). Keep this pattern
for the sales/manufacturing transaction clients too.

The PO screen reuses the phase-2 clients for reference data: `mastersApi.listItems` (item picker)
and `settingsApi.listTaxCodes` (tax dropdown). Suppliers come from the purchase module
(`/api/purchase/suppliers`).

## Verified / not

- `api/purchase.ts` passes Node type-strip syntax check.
- `.tsx` files can't be node-checked (JSX needs a build step) and there's no `tsc`/`vite` here
  (registry blocked) — they were written to the established patterns but not compiled or run.

## Next (same pattern)

- Purchase: Requisitions, GRN (create against a PO; on approve posts stock + GL), Invoices, Payments (with allocations).
- Then Sales (`/sales/*`) and Manufacturing (`/manufacturing/*`) transaction screens, each with its own
  `api/<module>.ts` + a `<ModuleRoutes>` slotting into the matching commented placeholder in App.tsx.
- Inventory views (stock balance, ledger) and dashboards/reports.
