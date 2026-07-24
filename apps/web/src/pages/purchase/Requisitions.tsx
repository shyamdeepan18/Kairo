import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LinesEditor, LifecycleButtons,
  newDraftLine, type DraftLine, type RefItem,
} from '../_shared/txn';

const { Title, Text } = Typography;

export function RequisitionsPage() {
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.requisitions.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (company?.id) mastersApi.listItems(company.id).then(setItems).catch(() => {}); }, [company?.id]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setDrawer(true); };
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'), requiredByDate: v.requiredByDate?.format?.('YYYY-MM-DD'),
      purpose: v.purpose,
      lines: valid.map((l) => ({ itemId: l.itemId, description: l.description, quantity: l.quantity, uom: l.uom ?? 'NOS', estimatedRatePaise: Math.round((l.rateRupees || 0) * 100) })),
    };
    try { await purchaseApi.requisitions.create(body); message.success('Requisition created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: PurchaseHeader, a: 'submit' | 'approve' | 'reject') => {
    if (!company?.id) return;
    try { await purchaseApi.requisitions.act(r.id, a, company.id); message.success(`Requisition ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'PR Number', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: '', key: 'a', align: 'right' as const, width: 220, render: (_: any, r: PurchaseHeader) => <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} onReject={() => act(r, 'reject')} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Purchase Requisitions</Title><Text type="secondary" style={{ fontSize: 13 }}>{rows.length} requisition{rows.length !== 1 ? 's' : ''}</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Requisition</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No requisitions yet.' }} /></div>
      <Drawer title="New Requisition" open={drawer} onClose={() => setDrawer(false)} width={820} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="postingDate" label="Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 180 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="requiredByDate" label="Required By" style={{ width: 180 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="purpose" label="Purpose"><Input.TextArea rows={2} /></Form.Item>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={[]} showTax={false} showDiscount={false} rateLabel="Est ₹" />
        </Form>
      </Drawer>
    </div>
  );
}
