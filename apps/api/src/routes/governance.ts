import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import {
  db, approvalWorkflows, approvalWorkflowLevels, approvalRequests, approvalActions, companyLicense,
} from '@erp/db';
import {
  workflowCreateSchema, moduleUpdateSchema, licenseInstallSchema,
  approvalStartSchema, approvalActSchema,
} from '@erp/shared';
import { authorize } from '../middleware/authorize.js';
import { resolveCompany, companyId } from '../middleware/company-context.js';

/**
 * Permission roadmap item 2 — governance routes at /api/governance.
 *   /workflows  — approval workflow config (settings.approvalworkflow.*)
 *   /modules    — company module activation (settings.license.*)
 *   /license    — install / view the company license (settings.license.*)
 *   /approvals  — the approval-request lifecycle (start / list / act)
 */
export default async function governanceRoutes(app: FastifyInstance) {
  const userId = (req: FastifyRequest) => (req.user as { id: string }).id;
  const bad = (reply: FastifyReply, p: { error: { issues: unknown } }) =>
    reply.code(400).send({ error: 'Invalid input', issues: p.error.issues });

  // ── Approval workflows ────────────────────────────────────────────────────

  app.post('/workflows', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.approvalworkflow.manage')],
  }, async (request, reply) => {
    const parsed = workflowCreateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const created = await db.transaction(async (tx) => {
      const [wf] = await tx.insert(approvalWorkflows).values({
        companyId: d.companyId, documentType: d.documentType, name: d.name, createdBy: userId(request),
      }).returning();
      await tx.insert(approvalWorkflowLevels).values(
        d.levels.map((l) => ({
          workflowId: wf.id, level: l.level, name: l.name,
          thresholdMinPaise: l.thresholdMinPaise, thresholdMaxPaise: l.thresholdMaxPaise ?? null,
          approverType: l.approverType, approverRoleId: l.approverRoleId, approverUserId: l.approverUserId,
          requiredApprovals: l.requiredApprovals, isFinal: l.isFinal,
        }))
      );
      return wf;
    });
    return reply.code(201).send(created);
  });

  app.get('/workflows', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.approvalworkflow.view')],
  }, async (request) => {
    const cid = companyId(request);
    const data = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.companyId, cid)).orderBy(desc(approvalWorkflows.createdAt));
    return { data, total: data.length };
  });

  app.get('/workflows/:id', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.approvalworkflow.view')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [wf] = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, id)).limit(1);
    if (!wf) return reply.code(404).send({ error: 'Workflow not found' });
    const levels = await db.select().from(approvalWorkflowLevels).where(eq(approvalWorkflowLevels.workflowId, id));
    return { ...wf, levels };
  });

  // ── Module activation + license ───────────────────────────────────────────

  app.get('/modules', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.license.view')],
  }, async (request) => {
    const modules = await app.licenseService.getModules(companyId(request));
    return { data: modules, total: modules.length };
  });

  app.put('/modules/:module', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.license.manage')],
  }, async (request, reply) => {
    const parsed = moduleUpdateSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const { module } = request.params as { module: string };
    const d = parsed.data;
    const row = await app.licenseService.setModule(d.companyId, module, d.isEnabled, d.expiresAt ? new Date(d.expiresAt) : null);
    return row;
  });

  app.get('/license', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.license.view')],
  }, async (request) => {
    return (await app.licenseService.getLicense(companyId(request))) ?? { license: null };
  });

  app.post('/license', {
    preHandler: [app.authenticate, resolveCompany, authorize('settings.license.manage')],
  }, async (request, reply) => {
    const parsed = licenseInstallSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const check = app.licenseService.validateKey(d.licenseKey);
    if (!check.valid) return reply.code(400).send({ error: 'Invalid license key', issues: check.errors });
    const p = check.payload ?? {};
    const [row] = await db.insert(companyLicense).values({
      companyId: d.companyId,
      edition: (p.edition as string) ?? null,
      maxUsers: typeof p.maxUsers === 'number' ? p.maxUsers : -1,
      validFrom: (p.validFrom as string) ?? null,
      validTo: (p.validTo as string) ?? null,
      licenseKey: d.licenseKey,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: companyLicense.companyId,
      set: {
        edition: (p.edition as string) ?? null,
        maxUsers: typeof p.maxUsers === 'number' ? p.maxUsers : -1,
        validFrom: (p.validFrom as string) ?? null,
        validTo: (p.validTo as string) ?? null,
        licenseKey: d.licenseKey,
        updatedAt: new Date(),
      },
    }).returning();
    return reply.code(201).send(row);
  });

  // ── Approval request lifecycle ──────────────────────────────────────────────

  app.post('/approvals/start', {
    preHandler: [app.authenticate, resolveCompany],
  }, async (request, reply) => {
    const parsed = approvalStartSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    const result = await db.transaction((tx) => app.approvalEngine.start(tx, {
      companyId: d.companyId, documentType: d.documentType, documentId: d.documentId,
      documentNumber: d.documentNumber, amountPaise: d.amountPaise, createdBy: userId(request),
    }));
    return reply.code(201).send(result);
  });

  app.get('/approvals', {
    preHandler: [app.authenticate, resolveCompany],
  }, async (request) => {
    const cid = companyId(request);
    const status = String((request.query as Record<string, unknown>).status ?? 'pending');
    const data = await db.select().from(approvalRequests)
      .where(and(eq(approvalRequests.companyId, cid), eq(approvalRequests.status, status)))
      .orderBy(desc(approvalRequests.createdAt));
    return { data, total: data.length };
  });

  app.get('/approvals/:id', {
    preHandler: [app.authenticate, resolveCompany],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [req] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, id)).limit(1);
    if (!req) return reply.code(404).send({ error: 'Approval request not found' });
    const actions = await db.select().from(approvalActions).where(eq(approvalActions.requestId, id));
    return { ...req, actions };
  });

  app.post('/approvals/:id/act', {
    preHandler: [app.authenticate, resolveCompany],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = approvalActSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed);
    const d = parsed.data;
    try {
      const result = await db.transaction((tx) =>
        app.approvalEngine.act(tx, id, userId(request), d.action, d.remarks));
      return reply.send({ ok: true, ...result });
    } catch (err) {
      return reply.code(409).send({ error: `Approval action failed: ${(err as Error).message}`, detail: (err as Error).message });
    }
  });
}
