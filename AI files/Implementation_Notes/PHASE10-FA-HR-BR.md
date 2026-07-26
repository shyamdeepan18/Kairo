# Implementation Plan: Bank Reconciliation, Fixed Assets, HR & Payroll

This plan audits what already exists in Kairo, identifies all gaps (missing masters, fields, permissions, COA accounts, posting templates), and lays out the implementation for the three selected modules.

---

## Audit Summary: What Already Exists vs. What's Missing

### 1. Bank Reconciliation (BR)

| Component | Status | Notes |
|---|---|---|
| Schema: `bank_statements` | ✅ Exists | [accounting.ts L261-277](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/accounting.ts#L261-L277) |
| Schema: `bank_statement_lines` | ✅ Exists | [accounting.ts L279-291](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/accounting.ts#L279-L291) |
| Schema: `bank_reconciliations` | ✅ Exists | [accounting.ts L293-305](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/accounting.ts#L293-L305) |
| COA: Bank Account (1520) | ✅ Exists | [coa.ts L59](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/coa.ts#L59) |
| Permissions: `accounting.bankrecon.*` | ✅ Exists | [permissions.ts L83-84](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/permissions.ts#L83-L84) |
| API Routes | ❌ Missing | No routes in `apps/api/src/routes/` for bank reconciliation |
| Frontend Pages | ❌ Missing | No UI for import, matching, or reconciliation |
| Bank Accounts Master | ❌ Missing | No dedicated `bank_accounts` table. Currently using a single COA account `1520 - Bank Account`. Multi-bank support needs a master. |
| Auto-matching Engine | ❌ Missing | Logic to match statement lines → journal entry lines by amount + date + reference |
| Statement Import Parser | ❌ Missing | CSV/OFX/MT940 parser to populate `bank_statement_lines` |

### 2. Fixed Assets (FA)

| Component | Status | Notes |
|---|---|---|
| Schema: `fixed_assets` | ❌ Missing | No table exists |
| Schema: `asset_categories` | ❌ Missing | No master for grouping assets by depreciation method/rate |
| Schema: `depreciation_schedules` | ❌ Missing | No table for planned/posted depreciation entries |
| COA: Fixed Asset accounts (1100-1190) | ✅ Exists | Land, Buildings, Plant & Machinery, Vehicles, Furniture, Accum. Depreciation |
| COA: Depreciation Expense (4800) | ✅ Exists | [coa.ts L119](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/coa.ts#L119) |
| PostingCategory: `depreciation_expense` | ❌ Missing | No posting category for depreciation or accumulated depreciation |
| PostingCategory: `fixed_assets_*` | ❌ Missing | No posting categories for asset classes |
| Permissions: `accounting.asset.*` | ❌ Missing | No permission codes for fixed asset management |
| API Routes | ❌ Missing | No routes |
| Frontend Pages | ❌ Missing | No UI |
| Posting Template | ❌ Missing | No `depreciationTemplate` in PostingEngine |

### 3. HR & Payroll

| Component | Status | Notes |
|---|---|---|
| Schema: `employees` | ✅ Exists | [payroll.ts L12-45](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts#L12-L45) |
| Schema: `salary_components` | ✅ Exists | [payroll.ts L49-69](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts#L49-L69) |
| Schema: `employee_salary_structures` | ✅ Exists | [payroll.ts L73-87](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts#L73-L87) |
| Schema: `pay_periods` | ✅ Exists | [payroll.ts L91-104](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts#L91-L104) |
| Schema: `payslips` + `payslip_lines` | ✅ Exists | [payroll.ts L108-142](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts#L108-L142) |
| Schema: `departments` | ❌ Missing | `department` is just a varchar on `employees`, not a proper master |
| Schema: `attendance_logs` | ❌ Missing | No attendance tracking |
| Schema: `leave_types` | ❌ Missing | No leave type master (CL, SL, EL, etc.) |
| Schema: `leave_balances` | ❌ Missing | No per-employee leave balance tracking |
| Schema: `leave_requests` | ❌ Missing | No leave application/approval workflow |
| Employee fields: Missing | ⚠️ Partial | Missing: `dateOfBirth`, `gender`, `maritalStatus`, `aadhaarNumber`, `uanNumber` (PF), `esiNumber`, `bloodGroup`, `emergencyContact`, `dateOfExit`, `exitReason` |
| COA: Salary accounts | ✅ Partial | `Salaries Payable (2430)` exists but no `Salary Expense`, `PF Payable`, `ESI Payable`, `Professional Tax Payable` |
| PostingCategory: `salary_expense`, `pf_payable`, etc. | ❌ Missing | |
| Permissions: `payroll.*` | ✅ Exists | [permissions.ts L124-131](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/permissions.ts#L124-L131) |
| Permissions: `hr.attendance.*`, `hr.leave.*` | ❌ Missing | No HR-specific permissions |
| System Role: `HR Manager` | ❌ Missing | Only `Payroll Manager` exists |
| API Routes | ❌ Missing | No routes in `apps/api/src/routes/` |
| Frontend Pages | ❌ Missing | No UI |
| Posting Template | ❌ Missing | No `payrollTemplate` in PostingEngine |

---

## Proposed Changes

### Phase 10A: Masters & Foundation (Do First)

These are the prerequisite masters and schema changes needed before any feature logic.

---

#### [NEW] Schema: `bank_accounts` master — [accounting.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/accounting.ts)

Add a `bank_accounts` master table to support multiple bank accounts per company. Each row links to a COA leaf account.

```
bank_accounts:
  id, companyId, accountName, bankName, accountNumber, ifscCode,
  branch, accountType (current|savings|od|cc),
  coaAccountId → chart_of_accounts.id,  ← links to the GL account
  openingBalancePaise, isActive,
  createdAt, updatedAt
```

#### [NEW] Schema: `asset_categories` master — [NEW FILE: fixed-assets.ts]

```
asset_categories:
  id, companyId, name (e.g. "Plant & Machinery"),
  depreciationMethod (slm|wdv),  ← Straight Line / Written Down Value
  annualRatePercent (numeric 5,2),
  usefulLifeMonths (integer),
  assetCoaAccountId → chart_of_accounts.id,  ← e.g. 1130
  accumDepnCoaAccountId → chart_of_accounts.id,  ← e.g. 1190
  depnExpenseCoaAccountId → chart_of_accounts.id,  ← e.g. 4800
  isActive, createdAt, updatedAt
```

#### [NEW] Schema: `fixed_assets` — [NEW FILE: fixed-assets.ts]

```
fixed_assets:
  id, companyId, plantId,
  assetCode (e.g. "FA-0001"), name, description,
  categoryId → asset_categories.id,
  purchaseDate, purchaseInvoiceId → purchase_invoices.id (nullable),
  originalCostPaise (bigint), salvageValuePaise (bigint),
  depreciationMethod (slm|wdv), annualRatePercent, usefulLifeMonths,
  accumulatedDepreciationPaise (bigint, default 0),
  currentBookValuePaise (bigint),
  status (active|disposed|written_off),
  disposalDate, disposalAmountPaise, disposalJournalEntryId,
  createdBy, updatedBy, createdAt, updatedAt
```

#### [NEW] Schema: `depreciation_schedules` — [NEW FILE: fixed-assets.ts]

```
depreciation_schedules:
  id, assetId → fixed_assets.id,
  periodStart (date), periodEnd (date),
  depreciationAmountPaise (bigint),
  status (planned|posted),
  journalEntryId → journal_entries.id (null until posted),
  postedAt, createdAt
```

#### [NEW] Schema: `departments` master — [payroll.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts)

Replace the varchar `department` field on `employees` with a proper FK to a `departments` table:

```
departments:
  id, companyId, code, name, headOfDepartment → employees.id (nullable),
  isActive, createdAt, updatedAt
```

#### [MODIFY] Schema: `employees` — [payroll.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts)

Add missing fields for Indian HR compliance:

```diff
+ departmentId → departments.id        (replace varchar department)
+ dateOfBirth (date)
+ gender (varchar: male|female|other)
+ maritalStatus (varchar)
+ aadhaarNumber (varchar 12)           ← for PF/ESI
+ uanNumber (varchar 12)              ← Universal Account Number (EPF)
+ esiNumber (varchar 17)              ← Employee State Insurance
+ bloodGroup (varchar 5)
+ emergencyContactName (varchar 255)
+ emergencyContactPhone (varchar 20)
+ dateOfExit (date, nullable)
+ exitReason (text, nullable)
+ currentAddress (text)
+ permanentAddress (text)
```

#### [NEW] Schema: `attendance_logs` — [payroll.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts)

```
attendance_logs:
  id, companyId, employeeId → employees.id,
  date (date), 
  status (present|absent|half_day|leave|holiday|week_off),
  checkInTime (timestamp), checkOutTime (timestamp),
  workedHours (numeric 5,2),
  remarks (text),
  createdAt, updatedAt
  UNIQUE(employeeId, date)
```

#### [NEW] Schema: `leave_types` master — [payroll.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts)

```
leave_types:
  id, companyId, code (CL|SL|EL|ML|etc), name,
  annualQuota (integer),
  isCarryForward (boolean), maxCarryForward (integer),
  isPaidLeave (boolean),
  isActive, createdAt, updatedAt
```

#### [NEW] Schema: `leave_balances` — [payroll.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts)

```
leave_balances:
  id, employeeId → employees.id, leaveTypeId → leave_types.id,
  fiscalYear (varchar 5),
  openingBalance (numeric 5,2), 
  credited (numeric 5,2),   ← annual quota allocation
  used (numeric 5,2),
  carriedForward (numeric 5,2),
  currentBalance (numeric 5,2),
  UNIQUE(employeeId, leaveTypeId, fiscalYear)
```

#### [NEW] Schema: `leave_requests` — [payroll.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/payroll.ts)

```
leave_requests:
  id, companyId, employeeId → employees.id,
  leaveTypeId → leave_types.id,
  fromDate (date), toDate (date),
  numberOfDays (numeric 5,2),
  reason (text),
  status (draft|submitted|approved|rejected|cancelled),
  approvedBy → users.id, approvedAt,
  rejectedBy → users.id, rejectedAt, rejectionReason,
  createdAt, updatedAt
```

---

### Phase 10B: COA & Posting Categories

#### [MODIFY] PostingCategory type — [accounting.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/schema/accounting.ts)

Add new posting categories:

```diff
+ | 'fixed_assets'
+ | 'accumulated_depreciation'
+ | 'depreciation_expense'
+ | 'salary_expense'
+ | 'pf_employer_contribution'
+ | 'esi_employer_contribution'
+ | 'pf_payable'
+ | 'esi_payable'
+ | 'professional_tax_payable'
+ | 'salary_payable'
```

#### [MODIFY] COA Seed — [coa.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/coa.ts)

Add posting categories to existing accounts and add new accounts:

```diff
  # Existing accounts — add postingCategory:
  1130 Plant & Machinery        → postingCategory: 'fixed_assets'
  1190 Accumulated Depreciation → postingCategory: 'accumulated_depreciation'
  4800 Depreciation             → postingCategory: 'depreciation_expense'
  2430 Salaries Payable         → postingCategory: 'salary_payable'

  # New accounts to add:
  4210 Factory Wages            → postingCategory: 'salary_expense' (already exists, add category)
  2440 PF Payable               → NEW (liability, credit)  postingCategory: 'pf_payable'
  2450 ESI Payable              → NEW (liability, credit)  postingCategory: 'esi_payable'
  2460 Professional Tax Payable → NEW (liability, credit)  postingCategory: 'professional_tax_payable'
  4230 PF Employer Contribution → NEW (expense, debit)     postingCategory: 'pf_employer_contribution'
  4240 ESI Employer Contribution→ NEW (expense, debit)     postingCategory: 'esi_employer_contribution'
```

---

### Phase 10C: Permissions & Roles

#### [MODIFY] Permission Seed — [permissions.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/permissions.ts)

Add new permission codes:

```
# Fixed Assets
accounting.asset.view       — View fixed assets
accounting.asset.create     — Create fixed assets
accounting.asset.edit       — Edit fixed assets
accounting.asset.dispose    — Dispose/write-off assets
accounting.depreciation.run — Run depreciation

# HR (new module)
hr.department.view          — View departments
hr.department.manage        — Manage departments
hr.attendance.view          — View attendance
hr.attendance.manage        — Mark/edit attendance
hr.leave.view               — View leave requests
hr.leave.apply              — Apply for leave
hr.leave.approve            — Approve/reject leave
hr.leavetype.manage         — Manage leave types
hr.reports.view             — View HR reports
```

#### [MODIFY] System Roles — [permissions.ts](file:///Users/shyam18/SEGA/ERP/packages/db/src/seeds/permissions.ts)

```diff
+ HR Manager role   → all hr.* + payroll.* permissions
+ Update 'Company Admin' to include hr.* and accounting.asset.* permissions
+ Update 'Accounts Manager' to include accounting.asset.* and accounting.depreciation.*
```

---

### Phase 10D: API Routes

#### [NEW] Route file: `bank-reconciliation.ts`
- `POST /api/accounting/bank-accounts` — Create bank account master
- `GET /api/accounting/bank-accounts` — List bank accounts
- `POST /api/accounting/bank-statements/import` — Upload CSV → parse → insert lines
- `GET /api/accounting/bank-statements` — List statements
- `GET /api/accounting/bank-statements/:id/lines` — View statement lines
- `POST /api/accounting/bank-reconciliation/auto-match` — Run auto-matching engine
- `POST /api/accounting/bank-reconciliation/match` — Manual match (statement line ↔ JE line)
- `DELETE /api/accounting/bank-reconciliation/:id` — Unmatch

#### [NEW] Route file: `fixed-assets.ts`
- `POST /api/accounting/asset-categories` — Create category master
- `GET /api/accounting/asset-categories` — List categories
- `POST /api/accounting/fixed-assets` — Create/capitalize asset
- `GET /api/accounting/fixed-assets` — List assets
- `PUT /api/accounting/fixed-assets/:id` — Edit asset
- `POST /api/accounting/depreciation/run` — Run depreciation for a period (bulk)
- `POST /api/accounting/fixed-assets/:id/dispose` — Dispose asset (posts GL)
- `GET /api/accounting/fixed-assets/register` — Asset register report

#### [NEW] Route file: `hr.ts`
- `POST /api/hr/departments` — Create department
- `GET /api/hr/departments` — List departments
- `POST /api/hr/attendance` — Mark attendance (single/bulk)
- `GET /api/hr/attendance` — View attendance (by employee/date range)
- `POST /api/hr/leave-types` — Create leave type
- `GET /api/hr/leave-types` — List leave types
- `POST /api/hr/leave-requests` — Apply for leave
- `POST /api/hr/leave-requests/:id/approve` — Approve leave
- `POST /api/hr/leave-requests/:id/reject` — Reject leave
- `GET /api/hr/leave-balances/:employeeId` — View leave balances

#### [MODIFY] Route file: `payroll.ts` (or add to existing)
- Integrate attendance data into payslip generation (LOP deduction for unpaid leave)
- `POST /api/payroll/pay-periods/:id/generate` — Generate payslips from attendance + salary structures

---

### Phase 10E: Posting Templates

#### Depreciation Posting Template
```
DR  Depreciation Expense (4800)    → depreciationAmountPaise
CR  Accumulated Depreciation (1190) → depreciationAmountPaise
```
Per asset, per month. Narration: "Depreciation for {asset.name} — {period}"

#### Asset Disposal Posting Template
```
DR  Accumulated Depreciation (1190) → accumulatedDepreciationPaise
DR  Bank/Cash (1520)                → disposalAmountPaise
DR/CR Profit/Loss on Disposal       → difference (gain = CR, loss = DR)
CR  Fixed Assets (1130)              → originalCostPaise
```

#### Payroll Posting Template
```
DR  Salary Expense (4210)                  → grossEarningsPaise
DR  PF Employer Contribution (4230)        → employerPfPaise
DR  ESI Employer Contribution (4240)       → employerEsiPaise
CR  Salary Payable (2430)                  → netPayPaise
CR  PF Payable (2440)                      → employeePf + employerPf
CR  ESI Payable (2450)                     → employeeEsi + employerEsi
CR  Professional Tax Payable (2460)        → ptAmount
CR  TDS Payable (2420)                     → tdsAmount
```

---

## Open Questions

> [!IMPORTANT]
> **Fixed Asset Depreciation Method:** Indian companies typically use **Written Down Value (WDV)** for Income Tax purposes and **Straight Line Method (SLM)** for Books/Companies Act. Do you want to support both methods simultaneously (dual depreciation books), or just one method per asset?

> [!IMPORTANT]
> **Bank Statement Import Format:** What bank statement format(s) should we prioritize? Options:
> - CSV (most universal, but format varies per bank)
> - OFX/QFX (standard format, supported by most Indian banks)
> - MT940 (SWIFT format, used by corporate banking portals)
> - All three?

> [!IMPORTANT]
> **HR Self-Service:** Should employees be able to log in and apply for leaves / view payslips themselves? This would require linking `employees.userId` to the auth system and adding an `Employee Self-Service` role with limited permissions.

---

## Verification Plan

### Automated Tests
- Unit tests for auto-matching engine (exact match, fuzzy match, no match)
- Unit tests for depreciation calculation (SLM and WDV)
- Unit tests for payroll generation (gross → deductions → net)
- GL balance assertions: `SUM(debit) = SUM(credit)` after each posting template runs

### Manual Verification
- Import a sample bank statement CSV → verify auto-match results
- Create an asset → run 3 months depreciation → verify book value and GL entries
- Create employee → mark attendance → generate payslip → verify GL posting
- Verify all new permissions appear in the role assignment UI


---

# Implementation Plan: Diagnostics & Observability (Admin Portal)

This plan implements a lean observability system tailored for the Admin Portal. Per user instruction, we will strictly avoid bloated "per-tenant live sizing" and instead focus on globally enabling system health tracking and a selective audit log.

## Proposed Changes

### 1. Enable `pg_stat_statements` (System Health)

#### [MODIFY] `docker-compose.yml`
Update the `postgres` service to preload the stats extension:
```diff
  postgres:
    image: postgres:16-alpine
+   command: ["postgres", "-c", "shared_preload_libraries=pg_stat_statements"]
```

#### [NEW] Database Migration
Create a manual `.sql` migration file that executes:
```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

### 2. Audit Trail System

#### [NEW] Schema: `audit_logs` — [common.ts]
Create a lean audit log table restricted to tracking critical mutations:
```ts
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  companyId: uuid('company_id').references(() => companies.id), // Nullable for system actions
  userId: uuid('user_id').references(() => users.id),
  action: varchar('action', { length: 50 }).notNull(), // 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
  entity: varchar('entity', { length: 100 }).notNull(), // 'User', 'Invoice', 'Company'
  entityId: varchar('entity_id', { length: 255 }), // ID of the mutated record
  details: jsonb('details'), // Snapshot of changes or context
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

#### [NEW] Fastify Global Hook — `apps/api/src/plugins/audit.ts`
Write a Fastify plugin that uses the `onResponse` lifecycle hook. 
- It will inspect every request.
- If the method is `POST`, `PUT`, `PATCH`, or `DELETE`, and the request was successful (`statusCode < 400`), it extracts the inferred `entity` from the URL (e.g., `/api/sales/invoices` → `Invoice`), extracts the user from the JWT, and asynchronously inserts a row into `audit_logs`.

### 3. Admin Portal Diagnostic API & UI

#### [NEW] API Routes — `apps/api/src/routes/admin.ts`
- `GET /api/admin/diagnostics/health`: Queries `pg_stat_statements` (ordered by `total_exec_time DESC` for slow queries) and `pg_stat_activity` (for active connections and locks).
- `GET /api/admin/diagnostics/audit-logs`: Lists recent global audit logs (paginated).

#### [MODIFY] UI — `apps/web/src/pages/admin/AdminPortal.tsx`
Add a new **Diagnostics** tab to the Admin Portal interface.
- The tab will display two panels:
  1. **System Health**: A table showing the Top 10 slowest SQL queries in the database and connection counts.
  2. **Global Audit Trail**: A feed of all critical system mutations (logins, creates, updates, deletes) grouped by User and Timestamp.

## User Review Required

> [!WARNING]
> **Database Restart Required**
> Enabling `pg_stat_statements` requires modifying `docker-compose.yml` and doing a hard restart of the postgres container. This will drop current active connections momentarily.

## Verification Plan

### Automated Tests
- Trigger a `POST /api/settings/users` request and verify that the `audit_logs` table receives a new entry with `action: 'CREATE'` and `entity: 'users'`.
- Verify the global Fastify hook safely ignores `GET` requests.

### Manual Verification
- Rebuild docker containers.
- Verify `SELECT * FROM pg_stat_statements` returns data.
- Visit the Admin Portal Diagnostics tab and observe slow queries appearing.
