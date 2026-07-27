import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import dayjs from 'dayjs';
import {
  Table, Button, Drawer, Form, DatePicker, Input, Select, InputNumber,
  Typography, Space, message,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LifecycleButtons,
} from '../_shared/txn';

const { Title, Text } = Typography;

interface DraftAllocation {
  key: number;
  invoiceId?: string;
  amountRupees: number;
}

let allocSeq = 1;
const newAllocation = (): DraftAllocation => ({ key: allocSeq++, amountRupees: 0 });

export function PurchasePaymentsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<PurchaseHeader[]>([]);
  const [allocations, setAllocations] = useState<DraftAllocation[]>([newAllocation()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const supplierName = (id?: string) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    purchaseApi.payments.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    purchaseApi.invoices.list(company.id, { status: 'approved' }).then((r) => setInvoices(r.data)).catch(() => {});
  }, [company?.id]);

  const selectedSupplierId = Form.useWatch('supplierId', form);

  const availableInvoices = invoices.filter((i) => {
    if (i.paymentStatus === 'paid') return false;
    if (selectedSupplierId && i.supplierId !== selectedSupplierId) return false;
    return true;
  });

  const handleInvoiceSelect = (key: number, invId: string) => {
    const inv = invoices.find((i) => i.id === invId);
    let amountRupees = 0;
    if (inv) {
      const paid = inv.paidAmountPaise ?? 0;
      const duePaise = Math.max(0, inv.totalAmountPaise - paid);
      amountRupees = duePaise / 100;
    }
    setAlloc(key, { invoiceId: invId, amountRupees });
    if (inv?.supplierId && !form.getFieldValue('supplierId')) {
      form.setFieldsValue({ supplierId: inv.supplierId });
    }
  };

  const setAlloc = (key: number, patch: Partial<DraftAllocation>) =>
    setAllocations((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const totalPaise = allocations.reduce((s, a) => s + Math.round((a.amountRupees || 0) * 100), 0);

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setAllocations([newAllocation()]); setDrawer(true); };
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = allocations.filter((a) => a.invoiceId && a.amountRupees > 0);
    if (!valid.length) { message.error('Add at least one allocation'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      supplierId: v.supplierId, paymentMode: v.paymentMode ?? 'bank_transfer',
      bankReference: v.referenceNumber, remarks: v.remarks,
      paidAmountPaise: totalPaise,
      allocations: valid.map((a) => ({ invoiceId: a.invoiceId, allocatedAmountPaise: Math.round((a.amountRupees || 0) * 100) })),
    };
    try { await purchaseApi.payments.create(body); message.success('Payment created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: PurchaseHeader, a: 'submit' | 'approve') => {
    if (!company?.id) return;
    try { await purchaseApi.payments.act(r.id, a, company.id); message.success(`Payment ${a}d.`); load(); }
    catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'Payment No.', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Supplier', key: 's', render: (_: any, r: PurchaseHeader) => <Text style={{ fontSize: 13 }}>{supplierName(r.supplierId)}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { title: 'Amount', dataIndex: 'totalAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    { title: '', key: 'a', align: 'right' as const, width: 180, render: (_: any, r: PurchaseHeader) => <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} /> },
  ];

  const allocColumns = [
    {
      title: 'Invoice', key: 'inv', render: (_: any, a: DraftAllocation) => (
        <Select showSearch optionFilterProp="label" placeholder="Select invoice" style={{ width: '100%', minWidth: 240 }}
          value={a.invoiceId} onChange={(v) => handleInvoiceSelect(a.key, v)}
          options={availableInvoices.map((i) => {
            const paid = i.paidAmountPaise ?? 0;
            const dueRupees = ((i.totalAmountPaise - paid) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            return { value: i.id, label: `${i.documentNumber} — ${supplierName(i.supplierId)} (Due: ₹${dueRupees})` };
          })} />
      ),
    },
    {
      title: 'Amount ₹', key: 'amt', width: 160, render: (_: any, a: DraftAllocation) => (
        <InputNumber min={0} step={0.01} value={a.amountRupees}
          onChange={(v) => setAlloc(a.key, { amountRupees: Number(v) || 0 })} style={{ width: '100%' }} />
      ),
    },
    {
      title: '', key: 'rm', width: 36, render: (_: any, a: DraftAllocation) => (
        <Button type="text" size="small" danger icon={<DeleteOutlined />}
          onClick={() => setAllocations((ls) => ls.filter((x) => x.key !== a.key))} />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Purchase Payments</Title><Text type="secondary" style={{ fontSize: 13 }}>Approving posts GL (DR AP / CR Bank)</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Payment</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}><Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No payments yet.' }} /></div>
      <Drawer title="New Purchase Payment" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={740} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="supplierId" label="Supplier" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 240, flex: 1 }}>
              <Select showSearch optionFilterProp="label" options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))} />
            </Form.Item>
            <Form.Item name="postingDate" label="Payment Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 160 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="paymentMode" label="Mode" initialValue="bank_transfer" style={{ width: 180 }}>
              <Select options={[{ value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'cheque', label: 'Cheque' }, { value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }]} />
            </Form.Item>
            <Form.Item name="referenceNumber" label="Reference / UTR" style={{ flex: 1 }}><Input /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0 8px' }}>
            <Text strong>Allocations</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setAllocations((ls) => [...ls, newAllocation()])}>Add allocation</Button>
          </div>
          <Table dataSource={allocations} columns={allocColumns} rowKey="key" pagination={false} size="small" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <span><Text type="secondary">Total </Text><AmountDisplay paise={totalPaise} bold /></span>
          </div>
          <Form.Item name="remarks" label="Remarks" style={{ marginTop: 16 }}><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
