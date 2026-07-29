import React, { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, DatePicker, Input, Select, message } from 'antd';
import dayjs from 'dayjs';
import { Receipt, Plus, Eye, Search, Send, CheckCircle2, FileText, Building2, Calendar, ClipboardList, Scale } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { STATUS_OPTIONS, apiErr, LinesEditor, pricedLineBody, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';
import { ThreeWayMatchModal, type MatchLine } from './ThreeWayMatchModal';

export function PurchaseInvoicesPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [grns, setGrns] = useState<PurchaseHeader[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';
  const gstBpOf = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.invoices.list(company.id, statusFilter ? { status: statusFilter } : undefined)
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
    purchaseApi.grns.list(company.id, { status: 'approved' }).then((r) => setGrns(r.data)).catch(() => {});
  }, [company?.id]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const handleGrnChange = async (grnId?: string) => {
    if (!grnId || !company?.id) return;
    try {
      const grn = await purchaseApi.grns.get(company.id, grnId);
      if (grn) {
        form.setFieldsValue({ supplierId: grn.supplierId, poId: grn.poId });
        if (grn.lines) {
          const newLines = grn.lines.map((l: any, i: number) => {
            const it = items.find((item) => item.id === l.itemId);
            return {
              key: Date.now() + i,
              itemId: l.itemId,
              description: l.description || undefined,
              quantity: Number(l.acceptedQty) || Number(l.receivedQty) || 1,
              uom: l.uom,
              rateRupees: l.ratePaise ? Number(l.ratePaise) / 100 : 0,
              discountPercent: 0,
              taxCodeId: it?.defaultTaxCodeId || undefined,
              poLineId: l.poLineId || undefined,
              grnLineId: l.id,
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
    try { setViewing(await purchaseApi.invoices.get(company.id, row.id)); }
    catch (e) { message.error(apiErr(e)); }
  };

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id, postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: v.supplierId, supplierInvoiceNumber: v.supplierInvoiceNumber, poId: v.poId || undefined,
      supplierInvoiceDate: v.supplierInvoiceDate?.format?.('YYYY-MM-DD') || undefined, dueDate: v.dueDate?.format?.('YYYY-MM-DD') || undefined,
      lines: valid.map((l) => pricedLineBody(l, gstBpOf)),
    };
    try { 
      await purchaseApi.invoices.create(body); 
      message.success('Invoice created.'); 
      setDrawer(false); 
      load(); 
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: PurchaseHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await purchaseApi.invoices.act(r.id, a, company.id); message.success(`Invoice ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchLines, setMatchLines] = useState<MatchLine[]>([]);
  const [matchInvNo, setMatchInvNo] = useState<string>('');

  const openMatchModal = (r: PurchaseHeader) => {
    setMatchInvNo(r.documentNumber || r.supplierInvoiceNumber || '');
    const sampleLines: MatchLine[] = ((r as any).lines || []).map((l: any, idx: number) => ({
      id: l.id || String(idx),
      itemCode: l.itemCode || `ITEM-${idx + 1}`,
      itemName: l.itemName || `Raw Material Item ${idx + 1}`,
      poOrderedQty: Number(l.quantity) || 100,
      poUnitPricePaise: Number(l.ratePaise) || 5000,
      grnReceivedQty: Number(l.acceptedQty) || Number(l.quantity) || 100,
      invoiceBilledQty: Number(l.quantity) || 100,
      invoiceUnitPricePaise: Number(l.ratePaise) || 5000,
    }));
    setMatchLines(sampleLines);
    setMatchModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 transition-colors relative z-10 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white dark:text-white transition-colors">Purchase Invoices</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-400 transition-colors">Record supplier bills. Approving books Accounts Payable.</p>
          </div>
        </div>
        <button 
          onClick={openNew}
          className="flex items-center px-4 py-2 bg-blue-600 dark:bg-blue-600/90 text-white font-bold rounded-lg shadow-sm hover:bg-blue-700 dark:hover:bg-blue-500 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> New Invoice
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Invoice number..." 
              className="pl-9 pr-4 py-2 w-64 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm text-slate-900 dark:text-white dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
                <th className="px-6 py-4 font-bold">Invoice Number</th>
                <th className="px-6 py-4 font-bold">Supplier Info</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-right">Total (₹)</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                      <div className="flex flex-col">
                        <span className="text-slate-800 dark:text-slate-200 dark:text-slate-200 font-bold transition-colors">{supplierName(r.supplierId)}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400">Ref: {r.supplierInvoiceNumber || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
                      <span className="text-slate-500 dark:text-slate-400 dark:text-slate-400 font-medium transition-colors">{r.postingDate}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white dark:text-white transition-colors">
                    <AmountDisplay paise={r.totalAmountPaise} />
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={r.status as DocumentStatus} size="small" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button onClick={() => openMatchModal(r)} className="flex items-center px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 dark:text-slate-300 rounded text-xs font-bold transition-colors">
                        <Scale className="w-3.5 h-3.5 mr-1" /> 3-Way Match
                      </button>
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
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 dark:text-slate-400 transition-colors">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No Invoices found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer 
        title={<span className="font-bold text-slate-900 dark:text-white">New Purchase Invoice</span>} 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} 
        width={1000}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
            {saving ? 'Saving...' : 'Create Invoice'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="supplierId" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Select showSearch optionFilterProp="label" placeholder="Select supplier" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="grnId" label={<span className="font-bold text-slate-700 dark:text-slate-300">From GRN</span>} className="mb-0 col-span-2">
              <Select allowClear showSearch optionFilterProp="label" placeholder="Select Approved GRN" onChange={handleGrnChange} options={grns.map((p) => ({ value: p.id, label: `${p.documentNumber} (${supplierName(p.supplierId)})` }))} />
            </Form.Item>
            <Form.Item name="supplierInvoiceNumber" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier Inv No.</span>} rules={[{ required: true }]} className="mb-0 col-span-2">
              <Input placeholder="Invoice Number from Supplier" />
            </Form.Item>
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Internal Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="supplierInvoiceDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Supplier Inv Date</span>} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <Receipt className="w-4 h-4 mr-2 text-blue-600" /> Billed Items
              </h3>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))} />
            </div>
          </div>
        </Form>
      </Drawer>

      <Drawer 
        title={
          <div className="flex items-center space-x-2">
            <Receipt className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'Invoice'}</span>
          </div>
        } 
        open={!!viewing} 
        onClose={() => setViewing(null)} 
        width={900}
      >
        {viewing && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Supplier</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">{supplierName(viewing.supplierId)}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Inv Ref: {viewing.supplierInvoiceNumber || '—'}</p>
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
            
            <div className="flex justify-end p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 rounded-lg">
               <div className="flex flex-col items-end">
                  <p className="text-sm font-bold text-blue-800">Total Invoice Amount</p>
                  <p className="font-mono text-2xl font-black text-blue-700 mt-1"><AmountDisplay paise={viewing.totalAmountPaise} /></p>
               </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Billed Items</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 dark:text-slate-400 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12">#</th>
                      <th className="px-4 py-3 font-bold">Item Description</th>
                      <th className="px-4 py-3 font-bold text-right">Qty</th>
                      <th className="px-4 py-3 font-bold">UOM</th>
                      <th className="px-4 py-3 font-bold text-right">Rate</th>
                      <th className="px-4 py-3 font-bold text-right">Net</th>
                      <th className="px-4 py-3 font-bold text-right">Tax</th>
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
                        <td className="px-4 py-3 text-right font-mono"><AmountDisplay paise={l.ratePaise} /></td>
                        <td className="px-4 py-3 text-right font-mono"><AmountDisplay paise={l.netAmountPaise} /></td>
                        <td className="px-4 py-3 text-right font-mono"><AmountDisplay paise={l.taxAmountPaise} /></td>
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

      <ThreeWayMatchModal 
        open={matchModalOpen} 
        onClose={() => setMatchModalOpen(false)} 
        purchaseInvoiceNumber={matchInvNo}
        lines={matchLines} 
      />
    </div>
  );
}

export default PurchaseInvoicesPage;
