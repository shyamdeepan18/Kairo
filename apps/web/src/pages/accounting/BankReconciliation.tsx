import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Table,
  Button,
  Tag,
  Select,
  Modal,
  Form,
  Input,
  DatePicker,
  InputNumber,
  message,
  Tooltip,
  Badge,
  Divider,
} from 'antd';
import {
  Building2,
  Landmark,
  CheckCircle2,
  RefreshCw,
  Upload,
  ArrowRightLeft,
  AlertCircle,
  FileSpreadsheet,
  Plus,
  Search,
  CheckCheck,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import dayjs from 'dayjs';
import { usePlantStore } from '../../store/plant';
import {
  accountingApi,
  type BankAccount,
  type BankStatement,
  type BankStatementLine,
  type GlReconciliationCandidate,
} from '../../api/accounting';
import { settingsApi } from '../../api/settings';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

export default function BankReconciliationPage() {
  const { company } = usePlantStore();

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>();
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [selectedStatementId, setSelectedStatementId] = useState<string | undefined>();

  const [statementLines, setStatementLines] = useState<BankStatementLine[]>([]);
  const [glLines, setGlLines] = useState<GlReconciliationCandidate[]>([]);
  const [suggestedMatches, setSuggestedMatches] = useState<
    Array<{ statementLineId: string; journalEntryLineId: string; confidence: 'exact' | 'high' }>
  >([]);

  const [loading, setLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  // Selected for manual pair matching
  const [selectedStmtLineId, setSelectedStmtLineId] = useState<string | null>(null);
  const [selectedGlLineId, setSelectedGlLineId] = useState<string | null>(null);

  // Modals
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [newAccountModalOpen, setNewAccountModalOpen] = useState(false);
  const [coaAccounts, setCoaAccounts] = useState<any[]>([]);

  const [importForm] = Form.useForm();
  const [accountForm] = Form.useForm();

  // Load Bank Accounts & COA accounts
  const loadAccounts = useCallback(async () => {
    if (!company?.id) return;
    try {
      const [accs, coa] = await Promise.all([
        accountingApi.listBankAccounts(),
        settingsApi.listAccounts(company.id),
      ]);
      setBankAccounts(accs);
      setCoaAccounts(coa.filter((c: any) => c.isActive && (c.accountType === 'asset' || c.accountGroup === 'current_assets')));
      if (accs.length > 0 && !selectedAccountId) {
        setSelectedAccountId(accs[0].id);
      }
    } catch {
      message.error('Failed to load bank accounts');
    }
  }, [company?.id, selectedAccountId]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Load Statements when Account changes
  useEffect(() => {
    if (!selectedAccountId) {
      setStatements([]);
      setSelectedStatementId(undefined);
      return;
    }
    accountingApi
      .listBankStatements({ bankAccountId: selectedAccountId })
      .then((res) => {
        setStatements(res);
        if (res.length > 0) {
          setSelectedStatementId(res[0].id);
        } else {
          setSelectedStatementId(undefined);
        }
      })
      .catch(() => message.error('Failed to load statements'));
  }, [selectedAccountId]);

  // Load Candidates (Dual ledgers) when Account or Statement changes
  const loadCandidates = useCallback(async () => {
    if (!selectedAccountId) return;
    setLoading(true);
    setSelectedStmtLineId(null);
    setSelectedGlLineId(null);
    try {
      const data = await accountingApi.getCandidates({
        bankAccountId: selectedAccountId,
        statementId: selectedStatementId,
      });
      setStatementLines(data.statementLines);
      setGlLines(data.glLines);
      setSuggestedMatches(data.suggestedMatches);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to fetch reconciliation candidates');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountId, selectedStatementId]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  // Active selected bank account entity
  const activeAccount = useMemo(
    () => bankAccounts.find((b) => b.id === selectedAccountId),
    [bankAccounts, selectedAccountId]
  );

  // Active statement
  const activeStatement = useMemo(
    () => statements.find((s) => s.id === selectedStatementId),
    [statements, selectedStatementId]
  );

  // Selected statement line details
  const selectedStmtLine = useMemo(
    () => statementLines.find((l) => l.id === selectedStmtLineId),
    [statementLines, selectedStmtLineId]
  );

  // Selected GL line details
  const selectedGlLine = useMemo(
    () => glLines.find((l) => l.id === selectedGlLineId),
    [glLines, selectedGlLineId]
  );

  // Validation if the currently selected pair can match
  const matchValidation = useMemo(() => {
    if (!selectedStmtLine || !selectedGlLine) return { valid: false, reason: 'Select one line from each ledger' };
    const isDeposit = selectedStmtLine.amountPaise > 0;
    const targetAmount = Math.abs(selectedStmtLine.amountPaise);
    const glAmount = isDeposit ? selectedGlLine.debitAmountPaise : selectedGlLine.creditAmountPaise;

    if (glAmount !== targetAmount) {
      return {
        valid: false,
        reason: `Amount mismatch: Statement has ₹${(targetAmount / 100).toFixed(2)}, Book GL has ₹${(glAmount / 100).toFixed(2)}`,
      };
    }
    return { valid: true, reason: 'Exact amount match' };
  }, [selectedStmtLine, selectedGlLine]);

  // Reconcile manual pair
  const handleReconcileSelected = async () => {
    if (!selectedStmtLineId || !selectedGlLineId || !matchValidation.valid) return;
    setReconciling(true);
    try {
      await accountingApi.reconcile([{ statementLineId: selectedStmtLineId, journalEntryLineId: selectedGlLineId }]);
      message.success('Lines successfully reconciled and locked into audit trail');
      loadCandidates();
      if (selectedAccountId) {
        accountingApi.listBankStatements({ bankAccountId: selectedAccountId }).then(setStatements);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  // Reconcile all auto-matched suggestions
  const handleReconcileAllSuggested = async () => {
    if (!suggestedMatches.length) return;
    setReconciling(true);
    try {
      const res = await accountingApi.reconcile(
        suggestedMatches.map((m) => ({ statementLineId: m.statementLineId, journalEntryLineId: m.journalEntryLineId }))
      );
      message.success(`Auto-reconciled ${res.reconciledCount} transactions successfully`);
      loadCandidates();
      if (selectedAccountId) {
        accountingApi.listBankStatements({ bankAccountId: selectedAccountId }).then(setStatements);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Auto-reconcile failed');
    } finally {
      setReconciling(false);
    }
  };

  // Import Statement Handler
  const handleImportStatement = async (values: any) => {
    if (!selectedAccountId) return;
    try {
      let parsedLines: Array<{ date: string; description: string; amountPaise: number; reference?: string }> = [];

      if (values.sampleFeed) {
        // Sample simulated bank API feed
        const today = dayjs().format('YYYY-MM-DD');
        const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        if (values.sampleFeed === 'hdfc') {
          parsedLines = [
            { date: today, description: 'NEFT CR-SUPPLIER REFUND / HDFC0001', amountPaise: 4500000, reference: 'HDFCN2600129' },
            { date: today, description: 'CHQ WDL - CHQ NO 847291 TO LOGISTICS', amountPaise: -1500000, reference: 'CHQ847291' },
            { date: yesterday, description: 'UPI/CUSTOMER INWARD / PAYTM / 987654', amountPaise: 250000, reference: 'UPI9876541' },
          ];
        } else if (values.sampleFeed === 'icici') {
          parsedLines = [
            { date: today, description: 'RTGS INWARD CMS VENDOR SETTLEMENT', amountPaise: 12000000, reference: 'ICICIR26044' },
            { date: yesterday, description: 'DEBIT CARD POS SWIPE FUEL EXP', amountPaise: -350000, reference: 'POS09482' },
          ];
        } else {
          parsedLines = [
            { date: today, description: 'IMPS TRANSFER INWARD CLIENT ADVANCE', amountPaise: 5000000, reference: 'SBIN984720' },
          ];
        }
      } else if (values.rawJson) {
        try {
          parsedLines = JSON.parse(values.rawJson);
        } catch {
          message.error('Invalid JSON in raw statement feed');
          return;
        }
      } else {
        parsedLines = [
          {
            date: values.lineDate?.format?.('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
            description: values.lineDescription,
            amountPaise: Math.round(Number(values.lineAmountRupees) * 100),
            reference: values.lineRef,
          },
        ];
      }

      await accountingApi.importBankStatement({
        bankAccountId: selectedAccountId,
        statementDate: values.statementDate?.format?.('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD'),
        openingBalancePaise: Math.round(Number(values.openingBalanceRupees || 0) * 100),
        closingBalancePaise: Math.round(Number(values.closingBalanceRupees || 0) * 100),
        lines: parsedLines,
      });

      message.success('Bank statement feed ingested successfully');
      setImportModalOpen(false);
      importForm.resetFields();
      const updatedStmts = await accountingApi.listBankStatements({ bankAccountId: selectedAccountId });
      setStatements(updatedStmts);
      if (updatedStmts.length > 0) setSelectedStatementId(updatedStmts[0].id);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Import failed');
    }
  };

  // Create Bank Account Handler
  const handleCreateAccount = async (values: any) => {
    try {
      const created = await accountingApi.createBankAccount({
        accountName: values.accountName,
        bankName: values.bankName,
        accountNumber: values.accountNumber,
        ifscCode: values.ifscCode,
        branch: values.branch,
        accountType: values.accountType,
        coaAccountId: values.coaAccountId,
        openingBalancePaise: Math.round(Number(values.openingBalanceRupees || 0) * 100),
        isDefault: !!values.isDefault,
      });
      message.success(`Bank Account ${created.accountName} configured`);
      setNewAccountModalOpen(false);
      accountForm.resetFields();
      const accs = await accountingApi.listBankAccounts();
      setBankAccounts(accs);
      setSelectedAccountId(created.id);
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to create bank account');
    }
  };

  // Unreconcile line action
  const handleUnreconcile = async (lineId: string) => {
    try {
      await accountingApi.unreconcile(lineId);
      message.success('Line unreconciled');
      loadCandidates();
      if (selectedAccountId) {
        accountingApi.listBankStatements({ bankAccountId: selectedAccountId }).then(setStatements);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || 'Failed to unreconcile');
    }
  };

  // Metrics
  const totalUnreconciledStmt = statementLines.filter((l) => l.reconciliationStatus === 'unreconciled').length;
  const totalUnreconciledGl = glLines.length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Bank Reconciliation</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Bank Reconciliation & Feed Matching
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Bi-directional ledger reconciliation between bank feeds and ERP General Ledger
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setNewAccountModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" /> Add Bank Account
          </button>
          <button
            onClick={() => setImportModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <Upload className="w-4 h-4" /> Import Bank Feed
          </button>
          <button
            onClick={loadCandidates}
            disabled={loading}
            className="p-2 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Account & Statement Filters Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">Bank Account:</span>
            <Select
              style={{ minWidth: 260 }}
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              placeholder="Select Bank Account"
              options={bankAccounts.map((b) => ({
                value: b.id,
                label: `${b.bankName} - ${b.accountNumber} (${b.accountName})`,
              }))}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase">Statement:</span>
            <Select
              style={{ minWidth: 240 }}
              value={selectedStatementId}
              onChange={setSelectedStatementId}
              placeholder="Select Statement Period"
              allowClear
              options={statements.map((s) => ({
                value: s.id,
                label: `${dayjs(s.statementDate).format('DD MMM YYYY')} [${s.reconciledLines}/${s.totalLines} Reconciled]`,
              }))}
            />
          </div>
        </div>

        {/* Suggestion Quick Action */}
        {suggestedMatches.length > 0 && (
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-lg text-xs">
            <Zap className="w-4 h-4 text-emerald-600 fill-emerald-600" />
            <span className="text-emerald-900 dark:text-emerald-300 font-medium">
              <strong>{suggestedMatches.length}</strong> Auto-Match Candidates Found!
            </span>
            <Button
              size="small"
              type="primary"
              onClick={handleReconcileAllSuggested}
              loading={reconciling}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Reconcile All ({suggestedMatches.length})
            </Button>
          </div>
        )}
      </div>

      {/* KPI Balance Header */}
      {activeAccount && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 px-6 pt-4">
          <Card size="small" className="border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Bank Master Account</div>
            <div className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1">
              {activeAccount.bankName}
            </div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">
              A/C: {activeAccount.accountNumber} • GL: {activeAccount.coaCode || '1520'}
            </div>
          </Card>

          <Card size="small" className="border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Statement Status</div>
            <div className="text-base font-bold text-slate-800 dark:text-slate-100 mt-1 flex items-center gap-2">
              <Tag color={activeStatement?.status === 'reconciled' ? 'green' : 'gold'}>
                {(activeStatement?.status || 'No statement').toUpperCase()}
              </Tag>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {activeStatement ? `${activeStatement.reconciledLines} of ${activeStatement.totalLines} lines reconciled` : 'Select statement'}
            </div>
          </Card>

          <Card size="small" className="border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Unreconciled Statement Items</div>
            <div className="text-xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
              {totalUnreconciledStmt}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Bank lines pending GL match</div>
          </Card>

          <Card size="small" className="border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="text-xs text-slate-500 font-medium">Unreconciled GL Journal Lines</div>
            <div className="text-xl font-extrabold text-blue-600 dark:text-blue-400 mt-1">
              {totalUnreconciledGl}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">ERP postings pending bank feed</div>
          </Card>
        </div>
      )}

      {/* Dual Ledger Matching Interface */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
        {/* Left Side: Bank Statement Feed Lines */}
        <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                Bank Statement Feed (Inward/Outward)
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {statementLines.length} lines loaded
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <Table
              size="small"
              rowKey="id"
              dataSource={statementLines}
              pagination={{ pageSize: 15, hideOnSinglePage: true }}
              rowClassName={(r) =>
                r.id === selectedStmtLineId
                  ? 'bg-indigo-50/80 dark:bg-indigo-950/40 font-semibold'
                  : ''
              }
              onRow={(record) => ({
                onClick: () => {
                  if (record.reconciliationStatus === 'unreconciled') {
                    setSelectedStmtLineId(record.id === selectedStmtLineId ? null : record.id);
                  }
                },
              })}
              columns={[
                {
                  title: '',
                  width: 36,
                  render: (_, r) => (
                    <input
                      type="radio"
                      checked={r.id === selectedStmtLineId}
                      disabled={r.reconciliationStatus === 'reconciled'}
                      onChange={() => setSelectedStmtLineId(r.id)}
                      className="cursor-pointer"
                    />
                  ),
                },
                {
                  title: 'Date',
                  dataIndex: 'date',
                  width: 95,
                  render: (v) => <span className="text-xs font-mono">{dayjs(v).format('DD-MM-YYYY')}</span>,
                },
                {
                  title: 'Description / Ref',
                  dataIndex: 'description',
                  render: (v, r) => (
                    <div>
                      <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{v || '—'}</div>
                      {r.reference && (
                        <div className="text-[11px] text-slate-400 font-mono">Ref: {r.reference}</div>
                      )}
                    </div>
                  ),
                },
                {
                  title: 'Amount',
                  dataIndex: 'amountPaise',
                  align: 'right',
                  width: 130,
                  render: (v: number) => {
                    const isCredit = v > 0;
                    return (
                      <span className={`font-mono text-xs font-bold ${isCredit ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isCredit ? '+' : ''}₹{(v / 100).toFixed(2)}
                        <span className="text-[10px] ml-1 font-normal text-slate-400">
                          {isCredit ? 'CR' : 'DR'}
                        </span>
                      </span>
                    );
                  },
                },
                {
                  title: 'Status',
                  dataIndex: 'reconciliationStatus',
                  width: 100,
                  align: 'center',
                  render: (st: string, r: any) =>
                    st === 'reconciled' ? (
                      <div className="flex items-center gap-1 justify-center">
                        <Tag color="green">MATCHED</Tag>
                        <Tooltip title="Unreconcile">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnreconcile(r.id);
                            }}
                            className="text-xs text-rose-500 hover:underline"
                          >
                            Undo
                          </button>
                        </Tooltip>
                      </div>
                    ) : (
                      <Tag color="gold">OPEN</Tag>
                    ),
                },
              ]}
            />
          </div>
        </div>

        {/* Right Side: General Ledger Book Journal Lines */}
        <div className="flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                ERP General Ledger (Book Entries)
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              {glLines.length} unreconciled lines
            </span>
          </div>

          <div className="flex-1 overflow-auto">
            <Table
              size="small"
              rowKey="id"
              dataSource={glLines}
              pagination={{ pageSize: 15, hideOnSinglePage: true }}
              rowClassName={(r) =>
                r.id === selectedGlLineId
                  ? 'bg-emerald-50/80 dark:bg-emerald-950/40 font-semibold'
                  : ''
              }
              onRow={(record) => ({
                onClick: () => {
                  setSelectedGlLineId(record.id === selectedGlLineId ? null : record.id);
                },
              })}
              columns={[
                {
                  title: '',
                  width: 36,
                  render: (_, r) => (
                    <input
                      type="radio"
                      checked={r.id === selectedGlLineId}
                      onChange={() => setSelectedGlLineId(r.id)}
                      className="cursor-pointer"
                    />
                  ),
                },
                {
                  title: 'Date',
                  dataIndex: 'postingDate',
                  width: 95,
                  render: (v) => <span className="text-xs font-mono">{dayjs(v).format('DD-MM-YYYY')}</span>,
                },
                {
                  title: 'Doc / Narration',
                  dataIndex: 'documentNumber',
                  render: (v, r) => (
                    <div>
                      <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                        {v || r.documentType}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {r.lineNarration || r.narration || '—'}
                      </div>
                    </div>
                  ),
                },
                {
                  title: 'Debit (Deposit)',
                  dataIndex: 'debitAmountPaise',
                  align: 'right',
                  width: 120,
                  render: (v: number) =>
                    v > 0 ? (
                      <span className="font-mono text-xs font-bold text-emerald-600">
                        ₹{(v / 100).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono text-xs">—</span>
                    ),
                },
                {
                  title: 'Credit (Payment)',
                  dataIndex: 'creditAmountPaise',
                  align: 'right',
                  width: 120,
                  render: (v: number) =>
                    v > 0 ? (
                      <span className="font-mono text-xs font-bold text-rose-600">
                        ₹{(v / 100).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-slate-300 font-mono text-xs">—</span>
                    ),
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Floating Match Control Bar */}
      <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-4 shadow-lg flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-4">
          <div className="text-xs">
            <span className="text-slate-400">Statement Line:</span>{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {selectedStmtLine ? `₹${(Math.abs(selectedStmtLine.amountPaise) / 100).toFixed(2)} (${selectedStmtLine.amountPaise > 0 ? 'CR' : 'DR'})` : 'None'}
            </strong>
          </div>
          <ArrowRightLeft className="w-4 h-4 text-slate-400" />
          <div className="text-xs">
            <span className="text-slate-400">Book GL Line:</span>{' '}
            <strong className="text-slate-800 dark:text-slate-200">
              {selectedGlLine ? `₹${((selectedGlLine.debitAmountPaise || selectedGlLine.creditAmountPaise) / 100).toFixed(2)} (${selectedGlLine.debitAmountPaise > 0 ? 'DR' : 'CR'})` : 'None'}
            </strong>
          </div>
          {selectedStmtLine && selectedGlLine && (
            <Tag color={matchValidation.valid ? 'green' : 'volcano'}>
              {matchValidation.reason}
            </Tag>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="primary"
            disabled={!matchValidation.valid}
            loading={reconciling}
            onClick={handleReconcileSelected}
            className="bg-emerald-600 hover:bg-emerald-700"
            icon={<CheckCheck className="w-4 h-4" />}
          >
            Reconcile Selected Pair
          </Button>
        </div>
      </div>

      {/* Import Statement / Bank API Feed Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" />
            <span className="font-bold">Import Bank Statement / API Feed</span>
          </div>
        }
        open={importModalOpen}
        onCancel={() => setImportModalOpen(false)}
        footer={null}
        width={620}
      >
        <Form form={importForm} layout="vertical" onFinish={handleImportStatement} className="mt-4">
          <Form.Item name="statementDate" label="Statement Date" initialValue={dayjs()} rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="openingBalanceRupees" label="Opening Balance (₹)" initialValue={0}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="closingBalanceRupees" label="Closing Balance (₹)" initialValue={0}>
              <InputNumber style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Divider className="my-2" />

          <div className="mb-3 text-xs text-slate-500 font-semibold">
            Choose Quick Bank Simulation or Manual Line:
          </div>

          <Form.Item name="sampleFeed" label="Major Bank API Simulation">
            <Select
              allowClear
              placeholder="Select Sample Simulated Bank Feed"
              options={[
                { value: 'hdfc', label: 'HDFC Bank API Feed (3 transactions: NEFT refund, Chq wdl, UPI inward)' },
                { value: 'icici', label: 'ICICI Bank Corporate Feed (2 transactions: RTGS settlement, POS fuel)' },
                { value: 'sbi', label: 'State Bank of India Feed (1 transaction: IMPS Client Advance)' },
              ]}
            />
          </Form.Item>

          <div className="text-xs text-slate-400 mb-2">Or enter a single manual line:</div>

          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="lineDate" label="Line Date" initialValue={dayjs()} className="mb-2">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="lineAmountRupees" label="Amount ₹ (positive for credit/deposit, negative for debit)" className="mb-2">
              <InputNumber style={{ width: '100%' }} placeholder="e.g. 50000 or -12500" />
            </Form.Item>
            <Form.Item name="lineDescription" label="Narration / Description" className="mb-0 col-span-2">
              <Input placeholder="e.g. IMPS/UPI/RTGS transfer description" />
            </Form.Item>
            <Form.Item name="lineRef" label="UTR / Cheque Ref" className="mb-0 col-span-2">
              <Input placeholder="e.g. UTR98762412" />
            </Form.Item>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <Button onClick={() => setImportModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" className="bg-indigo-600 hover:bg-indigo-700">
              Ingest & Import Statement
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Configure Bank Account Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            <span className="font-bold">Add New Bank Account Master</span>
          </div>
        }
        open={newAccountModalOpen}
        onCancel={() => setNewAccountModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={accountForm} layout="vertical" onFinish={handleCreateAccount} className="mt-4">
          <Form.Item name="accountName" label="Account Display Name" rules={[{ required: true }]}>
            <Input placeholder="e.g. HDFC Main Operating Account" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="bankName" label="Bank Name" rules={[{ required: true }]}>
              <Input placeholder="e.g. HDFC Bank, ICICI Bank, SBI" />
            </Form.Item>
            <Form.Item name="accountNumber" label="Account Number" rules={[{ required: true }]}>
              <Input placeholder="e.g. 50200012345678" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="ifscCode" label="IFSC Code">
              <Input placeholder="e.g. HDFC0001234" maxLength={11} />
            </Form.Item>
            <Form.Item name="accountType" label="Account Type" initialValue="current">
              <Select
                options={[
                  { value: 'current', label: 'Current Account' },
                  { value: 'savings', label: 'Savings Account' },
                  { value: 'od', label: 'Overdraft Account' },
                  { value: 'cc', label: 'Cash Credit Account' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="coaAccountId"
            label="Linked General Ledger Leaf Account (Chart of Accounts)"
            rules={[{ required: true, message: 'Must link to a GL Account' }]}
            extra="Every bank transaction posts double-entry journal vouchers to this account."
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select Asset/Bank COA Account"
              options={coaAccounts.map((c) => ({
                value: c.id,
                label: `${c.code} — ${c.name} (${c.accountType})`,
              }))}
            />
          </Form.Item>

          <Form.Item name="openingBalanceRupees" label="Opening Balance (₹)" initialValue={0}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>

          <div className="flex justify-end gap-2 mt-5">
            <Button onClick={() => setNewAccountModalOpen(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" className="bg-indigo-600 hover:bg-indigo-700">
              Save Account Master
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

