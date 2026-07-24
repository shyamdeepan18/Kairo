# ERP Permission Model — Built & What to Add

_Date: 2026-07-01 · Reference for the access-control system (Phase 1 + proposed extensions)._

## Built today

Authorization is **three-dimensional**, resolved by `PermissionService` (Redis-cached 5 min)
and applied at the route layer by the `authorize()` preHandler.

| Dimension | Meaning | Tables (enforced) |
|---|---|---|
| **WHAT** | permission code `module.doc.action` | `permissions`, `roles`, `role_permissions`, `user_roles`, `user_permissions` (direct grant/deny — **deny wins**) |
| **WHERE** | data scope | `user_plant_access` (plant scope ✓); `user_warehouse_access` (**table exists, not yet checked**) |
| **HOW MUCH** | approval limit | `user_approval_limits` — per (user, doc_type, plant), in paise, `-1` = unlimited |

### Resolution order (`PermissionService.getEffectivePermissions`)

1. **System admin** (`users.is_system_admin`) → bypass everything.
2. **Role grants** — permissions from all `user_roles` for the (user, company, plant); roles with
   `plant_id = null` apply to all plants.
3. **User overrides** — `user_permissions` grant/deny; a deny removes a role-granted permission.
4. **Plant access** — `hasPlantAccess()` if a plantId is in the request.
5. **Amount limit** — `withinApprovalLimit()` for approval actions with a monetary amount.

### Conventions

- Permission code: `<module>.<document_type>.<action>` — modules `auth, settings, purchase, inventory,
  accounting, sales, manufacturing`; actions `view, create, edit, submit, approve, reject, cancel,
  delete, manage, run, transfer, adjust, count, issue, close, financial`.
- **Company is the tenant boundary**; `roles.company_id = null` = system role, non-null = custom company role.
- System roles seeded: Company Admin, Purchase Manager/User, Inventory Manager, Store Keeper,
  Accounts Manager/User, Sales Manager/User, Manufacturing Manager, Report Viewer.
- JWT carries no company id — every request states its company (`resolveCompany` preHandler:
  body / `?companyId` / `x-company-id`).

## What to add

Two **new dimensions** plus closing gaps in the three built ones.

| Dimension | Status | Adds |
|---|---|---|
| WHEN | proposed | out-of-office substitute, time-bounded grants (`valid_until`), login window / IP allowlist, MFA flag |
| HOW | proposed | maker ≠ checker (SoD), multi-level approval chains, field / cost-price masking, own-records-only filters |

### By level

**User** — direct grant/deny ✓, per-user approval limits ✓; **add**: warehouse scope (enforce the
existing table), delegation, maker≠checker, login restrictions, default company+plant.

**Company (tenant)** — custom roles ✓, fiscal year / GSTIN / branding ✓; **add**: module activation +
user (seat) limits — the "License Engine"; multi-level approval workflows; audit-log / retention policy.

**Settings** — company/plant/warehouse + users/roles/permissions ✓; **add** permission codes for
number-series, tax-codes, document-config (L1/L2), and account-config management (today only a system
admin can safely edit these).

### Known gaps & recent implementations

- `user_warehouse_access` table enforced via `PermissionService.hasWarehouseAccess()` ✓.
- PO approve monetary limit enforced via `PermissionService.withinApprovalLimit()` ✓.
- Segregation of Duties (Maker ≠ Checker) enforced via `PermissionService.validateMakerChecker()` ✓.
- No company-level module gate or seat cap (License Engine from the architecture skill is unbuilt).
- Admin-only settings (number series, tax codes, doc/account config) permission codes expansion pending.

## Suggested roadmap

1. **Quick wins** — warehouse scope, maker≠checker, settings permission codes, enforce PO amount limit.
2. **Control & commerce** — multi-level approval workflows + company module activation / seat caps
   (designed in `PERMISSION-2-APPROVAL-AND-LICENSING-DESIGN.md`).
3. **Polish & hardening** — delegation / time-bounded grants, login restrictions, field/price masking.

See also: `DO-LATER-BACKLOG.md` (deferred feature coding).
