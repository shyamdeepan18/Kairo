import type { FastifyPluginAsync } from 'fastify';
import {
  db,
  journalEntries, journalEntryLines, chartOfAccounts, auditLogs,
  bankAccounts, bankStatements, bankStatementLines, bankReconciliations,
  projects, salesInvoices, purchaseInvoices, stockLedgerEntries, customers,
} from '@erp/db';
import { eq, and, desc, asc, gte, lte, sql, ne } from 'drizzle-orm';
import {
  createJvSchema, bankAccountCreateSchema, bankStatementImportSchema, bankReconcilePairsSchema,
  projectCreateSchema, projectUpdateSchema,
} from '@erp/shared';
import { resolveTenantContext, tenant } from '../middleware/tenant-context.js';
import { authorize } from '../middleware/authorize.js';
import { fiscalPeriod } from '../services/posting-engine.js';

export const accountingRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', resolveTenantContext);

  // ─── LIST JOURNAL VOUCHERS ────────────────────────────────────────────────
  app.get('/jv', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const q = request.query as { startDate?: string; endDate?: string; documentType?: string };

      const conditions = [eq(journalEntries.companyId, companyId)];
      if (q.documentType) {
        conditions.push(eq(journalEntries.documentType, q.documentType));
      } else {
        conditions.push(eq(journalEntries.documentType, 'accounting.jv'));
      }
      if (q.startDate) conditions.push(gte(journalEntries.postingDate, q.startDate as any));
      if (q.endDate) conditions.push(lte(journalEntries.postingDate, q.endDate as any));

      const records = await db
        .select({
          id: journalEntryLines.id,
          journalEntryId: journalEntries.id,
          postingDate: journalEntries.postingDate,
          entryNumber: journalEntries.entryNumber,
          documentType: journalEntries.documentType,
          documentNumber: journalEntries.documentNumber,
          narration: journalEntries.narration,
          lineNarration: journalEntryLines.narration,
          debitAmountPaise: journalEntryLines.debitAmountPaise,
          creditAmountPaise: journalEntryLines.creditAmountPaise,
          accountId: journalEntryLines.accountId,
          accountCode: chartOfAccounts.code,
          accountName: chartOfAccounts.name,
          partyType: journalEntryLines.partyType,
          partyId: journalEntryLines.partyId,
          createdAt: journalEntries.createdAt,
        })
        .from(journalEntryLines)
        .innerJoin(journalEntries, eq(journalEntryLines.journalEntryId, journalEntries.id))
        .innerJoin(chartOfAccounts, eq(journalEntryLines.accountId, chartOfAccounts.id))
        .where(and(...conditions))
        .orderBy(desc(journalEntries.postingDate), desc(journalEntries.createdAt));

      return records;
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch journal vouchers' });
    }
  });

  // ─── CREATE JOURNAL VOUCHER (MANUAL JV) ────────────────────────────────────
  app.post('/jv', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    const parseResult = createJvSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const body = parseResult.data;
    const { companyId, activePlantId } = tenant(request);
    const userId = (request.user as { id?: string; sub?: string }).id ??
      (request.user as { sub?: string }).sub!;

    // Validate that all accounts exist and are active
    const accountIds = [...new Set(body.lines.map((l) => l.accountId))];
    const existingAccounts = await db
      .select({ id: chartOfAccounts.id, isActive: chartOfAccounts.isActive })
      .from(chartOfAccounts)
      .where(and(
        eq(chartOfAccounts.companyId, companyId),
      ));

    const existingAccountMap = new Map(existingAccounts.map((a) => [a.id, a]));
    for (const accId of accountIds) {
      const acc = existingAccountMap.get(accId);
      if (!acc) {
        return reply.code(400).send({
          error: `Account ID ${accId} not found in Chart of Accounts for this company`,
        });
      }
      if (!acc.isActive) {
        return reply.code(400).send({
          error: `Account ID ${accId} is inactive`,
        });
      }
    }

    const { fiscalYear, period } = fiscalPeriod(new Date(body.postingDate));

    // Wrap in atomic transaction per ERP Rule 2.3
    const result = await db.transaction(async (tx) => {
      const entryNumber = await app.numberSeriesService.next(
        tx,
        companyId,
        'accounting.jv',
        { fiscalYear }
      );

      const [entry] = await tx
        .insert(journalEntries)
        .values({
          companyId,
          plantId: activePlantId ?? null,
          documentType: 'accounting.jv',
          documentId: null,
          documentNumber: entryNumber,
          entryNumber,
          postingDate: body.postingDate as any,
          fiscalYear,
          period,
          currency: 'INR',
          narration: body.narration ?? null,
          status: 'posted',
          createdBy: userId,
        })
        .returning();

      const lineValues = body.lines.map((l, index) => ({
        journalEntryId: entry.id,
        lineNumber: index + 1,
        accountId: l.accountId,
        debitAmountPaise: l.debitAmountPaise,
        creditAmountPaise: l.creditAmountPaise,
        narration: l.narration ?? null,
        partyType: l.partyType ?? null,
        partyId: l.partyId ?? null,
      }));

      await tx.insert(journalEntryLines).values(lineValues);

      // Audit log entry
      const totalAmountPaise = body.lines.reduce((acc, l) => acc + l.debitAmountPaise, 0);
      await tx.insert(auditLogs).values({
        companyId,
        userId,
        action: 'CREATE',
        entity: 'journal_entry',
        entityId: entry.id,
        details: {
          entryNumber,
          documentType: 'accounting.jv',
          totalAmountPaise,
          lineCount: body.lines.length,
        },
      });

      return entry;
    });

    return reply.code(201).send({
      success: true,
      data: result,
    });
  });

  // ─── BANK ACCOUNTS MASTER ──────────────────────────────────────────────────
  app.get('/bank-accounts', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request) => {
    const { companyId } = tenant(request);
    const rows = await db
      .select({
        id: bankAccounts.id,
        accountName: bankAccounts.accountName,
        bankName: bankAccounts.bankName,
        accountNumber: bankAccounts.accountNumber,
        ifscCode: bankAccounts.ifscCode,
        branch: bankAccounts.branch,
        accountType: bankAccounts.accountType,
        coaAccountId: bankAccounts.coaAccountId,
        coaCode: chartOfAccounts.code,
        coaName: chartOfAccounts.name,
        openingBalancePaise: bankAccounts.openingBalancePaise,
        isDefault: bankAccounts.isDefault,
        isActive: bankAccounts.isActive,
      })
      .from(bankAccounts)
      .leftJoin(chartOfAccounts, eq(bankAccounts.coaAccountId, chartOfAccounts.id))
      .where(eq(bankAccounts.companyId, companyId))
      .orderBy(desc(bankAccounts.isDefault), asc(bankAccounts.bankName));
    return { bankAccounts: rows };
  });

  app.post('/bank-accounts', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    const parse = bankAccountCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const { companyId } = tenant(request);
    const userId = (request.user as any).id ?? (request.user as any).sub!;
    const body = parse.data;

    const [coa] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, body.coaAccountId), eq(chartOfAccounts.companyId, companyId)))
      .limit(1);
    if (!coa) {
      return reply.code(400).send({ error: 'Selected COA account does not exist in chart of accounts' });
    }

    const [account] = await db
      .insert(bankAccounts)
      .values({
        companyId,
        accountName: body.accountName,
        bankName: body.bankName,
        accountNumber: body.accountNumber,
        ifscCode: body.ifscCode ?? null,
        branch: body.branch ?? null,
        accountType: body.accountType,
        coaAccountId: body.coaAccountId,
        openingBalancePaise: body.openingBalancePaise,
        isDefault: body.isDefault,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning();

    await db.insert(auditLogs).values({
      companyId,
      userId,
      action: 'CREATE',
      entity: 'bank_account',
      entityId: account.id,
      details: {
        accountNumber: account.accountNumber,
        bankName: account.bankName,
      },
    });

    return reply.code(201).send({ bankAccount: account });
  });

  // ─── BANK STATEMENTS (API FEED / IMPORT) ───────────────────────────────────
  app.get('/bank-statements', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request) => {
    const { companyId } = tenant(request);
    const q = request.query as { bankAccountId?: string };

    const conditions = [eq(bankStatements.companyId, companyId)];
    if (q.bankAccountId) {
      const [ba] = await db.select().from(bankAccounts).where(and(eq(bankAccounts.id, q.bankAccountId), eq(bankAccounts.companyId, companyId))).limit(1);
      const targetCoaId = ba ? ba.coaAccountId : q.bankAccountId;
      conditions.push(eq(bankStatements.bankAccountId, targetCoaId));
    }

    const stmts = await db
      .select({
        id: bankStatements.id,
        statementDate: bankStatements.statementDate,
        openingBalance: bankStatements.openingBalance,
        closingBalance: bankStatements.closingBalance,
        status: bankStatements.status,
        bankAccountId: bankStatements.bankAccountId,
        coaCode: chartOfAccounts.code,
        coaName: chartOfAccounts.name,
        createdAt: bankStatements.createdAt,
      })
      .from(bankStatements)
      .leftJoin(chartOfAccounts, eq(bankStatements.bankAccountId, chartOfAccounts.id))
      .where(and(...conditions))
      .orderBy(desc(bankStatements.statementDate));

    const result = await Promise.all(
      stmts.map(async (s) => {
        const lines = await db
          .select({
            id: bankStatementLines.id,
            reconciliationStatus: bankStatementLines.reconciliationStatus,
          })
          .from(bankStatementLines)
          .where(eq(bankStatementLines.statementId, s.id));

        const totalLines = lines.length;
        const reconciledLines = lines.filter((l) => l.reconciliationStatus === 'reconciled').length;
        return {
          ...s,
          totalLines,
          reconciledLines,
        };
      })
    );

    return { bankStatements: result };
  });

  app.get('/bank-statements/:id', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { companyId } = tenant(request);

    const [stmt] = await db
      .select({
        id: bankStatements.id,
        statementDate: bankStatements.statementDate,
        openingBalance: bankStatements.openingBalance,
        closingBalance: bankStatements.closingBalance,
        status: bankStatements.status,
        bankAccountId: bankStatements.bankAccountId,
        coaCode: chartOfAccounts.code,
        coaName: chartOfAccounts.name,
      })
      .from(bankStatements)
      .leftJoin(chartOfAccounts, eq(bankStatements.bankAccountId, chartOfAccounts.id))
      .where(and(eq(bankStatements.id, id), eq(bankStatements.companyId, companyId)))
      .limit(1);

    if (!stmt) return reply.code(404).send({ error: 'Statement not found' });

    const lines = await db
      .select({
        id: bankStatementLines.id,
        date: bankStatementLines.date,
        description: bankStatementLines.description,
        amountPaise: bankStatementLines.amountPaise,
        reference: bankStatementLines.reference,
        reconciliationStatus: bankStatementLines.reconciliationStatus,
      })
      .from(bankStatementLines)
      .where(eq(bankStatementLines.statementId, id))
      .orderBy(asc(bankStatementLines.date));

    return { statement: stmt, lines };
  });

  app.post('/bank-statements/import', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    const parse = bankStatementImportSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const { companyId } = tenant(request);
    const userId = (request.user as any).id ?? (request.user as any).sub!;
    const body = parse.data;

    let targetCoaId = body.bankAccountId;
    const [ba] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, body.bankAccountId), eq(bankAccounts.companyId, companyId)))
      .limit(1);
    if (ba) {
      targetCoaId = ba.coaAccountId;
    }

    const [coa] = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.id, targetCoaId), eq(chartOfAccounts.companyId, companyId)))
      .limit(1);
    if (!coa) {
      return reply.code(400).send({ error: 'Target bank COA account not found' });
    }

    const created = await db.transaction(async (tx) => {
      const [stmt] = await tx
        .insert(bankStatements)
        .values({
          companyId,
          bankAccountId: targetCoaId,
          statementDate: body.statementDate as any,
          openingBalance: body.openingBalancePaise,
          closingBalance: body.closingBalancePaise,
          status: 'draft',
        })
        .returning();

      const lineValues = body.lines.map((l) => ({
        statementId: stmt.id,
        date: l.date as any,
        description: l.description ?? null,
        amountPaise: l.amountPaise,
        reference: l.reference ?? null,
        reconciliationStatus: 'unreconciled' as const,
      }));

      await tx.insert(bankStatementLines).values(lineValues);

      await tx.insert(auditLogs).values({
        companyId,
        userId,
        action: 'CREATE',
        entity: 'bank_statement',
        entityId: stmt.id,
        details: {
          statementDate: body.statementDate,
          lineCount: body.lines.length,
          coaAccountId: targetCoaId,
        },
      });

      return stmt;
    });

    return reply.code(201).send({ success: true, statement: created });
  });

  // ─── BANK RECONCILIATION MATCHING ENGINE ───────────────────────────────────
  app.get('/bank-reconciliation/candidates', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request, reply) => {
    const { companyId } = tenant(request);
    const q = request.query as { bankAccountId?: string; statementId?: string };

    if (!q.bankAccountId && !q.statementId) {
      return reply.code(400).send({ error: 'bankAccountId or statementId is required' });
    }

    let targetCoaId = q.bankAccountId;
    if (q.bankAccountId) {
      const [ba] = await db
        .select()
        .from(bankAccounts)
        .where(and(eq(bankAccounts.id, q.bankAccountId), eq(bankAccounts.companyId, companyId)))
        .limit(1);
      if (ba) targetCoaId = ba.coaAccountId;
    } else if (q.statementId) {
      const [st] = await db.select().from(bankStatements).where(eq(bankStatements.id, q.statementId)).limit(1);
      if (st) targetCoaId = st.bankAccountId;
    }

    if (!targetCoaId) {
      return reply.code(400).send({ error: 'Could not resolve bank account' });
    }

    const stmtLineConditions = [eq(bankStatementLines.reconciliationStatus, 'unreconciled')];
    if (q.statementId) {
      stmtLineConditions.push(eq(bankStatementLines.statementId, q.statementId));
    }

    const stmtLines = await db
      .select({
        id: bankStatementLines.id,
        statementId: bankStatementLines.statementId,
        date: bankStatementLines.date,
        description: bankStatementLines.description,
        amountPaise: bankStatementLines.amountPaise,
        reference: bankStatementLines.reference,
        reconciliationStatus: bankStatementLines.reconciliationStatus,
      })
      .from(bankStatementLines)
      .innerJoin(bankStatements, eq(bankStatementLines.statementId, bankStatements.id))
      .where(and(eq(bankStatements.companyId, companyId), eq(bankStatements.bankAccountId, targetCoaId), ...stmtLineConditions))
      .orderBy(asc(bankStatementLines.date));

    const reconciledJeLines = await db
      .select({ id: bankReconciliations.journalEntryLineId })
      .from(bankReconciliations);
    const reconciledIdSet = new Set(reconciledJeLines.map((r) => r.id));

    const allGlLines = await db
      .select({
        id: journalEntryLines.id,
        journalEntryId: journalEntries.id,
        postingDate: journalEntries.postingDate,
        documentNumber: journalEntries.documentNumber,
        documentType: journalEntries.documentType,
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
      .where(and(eq(journalEntries.companyId, companyId), eq(journalEntryLines.accountId, targetCoaId)))
      .orderBy(desc(journalEntries.postingDate));

    const unreconciledGlLines = allGlLines.filter((gl) => !reconciledIdSet.has(gl.id));

    const suggestedMatches: Array<{ statementLineId: string; journalEntryLineId: string; confidence: 'exact' | 'high' }> = [];
    const matchedGl = new Set<string>();

    for (const sl of stmtLines) {
      const isDeposit = sl.amountPaise > 0;
      const targetPaise = Math.abs(sl.amountPaise);

      const candidate = unreconciledGlLines.find((gl) => {
        if (matchedGl.has(gl.id)) return false;
        const glAmount = isDeposit ? gl.debitAmountPaise : gl.creditAmountPaise;
        return glAmount === targetPaise;
      });

      if (candidate) {
        matchedGl.add(candidate.id);
        suggestedMatches.push({
          statementLineId: sl.id,
          journalEntryLineId: candidate.id,
          confidence: 'exact',
        });
      }
    }

    return {
      statementLines: stmtLines,
      glLines: unreconciledGlLines,
      suggestedMatches,
    };
  });

  app.post('/bank-reconciliation/reconcile', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    const parse = bankReconcilePairsSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'Validation failed', details: parse.error.flatten() });
    }
    const { companyId } = tenant(request);
    const userId = (request.user as any).id ?? (request.user as any).sub!;
    const { pairs } = parse.data;

    try {
      const result = await db.transaction(async (tx) => {
        const affectedStatementIds = new Set<string>();

        for (const pair of pairs) {
          const [sl] = await tx
            .select()
            .from(bankStatementLines)
            .where(eq(bankStatementLines.id, pair.statementLineId))
            .limit(1);
          if (!sl) throw new Error(`Statement line ${pair.statementLineId} not found`);
          if (sl.reconciliationStatus === 'reconciled') {
            throw new Error(`Statement line ${pair.statementLineId} is already reconciled`);
          }

          const [gl] = await tx
            .select()
            .from(journalEntryLines)
            .where(eq(journalEntryLines.id, pair.journalEntryLineId))
            .limit(1);
          if (!gl) throw new Error(`Journal entry line ${pair.journalEntryLineId} not found`);

          await tx.insert(bankReconciliations).values({
            statementLineId: pair.statementLineId,
            journalEntryLineId: pair.journalEntryLineId,
          });

          await tx
            .update(bankStatementLines)
            .set({ reconciliationStatus: 'reconciled' })
            .where(eq(bankStatementLines.id, pair.statementLineId));

          affectedStatementIds.add(sl.statementId);
        }

        for (const stmtId of affectedStatementIds) {
          const remaining = await tx
            .select({ id: bankStatementLines.id })
            .from(bankStatementLines)
            .where(and(eq(bankStatementLines.statementId, stmtId), eq(bankStatementLines.reconciliationStatus, 'unreconciled')))
            .limit(1);

          if (remaining.length === 0) {
            await tx
              .update(bankStatements)
              .set({ status: 'reconciled', updatedAt: new Date() })
              .where(eq(bankStatements.id, stmtId));
          }
        }

        await tx.insert(auditLogs).values({
          companyId,
          userId,
          action: 'UPDATE',
          entity: 'bank_reconciliation',
          entityId: pairs[0].statementLineId,
          details: { reconciledCount: pairs.length },
        });

        return { reconciledCount: pairs.length };
      });

      return reply.send({ success: true, ...result });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Reconciliation failed' });
    }
  });

  app.post('/bank-reconciliation/unreconcile', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    const { statementLineId } = request.body as { statementLineId: string };
    if (!statementLineId) {
      return reply.code(400).send({ error: 'statementLineId is required' });
    }
    const { companyId } = tenant(request);
    const userId = (request.user as any).id ?? (request.user as any).sub!;

    try {
      await db.transaction(async (tx) => {
        const [sl] = await tx
          .select()
          .from(bankStatementLines)
          .where(eq(bankStatementLines.id, statementLineId))
          .limit(1);
        if (!sl) throw new Error('Statement line not found');

        await tx
          .delete(bankReconciliations)
          .where(eq(bankReconciliations.statementLineId, statementLineId));

        await tx
          .update(bankStatementLines)
          .set({ reconciliationStatus: 'unreconciled' })
          .where(eq(bankStatementLines.id, statementLineId));

        await tx
          .update(bankStatements)
          .set({ status: 'draft', updatedAt: new Date() })
          .where(eq(bankStatements.id, sl.statementId));

        await tx.insert(auditLogs).values({
          companyId,
          userId,
          action: 'UPDATE',
          entity: 'bank_reconciliation',
          entityId: statementLineId,
          details: { action: 'unreconcile' },
        });
      });

      return reply.send({ success: true, message: 'Line unreconciled successfully' });
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Unreconciliation failed' });
    }
  });

  // ─── GAP 8: PROJECT ACCOUNTING & JOB COSTING ──────────────────────────────

  // List projects
  app.get('/projects', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const q = request.query as { status?: string };
      const conditions = [eq(projects.companyId, companyId)];
      if (q.status) {
        conditions.push(eq(projects.status, q.status));
      }

      const rows = await db
        .select()
        .from(projects)
        .where(and(...conditions))
        .orderBy(desc(projects.createdAt));

      return reply.send(rows);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Failed to list projects' });
    }
  });

  // Create project
  app.post('/projects', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const parsed = projectCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.format() });
      }

      const userId = (request as any).user?.id;
      const d = parsed.data;

      const [created] = await db
        .insert(projects)
        .values({
          companyId,
          code: d.code,
          name: d.name,
          description: d.description ?? null,
          customerId: d.customerId ?? null,
          contractValuePaise: d.contractValuePaise,
          budgetMaterialPaise: d.budgetMaterialPaise,
          budgetLaborPaise: d.budgetLaborPaise,
          budgetSubconPaise: d.budgetSubconPaise,
          budgetOverheadPaise: d.budgetOverheadPaise,
          startDate: d.startDate as any,
          endDate: d.endDate as any,
          status: d.status,
          costCentreId: d.costCentreId ?? null,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      return reply.code(201).send(created);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to create project' });
    }
  });

  // Get project by ID
  app.get('/projects/:id', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const { id } = request.params as { id: string };

      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
        .limit(1);

      if (!proj) return reply.code(404).send({ error: 'Project not found' });
      return reply.send(proj);
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Failed to get project' });
    }
  });

  // Update project
  app.patch('/projects/:id', {
    preHandler: [authorize('accounting.jv.create')],
  }, async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const { id } = request.params as { id: string };
      const parsed = projectUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.format() });
      }

      const userId = (request as any).user?.id;
      const d = parsed.data;

      const [updated] = await db
        .update(projects)
        .set({
          ...d,
          startDate: d.startDate as any,
          endDate: d.endDate as any,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
        .returning();

      if (!updated) return reply.code(404).send({ error: 'Project not found' });
      return reply.send(updated);
    } catch (err: any) {
      return reply.code(400).send({ error: err.message || 'Failed to update project' });
    }
  });

  // Project Financial Summary & BvA Analytics
  app.get('/projects/:id/summary', {
    preHandler: [authorize('accounting.jv.view')],
  }, async (request, reply) => {
    try {
      const { companyId } = tenant(request);
      const { id } = request.params as { id: string };

      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
        .limit(1);

      if (!proj) return reply.code(404).send({ error: 'Project not found' });

      // 1. Actual Billed Revenue (from sales invoices)
      const salesInvs = await db
        .select({
          id: salesInvoices.id,
          documentNumber: salesInvoices.documentNumber,
          postingDate: salesInvoices.postingDate,
          totalAmountPaise: salesInvoices.totalAmountPaise,
          status: salesInvoices.status,
        })
        .from(salesInvoices)
        .where(and(
          eq(salesInvoices.companyId, companyId),
          eq(salesInvoices.projectId, id),
          ne(salesInvoices.status, 'cancelled'),
        ));
      const actualRevenuePaise = salesInvs.reduce((acc, inv) => acc + (inv.totalAmountPaise || 0), 0);

      // 2. Actual Material Cost (from stock ledger entries tagged with project)
      const sles = await db
        .select({
          id: stockLedgerEntries.id,
          documentNumber: stockLedgerEntries.documentNumber,
          movementType: stockLedgerEntries.movementType,
          quantity: stockLedgerEntries.quantity,
          valuationAmountPaise: stockLedgerEntries.valuationAmountPaise,
          postingDate: stockLedgerEntries.postingDate,
        })
        .from(stockLedgerEntries)
        .where(and(
          eq(stockLedgerEntries.companyId, companyId),
          eq(stockLedgerEntries.projectId, id),
        ));
      const actualMaterialPaise = sles.reduce((acc, sle) => acc + (sle.valuationAmountPaise || 0), 0);

      // 3. Actual Direct Procurement / Subcontracting Expenses (from purchase invoices)
      const purchInvs = await db
        .select({
          id: purchaseInvoices.id,
          documentNumber: purchaseInvoices.documentNumber,
          postingDate: purchaseInvoices.postingDate,
          totalAmountPaise: purchaseInvoices.totalAmountPaise,
          status: purchaseInvoices.status,
        })
        .from(purchaseInvoices)
        .where(and(
          eq(purchaseInvoices.companyId, companyId),
          eq(purchaseInvoices.projectId, id),
          ne(purchaseInvoices.status, 'cancelled'),
        ));
      const actualProcurementPaise = purchInvs.reduce((acc, inv) => acc + (inv.totalAmountPaise || 0), 0);

      // 4. Actual Direct Labor & Direct GL Expenses
      const glLines = await db
        .select({
          id: journalEntryLines.id,
          journalEntryId: journalEntryLines.journalEntryId,
          debitAmountPaise: journalEntryLines.debitAmountPaise,
          creditAmountPaise: journalEntryLines.creditAmountPaise,
          narration: journalEntryLines.narration,
          createdAt: journalEntryLines.createdAt,
        })
        .from(journalEntryLines)
        .where(eq(journalEntryLines.projectId, id));
      const actualLaborGlPaise = glLines.reduce((acc, line) => acc + (line.debitAmountPaise || 0), 0);

      // Totals & Variance
      const totalBudgetPaise =
        proj.budgetMaterialPaise +
        proj.budgetLaborPaise +
        proj.budgetSubconPaise +
        proj.budgetOverheadPaise;

      const totalActualCostPaise = actualMaterialPaise + actualProcurementPaise + actualLaborGlPaise;
      const profitPaise = actualRevenuePaise - totalActualCostPaise;
      const profitMarginPct = actualRevenuePaise > 0 ? (profitPaise / actualRevenuePaise) * 100 : 0;
      const budgetVariancePaise = totalBudgetPaise - totalActualCostPaise;
      const budgetUtilizationPct = totalBudgetPaise > 0 ? (totalActualCostPaise / totalBudgetPaise) * 100 : 0;

      return reply.send({
        project: proj,
        totals: {
          contractValuePaise: proj.contractValuePaise,
          totalBudgetPaise,
          actualRevenuePaise,
          actualMaterialPaise,
          actualProcurementPaise,
          actualLaborGlPaise,
          totalActualCostPaise,
          profitPaise,
          profitMarginPct: Number(profitMarginPct.toFixed(2)),
          budgetVariancePaise,
          budgetUtilizationPct: Number(budgetUtilizationPct.toFixed(2)),
        },
        breakdown: [
          {
            category: 'Material Consumption',
            budgetPaise: proj.budgetMaterialPaise,
            actualPaise: actualMaterialPaise,
            variancePaise: proj.budgetMaterialPaise - actualMaterialPaise,
            utilizationPct: proj.budgetMaterialPaise > 0 ? Number(((actualMaterialPaise / proj.budgetMaterialPaise) * 100).toFixed(1)) : 0,
          },
          {
            category: 'Direct Labor',
            budgetPaise: proj.budgetLaborPaise,
            actualPaise: actualLaborGlPaise,
            variancePaise: proj.budgetLaborPaise - actualLaborGlPaise,
            utilizationPct: proj.budgetLaborPaise > 0 ? Number(((actualLaborGlPaise / proj.budgetLaborPaise) * 100).toFixed(1)) : 0,
          },
          {
            category: 'Procurement & Subcontracting',
            budgetPaise: proj.budgetSubconPaise,
            actualPaise: actualProcurementPaise,
            variancePaise: proj.budgetSubconPaise - actualProcurementPaise,
            utilizationPct: proj.budgetSubconPaise > 0 ? Number(((actualProcurementPaise / proj.budgetSubconPaise) * 100).toFixed(1)) : 0,
          },
          {
            category: 'Overhead & Other',
            budgetPaise: proj.budgetOverheadPaise,
            actualPaise: 0,
            variancePaise: proj.budgetOverheadPaise,
            utilizationPct: 0,
          },
        ],
        transactions: {
          salesInvoices: salesInvs,
          materialMovements: sles,
          purchaseInvoices: purchInvs,
          journalLines: glLines,
        },
      });
    } catch (err: any) {
      return reply.code(500).send({ error: err.message || 'Failed to get project summary' });
    }
  });
};

export default accountingRoutes;
