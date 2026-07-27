import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '@erp/db';

/**
 * FK-ownership validation (Phase 4).
 *
 * A client may send a UUID that points at another tenant's row (an item group,
 * plant, tax code, source document, …). Tenant-scoping the *target* write is not
 * enough — the foreign reference itself must be proven to belong to the active
 * company before it is stored, or a caller could, e.g., attach their PO line to
 * another tenant's item. These helpers make that check a one-liner and throw a
 * 400 (honoured by Fastify via `err.statusCode`) when the reference is foreign or
 * missing.
 *
 *   await assertOwned(items, body.itemGroupId, companyId, 'Item group');
 *
 * Pass a transaction as the final arg to run the check inside an open tx:
 *   await assertOwned(plants, plantId, companyId, 'Plant', tx);
 */

interface TenantOwned {
  id: PgColumn;
  companyId: PgColumn;
}

/** Minimal executor shape satisfied by both the db singleton and a tx handle. */
type Executor = Pick<typeof db, 'select'>;

function invalidRef(label: string): never {
  throw Object.assign(new Error(`${label} does not belong to this company`), {
    statusCode: 400,
  });
}

/**
 * Assert that `id` names a row in `table` owned by `companyId`. No-op when `id`
 * is null/undefined, so it composes with optional references:
 *   await assertOwned(itemGroups, body.parentId, companyId, 'Parent group');
 */
export async function assertOwned(
  table: TenantOwned,
  id: string | null | undefined,
  companyId: string,
  label = 'Reference',
  exec: Executor = db,
): Promise<void> {
  if (id == null) return;
  const [row] = await exec
    .select({ id: table.id })
    .from(table as never)
    .where(and(eq(table.id, id), eq(table.companyId, companyId)))
    .limit(1);
  if (!row) invalidRef(label);
}

/**
 * Like assertOwned, but the row may also be a global/system record whose
 * companyId is NULL (e.g. seeded system roles shared across tenants). Accepts a
 * row that is either owned by the tenant OR company-less.
 */
export async function assertOwnedOrGlobal(
  table: TenantOwned,
  id: string | null | undefined,
  companyId: string,
  label = 'Reference',
  exec: Executor = db,
): Promise<void> {
  if (id == null) return;
  const [row] = await exec
    .select({ id: table.id })
    .from(table as never)
    .where(and(eq(table.id, id), or(eq(table.companyId, companyId), isNull(table.companyId))))
    .limit(1);
  if (!row) invalidRef(label);
}

/**
 * Batched form of assertOwned for a set of references (e.g. every itemId on a
 * document's lines). Nulls are skipped; the distinct remainder must ALL resolve
 * within the tenant in a single query, or the whole request is rejected 400.
 *
 *   await assertAllOwned(items, lines.map((l) => l.itemId), companyId, 'Item');
 */
export async function assertAllOwned(
  table: TenantOwned,
  ids: Array<string | null | undefined>,
  companyId: string,
  label = 'Reference',
  exec: Executor = db,
): Promise<void> {
  const unique = [...new Set(ids.filter((x): x is string => x != null))];
  if (unique.length === 0) return;
  const rows = await exec
    .select({ id: table.id })
    .from(table as never)
    .where(and(inArray(table.id, unique), eq(table.companyId, companyId)));
  if (rows.length !== unique.length) invalidRef(label);
}
