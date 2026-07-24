import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, message } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LinesEditor, LifecycleButtons,
  newDraftLine, type DraftLine, type RefItem,
} from '../_shared/txn';

const { Title, Text } = Typography;

export function GrnPage() {
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pos, setPos] = useState<PurchaseHeader[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.grns.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
    purchaseApi.orders.list(company.id, { status: 'approved' }).then((r) => setPos(r.data)).catch(() => {});
  }, [company?.id, plant?.id]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const handlePoChange = async (poId?: string) => {
    if (!poId || !company?.id) return;
    try {
      const po = await purchaseApi.orders.get(company.id, poId);
      if (po) {
        form.setFieldsValue({ supplierId: po.supplierId });
        if (po.lines) {
          const newLines = po.lines.map((l: any, i: number) => {
            const it = items.find((item) => item.id === l.itemId);
            return {
              key: Date.now() + i,
              itemId: l.itemId,
              description: l.description || undefined,
              quantity: Number(l.quantity) || 1,
              uom: l.uom,
              rateRupees: l.ratePaise ? Number(l.ratePaise) / 100 : 0,
              discountPercent: Number(l.discountPercent) || 0,
              taxCodeId: it?.defaultTaxCodeId || undefined,
              poLineId: l.id,
            };
          });
          setLines(newLines.length > 0 ? newLines : [newDraftLine()]);
        }
      }
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs(), warehouseId: warehouses[0]?.id }); setLines([newDraftLine()]); setDrawer(true); };
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id, postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: v.supplierId, poId: v.poId || undefined, warehouseId: v.warehouseId, supplierDcNo: v.supplierDcNo || undefined,
      // v1: accepted = received (full acceptance); partial QC rejection is a follow-up.
      lines: valid.map((l) => ({ 
        itemId: l.itemId, 
        description: l.description || undefined, 
        receivedQty: Number(l.quantity), 
        acceptedQty: Number(l.quantity), 
        uom: l.uom ?? 'NOS', 
        ratePaise: Math.round((l.rateRupees || 0) * 100),
        poLineId: l.poLineId || undefined
      })),
    };
    try { await purchaseApi.grns.create(body); message.success('GRN created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: PurchaseHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await purchaseApi.grns.act(r.id, a, company.id); message.success(`GRN ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'GRN Number', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Supplier', key: 's', render: (_: any, r: PurchaseHeader) => <Text style={{ fontSize: 13 }}>{supplierName(r.supplierId)}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: '', key: 'a', align: 'right' as const, width: 180, render: (_: any, r: PurchaseHeader) => <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Goods Receipt Notes</Title><Text type="secondary" style={{ fontSize: 13 }}>Approving a GRN posts stock + GL</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New GRN</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No GRNs yet.' }} /></div>
      <Drawer title="New Goods Receipt" open={drawer} onClose={() => setDrawer(false)} width={860} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 240, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="warehouseId" label="Receiving Warehouse" rules={[{ required: true, message: 'Required' }]} style={{ width: 220 }}>
              <Select showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="poId" label="Against PO (optional)" style={{ minWidth: 240, flex: 1 }}>
              <Select allowClear showSearch optionFilterProp="label" onChange={handlePoChange} options={pos.map((p) => ({ value: p.id, label: p.documentNumber }))} />
            </Form.Item>
            <Form.Item name="supplierDcNo" label="Supplier DC No." style={{ width: 200 }}><Input /></Form.Item>
          </div>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={[]} showTax={false} showDiscount={false} rateLabel="Rate ₹" />
        </Form>
      </Drawer>
    </div>
  );
}
