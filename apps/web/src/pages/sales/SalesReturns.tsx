import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, message, Modal } from 'antd';
import dayjs from 'dayjs';
import { RotateCcw, Plus, Eye, Send, CheckCircle2, Search, FileText, User, Calendar, Warehouse, DollarSign, Clock, ShieldCheck, ClipboardList } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { salesApi, type SalesHeader, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode, type Warehouse as WarehouseType } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { STATUS_OPTIONS, apiErr, LinesEditor, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

export function SalesReturnsPage() {
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
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
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
    salesApi.returns.list(company.id, statusFilter ? { status: statusFilter } : undefined)
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
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
  }, [company?.id, plant?.id]);

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
    form.resetFields();
    form.setFieldsValue({
      postingDate: dayjs(),
      warehouseId: warehouses[0]?.id,
    });
    setLines([newDraftLine()]);
    setDrawer(true);
  };

  const handleClose = async () => {
    if (await confirmClose(form)) {
      setDrawer(false);
      form.resetFields();
    }
  };

  const handleSave = async () => {
    try {
      const vals = await form.validateFields();
      if (!company?.id || !plant?.id) {
        message.error('Active company and plant are required');
        return;
      }
      const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
      if (validLines.length === 0) {
        message.error('At least one item line with quantity > 0 is required');
        return;
      }
      setSaving(true);
      const payload = {
        plantId: plant.id,
        customerId: vals.customerId,
        warehouseId: vals.warehouseId,
        postingDate: vals.postingDate.format('YYYY-MM-DD'),
        reason: vals.reason,
        remarks: vals.remarks,
        lines: validLines.map((l) => ({
          itemId: l.itemId!,
          description: l.description,
          returnedQty: l.quantity,
          uom: l.uom || 'NOS',
          ratePaise: Math.round(l.rateRupees * 100),
          discountPercent: l.discountPercent || 0,
          taxCodeId: l.taxCodeId,
        })),
      };

      await salesApi.returns.create(payload);
      message.success('Sales Return created successfully');
      setDrawer(false);
      load();
    } catch (e: any) {
      message.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (row: SalesHeader, action: 'submit' | 'approve') => {
    if (!company?.id) return;
    try {
      await salesApi.returns.act(row.id, action, company.id);
      message.success(`Sales Return ${action}d successfully`);
      load();
      if (viewing?.id === row.id) {
        openView(row);
      }
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: SalesHeader) => {
    if (!company?.id) return;
    try {
      const full = await salesApi.returns.get(company.id, row.id);
      setViewing(full);
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      custName(r.customerId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, customers]);

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
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/40 rounded-xl">
            <RotateCcw className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Sales</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-rose-600 dark:text-rose-400">Returns</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sales Returns (RMA)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Record customer returns, restock inventory & reverse COGS entries
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Sales Return
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total RMAs</span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
                <RotateCcw className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalReturns}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Return requests logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Restocked Value</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalReturnValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Reversed cost of sales
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
              {pendingReturns}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting QC inspection
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved & Restocked</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedReturns}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stock re-entered on hand
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search Return number or customer..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 dark:text-white"
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
                Sales Return Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                RMA authorization, warehouse restocking, and COGS reversals
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} returns
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">Return Number</th>
                <th className="px-6 py-4 font-bold">Customer</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-right">Total (₹)</th>
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
                      <span className="font-mono font-bold text-rose-700 dark:text-rose-400 transition-colors">{r.documentNumber}</span>
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
                    No sales returns found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail View Modal */}
      <Modal
        open={!!viewing}
        onCancel={() => setViewing(null)}
        footer={null}
        width={760}
        title={
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-5 h-5 text-rose-600" />
            <span>Sales Return — {viewing?.documentNumber}</span>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-xs">
              <div><span className="text-slate-400">Customer:</span> <strong className="block text-slate-800 dark:text-slate-200">{custName(viewing.customerId)}</strong></div>
              <div><span className="text-slate-400">Posting Date:</span> <strong className="block text-slate-800 dark:text-slate-200">{viewing.postingDate}</strong></div>
              <div><span className="text-slate-400">Status:</span> <div className="mt-0.5"><StatusBadge status={viewing.status as DocumentStatus} size="small" /></div></div>
              <div><span className="text-slate-400">Total Amount:</span> <strong className="block text-slate-800 dark:text-slate-200"><AmountDisplay paise={viewing.totalAmountPaise} /></strong></div>
            </div>

            {viewing.reason && (
              <div className="text-xs text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-2.5 rounded">
                <strong>Return Reason:</strong> {viewing.reason}
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="p-2.5">Item</th>
                    <th className="p-2.5 text-right">Returned Qty</th>
                    <th className="p-2.5 text-right">Rate (₹)</th>
                    <th className="p-2.5 text-right">Net (₹)</th>
                    <th className="p-2.5 text-right">Tax (₹)</th>
                    <th className="p-2.5 text-right">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(viewing.lines ?? []).map((l: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2.5">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{l.description || l.itemId}</div>
                        <div className="text-slate-400 text-[10px]">{l.uom}</div>
                      </td>
                      <td className="p-2.5 text-right font-mono font-medium">{l.returnedQty}</td>
                      <td className="p-2.5 text-right font-mono"><AmountDisplay paise={l.ratePaise} /></td>
                      <td className="p-2.5 text-right font-mono"><AmountDisplay paise={l.netAmountPaise} /></td>
                      <td className="p-2.5 text-right font-mono"><AmountDisplay paise={l.taxAmountPaise} /></td>
                      <td className="p-2.5 text-right font-mono font-bold"><AmountDisplay paise={l.totalAmountPaise} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {viewing.journalEntryId && (
              <div className="flex items-center text-xs text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950/30 p-2 rounded">
                <CheckCircle2 className="w-4 h-4 mr-1.5 shrink-0" />
                <span>Restock and COGS reversal posted to General Ledger (Entry #{viewing.journalEntryId.slice(0, 8)}).</span>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {viewing.status === 'draft' && (
                <button
                  onClick={() => act(viewing, 'submit')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-xs font-bold transition-colors"
                >
                  Submit Return
                </button>
              )}
              {viewing.status === 'submitted' && (
                <button
                  onClick={() => act(viewing, 'approve')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition-colors"
                >
                  Approve & Take into Stock
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create Drawer */}
      <Drawer
        title={
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-5 h-5 text-rose-600" />
            <span className="font-bold">New Sales Return (Customer Return)</span>
          </div>
        }
        width={860}
        open={drawer}
        onClose={handleClose}
        footer={
          <div className="flex justify-between items-center py-2">
            <span className="text-xs text-slate-500">
              * Approving this return will automatically restock items into warehouse and generate COGS reversal entries.
            </span>
            <div className="flex space-x-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors"
              >
                {saving ? 'Creating...' : 'Save Draft'}
              </button>
            </div>
          </div>
        }
      >
        <Form form={form} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Form.Item
              name="customerId"
              label="Customer"
              rules={[{ required: true, message: 'Please select a customer' }]}
            >
              <Select
                showSearch
                placeholder="Select Customer"
                optionFilterProp="children"
                options={customers.map((c) => ({ value: c.id, label: `${c.name} (${c.customerCode})` }))}
              />
            </Form.Item>

            <Form.Item
              name="warehouseId"
              label="Restock Warehouse"
              rules={[{ required: true, message: 'Please select warehouse' }]}
            >
              <Select
                showSearch
                placeholder="Select Warehouse"
                optionFilterProp="label"
                options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
              />
            </Form.Item>

            <Form.Item
              name="postingDate"
              label="Return Date"
              rules={[{ required: true, message: 'Please select date' }]}
            >
              <DatePicker className="w-full" format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item name="reason" label="Return Reason">
              <Input placeholder="e.g. Defective batch, rejected delivery, wrong size" />
            </Form.Item>

            <Form.Item name="remarks" label="Remarks">
              <Input placeholder="Internal notes or customer remarks" />
            </Form.Item>
          </div>

          <div className="mt-4 mb-2">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-2">Return Items</h3>
            <LinesEditor
              lines={lines}
              onChange={setLines}
              items={refItems}
              taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))}
              showDiscount={true}
              showTax={true}
            />
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
