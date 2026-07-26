import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, message, Descriptions } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined, EyeOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LinesEditor, LifecycleButtons,
  pricedLineBody, newDraftLine, type DraftLine, type RefItem,
} from '../_shared/txn';
import { ThreeWayMatchModal, type MatchLine } from './ThreeWayMatchModal';

const { Title, Text } = Typography;

export function PurchaseInvoicesPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [grns, setGrns] = useState<PurchaseHeader[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';
  const gstBpOf = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.invoices.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listTaxCodes(company.id).then(setTaxCodes).catch(() => {});
    purchaseApi.grns.list(company.id, { status: 'approved' }).then((r) => setGrns(r.data)).catch(() => {});
  }, [company?.id]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const handleGrnChange = async (grnId?: string) => {
    if (!grnId || !company?.id) return;
    try {
      const grn = await purchaseApi.grns.get(company.id, grnId);
      if (grn) {
        form.setFieldsValue({ supplierId: grn.supplierId, poId: grn.poId });
        if (grn.lines) {
          const newLines = grn.lines.map((l: any, i: number) => {
            const it = items.find((item) => item.id === l.itemId);
            return {
              key: Date.now() + i,
              itemId: l.itemId,
              description: l.description || undefined,
              quantity: Number(l.acceptedQty) || Number(l.receivedQty) || 1,
              uom: l.uom,
              rateRupees: l.ratePaise ? Number(l.ratePaise) / 100 : 0,
              discountPercent: 0,
              taxCodeId: it?.defaultTaxCodeId || undefined,
              poLineId: l.poLineId || undefined,
              grnLineId: l.id,
            };
          });
          setLines(newLines.length > 0 ? newLines : [newDraftLine()]);
        }
      }
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: PurchaseHeader) => {
    if (!company?.id) return;
    try { setViewing(await purchaseApi.invoices.get(company.id, row.id)); }
    catch (e) { message.error(apiErr(e)); }
  };

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setDrawer(true); };
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id, postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: v.supplierId, supplierInvoiceNumber: v.supplierInvoiceNumber, poId: v.poId || undefined,
      supplierInvoiceDate: v.supplierInvoiceDate?.format?.('YYYY-MM-DD') || undefined, dueDate: v.dueDate?.format?.('YYYY-MM-DD') || undefined,
      lines: valid.map((l) => pricedLineBody(l, gstBpOf)),
    };
    try { await purchaseApi.invoices.create(body); message.success('Invoice created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: PurchaseHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await purchaseApi.invoices.act(r.id, a, company.id); message.success(`Invoice ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchLines, setMatchLines] = useState<MatchLine[]>([]);
  const [matchInvNo, setMatchInvNo] = useState<string>('');

  const openMatchModal = (r: PurchaseHeader) => {
    setMatchInvNo(r.documentNumber || r.supplierInvoiceNumber || '');
    const sampleLines: MatchLine[] = ((r as any).lines || []).map((l: any, idx: number) => ({
      id: l.id || String(idx),
      itemCode: l.itemCode || `ITEM-${idx + 1}`,
      itemName: l.itemName || `Raw Material Item ${idx + 1}`,
      poOrderedQty: Number(l.quantity) || 100,
      poUnitPricePaise: Number(l.ratePaise) || 5000,
      grnReceivedQty: Number(l.acceptedQty) || Number(l.quantity) || 100,
      invoiceBilledQty: Number(l.quantity) || 100,
      invoiceUnitPricePaise: Number(l.ratePaise) || 5000,
    }));
    setMatchLines(sampleLines);
    setMatchModalOpen(true);
  };

  const columns = [
    { title: 'Invoice', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Supplier', key: 's', render: (_: any, r: PurchaseHeader) => <Text style={{ fontSize: 13 }}>{supplierName(r.supplierId)}</Text> },
    { title: 'Supplier Inv No', dataIndex: 'supplierInvoiceNumber', render: (v: string) => <Text type="secondary" style={{ fontSize: 13 }}>{v || '—'}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: 'Total', dataIndex: 'totalAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    {
      title: '',
      key: 'a',
      align: 'right' as const,
      width: 260,
      render: (_: any, r: PurchaseHeader) => (
        <span style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
          <Button size="small" onClick={() => openMatchModal(r)}>
            3-Way Match
          </Button>
          <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} />
        </span>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Purchase Invoices</Title><Text type="secondary" style={{ fontSize: 13 }}>Approving books the payable (GL)</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Invoice</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No invoices yet.' }} /></div>
      
      <ThreeWayMatchModal
        open={matchModalOpen}
        onClose={() => setMatchModalOpen(false)}
        purchaseInvoiceNumber={matchInvNo}
        lines={matchLines}
      />

      <Drawer title="New Purchase Invoice" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={920} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 240, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="_grnId" label="Pull from GRN (Optional)" style={{ minWidth: 200, flex: 1 }}>
              <Select allowClear showSearch optionFilterProp="label" onChange={handleGrnChange} options={grns.map((g) => ({ value: g.id, label: g.documentNumber }))} />
            </Form.Item>
            <Form.Item name="poId" hidden><Input /></Form.Item>
            <Form.Item name="supplierInvoiceNumber" label="Supplier Invoice No." rules={[{ required: true, message: 'Required' }]} style={{ width: 180 }}><Input /></Form.Item>
            <Form.Item name="supplierInvoiceDate" label="Invoice Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 140 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="postingDate" label="Posting Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="dueDate" label="Due Date" style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={taxCodes.map((t) => ({ id: t.id, code: t.code, gstRateBp: t.gstRateBp }))} />
        </Form>
      </Drawer>

      <Drawer title={viewing?.documentNumber ?? 'Purchase Invoice'} open={!!viewing} onClose={() => setViewing(null)} width={720}>
        {viewing && (
          <>
            <Descriptions column={2} size="small" styles={{ label: { width: 130 } }} bordered>
              <Descriptions.Item label="Supplier">{supplierName(viewing.supplierId)}</Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={viewing.status as DocumentStatus} size="small" /></Descriptions.Item>
              <Descriptions.Item label="Date">{viewing.postingDate}</Descriptions.Item>
              <Descriptions.Item label="Supplier Inv No">{viewing.supplierInvoiceNumber || '-'}</Descriptions.Item>
              <Descriptions.Item label="Total"><AmountDisplay paise={viewing.totalAmountPaise} /></Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{viewing.remarks || '-'}</Descriptions.Item>
            </Descriptions>
            <Table style={{ marginTop: 16 }} size="small" rowKey="id" pagination={false}
              dataSource={viewing.lines || []}
              columns={[
                { title: '#', dataIndex: 'lineNumber', width: 40 },
                { title: 'Item', dataIndex: 'itemId', render: (v, r: any) => items.find(i => i.id === v)?.itemName || r.description || v },
                { title: 'Qty', dataIndex: 'quantity', align: 'right' as const },
                { title: 'UOM', dataIndex: 'uom', width: 70 },
                { title: 'Rate ₹', dataIndex: 'ratePaise', align: 'right' as const, render: (v) => `₹${(v / 100).toFixed(2)}` },
                { title: 'Tax', dataIndex: 'taxAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
                { title: 'Amount', dataIndex: 'netAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
              ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
