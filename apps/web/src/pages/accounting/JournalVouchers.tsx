import { useState, useEffect, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Tag, Modal, Form, Input, DatePicker, Select, InputNumber, Alert, message } from 'antd';
import { BookOpen, Plus, Search, CheckCircle2, AlertTriangle, Layers, DollarSign, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

interface JournalLineInput {
  accountId: string;
  partyType?: 'supplier' | 'customer';
  partyId?: string;
  debitAmountRupees: number;
  creditAmountRupees: number;
  narration?: string;
}

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  accountType: string;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  postingDate: string;
  documentType: string;
  documentNumber: string;
  narration: string | null;
  debitAmountPaise: number;
  creditAmountPaise: number;
  accountCode: string;
  accountName: string;
  lineNarration: string | null;
}

export function JournalVouchersPage() {
  const { confirmClose } = useUnsavedChanges();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [coaAccounts, setCoaAccounts] = useState<CoaAccount[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [form] = Form.useForm();
  const [lines, setLines] = useState<JournalLineInput[]>([
    { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
    { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
  ]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const res = await api.get<JournalEntry[]>('/reports/general-ledger');
      setEntries(res.data);
    } catch {
      message.error('Failed to load journal entries');
    } finally {
      setLoading(false);
    }
  };

  const fetchCoa = async () => {
    try {
      const res = await api.get<{ accounts: CoaAccount[] }>('/settings/coa');
      if (res.data?.accounts) {
        setCoaAccounts(res.data.accounts);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchEntries();
    fetchCoa();
  }, []);

  const totalDebitPaise = lines.reduce((sum, l) => sum + Math.round((l.debitAmountRupees || 0) * 100), 0);
  const totalCreditPaise = lines.reduce((sum, l) => sum + Math.round((l.creditAmountRupees || 0) * 100), 0);
  const isBalanced = totalDebitPaise > 0 && totalDebitPaise === totalCreditPaise;

  const handleAddLine = () => {
    setLines([...lines, { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' }]);
  };

  const handleLineChange = (index: number, field: keyof JournalLineInput, value: any) => {
    const next = [...lines];
    next[index] = { ...next[index], [field]: value };
    setLines(next);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 2) {
      message.warning('A journal entry must have at least 2 lines (debit & credit)');
      return;
    }
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleCreateJv = async (values: any) => {
    if (!isBalanced) {
      message.error('Total Debit must equal Total Credit');
      return;
    }

    try {
      const payload = {
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        narration: values.narration,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitAmountPaise: Math.round((l.debitAmountRupees || 0) * 100),
          creditAmountPaise: Math.round((l.creditAmountRupees || 0) * 100),
          narration: l.narration,
        })),
      };

      await api.post('/accounting/jv', payload);
      message.success('Journal Voucher posted successfully');
      setIsModalOpen(false);
      form.resetFields();
      setLines([
        { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
        { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
      ]);
      fetchEntries();
    } catch {
      message.error('Failed to post Journal Voucher');
    }
  };

  // Metrics
  const totalPostings = entries.length;
  const totalDebitedValuePaise = entries.reduce((acc, e) => acc + (e.debitAmountPaise || 0), 0);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return entries;
    const q = searchQuery.toLowerCase();
    return entries.filter(
      (e) =>
        e.entryNumber?.toLowerCase().includes(q) ||
        e.documentNumber?.toLowerCase().includes(q) ||
        e.accountName?.toLowerCase().includes(q) ||
        e.accountCode?.toLowerCase().includes(q) ||
        e.narration?.toLowerCase().includes(q) ||
        e.lineNarration?.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  const columns = [
    {
      title: 'Posting Date',
      dataIndex: 'postingDate',
      key: 'postingDate',
      width: 130,
      render: (val: string) => (
        <span className="text-slate-600 dark:text-slate-300 font-medium">
          {dayjs(val).format('DD MMM YYYY')}
        </span>
      ),
    },
    {
      title: 'Entry / Doc #',
      dataIndex: 'entryNumber',
      key: 'entryNumber',
      width: 160,
      render: (val: string, r: JournalEntry) => (
        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {val || r.documentNumber || 'JV-MANUAL'}
        </span>
      ),
    },
    {
      title: 'Account',
      key: 'account',
      render: (_: any, r: JournalEntry) => (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {r.accountCode}
          </span>
          <span className="font-medium text-slate-900 dark:text-white">
            {r.accountName}
          </span>
        </div>
      ),
    },
    {
      title: 'Debit (₹)',
      dataIndex: 'debitAmountPaise',
      key: 'debitAmountPaise',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" bold />,
    },
    {
      title: 'Credit (₹)',
      dataIndex: 'creditAmountPaise',
      key: 'creditAmountPaise',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="credit" bold />,
    },
    {
      title: 'Narration',
      dataIndex: 'narration',
      key: 'narration',
      render: (val: string, r: JournalEntry) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
          {val || r.lineNarration || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Journal Vouchers</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Journal Vouchers (JV)
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manual general ledger postings & double-entry adjustments
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          New Journal Voucher
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Postings</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{totalPostings}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">General ledger journal lines</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Debited Value</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={totalDebitedValuePaise} variant="debit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative debited ledger balance</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ledger Invariant</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              Balanced
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Double-entry debit = credit enforced</div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by entry #, account name, code, or narration..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <Table
            rowKey="id"
            loading={loading}
            dataSource={filteredEntries}
            columns={columns}
            pagination={{ pageSize: 15 }}
          />
        </div>
      </div>

      {/* Manual JV Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Create Manual Journal Voucher
          </div>
        }
        open={isModalOpen}
        onCancel={async () => {
          if (await confirmClose(form, { content: 'You have an unsaved journal voucher. Discard it?' })) {
            form.resetFields();
            setLines([
              { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
              { accountId: '', debitAmountRupees: 0, creditAmountRupees: 0, narration: '' },
            ]);
            setIsModalOpen(false);
          }
        }}
        width={900}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateJv} initialValues={{ postingDate: dayjs() }}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Form.Item
              name="postingDate"
              label="Posting Date"
              rules={[{ required: true, message: 'Date required' }]}
            >
              <DatePicker format="YYYY-MM-DD" className="w-full" />
            </Form.Item>

            <div className="sm:col-span-2">
              <Form.Item name="narration" label="Header Narration">
                <Input placeholder="Business reason for manual journal entry" />
              </Form.Item>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mb-4">
            <Table
              pagination={false}
              dataSource={lines.map((l, idx) => ({ ...l, key: idx }))}
              columns={[
                {
                  title: 'Account',
                  key: 'account',
                  width: 320,
                  render: (_, __, idx) => (
                    <Select
                      showSearch
                      placeholder="Select Account"
                      value={lines[idx].accountId || undefined}
                      onChange={(val) => handleLineChange(idx, 'accountId', val)}
                      filterOption={(input, option) =>
                        ((option?.label ?? '') as string).toLowerCase().includes(input.toLowerCase())
                      }
                      options={coaAccounts.map((a) => ({
                        value: a.id,
                        label: `${a.code} — ${a.name} (${a.accountType})`,
                      }))}
                      className="w-full"
                    />
                  ),
                },
                {
                  title: 'Debit (₹)',
                  key: 'debit',
                  width: 140,
                  render: (_, __, idx) => (
                    <InputNumber
                      min={0}
                      precision={2}
                      value={lines[idx].debitAmountRupees}
                      onChange={(val) => {
                        handleLineChange(idx, 'debitAmountRupees', val || 0);
                        if (val && val > 0) handleLineChange(idx, 'creditAmountRupees', 0);
                      }}
                      className="w-full"
                    />
                  ),
                },
                {
                  title: 'Credit (₹)',
                  key: 'credit',
                  width: 140,
                  render: (_, __, idx) => (
                    <InputNumber
                      min={0}
                      precision={2}
                      value={lines[idx].creditAmountRupees}
                      onChange={(val) => {
                        handleLineChange(idx, 'creditAmountRupees', val || 0);
                        if (val && val > 0) handleLineChange(idx, 'debitAmountRupees', 0);
                      }}
                      className="w-full"
                    />
                  ),
                },
                {
                  title: 'Line Narration',
                  key: 'lineNarration',
                  render: (_, __, idx) => (
                    <Input
                      placeholder="Line note"
                      value={lines[idx].narration}
                      onChange={(e) => handleLineChange(idx, 'narration', e.target.value)}
                    />
                  ),
                },
                {
                  title: 'Action',
                  key: 'action',
                  width: 60,
                  align: 'center' as const,
                  render: (_, __, idx) => (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ),
                },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={handleAddLine}
            className="w-full py-2 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1.5 transition-all mb-4"
          >
            <Plus className="w-4 h-4" />
            Add Journal Line
          </button>

          {/* Balance Verification Bar */}
          <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 mb-4">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
              <div>
                {isBalanced ? (
                  <Tag color="success" className="px-2.5 py-1 text-xs font-semibold rounded-lg">
                    ✓ Double-Entry Balanced
                  </Tag>
                ) : (
                  <Tag color="error" className="px-2.5 py-1 text-xs font-semibold rounded-lg">
                    ✕ Unbalanced Entry
                  </Tag>
                )}
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs mr-2">Total Debit:</span>
                  <AmountDisplay paise={totalDebitPaise} variant="debit" bold />
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs mr-2">Total Credit:</span>
                  <AmountDisplay paise={totalCreditPaise} variant="credit" bold />
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400 text-xs mr-2">Difference:</span>
                  <AmountDisplay paise={Math.abs(totalDebitPaise - totalCreditPaise)} variant="neutral" bold />
                </div>
              </div>
            </div>
          </div>

          {!isBalanced && (
            <Alert
              type="warning"
              message="Total debit must equal total credit before posting."
              showIcon
              className="mb-4"
            />
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow-xs transition-all"
            >
              Post Journal Voucher
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default JournalVouchersPage;
