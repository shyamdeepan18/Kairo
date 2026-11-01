import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Button, Drawer, Form, DatePicker, Select, Input, InputNumber, Popconfirm, message } from 'antd';
import { 
  ArrowRightLeft, Plus, Trash2, CheckCircle2, XCircle, Search, 
  ArrowUpCircle, ArrowDownCircle, AlertTriangle, FileText, Calendar, 
  DollarSign, Clock, ShieldCheck, ClipboardList 
} from 'lucide-react';
import dayjs from 'dayjs';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { STATUS_OPTIONS } from '../_shared/txn';

interface DraftLine {
  key: number;
  itemId?: string;
  movementType: 'adjustment_in' | 'adjustment_out';
  quantity: number;
  uom?: string;
  valuationRatePaise: number;
  description?: string;
}

let seq = 1;
const newLine = (): DraftLine => ({ key: seq++, movementType: 'adjustment_in', quantity: 1, valuationRatePaise: 0 });

export function StockAdjustmentsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    inventoryApi.adjustments.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(invErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);
  
  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
  }, [company?.id, plant?.id]);

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      warehouseId: v.warehouseId,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      adjustmentType: v.adjustmentType || 'physical_count',
      reason: v.reason || undefined,
      lines: valid.map((l) => ({
        itemId: l.itemId,
        movementType: l.movementType,
        quantity: l.quantity,
        uom: l.uom ?? 'NOS',
        valuationRatePaise: Math.round((l.valuationRatePaise || 0) * 100),
        description: l.description || undefined,
      })),
    };
    
    try {
      await inventoryApi.adjustments.create(body);
      message.success('Stock adjustment created.');
      setDrawer(false);
      load();
    } catch (e) {
      message.error(invErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: any, action: 'submit' | 'approve' | 'reject') => {
    if (!company?.id) return;
    try {
      if (action === 'submit') await inventoryApi.adjustments.submit(r.id, company.id);
      else if (action === 'approve') await inventoryApi.adjustments.approve(r.id, company.id);
      else await inventoryApi.adjustments.reject(r.id, company.id);
      message.success(`Adjustment ${action}d.`);
      load();
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      (r.reason && r.reason.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  const totalAdjustments = rows.length;
  const totalAdjustedValuePaise = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.totalAmountPaise || 0), 0);
  }, [rows]);
  const pendingAdjustments = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const approvedAdjustments = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 rounded-xl">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Inventory</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Adjustments</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Stock Adjustments
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Physical count audits, cycle count reconciliations, and inventory write-offs (posts movement & GL)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ postingDate: dayjs(), adjustmentType: 'physical_count' });
              setLines([newLine()]);
              setDrawer(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Adjustment
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Adjustments</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalAdjustments}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Physical audits logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Net Value Shift</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalAdjustedValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Inventory valuation variance
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
              {pendingAdjustments}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting audit sign-off
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved & Reconciled</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedAdjustments}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Movement ledger posted
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search documents or reasons..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
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
                Adjustment Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Physical inventory corrections and variance ledger adjustments
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} adjustments
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">Document</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold">Type</th>
                <th className="px-6 py-4 font-bold text-right">Value (₹)</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredRows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium transition-colors">{r.postingDate}</td>
                  <td className="px-6 py-4 text-slate-800 dark:text-slate-200 font-bold capitalize transition-colors">{r.adjustmentType?.replace('_', ' ')}</td>
                  <td className="px-6 py-4 text-right font-mono text-slate-900 dark:text-white font-medium transition-colors">
                    <AmountDisplay paise={r.totalAmountPaise} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={r.status as DocumentStatus} size="small" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {r.status === 'draft' && (
                        <button onClick={() => act(r, 'submit')} className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-bold transition-colors cursor-pointer">
                          Submit
                        </button>
                      )}
                      {r.status === 'submitted' && (
                        <>
                          <button onClick={() => act(r, 'approve')} className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors cursor-pointer">
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                          </button>
                          <button onClick={() => act(r, 'reject')} className="flex items-center text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold transition-colors ml-3 cursor-pointer">
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 transition-colors">
                    <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No adjustments found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer
        title={<span className="font-bold text-slate-900">New Stock Adjustment</span>}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={900}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg shadow-sm hover:bg-emerald-700 transition-colors">
            {saving ? 'Creating...' : 'Create'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]} className="mb-0">
              <Select options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            </Form.Item>
            <Form.Item name="adjustmentType" label="Adjustment Type" className="mb-0">
              <Select options={[
                { value: 'physical_count', label: 'Physical Count' },
                { value: 'write_off',      label: 'Write Off' },
                { value: 'opening_balance',label: 'Opening Balance' },
                { value: 'other',          label: 'Other' },
              ]} />
            </Form.Item>
            <Form.Item name="postingDate" label="Posting Date" rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label="Reason" className="mb-0">
            <Input.TextArea rows={2} className="rounded-lg" />
          </Form.Item>

          <div className="pt-4 mt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800">Adjustment Lines</h3>
              <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className="flex items-center text-xs font-bold text-cyan-600 bg-cyan-50 px-3 py-1.5 rounded hover:bg-cyan-100 transition-colors">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
              </button>
            </div>
            
            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-bold w-32">Direction</th>
                    <th className="px-4 py-3 font-bold">Item</th>
                    <th className="px-4 py-3 font-bold w-24">Qty</th>
                    <th className="px-4 py-3 font-bold w-20">UOM</th>
                    <th className="px-4 py-3 font-bold w-32">Rate (₹)</th>
                    <th className="px-4 py-3 font-bold text-right w-24">Value</th>
                    <th className="px-4 py-3 font-bold w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l) => (
                    <tr key={l.key} className="bg-white">
                      <td className="px-4 py-2">
                        <Select size="small" value={l.movementType} onChange={(val) => setLine(l.key, { movementType: val as any })} style={{ width: 110 }}>
                          <Select.Option value="adjustment_in"><div className="flex items-center text-emerald-600"><ArrowUpCircle className="w-3 h-3 mr-1" /> In</div></Select.Option>
                          <Select.Option value="adjustment_out"><div className="flex items-center text-rose-600"><ArrowDownCircle className="w-3 h-3 mr-1" /> Out</div></Select.Option>
                        </Select>
                      </td>
                      <td className="px-4 py-2">
                        <Select
                          size="small" showSearch optionFilterProp="label" value={l.itemId} style={{ width: '100%', minWidth: 150 }}
                          onChange={(val) => {
                            const it = items.find((i) => i.id === val);
                            setLine(l.key, { itemId: val, uom: it?.primaryUom });
                          }}
                          options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <InputNumber size="small" value={l.quantity} min={0.0001} style={{ width: 80 }} onChange={(val) => setLine(l.key, { quantity: val ?? 0 })} />
                      </td>
                      <td className="px-4 py-2">
                        <Input size="small" value={l.uom} style={{ width: 60 }} onChange={(e) => setLine(l.key, { uom: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <InputNumber size="small" value={l.valuationRatePaise} min={0} precision={2} style={{ width: 100 }} onChange={(val) => setLine(l.key, { valuationRatePaise: val ?? 0 })} prefix="₹" />
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-medium text-slate-700">
                        ₹{((l.valuationRatePaise || 0) * (l.quantity || 0)).toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Popconfirm title="Remove line?" onConfirm={() => setLines((ls) => ls.filter((line) => line.key !== l.key))}>
                          <button type="button" className="text-rose-400 hover:text-rose-600 p-1"><Trash2 className="w-4 h-4" /></button>
                        </Popconfirm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end mt-4 p-3 bg-slate-50 rounded-lg">
              <span className="text-slate-500 mr-2">Total Value Adjustment:</span>
              <span className="font-bold font-mono text-slate-900 text-lg">
                ₹{lines.reduce((s, l) => s + (l.valuationRatePaise || 0) * (l.quantity || 0), 0).toFixed(2)}
              </span>
            </div>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}

export default StockAdjustmentsPage;
