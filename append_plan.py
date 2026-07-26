import sys

content = """

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
"""

with open('/Users/shyam18/.gemini/antigravity-ide/brain/c3125e66-4215-4ccb-a439-8f26f55e273d/implementation_plan.md', 'a') as f:
    f.write(content)

