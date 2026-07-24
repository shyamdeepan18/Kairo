import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined } from '@ant-design/icons';
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

export function SalesInvoicesPage() {
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

  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';
  const gstBpOf = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    salesApi.invoices.list(company.id, statusFilter ? { status: statusFilter } : undefined)
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
      customerId: v.customerId, dueDate: v.dueDate?.format?.('YYYY-MM-DD'),
      remarks: v.remarks,
      lines: valid.map((l) => pricedLineBody(l, gstBpOf)),
    };
    try { await salesApi.invoices.create(body); message.success('Invoice created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: SalesHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await salesApi.invoices.act(r.id, a, company.id); message.success(`Invoice ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'Invoice', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Customer', key: 'c', render: (_: any, r: SalesHeader) => <Text style={{ fontSize: 13 }}>{custName(r.customerId)}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: 'Total', dataIndex: 'totalAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    { title: '', key: 'a', align: 'right' as const, width: 180, render: (_: any, r: SalesHeader) => <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Sales Invoices</Title><Text type="secondary" style={{ fontSize: 13 }}>Approving posts revenue GL (DR AR / CR Revenue + GST)</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Invoice</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No invoices yet.' }} /></div>
      <Drawer title="New Sales Invoice" open={drawer} onClose={() => setDrawer(false)} width={920} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 240, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: `${c.customerCode} — ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="Invoice Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date" style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))} />
          <Form.Item name="remarks" label="Remarks" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
