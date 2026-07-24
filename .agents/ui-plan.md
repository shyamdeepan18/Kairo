# ERP UI Implementation Plan

> Stack: React 18 · Vite · Ant Design 5 · Zustand · Axios · React Router v6  
> Target: Desktop + iPad (768px+) · Dark & Light mode · TypeScript

---

## Design tokens (Ant Design theme override)

```ts
// apps/web/src/theme.ts
export const token = {
  colorPrimary:   '#4F46E5',   // indigo
  colorSuccess:   '#15803D',   // debit green
  colorError:     '#B91C1C',   // credit red
  colorWarning:   '#B45309',
  colorInfo:      '#1D4ED8',
  borderRadius:   8,
  fontFamily:     'Inter, system-ui, sans-serif',
};
// Dark algorithm: theme.darkAlgorithm (Ant Design 5)
// Soft dark bg: #191C24 (not pitch black)
```

**Debit = green (#15803D / #4ADE80 dark)**  
**Credit = red (#B91C1C / #F87171 dark)**  
Apply via `<AmountDisplay type="debit" />` and `<AmountDisplay type="credit" />` shared component.

---

## Shared components (built in UI-0, extended throughout)

| Component | Purpose |
|---|---|
| `AppShell` | Sidebar + header + content layout. Collapsible sidebar for iPad. |
| `DocumentList` | Reusable table: search, status filter chips, column sort, pagination, row actions |
| `DocumentForm` | Header fields + line items table + right summary panel (totals, GST) |
| `LineItemsTable` | Editable grid with item picker, qty, UOM, price, tax code, amount |
| `StatusBadge` | Draft / Submitted / Approved / Rejected / Cancelled — colored pill |
| `StatusTimeline` | Vertical audit trail showing who did what at each stage |
| `ApprovalBar` | Sticky bottom bar: Approve / Reject / Request changes + remarks |
| `GstSummaryCard` | CGST / SGST / IGST / Cess breakdown, taxable amount, round-off |
| `AmountDisplay` | ₹ format (paise → rupees), green for debit, red for credit |
| `PrintButton` | Triggers print preview → PDF via template |
| `AuditDrawer` | Slide-in panel showing full audit log for a document |
| `BatchSerialPicker` | Popup to select / create batch or serial during stock movements |
| `ItemPicker` | Search-and-select with item code, name, UOM, current stock |
| `PartyPicker` | Search supplier / customer — shows GSTIN, balance |

---

## UI Phase 0 — App foundation

**Effort: 1 week | Screens: 4**

### Screens

| Route | Screen | Notes |
|---|---|---|
| `/login` | Login | Email + password, dark/light aware, company logo placeholder |
| `/` (redirect) | Company + plant selector | Post-login: pick company → pick plant → to dashboard |
| `/dashboard` | Dashboard | KPI cards, pending approvals, recent JEs, quick create |
| `*` | 404 / Error | Clean error page with navigation back |

### Key work
- Ant Design theme setup (token override + dark algorithm toggle)
- `AppShell` with responsive sidebar (collapsible on ≤1024px → drawer on iPad)
- Global Zustand stores: `useAuthStore`, `usePlantStore`, `useThemeStore`
- Axios client already built (Phase 0 backend) — wire to React Query
- Empty state + loading skeleton components
- React Router v6 setup with protected routes

---

## UI Phase 1 — Settings & configuration

**Effort: 2 weeks | Screens: 9**

### Screens

| Route | Screen | Notes |
|---|---|---|
| `/settings/company` | Company settings | Tabs: General · GST · Financial · Branding (logo upload) |
| `/settings/plants` | Plants list | CRUD, GSTIN per plant |
| `/settings/warehouses` | Warehouses list | Per plant, type badge (raw/finished/etc) |
| `/settings/users` | Users list | Invite, deactivate, role assignment |
| `/settings/roles` | Roles & permissions | Permissions matrix grid — module × action |
| `/settings/number-series` | Number series config | Per document type, per plant, fiscal year reset |
| `/settings/custom-fields` | Custom fields builder | L2 field builder — type picker, scope, required |
| `/settings/coa` | Chart of accounts | Tree view, add/edit leaf accounts, map PostingCategory |
| `/settings/tax-codes` | Tax codes & HSN | GST rate codes, HSN/SAC search, default mapping |

### Notes
- Company settings `Branding` tab stores logo + address → feeds all print templates
- Permissions matrix: rows = permission codes, columns = roles, toggle cells
- COA tree: expand/collapse groups, inline add child account

---

## UI Phase 2 — Master data

**Effort: 1-2 weeks | Screens: 8**

### Screens

| Route | Screen | Notes |
|---|---|---|
| `/masters/suppliers` | Suppliers list | Search, GSTIN, balance column |
| `/masters/suppliers/:id` | Supplier detail / edit | Tabs: General · Bank · Contacts · Transactions |
| `/masters/customers` | Customers list | Search, GSTIN, credit limit |
| `/masters/customers/:id` | Customer detail / edit | Same tab structure as supplier |
| `/masters/items` | Items list | Filter by type, group; stock column |
| `/masters/items/new` `/masters/items/:id` | Item create / edit | Tabs: General · Inventory · Costing · Tax · Custom fields |
| `/masters/item-groups` | Item groups | Tree view, drag-to-reorder |
| `/masters/uom` | Units of measure | List + custom conversion factors |

### Notes
- Item form tabs: General (code, name, type, group, HSN), Inventory (UOM, tracking type, reorder), Costing (std cost, valuation method), Tax (default tax code)
- Supplier/Customer form shares the same `<PartyForm>` component

---

## UI Phase 3 — Purchase module ⭐ first revenue milestone

**Effort: 3-4 weeks | Screens: 15**

### Flow
```
PR → PO → GRN → Purchase Invoice → Vendor Payment
```

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/purchase/requisitions` | PR list | Status filter, my PRs vs all, request date range |
| `/purchase/requisitions/new` | PR create | Dept, items, qty, reason, attachments |
| `/purchase/requisitions/:id` | PR detail | Approve / Reject, convert to PO button |
| `/purchase/orders` | PO list | Supplier filter, delivery date, amount range |
| `/purchase/orders/new` | PO create | From PR or fresh; supplier picker; line items; payment terms; GST summary |
| `/purchase/orders/:id` | PO detail | Approve flow, linked GRNs tab, linked invoices tab, print PO |
| `/purchase/grn` | GRN list | PO-wise filter, warehouse filter |
| `/purchase/grn/new` | GRN create | Auto-fill from PO; received qty vs ordered; batch/serial capture; quality notes |
| `/purchase/grn/:id` | GRN detail | Stock impact summary, GL posting preview |
| `/purchase/invoices` | Purchase invoice list | Supplier, due date, payment status |
| `/purchase/invoices/new` | Purchase invoice create | 3-way match: select PO + GRN → auto-fill; edit discrepancies; GST lines |
| `/purchase/invoices/:id` | Purchase invoice detail | Matched GRNs, GST breakdown, schedule payment |
| `/purchase/payments` | Vendor payment list | Supplier, bank, date filter |
| `/purchase/payments/new` | Vendor payment create | Outstanding invoices checklist → allocate payment; bank/cash mode |
| `/purchase/payments/:id` | Payment detail | Allocated invoices, GL entry preview |

### Patterns used
- `DocumentList` + `DocumentForm` + `LineItemsTable` + `GstSummaryCard`
- `StatusTimeline` on all detail pages
- `ApprovalBar` on PR and PO detail
- 3-way match UI: PO line ↔ GRN receipt ↔ Invoice line with variance highlight

---

## UI Phase 4 — Sales module

**Effort: 3-4 weeks | Screens: 15**

### Flow
```
Quotation → Sales Order → Delivery Note → Sales Invoice → Customer Receipt
```

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/sales/quotations` | Quotation list | Validity date, customer, convert to SO |
| `/sales/quotations/new` | Quotation create | Price list, discount, validity, terms |
| `/sales/quotations/:id` | Quotation detail | Send to customer (email placeholder), convert to SO |
| `/sales/orders` | SO list | Customer, delivery date, fulfillment % |
| `/sales/orders/new` | SO create | From quotation or fresh; credit limit check; delivery schedule |
| `/sales/orders/:id` | SO detail | Linked deliveries tab, linked invoices tab, stock reservation |
| `/sales/delivery` | Delivery list | SO-wise, warehouse, dispatch date |
| `/sales/delivery/new` | Delivery create | Auto-fill from SO; actual dispatched qty; batch/serial; vehicle/LR |
| `/sales/delivery/:id` | Delivery detail | Stock deduction summary, e-way bill placeholder |
| `/sales/invoices` | Sales invoice list | Customer, GST status (IRN badge), overdue highlight |
| `/sales/invoices/new` | Sales invoice create | From SO + Delivery; GST compute; e-Invoice toggle |
| `/sales/invoices/:id` | Sales invoice detail | IRN status, QR code display, cancel e-invoice, print |
| `/sales/receipts` | Customer receipt list | Customer, bank, date |
| `/sales/receipts/new` | Customer receipt create | Outstanding invoices checklist → allocate |
| `/sales/receipts/:id` | Receipt detail | Allocated invoices, GL entry |

### Patterns used
- Same `DocumentForm` / `DocumentList` as purchase
- `EInvoiceStatusBadge` — IRN, ACK number, QR code display
- Credit limit warning banner on SO create
- Stock availability indicator on SO line items

---

## UI Phase 5 — Inventory operations

**Effort: 2 weeks | Screens: 7**

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/inventory/stock` | Stock balance | Warehouse × item grid; filter by low stock / zero stock; drill to ledger |
| `/inventory/ledger` | Stock ledger | Movement history; filters: item, warehouse, date, movement type; DR/CR style colouring |
| `/inventory/adjustments` | Stock adjustment | Warehouse, item, system qty vs physical qty, variance, reason code |
| `/inventory/transfers` | Stock transfer | From warehouse → to warehouse, item list, batch/serial |
| `/inventory/physical-count` | Physical count | Upload counted qty sheet; view variance; post adjustment batch |
| `/inventory/batches` | Batch tracking | Search by batch number; history: received, issued, balance |
| `/inventory/serials` | Serial tracking | Search by serial; lifecycle: received → issued → delivered → scrapped |

### Notes
- Stock balance page is the "inventory dashboard" — shows reorder alerts
- Movement type colouring mirrors the GL: inward rows have green left border, outward red

---

## UI Phase 6 — Manufacturing module

**Effort: 3-4 weeks | Screens: 9**

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/manufacturing/bom` | BOM list | Item, version, status (draft/active) |
| `/manufacturing/bom/new` `/manufacturing/bom/:id` | BOM create / edit | Tree editor: FG → components + quantities; alternate items; scrap % |
| `/manufacturing/orders` | Production order list | BOM, status, planned vs actual qty |
| `/manufacturing/orders/new` | Production order create | Discrete: select BOM, qty, planned date, work centre |
| `/manufacturing/orders/:id` | Production order detail | Tabs: Issue materials · Record production · Receive FG · Cost summary |
| `/manufacturing/batches` | Process batch list | Recipe, batch size, status |
| `/manufacturing/batches/new` | Process batch create | Recipe-based; input qty (may vary from recipe); by-product config |
| `/manufacturing/batches/:id` | Process batch detail | Actual yield vs expected; by-product receipt; cost allocation |
| `/manufacturing/work-centres` | Work centres | Machines / work stations; capacity; cost rate |

### Notes
- Production order detail page is the main "shop floor" view — issue and receive in one place
- Discrete vs Process determined by item type (finished = discrete, process batch = process)
- BOM tree editor is the most complex component in this phase

---

## UI Phase 7 — Accounting & finance

**Effort: 2-3 weeks | Screens: 9**

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/accounting/jv` | Journal voucher list | Status, date, narration |
| `/accounting/jv/new` | JV create | Manual DR/CR lines; account picker; balance check; narration |
| `/accounting/trial-balance` | Trial balance | Period selector; opening + movement + closing; export Excel |
| `/accounting/profit-loss` | P&L report | Period vs comparison period; drilldown to GL |
| `/accounting/balance-sheet` | Balance sheet | As-at date; grouped assets / liabilities / equity |
| `/accounting/ledger` | GL ledger | Account + date filter; running balance; DR green / CR red |
| `/accounting/ap-aging` | AP aging | Supplier × 0-30 / 31-60 / 61-90 / 90+ buckets |
| `/accounting/ar-aging` | AR aging | Customer × same buckets; overdue highlight |
| `/accounting/gst-reports` | GST reports | Tabs: GSTR-1 summary · GSTR-3B summary · ITC reconciliation |

### Notes
- GL ledger is the accountant's daily tool — must be fast and filterable
- All financial reports: Export to Excel button (Phase 9 backend)
- GSTR reports: summary only in Phase 7; full filing integration is Phase 9

---

## UI Phase 8 — Reports & analytics

**Effort: 1-2 weeks | Screens: 6**

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/reports/purchase` | Purchase reports | Order status, supplier-wise, pending GRNs, payment due |
| `/reports/sales` | Sales reports | Customer-wise revenue, pending deliveries, collection efficiency |
| `/reports/inventory` | Inventory reports | Stock summary, valuation, slow/fast moving, reorder list |
| `/reports/manufacturing` | Manufacturing reports | Production vs plan, material consumption, yield |
| `/reports/finance` | Finance reports | Cash flow summary, fund flow, bank reconciliation placeholder |
| `/dashboard` (enhanced) | Dashboard v2 | Configurable KPI widgets, date range, plant selector |

---

## UI Phase 9 — Print templates & PWA

**Effort: 1 week | Screens: 4**

### Screens

| Route | Screen | Key features |
|---|---|---|
| `/settings/print-templates` | Print template config | Per document type; company logo/address fetched from company settings; placeholder fields |
| `/print/:docType/:id` | Print preview | Full-page printable view; header = company info; body = document; footer = T&Cs |
| *(PWA manifest)* | Install prompt | `manifest.json` + service worker for offline dashboard view |
| `/settings/integrations` | Integrations page | IRP mode toggle, email SMTP config (placeholder), Tally export (placeholder) |

### Print template fields (auto-filled from company settings)
```
{{company.legalName}}  {{company.gstin}}  {{company.pan}}
{{company.address}}    {{company.state}}  {{company.logo}}
{{plant.name}}         {{plant.gstin}}
```

---

## Route map summary

```
/login
/select-company

/dashboard

/settings/company          /settings/plants       /settings/warehouses
/settings/users            /settings/roles        /settings/number-series
/settings/custom-fields    /settings/coa          /settings/tax-codes
/settings/print-templates  /settings/integrations

/masters/suppliers/:id?    /masters/customers/:id?
/masters/items/:id?        /masters/item-groups   /masters/uom

/purchase/requisitions/:id?   /purchase/orders/:id?
/purchase/grn/:id?            /purchase/invoices/:id?   /purchase/payments/:id?

/sales/quotations/:id?    /sales/orders/:id?
/sales/delivery/:id?      /sales/invoices/:id?    /sales/receipts/:id?

/inventory/stock          /inventory/ledger       /inventory/adjustments
/inventory/transfers      /inventory/physical-count
/inventory/batches        /inventory/serials

/manufacturing/bom/:id?         /manufacturing/orders/:id?
/manufacturing/batches/:id?     /manufacturing/work-centres

/accounting/jv/:id?       /accounting/trial-balance  /accounting/profit-loss
/accounting/balance-sheet /accounting/ledger
/accounting/ap-aging      /accounting/ar-aging       /accounting/gst-reports

/reports/purchase   /reports/sales   /reports/inventory
/reports/manufacturing   /reports/finance

/print/:docType/:id
```

**Total: ~75 screens across 10 UI phases**

---

## Build order rule

> Never start a UI phase without its backend phase complete.  
> Each phase's list screen ships before its create/detail screens.

```
UI-0 (Foundation) → UI-1 (Settings) → UI-2 (Masters)
→ UI-3 (Purchase ⭐) ← first demo milestone
→ UI-4 (Sales) → UI-5 (Inventory Ops)
→ UI-6 (Manufacturing) → UI-7 (Accounting)
→ UI-8 (Reports) → UI-9 (Print + PWA)
```
