import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, DatePicker, Select, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { salesApi, type SalesHeader, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LinesEditor, LifecycleButtons,
  newDraftLine, type DraftLine, type RefItem,
} from '../_shared/txn';

const { Title, Text } = Typography;

export function DeliveriesPage() {
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<SalesHeader[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [sos, setSos] = useState<SalesHeader[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const custName = (id?: string) => customers.find((c) => c.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    salesApi.deliveries.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    salesApi.customers.list(company.id).then((r) => setCustomers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
    salesApi.orders.list(company.id, { status: 'approved' }).then((r) => setSos(r.data)).catch(() => {});
  }, [company?.id, plant?.id]);

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
      customerId: v.customerId, soId: v.soId, warehouseId: v.warehouseId,
      lines: valid.map((l) => ({ itemId: l.itemId, description: l.description, deliveredQty: l.quantity, uom: l.uom ?? 'NOS' })),
    };
    try { await salesApi.deliveries.create(body); message.success('Delivery created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: SalesHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await salesApi.deliveries.act(r.id, a, company.id); message.success(`Delivery ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'DN Number', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Customer', key: 'c', render: (_: any, r: SalesHeader) => <Text style={{ fontSize: 13 }}>{custName(r.customerId)}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: '', key: 'a', align: 'right' as const, width: 180, render: (_: any, r: SalesHeader) => <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Deliveries</Title><Text type="secondary" style={{ fontSize: 13 }}>Approving posts stock OUT + COGS GL</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Delivery</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No deliveries yet.' }} /></div>
      <Drawer title="New Delivery Note" open={drawer} onClose={() => setDrawer(false)} width={860} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 240, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={customers.map((c) => ({ value: c.id, label: `${c.customerCode} — ${c.name}` }))} />
            </Form.Item>
            <Form.Item name="warehouseId" label="Dispatch Warehouse" rules={[{ required: true, message: 'Required' }]} style={{ width: 220 }}>
              <Select showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="soId" label="Against SO (optional)" style={{ minWidth: 240, flex: 1 }}>
              <Select allowClear showSearch optionFilterProp="label" options={sos.map((s) => ({ value: s.id, label: s.documentNumber }))} />
            </Form.Item>
          </div>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={[]} showTax={false} showDiscount={false} rateLabel="Rate ₹" />
        </Form>
      </Drawer>
    </div>
  );
}
