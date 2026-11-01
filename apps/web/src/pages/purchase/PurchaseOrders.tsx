import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import dayjs from 'dayjs';
import {
  Drawer, Form, Input, Select, DatePicker, InputNumber, Popconfirm, message, Descriptions, Modal
} from 'antd';
import {
  ShoppingCart, Search, Plus, Eye, Send, CheckCircle2, XCircle, StopCircle, 
  Trash2, FileText, Calendar, Building2, Receipt, ArrowRight, ClipboardList, Edit2, XOctagon
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, computeLine, apiErr, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';

interface DraftLine {
  key: number;
  itemId?: string;
  description?: string;
  quantity: number;
  uom?: string;
  rateRupees: number;
  discountPercent: number;
  taxCodeId?: string;
  requisitionLineId?: string;
}

let lineSeq = 1;
const newLine = (): DraftLine => ({ key: lineSeq++, quantity: 1, rateRupees: 0, discountPercent: 0 });

export function PurchaseOrdersPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  const location = useLocation();
  const navigate = useNavigate();

  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [blanketOrders, setBlanketOrders] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  const [viewing, setViewing] = useState<any | null>(null);

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';
  const gstBp = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.orders.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    purchaseApi.blanketOrders.list(company.id, { status: 'approved' }).then((r: any) => setBlanketOrders(Array.isArray(r) ? r : (r.data ?? []))).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listTaxCodes(company.id).then(setTaxCodes).catch(() => {});
  }, [company?.id]);

  const filteredRows = React.useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      supplierName(r.supplierId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, suppliers]);

  const handleShortClose = (r: PurchaseHeader) => {
    Modal.confirm({
      title: 'Short-Close Purchase Order?',
      content: `Are you sure you want to short-close PO ${r.documentNumber}? Any remaining unreceived quantities will be closed.`,
      okText: 'Short-Close',
      okType: 'danger',
      onOk: async () => {
        try {
          await purchaseApi.orders.shortClose(r.id);
          message.success('Purchase order short-closed.');
          load();
        } catch (e) {
          message.error(apiErr(e));
        }
      },
    });
  };

  useEffect(() => {
    if (location.state?.createPoFromLines && location.state?.supplierId) {
      const { createPoFromLines, supplierId, remarks } = location.state;
      const mappedLines = createPoFromLines.map((l: any) => ({
        key: lineSeq++,
        itemId: l.itemId,
        description: l.description,
        quantity: Number(l.quantity) - Number(l.orderedQty),
        uom: l.uom,
        rateRupees: (l.estimatedRatePaise || 0) / 100,
        discountPercent: 0,
        requisitionLineId: l.id
      }));
      setLines(mappedLines);
      form.resetFields();
      form.setFieldsValue({ supplierId, postingDate: dayjs(), remarks });
      setDrawer(true);
      navigate('/purchase/orders', { replace: true, state: {} });
    }
  }, [location.state, navigate, form]);

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onPickItem = (key: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    const suggestedRate = (it?.purchaseRatePaise || it?.standardCostPaise || 0) / 100;
    setLine(key, {
      itemId,
      uom: it?.primaryUom,
      description: it?.itemName,
      taxCodeId: it?.defaultTaxCodeId ?? undefined,
      ...(suggestedRate > 0 ? { rateRupees: suggestedRate } : {}),
    });
  };

  const lineComputed = (l: DraftLine) => computeLine(l.quantity || 0, Math.round((l.rateRupees || 0) * 100), l.discountPercent || 0, gstBp(l.taxCodeId));
  const totals = lines.reduce(
    (acc, l) => {
      const c = lineComputed(l);
      acc.net += c.netAmountPaise; acc.tax += c.taxAmountPaise; acc.total += c.totalAmountPaise;
      return acc;
    },
    { net: 0, tax: 0, total: 0 }
  );

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ postingDate: dayjs() });
    setLines([newLine()]);
    setDrawer(true);
  };

  const openEdit = async (row: PurchaseHeader) => {
    if (!company?.id) return;
    try {
      const full = await purchaseApi.orders.get(company.id, row.id);
      form.resetFields();
      form.setFieldsValue({
        id: full.id,
        supplierId: full.supplierId,
        postingDate: dayjs(full.postingDate),
        expectedDeliveryDate: full.expectedDeliveryDate ? dayjs(full.expectedDeliveryDate) : undefined,
        remarks: full.remarks,
      });
      setLines(full.lines.map((l: any) => ({
        key: lineSeq++,
        itemId: l.itemId,
        description: l.description,
        quantity: Number(l.quantity),
        uom: l.uom,
        rateRupees: l.ratePaise / 100,
        discountPercent: Number(l.discountPercent),
        taxCodeId: l.taxCodeId,
        requisitionLineId: l.requisitionLineId,
      })));
      setDrawer(true);
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const save = async (values: any) => {
    if (!company?.id || !plant?.id) { message.error('Select a company and plant first'); return; }
    const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
    if (validLines.length === 0) { message.error('Add at least one line with an item and quantity'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      postingDate: values.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: values.supplierId,
      requisitionId: values.requisitionId || undefined,
      blanketPoId: values.blanketPoId || undefined,
      expectedDeliveryDate: values.expectedDeliveryDate?.format?.('YYYY-MM-DD') || undefined,
      remarks: values.remarks || undefined,
      custom_data: values.customData || undefined,
      lines: validLines.map((l) => {
        const c = lineComputed(l);
        return {
          itemId: l.itemId, description: l.description || undefined, quantity: l.quantity, uom: l.uom ?? 'NOS',
          ratePaise: Math.round((l.rateRupees || 0) * 100), discountPercent: l.discountPercent || 0,
          taxCodeId: l.taxCodeId || undefined, cgstAmountPaise: c.cgstAmountPaise, sgstAmountPaise: c.sgstAmountPaise,
          requisitionLineId: l.requisitionLineId || undefined,
        };
      }),
    };
    try {
      if (values.id) {
        await purchaseApi.orders.update(values.id, body);
        message.success('Purchase order updated.');
      } else {
        await purchaseApi.orders.create(body);
        message.success('Purchase order created (draft).');
      }
      setDrawer(false);
      load();
    } catch (e) {
      message.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (row: PurchaseHeader, action: 'submit' | 'approve' | 'cancel') => {
    if (!company?.id) return;
    try {
      const res = await purchaseApi.orders.act(row.id, action, company.id);
      if (action === 'approve' && res?.status === 'submitted') {
        message.info('Approval recorded. Waiting for the next level of approval.');
      } else {
        message.success(`Order ${action === 'submit' ? 'submitted' : action === 'approve' ? 'approved' : action === 'cancel' ? 'cancelled' : 'processed'}.`);
      }
      load();
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: PurchaseHeader) => {
    if (!company?.id) return;
    try { setViewing(await purchaseApi.orders.get(company.id, row.id)); }
    catch (e) { message.error(apiErr(e)); }
  };

  const itemOptions = items.map((i) => ({
    value: i.id,
    label: `${i.itemCode} — ${i.itemName}${i.barcode ? ` [${i.barcode}]` : ''}`,
  }));
  const taxOptions = taxCodes.map((t) => ({ value: t.id, label: `${t.code} (${t.gstRateBp / 100}%)` }));

  const totalOrders = rows.length;
  const totalOrderValuePaise = rows.reduce((s, r) => s + (r.totalAmountPaise || 0), 0);
  const pendingApprovals = rows.filter((r) => r.status === 'submitted').length;
  const approvedOrders = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Purchase</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Purchase Orders</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Purchase Orders
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Track and manage vendor procurement, multi-level approval workflows, and goods receipt tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New PO
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Orders</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Purchase orders logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Committed Spend</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              <AmountDisplay paise={totalOrderValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cumulative order value
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Approvals</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <ClipboardList className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingApprovals}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting manager sign-off
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved & Open</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {approvedOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ready for GRN inward
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search PO number or supplier..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select 
              allowClear 
              placeholder="All Statuses" 
              value={statusFilter} 
              onChange={setStatusFilter} 
              className="w-44" 
              options={['draft', 'submitted', 'approved', 'cancelled', 'closed'].map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} 
            />
          </div>
        </div>

        {/* Orders Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Purchase Order Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authorized vendor purchase contracts and delivery schedules
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} orders
            </span>
          </div>
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">PO Number</th>
                <th className="px-6 py-4 font-bold">Supplier</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-right">Total (₹)</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {filteredRows.map(r => (
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
                      <button onClick={() => openView(r)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="View details">
                        <Eye className="w-4 h-4" />
                      </button>
                      
                      {r.status === 'draft' && (
                        <>
                          <button onClick={() => openEdit(r)} className="flex items-center text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-bold transition-colors">
                            <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                          </button>
                          <button onClick={() => runAction(r, 'submit')} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors">
                            <Send className="w-3.5 h-3.5 mr-1" /> Submit
                          </button>
                        </>
                      )}
                      
                      {r.status === 'submitted' && (() => {
                        const hasWorkflow = !!(r as any).approvalInfo;
                        const isEligible = hasWorkflow ? (r as any).approvalInfo.isEligibleApprover : true;
                        const hasApproved = hasWorkflow ? (r as any).approvalInfo.hasApproved : false;

                        if (hasWorkflow) {
                          if (hasApproved) {
                            return <span className="text-emerald-600 dark:text-emerald-500 text-xs italic font-bold">Approved. Waiting...</span>;
                          }
                          if (!isEligible) {
                            return <span className="text-slate-500 dark:text-slate-400 text-xs italic">Pending: {(r as any).approvalInfo.currentApproverName}</span>;
                          }
                        }

                        return (
                          <Popconfirm title="Approve this PO?" onConfirm={() => runAction(r, 'approve')}>
                            <button className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                            </button>
                          </Popconfirm>
                        );
                      })()}

                      {r.status === 'approved' && (
                        <>
                          <Popconfirm title="Cancel this PO?" onConfirm={() => runAction(r, 'cancel')}>
                            <button className="flex items-center text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold transition-colors">
                              <StopCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                            </button>
                          </Popconfirm>
                          <button onClick={() => handleShortClose(r)} className="flex items-center text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-xs font-bold transition-colors" title="Close remaining unreceived lines">
                            <XOctagon className="w-3.5 h-3.5 mr-1" /> Short-Close
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
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No purchase orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer 
        title={<span className="font-bold text-slate-900 dark:text-white">{form.getFieldValue('id') ? 'Edit Purchase Order' : 'New Purchase Order'}</span>} 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} 
        width={1000}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-indigo-600 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
            {saving ? 'Saving...' : (form.getFieldValue('id') ? 'Save Changes' : 'Create PO')}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <Form.Item name="id" hidden><Input /></Form.Item>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="supplierId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier</span>} rules={[{ required: true }]} className="mb-0 col-span-1 md:col-span-1">
              <Select showSearch optionFilterProp="label" placeholder="Select supplier" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="blanketPoId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Blanket Contract</span>} className="mb-0 col-span-1 md:col-span-1">
              <Select allowClear showSearch optionFilterProp="label" placeholder="Optional Rate Contract" options={blanketOrders.map((b) => ({ value: b.id, label: `${b.documentNumber} (${b.supplierName ?? 'Supplier'})` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">PO Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expectedDeliveryDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Expected Delivery</span>} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <ShoppingCart className="w-4 h-4 mr-2" /> Line Items
              </h3>
              <button type="button" onClick={() => setLines((ls) => [...ls, newLine()])} className="flex items-center text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded hover:bg-indigo-100 transition-colors">
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Line
              </button>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-bold w-64">Item</th>
                    <th className="px-4 py-3 font-bold w-24">Qty</th>
                    <th className="px-4 py-3 font-bold w-20">UOM</th>
                    <th className="px-4 py-3 font-bold w-32">Rate (₹)</th>
                    <th className="px-4 py-3 font-bold w-24">Disc %</th>
                    <th className="px-4 py-3 font-bold w-32">Tax</th>
                    <th className="px-4 py-3 font-bold text-right w-32">Net Total</th>
                    <th className="px-4 py-3 font-bold w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {lines.map((l) => (
                    <tr key={l.key} className="bg-white hover:bg-slate-50/50">
                      <td className="px-4 py-2">
                        <Select showSearch optionFilterProp="label" placeholder="Select item" style={{ width: '100%' }} value={l.itemId} options={itemOptions} onChange={(v) => onPickItem(l.key, v)} />
                      </td>
                      <td className="px-4 py-2">
                        <InputNumber min={0} value={l.quantity} onChange={(v) => setLine(l.key, { quantity: Number(v) || 0 })} style={{ width: '100%' }} />
                      </td>
                      <td className="px-4 py-2">
                        <Input value={l.uom} onChange={(e) => setLine(l.key, { uom: e.target.value })} />
                      </td>
                      <td className="px-4 py-2">
                        <InputNumber min={0} step={0.01} value={l.rateRupees} onChange={(v) => setLine(l.key, { rateRupees: Number(v) || 0 })} style={{ width: '100%' }} />
                      </td>
                      <td className="px-4 py-2">
                        <InputNumber min={0} max={100} value={l.discountPercent} onChange={(v) => setLine(l.key, { discountPercent: Number(v) || 0 })} style={{ width: '100%' }} />
                      </td>
                      <td className="px-4 py-2">
                        <Select allowClear placeholder="Tax" style={{ width: '100%' }} value={l.taxCodeId} options={taxOptions} onChange={(v) => setLine(l.key, { taxCodeId: v })} />
                      </td>
                      <td className="px-4 py-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        <AmountDisplay paise={lineComputed(l).totalAmountPaise} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Popconfirm title="Remove line?" onConfirm={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          <button type="button" className="text-rose-400 hover:text-rose-600 p-1"><Trash2 className="w-4 h-4" /></button>
                        </Popconfirm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end mt-4 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
              <div className="flex gap-8 text-sm">
                <div className="flex flex-col items-end">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Net Amount</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300"><AmountDisplay paise={totals.net} /></span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">Tax Amount</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300"><AmountDisplay paise={totals.tax} /></span>
                </div>
                <div className="flex flex-col items-end border-l border-indigo-200 pl-8">
                  <span className="text-indigo-600 font-bold">Total Amount</span>
                  <span className="font-mono font-bold text-indigo-700 text-lg"><AmountDisplay paise={totals.total} /></span>
                </div>
              </div>
            </div>
          </div>

          <DynamicCustomFields
            companyId={company?.id}
            documentType="purchase.po"
          />

          <Form.Item name="remarks" label={<span className="font-bold text-slate-700 dark:text-slate-300">Remarks / Terms</span>} className="mt-4">
            <Input.TextArea rows={2} className="rounded-lg" placeholder="Enter terms and conditions, delivery instructions, etc." />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer 
        title={
          <div className="flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-indigo-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'Purchase Order'}</span>
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
                  <p className="text-sm font-bold text-indigo-800 dark:text-indigo-300">Total PO Amount</p>
                  <p className="font-mono text-2xl font-black text-indigo-700 dark:text-indigo-400 mt-1"><AmountDisplay paise={viewing.totalAmountPaise} /></p>
               </div>
            </div>
            
            {viewing.remarks && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                <p className="text-xs text-amber-700 font-bold uppercase tracking-wider mb-1">Remarks</p>
                <p className="text-sm text-amber-900">{viewing.remarks}</p>
              </div>
            )}

            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Order Items</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12">#</th>
                      <th className="px-4 py-3 font-bold">Item Description</th>
                      <th className="px-4 py-3 font-bold text-right">Qty</th>
                      <th className="px-4 py-3 font-bold">UOM</th>
                      <th className="px-4 py-3 font-bold text-right">Net</th>
                      <th className="px-4 py-3 font-bold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {viewing.lines?.map((l: any, i: number) => (
                      <tr key={l.id} className="bg-white dark:bg-slate-900">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.lineNumber || i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{l.description || '—'}</td>
                        <td className="px-4 py-3 text-right font-medium">{l.quantity}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.uom}</td>
                        <td className="px-4 py-3 text-right font-mono"><AmountDisplay paise={l.netAmountPaise} /></td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300"><AmountDisplay paise={l.totalAmountPaise} /></td>
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

export default PurchaseOrdersPage;
