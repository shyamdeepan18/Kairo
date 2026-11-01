import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, Tag, message, Modal, Popconfirm } from 'antd';
import dayjs from 'dayjs';
import { ShoppingBag, Plus, Eye, Send, CheckCircle2, StopCircle, Search, FileText, User, Calendar, ClipboardList, Edit2, XCircle, XOctagon, Truck, DollarSign, Clock, ShieldCheck } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { salesApi, type SalesHeader, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';
import { STATUS_OPTIONS, apiErr, LinesEditor, pricedLineBody, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

let lineSeq = 1;

export function SalesOrdersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { user } = useAuthStore();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<SalesHeader[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState<any | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceQuotationId, setSourceQuotationId] = useState<string | undefined>();

  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';
  const gstBpOf = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    salesApi.orders.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  
  useEffect(() => { load(); }, [load]);
  
  useEffect(() => {
    if (!company?.id) return;
    salesApi.customers.list(company.id).then((r) => setCustomers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listTaxCodes(company.id).then(setTaxCodes).catch(() => {});
  }, [company?.id]);

  useEffect(() => {
    if (location.state?.createSoFromQuote && location.state?.customerId) {
      const { createSoFromQuote, customerId, remarks } = location.state;
      const mappedLines = createSoFromQuote.lines.map((l: any) => ({
        key: lineSeq++,
        itemId: l.itemId,
        description: l.description,
        quantity: Math.max(1, Number(l.quantity) - Number(l.orderedQty || 0)),
        uom: l.uom,
        rateRupees: (l.ratePaise || 0) / 100,
        discountPercent: Number(l.discountPercent) || 0,
        taxCodeId: l.taxCodeId,
        quotationLineId: l.id,
      }));
      setLines(mappedLines);
      setSourceQuotationId(createSoFromQuote.id);
      setEditingId(null);
      form.resetFields();
      form.setFieldsValue({ customerId, postingDate: dayjs(), remarks });
      setDrawer(true);
      navigate('/sales/orders', { replace: true, state: {} });
    }
  }, [location.state, navigate, form]);

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

  const openNew = () => {
    setEditingId(null);
    form.resetFields();
    form.setFieldsValue({ postingDate: dayjs() });
    setLines([newDraftLine()]);
    setSourceQuotationId(undefined);
    setDrawer(true);
  };

  const openEdit = async (row: SalesHeader) => {
    if (!company?.id) return;
    try {
      const full = await salesApi.orders.get(company.id, row.id);
      setEditingId(row.id);
      setSourceQuotationId(full.quotationId);
      form.resetFields();
      form.setFieldsValue({
        customerId: full.customerId,
        postingDate: full.postingDate ? dayjs(full.postingDate) : dayjs(),
        expectedDeliveryDate: full.expectedDeliveryDate ? dayjs(full.expectedDeliveryDate) : undefined,
        customerPoNumber: full.customerPoNumber,
        remarks: full.remarks,
      });
      const mappedLines = (full.lines ?? []).map((l: any) => ({
        key: lineSeq++,
        itemId: l.itemId,
        description: l.description,
        quantity: Number(l.quantity) || 1,
        uom: l.uom,
        rateRupees: (l.ratePaise || 0) / 100,
        discountPercent: Number(l.discountPercent) || 0,
        taxCodeId: l.taxCodeId,
        warehouseId: l.warehouseId,
        quotationLineId: l.quotationLineId,
      }));
      setLines(mappedLines.length ? mappedLines : [newDraftLine()]);
      setDrawer(true);
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const createDeliveryFromSo = async (row: SalesHeader) => {
    if (!company?.id) return;
    try {
      const full = await salesApi.orders.get(company.id, row.id);
      navigate('/sales/delivery', {
        state: {
          createDeliveryFromSo: full,
          soId: full.id,
          customerId: full.customerId,
        },
      });
    } catch (e) {
      message.error(apiErr(e));
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
      customerId: v.customerId, expectedDeliveryDate: v.expectedDeliveryDate?.format?.('YYYY-MM-DD'),
      customerPoNumber: v.customerPoNumber, remarks: v.remarks,
      quotationId: sourceQuotationId,
      lines: valid.map((l) => ({
        ...pricedLineBody(l, gstBpOf),
        quotationLineId: l.quotationLineId,
      })),
    };
    try { 
      if (editingId) {
        await salesApi.orders.update(editingId, body);
        message.success('Sales order updated.');
      } else {
        await salesApi.orders.create(body); 
        message.success('Sales order created.'); 
      }
      setDrawer(false); 
      load(); 
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: SalesHeader, a: 'submit' | 'approve' | 'reject' | 'cancel') => {
    if (!company?.id) return;
    try { await salesApi.orders.act(r.id, a, company.id); message.success(`Order ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const handleShortClose = (r: SalesHeader) => {
    Modal.confirm({
      title: 'Short-Close Sales Order?',
      content: `Are you sure you want to short-close SO ${r.documentNumber}? Any remaining unfulfilled stock reservations will be released and the order will be marked as closed.`,
      okText: 'Short-Close',
      okType: 'danger',
      onOk: async () => {
        try {
          await salesApi.orders.shortClose(r.id);
          message.success('Sales order short-closed.');
          load();
        } catch (e) {
          message.error(apiErr(e));
        }
      },
    });
  };

  const openView = async (row: SalesHeader) => {
    if (!company?.id) return;
    try { setViewing(await salesApi.orders.get(company.id, row.id)); } 
    catch (e) { message.error(apiErr(e)); }
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      custName(r.customerId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, customers]);

  const totalOrders = rows.length;
  const totalOrderValuePaise = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.totalAmountPaise || 0), 0);
  }, [rows]);
  const pendingApprovalOrders = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const approvedOrders = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-pink-50 dark:bg-pink-950/50 text-pink-600 dark:text-pink-400 border border-pink-100 dark:border-pink-900/40 rounded-xl">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Sales</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-pink-600 dark:text-pink-400">Orders</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sales Orders
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Process customer contracts, allocate stock reservations & track delivery fulfillment
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 active:bg-pink-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New SO
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
              <div className="p-2 bg-pink-50 dark:bg-pink-950/60 rounded-xl text-pink-600 dark:text-pink-400">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Customer orders logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Committed Revenue</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalOrderValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Contract order value
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
              {pendingApprovalOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting sign-off
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved & Open</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ready for DC dispatch
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search SO number or customer..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 dark:text-white"
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
                Sales Order Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customer purchase contracts, delivery statuses, and stock allocations
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} orders
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">SO Number</th>
                <th className="px-6 py-4 font-bold">Customer</th>
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
                      <span className="font-mono font-bold text-pink-700 dark:text-pink-400 transition-colors">{r.documentNumber}</span>
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
                          <button onClick={() => act(r, 'submit')} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors">
                            <Send className="w-3.5 h-3.5 mr-1" /> Submit
                          </button>
                        </>
                      )}
                      
                      {r.status === 'submitted' && (() => {
                        const hasWorkflow = !!(r as any).approvalInfo;
                        const isEligible = hasWorkflow ? (r as any).approvalInfo.isEligibleApprover : true;
                        const hasApproved = hasWorkflow ? (r as any).approvalInfo.hasApproved : false;
                        const isMaker = user?.id === r.createdBy || user?.id === (r as any).submittedBy;
                        const canRecall = isMaker && r.status === 'submitted';

                        if (hasWorkflow) {
                          if (hasApproved) {
                            return <span className="text-emerald-600 dark:text-emerald-500 text-xs italic font-bold">Approved. Waiting...</span>;
                          }
                          if (!isEligible && !canRecall) {
                            return <span className="text-slate-500 dark:text-slate-400 text-xs italic">Pending: {(r as any).approvalInfo.currentApproverName}</span>;
                          }
                        }

                        return (
                          <div className="flex items-center space-x-2">
                            {isEligible && !isMaker && (
                              <>
                                <Popconfirm title="Approve this SO?" onConfirm={() => act(r, 'approve')}>
                                  <button className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                  </button>
                                </Popconfirm>
                                <button onClick={() => act(r, 'reject')} className="flex items-center text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold transition-colors">
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                                </button>
                              </>
                            )}
                            {canRecall && (
                              <button onClick={() => act(r, 'reject')} className="flex items-center text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-bold transition-colors" title="Recall your submitted SO">
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Recall
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {r.status === 'approved' && (
                        <>
                          {r.deliveryStatus !== 'fully_delivered' && (
                            <button onClick={() => createDeliveryFromSo(r)} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors" title="Dispatch items from this SO">
                              <Truck className="w-3.5 h-3.5 mr-1" /> Create Delivery
                            </button>
                          )}
                          <Popconfirm title="Cancel this SO?" onConfirm={() => act(r, 'cancel')}>
                            <button className="flex items-center text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold transition-colors">
                              <StopCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                            </button>
                          </Popconfirm>
                          <button onClick={() => handleShortClose(r)} className="flex items-center text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-xs font-bold transition-colors" title="Close remaining undelivered lines">
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
                    No sales orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer 
        title={<span className="font-bold text-slate-900 dark:text-white">{editingId ? 'Edit Sales Order' : 'New Sales Order'}</span>} 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); setEditingId(null); } }} 
        width={1000}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-pink-600 text-white font-bold rounded-lg shadow-sm hover:bg-pink-700 transition-colors">
            {saving ? 'Saving...' : (editingId ? 'Update SO' : 'Create SO')}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="customerId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Customer</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" placeholder="Select customer" options={customers.map((c) => ({ value: c.id, label: `${c.customerCode} — ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">SO Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expectedDeliveryDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Expected Delivery</span>} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="customerPoNumber" label={<span className="font-bold text-slate-700 dark:text-slate-300">Customer PO No.</span>} className="mb-0 col-span-2">
              <Input placeholder="Reference number from customer" />
            </Form.Item>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <ShoppingBag className="w-4 h-4 mr-2 text-pink-600" /> Order Items
              </h3>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))} />
            </div>
          </div>

          <DynamicCustomFields
            companyId={company?.id}
            documentType="sales.so"
          />

          <Form.Item name="remarks" label={<span className="font-bold text-slate-700 dark:text-slate-300">Remarks / Terms</span>} className="mt-4">
            <Input.TextArea rows={2} className="rounded-lg" placeholder="Enter delivery instructions, terms, etc." />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer 
        title={
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5 text-pink-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'Sales Order'}</span>
          </div>
        } 
        open={!!viewing} 
        onClose={() => setViewing(null)} 
        width={900}
      >
        {viewing && (
          <div className="space-y-6">
            {viewing.approvalInfo && (
              <div className="p-4 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/50 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider">Multi-Level Approval Workflow</p>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                    Current Level: <span className="font-bold text-indigo-700 dark:text-indigo-400">Level {viewing.approvalInfo.currentLevel}</span>
                    {viewing.approvalInfo.currentApproverName && ` — Assigned to: ${viewing.approvalInfo.currentApproverName}`}
                  </p>
                </div>
                {viewing.approvalInfo.hasApproved && (
                  <Tag color="success">You Approved (Waiting for next level)</Tag>
                )}
                {viewing.approvalInfo.isEligibleApprover && !viewing.approvalInfo.hasApproved && (
                  <Tag color="processing">Action Required: Your Approval</Tag>
                )}
              </div>
            )}

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
              {viewing.createdByName && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Created By</p>
                  <p className="font-medium text-slate-900 dark:text-white mt-1">{viewing.createdByName}</p>
                </div>
              )}
              {viewing.submittedByName && (
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Submitted By</p>
                  <p className="font-medium text-slate-900 dark:text-white mt-1">{viewing.submittedByName}</p>
                </div>
              )}
            </div>
            
            <div className="flex justify-end p-4 bg-pink-50 dark:bg-pink-900/30 border border-pink-100 dark:border-pink-800/50 rounded-lg">
               <div className="flex flex-col items-end">
                  <p className="text-sm font-bold text-pink-800">Total Order Amount</p>
                  <p className="font-mono text-2xl font-black text-pink-700 mt-1"><AmountDisplay paise={viewing.totalAmountPaise} /></p>
               </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Order Items</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
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
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          <div>{l.description || '—'}</div>
                          {l.customData?.estimatedMarginPercent !== undefined && (
                            <div className="mt-1 flex items-center gap-1">
                              <Tag color={Number(l.customData.estimatedMarginPercent) >= 20 ? 'success' : (Number(l.customData.estimatedMarginPercent) > 0 ? 'warning' : 'error')} style={{ fontSize: 10, borderRadius: 8, margin: 0 }}>
                                Margin: {Number(l.customData.estimatedMarginPercent).toFixed(1)}% (Est Cost: ₹{(Number(l.customData.estimatedUnitCostPaise || 0) / 100).toFixed(2)})
                              </Tag>
                            </div>
                          )}
                        </td>
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
            {viewing.status === 'submitted' && (() => {
              const hasWorkflow = !!viewing.approvalInfo;
              const isEligible = hasWorkflow ? viewing.approvalInfo.isEligibleApprover : true;
              const hasApproved = hasWorkflow ? viewing.approvalInfo.hasApproved : false;
              const isMaker = user?.id === viewing.createdBy || user?.id === viewing.submittedBy;
              const canRecall = isMaker;

              return (
                <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  {hasWorkflow && hasApproved && (
                    <span className="text-emerald-600 dark:text-emerald-500 text-sm italic font-bold">Approved by you. Waiting for next level.</span>
                  )}
                  {isEligible && !isMaker && (
                    <>
                      <Popconfirm title="Approve this SO?" onConfirm={async () => { await act(viewing, 'approve'); setViewing(null); }}>
                        <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors">
                          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve Order
                        </button>
                      </Popconfirm>
                      <button onClick={async () => { await act(viewing, 'reject'); setViewing(null); }} className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors">
                        <XCircle className="w-4 h-4 mr-1.5" /> Reject Order
                      </button>
                    </>
                  )}
                  {canRecall && (
                    <button onClick={async () => { await act(viewing, 'reject'); setViewing(null); }} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors" title="Recall your submitted SO">
                      <XCircle className="w-4 h-4 mr-1.5" /> Recall Submission
                    </button>
                  )}
                </div>
              );
            })()}

            {viewing.status === 'approved' && viewing.deliveryStatus !== 'fully_delivered' && (
              <div className="flex items-center justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    const row = viewing;
                    setViewing(null);
                    createDeliveryFromSo(row);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center shadow-sm transition-colors"
                >
                  <Truck className="w-4 h-4 mr-1.5" /> Create Delivery Note
                </button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default SalesOrdersPage;
