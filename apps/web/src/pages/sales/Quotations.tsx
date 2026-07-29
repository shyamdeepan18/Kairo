import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, Descriptions, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { FileText, Plus, Eye, Search, Send, CheckCircle2, XCircle, FileSignature } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { salesApi, type SalesHeader, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LinesEditor, LifecycleButtons,
  pricedLineBody, newDraftLine, type DraftLine, type RefItem,
} from '../_shared/txn';

const { Title, Text } = Typography;

export function QuotationsPage() {
  const navigate = useNavigate();
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
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
  const [viewing, setViewing] = useState<any | null>(null);

  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';
  const gstBpOf = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    salesApi.quotations.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    salesApi.customers.list(company.id).then((r) => setCustomers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listTaxCodes(company.id).then(setTaxCodes).catch(() => {});
  }, [company?.id]);

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
      customerId: v.customerId, validUntilDate: v.validUntilDate?.format?.('YYYY-MM-DD'),
      remarks: v.remarks,
      lines: valid.map((l) => pricedLineBody(l, gstBpOf)),
    };
    try { await salesApi.quotations.create(body); message.success('Quotation created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: SalesHeader, a: 'submit' | 'approve' | 'reject' | 'cancel') => {
    if (!company?.id) return;
    try { await salesApi.quotations.act(r.id, a, company.id); message.success(`Quotation ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };
  const openView = async (row: SalesHeader) => {
    if (!company?.id) return;
    try { setViewing(await salesApi.quotations.get(company.id, row.id)); } catch (e) { message.error(apiErr(e)); }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-900 transition-colors">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 transition-colors relative z-10 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white dark:text-white transition-colors">Quotations</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 dark:text-slate-400 transition-colors">Manage sales quotes and estimates for customers.</p>
          </div>
        </div>
        <button 
          onClick={openNew}
          className="flex items-center px-4 py-2 bg-indigo-600 dark:bg-indigo-600/90 text-white font-bold rounded-lg shadow-sm hover:bg-indigo-700 dark:hover:bg-indigo-500 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> New Quotation
        </button>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4 flex items-center space-x-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 dark:text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Quotations..." 
              className="pl-9 pr-4 py-2 w-64 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
            />
          </div>
          <Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 150 }} options={STATUS_OPTIONS} />
        </div>

        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden transition-colors min-h-[400px]">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">Quotation</th>
                <th className="px-6 py-4 font-bold">Customer</th>
                <th className="px-6 py-4 font-bold">Date</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Total</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">{custName(r.customerId)}</td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-medium">{r.postingDate}</td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={r.status as DocumentStatus} size="small" />
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                    <AmountDisplay paise={r.totalAmountPaise} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button onClick={() => openView(r)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} onReject={() => act(r, 'reject')} onCancel={() => act(r, 'cancel')} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    No Quotations found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create drawer */}
      <Drawer title="New Quotation" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={920} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div className="flex gap-4 flex-wrap">
            <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 280, flex: 1 }}>
              <Select showSearch optionFilterProp="label" placeholder="Select customer"
                options={customers.map((c) => ({ value: c.id, label: `${c.customerCode} — ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="validUntilDate" label="Valid Until" style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))} />
          <Form.Item name="remarks" label="Remarks" className="mt-4"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>

      {/* View drawer */}
      <Drawer
        title={viewing?.documentNumber ?? 'Quotation'}
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={720}
        extra={
          viewing?.status === 'approved' ? (
            <Button
              type="primary"
              onClick={() => {
                navigate('/sales/orders', { state: { createSoFromQuote: viewing, customerId: viewing.customerId, remarks: viewing.remarks } });
              }}
            >
              Create Sales Order
            </Button>
          ) : null
        }
      >
        {viewing && (
          <>
            <Descriptions column={2} size="small" styles={{ label: { width: 130 } }}>
              <Descriptions.Item label="Customer">{custName(viewing.customerId)}</Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={viewing.status} size="small" /></Descriptions.Item>
              <Descriptions.Item label="Date">{viewing.postingDate}</Descriptions.Item>
              <Descriptions.Item label="Total"><AmountDisplay paise={viewing.totalAmountPaise} /></Descriptions.Item>
            </Descriptions>
            <Table className="mt-4" size="small" rowKey="id" pagination={false}
              dataSource={viewing.lines ?? []}
              columns={[
                { title: '#', dataIndex: 'lineNumber', width: 40 },
                { title: 'Description', dataIndex: 'description' },
                { title: 'Qty', dataIndex: 'quantity', align: 'right' as const },
                { title: 'UOM', dataIndex: 'uom', width: 70 },
                { title: 'Net', dataIndex: 'netAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
                { title: 'Total', dataIndex: 'totalAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
              ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
