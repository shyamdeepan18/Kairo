import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, DatePicker, Select, Input, InputNumber,
  Typography, Space, Popconfirm, message, Tag, Radio, Card, Row, Col,
  Statistic, Tooltip, Divider, Modal, Descriptions,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SwapOutlined, CarOutlined,
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, SendOutlined,
  InboxOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse, type Plant } from '../../api/settings';
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
  const [plants, setPlants] = useState<Plant[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewRecord, setViewRecord] = useState<any | null>(null);
  const [detailModal, setDetailModal] = useState(false);

  // Watch form fields for dependent warehouse dropdowns
  const selectedFromPlantId = Form.useWatch('fromPlantId', form) ?? plant?.id;
  const selectedToPlantId = Form.useWatch('toPlantId', form) ?? plant?.id;
  const transferType = Form.useWatch('transferType', form) ?? 'direct';

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
    settingsApi.listPlants(company.id).then(setPlants).catch(() => {});
    settingsApi.listWarehouses(company.id).then(setAllWarehouses).catch(() => {});
  }, [company?.id]);

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleItemSelect = (key: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    const defaultRate = (it?.purchaseRatePaise ?? 0) / 100;
    setLine(key, {
      itemId,
      uom: it?.primaryUom ?? 'NOS',
      valuationRatePaise: defaultRate,
    });
  };

  const save = async (v: any) => {
    if (!company?.id) { message.error('No company selected'); return; }
    if (v.fromWarehouseId === v.toWarehouseId) {
      message.error('Source and destination warehouse must be different');
      return;
    }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one item line'); return; }

    setSaving(true);
    const body = {
      companyId: company.id,
      fromPlantId: v.fromPlantId || plant?.id,
      toPlantId: v.toPlantId || plant?.id,
      plantId: v.fromPlantId || plant?.id,
      fromWarehouseId: v.fromWarehouseId,
      toWarehouseId: v.toWarehouseId,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD'),
      transferType: v.transferType || 'direct',
      reason: v.reason || undefined,
      remarks: v.remarks || undefined,
      vehicleNo: v.vehicleNo || undefined,
      driverName: v.driverName || undefined,
      driverPhone: v.driverPhone || undefined,
      lrNumber: v.lrNumber || undefined,
      lines: valid.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        uom: l.uom ?? 'NOS',
        valuationRatePaise: Math.round((l.valuationRatePaise || 0) * 100),
      })),
    };

    try {
      await inventoryApi.transfers.create(body);
      message.success('Stock transfer order created in draft state.');
      setDrawer(false);
      load();
    } catch (e) {
      message.error(invErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: any, action: 'submit' | 'approve' | 'receive' | 'reject') => {
    if (!company?.id) return;
    try {
      if (action === 'submit') await inventoryApi.transfers.submit(r.id, company.id);
      else if (action === 'approve') await inventoryApi.transfers.approve(r.id, company.id);
      else if (action === 'receive') await inventoryApi.transfers.receive(r.id, company.id);
      else await inventoryApi.transfers.reject(r.id, company.id);

      const actionLabels = {
        submit: 'submitted for approval',
        approve: r.transferType === 'in_transit' ? 'approved & dispatched' : 'approved & posted',
        receive: 'received & completed',
        reject: 'rejected',
      };
      message.success(`Transfer ${actionLabels[action]}.`);
      load();
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const viewTransfer = async (id: string) => {
    if (!company?.id) return;
    try {
      const data = await inventoryApi.transfers.get(company.id, id);
      setViewRecord(data);
      setDetailModal(true);
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const plantName = (id?: string) => plants.find((p) => p.id === id)?.name ?? '—';
  const whName = (id?: string) => allWarehouses.find((w) => w.id === id)?.name ?? '—';

  // Metrics
  const totalCount = rows.length;
  const inTransitCount = rows.filter((r) => r.status === 'dispatched').length;
  const pendingCount = rows.filter((r) => r.status === 'submitted').length;
  const totalValuePaise = rows.reduce((s, r) => s + (r.totalAmountPaise || 0), 0);

  const columns = [
    {
      title: 'Document',
      dataIndex: 'documentNumber',
      render: (v: string, r: any) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13, cursor: 'pointer', color: '#1677ff' }} onClick={() => viewTransfer(r.id)}>
            {v}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.postingDate}</Text>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'transferType',
      width: 120,
      render: (v: string) => (
        <Tag color={v === 'in_transit' ? 'cyan' : 'purple'} style={{ borderRadius: 12 }}>
          {v === 'in_transit' ? 'In-Transit (2-Step)' : 'Direct (1-Step)'}
        </Tag>
      ),
    },
    {
      title: 'Route',
      key: 'route',
      render: (_: any, r: any) => {
        const fromP = plantName(r.fromPlantId ?? r.plantId);
        const toP = plantName(r.toPlantId ?? r.plantId);
        const fromW = whName(r.fromWarehouseId);
        const toW = whName(r.toWarehouseId);
        const isInterPlant = r.fromPlantId && r.toPlantId && r.fromPlantId !== r.toPlantId;

        return (
          <Space direction="vertical" size={2}>
            <Space size={6} align="center">
              <Tag color={isInterPlant ? 'blue' : 'default'} style={{ margin: 0 }}>
                {fromP} · {fromW}
              </Tag>
              <ArrowRightOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              <Tag color={isInterPlant ? 'geekblue' : 'default'} style={{ margin: 0 }}>
                {toP} · {toW}
              </Tag>
            </Space>
            {r.vehicleNo && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <CarOutlined style={{ marginRight: 4 }} />
                {r.vehicleNo} {r.lrNumber ? `· LR: ${r.lrNumber}` : ''}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" />,
    },
    {
      title: 'Total Value',
      dataIndex: 'totalAmountPaise',
      align: 'right' as const,
      render: (v: number) => <AmountDisplay paise={v} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      width: 220,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => viewTransfer(r.id)}>
            View
          </Button>
          {r.status === 'draft' && (
            <Button type="text" size="small" icon={<SendOutlined />} onClick={() => act(r, 'submit')}>
              Submit
            </Button>
          )}
          {r.status === 'submitted' && (
            <Popconfirm
              title={r.transferType === 'in_transit' ? 'Approve and dispatch transfer?' : 'Approve and post transfer directly?'}
              description="Maker-checker policy applies. Approval posts stock issue immediately."
              onConfirm={() => act(r, 'approve')}
            >
              <Button type="text" size="small" style={{ color: '#52c41a' }} icon={<CheckCircleOutlined />}>
                {r.transferType === 'in_transit' ? 'Dispatch' : 'Approve'}
              </Button>
            </Popconfirm>
          )}
          {r.status === 'submitted' && (
            <Popconfirm title="Reject this transfer order?" onConfirm={() => act(r, 'reject')}>
              <Button type="text" size="small" danger icon={<CloseCircleOutlined />}>
                Reject
              </Button>
            </Popconfirm>
          )}
          {r.status === 'dispatched' && (
            <Popconfirm
              title="Receive inward stock?"
              description="Confirms arrival and posts stock receipt at destination warehouse."
              onConfirm={() => act(r, 'receive')}
            >
              <Button type="primary" size="small" icon={<InboxOutlined />}>
                Receive
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const lineColumns = [
    {
      title: 'Item',
      dataIndex: 'itemId',
      width: 260,
      render: (v: string, r: DraftLine) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Select item..."
          value={v}
          style={{ width: '100%' }}
          onChange={(val) => handleItemSelect(r.key, val)}
          options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
        />
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      width: 90,
      render: (v: number, r: DraftLine) => (
        <InputNumber
          size="small"
          value={v}
          min={0.0001}
          style={{ width: '100%' }}
          onChange={(val) => setLine(r.key, { quantity: val ?? 0 })}
        />
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uom',
      width: 80,
      render: (v: string, r: DraftLine) => (
        <Input
          size="small"
          value={v}
          style={{ width: '100%' }}
          onChange={(e) => setLine(r.key, { uom: e.target.value })}
        />
      ),
    },
    {
      title: 'Unit Rate (₹)',
      dataIndex: 'valuationRatePaise',
      width: 120,
      render: (v: number, r: DraftLine) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => setLine(r.key, { valuationRatePaise: val ?? 0 })}
          prefix="₹"
        />
      ),
    },
    {
      title: 'Total (₹)',
      key: 'lineTotal',
      width: 110,
      align: 'right' as const,
      render: (_: any, r: DraftLine) => (
        <Text strong style={{ fontSize: 12 }}>
          ₹{((r.valuationRatePaise || 0) * (r.quantity || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: any, r: DraftLine) => (
        <Popconfirm title="Remove line?" onConfirm={() => setLines((ls) => ls.filter((l) => l.key !== r.key))}>
          <Button type="text" size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      ),
    },
  ];

  const filteredFromWarehouses = allWarehouses.filter(
    (w) => !selectedFromPlantId || w.plantId === selectedFromPlantId
  );
  const filteredToWarehouses = allWarehouses.filter(
    (w) => !selectedToPlantId || w.plantId === selectedToPlantId
  );

  const calculatedTotal = lines.reduce(
    (s, l) => s + (l.valuationRatePaise || 0) * (l.quantity || 0),
    0
  );

  return (
    <div>
      {/* Top Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Stock Transfers</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Multi-Plant & Inter-Warehouse Stock Routing · Maker-Checker Approval Workflow
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            form.setFieldsValue({
              postingDate: dayjs(),
              transferType: 'direct',
              fromPlantId: plant?.id,
              toPlantId: plant?.id,
            });
            setLines([newLine()]);
            setDrawer(true);
          }}
        >
          New Transfer Order
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic title="Total Transfers" value={totalCount} prefix={<SwapOutlined />} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="In-Transit"
              value={inTransitCount}
              valueStyle={{ color: '#0958d9' }}
              prefix={<CarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Pending Approval"
              value={pendingCount}
              valueStyle={{ color: '#d46b08' }}
              prefix={<SendOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10 }}>
            <Statistic
              title="Total Transferred"
              value={totalValuePaise / 100}
              precision={2}
              prefix="₹"
            />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Select
          allowClear
          placeholder="All statuses"
          value={statusFilter}
          onChange={setStatusFilter}
          style={{ minWidth: 180 }}
          options={STATUS_OPTIONS}
        />
      </div>

      {/* Main Table */}
      <div style={cardStyle}>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No stock transfers found.' }}
        />
      </div>

      {/* Create Transfer Drawer */}
      <Drawer
        title="Create Stock Transfer"
        open={drawer}
        onClose={async () => {
          if (await confirmClose(form)) {
            form.resetFields();
            setDrawer(false);
          }
        }}
        width={920}
        extra={
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            Create Transfer
          </Button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          {/* Transfer Mode */}
          <Form.Item name="transferType" label="Transfer Mode" rules={[{ required: true }]}>
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="direct">Direct Transfer (1-Step Instant)</Radio.Button>
              <Radio.Button value="in_transit">In-Transit Transfer (2-Step Dispatch & Receive)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Card size="small" style={{ background: '#fafafa', marginBottom: 16, borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {transferType === 'direct'
                ? '⚡ Direct Transfer: Approving immediately deducts stock from source warehouse and adds to destination warehouse in one transaction.'
                : '🚚 In-Transit Transfer: Approving dispatches stock (deducted from source warehouse). Stock remains in transit until destination plant verifies and receives it.'}
            </Text>
          </Card>

          {/* Route Section */}
          <div style={{ background: '#f5f7fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Transfer Route</Text>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="fromPlantId" label="From Plant" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select source plant..."
                    options={plants.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  />
                </Form.Item>
                <Form.Item name="fromWarehouseId" label="From Warehouse" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select source warehouse..."
                    options={filteredFromWarehouses.map((w) => ({ value: w.id, label: w.name }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="toPlantId" label="To Plant" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select destination plant..."
                    options={plants.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  />
                </Form.Item>
                <Form.Item name="toWarehouseId" label="To Warehouse" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select destination warehouse..."
                    options={filteredToWarehouses.map((w) => ({ value: w.id, label: w.name }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Metadata & Logistics */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="postingDate" label="Posting Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="vehicleNo" label="Vehicle No.">
                <Input placeholder="e.g. MH-12-AB-1234" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="lrNumber" label="LR / Challan No.">
                <Input placeholder="e.g. LR-9872" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="driverName" label="Driver Name">
                <Input placeholder="e.g. Ramesh Kumar" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="driverPhone" label="Driver Phone">
                <Input placeholder="e.g. +91 9876543210" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="reason" label="Reason / Remarks">
            <Input.TextArea rows={2} placeholder="Reason for inventory transfer..." />
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />

          {/* Item Lines */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text strong>Items to Transfer</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>
              Add Line
            </Button>
          </div>
          <Table dataSource={lines} columns={lineColumns} rowKey="key" pagination={false} size="small" />

          {/* Summary */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Space size={16} align="baseline">
              <Text type="secondary">Total Estimated Valuation:</Text>
              <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
                ₹{calculatedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </Space>
          </div>
        </Form>
      </Drawer>

      {/* View Transfer Details Modal */}
      <Modal
        title={
          <Space>
            <span>Stock Transfer Details</span>
            {viewRecord && <Tag color="blue">{viewRecord.documentNumber}</Tag>}
            {viewRecord && <StatusBadge status={viewRecord.status} size="small" />}
          </Space>
        }
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setDetailModal(false)}>
            Close
          </Button>,
        ]}
      >
        {viewRecord && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Transfer Mode">
                <Tag color={viewRecord.transferType === 'in_transit' ? 'cyan' : 'purple'}>
                  {viewRecord.transferType === 'in_transit' ? 'In-Transit (2-Step)' : 'Direct (1-Step)'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Posting Date">{viewRecord.postingDate}</Descriptions.Item>
              <Descriptions.Item label="From Route">
                {plantName(viewRecord.fromPlantId ?? viewRecord.plantId)} · {whName(viewRecord.fromWarehouseId)}
              </Descriptions.Item>
              <Descriptions.Item label="To Route">
                {plantName(viewRecord.toPlantId ?? viewRecord.plantId)} · {whName(viewRecord.toWarehouseId)}
              </Descriptions.Item>
              {viewRecord.vehicleNo && <Descriptions.Item label="Vehicle No">{viewRecord.vehicleNo}</Descriptions.Item>}
              {viewRecord.lrNumber && <Descriptions.Item label="LR Number">{viewRecord.lrNumber}</Descriptions.Item>}
              {viewRecord.driverName && <Descriptions.Item label="Driver">{viewRecord.driverName} ({viewRecord.driverPhone || '—'})</Descriptions.Item>}
              {viewRecord.reason && <Descriptions.Item label="Reason" span={2}>{viewRecord.reason}</Descriptions.Item>}
            </Descriptions>

            <Title level={5} style={{ fontSize: 13, marginBottom: 8 }}>Transfer Items</Title>
            <Table
              dataSource={viewRecord.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Item',
                  key: 'item',
                  render: (_: any, l: any) => {
                    const it = items.find((i) => i.id === l.itemId);
                    return it ? `${it.itemCode} — ${it.itemName}` : l.itemId;
                  },
                },
                { title: 'Quantity', dataIndex: 'quantity', width: 90 },
                { title: 'UOM', dataIndex: 'uom', width: 80 },
                {
                  title: 'Rate',
                  dataIndex: 'valuationRatePaise',
                  align: 'right' as const,
                  render: (v: number) => <AmountDisplay paise={v} />,
                },
                {
                  title: 'Amount',
                  dataIndex: 'valuationAmountPaise',
                  align: 'right' as const,
                  render: (v: number) => <AmountDisplay paise={v} />,
                },
              ]}
            />

            {/* Audit Trail */}
            <Divider style={{ margin: '16px 0 8px 0' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Lifecycle Trail: Created at {viewRecord.createdAt ? new Date(viewRecord.createdAt).toLocaleString() : '—'}
              {viewRecord.submittedAt && ` · Submitted at ${new Date(viewRecord.submittedAt).toLocaleString()}`}
              {viewRecord.approvedAt && ` · Approved at ${new Date(viewRecord.approvedAt).toLocaleString()}`}
              {viewRecord.dispatchedAt && ` · Dispatched at ${new Date(viewRecord.dispatchedAt).toLocaleString()}`}
              {viewRecord.receivedAt && ` · Received at ${new Date(viewRecord.receivedAt).toLocaleString()}`}
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
}
