# ERP Architecture Skill

Use this context whenever working on any part of this codebase.

---

## Project overview

A generic manufacturing ERP for Indian SMEs. Solo developer, Mac development, on-premise Windows deployment at customer sites. Target: hybrid discrete + process manufacturing.

---

## Tech stack (Stack C)

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 18 + Vite + Ant Design | Max AI productivity, enterprise UI components |
| Backend | Fastify 4 + TypeScript | 2-3x faster than Express, schema validation built-in |
| ORM | Drizzle ORM | SQL-first, handles complex ERP queries, type-safe |
| Database | PostgreSQL 16 | Free, JSONB for metadata engine, familiar from Supabase |
| Background jobs | BullMQ + Redis | Phase 5+: MRP runs, month-end, backup scheduler |
| Deployment | Docker Compose | Single `docker compose up` at customer site |
| Package manager | pnpm + Turborepo | Monorepo, workspace packages |

---

## Monorepo structure

```
erp/
├── apps/
│   ├── api/                  # Fastify API server
│   │   └── src/
│   │       ├── index.ts      # Server entry, plugin registration
│   │       ├── config.ts     # Env var validation + typed config
│   │       ├── plugins/
│   │       │   └── auth.ts   # JWT + cookie plugin + authenticate decorator
│   │       ├── routes/
│   │       │   └── auth.ts   # Login, logout, refresh, me
│   │       └── types/
│   │           └── fastify.d.ts  # FastifyJWT + FastifyInstance augmentation
│   └── web/                  # React SPA
│       └── src/
│           ├── api/
│           │   ├── client.ts # Axios instance with auto-refresh interceptor
│           │   └── auth.ts   # Auth API functions
│           ├── store/
│           │   └── auth.ts   # Zustand auth store
│           ├── components/
│           │   └── ProtectedRoute.tsx
│           ├── layouts/
│           │   └── AppLayout.tsx  # Sidebar + header shell
│           └── pages/
│               ├── Login.tsx
│               └── Dashboard.tsx
├── packages/
│   ├── db/                   # Drizzle schema + client
│   │   └── src/
│   │       ├── client.ts     # postgres-js pool + drizzle instance
│   │       └── schema/
│   │           ├── common.ts # baseColumns, makeAuditColumns helpers
│   │           ├── auth.ts   # users, sessions tables
│   │           └── index.ts  # re-exports all schema
│   └── shared/               # Types + Zod validators used by both api and web
│       └── src/
│           ├── types/auth.ts
│           └── validators/auth.ts
├── .agents/skills/           # AI skill context files (this file)
├── docker-compose.yml        # Production: PostgreSQL + Redis + API + Web (nginx)
├── docker-compose.dev.yml    # Dev: PostgreSQL + Redis only
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Auth system

**Pattern:** JWT access token (stateless, 15min) + httpOnly refresh token cookie (7 days, stored in DB).

### Token flow

```
Login:
  POST /api/auth/login { email, password }
  → verifies password with argon2
  → creates sessions row in DB (stores refresh token hash)
  → returns { accessToken, user } + sets refresh_token cookie (httpOnly, SameSite=strict)

API calls:
  Authorization: Bearer <accessToken>  (attached by axios interceptor in client.ts)

Token expiry:
  → axios interceptor catches 401
  → calls POST /api/auth/refresh with cookie
  → gets new accessToken, retries original request
  → if refresh fails: clears auth state, redirects to /login

Logout:
  POST /api/auth/logout
  → deletes session row from DB (immediate revocation)
  → clears cookie

Session restore (page refresh):
  App.tsx useEffect → initialize()
  → calls POST /api/auth/refresh
  → if cookie valid: sets user + accessToken in Zustand store
  → if not: stays on /login
```

### Key files

- `apps/api/src/plugins/auth.ts` — registers @fastify/jwt + @fastify/cookie, adds `app.authenticate` decorator
- `apps/api/src/routes/auth.ts` — all 4 auth endpoints
- `apps/web/src/store/auth.ts` — Zustand store (user, accessToken, initialize, login, logout)
- `apps/web/src/api/client.ts` — axios instance with request + response interceptors
- `apps/web/src/components/ProtectedRoute.tsx` — guards all authenticated routes

### Security decisions

- argon2id for password hashing (not bcrypt)
- Refresh token rotates on every use (prevents reuse after theft)
- Cookie path restricted to `/api/auth` (not sent on every API call)
- Constant-time login response (prevents email enumeration)
- `sessions` table: deleting a row = instant logout for that device

---

## Database patterns

### Base columns (packages/db/src/schema/common.ts)

Every table gets:
```typescript
const baseColumns = {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
```

Tables that need user attribution also spread `makeAuditColumns(users)`.

### Schema conventions

- All IDs are UUIDs (not auto-increment integers)
- All timestamps use `withTimezone: true`
- Indexes always added for FK columns and frequently queried fields
- Soft deletes via `isActive: boolean` or `deletedAt: timestamp` — never hard DELETE
- Money stored as `integer` (paise/cents) — never float

### Adding new tables (for future phases)

1. Create `packages/db/src/schema/<module>.ts`
2. Export from `packages/db/src/schema/index.ts`
3. Run `pnpm db:generate` to create migration
4. Run `pnpm db:migrate` to apply

---

## Engine architecture (Phases 2+)

This ERP is engine-based, not module-based. Business logic lives in engines that modules call.

| Engine | Phase | Purpose |
|---|---|---|
| Document Engine | 2 ✅ | Base for all transactional documents (PO, SO, Invoice, etc.) |
| Status Engine | 2 ✅ | Draft → Submitted → Approved → Cancelled lifecycle |
| Number Series | 2 ✅ | Configurable document numbering per company/year |
| Audit Engine | 2 ✅ | Immutable change log for all documents |
| Posting Engine | 3 | Any document → GL entries (double-entry enforced) |
| Tax Engine | 4 | GST computation, e-invoice, GSTR extraction |
| Print Engine | 4 | Template-based PDF generation |
| Inventory Engine | 5 | Movement-based stock ledger |
| Valuation Engine | 5 | Weighted average cost |
| License Engine | 1 | Key validation, module activation, user limits |

---

## API conventions

- All routes prefixed with `/api/<resource>`
- Zod validation on all request bodies
- Error shape: `{ error: string, issues?: ZodIssue[] }`
- HTTP status codes: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 500 Server Error
- Pagination: `{ data: T[], total: number, page: number, pageSize: number }`
- Soft deletes: never expose deleted records in list endpoints

---

## Dev workflow

```bash
# Start DB + Redis
docker compose -f docker-compose.dev.yml up -d

# Install deps
pnpm install

# Run migrations
cp .env.example .env  # fill in JWT_SECRET
pnpm db:migrate

# Start API + Web (hot reload)
pnpm dev

# Access
# Web: http://localhost:5173
# API: http://localhost:3000
# DB: localhost:5432 (erp/erp_dev/erp_db)
```

---

## Deployment (customer site)

```bash
# On customer Windows Server (Docker Desktop installed)
git clone <repo> erp && cd erp
cp .env.example .env  # set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d

# Access at http://<server-ip>
```

Upgrades: `git pull && docker compose build && docker compose up -d`

---

## Permission system (Phase 1)

### Three dimensions of every permission check

1. **WHAT** — permission code: `<module>.<document_type>.<action>` e.g. `purchase.po.approve`
2. **WHERE** — plant scope: roles can be global (all plants) or scoped to a specific plant
3. **HOW MUCH** — approval limit: per user, per document type, per plant (stored in paise)

### Key tables

| Table | Purpose |
|---|---|
| `permissions` | Master list of all permission codes (seeded, never user-edited) |
| `roles` | Named bundles of permissions. `company_id = null` = system role |
| `role_permissions` | Many-to-many: which permissions a role grants |
| `user_roles` | User → Role assignment. `plant_id = null` = applies to all plants |
| `user_permissions` | Direct overrides: grant or deny a specific permission. Deny wins over any role grant |
| `user_plant_access` | Which plants a user can see data from |
| `user_warehouse_access` | Which warehouses a user can issue/receive in |
| `user_approval_limits` | Max monetary approval per (user, doc_type, plant). Stored in paise. -1 = unlimited |

### Resolution algorithm

1. System admin (`users.is_system_admin`) → bypass all checks
2. Collect permissions from all `user_roles` for this (user, company, plant)
   - Roles with `plant_id = null` apply to all plants
   - Roles with specific `plant_id` apply only to that plant
3. Apply `user_permissions` overrides — `is_granted = false` (DENY) removes permission
4. Check `user_plant_access` if a plantId is in the request
5. Check `user_approval_limits` for approval actions with monetary amounts

Results cached in Redis for 5 min per (userId, companyId, plantId). Invalidate with `PermissionService.invalidateUser()`.

### Using authorize() on routes

```typescript
import { authorize } from '../middleware/authorize.js';

// Simple check
app.get('/purchase/pos', { preHandler: [app.authenticate, authorize('purchase.po.view')] }, handler)

// With plant scope
app.post('/purchase/pos', { preHandler: [app.authenticate, authorize('purchase.po.create', {
  plantFrom: 'body.plantId'
})] }, handler)

// With plant scope + approval limit
app.post('/purchase/pos/:id/approve', { preHandler: [app.authenticate, authorize('purchase.po.approve', {
  plantFrom: 'body.plantId',
  amountFrom: 'body.totalAmount',   // in paise
  docType: 'purchase.po',
})] }, handler)
```

### System roles (seeded)

Company Admin, Purchase Manager, Purchase User, Inventory Manager, Store Keeper, Accounts Manager, Accounts User, Sales Manager, Sales User, Manufacturing Manager, Report Viewer.

### Permission code naming convention

`<module>.<document_type>.<action>`

Modules: `auth`, `settings`, `purchase`, `inventory`, `accounting`, `sales`, `manufacturing`
Actions: `view`, `create`, `edit`, `submit`, `approve`, `reject`, `cancel`, `delete`, `manage`, `run`, `transfer`, `adjust`, `count`, `issue`, `close`, `financial`

### Money storage

All monetary amounts stored as **integers in paise** (1 INR = 100 paise). Never use float for money. Convert at the API boundary only.

---

## Document Engine (Phase 2)

### New schema tables (packages/db/src/schema/documents.ts)

| Table | Purpose |
|---|---|
| `document_type_config` | One row per (company, doc type). Stores L1 config + L2 custom field definitions. |
| `document_number_series` | One row per (company, doc type, plant, fiscal year). Atomic counter. |
| `document_audit_log` | Append-only log of every create, field change, and status transition. |

### L1 vs L2 metadata

**L1 config** (stored in `document_type_config.l1_config` JSONB):
- Controls behavior of *existing* schema columns: `visible`, `required`, `label`, `defaultValue`
- No data stored — purely behavioral overrides
- Structure: `{ fields: { fieldName: { visible, required, label } }, lineFields: { ... } }`

**L2 custom fields** (definitions in `document_type_config.l2_fields`, values in `custom_data JSONB` on each doc row):
- Adds entirely new fields the schema doesn't have
- Field types: text, textarea, number, integer, date, datetime, select, multiselect, checkbox, currency, link
- `scope: 'header'` → values in document row's `custom_data`; `scope: 'line'` → in lines row's `custom_data`
- Structure: `{ fields: [{ id, fieldName, label, fieldType, scope, required, options?, validations? }] }`

### Every document table must have these columns (defined per-module in Phase 6+)

```
id, company_id, plant_id, document_type, document_number, status,
fiscal_year, posting_date, party_type, party_id,
currency, total_amount_paise, tax_amount_paise, net_amount_paise,
submitted_by, submitted_at, approved_by, approved_at,
rejected_by, rejected_at, cancelled_by, cancelled_at, closed_by, closed_at,
custom_data JSONB,          ← L2 header field values
created_by, updated_by, created_at, updated_at
```

Lines table also has `custom_data JSONB` for L2 line-level fields.

### Engine services (apps/api/src/services/)

**DocumentConfigService** (`document-config.ts`):
- `getConfig(companyId, documentType)` → `ResolvedConfig` (cached in Redis 5 min)
- `validateCustomData(companyId, documentType, customData, scope)` → `ValidationResult`
- `invalidate(companyId, documentType)` — call after admin saves config changes
- System defaults in `SYSTEM_DEFAULTS` map; company overrides merged on top

**NumberSeriesService** (`number-series.ts`):
- `next(tx, companyId, documentType, opts)` → formatted string e.g. `'PO/2425/MUM/0001'`
- **MUST be called inside the same `db.transaction()` as the document INSERT**
- Uses `UPDATE … RETURNING` (atomic) — no gaps guaranteed, no duplicates possible
- `currentFiscalYear()` → e.g. `'2425'` for FY 2024–25 (April–March)
- `ensureSeries(...)` — idempotent seed helper

**StatusEngine** (`status-engine.ts`):
- Static class — use `StatusEngine.prepare(docType, fromStatus, toStatus, userId)` → `TransitionResult`
- `TransitionResult.stampFields` — merge into the document UPDATE payload
- `StatusEngine.canTransition()` / `assertCanTransition()` for guards
- Transitions defined per document type (see TRANSITIONS map in the file)
- Add new doc types via `StatusEngine.register(docType, transitionsMap)` at module init

**AuditEngine** (`audit-engine.ts`):
- `logCreate(ctx, document, opts?)` — call immediately after document INSERT
- `logUpdate(ctx, before, after, opts?)` — diffs and logs only changed fields
- `logTransition(ctx, fromStatus, result, remarks?, opts?)` — call after StatusEngine.prepare + status update
- Pass `{ tx }` in opts to run within the same DB transaction
- `diff(before, after)` — public method for custom diff needs

### How modules use these engines (Pattern, Phase 6+)

```typescript
// In a route handler (e.g. POST /api/purchase/pos)
const config = await app.docConfigService.getConfig(companyId, 'purchase.po');
const validation = await app.docConfigService.validateCustomData(companyId, 'purchase.po', body.customData, 'header');
if (!validation.ok) return reply.code(400).send({ error: 'Validation failed', issues: validation.errors });

const po = await db.transaction(async (tx) => {
  const docNumber = await app.numberSeriesService.next(tx, companyId, 'purchase.po', {
    plantId: body.plantId, plantCode: plant.code
  });
  const [doc] = await tx.insert(purchaseOrders).values({
    ...body, documentNumber: docNumber, status: 'draft',
  }).returning();
  return doc;
});

await app.auditEngine.logCreate(
  { companyId, documentType: 'purchase.po', documentId: po.id, documentNumber: po.documentNumber, performedBy: user.id },
  po
);
```

### Fastify decorators (apps/api/src/plugins/engines.ts)

Registered via `enginesPlugin` (after redisPlugin). All four services are available on `app`:
- `app.docConfigService` — DocumentConfigService instance
- `app.numberSeriesService` — NumberSeriesService instance
- `app.statusEngine` — StatusEngine class (static methods)
- `app.auditEngine` — AuditEngine instance

---

## Posting Engine (Phase 3)

### New schema tables (packages/db/src/schema/accounting.ts)

| Table | Purpose |
|---|---|
| `chart_of_accounts` | Hierarchical COA. `postingCategory` field links leaf accounts to PostingCategory. |
| `company_account_config` | Maps PostingCategory → account UUID per company (+ optional plant override). |
| `journal_entries` | One row per accounting event. Always references the source document. |
| `journal_entry_lines` | DR/CR lines. INVARIANT: SUM(debit) = SUM(credit) per entry, always. |

### Key design: PostingCategory abstraction

Templates never hardcode account UUIDs. They emit `{ accountCategory: 'inventory_raw_material', debitPaise: n }`. AccountMapService resolves categories → account IDs at post time. Same template works for any company COA.

PostingCategory values: `inventory_raw_material`, `inventory_wip`, `inventory_finished`, `inventory_stores`, `inventory_scrap`, `accounts_receivable`, `customer_advance`, `supplier_advance`, `cash`, `bank`, `input_cgst`, `input_sgst`, `input_igst`, `accounts_payable`, `output_cgst`, `output_sgst`, `output_igst`, `grn_clearing`, `grn_tax_clearing`, `round_off`, `sales_revenue`, `service_revenue`, `purchases`, `raw_material_consumed`, `cogs`, `stock_adjustment`, `production_variance`

### Standard Indian COA (packages/db/src/seeds/coa.ts)

`seedCoaForCompany(companyId, userId)` — called during company onboarding. Creates ~50 accounts (1xxx Assets, 2xxx Liabilities, 3xxx Revenue, 4xxx Expenses) and auto-builds `company_account_config`. Uses `INSERT ON CONFLICT DO NOTHING`.

### Services (apps/api/src/services/)

**AccountMapService** (`account-map.ts`):
- `getMap(companyId, plantId?)` → `AccountMap` (cached in Redis 10 min)
- Auto-fills from COA `postingCategory` if no manual config row exists
- `invalidate(companyId, plantId?)` — call after Settings → Account Configuration changes

**PostingEngine** (`posting-engine.ts`):
- `register(documentType, templateFn)` — register a posting template at startup
- `post(tx, ctx, performedBy)` → `journalEntryId` — MUST be inside same db.transaction() as status update
- `reverse(tx, originalEntryId, postingDate, userId, remarks)` → new reversal entry id
- `fiscalPeriod(date)` → `{ fiscalYear: '2425', period: 1-12 }` helper (Indian FY April=1)
- Throws `PostingImbalanceError` if template produces unbalanced lines

**Built-in posting templates** (`posting-templates.ts`):
| Template | Document type | Posting |
|---|---|---|
| purchaseGrnTemplate | `purchase.grn` | DR Inventory + Input GST / CR GR/IR Clearing + GR/IR Tax Clearing |
| purchaseInvoiceTemplate | `purchase.invoice` | DR GR/IR Clearing + GR/IR Tax Clearing / CR Accounts Payable |
| purchasePaymentTemplate | `purchase.payment` | DR Accounts Payable / CR Bank or Cash |
| salesInvoiceTemplate | `sales.invoice` | DR Accounts Receivable / CR Sales Revenue + Output GST |
| salesPaymentTemplate | `sales.payment` | DR Bank or Cash / CR Accounts Receivable |
| manufacturingIssueTemplate | `manufacturing.issue` | DR WIP / CR RM Inventory (or Stores) |
| manufacturingReceiptTemplate | `manufacturing.receipt` | DR FG Inventory / CR WIP (± Production Variance) |
| stockAdjustmentInTemplate | `stock.adjustment_in` | DR Inventory / CR Stock Adjustment |
| stockAdjustmentOutTemplate | `stock.adjustment_out` | DR Stock Adjustment / CR Inventory |
| stockScrapTemplate | `stock.scrap` | DR Scrap + Stock Adjustment / CR Inventory |

### GST handling

- Intra-state: CGST + SGST (each half the total GST rate)
- Inter-state: IGST (full GST rate)
- Templates read from `ctx.taxLines[]` (populated by Tax Engine in Phase 4; for Phase 3 can be computed inline)
- Input GST → asset accounts (1611/1612/1613) — claimed as credit
- Output GST → liability accounts (2411/2412/2413) — payable to government

### Cancellation reversal pattern

```typescript
// In a route handler for document cancellation (inside db.transaction):
const { fiscalYear, period } = fiscalPeriod(new Date());
const reversalEntryId = await app.postingEngine.reverse(
  tx,
  originalJournalEntryId,
  new Date(),
  request.user.id,
  `${document.documentNumber} cancelled: ${body.cancelReason}`
);
```

### Fastify decorators

- `app.accountMapService` — AccountMapService instance
- `app.postingEngine` — PostingEngine instance (all built-in templates pre-registered)

---

## Tax Engine (Phase 4)

### New schema tables (packages/db/src/schema/tax.ts)

| Table | Purpose |
|---|---|
| `tax_codes` | Per-company GST rate codes (NIL/EXEMPT/GST5/GST12/GST18/GST28). Rates in basis points. |
| `hsn_sac_codes` | Global HSN (goods) and SAC (services) code master. |
| `document_tax_lines` | Per-line computed tax amounts for every document. Powers GSTR reporting. |
| `e_invoice_records` | One row per IRP submission. Stores IRN, QR code, signed invoice. |

### Rate storage convention

All GST rates stored as **basis points** (1% = 100 bp) to avoid floats:
- GST 18% → `gstRateBp = 1800`, `cgstRateBp = 900`, `sgstRateBp = 900`, `igstRateBp = 1800`
- IRP JSON expects decimal (18.0) — convert with `rateBp / 100` at boundary

### CGST/SGST vs IGST determination

```typescript
const supplierStateCode = supplierGstin.slice(0, 2);
const isInterState = supplierStateCode !== placeOfSupply;
// Intra-state → CGST (rate/2) + SGST (rate/2)
// Inter-state → IGST (full rate)
// Export/SEZ  → zero-rated (all amounts = 0, ITC still claimable)
```

### ITC offset order (mandatory under GST law)

1. Input IGST → IGST first, then CGST, then SGST
2. Input CGST → CGST first, then IGST (NEVER SGST)
3. Input SGST → SGST first, then IGST (NEVER CGST)

The COA has separate accounts (1611 CGST, 1612 SGST, 1613 IGST) to track them independently.

### TaxEngine service (apps/api/src/services/tax-engine.ts)

Stateless — all methods pure (no DB I/O except `loadTaxCode`).

- `compute(lines, supplierGstin, placeOfSupply, supplyType, isReverseCharge)` → `TaxComputation`
  - `lines` must have `gstRateBp`, `cgstRateBp`, etc. pre-loaded via `loadTaxCode()`
  - Returns per-line and aggregate totals, plus `isInterState`, `placeOfSupply`
  - Round-off paise absorbed in `totals.roundOffPaise`
- `validateGstin(gstin)` → `{ valid, stateCode, stateName, pan, errors[] }` — validates format + state code + mod-36 check digit
- `stateFromGstin(gstin)` → `'29'` (first 2 chars)
- `computeIrn(supplierGstin, docType, docNo, docDate, fy)` → 64-char SHA-256 hex
- `buildEInvoicePayload(opts)` → `EInvoicePayload` (NIC schema v1.1 — amounts in ₹, not paise)
- `loadTaxCode(companyId, code)` → rate basis points from DB

### IrpClient (apps/api/src/services/irp-client.ts)

Interface with two implementations:
- `MockIrpClient` — default (IRP_MODE=mock). Deterministic fake IRN for dev/test.
- `ProductionIrpClient` — skeleton for GSP integration (Cleartax/Masters India/NIC).

Set in `.env`:
```
IRP_MODE=mock            # default
IRP_MODE=production      # requires GSP_BASE_URL, GSP_GSTIN, GSP_USERNAME, GSP_PASSWORD, IRP_PUBLIC_KEY
```

`createIrpClient()` factory reads `IRP_MODE` and constructs the right client.

### e-Invoice workflow in route handlers

```typescript
// 1. Compute tax (before document insert)
const rates = await app.taxEngine.loadTaxCode(companyId, 'GST18');
const taxResult = app.taxEngine.compute(
  lines.map(l => ({ ...l, ...rates })),
  company.gstin, customer.stateCode, 'B2B'
);

// 2. Persist document_tax_lines (inside db.transaction)
await tx.insert(documentTaxLines).values(
  taxResult.lines.map(l => ({ companyId, documentType: 'sales.invoice', documentId: invoice.id, ...l,
    placeOfSupply: taxResult.placeOfSupply, isInterState: taxResult.isInterState, supplyType: taxResult.supplyType }))
);

// 3. Post GL entries (using TaxComputation.lines as ctx.taxLines)
await app.postingEngine.post(tx, { ...ctx, taxLines: taxResult.lines.map(l => ({
  taxCode: l.taxCode, taxType: taxResult.isInterState ? 'igst' : 'cgst',
  baseAmountPaise: l.assessableAmountPaise, taxAmountPaise: l.cgstAmountPaise + l.sgstAmountPaise + l.igstAmountPaise
})) }, userId);

// 4. Generate e-invoice after approval (if company.einvoiceEnabled)
const payload = app.taxEngine.buildEInvoicePayload({ docType: 'INV', docNumber: invoice.documentNumber,
  docDate: new Date(invoice.postingDate), supplyType: 'B2B', isReverseCharge: false,
  seller, buyer, placeOfSupply: taxResult.placeOfSupply, taxResult });
const irpResp = await app.irpClient.generateIrn(payload);
await db.insert(eInvoiceRecords).values({ companyId, documentType: 'sales.invoice',
  documentId: invoice.id, documentNumber: invoice.documentNumber,
  irn: irpResp.irn, ackNo: irpResp.ackNo, ackDate: irpResp.ackDate,
  signedQrCode: irpResp.signedQrCode, status: 'generated', irpPayload: payload, irpResponse: irpResp.raw });
```

### Seeding (called during company onboarding)

```bash
# Tax codes (per company)
npx tsx packages/db/src/seeds/tax-codes.ts <companyId> <userId>

# HSN/SAC master (global, one-time)
npx tsx packages/db/src/seeds/tax-codes.ts hsn
```

### Fastify decorators

- `app.taxEngine` — TaxEngine instance
- `app.irpClient` — IrpClient (mock or production)

---

## Inventory Core (Phase 5)

### New schema tables (packages/db/src/schema/inventory.ts)

| Table | Purpose |
|---|---|
| `unit_of_measures` | Global UOM master (KG, LTR, PCS, MTR, BOX, etc.) |
| `uom_conversions` | Conversion factors. Item-scoped > company-scoped > global. |
| `item_groups` | Hierarchical item classification. |
| `items` | Items master — shared across plants. itemType, trackingType, valuationMethod. |
| `item_batches` | One row per batch/lot number. Manufacture/expiry dates, QC status, JSONB properties. |
| `item_serials` | One row per serialised unit. Status: in_stock → issued → delivered → scrapped. |
| `stock_ledger_entries` | Append-only movement log. NEVER updated or deleted. |
| `stock_balances` | Materialized running balance + WAC per (company, plant, warehouse, item). |
| `stock_reservations` | Committed quantity from open SOs / production orders. |

### Movement types (MovementType)

**Inward (IN):** `purchase_receipt`, `production_receipt`, `transfer_receipt`, `return_from_customer`, `opening_balance`, `adjustment_in`, `by_product_receipt`, `subcon_receipt`

**Outward (OUT):** `issue_to_production`, `sales_delivery`, `transfer_issue`, `return_to_vendor`, `scrap_write_off`, `adjustment_out`, `sample_issue`, `subcon_issue`

Direction is looked up from `MOVEMENT_DIRECTION[movementType]` — never passed manually.

### Weighted Average Cost (WAC)

```
newWAC = (existingQty × existingRate + incomingQty × incomingRate) / (existingQty + incomingQty)
```

- Outward movements always issue at current WAC (snapshotted into SLE, immutable)
- stock_balance row is SELECT FOR UPDATE locked during every movement to prevent concurrent WAC corruption
- WAC resets to 0 when quantityOnHand hits 0

### Discrete vs Process manufacturing

Both use the same SLE and stock_balance tables. Differences:
- **Process:** decimal quantities (numeric 18,4), `batchId` mandatory (trackingType='batch'), `by_product_receipt` for co-products, yield variance from BOM
- **Discrete:** typically integer quantities, `serialId` optional, `production_receipt` for FG

### By-product cost allocation (ValuationEngine)

```typescript
// Process manufacturing: split batch cost across primary + by-products
const allocations = app.valuationEngine.allocateProductionCost(
  totalBatchCostPaise,
  [
    { itemId: primaryId, qty: 950, allocationPct: 85 },
    { itemId: byProductId, qty: 50, allocationPct: 15 },
  ],
  'manual'  // or 'qty' or 'sales_price'
);
```

### UOM conversion

```typescript
// Convert 5 BOX → PCS (if 1 BOX = 12 PCS globally)
const pcs = await app.uomService.convert(5, 'BOX', 'PCS', companyId, itemId);
// → 60

// Item-specific: 10 KG → LTR (density set per item)
const litres = await app.uomService.convert(10, 'KG', 'LTR', companyId, itemId);
```

### StockLedgerService usage (inside db.transaction)

```typescript
await db.transaction(async (tx) => {
  // Insert source document first (e.g. GRN)
  const [grn] = await tx.insert(goodsReceiptNotes).values({...}).returning();

  // Post stock movements (one per line)
  await app.stockLedger.postBatch(tx, lines.map(l => ({
    companyId, plantId, warehouseId,
    itemId: l.itemId,
    movementType: 'purchase_receipt',
    quantity: l.qty,
    uom: l.uom,
    valuationRatePaise: l.unitPricePaise,  // required for inward
    documentType: 'purchase.grn',
    documentId: grn.id,
    documentNumber: grn.documentNumber,
    documentLineNumber: l.lineNumber,
    batchId: l.batchId,   // if item.trackingType === 'batch'
    postingDate: new Date(grn.postingDate),
    createdBy: userId,
  })));

  // Post GL (PostingEngine reads SLE valuations from ctx.lines)
  await app.postingEngine.post(tx, postingCtx, userId);
});

// Check stock before issuing
const available = await app.stockLedger.getAvailableQty(companyId, warehouseId, itemId);
if (available < requiredQty) throw new Error('Insufficient stock');
```

### Reversal pattern

```typescript
await db.transaction(async (tx) => {
  await app.stockLedger.reverse(tx, originalSleId, new Date(), 'GRN cancelled', userId);
  await app.postingEngine.reverse(tx, originalJournalEntryId, new Date(), userId, 'GRN cancelled');
});
```

### Seeding

```bash
# UOM master + standard conversions (global one-time)
npx tsx packages/db/src/seeds/uom.ts
```

### Fastify decorators

- `app.stockLedger` — StockLedgerService (post, postBatch, reverse, getBalance, getAvailableQty)
- `app.valuationEngine` — ValuationEngine (computeNewWac, allocateProductionCost)
- `app.uomService` — UomService (convert, getFactor)

---

## Phase status

- [x] Phase 0 — Project setup, auth, UI shell
- [x] Phase 1 — Company, Plant, Warehouse, Users, Roles, Permissions schema + PermissionService
- [x] Phase 2 — Document Engine, Status Engine, Number Series, Audit Engine
- [x] Phase 3 — Accounting Core (COA, GL, Posting Engine, JV)
- [x] Phase 4 — GST Tax Engine, e-Invoice, IRP integration
- [x] Phase 5 — Inventory Core (Stock Ledger, Lot/Batch, WAC Valuation, UOM, Manufacturing GL templates)
- [ ] Phase 6 — Purchase module ⭐ first revenue milestone
- [ ] Phase 7 — Sales module
- [ ] Phase 8 — Manufacturing (Discrete + Process)
- [ ] Phase 9 — Dashboards, Reports, Backup, PWA, Installer
