import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, message, Modal, Progress } from 'antd';
import dayjs from 'dayjs';
import {
  FileSpreadsheet, Plus, Eye, Send, CheckCircle2, Search,
  Calendar, Building2, DollarSign, Clock, AlertTriangle, Layers
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { purchaseApi, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';
import { STATUS_OPTIONS, apiErr, LinesEditor, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

interface BlanketPOHeader {
  id: string;
  companyId: string;
  plantId: string;
  documentNumber: string;
  status: string;
  postingDate: string;
  validFrom: string;
  validTo: string;
  totalAmountPaise: number;
  netAmountPaise?: number;
  supplierId: string;
  supplierName?: string;
  supplierCode?: string;
  termsAndConditions?: string;
  remarks?: string;
  createdAt: string;
}

export function BlanketPurchaseOrdersPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { user } = useAuthStore();
  const [form] = Form.useForm();

  const [rows, setRows] = useState<BlanketPOHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
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
    purchaseApi.blanketOrders.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r: any) => setRows(Array.isArray(r) ? r : (r.data ?? [])))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listTaxCodes(company.id).then(setTaxCodes).catch(() => {});
  }, [company?.id]);

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
        (r.supplierName ?? supplierName(r.supplierId)).toLowerCase().includes(searchQuery.toLowerCase());
      return matchSearch;
    });
  }, [rows, searchQuery, suppliers]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      postingDate: dayjs(),
      validFrom: dayjs(),
      validTo: dayjs().add(1, 'year'),
    });
    setLines([newDraftLine()]);
    setDrawer(true);
  };

  const handleCreate = async (values: any) => {
    if (!plant?.id) {
      message.error('Please select an active plant');
      return;
    }
    const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
    if (validLines.length === 0) {
      message.error('At least one item line with committed quantity is required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        plantId: plant.id,
        supplierId: values.supplierId,
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        validFrom: values.validFrom.format('YYYY-MM-DD'),
        validTo: values.validTo.format('YYYY-MM-DD'),
        termsAndConditions: values.termsAndConditions,
        remarks: values.remarks,
        lines: validLines.map((l) => {
          const ratePaise = Math.round((l.rateRupees || 0) * 100);
          const discountPaise = Math.round(l.quantity * ratePaise * ((l.discountPercent || 0) / 100));
          return {
            itemId: l.itemId!,
            committedQty: l.quantity,
            uom: l.uom || 'NOS',
            ratePaise,
            discountPercent: l.discountPercent || 0,
            discountPaise,
            taxCodeId: l.taxCodeId || undefined,
          };
        }),
      };

      await purchaseApi.blanketOrders.create(payload);
      message.success('Blanket purchase order created successfully');
      setDrawer(false);
      load();
    } catch (err) {
      message.error(apiErr(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: string, action: 'submit' | 'approve' | 'cancel') => {
    if (!company?.id) return;
    try {
      await purchaseApi.blanketOrders.act(id, action, company.id);
      message.success(`Blanket PO ${action}d successfully`);
      load();
      if (viewing?.id === id) {
        viewDetails(id);
      }
    } catch (err) {
      message.error(apiErr(err));
    }
  };

  const viewDetails = async (id: string) => {
    if (!company?.id) return;
    try {
      const data = await purchaseApi.blanketOrders.get(company.id, id);
      setViewing(data);
    } catch (err) {
      message.error(apiErr(err));
    }
  };

  // Metrics summary
  const totalContracts = rows.length;
  const activeContracts = rows.filter((r) => r.status === 'approved' || r.status === 'active').length;
  const totalCommittedValuePaise = rows.reduce((s, r) => s + (r.totalAmountPaise || 0), 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Procurement</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Blanket Purchase Orders</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Blanket Rate Contracts
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                GAP 7
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Lock in long-term annual rates and volume commitments with staggered PO call-offs.
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          New Blanket PO
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Contracts</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2">{totalContracts}</div>
          <div className="text-xs text-slate-400 mt-1">Total blanket orders logged</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Rate Locks</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{activeContracts}</div>
          <div className="text-xs text-slate-400 mt-1">Available for release POs</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Committed Value</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold mt-2">
            <AmountDisplay paise={totalCommittedValuePaise} />
          </div>
          <div className="text-xs text-slate-400 mt-1">Cumulative contract commitment</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            placeholder="Search by BPO number or supplier name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Select
            allowClear
            placeholder="Filter by Status"
            value={statusFilter}
            onChange={setStatusFilter}
            className="w-full sm:w-44"
            options={STATUS_OPTIONS}
          />
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Contract Number</th>
                <th className="px-5 py-3.5">Supplier</th>
                <th className="px-5 py-3.5">Validity Window</th>
                <th className="px-5 py-3.5">Total Committed</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading blanket contracts...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                    No blanket purchase orders found. Create your first contract!
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const isExpiringSoon = dayjs(r.validTo).diff(dayjs(), 'day') < 30 && dayjs(r.validTo).isAfter(dayjs());
                  const isExpired = dayjs(r.validTo).isBefore(dayjs());

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-4 font-semibold text-indigo-600 dark:text-indigo-400">
                        {r.documentNumber}
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium">{r.supplierName ?? supplierName(r.supplierId)}</div>
                        {r.supplierCode && <div className="text-xs text-slate-400">{r.supplierCode}</div>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-xs flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>{dayjs(r.validFrom).format('DD MMM YYYY')}</span>
                          <span className="text-slate-400">→</span>
                          <span className={isExpired ? 'text-rose-500 font-semibold' : isExpiringSoon ? 'text-amber-500 font-semibold' : ''}>
                            {dayjs(r.validTo).format('DD MMM YYYY')}
                          </span>
                        </div>
                        {isExpiringSoon && (
                          <div className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1 font-medium">
                            <AlertTriangle className="w-3 h-3" /> Expires soon
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium">
                        <AmountDisplay paise={r.totalAmountPaise} />
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status as DocumentStatus} />
                      </td>
                      <td className="px-5 py-4 text-right space-x-2">
                        <button
                          onClick={() => viewDetails(r.id)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {r.status === 'draft' && (
                          <button
                            onClick={() => handleAction(r.id, 'submit')}
                            className="p-1.5 text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Submit for Approval"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {r.status === 'submitted' && (
                          <button
                            onClick={() => handleAction(r.id, 'approve')}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Approve / Activate"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {/* Create Blanket PO Drawer */}
      <Drawer
        title="Create Blanket Purchase Order (Rate Contract)"
        width={800}
        open={drawer}
        onClose={() => setDrawer(false)}
        extra={
          <button
            onClick={() => form.submit()}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item name="supplierId" label="Supplier / Vendor" rules={[{ required: true, message: 'Supplier is required' }]}>
              <Select
                showSearch
                placeholder="Select Vendor"
                filterOption={(input, option) => (option?.label as string ?? '').toLowerCase().includes(input.toLowerCase())}
                options={suppliers.map((s) => ({ value: s.id, label: `${s.name} (${s.supplierCode})` }))}
              />
            </Form.Item>
            <Form.Item name="postingDate" label="Document Date" rules={[{ required: true }]}>
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item name="validFrom" label="Contract Valid From" rules={[{ required: true }]}>
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
            <Form.Item name="validTo" label="Contract Valid To" rules={[{ required: true }]}>
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <Form.Item name="termsAndConditions" label="Contract Terms & Conditions">
            <Input.TextArea rows={2} placeholder="Payment schedules, delivery batches, locked price duration..." />
          </Form.Item>

          <div className="pt-2">
            <h3 className="text-sm font-semibold mb-2">Committed Items & Contract Rates</h3>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={refItems}
              taxCodes={taxCodes}
            />
          </div>

          <Form.Item name="remarks" label="Remarks / Internal Notes">
            <Input.TextArea rows={2} placeholder="Optional procurement notes..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Contract Detail & Release Progress Drawer */}
      <Drawer
        title={`Blanket Contract ${viewing?.documentNumber ?? ''}`}
        width={750}
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div className="space-y-6 text-sm">
            {/* Header pill */}
            <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold text-base">{viewing.supplierName}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Validity: {dayjs(viewing.validFrom).format('DD MMM YYYY')} → {dayjs(viewing.validTo).format('DD MMM YYYY')}
                </div>
              </div>
              <StatusBadge status={viewing.status as DocumentStatus} />
            </div>

            {/* Item-level committed vs released breakdown */}
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-3">
                Item Line Quotas & Release Progress
              </h4>
              <div className="space-y-3">
                {viewing.lines?.map((line: any) => {
                  const committed = parseFloat(line.committedQty || '0');
                  const released = parseFloat(line.releasedQty || '0');
                  const pct = committed > 0 ? Math.min(100, Math.round((released / committed) * 100)) : 0;

                  return (
                    <div key={line.id} className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-slate-900 dark:text-white">{line.itemName}</div>
                          <div className="text-xs text-slate-400">{line.itemCode} • Locked Rate: <AmountDisplay paise={line.ratePaise} /> / {line.uom}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold">
                            {released} / {committed} {line.uom}
                          </div>
                          <div className="text-[11px] text-slate-400">{pct}% released</div>
                        </div>
                      </div>
                      <Progress percent={pct} strokeColor="#4f46e5" size="small" showInfo={false} className="mt-2" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Linked Release Orders */}
            <div>
              <h4 className="font-semibold text-xs uppercase tracking-wider text-slate-500 mb-3">
                Release Purchase Orders (Call-Offs)
              </h4>
              {viewing.releaseOrders?.length === 0 ? (
                <div className="text-xs text-slate-400 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-800 text-center">
                  No standard POs have been called off against this blanket contract yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  {viewing.releaseOrders?.map((po: any) => (
                    <div key={po.id} className="p-3 flex items-center justify-between bg-white dark:bg-slate-900">
                      <div>
                        <div className="font-medium text-indigo-600 dark:text-indigo-400">{po.documentNumber}</div>
                        <div className="text-xs text-slate-400">{dayjs(po.postingDate).format('DD MMM YYYY')}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <AmountDisplay paise={po.totalAmountPaise} />
                        <StatusBadge status={po.status as DocumentStatus} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
