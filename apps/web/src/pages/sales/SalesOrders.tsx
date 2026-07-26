import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, Descriptions, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
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

let lineSeq = 1;

export function SalesOrdersPage() {
  const location = useLocation();
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
  
  // Track quotation ID if we are creating from a quote
  const [sourceQuotationId, setSourceQuotationId] = useState<string | undefined>();

  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';
  const gstBpOf = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    salesApi.orders.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
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
        quantity: Number(l.quantity) - Number(l.orderedQty || 0),
        uom: l.uom,
        rateRupees: (l.ratePaise || 0) / 100,
        discountPercent: Number(l.discountPercent) || 0,
        taxCodeId: l.taxCodeId,
        quotationLineId: l.id
      }));
      setLines(mappedLines);
      setSourceQuotationId(createSoFromQuote.id);
      form.resetFields();
      form.setFieldsValue({ customerId, postingDate: dayjs(), remarks });
      setDrawer(true);
      navigate('/sales/orders', { replace: true, state: {} });
    }
  }, [location.state, navigate, form]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setSourceQuotationId(undefined); setDrawer(true); };
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
      lines: valid.map((l) => pricedLineBody(l, gstBpOf)),
    };
    try { await salesApi.orders.create(body); message.success('Sales order created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: SalesHeader, a: 'submit' | 'approve' | 'cancel') => {
    if (!company?.id) return;
    try { await salesApi.orders.act(r.id, a, company.id); message.success(`Order ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };
  const openView = async (row: SalesHeader) => {
    if (!company?.id) return;
    try { setViewing(await salesApi.orders.get(company.id, row.id)); } catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'SO Number', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Customer', key: 'c', render: (_: any, r: SalesHeader) => <Text style={{ fontSize: 13 }}>{custName(r.customerId)}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: 'Total', dataIndex: 'totalAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    {
      title: '', key: 'a', align: 'right' as const, width: 260,
      render: (_: any, r: SalesHeader) => (
        <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
          <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} onCancel={() => act(r, 'cancel')} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Sales Orders</Title><Text type="secondary" style={{ fontSize: 13 }}>{rows.length} order{rows.length !== 1 ? 's' : ''}</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New SO</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No sales orders yet.' }} /></div>

      <Drawer title="New Sales Order" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={920} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 280, flex: 1 }}>
              <Select showSearch optionFilterProp="label" placeholder="Select customer"
                options={customers.map((c) => ({ value: c.id, label: `${c.customerCode} — ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="SO Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="expectedDeliveryDate" label="Expected Delivery" style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="customerPoNumber" label="Customer PO No." style={{ width: 200 }}><Input /></Form.Item>
          </div>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))} />
          <Form.Item name="remarks" label="Remarks" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>

      <Drawer title={viewing?.documentNumber ?? 'Sales Order'} open={!!viewing} onClose={() => setViewing(null)} width={720}>
        {viewing && (
          <>
            <Descriptions column={2} size="small" styles={{ label: { width: 130 } }}>
              <Descriptions.Item label="Customer">{custName(viewing.customerId)}</Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={viewing.status} size="small" /></Descriptions.Item>
              <Descriptions.Item label="Date">{viewing.postingDate}</Descriptions.Item>
              <Descriptions.Item label="Total"><AmountDisplay paise={viewing.totalAmountPaise} /></Descriptions.Item>
            </Descriptions>
            <Table style={{ marginTop: 16 }} size="small" rowKey="id" pagination={false}
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
