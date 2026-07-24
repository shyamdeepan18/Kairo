/**
 * Masters API — company-scoped master-data routes
 *
 * Registered at: /api/masters/:companyId/*
 *
 * Covers Phase 2 master data: suppliers, customers (+ addresses), items,
 * item groups, units of measure and UOM conversions.
 *
 * Mirrors the simple settings.ts pattern: authenticate + companyId URL param.
 * Heavier transactional supplier/customer endpoints (with module-licensing and
 * permission gating) also exist under /api/purchase and /api/sales; these
 * company-scoped equivalents power the Masters UI.
 */

import type { FastifyInstance } from 'fastify';
import { db } from '@erp/db';
import {
  suppliers, customers, customerAddresses,
  items, itemGroups, unitOfMeasures, uomConversions,
  purchaseOrders, purchaseInvoices, purchasePayments,
  salesOrders, salesInvoices, salesReceipts,
} from '@erp/db';
import { eq, and, asc, desc, ilike, or, isNull } from 'drizzle-orm';

const uid = (req: { user?: unknown }) => (req.user as { sub?: string; id?: string }).sub
  ?? (req.user as { id?: string }).id ?? null;

/** numeric() columns must be inserted as strings — coerce safely. */
const numOrUndef = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v));

export default async function mastersRoutes(app: FastifyInstance) {
  // ════════════════════════════════════════════════════════════════════════════
  // Suppliers
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string }; Querystring: { q?: string } }>(
    '/:companyId/suppliers',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const [row] = await db.select().from(suppliers).where(eq(suppliers.id, req.params.id)).limit(1);
      if (!row) throw app.httpErrors.notFound('Supplier not found');
      return { supplier: row };
    }
  );

  app.post<{ Params: { companyId: string }; Body: Record<string, any> }>(
    '/:companyId/suppliers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const b = req.body;
      const [row] = await db.insert(suppliers).values({
        companyId,
        supplierCode: b.supplierCode,
        name: b.name,
        legalName: b.legalName,
        supplierType: b.supplierType ?? 'registered',
        gstin: b.gstin,
        pan: b.pan,
        stateCode: b.stateCode ?? b.gstin?.slice(0, 2),
        address: b.address,
        city: b.city,
        state: b.state,
        pincode: b.pincode,
        contactPerson: b.contactPerson,
        phone: b.phone,
        email: b.email,
        paymentTermsDays: b.paymentTermsDays ?? 0,
        creditLimitPaise: b.creditLimitPaise ?? 0,
        bankAccountName: b.bankAccountName,
        bankAccountNumber: b.bankAccountNumber,
        bankIfsc: b.bankIfsc,
        bankName: b.bankName,
        createdBy: uid(req),
      }).returning();
      reply.code(201);
      return { supplier: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: Record<string, any> }>(
    '/:companyId/suppliers/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      const [row] = await db.update(suppliers)
        .set({ ...req.body, updatedBy: uid(req), updatedAt: new Date() })
        .where(eq(suppliers.id, req.params.id)).returning();
      if (!row) throw app.httpErrors.notFound('Supplier not found');
      return { supplier: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Customers (+ addresses)
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string }; Querystring: { q?: string } }>(
    '/:companyId/customers',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const [row] = await db.select().from(customers).where(eq(customers.id, req.params.id)).limit(1);
      if (!row) throw app.httpErrors.notFound('Customer not found');
      const addresses = await db.select().from(customerAddresses)
        .where(eq(customerAddresses.customerId, req.params.id));
      return { customer: row, addresses };
    }
  );

  app.post<{ Params: { companyId: string }; Body: Record<string, any> }>(
    '/:companyId/customers',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const b = req.body;
      const [row] = await db.insert(customers).values({
        companyId,
        customerCode: b.customerCode,
        name: b.name,
        legalName: b.legalName,
        customerType: b.customerType ?? 'registered',
        gstin: b.gstin,
        pan: b.pan,
        stateCode: b.stateCode ?? b.gstin?.slice(0, 2),
        contactPerson: b.contactPerson,
        phone: b.phone,
        email: b.email,
        paymentTermsDays: b.paymentTermsDays ?? 0,
        creditLimitPaise: b.creditLimitPaise ?? 0,
        defaultDiscountPercent: numOrUndef(b.defaultDiscountPercent) ?? '0',
        bankAccountName: b.bankAccountName,
        bankAccountNumber: b.bankAccountNumber,
        bankIfsc: b.bankIfsc,
        bankName: b.bankName,
        createdBy: uid(req),
      }).returning();
      reply.code(201);
      return { customer: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: Record<string, any> }>(
    '/:companyId/customers/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      const [row] = await db.update(customers)
        .set({ ...req.body, updatedBy: uid(req), updatedAt: new Date() })
        .where(eq(customers.id, req.params.id)).returning();
      if (!row) throw app.httpErrors.notFound('Customer not found');
      return { customer: row };
    }
  );

  app.post<{ Params: { companyId: string; id: string }; Body: Record<string, any> }>(
    '/:companyId/customers/:id/addresses',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId, id } = req.params;
      const b = req.body;
      const [row] = await db.insert(customerAddresses).values({
        companyId,
        customerId: id,
        addressType: b.addressType ?? 'both',
        label: b.label,
        gstin: b.gstin,
        stateCode: b.stateCode,
        address: b.address,
        city: b.city,
        state: b.state,
        pincode: b.pincode,
        contactPerson: b.contactPerson,
        phone: b.phone,
        isDefault: b.isDefault ?? false,
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const list = await db.select().from(itemGroups)
        .where(eq(itemGroups.companyId, req.params.companyId))
        .orderBy(asc(itemGroups.code));
      return { itemGroups: list };
    }
  );

  app.post<{ Params: { companyId: string }; Body: { code: string; name: string; parentId?: string } }>(
    '/:companyId/item-groups',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const [row] = await db.insert(itemGroups).values({
        companyId, code: req.body.code, name: req.body.name, parentId: req.body.parentId ?? null,
      }).returning();
      reply.code(201);
      return { itemGroup: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: { name?: string; parentId?: string | null; isActive?: boolean } }>(
    '/:companyId/item-groups/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      const [row] = await db.update(itemGroups)
        .set({ ...req.body })
        .where(eq(itemGroups.id, req.params.id)).returning();
      if (!row) throw app.httpErrors.notFound('Item group not found');
      return { itemGroup: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Units of measure (global master) + conversions (company-scoped)
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string } }>(
    '/:companyId/uom',
    { preHandler: [app.authenticate] },
    async (req) => {
      const list = await db.select().from(unitOfMeasures).orderBy(asc(unitOfMeasures.code));
      const conversions = await db.select().from(uomConversions)
        .where(or(eq(uomConversions.companyId, req.params.companyId), isNull(uomConversions.companyId)));
      return { uom: list, conversions };
    }
  );

  app.post<{ Params: { companyId: string }; Body: { code: string; name: string; type: string } }>(
    '/:companyId/uom',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const [row] = await db.insert(unitOfMeasures).values({
        code: req.body.code.toUpperCase(), name: req.body.name, type: req.body.type,
      }).returning();
      reply.code(201);
      return { uom: row };
    }
  );

  app.post<{ Params: { companyId: string }; Body: { fromUom: string; toUom: string; factor: number; itemId?: string } }>(
    '/:companyId/uom-conversions',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const b = req.body;
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { companyId } = req.params;
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const [row] = await db.select().from(items).where(eq(items.id, req.params.id)).limit(1);
      if (!row) throw app.httpErrors.notFound('Item not found');
      return { item: row };
    }
  );

  app.post<{ Params: { companyId: string }; Body: Record<string, any> }>(
    '/:companyId/items',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { companyId } = req.params;
      const b = req.body;
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
        isStockItem: b.isStockItem ?? true,
        trackingType: b.trackingType ?? 'none',
        valuationMethod: b.valuationMethod ?? 'weighted_average',
        standardCostPaise: b.standardCostPaise ?? 0,
        reorderLevelQty: numOrUndef(b.reorderLevelQty) ?? '0',
        reorderQty: numOrUndef(b.reorderQty) ?? '0',
        leadTimeDays: b.leadTimeDays ?? 0,
        minOrderQty: numOrUndef(b.minOrderQty) ?? '1',
        createdBy: uid(req),
      }).returning();
      reply.code(201);
      return { item: row };
    }
  );

  app.patch<{ Params: { companyId: string; id: string }; Body: Record<string, any> }>(
    '/:companyId/items/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      const b = { ...req.body };
      for (const k of ['conversionFactor', 'reorderLevelQty', 'reorderQty', 'minOrderQty']) {
        if (k in b) b[k] = numOrUndef(b[k]);
      }
      const [row] = await db.update(items)
        .set({ ...b, updatedBy: uid(req), updatedAt: new Date() })
        .where(eq(items.id, req.params.id)).returning();
      if (!row) throw app.httpErrors.notFound('Item not found');
      return { item: row };
    }
  );

  // ════════════════════════════════════════════════════════════════════════════
  // Party transactions (read-only aggregation across document tables)
  // ════════════════════════════════════════════════════════════════════════════

  app.get<{ Params: { companyId: string; id: string } }>(
    '/:companyId/suppliers/:id/transactions',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = req.params;
      const [pos, invs, pays] = await Promise.all([
        db.select({
          documentNumber: purchaseOrders.documentNumber, postingDate: purchaseOrders.postingDate,
          status: purchaseOrders.status, amountPaise: purchaseOrders.totalAmountPaise,
        }).from(purchaseOrders).where(eq(purchaseOrders.supplierId, id))
          .orderBy(desc(purchaseOrders.postingDate)).limit(50),
        db.select({
          documentNumber: purchaseInvoices.documentNumber, postingDate: purchaseInvoices.postingDate,
          status: purchaseInvoices.status, amountPaise: purchaseInvoices.totalAmountPaise,
        }).from(purchaseInvoices).where(eq(purchaseInvoices.supplierId, id))
          .orderBy(desc(purchaseInvoices.postingDate)).limit(50),
        db.select({
          documentNumber: purchasePayments.documentNumber, postingDate: purchasePayments.postingDate,
          status: purchasePayments.status, amountPaise: purchasePayments.paidAmountPaise,
        }).from(purchasePayments).where(eq(purchasePayments.supplierId, id))
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
    { preHandler: [app.authenticate] },
    async (req) => {
      const { id } = req.params;
      const [sos, invs, recs] = await Promise.all([
        db.select({
          documentNumber: salesOrders.documentNumber, postingDate: salesOrders.postingDate,
          status: salesOrders.status, amountPaise: salesOrders.totalAmountPaise,
        }).from(salesOrders).where(eq(salesOrders.customerId, id))
          .orderBy(desc(salesOrders.postingDate)).limit(50),
        db.select({
          documentNumber: salesInvoices.documentNumber, postingDate: salesInvoices.postingDate,
          status: salesInvoices.status, amountPaise: salesInvoices.totalAmountPaise,
        }).from(salesInvoices).where(eq(salesInvoices.customerId, id))
          .orderBy(desc(salesInvoices.postingDate)).limit(50),
        db.select({
          documentNumber: salesReceipts.documentNumber, postingDate: salesReceipts.postingDate,
          status: salesReceipts.status, amountPaise: salesReceipts.receivedAmountPaise,
        }).from(salesReceipts).where(eq(salesReceipts.customerId, id))
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
