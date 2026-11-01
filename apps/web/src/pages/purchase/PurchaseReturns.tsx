import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, message, Modal } from 'antd';
import dayjs from 'dayjs';
import { RotateCcw, Plus, Eye, Send, CheckCircle2, Search, FileText, Building2, Calendar, Warehouse, DollarSign, Clock, ShieldCheck, ClipboardList } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode, type Warehouse as WarehouseType } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';
import { STATUS_OPTIONS, apiErr, LinesEditor, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

export function PurchaseReturnsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { user } = useAuthStore();
  const [form] = Form.useForm();

  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [grns, setGrns] = useState<PurchaseHeader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);

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
    purchaseApi.returns.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listTaxCodes(company.id).then(setTaxCodes).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
    purchaseApi.grns.list(company.id).then((r) => setGrns(r.data)).catch(() => {});
  }, [company?.id, plant?.id]);

  const refItems: RefItem[] = useMemo(() => items.map((i) => ({
    id: i.id,
    itemName: i.itemName,
    itemCode: i.itemCode,
    primaryUom: i.primaryUom,
    defaultTaxCodeId: i.defaultTaxCodeId,
    purchaseRatePaise: i.purchaseRatePaise,
    sellingPricePaise: i.sellingPricePaise,
  })), [items]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      const matchSearch =
        r.documentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        supplierName(r.supplierId).toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [rows, searchQuery, suppliers]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      postingDate: dayjs(),
      plantId: plant?.id,
      warehouseId: warehouses[0]?.id,
    });
    setLines([newDraftLine()]);
    setDrawer(true);
  };

  const handleSave = async (submitAfter = false) => {
    try {
      const values = await form.validateFields();
      const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
      if (validLines.length === 0) {
        message.error('Please enter at least one valid return line item');
        return;
      }

      setSaving(true);
      const payload = {
        plantId: plant?.id || values.plantId,
        warehouseId: values.warehouseId,
        supplierId: values.supplierId,
        grnId: values.grnId || undefined,
        postingDate: dayjs(values.postingDate).format('YYYY-MM-DD'),
        reason: values.reason,
        remarks: values.remarks,
        customData: values.customData || {},
        lines: validLines.map((l) => {
          const ratePaise = Math.round((l.rateRupees || 0) * 100);
          const grossPaise = Math.round(l.quantity * ratePaise);
          const discountPaise = Math.round((grossPaise * (l.discountPercent || 0)) / 100);
          return {
            itemId: l.itemId,
            description: l.description,
            quantity: l.quantity,
            uom: l.uom,
            ratePaise,
            discountPercent: l.discountPercent || 0,
            discountPaise,
            taxCodeId: l.taxCodeId || undefined,
            warehouseId: values.warehouseId,
          };
        }),
      };

      const res = await purchaseApi.returns.create(payload);
      if (submitAfter && res?.id) {
        await purchaseApi.returns.act(res.id, 'submit', company!.id);
      }
      message.success(`Purchase Return ${res.documentNumber} saved successfully`);
      setDrawer(false);
      load();
    } catch (err: any) {
      message.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: string, action: 'submit' | 'approve') => {
    try {
      await purchaseApi.returns.act(id, action, company!.id);
      message.success(`Purchase return ${action}d successfully`);
      if (viewing && viewing.id === id) {
        setViewing(null);
      }
      load();
    } catch (err: any) {
      message.error(apiErr(err));
    }
  };

  const totalReturns = rows.length;
  const totalReturnValuePaise = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.totalAmountPaise || 0), 0);
  }, [rows]);
  const pendingReturns = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const approvedReturns = rows.filter((r) => r.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 rounded-xl">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Purchase</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Returns</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Purchase Returns
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Goods returned to vendors — issues physical stock OUT at purchase rate & updates clearing accounts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Return Note
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Returns</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalReturns}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Return notes logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Return Value</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalReturnValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Outward stock credit
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
              {pendingReturns}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting dispatch sign-off
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved & Dispatched</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedReturns}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stock ledger deducted
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search return note or vendor name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-white"
            />
          </div>
          <Select
            placeholder="All Statuses"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-44"
            options={STATUS_OPTIONS}
          />
        </div>

        {/* Returns Table Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Purchase Return Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vendor debit notes and physical dispatch tracking
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} returns
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-4 px-6">Document #</th>
                <th className="py-4 px-6">Vendor</th>
                <th className="py-4 px-6">Date</th>
                <th className="py-4 px-6">Status</th>
                <th className="py-4 px-6 text-right">Return Amount</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">Loading purchase returns...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">No purchase return notes found.</td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition">
                    <td className="py-4 px-6 font-mono font-medium text-amber-600 dark:text-amber-400">
                      {r.documentNumber}
                    </td>
                    <td className="py-4 px-6 font-medium text-slate-800 dark:text-slate-200">
                      {supplierName(r.supplierId)}
                    </td>
                    <td className="py-4 px-6 text-slate-600 dark:text-slate-400">
                      {r.postingDate}
                    </td>
                    <td className="py-4 px-6">
                      <StatusBadge status={r.status as DocumentStatus} />
                    </td>
                    <td className="py-4 px-6 text-right font-medium text-slate-900 dark:text-slate-100 font-mono">
                      <AmountDisplay paise={r.totalAmountPaise} />
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => purchaseApi.returns.get(company!.id, r.id).then(setViewing)}
                          className="p-1.5 text-slate-500 hover:text-amber-600 rounded transition cursor-pointer"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        {r.status === 'draft' && (
                          <button
                            onClick={() => handleAction(r.id, 'submit')}
                            className="p-1.5 text-slate-500 hover:text-blue-600 rounded transition cursor-pointer"
                            title="Submit Return"
                          >
                            <Send size={16} />
                          </button>
                        )}
                        {r.status === 'submitted' && (
                          <button
                            onClick={() => handleAction(r.id, 'approve')}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 rounded transition cursor-pointer"
                            title="Approve & Post Stock Out"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Drawer */}
      <Drawer
        title="Create Purchase Return Note"
        open={drawer}
        onClose={async () => {
          if (await confirmClose(form)) {
            form.resetFields();
            setDrawer(false);
          }
        }}
        width={920}
        extra={
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              Save as Draft
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition"
            >
              Save & Submit
            </button>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Form.Item name="supplierId" label="Vendor" rules={[{ required: true, message: 'Vendor is required' }]}>
              <Select
                showSearch
                placeholder="Select vendor"
                optionFilterProp="label"
                options={suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))}
              />
            </Form.Item>

            <Form.Item name="warehouseId" label="Return From Warehouse" rules={[{ required: true }]}>
              <Select
                placeholder="Select warehouse"
                options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseType})` }))}
              />
            </Form.Item>

            <Form.Item name="postingDate" label="Return Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Form.Item name="grnId" label="Original GRN (Optional)">
              <Select
                showSearch
                allowClear
                placeholder="Link to original Goods Receipt"
                optionFilterProp="label"
                options={grns.map((g) => ({ value: g.id, label: `${g.documentNumber} (${g.postingDate})` }))}
              />
            </Form.Item>

            <Form.Item name="reason" label="Reason for Return">
              <Input placeholder="e.g. Quality rejection, wrong grade, damaged packaging" />
            </Form.Item>
          </div>

          <div className="mb-4">
            <div className="font-semibold text-sm mb-2 text-slate-800 dark:text-slate-200">Return Items</div>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={refItems}
              taxCodes={taxCodes}
            />
          </div>

          <DynamicCustomFields
            companyId={company?.id}
            documentType="purchase.return"
          />

          <Form.Item name="remarks" label="Remarks / Memo">
            <Input.TextArea rows={2} placeholder="Optional notes for vendor..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Details View Modal */}
      <Modal
        title={`Purchase Return: ${viewing?.documentNumber || ''}`}
        open={Boolean(viewing)}
        onCancel={() => setViewing(null)}
        width={750}
        footer={[
          <button
            key="close"
            onClick={() => setViewing(null)}
            className="px-4 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
          >
            Close
          </button>,
          viewing?.status === 'submitted' && (
            <button
              key="approve"
              onClick={() => handleAction(viewing.id, 'approve')}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium ml-2"
            >
              Approve Return (Post Stock OUT)
            </button>
          ),
        ]}
      >
        {viewing && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
              <div>
                <span className="text-slate-400 block">Vendor</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{supplierName(viewing.supplierId)}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Return Date</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{viewing.postingDate}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Status</span>
                <StatusBadge status={viewing.status} />
              </div>
              <div>
                <span className="text-slate-400 block">Total Value</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  <AmountDisplay paise={viewing.totalAmountPaise} />
                </span>
              </div>
            </div>

            {viewing.journalEntryId && (
              <div className="p-2.5 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900 rounded-lg text-xs flex justify-between">
                <span className="text-indigo-900 dark:text-indigo-300">Stock Reversal Journal Voucher:</span>
                <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400">{viewing.journalEntryId}</span>
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="p-2.5 text-left">#</th>
                    <th className="p-2.5 text-left">Item</th>
                    <th className="p-2.5 text-right">Qty</th>
                    <th className="p-2.5 text-right">Rate</th>
                    <th className="p-2.5 text-right">Tax</th>
                    <th className="p-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(viewing.lines || []).map((l: any, idx: number) => (
                    <tr key={l.id || idx}>
                      <td className="p-2.5 text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-medium">{l.description || l.itemId}</td>
                      <td className="p-2.5 text-right">{l.quantity} {l.uom}</td>
                      <td className="p-2.5 text-right">₹{((l.ratePaise || 0) / 100).toFixed(2)}</td>
                      <td className="p-2.5 text-right">₹{((l.taxAmountPaise || 0) / 100).toFixed(2)}</td>
                      <td className="p-2.5 text-right font-semibold">₹{((l.totalAmountPaise || 0) / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
