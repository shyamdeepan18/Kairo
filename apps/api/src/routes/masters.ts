/**
 * Masters API — company-scoped master-data routes
 *
 * Registered at: /api/masters/:companyId/*
 *
 * Covers Phase 2 master data: suppliers, customers (+ addresses), items,
 * item groups, units of measure and UOM conversions.
 *
 * Every route runs authenticate + resolveTenantContext (trusted tenant) and is
 * gated by authorize() against the module permission that owns the entity:
 * suppliers → purchase.supplier.*, customers → sales.customer.*, items /
 * item-groups / UOM → inventory.items.*. Heavier transactional supplier/customer
 * endpoints (with module-licensing) also exist under /api/purchase and
 * /api/sales; these company-scoped equivalents power the Masters UI.
 *
 * Phase 4: every write body is validated by a strict Zod DTO. Server-owned
 * fields (id / companyId / audit columns) are stripped by stripServerOwned()
 * before parsing — they can never be mass-assigned, but echoing them back on a
 * PATCH is tolerated; any *other* unexpected key still fails the .strict() parse.
 * This replaces the stripProtected stopgap with a real allowlist. Every
 * client-supplied foreign key is proven to belong to the active tenant via
 * assertOwned().
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db } from '@erp/db';
import {
  suppliers, customers, customerAddresses,
  items, itemGroups, unitOfMeasures, uomConversions,
  purchaseOrders, purchaseInvoices, purchasePayments,
  salesOrders, salesInvoices, salesReceipts,
} from '@erp/db';
import { eq, and, asc, desc, ilike, or, isNull } from 'drizzle-orm';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';
import { authorize } from '../middleware/authorize.js';
import { byTenantId } from '../db/tenant-query.js';
import { assertOwned } from '../db/fk-ownership.js';
import { stripServerOwned } from '../db/dto.js';

const uid = (req: { user?: unknown }) => (req.user as { sub?: string; id?: string }).sub
  ?? (req.user as { id?: string }).id ?? null;

/** numeric() columns must be inserted as strings — coerce safely. */
const numOrUndef = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

/**
 * 404 helper. This project never installed/registered @fastify/sensible, so
 * `app.httpErrors` is undefined at runtime — the previous `app.httpErrors.notFound()`
 * calls actually threw a TypeError (500). Fastify honours `err.statusCode`, so
 * this yields a proper 404.
 */
function notFound(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 404 });
}

/** 400 helper for a failed DTO parse. */
function invalid(reply: FastifyReply, parsed: { error: z.ZodError }) {
  return reply.code(400).send({ error: 'Invalid input', issues: parsed.error.issues });
}

// ─── Field helpers ────────────────────────────────────────────────────────────

const uuid = z.string().uuid();
const optStr = (max: number) => z.string().max(max).optional();

// ─── Strict DTO schemas (no id / companyId / audit columns) ─────────────────────

const supplierBase = z.object({
  supplierCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  legalName: optStr(255),
  supplierType: z.enum(['registered', 'unregistered', 'composition', 'sez', 'import', 'government']).default('registered'),
  gstin: z.string().length(15).optional(),
  pan: z.string().length(10).optional(),
  stateCode: z.string().length(2).optional(),
  address: z.string().optional(),
  city: optStr(100),
  state: optStr(100),
  pincode: optStr(6),
  contactPerson: optStr(255),
  phone: optStr(20),
  email: optStr(255),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  creditLimitPaise: z.number().int().nonnegative().default(0),
  bankAccountName: optStr(255),
  bankAccountNumber: optStr(50),
  bankIfsc: optStr(20),
  bankName: optStr(255),
});
const supplierCreateSchema = supplierBase.strict();
const supplierUpdateSchema = supplierBase.partial().strict();

const customerBase = z.object({
  customerCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  legalName: optStr(255),
  customerType: z.enum(['registered', 'unregistered', 'composition', 'sez', 'export', 'government']).default('registered'),
  gstin: z.string().length(15).optional(),
  pan: z.string().length(10).optional(),
  stateCode: z.string().length(2).optional(),
  contactPerson: optStr(255),
  phone: optStr(20),
  email: optStr(255),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  creditLimitPaise: z.number().int().nonnegative().default(0),
  defaultDiscountPercent: z.number().min(0).max(100).default(0),
  bankAccountName: optStr(255),
  bankAccountNumber: optStr(50),
  bankIfsc: optStr(20),
  bankName: optStr(255),
});
const customerCreateSchema = customerBase.strict();
const customerUpdateSchema = customerBase.partial().strict();

const customerAddressCreateSchema = z.object({
  addressType: z.enum(['billing', 'shipping', 'both']).default('both'),
  label: optStr(100),
  gstin: z.string().length(15).optional(),
  stateCode: z.string().length(2).optional(),
  address: z.string().optional(),
  city: optStr(100),
  state: optStr(100),
  pincode: optStr(6),
  contactPerson: optStr(255),
  phone: optStr(20),
  isDefault: z.boolean().default(false),
}).strict();

const itemGroupCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  parentId: uuid.optional(),
}).strict();
const itemGroupUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: uuid.nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

const uomCreateSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(30),
}).strict();

const uomConversionCreateSchema = z.object({
  fromUom: z.string().min(1).max(20),
  toUom: z.string().min(1).max(20),
  factor: z.number().positive(),
  itemId: uuid.optional(),
}).strict();

const itemBase = z.object({
  itemCode: z.string().min(1).max(50),
  itemName: z.string().min(1).max(255),
  description: z.string().optional(),
  itemType: z.string().min(1).max(30),
  itemGroupId: uuid.optional(),
  primaryUom: z.string().min(1).max(20),
  secondaryUom: optStr(20),
  conversionFactor: z.number().positive().optional(),
  hsnSacCode: optStr(10),
  defaultTaxCodeId: uuid.optional(),
  isStockItem: z.boolean().default(true),
  trackingType: z.string().max(10).default('none'),
  valuationMethod: z.string().max(20).default('weighted_average'),
  standardCostPaise: z.number().int().nonnegative().default(0),
  reorderLevelQty: z.number().nonnegative().default(0),
  reorderQty: z.number().nonnegative().default(0),
  leadTimeDays: z.number().int().nonnegative().default(0),
  minOrderQty: z.number().positive().default(1),
});
const itemCreateSchema = itemBase.strict();
const itemUpdateSchema = itemBase.partial().strict();

export default async function mastersRoutes(app: FastifyInstance) {
  // ════════════════════════════════════════════════════════════════════════════
  // Suppliers
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string }; Querystring: { q?: string } }>(
    '/:companyId/suppliers',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const q = (req.query.q ?? '').trim();
      const where = q
        ? and(eq(suppliers.companyId, companyId), or(ilike(suppliers.name, `%${q}%`), ilike(suppliers.supplierCode, `%${q}%`), ilike(suppliers.gstin, `%${q}%`)))
        : eq(suppliers.companyId, companyId);
      const list = await db.select().from(suppliers).where(where).orderBy(asc(suppliers.name));
      return { suppliers: list };
    }
  );

  app.get<{ Params: { companyId: string; id: string } }>(
    '/:companyId/suppliers/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.view')] },
    async (req) => {
      const [row] = await db.select().from(suppliers)
        .where(byTenantId(suppliers, req.params.id, tenant(req).companyId)).limit(1);
      if (!row) notFound('Supplier not found');
      return { supplier: row };
    }
  );

  app.post<{ Params: { companyId: string }; Body: unknown }>(
    '/:companyId/suppliers',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.create')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = supplierCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const b = parsed.data;
      const [row] = await db.insert(suppliers).values({
        ...b,
        companyId,
        stateCode: b.stateCode ?? b.gstin?.slice(0, 2),
        createdBy: uid(req),
      }).returning();
      reply.code(201);
      return { supplier: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: unknown }>(
    '/:companyId/suppliers/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.edit')] },
    async (req, reply) => {
      const parsed = supplierUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const [row] = await db.update(suppliers)
        .set({ ...parsed.data, updatedBy: uid(req), updatedAt: new Date() })
        .where(byTenantId(suppliers, req.params.id, tenant(req).companyId)).returning();
      if (!row) notFound('Supplier not found');
      return { supplier: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Customers (+ addresses)
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string }; Querystring: { q?: string } }>(
    '/:companyId/customers',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const q = (req.query.q ?? '').trim();
      const where = q
        ? and(eq(customers.companyId, companyId), or(ilike(customers.name, `%${q}%`), ilike(customers.customerCode, `%${q}%`), ilike(customers.gstin, `%${q}%`)))
        : eq(customers.companyId, companyId);
      const list = await db.select().from(customers).where(where).orderBy(asc(customers.name));
      return { customers: list };
    }
  );

  app.get<{ Params: { companyId: string; id: string } }>(
    '/:companyId/customers/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const [row] = await db.select().from(customers)
        .where(byTenantId(customers, req.params.id, companyId)).limit(1);
      if (!row) notFound('Customer not found');
      const addresses = await db.select().from(customerAddresses)
        .where(and(
          eq(customerAddresses.customerId, req.params.id),
          eq(customerAddresses.companyId, companyId),
        ));
      return { customer: row, addresses };
    }
  );

  app.post<{ Params: { companyId: string }; Body: unknown }>(
    '/:companyId/customers',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.create')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = customerCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const b = parsed.data;
      const [row] = await db.insert(customers).values({
        ...b,
        companyId,
        stateCode: b.stateCode ?? b.gstin?.slice(0, 2),
        defaultDiscountPercent: String(b.defaultDiscountPercent),
        createdBy: uid(req),
      }).returning();
      reply.code(201);
      return { customer: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: unknown }>(
    '/:companyId/customers/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.edit')] },
    async (req, reply) => {
      const parsed = customerUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const { defaultDiscountPercent, ...rest } = parsed.data;
      const [row] = await db.update(customers)
        .set({
          ...rest,
          ...(defaultDiscountPercent !== undefined ? { defaultDiscountPercent: String(defaultDiscountPercent) } : {}),
          updatedBy: uid(req),
          updatedAt: new Date(),
        })
        .where(byTenantId(customers, req.params.id, tenant(req).companyId)).returning();
      if (!row) notFound('Customer not found');
      return { customer: row };
    }
  );

  app.post<{ Params: { companyId: string; id: string }; Body: unknown }>(
    '/:companyId/customers/:id/addresses',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.edit')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const { id } = req.params;
      const parsed = customerAddressCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      // The parent customer must belong to the active tenant.
      const [parent] = await db.select({ id: customers.id }).from(customers)
        .where(byTenantId(customers, id, companyId)).limit(1);
      if (!parent) notFound('Customer not found');
      const [row] = await db.insert(customerAddresses).values({
        ...parsed.data,
        companyId,
        customerId: id,
      }).returning();
      reply.code(201);
      return { address: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Item groups
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/item-groups',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.view')] },
    async (req) => {
      const list = await db.select().from(itemGroups)
        .where(eq(itemGroups.companyId, tenant(req).companyId))
        .orderBy(asc(itemGroups.code));
      return { itemGroups: list };
    }
  );

  app.post<{ Params: { companyId: string }; Body: unknown }>(
    '/:companyId/item-groups',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.create')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = itemGroupCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      // A parent group, if given, must be one of this tenant's groups.
      await assertOwned(itemGroups, parsed.data.parentId, companyId, 'Parent item group');
      const [row] = await db.insert(itemGroups).values({
        companyId, code: parsed.data.code, name: parsed.data.name, parentId: parsed.data.parentId ?? null,
      }).returning();
      reply.code(201);
      return { itemGroup: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: unknown }>(
    '/:companyId/item-groups/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.edit')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = itemGroupUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      await assertOwned(itemGroups, parsed.data.parentId, companyId, 'Parent item group');
      const [row] = await db.update(itemGroups)
        .set({ ...parsed.data })
        .where(byTenantId(itemGroups, req.params.id, companyId)).returning();
      if (!row) notFound('Item group not found');
      return { itemGroup: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Units of measure (global master) + conversions (company-scoped)
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/uom',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.view')] },
    async (req) => {
      const list = await db.select().from(unitOfMeasures).orderBy(asc(unitOfMeasures.code));
      const conversions = await db.select().from(uomConversions)
        .where(or(eq(uomConversions.companyId, tenant(req).companyId), isNull(uomConversions.companyId)));
      return { uom: list, conversions };
    }
  );

  app.post<{ Params: { companyId: string }; Body: unknown }>(
    '/:companyId/uom',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.create')] },
    async (req, reply) => {
      const parsed = uomCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const [row] = await db.insert(unitOfMeasures).values({
        code: parsed.data.code.toUpperCase(), name: parsed.data.name, type: parsed.data.type,
      }).returning();
      reply.code(201);
      return { uom: row };
    }
  );

  app.post<{ Params: { companyId: string }; Body: unknown }>(
    '/:companyId/uom-conversions',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.create')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = uomConversionCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const b = parsed.data;
      // An item-specific conversion must reference one of this tenant's items.
      await assertOwned(items, b.itemId, companyId, 'Item');
      const [row] = await db.insert(uomConversions).values({
        companyId,
        itemId: b.itemId ?? null,
        fromUom: b.fromUom,
        toUom: b.toUom,
        factor: String(b.factor),
      }).returning();
      reply.code(201);
      return { conversion: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Items
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string }; Querystring: { q?: string; itemType?: string; groupId?: string } }>(
    '/:companyId/items',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const { q, itemType, groupId } = req.query;
      const filters = [eq(items.companyId, companyId)];
      if (q && q.trim()) filters.push(or(ilike(items.itemName, `%${q.trim()}%`), ilike(items.itemCode, `%${q.trim()}%`))!);
      if (itemType) filters.push(eq(items.itemType, itemType));
      if (groupId) filters.push(eq(items.itemGroupId, groupId));
      const list = await db.select().from(items).where(and(...filters)).orderBy(asc(items.itemCode));
      return { items: list };
    }
  );

  app.get<{ Params: { companyId: string; id: string } }>(
    '/:companyId/items/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.view')] },
    async (req) => {
      const [row] = await db.select().from(items)
        .where(byTenantId(items, req.params.id, tenant(req).companyId)).limit(1);
      if (!row) notFound('Item not found');
      return { item: row };
    }
  );

  app.post<{ Params: { companyId: string }; Body: unknown }>(
    '/:companyId/items',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.create')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = itemCreateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      const b = parsed.data;
      // Client-supplied references must belong to this tenant.
      await assertOwned(itemGroups, b.itemGroupId, companyId, 'Item group');
      const [row] = await db.insert(items).values({
        companyId,
        itemCode: b.itemCode,
        itemName: b.itemName,
        description: b.description,
        itemType: b.itemType,
        itemGroupId: b.itemGroupId ?? null,
        primaryUom: b.primaryUom,
        secondaryUom: b.secondaryUom ?? null,
        conversionFactor: numOrUndef(b.conversionFactor),
        hsnSacCode: b.hsnSacCode,
        defaultTaxCodeId: b.defaultTaxCodeId ?? null,
        isStockItem: b.isStockItem,
        trackingType: b.trackingType,
        valuationMethod: b.valuationMethod,
        standardCostPaise: b.standardCostPaise,
        reorderLevelQty: String(b.reorderLevelQty),
        reorderQty: String(b.reorderQty),
        leadTimeDays: b.leadTimeDays,
        minOrderQty: String(b.minOrderQty),
        createdBy: uid(req),
      }).returning();
      reply.code(201);
      return { item: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: unknown }>(
    '/:companyId/items/:id',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('inventory.items.edit')] },
    async (req, reply) => {
      const { companyId } = tenant(req);
      const parsed = itemUpdateSchema.safeParse(stripServerOwned(req.body));
      if (!parsed.success) return invalid(reply, parsed);
      await assertOwned(itemGroups, parsed.data.itemGroupId, companyId, 'Item group');
      // numeric() columns are stored as strings — coerce any that were supplied.
      const b: Record<string, unknown> = { ...parsed.data };
      for (const k of ['conversionFactor', 'reorderLevelQty', 'reorderQty', 'minOrderQty']) {
        if (k in b) b[k] = numOrUndef(b[k]);
      }
      const [row] = await db.update(items)
        .set({ ...b, updatedBy: uid(req), updatedAt: new Date() })
        .where(byTenantId(items, req.params.id, companyId)).returning();
      if (!row) notFound('Item not found');
      return { item: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Party transactions (read-only aggregation across document tables)
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string; id: string } }>(
    '/:companyId/suppliers/:id/transactions',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('purchase.supplier.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const { id } = req.params;
      // The supplier must belong to the active tenant before we surface its docs.
      const [party] = await db.select({ id: suppliers.id }).from(suppliers)
        .where(byTenantId(suppliers, id, companyId)).limit(1);
      if (!party) notFound('Supplier not found');
      const [pos, invs, pays] = await Promise.all([
        db.select({
          documentNumber: purchaseOrders.documentNumber, postingDate: purchaseOrders.postingDate,
          status: purchaseOrders.status, amountPaise: purchaseOrders.totalAmountPaise,
        }).from(purchaseOrders)
          .where(and(eq(purchaseOrders.companyId, companyId), eq(purchaseOrders.supplierId, id)))
          .orderBy(desc(purchaseOrders.postingDate)).limit(50),
        db.select({
          documentNumber: purchaseInvoices.documentNumber, postingDate: purchaseInvoices.postingDate,
          status: purchaseInvoices.status, amountPaise: purchaseInvoices.totalAmountPaise,
        }).from(purchaseInvoices)
          .where(and(eq(purchaseInvoices.companyId, companyId), eq(purchaseInvoices.supplierId, id)))
          .orderBy(desc(purchaseInvoices.postingDate)).limit(50),
        db.select({
          documentNumber: purchasePayments.documentNumber, postingDate: purchasePayments.postingDate,
          status: purchasePayments.status, amountPaise: purchasePayments.paidAmountPaise,
        }).from(purchasePayments)
          .where(and(eq(purchasePayments.companyId, companyId), eq(purchasePayments.supplierId, id)))
          .orderBy(desc(purchasePayments.postingDate)).limit(50),
      ]);
      const transactions = [
        ...pos.map((r) => ({ ...r, kind: 'Purchase Order' })),
        ...invs.map((r) => ({ ...r, kind: 'Purchase Invoice' })),
        ...pays.map((r) => ({ ...r, kind: 'Payment' })),
      ].sort((a, b) => (a.postingDate < b.postingDate ? 1 : -1));
      return { transactions };
    }
  );

  app.get<{ Params: { companyId: string; id: string } }>(
    '/:companyId/customers/:id/transactions',
    { preHandler: [app.authenticate, resolveTenantContext, authorize('sales.customer.view')] },
    async (req) => {
      const { companyId } = tenant(req);
      const { id } = req.params;
      // The customer must belong to the active tenant before we surface its docs.
      const [party] = await db.select({ id: customers.id }).from(customers)
        .where(byTenantId(customers, id, companyId)).limit(1);
      if (!party) notFound('Customer not found');
      const [sos, invs, recs] = await Promise.all([
        db.select({
          documentNumber: salesOrders.documentNumber, postingDate: salesOrders.postingDate,
          status: salesOrders.status, amountPaise: salesOrders.totalAmountPaise,
        }).from(salesOrders)
          .where(and(eq(salesOrders.companyId, companyId), eq(salesOrders.customerId, id)))
          .orderBy(desc(salesOrders.postingDate)).limit(50),
        db.select({
          documentNumber: salesInvoices.documentNumber, postingDate: salesInvoices.postingDate,
          status: salesInvoices.status, amountPaise: salesInvoices.totalAmountPaise,
        }).from(salesInvoices)
          .where(and(eq(salesInvoices.companyId, companyId), eq(salesInvoices.customerId, id)))
          .orderBy(desc(salesInvoices.postingDate)).limit(50),
        db.select({
          documentNumber: salesReceipts.documentNumber, postingDate: salesReceipts.postingDate,
          status: salesReceipts.status, amountPaise: salesReceipts.receivedAmountPaise,
        }).from(salesReceipts)
          .where(and(eq(salesReceipts.companyId, companyId), eq(salesReceipts.customerId, id)))
          .orderBy(desc(salesReceipts.postingDate)).limit(50),
      ]);
      const transactions = [
        ...sos.map((r) => ({ ...r, kind: 'Sales Order' })),
        ...invs.map((r) => ({ ...r, kind: 'Sales Invoice' })),
        ...recs.map((r) => ({ ...r, kind: 'Receipt' })),
      ].sort((a, b) => (a.postingDate < b.postingDate ? 1 : -1));
      return { transactions };
    }
  );
}
