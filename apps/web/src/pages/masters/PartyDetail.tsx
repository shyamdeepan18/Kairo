import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button, Form, Input, Select, Switch, Typography, Tag, Tabs, Table,
  InputNumber, message, Row, Col, Divider, Spin, Drawer, Empty, Space,
  theme as antTheme,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, PlusOutlined, BankOutlined,
} from '@ant-design/icons';
import {
  mastersApi, SUPPLIER_TYPES, CUSTOMER_TYPES, MSME_TYPES, CUSTOMER_TIERS, SHIPPING_TERMS_OPTIONS,
  type Supplier, type Customer, type CustomerAddress, type PartyTransaction,
} from '../../api/masters';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const STATE_CODES = Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0'));
const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const STATUS_COLOR: Record<string, string> = {
  draft: 'default', submitted: 'processing', approved: 'success',
  rejected: 'error', cancelled: 'default', closed: 'success',
  unpaid: 'warning', paid: 'success', partial: 'processing',
};

type Kind = 'supplier' | 'customer';
type Party = Supplier & Customer;

function PartyDetail({ kind }: { kind: Kind }) {
  const { confirmClose } = useUnsavedChanges();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();
  const [addrForm] = Form.useForm();

  const isSupplier = kind === 'supplier';
  const noun = isSupplier ? 'Supplier' : 'Customer';
  const types = isSupplier ? SUPPLIER_TYPES : CUSTOMER_TYPES;
  const codeField = isSupplier ? 'supplierCode' : 'customerCode';
  const typeField = `${kind}Type`;

  const [party, setParty] = useState<Party | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [txns, setTxns] = useState<PartyTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [txnLoading, setTxnLoading] = useState(false);
  const [addrDrawer, setAddrDrawer] = useState(false);
  const [addrSaving, setAddrSaving] = useState(false);

  const load = useCallback(() => {
    if (!company?.id || !id) return;
    setLoading(true);
    const p = isSupplier
      ? mastersApi.getSupplier(company.id, id).then((s) => ({ party: s as Party, addresses: [] as CustomerAddress[] }))
      : mastersApi.getCustomer(company.id, id).then((d) => ({ party: d.customer as Party, addresses: d.addresses }));
    p.then(({ party, addresses }) => {
      setParty(party);
      setAddresses(addresses);
      form.setFieldsValue({ ...party, creditLimitRupees: party.creditLimitPaise ? party.creditLimitPaise / 100 : 0 });
    })
      .catch(() => message.error(`Failed to load ${noun.toLowerCase()}`))
      .finally(() => setLoading(false));
  }, [company?.id, id, isSupplier, noun, form]);

  useEffect(load, [load]);

  const loadTxns = useCallback(() => {
    if (!company?.id || !id) return;
    setTxnLoading(true);
    const p = isSupplier
      ? mastersApi.supplierTransactions(company.id, id)
      : mastersApi.customerTransactions(company.id, id);
    p.then(setTxns).catch(() => message.error('Failed to load transactions')).finally(() => setTxnLoading(false));
  }, [company?.id, id, isSupplier]);

  const save = async (values: any) => {
    if (!company?.id || !id) return;
    setSaving(true);
    const { creditLimitRupees, ...rest } = values;
    const body: any = { ...rest, creditLimitPaise: Math.round((creditLimitRupees ?? 0) * 100) };
    try {
      isSupplier
        ? await mastersApi.updateSupplier(company.id, id, body)
        : await mastersApi.updateCustomer(company.id, id, body);
      message.success(`${noun} saved.`);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveAddress = async (values: any) => {
    if (!company?.id || !id) return;
    setAddrSaving(true);
    try {
      await mastersApi.addCustomerAddress(company.id, id, values);
      message.success('Address added.');
      setAddrDrawer(false);
      addrForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setAddrSaving(false);
    }
  };

  const sectionLabel = { fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: 600 };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!party) return null;

  const detailsTab = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
      <>
        <span className="block mb-4 text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">General</span>
        <Row gutter={20}>
          <Col xs={24} sm={8}>
            <Form.Item name={codeField} label={`${noun} Code`}><Input disabled style={{ fontFamily: 'monospace' }} /></Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item name={typeField} label="Type" rules={[{ required: true }]}><Select options={types} /></Form.Item>
          </Col>
          <Col xs={24} sm={12}><Form.Item name="legalName" label="Legal Name"><Input /></Form.Item></Col>
          <Col xs={24} sm={6}><Form.Item name="phone" label="Phone"><Input /></Form.Item></Col>
          <Col xs={24} sm={6}><Form.Item name="contactPerson" label="Contact Person"><Input /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item></Col>
        </Row>

        <Divider className="my-5" />
        <span className="block mb-4 text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">Tax & Compliance</span>
        <Row gutter={20}>
          <Col xs={24} sm={10}>
            <Form.Item name="gstin" label="GSTIN" rules={[{ len: 15, message: '15 characters' }]}>
              <Input maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="pan" label="PAN" rules={[{ len: 10, message: '10 characters' }]}>
              <Input maxLength={10} style={{ textTransform: 'uppercase' }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={6}>
            <Form.Item name="stateCode" label="State Code">
              <Select allowClear showSearch options={STATE_CODES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
          </Col>
          {isSupplier && (
            <>
              <Col xs={24} sm={12}>
                <Form.Item name="msmeType" label="MSME Classification">
                  <Select options={MSME_TYPES} placeholder="Select MSME category" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="msmeRegNo" label="MSME / Udyam Reg No">
                  <Input placeholder="UDYAM-XX-00-0000000" style={{ fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col xs={24}><Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item></Col>
              <Col xs={24} sm={10}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
              <Col xs={24} sm={6}><Form.Item name="pincode" label="PIN"><Input maxLength={6} /></Form.Item></Col>
            </>
          )}
        </Row>

        <Divider className="my-5" />
        <span className="block mb-4 text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">Commercial & Delivery</span>
        <Row gutter={20}>
          <Col xs={24} sm={8}><Form.Item name="paymentTermsDays" label="Payment Terms (days)"><InputNumber min={0} max={365} style={{ width: '100%' }} /></Form.Item></Col>
          <Col xs={24} sm={8}><Form.Item name="creditLimitRupees" label="Credit Limit (₹)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          {isSupplier ? (
            <>
              <Col xs={24} sm={8}><Form.Item name="incoterms" label="Standard Incoterms"><Input placeholder="e.g. FOB, CIF" /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="defaultLeadTimeDays" label="Default Lead Time (days)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            </>
          ) : (
            <>
              <Col xs={24} sm={8}><Form.Item name="customerTier" label="Customer Tier"><Select allowClear options={CUSTOMER_TIERS} placeholder="Select tier" /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="defaultDiscountPercent" label="Default Discount (%)"><InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="gracePeriodDays" label="Grace Period (days)" extra="Past due grace"><InputNumber min={0} max={90} style={{ width: '100%' }} /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="shippingTerms" label="Shipping Terms"><Select allowClear options={SHIPPING_TERMS_OPTIONS} placeholder="Shipping terms" /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="preferredTransporter" label="Preferred Transporter"><Input placeholder="e.g. VRL, TCI Express" /></Form.Item></Col>
              <Col xs={24} sm={8}><Form.Item name="creditHold" label="Credit Hold" valuePropName="checked" extra="Block new orders"><Switch /></Form.Item></Col>
            </>
          )}
          <Col xs={24} sm={8}><Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>

        <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
          <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>Save Changes</Button>
        </Form.Item>
      </>
    </div>
  );

  const bankTab = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
      <>
        <Row gutter={20}>
          <Col xs={24} sm={12}><Form.Item name="bankAccountName" label="Account Holder Name"><Input /></Form.Item></Col>
          <Col xs={24} sm={12}><Form.Item name="bankName" label="Bank Name"><Input /></Form.Item></Col>
          <Col xs={24} sm={14}><Form.Item name="bankAccountNumber" label="Account Number"><Input /></Form.Item></Col>
          <Col xs={24} sm={10}><Form.Item name="bankIfsc" label="IFSC"><Input maxLength={11} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} /></Form.Item></Col>
        </Row>
        <Form.Item style={{ marginBottom: 0, marginTop: 4 }}>
          <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>Save Bank Details</Button>
        </Form.Item>
      </>
    </div>
  );

  const addrColumns = [
    {
      title: 'Address',
      key: 'addr',
      render: (_: unknown, r: CustomerAddress) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>
            {r.label ?? r.addressType}
            {r.isDefault && <Tag color="blue" style={{ marginLeft: 8, borderRadius: 10, border: 0, fontSize: 10 }}>Default</Tag>}
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {[r.address, r.city, r.state, r.pincode].filter(Boolean).join(', ') || '—'}
          </Text>
        </div>
      ),
    },
    { title: 'Type', dataIndex: 'addressType', key: 'type', render: (v: string) => <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v}</Tag> },
    { title: 'GSTIN / State', key: 'gst', render: (_: unknown, r: CustomerAddress) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.gstin ?? r.stateCode ?? '—'}</Text> },
  ];

  const contactsTab = isSupplier ? (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm">
      <span className="block mb-4 text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">Primary Contact</span>
      <Row gutter={[20, 8]}>
        <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Contact Person</Text><br /><Text strong>{party.contactPerson ?? '—'}</Text></Col>
        <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Phone</Text><br /><Text strong>{party.phone ?? '—'}</Text></Col>
        <Col span={8}><Text type="secondary" style={{ fontSize: 12 }}>Email</Text><br /><Text strong>{party.email ?? '—'}</Text></Col>
      </Row>
    </div>
  ) : (
    <div>
      <div className="mb-4 flex justify-end">
        <Button icon={<PlusOutlined />} onClick={() => { addrForm.resetFields(); setAddrDrawer(true); }}>Add Address</Button>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <Table dataSource={addresses} columns={addrColumns} rowKey="id" pagination={false}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No addresses yet" /> }} />
      </div>
    </div>
  );

  const txnColumns = [
    { title: 'Type', dataIndex: 'kind', key: 'kind', render: (v: string) => <Tag color="geekblue" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v}</Tag> },
    { title: 'Document', dataIndex: 'documentNumber', key: 'num', render: (v: string) => <Text strong style={{ fontSize: 13, fontFamily: 'monospace' }}>{v}</Text> },
    { title: 'Date', dataIndex: 'postingDate', key: 'date', render: (v: string) => <Text style={{ fontSize: 12 }}>{fmtDate(v)}</Text> },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLOR[v] ?? 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v}</Tag> },
    { title: 'Amount', dataIndex: 'amountPaise', key: 'amt', align: 'right' as const, render: (v: number) => <Text style={{ fontSize: 13 }}>₹{rupees(v)}</Text> },
  ];

  const transactionsTab = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <Table dataSource={txns} columns={txnColumns} rowKey={(r) => `${r.kind}-${r.documentNumber}`} loading={txnLoading}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        locale={{ emptyText: 'No transactions for this ' + noun.toLowerCase() + '.' }} />
    </div>
  );

  return (
    <div>
      <Button type="text" icon={<ArrowLeftOutlined />} onClick={async () => {
        if (await confirmClose(form, { content: 'You have unsaved changes on this page. Leave anyway?' })) navigate(`/masters/${kind}s`);
      }} className="mb-2 -ml-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300">
        Back to {noun}s
      </Button>
      <div className="mb-6 flex items-center gap-3">
        <h2 className="m-0 font-bold text-lg text-slate-900 dark:text-white">{party.name}</h2>
        <span className="text-slate-500 dark:text-slate-400 font-mono text-[13px]">{(party as any)[codeField]}</span>
        <Tag color={party.isActive ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>
          {party.isActive ? 'Active' : 'Inactive'}
        </Tag>
        {party.gstin && <Tag icon={<BankOutlined />} style={{ borderRadius: 10, border: 0, fontSize: 11, fontFamily: 'monospace' }}>{party.gstin}</Tag>}
      </div>

      <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
        <Tabs
          defaultActiveKey="details"
          onChange={(k) => { if (k === 'transactions' && txns.length === 0) loadTxns(); }}
          items={[
            { key: 'details', label: 'General', children: detailsTab },
            { key: 'bank', label: 'Bank', children: bankTab },
            { key: 'contacts', label: isSupplier ? 'Contact' : 'Addresses', children: contactsTab },
            { key: 'transactions', label: 'Transactions', children: transactionsTab },
          ]}
        />
      </Form>

      <Drawer
        title="Add Address"
        open={addrDrawer}
        onClose={async () => { if (await confirmClose(addrForm)) { addrForm.resetFields(); setAddrDrawer(false); } }}
        width={440}
        extra={<Button type="primary" loading={addrSaving} onClick={() => addrForm.submit()}>Save</Button>}
      >
        <Form form={addrForm} layout="vertical" onFinish={saveAddress} requiredMark={false} initialValues={{ addressType: 'both', isDefault: false }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="label" label="Label"><Input placeholder="Head Office" /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="addressType" label="Type">
                <Select options={[
                  { value: 'billing', label: 'Billing' },
                  { value: 'shipping', label: 'Shipping' },
                  { value: 'both', label: 'Both' },
                ]} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={16}>
            <Col span={10}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
            <Col span={6}><Form.Item name="pincode" label="PIN"><Input maxLength={6} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={14}><Form.Item name="gstin" label="Ship-to GSTIN"><Input maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} /></Form.Item></Col>
            <Col span={10}>
              <Form.Item name="stateCode" label="State Code">
                <Select allowClear showSearch options={STATE_CODES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
          </Row>
          <Space size="large">
            <Form.Item name="contactPerson" label="Contact Person"><Input /></Form.Item>
            <Form.Item name="isDefault" label="Default address" valuePropName="checked"><Switch /></Form.Item>
          </Space>
        </Form>
      </Drawer>
    </div>
  );
}

export function SupplierDetailPage() { return <PartyDetail kind="supplier" />; }
export function CustomerDetailPage() { return <PartyDetail kind="customer" />; }
