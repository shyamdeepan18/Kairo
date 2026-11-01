import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, InputNumber, message } from 'antd';
import dayjs from 'dayjs';
import { 
  Truck, Plus, Eye, CheckCircle2, Search, Send, FileBox, Building2, Calendar, ClipboardList, 
  Clock, ShieldCheck, ArrowRight, DollarSign, PackageCheck 
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';
import { STATUS_OPTIONS, apiErr, LinesEditor, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

export function GrnPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pos, setPos] = useState<PurchaseHeader[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.grns.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
    purchaseApi.orders.list(company.id, { status: 'approved' }).then((r) => setPos(r.data)).catch(() => {});
  }, [company?.id, plant?.id]);

  const filteredRows = React.useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      supplierName(r.supplierId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, suppliers]);

  const refItems: RefItem[] = items.map((i) => ({
    id: i.id,
    itemName: i.itemName,
    itemCode: i.itemCode,
    primaryUom: i.primaryUom,
    defaultTaxCodeId: i.defaultTaxCodeId,
    sellingPricePaise: i.sellingPricePaise,
    purchaseRatePaise: i.purchaseRatePaise,
    standardCostPaise: i.standardCostPaise,
    minSellingPricePaise: i.minSellingPricePaise,
    barcode: i.barcode,
  }));

  const handlePoChange = async (poId?: string) => {
    if (!poId || !company?.id) return;
    try {
      const po = await purchaseApi.orders.get(company.id, poId);
      if (po) {
        form.setFieldsValue({ supplierId: po.supplierId });
        if (po.lines) {
          const newLines = po.lines.map((l: any, i: number) => {
            const it = items.find((item) => item.id === l.itemId);
            return {
              key: Date.now() + i,
              itemId: l.itemId,
              description: l.description || undefined,
              quantity: Number(l.quantity) || 1,
              uom: l.uom,
              rateRupees: l.ratePaise ? Number(l.ratePaise) / 100 : 0,
              discountPercent: Number(l.discountPercent) || 0,
              taxCodeId: it?.defaultTaxCodeId || undefined,
              poLineId: l.id,
            };
          });
          setLines(newLines.length > 0 ? newLines : [newDraftLine()]);
        }
      }
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: PurchaseHeader) => {
    if (!company?.id) return;
    try { setViewing(await purchaseApi.grns.get(company.id, row.id)); }
    catch (e) { message.error(apiErr(e)); }
  };

  const openNew = () => { 
    form.resetFields(); 
    form.setFieldsValue({ postingDate: dayjs(), warehouseId: warehouses[0]?.id, landedChargesRupees: 0 }); 
    setLines([newDraftLine()]); 
    setDrawer(true); 
  };

  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, 
      plantId: plant.id, 
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: v.supplierId, 
      poId: v.poId || undefined, 
      warehouseId: v.warehouseId, 
      supplierDcNo: v.supplierDcNo || undefined,
      landedChargesPaise: v.landedChargesRupees ? Math.round(Number(v.landedChargesRupees) * 100) : 0,
      customData: v.customData || {},
      lines: valid.map((l) => ({ 
        itemId: l.itemId, 
        description: l.description || undefined, 
        receivedQty: Number(l.quantity), 
        acceptedQty: Number(l.quantity), 
        uom: l.uom ?? 'NOS', 
        ratePaise: Math.round((l.rateRupees || 0) * 100),
        poLineId: l.poLineId || undefined
      })),
    };
    try { 
      await purchaseApi.grns.create(body); 
      message.success('GRN created with Landed Cost Valuation.'); 
      setDrawer(false); 
      load(); 
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: PurchaseHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await purchaseApi.grns.act(r.id, a, company.id); message.success(`GRN ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const totalGRNs = rows.length;
  const totalInwardValPaise = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.totalAmountPaise || 0), 0);
  }, [rows]);
  const pendingApprovalGRNs = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const approvedGRNs = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/40 rounded-xl">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Purchase</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Goods Receipt</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Goods Receipt Notes (GRN)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Record physical gate entry, landed cost capitalization, and stock ledger movement
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New GRN
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Inward GRNs</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalGRNs}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Gate receipts logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Stock Inward Value</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalInwardValPaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Capitalized material cost
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Quality / Approval</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingApprovalGRNs}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting QC sign-off
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved & Stocked</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <PackageCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedGRNs}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Inventory ledger posted
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search GRN number or supplier..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:text-white"
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
                Goods Receipt Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Track inward shipments, QC verification, and warehouse receipts
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} receipts
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">GRN Number</th>
                <th className="px-6 py-4 font-bold">Supplier</th>
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
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 transition-colors">{r.documentNumber}</span>
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
                    No GRNs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer 
        title={<span className="font-bold text-slate-900 dark:text-white">New Goods Receipt Note</span>} 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} 
        width={960}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-emerald-600 text-white font-bold rounded-lg shadow-sm hover:bg-emerald-700 transition-colors">
            {saving ? 'Saving...' : 'Create GRN'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="supplierId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" placeholder="Select supplier" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="poId" label={<span className="font-bold text-slate-700 dark:text-slate-300">From PO</span>} className="mb-0 col-span-2">
              <Select allowClear showSearch optionFilterProp="label" placeholder="Select Approved PO" onChange={handlePoChange} options={pos.map((p) => ({ value: p.id, label: `${p.documentNumber} (${supplierName(p.supplierId)})` }))} />
            </Form.Item>
            <Form.Item name="warehouseId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Receiving Warehouse</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">GRN Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="supplierDcNo" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier DC No</span>} className="mb-0">
              <Input placeholder="Challan Number" />
            </Form.Item>
            <Form.Item name="landedChargesRupees" label={<span className="font-bold text-slate-700 dark:text-slate-300">Landed Freight / Duty (₹)</span>} extra="Capitalized proportionally into unit stock valuation & LPP" className="mb-0 col-span-2">
              <InputNumber min={0} step={0.01} placeholder="0.00" style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <DynamicCustomFields
            companyId={company?.id}
            documentType="purchase.grn"
          />

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <FileBox className="w-4 h-4 mr-2 text-emerald-600" /> Received Items
              </h3>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={[]} showTax={false} showDiscount={false} />
            </div>
          </div>
        </Form>
      </Drawer>

      <Drawer 
        title={
          <div className="flex items-center space-x-2">
            <Truck className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'GRN'}</span>
          </div>
        } 
        open={!!viewing} 
        onClose={() => setViewing(null)} 
        width={850}
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
            
            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Items Received & Cost Valuation</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12">#</th>
                      <th className="px-4 py-3 font-bold">Item Description</th>
                      <th className="px-4 py-3 font-bold text-right">Received Qty</th>
                      <th className="px-4 py-3 font-bold">UOM</th>
                      <th className="px-4 py-3 font-bold text-right">Unit Rate (₹)</th>
                      <th className="px-4 py-3 font-bold text-right">Valuation Rate (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {viewing.lines?.map((l: any, i: number) => (
                      <tr key={l.id} className="bg-white dark:bg-slate-900">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.lineNumber || i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{l.description || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700 bg-emerald-50">{l.receivedQty}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.uom}</td>
                        <td className="px-4 py-3 text-right text-slate-700 dark:text-slate-300">₹{(Number(l.ratePaise || 0) / 100).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-600">₹{(Number(l.valuationRatePaise || l.ratePaise || 0) / 100).toFixed(2)}</td>
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

export default GrnPage;
