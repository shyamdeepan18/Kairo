import { FastifyPluginAsync } from 'fastify';
import { db, stockLedgerEntries, items, warehouses, journalEntryLines, journalEntries, chartOfAccounts } from '@erp/db';
import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { z } from 'zod';

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
  // All reports require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // ─── STOCK LEDGER REPORT ─────────────────────────────────────────────────────
  fastify.get('/stock-ledger', async (request, reply) => {
    try {
      const query = stockLedgerSchema.parse(request.query);
      
      const conditions = [];
      // In a real multi-tenant/multi-company app, you must enforce companyId from req.user
      // Assuming single-tenant or first company for now, or you'd get it from headers/auth.
      
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
          itemCode: items.code,
          itemName: items.name,
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

      const conditions = [];
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
      const records = await db
        .select({
          accountId: chartOfAccounts.id,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          accountType: chartOfAccounts.accountType,
          totalDebit: sql<number>`SUM(${journalEntryLines.debitAmountPaise})`.mapWith(Number),
          totalCredit: sql<number>`SUM(${journalEntryLines.creditAmountPaise})`.mapWith(Number),
        })
        .from(journalEntryLines)
        .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(
          sql`${chartOfAccounts.accountType} IN ('revenue', 'expense')`
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
      const records = await db
        .select({
          accountId: chartOfAccounts.id,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          accountType: chartOfAccounts.accountType,
          totalDebit: sql<number>`SUM(${journalEntryLines.debitAmountPaise})`.mapWith(Number),
          totalCredit: sql<number>`SUM(${journalEntryLines.creditAmountPaise})`.mapWith(Number),
        })
        .from(journalEntryLines)
        .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(
          sql`${chartOfAccounts.accountType} IN ('asset', 'liability', 'equity')`
        )
        .groupBy(chartOfAccounts.id)
        .orderBy(asc(chartOfAccounts.code));

      return records.map(r => ({
        ...r,
        balance: r.accountType === 'asset' 
          ? r.totalDebit - r.totalCredit 
          : r.totalCredit - r.totalDebit
      }));
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch Balance Sheet' });
    }
  });

  // ─── AR AGING ────────────────────────────────────────────────────────
  fastify.get('/ar-aging', async (request, reply) => {
    try {
      const query = sql`
        SELECT 
          c.name as customer_name,
          jel.party_id,
          SUM(jel.debit_amount_paise) as total_debit,
          SUM(jel.credit_amount_paise) as total_credit,
          SUM(jel.debit_amount_paise - jel.credit_amount_paise) as outstanding,
          SUM(CASE WHEN current_date - je.posting_date <= 30 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "0_30",
          SUM(CASE WHEN current_date - je.posting_date > 30 AND current_date - je.posting_date <= 60 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "31_60",
          SUM(CASE WHEN current_date - je.posting_date > 60 AND current_date - je.posting_date <= 90 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "61_90",
          SUM(CASE WHEN current_date - je.posting_date > 90 THEN jel.debit_amount_paise - jel.credit_amount_paise ELSE 0 END) as "90_plus"
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN customers c ON jel.party_id = c.id
        WHERE jel.party_type = 'customer'
        GROUP BY c.name, jel.party_id
        HAVING SUM(jel.debit_amount_paise - jel.credit_amount_paise) > 0
      `;
      const result = await db.execute(query);
      return result;
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch AR Aging' });
    }
  });

  // ─── AP AGING ────────────────────────────────────────────────────────
  fastify.get('/ap-aging', async (request, reply) => {
    try {
      const query = sql`
        SELECT 
          s.name as supplier_name,
          jel.party_id,
          SUM(jel.credit_amount_paise) as total_credit,
          SUM(jel.debit_amount_paise) as total_debit,
          SUM(jel.credit_amount_paise - jel.debit_amount_paise) as outstanding,
          SUM(CASE WHEN current_date - je.posting_date <= 30 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "0_30",
          SUM(CASE WHEN current_date - je.posting_date > 30 AND current_date - je.posting_date <= 60 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "31_60",
          SUM(CASE WHEN current_date - je.posting_date > 60 AND current_date - je.posting_date <= 90 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "61_90",
          SUM(CASE WHEN current_date - je.posting_date > 90 THEN jel.credit_amount_paise - jel.debit_amount_paise ELSE 0 END) as "90_plus"
        FROM journal_entry_lines jel
        JOIN journal_entries je ON jel.journal_entry_id = je.id
        JOIN suppliers s ON jel.party_id = s.id
        WHERE jel.party_type = 'supplier'
        GROUP BY s.name, jel.party_id
        HAVING SUM(jel.credit_amount_paise - jel.debit_amount_paise) > 0
      `;
      const result = await db.execute(query);
      return result;
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch AP Aging' });
    }
  });

  // ─── SALES REPORT ────────────────────────────────────────────────────────
  fastify.get('/sales', async (request, reply) => {
    try {
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
        ORDER BY si.posting_date DESC
      `;
      const result = await db.execute(query);
      return result;
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch Sales Report' });
    }
  });

  // ─── PURCHASES REPORT ────────────────────────────────────────────────────────
  fastify.get('/purchases', async (request, reply) => {
    try {
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
        ORDER BY pi.posting_date DESC
      `;
      const result = await db.execute(query);
      return result;
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to fetch Purchase Report' });
    }
  });
};

export default reportsRoutes;
