import { and, eq, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Tenant-scoping query helpers.
 *
 * Every tenant-owned record read/update/delete must be constrained by the
 * caller's active company id (from request.tenant.companyId) — never by the
 * global primary key alone. These helpers make that predicate impossible to
 * forget: the type only accepts a table that actually has a `companyId` column,
 * so applying them to a non-tenant table is a compile error.
 *
 *   import { tenant } from '../middleware/tenant-context.js';
 *   import { byTenantId, inTenant } from '../db/tenant-query.js';
 *
 *   const { companyId } = tenant(request);
 *
 *   // fetch/update/delete one record, scoped to the tenant
 *   const [po] = await db.select().from(purchaseOrders)
 *     .where(byTenantId(purchaseOrders, id, companyId));
 *
 *   // list within the tenant
 *   const rows = await db.select().from(purchaseOrders)
 *     .where(inTenant(purchaseOrders, companyId));
 *
 * Child tables that lack a companyId column must instead be scoped through their
 * tenant-owned parent (join the parent and constrain parent.companyId).
 */

interface TenantOwned {
  id: PgColumn;
  companyId: PgColumn;
}

/** `id = :id AND companyId = :companyId` — for single-record header queries. */
export function byTenantId(table: TenantOwned, id: string, companyId: string): SQL {
  // and() with two defined predicates always returns an SQL node.
  return and(eq(table.id, id), eq(table.companyId, companyId)) as SQL;
}

/** `companyId = :companyId` — for list queries on a tenant-owned table. */
export function inTenant(table: { companyId: PgColumn }, companyId: string): SQL {
  return eq(table.companyId, companyId);
}
