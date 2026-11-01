import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, message, Modal, Segmented, InputNumber, Button } from 'antd';
import dayjs from 'dayjs';
import {
  Anchor, Plus, Eye, CheckCircle2, Search, Calendar,
  Building2, DollarSign, Layers, Trash2, ArrowUpRight, TrendingUp, AlertCircle
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { purchaseApi, type PurchaseHeader } from '../../api/purchase';
import { settingsApi } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { apiErr } from '../_shared/txn';

interface LcvHeader {
  id: string;
  documentNumber: string;
  status: string;
  postingDate: string;
  allocationBasis: 'by_value' | 'by_qty';
  totalChargesPaise: number;
  remarks?: string;
  journalEntryId?: string;
  createdAt: string;
}

interface ExpenseLineDraft {
  expenseAccountId: string;
  description: string;
  amountRupees: number;
}

export function LandedCostVouchersPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { user } = useAuthStore();
  const [form] = Form.useForm();

  const [rows, setRows] = useState<LcvHeader[]>([]);
  const [grns, setGrns] = useState<PurchaseHeader[]>([]);
  const [accounts, setAccounts] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [expenseLines, setExpenseLines] = useState<ExpenseLineDraft[]>([
    { expenseAccountId: '', description: 'Inbound Freight Charges', amountRupees: 0 },
  ]);

  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState<any | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.landedCostVouchers.list(company.id)
      .then((r: any) => setRows(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.grns.list(company.id, { status: 'approved' })
      .then((r: any) => setGrns(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => {});

    settingsApi.listAccounts(company.id)
      .then((r: any) => {
        const list = Array.isArray(r) ? r : (r.data ?? []);
        setAccounts(list.map((a: any) => ({ id: a.id, code: a.code, name: a.name })));
      })
      .catch(() => {});
  }, [company?.id]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch = r.documentNumber.toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [rows, searchQuery]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      postingDate: dayjs(),
      allocationBasis: 'by_value',
    });
    setExpenseLines([{ expenseAccountId: '', description: 'Inbound Freight Charges', amountRupees: 0 }]);
    setDrawer(true);
  };

  const addExpenseLine = () => {
    setExpenseLines([...expenseLines, { expenseAccountId: '', description: '', amountRupees: 0 }]);
  };

  const removeExpenseLine = (index: number) => {
    if (expenseLines.length <= 1) return;
    setExpenseLines(expenseLines.filter((_, i) => i !== index));
  };

  const updateExpenseLine = (index: number, field: keyof ExpenseLineDraft, val: any) => {
    const updated = [...expenseLines];
    updated[index] = { ...updated[index], [field]: val };
    setExpenseLines(updated);
  };

  const totalChargesPaise = useMemo(() => {
    return expenseLines.reduce((sum, e) => sum + Math.round((e.amountRupees || 0) * 100), 0);
  }, [expenseLines]);

  const handleCreate = async (values: any) => {
    if (!plant?.id) {
      message.error('Please select an active plant');
      return;
    }
    const validExpenses = expenseLines.filter((e) => e.expenseAccountId && e.amountRupees > 0);
    if (validExpenses.length === 0) {
      message.error('Please add at least one expense line with an account and amount');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        plantId: plant.id,
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        allocationBasis: values.allocationBasis,
        applicableGrnIds: values.applicableGrnIds,
        remarks: values.remarks,
        expenseLines: validExpenses.map((e) => ({
          expenseAccountId: e.expenseAccountId,
          description: e.description || 'Landed charge',
          amountPaise: Math.round(e.amountRupees * 100),
        })),
      };

      await purchaseApi.landedCostVouchers.create(payload);
      message.success('Landed Cost Voucher created in draft status');
      setDrawer(false);
      load();
    } catch (err) {
      message.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePost = async (id: string) => {
    setPostingId(id);
    try {
      const res = await purchaseApi.landedCostVouchers.post(id);
      message.success(`LCV posted! Absorbed: ₹${(res.totalAbsorbed / 100).toLocaleString('en-IN')}, COGS Variance: ₹${(res.totalCogsVariance / 100).toLocaleString('en-IN')}`);
      load();
      if (viewing?.id === id) {
        viewDetails(id);
      }
    } catch (err) {
      message.error(apiErr(err));
    } finally {
      setPostingId(null);
    }
  };

  const viewDetails = async (id: string) => {
    if (!company?.id) return;
    try {
      const data = await purchaseApi.landedCostVouchers.get(company.id, id);
      setViewing(data);
    } catch (err) {
      message.error(apiErr(err));
    }
  };

  const totalVouchers = rows.length;
  const postedVouchers = rows.filter((r) => r.status === 'approved' || r.status === 'posted').length;
  const totalLandedPaise = rows.reduce((s, r) => s + (r.totalChargesPaise || 0), 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <Anchor className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Procurement</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Landed Cost Vouchers</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Landed Cost Vouchers (LCV)
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                GAP 3
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Capitalize inbound freight, customs duties, and clearing fees into stock unit valuation (WAC).
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          New Landed Cost Voucher
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Vouchers</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2">{totalVouchers}</div>
          <div className="text-xs text-slate-400 mt-1">Landed cost documents</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Capitalized & Posted</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{postedVouchers}</div>
          <div className="text-xs text-slate-400 mt-1">Valuation adjusted in SLE</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Landed Apportioned</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2">
            <AmountDisplay paise={totalLandedPaise} />
          </div>
          <div className="text-xs text-slate-400 mt-1">Freight & duty capitalized</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by voucher number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
          />
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Voucher Number</th>
                <th className="px-5 py-3.5">Posting Date</th>
                <th className="px-5 py-3.5">Allocation Basis</th>
                <th className="px-5 py-3.5">Total Landed Cost</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading landed cost vouchers...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No Landed Cost Vouchers found. Create one to capitalize freight and customs charges.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-semibold text-indigo-600 dark:text-indigo-400">
                      {r.documentNumber}
                    </td>
                    <td className="px-5 py-4">
                      {dayjs(r.postingDate).format('DD MMM YYYY')}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {r.allocationBasis === 'by_qty' ? 'By Quantity' : 'By Value'}
                      </span>
                    </td>
                    <td className="px-5 py-4 font-medium">
                      <AmountDisplay paise={r.totalChargesPaise} />
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={r.status as DocumentStatus} />
                    </td>
                    <td className="px-5 py-4 text-right space-x-2">
                      <button
                        onClick={() => viewDetails(r.id)}
                        className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="View Allocation Breakdown"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {r.status === 'draft' && (
                        <button
                          onClick={() => handlePost(r.id)}
                          disabled={postingId === r.id}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-50"
                        >
                          {postingId === r.id ? 'Posting...' : 'Post & Capitalize'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Create LCV Drawer */}
      <Drawer
        title="Create Landed Cost Voucher"
        width={750}
        open={drawer}
        onClose={() => setDrawer(false)}
        extra={
          <button
            onClick={() => form.submit()}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Draft'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item name="postingDate" label="Posting Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="allocationBasis" label="Allocation Basis" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'by_value', label: 'By Item Value (Paise)' },
                  { value: 'by_qty', label: 'By Item Quantity' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item
            name="applicableGrnIds"
            label="Applicable Goods Receipt Notes (GRN)"
            rules={[{ required: true, message: 'Select at least one GRN' }]}
          >
            <Select
              mode="multiple"
              placeholder="Select approved GRNs to absorb charges"
              options={grns.map((g) => ({
                value: g.id,
                label: `${g.documentNumber} (${dayjs(g.postingDate).format('DD MMM YYYY')}) — ₹${(g.totalAmountPaise / 100).toLocaleString('en-IN')}`,
              }))}
            />
          </Form.Item>

          {/* Landed Expense Lines */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Landed Charges & Expense Accounts</h3>
              <button
                type="button"
                onClick={addExpenseLine}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Add Charge Line
              </button>
            </div>

            <div className="space-y-3">
              {expenseLines.map((line, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col sm:flex-row items-center gap-3">
                  <div className="flex-1 w-full">
                    <label className="text-[11px] text-slate-400 block mb-1">Expense / Clearing Account</label>
                    <Select
                      className="w-full"
                      placeholder="Select Account"
                      value={line.expenseAccountId || undefined}
                      onChange={(val) => updateExpenseLine(idx, 'expenseAccountId', val)}
                      showSearch
                      filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                      options={accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }))}
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <label className="text-[11px] text-slate-400 block mb-1">Description</label>
                    <Input
                      value={line.description}
                      onChange={(e) => updateExpenseLine(idx, 'description', e.target.value)}
                      placeholder="Freight, Duty..."
                    />
                  </div>
                  <div className="w-full sm:w-36">
                    <label className="text-[11px] text-slate-400 block mb-1">Amount (₹)</label>
                    <InputNumber
                      className="w-full"
                      min={0}
                      value={line.amountRupees}
                      onChange={(val) => updateExpenseLine(idx, 'amountRupees', val || 0)}
                    />
                  </div>
                  {expenseLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExpenseLine(idx)}
                      className="p-1 text-slate-400 hover:text-rose-500 mt-4 sm:mt-5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl mt-3 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-300">Total Landed Apportionment:</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                ₹{(totalChargesPaise / 100).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <Form.Item name="remarks" label="Notes / Bill Reference">
            <Input.TextArea rows={2} placeholder="Bill of lading, transporter consignment note, customs bill of entry..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* LCV Detail & Valuation Drill-down Drawer */}
      <Drawer
        title={`Landed Cost Voucher ${viewing?.documentNumber ?? ''}`}
        width={750}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div className="space-y-6 text-sm">
            {/* Header info */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-base">
                  Total Landed Charges: <AmountDisplay paise={viewing.totalChargesPaise} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Basis: {viewing.allocationBasis === 'by_qty' ? 'Proportional to Quantity' : 'Proportional to Net Value'} • Posted {dayjs(viewing.postingDate).format('DD MMM YYYY')}
                </div>
              </div>
              <StatusBadge status={viewing.status as DocumentStatus} />
            </div>

            {/* Applicable GRNs */}
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Applicable GRNs</h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {viewing.applicableGrns?.map((g: any) => (
                  <div key={g.id} className="p-3 flex items-center justify-between bg-white dark:bg-slate-900">
                    <div>
                      <div className="font-medium text-indigo-600 dark:text-indigo-400">{g.documentNumber}</div>
                      <div className="text-xs text-slate-400">{g.supplierName} • {dayjs(g.postingDate).format('DD MMM YYYY')}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Allocated Extra Cost:</div>
                      <div className="font-semibold text-emerald-600 dark:text-emerald-400">
                        <AmountDisplay paise={g.allocatedChargesPaise} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expense accounts */}
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">Expense / Clearing Lines</h4>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {viewing.expenseLines?.map((e: any) => (
                  <div key={e.id} className="p-3 flex items-center justify-between bg-white dark:bg-slate-900">
                    <div>
                      <div className="font-medium">{e.description}</div>
                      <div className="text-xs text-slate-400">{e.accountCode} - {e.accountName}</div>
                    </div>
                    <div className="font-medium">
                      <AmountDisplay paise={e.amountPaise} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Item Allocation Breakdown */}
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-2">
                Item Valuation Absorption Breakdown
              </h4>
              <div className="space-y-2">
                {viewing.allocatedItems?.map((item: any) => (
                  <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-slate-900 dark:text-white">{item.itemName}</div>
                        <div className="text-xs text-slate-400">{item.itemCode} • Qty: {item.quantity}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                          +<AmountDisplay paise={item.allocatedChargePaise} />
                        </div>
                      </div>
                    </div>
                    {viewing.status === 'approved' && (
                      <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700/40 flex justify-between text-xs text-slate-500">
                        <span>Absorbed into WAC: <span className="font-semibold text-emerald-600 dark:text-emerald-400"><AmountDisplay paise={item.absorbedPaise} /></span></span>
                        {item.cogsVariancePaise > 0 && (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">COGS Variance (Zero stock): <AmountDisplay paise={item.cogsVariancePaise} /></span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
