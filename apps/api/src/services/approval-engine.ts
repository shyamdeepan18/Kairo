import { eq, and, asc } from 'drizzle-orm';
import {
  db, approvalWorkflows, approvalWorkflowLevels, approvalRequests, approvalActions, userRoles,
} from '@erp/db';
import type { ApprovalWorkflow, ApprovalWorkflowLevel, ApprovalRequest } from '@erp/db';
import { StatusEngine } from './status-engine.js';
import type { AuditEngine } from './audit-engine.js';

type DB = typeof db;

export interface StartContext {
  companyId: string;
  documentType: string;
  documentId: string;
  documentNumber?: string;
  amountPaise: number;
  createdBy: string;
}

export type ActResult =
  | { recorded: true; remaining: number }                       // level needs more approvals
  | { advanced: true; currentLevel: number }                    // moved to next level
  | { finalized: true; decision: 'approved' | 'rejected' };     // workflow complete

export type StartResult =
  | { workflow: null }                                          // no workflow → caller uses fallback
  | { workflow: ApprovalWorkflow; autoApprove: true }           // workflow exists but no level applies
  | { workflow: ApprovalWorkflow; request: ApprovalRequest; levels: ApprovalWorkflowLevel[] };

/**
 * ApprovalEngine — multi-level, amount-banded approval chains (roadmap item 2A).
 *
 * Document-agnostic: it owns the approval_requests/approval_actions lifecycle and,
 * on finalize, updates the source document via a registered table + StatusEngine.
 * Register each approvable document type at startup:
 *   approvalEngine.registerDocument('purchase.po', purchaseOrders)
 *
 * Backward-compatible: resolveWorkflow() returns null when no workflow is configured,
 * so modules keep using their existing single-step approve + user_approval_limits.
 */
export class ApprovalEngine {
  private docs = new Map<string, any>();

  constructor(private readonly audit?: AuditEngine) {}

  registerDocument(documentType: string, table: any): void {
    this.docs.set(documentType, table);
  }

  /** Active workflow + the ordered levels whose band covers amountPaise (or null). */
  async resolveWorkflow(companyId: string, documentType: string, amountPaise: number) {
    const [wf] = await db
      .select()
      .from(approvalWorkflows)
      .where(and(
        eq(approvalWorkflows.companyId, companyId),
        eq(approvalWorkflows.documentType, documentType),
        eq(approvalWorkflows.isActive, true),
      ))
      .limit(1);
    if (!wf) return null;

    const levels = await db
      .select()
      .from(approvalWorkflowLevels)
      .where(eq(approvalWorkflowLevels.workflowId, wf.id))
      .orderBy(asc(approvalWorkflowLevels.level));

    const applicable = levels.filter(
      (l) => amountPaise >= l.thresholdMinPaise && (l.thresholdMaxPaise == null || amountPaise <= l.thresholdMaxPaise)
    );
    return { workflow: wf, levels: applicable };
  }

  /** Create an approval request for a freshly submitted document. */
  async start(tx: DB, ctx: StartContext): Promise<StartResult> {
    const resolved = await this.resolveWorkflow(ctx.companyId, ctx.documentType, ctx.amountPaise);
    if (!resolved) return { workflow: null };
    if (resolved.levels.length === 0) return { workflow: resolved.workflow, autoApprove: true };

    const [request] = await tx
      .insert(approvalRequests)
      .values({
        companyId: ctx.companyId,
        documentType: ctx.documentType,
        documentId: ctx.documentId,
        documentNumber: ctx.documentNumber,
        amountPaise: ctx.amountPaise,
        workflowId: resolved.workflow.id,
        currentLevel: resolved.levels[0].level,
        status: 'pending',
        createdBy: ctx.createdBy,
      })
      .returning();
    return { workflow: resolved.workflow, request, levels: resolved.levels };
  }

  /** Approve or reject the current level. Enforces SoD + approver eligibility. */
  async act(
    tx: DB,
    requestId: string,
    userId: string,
    action: 'approved' | 'rejected',
    remarks?: string
  ): Promise<ActResult> {
    const [req] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, requestId)).limit(1);
    if (!req) throw new Error('Approval request not found');
    if (req.status !== 'pending') throw new Error(`Approval request is already ${req.status}`);

    // Segregation of duties — the submitter cannot approve their own document.
    if (userId === req.createdBy) {
      throw new Error('Segregation of duties: the submitter cannot approve their own document');
    }

    const resolved = await this.resolveWorkflow(req.companyId, req.documentType, req.amountPaise);
    if (!resolved) throw new Error('Workflow no longer configured');
    const current = resolved.levels.find((l) => l.level === req.currentLevel);
    if (!current) throw new Error('Current approval level not found');

    // Eligibility for this level
    if (current.approverType === 'user') {
      if (current.approverUserId !== userId) throw new Error('You are not the designated approver for this level');
    } else {
      if (!current.approverRoleId) throw new Error('Approval level has no role configured');
      const [hasRole] = await tx
        .select({ id: userRoles.id })
        .from(userRoles)
        .where(and(
          eq(userRoles.userId, userId),
          eq(userRoles.companyId, req.companyId),
          eq(userRoles.roleId, current.approverRoleId),
        ))
        .limit(1);
      if (!hasRole) throw new Error('You do not hold the approver role for this level');
    }

    await tx.insert(approvalActions).values({
      requestId: req.id, level: current.level, action, performedBy: userId, remarks,
    });

    if (action === 'rejected') {
      await tx.update(approvalRequests).set({ status: 'rejected', updatedAt: new Date() }).where(eq(approvalRequests.id, req.id));
      await this.finalizeDoc(tx, req, 'rejected', userId, remarks);
      return { finalized: true, decision: 'rejected' };
    }

    // Approved — has this level met its required count?
    const approvals = await tx
      .select({ id: approvalActions.id })
      .from(approvalActions)
      .where(and(
        eq(approvalActions.requestId, req.id),
        eq(approvalActions.level, current.level),
        eq(approvalActions.action, 'approved'),
      ));
    if (approvals.length < current.requiredApprovals) {
      return { recorded: true, remaining: current.requiredApprovals - approvals.length };
    }

    const next = resolved.levels.find((l) => l.level > current.level);
    if (next) {
      await tx.update(approvalRequests).set({ currentLevel: next.level, updatedAt: new Date() }).where(eq(approvalRequests.id, req.id));
      return { advanced: true, currentLevel: next.level };
    }

    await tx.update(approvalRequests).set({ status: 'approved', updatedAt: new Date() }).where(eq(approvalRequests.id, req.id));
    await this.finalizeDoc(tx, req, 'approved', userId, remarks);
    return { finalized: true, decision: 'approved' };
  }

  /** Apply the final decision to the source document (status + audit). */
  private async finalizeDoc(
    tx: DB,
    req: ApprovalRequest,
    decision: 'approved' | 'rejected',
    userId: string,
    remarks?: string
  ): Promise<void> {
    const table = this.docs.get(req.documentType);
    if (!table) return; // unregistered doc type — request finalized, document untouched
    const result = StatusEngine.prepare(req.documentType, 'submitted', decision, userId);
    await tx.update(table).set(result.stampFields).where(eq(table.id, req.documentId));
    if (this.audit) {
      await this.audit.logTransition(
        { companyId: req.companyId, documentType: req.documentType, documentId: req.documentId, documentNumber: req.documentNumber ?? undefined, performedBy: userId },
        'submitted', result, remarks, { tx }
      );
    }
  }
}
