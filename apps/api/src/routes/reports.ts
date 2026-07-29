import { FastifyPluginAsync } from 'fastify';
import { db, stockLedgerEntries, items, warehouses, journalEntryLines, journalEntries, chartOfAccounts } from '@erp/db';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';

const stockLedgerSchema = z.object({
  itemId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const generalLedgerSchema = z.object({
  accountId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // All reports require authentication AND a selected tenant context. Every
  // query below is filtered by the active company id — reports must never leak
  // another tenant's financial data.
  fastify.addHook('onRequest', fastify.authenticate);
  fastify.addHook('onRequest', resolveTenantContext);

  // ─── STOCK LEDGER REPORT ─────────────────────────────────────────────────────
  fastify.get('/stock-ledger', async (request, reply) => {
    try {
      const query = stockLedgerSchema.parse(request.query);
      const { companyId } = tenant(request);

      // Tenant scope is mandatory and comes first — never trust client input for it.
      const conditions = [eq(stockLedgerEntries.companyId, companyId)];

      if (query.itemId) conditions.push(eq(stockLedgerEntries.itemId, query.itemId));
      if (query.warehouseId) conditions.push(eq(stockLedgerEntries.warehouseId, query.warehouseId));
      if (query.startDate) conditions.push(gte(stockLedgerEntries.postingDate, query.startDate));
      if (query.endDate) conditions.push(lte(stockLedgerEntries.postingDate, query.endDate));

      const records = await db
        .select({
          id: stockLedgerEntries.id,
          postingDate: stockLedgerEntries.postingDate,
          documentType: stockLedgerEntries.documentType,
          documentNumber: stockLedgerEntries.documentNumber,
          movementType: stockLedgerEntries.movementType,
          quantity: stockLedgerEntries.quantity,
          quantityInPrimaryUom: stockLedgerEntries.quantityInPrimaryUom,
          valuationRatePaise: stockLedgerEntries.valuationRatePaise,
          valuationAmountPaise: stockLedgerEntries.valuationAmountPaise,
          isReversal: stockLedgerEntries.isReversal,
          itemCode: items.itemCode,
          itemName: items.itemName,
          warehouseName: warehouses.name,
        })
        .from(stockLedgerEntries)
        .innerJoin(items, eq(stockLedgerEntries.itemId, items.id))
        .innerJoin(warehouses, eq(stockLedgerEntries.warehouseId, warehouses.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(stockLedgerEntries.postingDate), asc(stockLedgerEntries.createdAt));
      
      return records;
    } catch (error) {
      request.log.error(error);
      reply.status(400).send({ error: 'Invalid query parameters' });
    }
  });

  // ─── GENERAL LEDGER REPORT ───────────────────────────────────────────────────
  fastify.get('/general-ledger', async (request, reply) => {
    try {
      const query = generalLedgerSchema.parse(request.query);
      const { companyId } = tenant(request);

      // Scope through the tenant-owned parent (journal_entry_lines has no companyId).
      const conditions = [eq(journalEntries.companyId, companyId)];
      if (query.accountId) conditions.push(eq(journalEntryLines.accountId, query.accountId));
      if (query.startDate) conditions.push(gte(journalEntries.postingDate, query.startDate));
      if (query.endDate) conditions.push(lte(journalEntries.postingDate, query.endDate));

      const records = await db
        .select({
          id: journalEntryLines.id,
          postingDate: journalEntries.postingDate,
          entryNumber: journalEntries.entryNumber,
          documentType: journalEntries.documentType,
          documentNumber: journalEntries.documentNumber,
          narration: journalEntries.narration,
          lineNarration: journalEntryLines.narration,
          debitAmountPaise: journalEntryLines.debitAmountPaise,
          creditAmountPaise: journalEntryLines.creditAmountPaise,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
        })
        .from(journalEntryLines)
        .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
        .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(journalEntries.postingDate), asc(journalEntries.createdAt));

      return records;
    } catch (error) {
      request.log.error(error);
      reply.status(400).send({ error: 'Invalid query parameters' });
    }
  });

  // ─── PROFIT & LOSS ────────────────────────────────────────────────────────
  fastify.get('/profit-loss', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const records = await db
        .select({
          accountId: chartOfAccounts.id,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          accountType: chartOfAccounts.accountType,
          totalDebit: sql<number>`COALESCE(SUM(CASE WHEN ${journalEntries.companyId} = ${companyId} THEN ${journalEntryLines.debitAmountPaise} ELSE 0 END), 0)`.mapWith(Number),
          totalCredit: sql<number>`COALESCE(SUM(CASE WHEN ${journalEntries.companyId} = ${companyId} THEN ${journalEntryLines.creditAmountPaise} ELSE 0 END), 0)`.mapWith(Number),
        })
        .from(chartOfAccounts)
        .leftJoin(journalEntryLines, eq(chartOfAccounts.id, journalEntryLines.accountId))
        .leftJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
        .where(
          and(
            eq(chartOfAccounts.companyId, companyId),
            eq(chartOfAccounts.isGroup, false),
            sql`${chartOfAccounts.accountType} IN ('revenue', 'expense')`,
          )
        )
        .groupBy(chartOfAccounts.id)
        .orderBy(asc(chartOfAccounts.code));

      return records.map(r => ({
        ...r,
        balance: r.accountType === 'revenue' 
          ? r.totalCredit - r.totalDebit 
          : r.totalDebit - r.totalCredit
      }));
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch P&L' });
    }
  });

  // ─── BALANCE SHEET ────────────────────────────────────────────────────────
  fastify.get('/balance-sheet', async (request, reply) => {
    try {
      const { companyId } = tenant(request);

      // 1. Fetch all asset, liability, equity non-group accounts with posted amounts
      const records = await db
        .select({
          accountId: chartOfAccounts.id,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          accountType: chartOfAccounts.accountType,
          totalDebit: sql<number>`COALESCE(SUM(CASE WHEN ${journalEntries.companyId} = ${companyId} THEN ${journalEntryLines.debitAmountPaise} ELSE 0 END), 0)`.mapWith(Number),
          totalCredit: sql<number>`COALESCE(SUM(CASE WHEN ${journalEntries.companyId} = ${companyId} THEN ${journalEntryLines.creditAmountPaise} ELSE 0 END), 0)`.mapWith(Number),
        })
        .from(chartOfAccounts)
        .leftJoin(journalEntryLines, eq(chartOfAccounts.id, journalEntryLines.accountId))
        .leftJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
        .where(
          and(
            eq(chartOfAccounts.companyId, companyId),
            eq(chartOfAccounts.isGroup, false),
            sql`${chartOfAccounts.accountType} IN ('asset', 'liability', 'equity')`,
          )
        )
        .groupBy(chartOfAccounts.id)
        .orderBy(asc(chartOfAccounts.code));

      // 2. Fetch Net Profit from Revenue and Expense accounts for Equity balancing
      const plRecords = await db
        .select({
          accountType: chartOfAccounts.accountType,
          totalDebit: sql<number>`COALESCE(SUM(CASE WHEN ${journalEntries.companyId} = ${companyId} THEN ${journalEntryLines.debitAmountPaise} ELSE 0 END), 0)`.mapWith(Number),
          totalCredit: sql<number>`COALESCE(SUM(CASE WHEN ${journalEntries.companyId} = ${companyId} THEN ${journalEntryLines.creditAmountPaise} ELSE 0 END), 0)`.mapWith(Number),
        })
        .from(chartOfAccounts)
        .leftJoin(journalEntryLines, eq(chartOfAccounts.id, journalEntryLines.accountId))
        .leftJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
        .where(
          and(
            eq(chartOfAccounts.companyId, companyId),
            eq(chartOfAccounts.isGroup, false),
            sql`${chartOfAccounts.accountType} IN ('revenue', 'expense')`,
          )
        )
        .groupBy(chartOfAccounts.id);

      let netProfitPaise = 0;
      for (const r of plRecords) {
        if (r.accountType === 'revenue') netProfitPaise += (r.totalCredit - r.totalDebit);
        if (r.accountType === 'expense') netProfitPaise -= (r.totalDebit - r.totalCredit);
      }

      const result = records.map(r => ({
        ...r,
        balance: r.accountType === 'asset' 
          ? r.totalDebit - r.totalCredit 
          : r.totalCredit - r.totalDebit
      }));

      if (netProfitPaise !== 0) {
        result.push({
          accountId: 'net-profit-current-period',
          accountCode: '3999',
          accountName: 'Current Period Net Profit / (Loss)',
          accountType: 'equity',
          totalDebit: netProfitPaise < 0 ? Math.abs(netProfitPaise) : 0,
          totalCredit: netProfitPaise > 0 ? netProfitPaise : 0,
          balance: netProfitPaise,
        });
      }

      return result;
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch Balance Sheet' });
    }
  });

  // ─── AR AGING ────────────────────────────────────────────────────────
  fastify.get('/ar-aging', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const query = sql`
        SELECT
          c.id as party_id,
          c.name as customer_name,
          COALESCE(SUM(si.total_amount_paise), 0) as total_debit,
          COALESCE(SUM(COALESCE(si.received_amount_paise, 0)), 0) as total_credit,
          COALESCE(SUM(si.total_amount_paise - COALESCE(si.received_amount_paise, 0)), 0) as outstanding,
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(si.posting_date AS DATE) <= 30 THEN si.total_amount_paise - COALESCE(si.received_amount_paise, 0) ELSE 0 END), 0) as "0_30",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(si.posting_date AS DATE) > 30 AND CURRENT_DATE - CAST(si.posting_date AS DATE) <= 60 THEN si.total_amount_paise - COALESCE(si.received_amount_paise, 0) ELSE 0 END), 0) as "31_60",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(si.posting_date AS DATE) > 60 AND CURRENT_DATE - CAST(si.posting_date AS DATE) <= 90 THEN si.total_amount_paise - COALESCE(si.received_amount_paise, 0) ELSE 0 END), 0) as "61_90",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(si.posting_date AS DATE) > 90 THEN si.total_amount_paise - COALESCE(si.received_amount_paise, 0) ELSE 0 END), 0) as "90_plus"
        FROM customers c
        LEFT JOIN sales_invoices si ON c.id = si.customer_id AND si.company_id = ${companyId} AND si.status = 'approved'
        WHERE c.company_id = ${companyId}
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
      `;
      const result: any = await db.execute(query);
      return Array.isArray(result) ? result : (result.rows ?? []);
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch AR Aging' });
    }
  });

  // ─── AP AGING ────────────────────────────────────────────────────────
  fastify.get('/ap-aging', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const query = sql`
        SELECT
          s.id as party_id,
          s.name as supplier_name,
          COALESCE(SUM(pi.total_amount_paise), 0) as total_credit,
          COALESCE(SUM(COALESCE(pi.paid_amount_paise, 0)), 0) as total_debit,
          COALESCE(SUM(pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0)), 0) as outstanding,
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(pi.posting_date AS DATE) <= 30 THEN pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0) ELSE 0 END), 0) as "0_30",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(pi.posting_date AS DATE) > 30 AND CURRENT_DATE - CAST(pi.posting_date AS DATE) <= 60 THEN pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0) ELSE 0 END), 0) as "31_60",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(pi.posting_date AS DATE) > 60 AND CURRENT_DATE - CAST(pi.posting_date AS DATE) <= 90 THEN pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0) ELSE 0 END), 0) as "61_90",
          COALESCE(SUM(CASE WHEN CURRENT_DATE - CAST(pi.posting_date AS DATE) > 90 THEN pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0) ELSE 0 END), 0) as "90_plus"
        FROM suppliers s
        LEFT JOIN purchase_invoices pi ON s.id = pi.supplier_id AND pi.company_id = ${companyId} AND pi.status = 'approved'
        WHERE s.company_id = ${companyId}
        GROUP BY s.id, s.name
        ORDER BY s.name ASC
      `;
      const result: any = await db.execute(query);
      return Array.isArray(result) ? result : (result.rows ?? []);
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch AP Aging' });
    }
  });

  // ─── SALES REPORT ────────────────────────────────────────────────────────
  fastify.get('/sales', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const query = sql`
        SELECT
          si.document_number,
          si.posting_date,
          c.name as customer_name,
          si.net_amount_paise,
          si.tax_amount_paise,
          si.total_amount_paise,
          si.payment_status
        FROM sales_invoices si
        JOIN customers c ON si.customer_id = c.id
        WHERE si.company_id = ${companyId}
        ORDER BY si.posting_date DESC
      `;
      const result: any = await db.execute(query);
      return Array.isArray(result) ? result : (result.rows ?? []);
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch Sales Report' });
    }
  });

  // ─── PURCHASES REPORT ────────────────────────────────────────────────────────
  fastify.get('/purchases', async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const query = sql`
        SELECT
          pi.document_number,
          pi.posting_date,
          s.name as supplier_name,
          pi.supplier_invoice_number,
          pi.net_amount_paise,
          pi.tax_amount_paise,
          pi.total_amount_paise,
          pi.payment_status
        FROM purchase_invoices pi
        JOIN suppliers s ON pi.supplier_id = s.id
        WHERE pi.company_id = ${companyId}
        ORDER BY pi.posting_date DESC
      `;
      const result: any = await db.execute(query);
      return Array.isArray(result) ? result : (result.rows ?? []);
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch Purchase Report' });
    }
  });
};

export default reportsRoutes;
