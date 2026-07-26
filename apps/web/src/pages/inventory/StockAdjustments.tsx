import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, DatePicker, Select, Input, InputNumber,
  Typography, Space, Popconfirm, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { useCardStyle, STATUS_OPTIONS } from '../_shared/txn';

const { Title, Text } = Typography;

interface DraftLine {
  key: number;
  itemId?: string;
  movementType: 'adjustment_in' | 'adjustment_out';
  quantity: number;
  uom?: string;
  valuationRatePaise: number;
  description?: string;
}

let seq = 1;
const newLine = (): DraftLine => ({ key: seq++, movementType: 'adjustment_in', quantity: 1, valuationRatePaise: 0 });

export function StockAdjustmentsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    inventoryApi.adjustments.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(invErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
  }, [company?.id, plant?.id]);

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      warehouseId: v.warehouseId,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      adjustmentType: v.adjustmentType || 'physical_count',
      reason: v.reason || undefined,
      lines: valid.map((l) => ({
        itemId: l.itemId,
        movementType: l.movementType,
        quantity: l.quantity,
        uom: l.uom ?? 'NOS',
        valuationRatePaise: Math.round((l.valuationRatePaise || 0) * 100),
        description: l.description || undefined,
      })),
    };
    try {
      await inventoryApi.adjustments.create(body);
      message.success('Stock adjustment created.');
      setDrawer(false);
      load();
    } catch (e) {
      message.error(invErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: any, action: 'submit' | 'approve' | 'reject') => {
    if (!company?.id) return;
    try {
      if (action === 'submit') await inventoryApi.adjustments.submit(r.id, company.id);
      else if (action === 'approve') await inventoryApi.adjustments.approve(r.id, company.id);
      else await inventoryApi.adjustments.reject(r.id, company.id);
      message.success(`Adjustment ${action}d.`);
      load();
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const columns = [
    { title: 'Document', dataIndex: 'documentNumber', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'adjustmentType', render: (v: string) => <Text>{v?.replace('_', ' ')}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: 'Value', dataIndex: 'totalAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    {
      title: '', key: 'actions', align: 'right' as const, width: 200,
      render: (_: any, r: any) => (
        <Space size={4}>
          {r.status === 'draft' && <Button type="text" size="small" onClick={() => act(r, 'submit')}>Submit</Button>}
          {r.status === 'submitted' && <Button type="text" size="small" style={{ color: '#52c41a' }} onClick={() => act(r, 'approve')}>Approve</Button>}
          {r.status === 'submitted' && <Button type="text" size="small" danger onClick={() => act(r, 'reject')}>Reject</Button>}
        </Space>
      ),
    },
  ];

  const lineColumns = [
    {
      title: 'Direction', dataIndex: 'movementType', width: 130,
      render: (v: string, r: DraftLine) => (
        <Select size="small" value={v} onChange={(val) => setLine(r.key, { movementType: val as DraftLine['movementType'] })} style={{ width: 120 }}>
          <Select.Option value="adjustment_in"><ArrowUpOutlined style={{ color: '#52c41a' }} /> In</Select.Option>
          <Select.Option value="adjustment_out"><ArrowDownOutlined style={{ color: '#ff4d4f' }} /> Out</Select.Option>
        </Select>
      ),
    },
    {
      title: 'Item', dataIndex: 'itemId', width: 220,
      render: (v: string, r: DraftLine) => (
        <Select
          size="small" showSearch optionFilterProp="label" value={v} style={{ width: 210 }}
          onChange={(val) => {
            const it = items.find((i) => i.id === val);
            setLine(r.key, { itemId: val, uom: it?.primaryUom });
          }}
          options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
        />
      ),
    },
    {
      title: 'Qty', dataIndex: 'quantity', width: 80,
      render: (v: number, r: DraftLine) => (
        <InputNumber size="small" value={v} min={0.0001} style={{ width: 70 }} onChange={(val) => setLine(r.key, { quantity: val ?? 0 })} />
      ),
    },
    {
      title: 'UOM', dataIndex: 'uom', width: 70,
      render: (v: string, r: DraftLine) => (
        <Input size="small" value={v} style={{ width: 60 }} onChange={(e) => setLine(r.key, { uom: e.target.value })} />
      ),
    },
    {
      title: 'Rate (₹)', dataIndex: 'valuationRatePaise', width: 110,
      render: (v: number, r: DraftLine) => (
        <InputNumber size="small" value={v} min={0} precision={2} style={{ width: 100 }} onChange={(val) => setLine(r.key, { valuationRatePaise: val ?? 0 })} prefix="₹" />
      ),
    },
    {
      title: 'Value', key: 'val', align: 'right' as const,
      render: (_: any, r: DraftLine) => <Text>₹{((r.valuationRatePaise || 0) * (r.quantity || 0)).toFixed(2)}</Text>,
    },
    {
      title: '', key: 'del', width: 40,
      render: (_: any, r: DraftLine) => (
        <Popconfirm title="Remove line?" onConfirm={() => setLines((ls) => ls.filter((l) => l.key !== r.key))}>
          <Button type="text" size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Stock Adjustments</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Physical count corrections — GL posted on approval</Text>
        </div>
        <Button
          type="primary" icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ postingDate: dayjs(), adjustmentType: 'physical_count' });
            setLines([newLine()]);
            setDrawer(true);
          }}
        >
          New Adjustment
        </Button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} />
      </div>
      <div style={cardStyle}>
        <Table dataSource={rows} columns={columns} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No adjustments yet.' }} />
      </div>

      <Drawer
        title="New Stock Adjustment" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={900}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 200, flex: 1 }}>
              <Select options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            </Form.Item>
            <Form.Item name="adjustmentType" label="Adjustment Type" style={{ width: 180 }}>
              <Select options={[
                { value: 'physical_count', label: 'Physical Count' },
                { value: 'write_off',      label: 'Write Off' },
                { value: 'opening_balance',label: 'Opening Balance' },
                { value: 'other',          label: 'Other' },
              ]} />
            </Form.Item>
            <Form.Item name="postingDate" label="Posting Date" rules={[{ required: true }]} style={{ width: 160 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="reason" label="Reason"><Input.TextArea rows={2} /></Form.Item>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
            <Text strong>Lines</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>Add line</Button>
          </div>
          <Table dataSource={lines} columns={lineColumns} rowKey="key" pagination={false} size="small" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Text type="secondary">Total:&nbsp;</Text>
            <Text strong>
              ₹{lines.reduce((s, l) => s + (l.valuationRatePaise || 0) * (l.quantity || 0), 0).toFixed(2)}
            </Text>
          </div>
        </Form>
      </Drawer>
    </div>
  );
}
