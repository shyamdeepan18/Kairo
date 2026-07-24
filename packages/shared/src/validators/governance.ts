import { z } from 'zod';

const uuid = z.string().uuid();
const paise = z.number().int().nonnegative();
const isoDate = z.string().min(8);

// ─── Approval workflows ─────────────────────────────────────────────────────

const workflowLevelSchema = z.object({
  level: z.number().int().min(1),
  name: z.string().max(255).optional(),
  thresholdMinPaise: paise.default(0),
  thresholdMaxPaise: paise.optional(),
  approverType: z.enum(['role', 'user']),
  approverRoleId: uuid.optional(),
  approverUserId: uuid.optional(),
  requiredApprovals: z.number().int().min(1).default(1),
  isFinal: z.boolean().default(false),
}).refine(
  (l) => (l.approverType === 'role' ? !!l.approverRoleId : !!l.approverUserId),
  { message: 'approverRoleId required for role levels, approverUserId for user levels' }
);

export const workflowCreateSchema = z.object({
  companyId: uuid,
  documentType: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  levels: z.array(workflowLevelSchema).min(1),
});

// ─── Module activation / license ────────────────────────────────────────────

export const moduleUpdateSchema = z.object({
  companyId: uuid,
  isEnabled: z.boolean(),
  expiresAt: isoDate.optional(),
});

export const licenseInstallSchema = z.object({
  companyId: uuid,
  licenseKey: z.string().min(1),
});

// ─── Approval request lifecycle ─────────────────────────────────────────────

export const approvalStartSchema = z.object({
  companyId: uuid,
  documentType: z.string().min(1).max(100),
  documentId: uuid,
  documentNumber: z.string().max(50).optional(),
  amountPaise: paise.default(0),
});

export const approvalActSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  remarks: z.string().optional(),
});

export type WorkflowCreateInput = z.infer<typeof workflowCreateSchema>;
export type ModuleUpdateInput = z.infer<typeof moduleUpdateSchema>;
export type LicenseInstallInput = z.infer<typeof licenseInstallSchema>;
export type ApprovalStartInput = z.infer<typeof approvalStartSchema>;
export type ApprovalActInput = z.infer<typeof approvalActSchema>;
