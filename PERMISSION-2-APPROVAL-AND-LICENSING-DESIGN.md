# Permission Roadmap — Item 2: Multi-Level Approval Workflows + Company Module Activation

_Date: 2026-07-01 · Design only (no code yet). Builds on the Phase 1 permission model._

Item 2 has two halves: **operational control** (approval workflows) and **commercial control**
(module activation / licensing). Both are company-level policy that gates whether an action can proceed.

---

## Part A — Multi-level approval workflows

### Why
Today approval is a single step (`submitted → approved`) guarded by one per-user amount limit
(`user_approval_limits`). Customers need **chains**: e.g. a PO up to ₹1L → 1 approver; ₹1L–10L →
manager then finance; > ₹10L → + director. Today that can't be expressed.

### Schema (new)

```
approval_workflows          company_id, document_type, name, is_active
  └─ approval_workflow_levels  workflow_id, level (1..n), name,
                               threshold_min_paise, threshold_max_paise,   -- amount band this level applies to
                               approver_type ('role' | 'user'),
                               approver_role_id | approver_user_id,
                               required_approvals (default 1),             -- N-of-M within the level
                               is_final (last level)

approval_requests           company_id, document_type, document_id, document_number,
                            amount_paise, workflow_id, current_level,
                            status ('pending' | 'approved' | 'rejected'),
                            created_by, created_at
  └─ approval_actions          request_id, level, action ('approved'|'rejected'),
                               performed_by, performed_at, remarks
```

### Engine: `ApprovalEngine`

- `resolveWorkflow(companyId, documentType, amountPaise)` → the active workflow + the ordered levels
  whose amount band covers `amountPaise`.
- `start(tx, ctx)` — called on **submit** (replaces the direct `submitted→approved`): creates an
  `approval_requests` row at level 1 and moves the document to `submitted`.
- `act(tx, requestId, userId, 'approved'|'rejected', remarks)` — validates the user is eligible for
  `current_level` (role membership or named user, **and passes SoD: `userId !== document.submittedBy`**,
  and within the level's band), records an `approval_actions` row; when the level's `required_approvals`
  are met, advances `current_level`; on the final level it calls `StatusEngine.prepare(doc, 'approved')`
  and stamps `approvedBy/approvedAt`. A reject finalizes the request as rejected → document `rejected`.
- `escalate()` — optional SLA per level (notify / auto-advance after N hours) via **BullMQ** (already in
  the stack for Phase 5+ jobs).

### Integration

- The existing `authorize('<module>.<doc>.approve')` still gates *who may approve at all*; the
  ApprovalEngine adds *whose turn it is + within which band*.
- **Backward compatible:** if no workflow is configured for a (company, doc type), fall back to the
  current single-step approve + `withinApprovalLimit()`. So nothing breaks until a workflow is defined.
- `user_approval_limits` becomes the degenerate case (a 1-level workflow), or stays as the fallback guard.

### New permission codes
`settings.approvalworkflow.view`, `settings.approvalworkflow.manage`.

---

## Part B — Company module activation (License Engine)

### Why
On-prem customers buy specific modules and a seat count. The system must gate **which modules a
company may use** and **how many users** — independent of per-user permissions. This is also the
commercial lever (Purchase-only site vs full suite). The architecture skill lists this as the unbuilt
"License Engine: key validation, module activation, user limits."

### Schema (new)

```
company_modules     company_id, module ('purchase'|'inventory'|'accounting'|'sales'|'manufacturing'|...),
                    is_enabled, activated_at, expires_at

company_license     company_id, edition, max_users, valid_from, valid_to,
                    license_key (signed blob), installed_at
```

### Service: `LicenseService`

- `isModuleEnabled(companyId, module)` — cached; the gate for a whole module's routes.
- `assertSeatAvailable(companyId)` — count active users vs `max_users`; block user create/activate when full.
- `validateKey(blob)` — **offline** verification (on-prem Windows has no phone-home): decode a signed
  license blob and verify the signature against an embedded public key + check `valid_to`. Tampering or
  expiry disables the affected modules.

### Enforcement

- A `requireModule('purchase')` preHandler (after `authenticate` + `resolveCompany`) on each module's
  route group → `403 module_not_licensed` when disabled or expired.
- Seat cap checked in the user-create / reactivate flow.
- Decorator `app.licenseService`; module routes add the gate, e.g.
  `preHandler: [app.authenticate, resolveCompany, requireModule('sales'), authorize('sales.so.create')]`.

### New permission codes
`settings.license.view`, `settings.license.manage`.

---

## Cross-cutting notes

- **Order within item 2:** approval workflows first (operational, customers ask for it), then module
  activation (commercial; also enables packaging/pricing).
- **Migrations & seeds:** new tables need migrations; seed the two `settings.*` permission codes and
  add them to the Company Admin role; default every company to all-modules-enabled so existing installs
  are unaffected until a license is applied.
- **Caching:** both `ApprovalEngine.resolveWorkflow` and `LicenseService.isModuleEnabled` should cache in
  Redis (like `PermissionService`) with explicit invalidation on settings change.
- **Audit:** approval actions already land in `approval_actions`; also log workflow start/finish and
  license/module changes to `document_audit_log` for traceability.

## Open questions (for you)

1. Approval bands — by document **amount** only, or also by other fields (plant, item group, supplier)?
2. N-of-M approvals within a level needed, or single approver per level for v1?
3. License model — per-module flags + a seat cap is enough, or also per-module seat tiers / expiry per module?
4. Should `user_approval_limits` be retired in favour of workflows, or kept as the no-workflow fallback?

---

## Implemented (2026-07-01) — v1 defaults

Built with these v1 choices: amount-banded levels (band = `amount >= thresholdMinPaise`),
`requiredApprovals` column supports N-of-M (defaults 1), per-module flags + seat cap (+ optional
expiry), and `user_approval_limits` kept as the no-workflow fallback.

**Files**
- Schema: `schema/approvals.ts` (`approval_workflows`, `approval_workflow_levels`, `approval_requests`,
  `approval_actions`), `schema/licensing.ts` (`company_modules`, `company_license`).
- Services: `services/approval-engine.ts` (`resolveWorkflow` / `start` / `act` with SoD + a
  documentType→table registry that finalizes via StatusEngine + AuditEngine), `services/license-service.ts`
  (`isModuleEnabled` cached, `getModules`/`setModule`, `assertSeatAvailable`, offline `validateKey`).
- Middleware: `middleware/require-module.ts` (`requireModule(module)`), attached as a `preHandler`
  hook on the purchase / sales / manufacturing route groups.
- Plugin: `plugins/governance.ts` (decorates `app.approvalEngine` + `app.licenseService`, registers the
  approvable doc types). Decorators declared in `fastify.d.ts`.
- Validators: `shared/validators/governance.ts`. Permissions: `settings.approvalworkflow.view/manage`,
  `settings.license.view/manage` (seeded; Company Admin gets them).
- Routes: `routes/governance.ts` at `/api/governance` — `/workflows`, `/modules`, `/license`,
  `/approvals/start`, `/approvals`, `/approvals/:id`, `/approvals/:id/act`.

**Verified:** all files pass Node type-strip syntax checks; permission codes resolve; no schema name
collisions; module gates and `/api/governance` wired in `index.ts`. Not `tsc`-checked (registry blocked)
and not runtime-tested.

**Remaining integration (intentionally not done):**
- Auto-call `approvalEngine.start()` on each module's submit (today a workflow is triggered via
  `POST /api/governance/approvals/start`; the `act` → finalize path is fully wired). This is a one-line
  hook per module submit route once you want workflows to fire automatically.
- Call `licenseService.assertSeatAvailable()` in the user-create flow (lives in the other session's
  `routes/settings.js`).
- Default-seed `company_modules` (all enabled) at company onboarding; sign + verify the license key
  against an embedded public key (currently structural validation + expiry only).
- Migrations for the four new tables.
