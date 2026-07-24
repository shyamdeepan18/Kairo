import { db, documentAuditLog } from '@erp/db';
import type { DocumentStatus, TransitionResult } from './status-engine.js';

// ─── Context passed with every log call ───────────────────────────────────

export interface AuditContext {
  companyId: string;
  documentType: string;
  documentId: string;
  documentNumber?: string;
  performedBy: string;
}

// ─── AuditEngine ──────────────────────────────────────────────────────────
//
// Append-only. Never updates or deletes rows in document_audit_log.
// All methods fire-and-forget (they do NOT await in most callers).
// If you need the write to be within the same transaction as the document
// update, pass `{ tx }` in opts.

interface AuditOpts {
  /** Run within this Drizzle transaction instead of the shared db pool */
  tx?: typeof db;
}

export class AuditEngine {
  // ── Logging methods ────────────────────────────────────────────────────────

  /**
   * Called once when the document row is first inserted.
   * Stores the full initial snapshot in `changes` for easy "created with" display.
   */
  async logCreate(
    ctx: AuditContext,
    document: Record<string, unknown>,
    opts?: AuditOpts
  ): Promise<void> {
    const client = opts?.tx ?? db;
    await (client as typeof db).insert(documentAuditLog).values({
      companyId: ctx.companyId,
      documentType: ctx.documentType,
      documentId: ctx.documentId,
      documentNumber: ctx.documentNumber,
      action: 'created',
      changes: Object.fromEntries(
        Object.entries(document).map(([k, v]) => [k, { old: null, new: v }])
      ),
      performedBy: ctx.performedBy,
    });
  }

  /**
   * Called after any field-level update.
   * Only logs fields that actually changed (deep comparison).
   *
   * @param before  Document snapshot BEFORE the update
   * @param after   Document snapshot AFTER the update
   */
  async logUpdate(
    ctx: AuditContext,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
    opts?: AuditOpts
  ): Promise<void> {
    const changes = this.diff(before, after);
    if (Object.keys(changes).length === 0) return; // nothing actually changed

    const client = opts?.tx ?? db;
    await (client as typeof db).insert(documentAuditLog).values({
      companyId: ctx.companyId,
      documentType: ctx.documentType,
      documentId: ctx.documentId,
      documentNumber: ctx.documentNumber,
      action: 'updated',
      changes,
      performedBy: ctx.performedBy,
    });
  }

  /**
   * Called after StatusEngine.prepare() + the document status column update.
   *
   * @param fromStatus  Status before the transition
   * @param result      Return value from StatusEngine.prepare()
   * @param remarks     Optional reason (required for cancellation/rejection)
   */
  async logTransition(
    ctx: AuditContext,
    fromStatus: DocumentStatus,
    result: TransitionResult,
    remarks?: string,
    opts?: AuditOpts
  ): Promise<void> {
    const client = opts?.tx ?? db;
    await (client as typeof db).insert(documentAuditLog).values({
      companyId: ctx.companyId,
      documentType: ctx.documentType,
      documentId: ctx.documentId,
      documentNumber: ctx.documentNumber,
      action: result.toStatus,           // 'submitted', 'approved', 'rejected', etc.
      fromStatus,
      toStatus: result.toStatus,
      remarks,
      performedBy: ctx.performedBy,
    });
  }

  // ── Diff helper ────────────────────────────────────────────────────────────

  /**
   * Deep-compares two flat/shallow objects and returns only the changed fields.
   * Uses JSON.stringify for comparison — sufficient for ERP document fields
   * which are all JSON-serialisable scalars and JSONB objects.
   *
   * Fields to always exclude from audit (system-managed):
   *   updatedAt, updatedBy, submittedAt/By, approvedAt/By, cancelledAt/By, closedAt/By
   */
  private readonly EXCLUDED_FIELDS = new Set([
    'updatedAt', 'updatedBy',
    'submittedAt', 'submittedBy',
    'approvedAt', 'approvedBy',
    'rejectedAt', 'rejectedBy',
    'cancelledAt', 'cancelledBy',
    'closedAt', 'closedBy',
  ]);

  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>
  ): Record<string, { old: unknown; new: unknown }> {
    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of keys) {
      if (this.EXCLUDED_FIELDS.has(key)) continue;
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changes[key] = { old: before[key] ?? null, new: after[key] ?? null };
      }
    }

    return changes;
  }
}
