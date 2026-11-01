import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Drawer, Form, DatePicker, Input, Select, InputNumber,
  message, Button,
} from 'antd';
import dayjs from 'dayjs';
import { CreditCard, Plus, Eye, Send, CheckCircle2, Search, FileText, Building2, Calendar, ClipboardList, Trash2, DollarSign, Clock, ShieldCheck } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { STATUS_OPTIONS, apiErr } from '../_shared/txn';

interface DraftAllocation {
  key: number;
  invoiceId?: string;
  amountRupees: number;
}

let allocSeq = 1;
const newAllocation = (): DraftAllocation => ({ key: allocSeq++, amountRupees: 0 });

export function PurchasePaymentsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseHeader[]>([]);
  const [allocations, setAllocations] = useState<DraftAllocation[]>([newAllocation()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState<any | null>(null);

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.payments.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    purchaseApi.invoices.list(company.id, { status: 'approved' }).then((r) => setInvoices(r.data)).catch(() => {});
  }, [company?.id]);

  const selectedSupplierId = Form.useWatch('supplierId', form);

  const availableInvoices = invoices.filter((i) => {
    if (i.paymentStatus === 'paid') return false;
    if (selectedSupplierId && i.supplierId !== selectedSupplierId) return false;
    return true;
  });

  const handleInvoiceSelect = (key: number, invId: string) => {
    const inv = invoices.find((i) => i.id === invId);
    let amountRupees = 0;
    if (inv) {
      const paid = inv.paidAmountPaise ?? 0;
      const duePaise = Math.max(0, inv.totalAmountPaise - paid);
      amountRupees = duePaise / 100;
    }
    setAlloc(key, { invoiceId: invId, amountRupees });
    if (inv?.supplierId && !form.getFieldValue('supplierId')) {
      form.setFieldsValue({ supplierId: inv.supplierId });
    }
  };

  const setAlloc = (key: number, patch: Partial<DraftAllocation>) =>
    setAllocations((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totalPaise = allocations.reduce((s, a) => s + Math.round((a.amountRupees || 0) * 100), 0);

  const openNew = () => {
    form.resetFields();
    form.setFieldsValue({ postingDate: dayjs(), paymentMode: 'bank_transfer' });
    setAllocations([newAllocation()]);
    setDrawer(true);
  };

  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = allocations.filter((a) => a.invoiceId && a.amountRupees > 0);
    if (!valid.length) { message.error('Add at least one allocation'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: v.supplierId,
      paymentMode: v.paymentMode ?? 'bank_transfer',
      bankReference: v.referenceNumber,
      remarks: v.remarks,
      paidAmountPaise: totalPaise,
      allocations: valid.map((a) => ({ invoiceId: a.invoiceId, allocatedAmountPaise: Math.round((a.amountRupees || 0) * 100) })),
    };
    try {
      await purchaseApi.payments.create(body);
      message.success('Payment created.');
      setDrawer(false);
      load();
    } catch (e) {
      message.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: PurchaseHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try {
      await purchaseApi.payments.act(r.id, a, company.id);
      message.success(`Payment ${a}d.`);
      load();
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: PurchaseHeader) => {
    if (!company?.id) return;
    try {
      setViewing(await purchaseApi.payments.get(company.id, row.id));
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      supplierName(r.supplierId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, suppliers]);

  const totalPayments = rows.length;
  const totalDisbursedPaise = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.totalAmountPaise || 0), 0);
  }, [rows]);
  const pendingPayments = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const approvedPayments = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <CreditCard className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Purchase</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Payments</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Purchase Payments
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Supplier disbursement records and Accounts Payable settlement (DR AP / CR Bank)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Payment
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Disbursements</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <CreditCard className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalPayments}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Vouchers issued
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Paid Value</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalDisbursedPaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Bank / Cash released
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Approvals</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingPayments}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting treasury clearance
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Settled & Posted</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedPayments}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              AP balances reduced
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search Payment number or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>
          <Select
            allowClear
            placeholder="All Statuses"
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-44"
            options={STATUS_OPTIONS}
          />
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Payment Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Disbursements, payment modes, and invoice clearing
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} payments
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">Payment No.</th>
                <th className="px-6 py-4 font-bold">Supplier</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-right">Amount (₹)</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium transition-colors">{supplierName(r.supplierId)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">{r.postingDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-900 dark:text-white font-bold transition-colors">
                    <AmountDisplay paise={r.totalAmountPaise} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={r.status as DocumentStatus} size="small" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button onClick={() => openView(r)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer" title="View details">
                        <Eye className="w-4 h-4" />
                      </button>

                      {r.status === 'draft' && (
                        <button onClick={() => act(r, 'submit')} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors cursor-pointer">
                          <Send className="w-3.5 h-3.5 mr-1" /> Submit
                        </button>
                      )}

                      {r.status === 'submitted' && (
                        <button onClick={() => act(r, 'approve')} className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors cursor-pointer">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 transition-colors">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No payments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Drawer */}
      <Drawer
        title={<span className="font-bold text-slate-900 dark:text-white">New Purchase Payment</span>}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={900}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-indigo-600 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
            {saving ? 'Saving...' : 'Create Payment'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="supplierId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" placeholder="Select supplier" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Payment Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="paymentMode" label={<span className="font-bold text-slate-700 dark:text-slate-300">Payment Mode</span>} className="mb-0">
              <Select options={[
                { value: 'bank_transfer', label: 'Bank Transfer' },
                { value: 'cheque', label: 'Cheque' },
                { value: 'cash', label: 'Cash' },
                { value: 'upi', label: 'UPI' }
              ]} />
            </Form.Item>
            <Form.Item name="referenceNumber" label={<span className="font-bold text-slate-700 dark:text-slate-300">Reference / UTR / Cheque No.</span>} className="mb-0 col-span-4">
              <Input placeholder="Transaction reference / UTR number" />
            </Form.Item>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <CreditCard className="w-4 h-4 mr-2 text-indigo-600" /> Invoice Allocations
              </h3>
              <Button size="small" onClick={() => setAllocations((ls) => [...ls, newAllocation()])}>+ Add Row</Button>
            </div>

            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 font-bold">Purchase Invoice</th>
                    <th className="px-4 py-2 font-bold text-right w-44">Allocated (₹)</th>
                    <th className="px-4 py-2 text-center w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {allocations.map((a) => (
                    <tr key={a.key}>
                      <td className="px-4 py-2">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          placeholder="Select invoice to allocate"
                          style={{ width: '100%' }}
                          value={a.invoiceId}
                          onChange={(v) => handleInvoiceSelect(a.key, v)}
                          options={availableInvoices.map((i) => {
                            const paid = i.paidAmountPaise ?? 0;
                            const dueRupees = ((i.totalAmountPaise - paid) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            return { value: i.id, label: `${i.documentNumber} — ${supplierName(i.supplierId)} (Due: ₹${dueRupees})` };
                          })}
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <InputNumber
                          min={0}
                          step={0.01}
                          value={a.amountRupees}
                          onChange={(v) => setAlloc(a.key, { amountRupees: Number(v) || 0 })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600 transition-colors"
                          onClick={() => setAllocations((ls) => ls.filter((x) => x.key !== a.key))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 rounded-lg">
              <div className="text-right">
                <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider mr-2">Total Payment Amount:</span>
                <span className="font-mono text-lg font-black text-indigo-700"><AmountDisplay paise={totalPaise} /></span>
              </div>
            </div>
          </div>

          <Form.Item name="remarks" label={<span className="font-bold text-slate-700 dark:text-slate-300">Remarks</span>} className="mt-4">
            <Input.TextArea rows={2} className="rounded-lg" placeholder="Notes, payment clearing details, etc." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* View Drawer */}
      <Drawer
        title={
          <div className="flex items-center space-x-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'Purchase Payment'}</span>
          </div>
        }
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={800}
      >
        {viewing && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Supplier</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">{supplierName(viewing.supplierId)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Date</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">{viewing.postingDate}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Status</p>
                <div className="mt-1"><StatusBadge status={viewing.status} size="small" /></div>
              </div>
            </div>

            <div className="flex justify-end p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 rounded-lg">
              <div className="flex flex-col items-end">
                <p className="text-sm font-bold text-indigo-800">Total Payment Amount</p>
                <p className="font-mono text-2xl font-black text-indigo-700 mt-1"><AmountDisplay paise={viewing.totalAmountPaise} /></p>
              </div>
            </div>

            {viewing.allocations && viewing.allocations.length > 0 && (
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Allocations</h3>
                <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 border-b text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 font-bold">Invoice ID</th>
                        <th className="px-4 py-3 font-bold text-right">Allocated Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {viewing.allocations.map((a: any, i: number) => (
                        <tr key={i} className="bg-white dark:bg-slate-900">
                          <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{a.invoiceId}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-indigo-700"><AmountDisplay paise={a.amountPaise} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default PurchasePaymentsPage;
