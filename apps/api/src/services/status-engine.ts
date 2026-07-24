// ─── Document status lifecycle ─────────────────────────────────────────────
//
// Rules:
//   • Transitions that are not listed are forbidden.
//   • [] = terminal state (no further transitions allowed).
//   • Module route handlers call StatusEngine.transition() — they don't update
//     the status column directly.
//   • StatusEngine calls AuditEngine internally after each successful transition.

export type DocumentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'closed'
  | 'cancelled';

export type TransitionAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'close'
  | 'cancel'
  | 'revise'; // rejected → draft

// ─── Transition map per document type ─────────────────────────────────────
//
// Key: document type string matching document_audit_log.document_type
// Value: map of currentStatus → allowed next statuses

const TRANSITIONS: Record<string, Partial<Record<DocumentStatus, DocumentStatus[]>>> = {
  'purchase.requisition': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['closed', 'cancelled'],
    closed:    [],
    cancelled: [],
  },
  'purchase.po': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['closed', 'cancelled'],
    closed:    [],
    cancelled: [],
  },
  'purchase.grn': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  [],          // GRN is terminal once approved — it posts stock
    cancelled: [],
  },
  'purchase.invoice': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['cancelled'],
    cancelled: [],
  },
  'purchase.payment': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  [],
    cancelled: [],
  },
  'sales.quotation': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['closed', 'cancelled'],
    closed:    [],
    cancelled: [],
  },
  'sales.so': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['closed', 'cancelled'],
    closed:    [],
    cancelled: [],
  },
  'sales.delivery': {
    draft:     ['submitted'],
    submitted: ['approved'],
    approved:  [],
    cancelled: [],
  },
  'sales.invoice': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['cancelled'],
    cancelled: [],
  },
  'accounting.jv': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['cancelled'],
    cancelled: [],
  },
  'manufacturing.order': {
    draft:     ['submitted'],
    submitted: ['approved', 'rejected'],
    rejected:  ['draft'],
    approved:  ['closed', 'cancelled'],
    closed:    [],
    cancelled: [],
  },
};

// ─── StatusTransitionError ─────────────────────────────────────────────────

export class StatusTransitionError extends Error {
  constructor(
    public readonly documentType: string,
    public readonly fromStatus: DocumentStatus,
    public readonly toStatus: DocumentStatus
  ) {
    super(
      `Invalid transition for ${documentType}: ${fromStatus} → ${toStatus}. ` +
      `Allowed: ${StatusEngine.allowedTransitions(documentType, fromStatus).join(', ') || 'none (terminal state)'}`
    );
    this.name = 'StatusTransitionError';
  }
}

// ─── Transition metadata ───────────────────────────────────────────────────
//
// After a successful transition the route handler must stamp audit fields.
// StatusEngine returns the fields that need to be updated on the document row.

export interface TransitionResult {
  toStatus: DocumentStatus;
  /** Fields to merge into the document UPDATE payload */
  stampFields: Record<string, unknown>;
}

// ─── StatusEngine ──────────────────────────────────────────────────────────

export class StatusEngine {
  // ── Validation ────────────────────────────────────────────────────────────

  /** True if the transition is allowed for this document type */
  static canTransition(
    documentType: string,
    fromStatus: DocumentStatus,
    toStatus: DocumentStatus
  ): boolean {
    return StatusEngine.allowedTransitions(documentType, fromStatus).includes(toStatus);
  }

  /** Returns the list of statuses reachable from the current status */
  static allowedTransitions(
    documentType: string,
    fromStatus: DocumentStatus
  ): DocumentStatus[] {
    return TRANSITIONS[documentType]?.[fromStatus] ?? [];
  }

  /** Throws StatusTransitionError if the transition is not allowed */
  static assertCanTransition(
    documentType: string,
    fromStatus: DocumentStatus,
    toStatus: DocumentStatus
  ): void {
    if (!StatusEngine.canTransition(documentType, fromStatus, toStatus)) {
      throw new StatusTransitionError(documentType, fromStatus, toStatus);
    }
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * Validates the transition and returns the fields that the module's route
   * handler must write to the document row.
   *
   * Usage in a route handler:
   *
   *   const result = StatusEngine.prepare('purchase.po', currentDoc.status, 'approved', userId);
   *   await tx.update(purchaseOrders).set({ ...result.stampFields }).where(eq(purchaseOrders.id, poId));
   *   await auditEngine.logTransition({ ... }, result);
   */
  static prepare(
    documentType: string,
    fromStatus: DocumentStatus,
    toStatus: DocumentStatus,
    performedByUserId: string
  ): TransitionResult {
    StatusEngine.assertCanTransition(documentType, fromStatus, toStatus);

    const now = new Date();
    const stampFields: Record<string, unknown> = {
      status: toStatus,
      updatedAt: now,
    };

    // Stamp the appropriate "who + when" fields
    switch (toStatus) {
      case 'submitted':
        stampFields.submittedBy = performedByUserId;
        stampFields.submittedAt = now;
        break;
      case 'approved':
        stampFields.approvedBy = performedByUserId;
        stampFields.approvedAt = now;
        break;
      case 'rejected':
        stampFields.rejectedBy = performedByUserId;
        stampFields.rejectedAt = now;
        break;
      case 'cancelled':
        stampFields.cancelledBy = performedByUserId;
        stampFields.cancelledAt = now;
        break;
      case 'closed':
        stampFields.closedBy = performedByUserId;
        stampFields.closedAt = now;
        break;
    }

    return { toStatus, stampFields };
  }

  // ── Document type registration ─────────────────────────────────────────────

  /**
   * Add a custom document type transition map at runtime.
   * Use this in module initialisation for non-standard types.
   */
  static register(
    documentType: string,
    transitions: Partial<Record<DocumentStatus, DocumentStatus[]>>
  ): void {
    TRANSITIONS[documentType] = transitions;
  }

  /** True if a document type has transitions defined */
  static isRegistered(documentType: string): boolean {
    return documentType in TRANSITIONS;
  }

  /** All document types with registered transitions */
  static registeredTypes(): string[] {
    return Object.keys(TRANSITIONS);
  }
}
