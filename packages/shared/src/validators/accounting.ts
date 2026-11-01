import { z } from 'zod';

export const journalLineSchema = z.object({
  accountId: z.string().uuid(),
  debitAmountPaise: z.number().int().min(0).default(0),
  creditAmountPaise: z.number().int().min(0).default(0),
  narration: z.string().max(500).optional().nullable(),
  partyType: z.enum(['supplier', 'customer']).optional().nullable(),
  partyId: z.string().uuid().optional().nullable(),
}).refine(
  (line) => (line.debitAmountPaise > 0 && line.creditAmountPaise === 0) || (line.creditAmountPaise > 0 && line.debitAmountPaise === 0),
  { message: 'Line must have either debit or credit greater than 0, not both' }
);

export const createJvSchema = z.object({
  postingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  narration: z.string().max(1000).optional().nullable(),
  lines: z.array(journalLineSchema).min(2, 'Journal entry must have at least 2 lines'),
}).refine(
  (jv) => {
    const totalDebit = jv.lines.reduce((acc, l) => acc + l.debitAmountPaise, 0);
    const totalCredit = jv.lines.reduce((acc, l) => acc + l.creditAmountPaise, 0);
    return totalDebit === totalCredit && totalDebit > 0;
  },
  { message: 'Total Debits must equal Total Credits and be greater than 0' }
);

export type JournalLineInput = z.infer<typeof journalLineSchema>;
export type CreateJvInput = z.infer<typeof createJvSchema>;

export const bankAccountCreateSchema = z.object({
  accountName: z.string().min(1).max(255),
  bankName: z.string().min(1).max(255),
  accountNumber: z.string().min(1).max(30),
  ifscCode: z.string().max(11).optional().nullable(),
  branch: z.string().max(255).optional().nullable(),
  accountType: z.enum(['current', 'savings', 'od', 'cc']).default('current'),
  coaAccountId: z.string().uuid(),
  openingBalancePaise: z.number().int().default(0),
  isDefault: z.boolean().default(false),
});

export const bankStatementLineImportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  description: z.string().optional().nullable(),
  amountPaise: z.number().int(), // positive for deposit/credit into bank, negative for withdrawal
  reference: z.string().max(255).optional().nullable(),
});

export const bankStatementImportSchema = z.object({
  bankAccountId: z.string().uuid(),
  statementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
  openingBalancePaise: z.number().int().default(0),
  closingBalancePaise: z.number().int().default(0),
  lines: z.array(bankStatementLineImportSchema).min(1, 'Statement must have at least 1 line'),
});

export const bankReconcilePairsSchema = z.object({
  pairs: z.array(
    z.object({
      statementLineId: z.string().uuid(),
      journalEntryLineId: z.string().uuid(),
    })
  ).min(1, 'At least 1 reconciliation match pair required'),
});

export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
export type BankStatementImportInput = z.infer<typeof bankStatementImportSchema>;
export type BankReconcilePairsInput = z.infer<typeof bankReconcilePairsSchema>;

// ─── Project Accounting (GAP 8) ─────────────────────────────────────────────

export const projectCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  contractValuePaise: z.number().int().min(0).default(0),
  budgetMaterialPaise: z.number().int().min(0).default(0),
  budgetLaborPaise: z.number().int().min(0).default(0),
  budgetSubconPaise: z.number().int().min(0).default(0),
  budgetOverheadPaise: z.number().int().min(0).default(0),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  status: z.enum(['planning', 'active', 'on_hold', 'completed', 'closed']).default('active'),
  costCentreId: z.string().uuid().optional().nullable(),
});

export const projectUpdateSchema = projectCreateSchema.partial();
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;
