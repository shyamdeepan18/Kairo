import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import {
  Table, Button, Drawer, Form, Input, Select, DatePicker, InputNumber,
  Typography, Space, Popconfirm, message, Descriptions, theme as antTheme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EyeOutlined, SearchOutlined,
  SendOutlined, CheckOutlined, StopOutlined,
} from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, computeLine, apiErr, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

interface DraftLine {
  key: number;
  itemId?: string;
  description?: string;
  quantity: number;
  uom?: string;
  rateRupees: number;
  discountPercent: number;
  taxCodeId?: string;
  requisitionLineId?: string;
}

let lineSeq = 1;
const newLine = (): DraftLine => ({ key: lineSeq++, quantity: 1, rateRupees: 0, discountPercent: 0 });

export function PurchaseOrdersPage() {
  const { company, plant } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();

  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [reqs, setReqs] = useState<PurchaseHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);

  const [viewing, setViewing] = useState<any | null>(null);

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';
  const gstBp = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.orders.list(company.id, statusFilter ? { status: statusFilter } : undefined)
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
    purchaseApi.requisitions.list(company.id, { status: 'approved' }).then((r) => setReqs(r.data)).catch(() => {});
  }, [company?.id]);

  // ── Line editing ──────────────────────────────────────────────────────────
  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const onPickItem = (key: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    setLine(key, { itemId, uom: it?.primaryUom, description: it?.itemName, taxCodeId: it?.defaultTaxCodeId ?? undefined });
  };

  const lineComputed = (l: DraftLine) => computeLine(l.quantity || 0, Math.round((l.rateRupees || 0) * 100), l.discountPercent || 0, gstBp(l.taxCodeId));
  const totals = lines.reduce(
    (acc, l) => {
      const c = lineComputed(l);
      acc.net += c.netAmountPaise; acc.tax += c.taxAmountPaise; acc.total += c.totalAmountPaise;
      return acc;
    },
    { net: 0, tax: 0, total: 0 }
  );

  const handleRequisitionChange = async (reqId?: string) => {
    if (!reqId || !company?.id) return;
    try {
      const pr = await purchaseApi.requisitions.get(company.id, reqId);
      if (pr && pr.lines) {
        const newLines = pr.lines.map((l: any) => {
          const it = items.find((item) => item.id === l.itemId);
          return {
            key: lineSeq++,
            itemId: l.itemId,
            description: l.description || undefined,
            quantity: Number(l.quantity) || 1,
            uom: l.uom,
            rateRupees: l.estimatedRatePaise ? Number(l.estimatedRatePaise) / 100 : 0,
            discountPercent: 0,
            taxCodeId: it?.defaultTaxCodeId || undefined,
            requisitionLineId: l.id,
          };
        });
        setLines(newLines.length > 0 ? newLines : [newLine()]);
      }
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ postingDate: dayjs() });
    setLines([newLine()]);
    setDrawer(true);
  };

  const save = async (values: any) => {
    if (!company?.id || !plant?.id) { message.error('Select a company and plant first'); return; }
    const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
    if (validLines.length === 0) { message.error('Add at least one line with an item and quantity'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      postingDate: values.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: values.supplierId,
      requisitionId: values.requisitionId || undefined,
      expectedDeliveryDate: values.expectedDeliveryDate?.format?.('YYYY-MM-DD') || undefined,
      remarks: values.remarks || undefined,
      lines: validLines.map((l) => {
        const c = lineComputed(l);
        return {
          itemId: l.itemId, description: l.description || undefined, quantity: l.quantity, uom: l.uom ?? 'NOS',
          ratePaise: Math.round((l.rateRupees || 0) * 100), discountPercent: l.discountPercent || 0,
          taxCodeId: l.taxCodeId || undefined, cgstAmountPaise: c.cgstAmountPaise, sgstAmountPaise: c.sgstAmountPaise,
          requisitionLineId: l.requisitionLineId || undefined,
        };
      }),
    };
    try {
      await purchaseApi.orders.create(body);
      message.success('Purchase order created (draft).');
      setDrawer(false);
      load();
    } catch (e) {
      message.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const runAction = async (row: PurchaseHeader, action: 'submit' | 'approve' | 'cancel') => {
    if (!company?.id) return;
    try {
      await purchaseApi.orders.act(row.id, action, company.id);
      message.success(`Order ${action}d.`);
      load();
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: PurchaseHeader) => {
    if (!company?.id) return;
    try { setViewing(await purchaseApi.orders.get(company.id, row.id)); }
    catch (e) { message.error(apiErr(e)); }
  };

  const cardStyle = { background: dt.colorBgContainer, borderRadius: 12, border: `1px solid ${dt.colorBorderSecondary}`, overflow: 'hidden' as const };

  const columns = [
    { title: 'PO Number', dataIndex: 'documentNumber', key: 'no', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Supplier', key: 'supplier', render: (_: unknown, r: PurchaseHeader) => <Text style={{ fontSize: 13 }}>{supplierName(r.supplierId)}</Text> },
    { title: 'Date', dataIndex: 'postingDate', key: 'date', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: 'Total', dataIndex: 'totalAmountPaise', key: 'total', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    {
      title: '', key: 'actions', align: 'right' as const, width: 220,
      render: (_: unknown, r: PurchaseHeader) => (
        <Space size={4}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
          {r.status === 'draft' && (
            <Button type="text" size="small" icon={<SendOutlined />} onClick={() => runAction(r, 'submit')}>Submit</Button>
          )}
          {r.status === 'submitted' && (
            <Popconfirm title="Approve this PO?" onConfirm={() => runAction(r, 'approve')}>
              <Button type="text" size="small" icon={<CheckOutlined />}>Approve</Button>
            </Popconfirm>
          )}
          {r.status === 'approved' && (
            <Popconfirm title="Cancel this PO?" onConfirm={() => runAction(r, 'cancel')}>
              <Button type="text" size="small" danger icon={<StopOutlined />}>Cancel</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }));
  const taxOptions = taxCodes.map((t) => ({ value: t.id, label: `${t.code} (${t.gstRateBp / 100}%)` }));

  const lineColumns = [
    {
      title: 'Item', key: 'item', width: 220,
      render: (_: unknown, l: DraftLine) => (
        <Select showSearch optionFilterProp="label" placeholder="Select item" style={{ width: '100%' }}
          value={l.itemId} options={itemOptions} onChange={(v) => onPickItem(l.key, v)} />
      ),
    },
    { title: 'Qty', key: 'qty', width: 90, render: (_: unknown, l: DraftLine) => (<InputNumber min={0} value={l.quantity} onChange={(v) => setLine(l.key, { quantity: Number(v) || 0 })} style={{ width: '100%' }} />) },
    { title: 'UOM', key: 'uom', width: 80, render: (_: unknown, l: DraftLine) => (<Input value={l.uom} onChange={(e) => setLine(l.key, { uom: e.target.value })} />) },
    { title: 'Rate ₹', key: 'rate', width: 110, render: (_: unknown, l: DraftLine) => (<InputNumber min={0} step={0.01} value={l.rateRupees} onChange={(v) => setLine(l.key, { rateRupees: Number(v) || 0 })} style={{ width: '100%' }} />) },
    { title: 'Disc %', key: 'disc', width: 80, render: (_: unknown, l: DraftLine) => (<InputNumber min={0} max={100} value={l.discountPercent} onChange={(v) => setLine(l.key, { discountPercent: Number(v) || 0 })} style={{ width: '100%' }} />) },
    { title: 'Tax', key: 'tax', width: 130, render: (_: unknown, l: DraftLine) => (<Select allowClear placeholder="Tax" style={{ width: '100%' }} value={l.taxCodeId} options={taxOptions} onChange={(v) => setLine(l.key, { taxCodeId: v })} />) },
    { title: 'Amount', key: 'amt', align: 'right' as const, width: 110, render: (_: unknown, l: DraftLine) => <AmountDisplay paise={lineComputed(l).totalAmountPaise} /> },
    { title: '', key: 'rm', width: 36, render: (_: unknown, l: DraftLine) => (<Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />) },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Purchase Orders</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{rows.length} order{rows.length !== 1 ? 's' : ''}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New PO</Button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }}
          options={['draft', 'submitted', 'approved', 'cancelled'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      </div>

      <div style={cardStyle}>
        <Table dataSource={rows} columns={columns} rowKey="id" loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No purchase orders yet.' }} />
      </div>

      {/* Create drawer */}
      <Drawer title="New Purchase Order" open={drawer} onClose={() => setDrawer(false)} width={920}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 280, flex: 1 }}>
              <Select showSearch optionFilterProp="label" placeholder="Select supplier"
                options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="requisitionId" label="Pull from PR (Optional)" style={{ minWidth: 220 }}>
              <Select allowClear showSearch optionFilterProp="label" placeholder="Select approved PR" onChange={handleRequisitionChange}
                options={reqs.map((r) => ({ value: r.id, label: r.documentNumber }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="PO Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 180 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expectedDeliveryDate" label="Expected Delivery" style={{ width: 180 }}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
            <Text strong>Line items</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>Add line</Button>
          </div>
          <Table dataSource={lines} columns={lineColumns} rowKey="key" pagination={false} size="small" style={{ marginBottom: 16 }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32, padding: '8px 12px', background: dt.colorFillQuaternary, borderRadius: 8 }}>
            <span><Text type="secondary">Net </Text><AmountDisplay paise={totals.net} /></span>
            <span><Text type="secondary">Tax </Text><AmountDisplay paise={totals.tax} /></span>
            <span><Text type="secondary">Total </Text><AmountDisplay paise={totals.total} bold /></span>
          </div>

          <Form.Item name="remarks" label="Remarks" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>

      {/* View drawer */}
      <Drawer title={viewing?.documentNumber ?? 'Purchase Order'} open={!!viewing} onClose={() => setViewing(null)} width={720}>
        {viewing && (
          <>
            <Descriptions column={2} size="small" styles={{ label: { width: 130 } }}>
              <Descriptions.Item label="Supplier">{supplierName(viewing.supplierId)}</Descriptions.Item>
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
