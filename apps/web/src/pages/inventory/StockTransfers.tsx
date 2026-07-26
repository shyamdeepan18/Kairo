import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, DatePicker, Select, Input, InputNumber,
  Typography, Space, Popconfirm, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SwapOutlined } from '@ant-design/icons';
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
  quantity: number;
  uom?: string;
  valuationRatePaise: number;
}

let seq = 1;
const newLine = (): DraftLine => ({ key: seq++, quantity: 1, valuationRatePaise: 0 });

export function StockTransfersPage() {
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
    inventoryApi.transfers.list(company.id, statusFilter ? { status: statusFilter } : undefined)
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
    if (v.fromWarehouseId === v.toWarehouseId) { message.error('Source and destination must be different'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      fromWarehouseId: v.fromWarehouseId,
      toWarehouseId: v.toWarehouseId,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      reason: v.reason || undefined,
      vehicleNo: v.vehicleNo || undefined,
      lines: valid.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        uom: l.uom ?? 'NOS',
        valuationRatePaise: Math.round((l.valuationRatePaise || 0) * 100),
      })),
    };
    try {
      await inventoryApi.transfers.create(body);
      message.success('Stock transfer created.');
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
      if (action === 'submit') await inventoryApi.transfers.submit(r.id, company.id);
      else if (action === 'approve') await inventoryApi.transfers.approve(r.id, company.id);
      else await inventoryApi.transfers.reject(r.id, company.id);
      message.success(`Transfer ${action}d.`);
      load();
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const whName = (id?: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

  const columns = [
    { title: 'Document', dataIndex: 'documentNumber', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    {
      title: 'Route', key: 'route',
      render: (_: any, r: any) => (
        <Space>
          <Text type="secondary">{whName(r.fromWarehouseId)}</Text>
          <SwapOutlined />
          <Text strong>{whName(r.toWarehouseId)}</Text>
        </Space>
      ),
    },
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
      title: 'Item', dataIndex: 'itemId', width: 230,
      render: (v: string, r: DraftLine) => (
        <Select
          size="small" showSearch optionFilterProp="label" value={v} style={{ width: 220 }}
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
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Stock Transfers</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Move stock between warehouses — stock updated on approval</Text>
        </div>
        <Button
          type="primary" icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({ postingDate: dayjs() });
            setLines([newLine()]);
            setDrawer(true);
          }}
        >
          New Transfer
        </Button>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} />
      </div>
      <div style={cardStyle}>
        <Table dataSource={rows} columns={columns} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No transfers yet.' }} />
      </div>

      <Drawer
        title="New Stock Transfer" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={900}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <Form.Item name="fromWarehouseId" label="From Warehouse" rules={[{ required: true }]} style={{ minWidth: 200, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            </Form.Item>
            <SwapOutlined style={{ fontSize: 20, marginTop: 28, color: '#8c8c8c' }} />
            <Form.Item name="toWarehouseId" label="To Warehouse" rules={[{ required: true }]} style={{ minWidth: 200, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="Date" rules={[{ required: true }]} style={{ width: 150 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="vehicleNo" label="Vehicle No." style={{ width: 160 }}><Input /></Form.Item>
            <Form.Item name="reason" label="Reason" style={{ flex: 1 }}><Input /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
            <Text strong>Items to Transfer</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>Add line</Button>
          </div>
          <Table dataSource={lines} columns={lineColumns} rowKey="key" pagination={false} size="small" />
        </Form>
      </Drawer>
    </div>
  );
}
