import React, { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Button, Drawer, Form, DatePicker, Select, Input, InputNumber, Popconfirm, message } from 'antd';
import { 
  ArrowRightLeft, Plus, Trash2, CheckCircle2, XCircle, Search, 
  ArrowUpCircle, ArrowDownCircle, AlertTriangle 
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

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 flex justify-between items-center shrink-0 transition-colors relative z-10">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
            <ArrowRightLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white transition-colors">Stock Adjustments</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors">Physical count corrections & write-offs — GL posted on approval</p>
          </div>
        </div>
        <button 
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ postingDate: dayjs(), adjustmentType: 'physical_count' });
            setLines([newLine()]);
            setDrawer(true);
          }}
          className="flex items-center px-4 py-2 bg-emerald-600 dark:bg-emerald-600/90 text-white font-bold rounded-lg shadow-sm hover:bg-emerald-700 dark:hover:bg-emerald-500 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> New Adjustment
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search documents..." 
              className="pl-9 pr-4 py-2 w-64 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
            />
          </div>
          <Select 
            allowClear 
            placeholder="All Statuses" 
            value={statusFilter} 
            onChange={setStatusFilter} 
            style={{ minWidth: 150 }} 
            options={STATUS_OPTIONS} 
          />
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors min-h-[400px]">
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
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="font-mono font-bold text-cyan-700 dark:text-cyan-400 transition-colors">{r.documentNumber}</span>
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
                        <button onClick={() => act(r, 'submit')} className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-800 dark:hover:text-cyan-300 text-xs font-bold transition-colors">
                          Submit
                        </button>
                      )}
                      {r.status === 'submitted' && (
                        <>
                          <button onClick={() => act(r, 'approve')} className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors">
                            <CheckCircle2 className="w-4 h-4 mr-1" /> Approve
                          </button>
                          <button onClick={() => act(r, 'reject')} className="flex items-center text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold transition-colors ml-3">
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
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
