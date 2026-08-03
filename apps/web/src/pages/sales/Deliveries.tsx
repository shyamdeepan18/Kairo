import React, { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Select, message } from 'antd';
import dayjs from 'dayjs';
import { Truck, Plus, Eye, Send, CheckCircle2, Search, FileBox, User, Calendar, ClipboardList } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { salesApi, type SalesHeader, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { STATUS_OPTIONS, apiErr, LinesEditor, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

export function DeliveriesPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  
  const [rows, setRows] = useState<SalesHeader[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sos, setSos] = useState<SalesHeader[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewing, setViewing] = useState<any | null>(null);

  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    salesApi.deliveries.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    salesApi.customers.list(company.id).then((r) => setCustomers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
    salesApi.orders.list(company.id, { status: 'approved' }).then((r) => setSos(r.data)).catch(() => {});
  }, [company?.id, plant?.id]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      customerId: v.customerId, soId: v.soId, warehouseId: v.warehouseId,
      lines: valid.map((l) => ({ itemId: l.itemId, description: l.description, deliveredQty: l.quantity, uom: l.uom ?? 'NOS', soLineId: (l as any).soLineId || undefined })),
    };
    try { 
      await salesApi.deliveries.create(body); 
      message.success('Delivery created.'); 
      setDrawer(false); 
      load(); 
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: SalesHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await salesApi.deliveries.act(r.id, a, company.id); message.success(`Delivery ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const openView = async (row: SalesHeader) => {
    if (!company?.id) return;
    try { setViewing(await salesApi.deliveries.get(company.id, row.id)); } 
    catch (e) { message.error(apiErr(e)); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 transition-colors relative z-10 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white dark:text-white transition-colors">Deliveries</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-400 transition-colors">Manage outward shipments. Approving posts stock & COGS GL.</p>
          </div>
        </div>
        <button 
          onClick={openNew}
          className="flex items-center px-4 py-2 bg-amber-600 dark:bg-amber-600/90 text-white font-bold rounded-lg shadow-sm hover:bg-amber-700 dark:hover:bg-amber-500 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> New Delivery
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Delivery Note..." 
              className="pl-9 pr-4 py-2 w-64 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm text-slate-900 dark:text-white dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
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
            <thead className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">DN Number</th>
                <th className="px-6 py-4 font-bold">Customer</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileBox className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                      <span className="text-slate-800 dark:text-slate-200 dark:text-slate-200 font-medium transition-colors">{custName(r.customerId)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400 font-medium transition-colors">{r.postingDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={r.status as DocumentStatus} size="small" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button onClick={() => openView(r)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      
                      {r.status === 'draft' && (
                        <button onClick={() => act(r, 'submit')} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors">
                          <Send className="w-3.5 h-3.5 mr-1" /> Submit
                        </button>
                      )}
                      
                      {r.status === 'submitted' && (
                        <button onClick={() => act(r, 'approve')} className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 dark:text-slate-400 transition-colors">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No deliveries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer 
        title={<span className="font-bold text-slate-900 dark:text-white">New Delivery Note</span>} 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} 
        width={960}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-amber-600 text-white font-bold rounded-lg shadow-sm hover:bg-amber-700 transition-colors">
            {saving ? 'Saving...' : 'Create Delivery'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="customerId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Customer</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: `${c.customerCode} — ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="soId" label={<span className="font-bold text-slate-700 dark:text-slate-300">From Sales Order (Optional)</span>} className="mb-0 col-span-2">
              <Select allowClear showSearch optionFilterProp="label" options={sos.map((s) => ({ value: s.id, label: s.documentNumber }))} onChange={async (val) => {
                if (!val || !company?.id) { setLines([newDraftLine()]); return; }
                try {
                  const fullSo = await salesApi.orders.get(company.id, val);
                  form.setFieldsValue({ customerId: fullSo.customerId });
                  const mappedLines = fullSo.lines.map((l: any, i: number) => ({
                    key: Date.now() + i,
                    itemId: l.itemId,
                    description: l.description,
                    quantity: Number(l.quantity) - Number(l.deliveredQty || 0),
                    uom: l.uom,
                    rateRupees: (l.ratePaise || 0) / 100,
                    soLineId: l.id,
                  })).filter((l: any) => l.quantity > 0);
                  setLines(mappedLines.length ? mappedLines : [newDraftLine()]);
                } catch (e) {
                  message.error(apiErr(e));
                }
              }} />
            </Form.Item>
            <Form.Item name="warehouseId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Dispatch Warehouse</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Delivery Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <FileBox className="w-4 h-4 mr-2 text-amber-600" /> Delivered Items
              </h3>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={[]} showTax={false} showDiscount={false} rateLabel="Rate ₹" />
            </div>
          </div>
        </Form>
      </Drawer>

      <Drawer 
        title={
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-amber-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'Delivery Note'}</span>
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
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Customer</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">{custName(viewing.customerId)}</p>
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
            
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Items Delivered</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12">#</th>
                      <th className="px-4 py-3 font-bold">Item Description</th>
                      <th className="px-4 py-3 font-bold text-right">Delivered Qty</th>
                      <th className="px-4 py-3 font-bold">UOM</th>
                      <th className="px-4 py-3 font-bold text-right">COGS Rate (₹)</th>
                      <th className="px-4 py-3 font-bold text-right">Total COGS (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {viewing.lines?.map((l: any, i: number) => (
                      <tr key={l.id} className="bg-white dark:bg-slate-900">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.lineNumber || i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{l.description || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-amber-700 bg-amber-50">{l.deliveredQty}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.uom}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">
                          {l.cogsRatePaise ? `₹${(Number(l.cogsRatePaise) / 100).toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-600">
                          {l.cogsAmountPaise ? `₹${(Number(l.cogsAmountPaise) / 100).toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default DeliveriesPage;
