import {
  pgTable, uuid, varchar, text, integer, bigint, boolean,
  timestamp, index, unique, pgEnum,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { companies } from './company.js';
import { users } from './auth.js';
import { roles } from './permissions.js';

// ─── Multi-level approval workflows (Permission roadmap item 2A) ────────────
//
// Extends the single-step approve + per-user amount limit into ordered approval
// chains per (company, document type). Amount-banded for v1 (a level is required
// when amount >= thresholdMinPaise). Backward-compatible: with no workflow
// configured for a doc type, modules fall back to the existing single approve.

const money = (name: string) => bigint(name, { mode: 'number' });

export const approverTypeEnum = pgEnum('approver_type', ['role', 'user']);

export const approvalWorkflows = pgTable(
  'approval_workflows',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    /** e.g. 'purchase.po', 'sales.so' */
    documentType: varchar('document_type', { length: 100 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueType: unique('approval_workflows_company_type_uq').on(t.companyId, t.documentType),
    companyIdx: index('approval_workflows_company_idx').on(t.companyId),
  })
);

export const approvalWorkflowLevels = pgTable(
  'approval_workflow_levels',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id, { onDelete: 'cascade' }),
    /** 1-based order */
    level: integer('level').notNull(),
    name: varchar('name', { length: 255 }),
    /** This level is required when the document amount >= thresholdMinPaise */
    thresholdMinPaise: money('threshold_min_paise').default(0).notNull(),
    /** Optional upper bound (null = no cap) */
    thresholdMaxPaise: money('threshold_max_paise'),
    approverType: approverTypeEnum('approver_type').notNull(),
    /** Set when approverType = 'role' */
    approverRoleId: uuid('approver_role_id').references(() => roles.id),
    /** Set when approverType = 'user' */
    approverUserId: uuid('approver_user_id').references(() => users.id),
    /** N-of-M: how many approvals at this level before it advances */
    requiredApprovals: integer('required_approvals').default(1).notNull(),
    isFinal: boolean('is_final').default(false).notNull(),
  },
  (t) => ({
    workflowIdx: index('approval_workflow_levels_workflow_idx').on(t.workflowId),
    uniqueLevel: unique('approval_workflow_levels_uq').on(t.workflowId, t.level),
  })
);

export const approvalRequests = pgTable(
  'approval_requests',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    documentType: varchar('document_type', { length: 100 }).notNull(),
    documentId: uuid('document_id').notNull(),
    documentNumber: varchar('document_number', { length: 50 }),
    amountPaise: money('amount_paise').default(0).notNull(),
    workflowId: uuid('workflow_id').notNull().references(() => approvalWorkflows.id),
    /** Level currently awaiting approval */
    currentLevel: integer('current_level').notNull(),
    /** pending | approved | rejected */
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    companyStatusIdx: index('approval_requests_company_status_idx').on(t.companyId, t.status),
    docIdx: index('approval_requests_doc_idx').on(t.documentType, t.documentId),
  })
);

export const approvalActions = pgTable(
  'approval_actions',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    requestId: uuid('request_id').notNull().references(() => approvalRequests.id, { onDelete: 'cascade' }),
    level: integer('level').notNull(),
    /** approved | rejected */
    action: varchar('action', { length: 20 }).notNull(),
    performedBy: uuid('performed_by').notNull().references(() => users.id),
    performedAt: timestamp('performed_at', { withTimezone: true }).defaultNow().notNull(),
    remarks: text('remarks'),
  },
  (t) => ({
    requestIdx: index('approval_actions_request_idx').on(t.requestId),
    // One vote per approver per level — makes N-of-M count distinct approvers and
    // blocks a single user from satisfying a multi-approval level by voting twice.
    oneVotePerApprover: unique('approval_actions_request_level_user_uq').on(t.requestId, t.level, t.performedBy),
  })
);

export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;
export type NewApprovalWorkflow = typeof approvalWorkflows.$inferInsert;
export type ApprovalWorkflowLevel = typeof approvalWorkflowLevels.$inferSelect;
export type NewApprovalWorkflowLevel = typeof approvalWorkflowLevels.$inferInsert;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;
export type ApprovalAction = typeof approvalActions.$inferSelect;
export type NewApprovalAction = typeof approvalActions.$inferInsert;
