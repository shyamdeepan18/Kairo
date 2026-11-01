import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Select, message } from 'antd';
import dayjs from 'dayjs';
import { Truck, Plus, Eye, Send, CheckCircle2, Search, FileBox, User, Calendar, ClipboardList, Sparkles, DollarSign, Clock, ShieldCheck } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { salesApi, type SalesHeader, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';
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
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredRows = React.useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      custName(r.customerId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, customers]);

  const refItems: RefItem[] = items.map((i) => ({
    id: i.id,
    itemName: i.itemName,
    itemCode: i.itemCode,
    primaryUom: i.primaryUom,
    defaultTaxCodeId: i.defaultTaxCodeId,
    secondaryUom: (i as any).secondaryUom,
    conversionFactor: (i as any).conversionFactor,
    isCatchWeight: (i as any).isCatchWeight,
    catchWeightTolerancePct: (i as any).catchWeightTolerancePct,
    trackingType: (i as any).trackingType,
  }));

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setDrawer(true); };

  const handleAutoFefo = async () => {
    const warehouseId = form.getFieldValue('warehouseId');
    const customerId = form.getFieldValue('customerId');
    if (!warehouseId) {
      message.error('Select a dispatch warehouse first');
      return;
    }
    const updated = [...lines];
    let matchedCount = 0;

    for (let i = 0; i < updated.length; i++) {
      const l = updated[i];
      if (l.itemId && l.quantity > 0) {
        try {
          const res = await salesApi.deliveries.getFefoRecommendations({
            itemId: l.itemId,
            warehouseId,
            requiredQty: l.quantity,
            customerId,
          });
          if (res.recommendations && res.recommendations.length > 0) {
            const first = res.recommendations[0];
            updated[i].batchId = first.batchId;
            updated[i].batchNumber = first.batchNumber;
            matchedCount++;
          }
        } catch (err) {
          console.error(err);
        }
      }
    }

    setLines(updated);
    if (matchedCount > 0) {
      message.success(`FEFO Engine auto-picked batches for ${matchedCount} item(s)`);
    } else {
      message.warning('No matching batches found for the selected items/warehouse');
    }
  };
  
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      customerId: v.customerId, soId: v.soId, warehouseId: v.warehouseId,
      customData: v.customData || {},
      lines: valid.map((l) => ({
        itemId: l.itemId,
        description: l.description,
        deliveredQty: l.quantity,
        uom: l.uom ?? 'NOS',
        soLineId: (l as any).soLineId || undefined,
        secondaryQty: l.secondaryQty || undefined,
        secondaryUom: l.secondaryUom || undefined,
        batchId: l.batchId || undefined,
        batchNumber: l.batchNumber || undefined,
      })),
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

  const totalDeliveries = rows.length;
  const totalDeliveredValuePaise = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.totalAmountPaise || 0), 0);
  }, [rows]);
  const pendingDeliveries = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const approvedDeliveries = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Sales</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Deliveries</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Delivery Notes (Dispatch)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Outward shipments, FEFO batch allocations, stock deduction, and COGS journal posting
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Delivery
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Deliveries</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalDeliveries}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Challans dispatched
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Dispatched Value</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalDeliveredValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cost of goods shipped
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Staging / Approval</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingDeliveries}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting dock dispatch
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Dispatched & Posted</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedDeliveries}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Inventory & COGS deducted
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search Delivery Note or customer..." 
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
                Delivery Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Outward shipments, stock deduction, and delivery challan tracking
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} deliveries
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">DN Number</th>
                <th className="px-6 py-4 font-bold">Customer</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {filteredRows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileBox className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium transition-colors">{custName(r.customerId)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">{r.postingDate}</span>
                    </div>
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
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 transition-colors">
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

          <DynamicCustomFields
            companyId={company?.id}
            documentType="sales.delivery"
          />

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <FileBox className="w-4 h-4 mr-2 text-amber-600" /> Delivered Items
              </h3>
              <button
                type="button"
                onClick={handleAutoFefo}
                className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-200 dark:border-amber-800 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Auto FEFO Pick Batches
              </button>
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
            
            {viewing.lines?.some((l: any) => l.cogsAmountPaise) && (
              <div className="flex justify-end p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800/50 rounded-lg">
                 <div className="flex flex-col items-end">
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Total Delivery Cost (COGS)</p>
                    <p className="font-mono text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">
                      ₹{(viewing.lines.reduce((s: number, l: any) => s + (Number(l.cogsAmountPaise) || 0), 0) / 100).toFixed(2)}
                    </p>
                 </div>
              </div>
            )}

            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Items Delivered</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
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
