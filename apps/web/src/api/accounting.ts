import { api } from './client';

export interface CreateJvLinePayload {
  accountId: string;
  debitAmountPaise: number;
  creditAmountPaise: number;
  narration?: string;
  partyType?: 'supplier' | 'customer';
  partyId?: string;
}

export interface CreateJvPayload {
  postingDate: string;
  narration?: string;
  lines: CreateJvLinePayload[];
}

export interface BankAccount {
  id: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string | null;
  branch: string | null;
  accountType: 'current' | 'savings' | 'od' | 'cc';
  coaAccountId: string;
  coaCode?: string;
  coaName?: string;
  openingBalancePaise: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface BankStatementLine {
  id: string;
  statementId: string;
  date: string;
  description: string | null;
  amountPaise: number;
  reference: string | null;
  reconciliationStatus: 'unreconciled' | 'reconciled';
}

export interface BankStatement {
  id: string;
  statementDate: string;
  openingBalance: number;
  closingBalance: number;
  status: 'draft' | 'reconciled';
  bankAccountId: string;
  coaCode?: string;
  coaName?: string;
  totalLines: number;
  reconciledLines: number;
  createdAt: string;
}

export interface GlReconciliationCandidate {
  id: string;
  journalEntryId: string;
  postingDate: string;
  documentNumber: string;
  documentType: string;
  narration: string | null;
  lineNarration: string | null;
  debitAmountPaise: number;
  creditAmountPaise: number;
  accountCode: string;
  accountName: string;
}

export interface ReconciliationCandidatesResponse {
  statementLines: BankStatementLine[];
  glLines: GlReconciliationCandidate[];
  suggestedMatches: Array<{
    statementLineId: string;
    journalEntryLineId: string;
    confidence: 'exact' | 'high';
  }>;
}

export const accountingApi = {
  getJournalVouchers: async (params?: { startDate?: string; endDate?: string }) => {
    const res = await api.get('/accounting/jv', { params });
    return res.data;
  },
  createJournalVoucher: async (payload: CreateJvPayload) => {
    const res = await api.post('/accounting/jv', payload);
    return res.data;
  },

  // Bank Accounts
  listBankAccounts: async () => {
    const res = await api.get<{ bankAccounts: BankAccount[] }>('/accounting/bank-accounts');
    return res.data.bankAccounts;
  },
  createBankAccount: async (data: Partial<BankAccount>) => {
    const res = await api.post<{ bankAccount: BankAccount }>('/accounting/bank-accounts', data);
    return res.data.bankAccount;
  },

  // Bank Statements
  listBankStatements: async (params?: { bankAccountId?: string }) => {
    const res = await api.get<{ bankStatements: BankStatement[] }>('/accounting/bank-statements', { params });
    return res.data.bankStatements;
  },
  getBankStatement: async (id: string) => {
    const res = await api.get<{ statement: BankStatement; lines: BankStatementLine[] }>(`/accounting/bank-statements/${id}`);
    return res.data;
  },
  importBankStatement: async (data: {
    bankAccountId: string;
    statementDate: string;
    openingBalancePaise?: number;
    closingBalancePaise?: number;
    lines: Array<{
      date: string;
      description?: string | null;
      amountPaise: number;
      reference?: string | null;
    }>;
  }) => {
    const res = await api.post<{ success: boolean; statement: BankStatement }>('/accounting/bank-statements/import', data);
    return res.data;
  },

  // Bank Reconciliation Engine
  getCandidates: async (params: { bankAccountId?: string; statementId?: string }) => {
    const res = await api.get<ReconciliationCandidatesResponse>('/accounting/bank-reconciliation/candidates', { params });
    return res.data;
  },
  reconcile: async (pairs: Array<{ statementLineId: string; journalEntryLineId: string }>) => {
    const res = await api.post<{ success: boolean; reconciledCount: number }>('/accounting/bank-reconciliation/reconcile', { pairs });
    return res.data;
  },
  unreconcile: async (statementLineId: string) => {
    const res = await api.post<{ success: boolean; message: string }>('/accounting/bank-reconciliation/unreconcile', { statementLineId });
    return res.data;
  },

  // Project Accounting & Job Costing (GAP 8)
  listProjects: async (params?: { status?: string }) => {
    const res = await api.get<any[]>('/accounting/projects', { params });
    return res.data;
  },
  createProject: async (data: any) => {
    const res = await api.post<any>('/accounting/projects', data);
    return res.data;
  },
  getProject: async (id: string) => {
    const res = await api.get<any>(`/accounting/projects/${id}`);
    return res.data;
  },
  updateProject: async (id: string, data: any) => {
    const res = await api.patch<any>(`/accounting/projects/${id}`, data);
    return res.data;
  },
  getProjectSummary: async (id: string) => {
    const res = await api.get<any>(`/accounting/projects/${id}/summary`);
    return res.data;
  },
};
