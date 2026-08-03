import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import {
  mastersApi, SUPPLIER_TYPES, CUSTOMER_TYPES, MSME_TYPES, CUSTOMER_TIERS, SHIPPING_TERMS_OPTIONS,
  type Supplier, type Customer,
} from '../../api/masters';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const STATE_CODES = Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0'));
const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

type Kind = 'supplier' | 'customer';
type Party = Supplier & Customer; // superset for form convenience

interface PartyPageProps { kind: Kind; }

function PartyPage({ kind }: PartyPageProps) {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const isSupplier = kind === 'supplier';
  const noun = isSupplier ? 'Supplier' : 'Customer';
  const types = isSupplier ? SUPPLIER_TYPES : CUSTOMER_TYPES;

  const [rows, setRows] = useState<Party[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback((search?: string) => {
    if (!company?.id) return;
    setLoading(true);
    const p = isSupplier
      ? mastersApi.listSuppliers(company.id, search)
      : mastersApi.listCustomers(company.id, search);
    p.then((d) => setRows(d as Party[]))
      .catch(() => message.error(`Failed to load ${noun.toLowerCase()}s`))
      .finally(() => setLoading(false));
  }, [company?.id, isSupplier, noun]);

  useEffect(() => { load(); }, [load]);

  // Debounced search
  useEffect(() => {
    const h = setTimeout(() => load(q || undefined), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const open = (row: Party | null) => {
    setEditing(row);
    form.resetFields();
    if (row) {
      form.setFieldsValue({
        ...row,
        creditLimitRupees: row.creditLimitPaise ? row.creditLimitPaise / 100 : 0,
      });
    } else {
      form.setFieldsValue({
        [`${kind}Type`]: 'registered',
        paymentTermsDays: 30,
        gracePeriodDays: 0,
        defaultLeadTimeDays: 0,
        msmeType: 'none',
        creditLimitRupees: 0,
      });
    }
    setDrawer(true);
  };

  const save = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    const { creditLimitRupees, ...rest } = values;
    const body: any = { ...rest, creditLimitPaise: Math.round((creditLimitRupees ?? 0) * 100) };
    try {
      if (editing) {
        isSupplier
          ? await mastersApi.updateSupplier(company.id, editing.id, body)
          : await mastersApi.updateCustomer(company.id, editing.id, body);
        message.success(`${noun} updated.`);
      } else {
        isSupplier
          ? await mastersApi.createSupplier(company.id, body)
          : await mastersApi.createCustomer(company.id, body);
        message.success(`${noun} created.`);
      }
      setDrawer(false);
      load(q || undefined);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const codeField = isSupplier ? 'supplierCode' : 'customerCode';
  const typeField = `${kind}Type`;

  const columns = [
    {
      title: noun,
      key: 'name',
      render: (_: unknown, r: Party) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 13 }}>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{(r as any)[codeField]}</Text>
        </div>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      render: (_: unknown, r: Party) => {
        const t = types.find((x) => x.value === (r as any)[typeField]);
        return (
          <div className="flex flex-col gap-1 items-start">
            <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{t?.label ?? (r as any)[typeField]}</Tag>
            {isSupplier && r.msmeType && r.msmeType !== 'none' && (
              <Tag color="cyan" style={{ borderRadius: 10, border: 0, fontSize: 10 }}>MSME: {r.msmeType.toUpperCase()}</Tag>
            )}
            {!isSupplier && r.customerTier && (
              <Tag color="purple" style={{ borderRadius: 10, border: 0, fontSize: 10 }}>{r.customerTier.toUpperCase()}</Tag>
            )}
          </div>
        );
      },
    },
    {
      title: 'GSTIN',
      dataIndex: 'gstin',
      key: 'gstin',
      render: (v: string | null) => v
        ? <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>Unregistered</Text>,
    },
    {
      title: 'Credit Limit',
      dataIndex: 'creditLimitPaise',
      key: 'credit',
      align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ fontSize: 12 }}>₹{rupees(v)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, r: Party) => (
        <Button type="text" size="small" icon={<EditOutlined />}
          onClick={(e) => { e.stopPropagation(); navigate(`/masters/${kind}s/${r.id}`); }} />
      ),
    },
  ];

  return (
    <div>
      <div className="mb-5 flex justify-between items-start">
        <div>
          <h2 className="m-0 font-bold text-lg text-slate-900 dark:text-white">{noun}s</h2>
          <span className="text-[13px] text-slate-500 dark:text-slate-400">{rows.length} {noun.toLowerCase()}{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Add {noun}</Button>
      </div>

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={`Search by name, code or GSTIN…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-[420px]"
      />

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: `No ${noun.toLowerCase()}s yet.` }}
          onRow={(r) => ({ onClick: () => navigate(`/masters/${kind}s/${r.id}`), style: { cursor: 'pointer' } })}
        />
      </div>

      <Drawer
        title={editing ? `Edit ${noun}` : `Add ${noun}`}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={540}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Tabs
            defaultActiveKey="general"
            items={[
              {
                key: 'general',
                label: 'General',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={10}>
                        <Form.Item name={codeField} label={`${noun} Code`} rules={[{ required: true, message: 'Required' }]}>
                          <Input placeholder={isSupplier ? 'SUP-0001' : 'CUST-0001'} style={{ fontFamily: 'monospace' }} />
                        </Form.Item>
                      </Col>
                      <Col span={14}>
                        <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                          <Input placeholder={`${noun} name`} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="legalName" label="Legal / Registered Name"><Input /></Form.Item>
                    <Form.Item name={typeField} label="Type" rules={[{ required: true }]}>
                      <Select options={types} />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={12}><Form.Item name="contactPerson" label="Contact Person"><Input /></Form.Item></Col>
                      <Col span={12}><Form.Item name="phone" label="Phone"><Input placeholder="+91 …" /></Form.Item></Col>
                    </Row>
                    <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item>
                    {editing && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
                  </>
                ),
              },
              {
                key: 'tax',
                label: 'Tax & Address',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={14}>
                        <Form.Item name="gstin" label="GSTIN" rules={[{ len: 15, message: '15 characters' }]}>
                          <Input maxLength={15} placeholder="29ABCDE1234F1Z5" style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
                        </Form.Item>
                      </Col>
                      <Col span={10}>
                        <Form.Item name="pan" label="PAN" rules={[{ len: 10, message: '10 characters' }]}>
                          <Input maxLength={10} placeholder="ABCDE1234F" style={{ textTransform: 'uppercase' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="stateCode" label="GST State Code" extra="Defaults to first 2 digits of GSTIN">
                      <Select allowClear showSearch options={STATE_CODES.map((c) => ({ value: c, label: c }))} style={{ maxWidth: 160 }} />
                    </Form.Item>
                    {isSupplier && (
                      <>
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="msmeType" label="MSME Classification">
                              <Select options={MSME_TYPES} placeholder="Select MSME category" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="msmeRegNo" label="MSME / Udyam Reg No">
                              <Input placeholder="UDYAM-XX-00-0000000" style={{ fontFamily: 'monospace' }} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
                        <Row gutter={16}>
                          <Col span={12}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
                          <Col span={6}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
                          <Col span={6}><Form.Item name="pincode" label="PIN"><Input maxLength={6} /></Form.Item></Col>
                        </Row>
                      </>
                    )}
                  </>
                ),
              },
              {
                key: 'commercial',
                label: 'Commercial',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="paymentTermsDays" label="Payment Terms (days)">
                          <InputNumber min={0} max={365} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="creditLimitRupees" label="Credit Limit (₹)">
                          <InputNumber min={0} style={{ width: '100%' }} formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} parser={(v) => Number(`${v}`.replace(/,/g, '')) as any} />
                        </Form.Item>
                      </Col>
                    </Row>
                    {isSupplier ? (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item name="incoterms" label="Standard Incoterms">
                            <Input placeholder="e.g. FOB, CIF, EXW" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="defaultLeadTimeDays" label="Default Lead Time (days)">
                            <InputNumber min={0} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                      </Row>
                    ) : (
                      <>
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="customerTier" label="Customer Tier">
                              <Select allowClear options={CUSTOMER_TIERS} placeholder="Select tier" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="defaultDiscountPercent" label="Default Discount (%)">
                              <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="gracePeriodDays" label="Grace Period (days)" extra="Days past due date before credit block">
                              <InputNumber min={0} max={90} style={{ width: '100%' }} />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="creditHold" label="Credit Hold" valuePropName="checked" extra="Block new sales orders">
                              <Switch />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Row gutter={16}>
                          <Col span={12}>
                            <Form.Item name="shippingTerms" label="Shipping Terms">
                              <Select allowClear options={SHIPPING_TERMS_OPTIONS} placeholder="Select shipping terms" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="preferredTransporter" label="Preferred Transporter">
                              <Input placeholder="e.g. VRL, TCI Express" />
                            </Form.Item>
                          </Col>
                        </Row>
                      </>
                    )}
                  </>
                ),
              },
              {
                key: 'bank',
                label: 'Bank',
                children: (
                  <>
                    <Form.Item name="bankAccountName" label="Account Holder Name"><Input /></Form.Item>
                    <Row gutter={16}>
                      <Col span={14}><Form.Item name="bankAccountNumber" label="Account Number"><Input /></Form.Item></Col>
                      <Col span={10}><Form.Item name="bankIfsc" label="IFSC"><Input maxLength={11} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} /></Form.Item></Col>
                    </Row>
                    <Form.Item name="bankName" label="Bank Name"><Input /></Form.Item>
                  </>
                ),
              },
            ]}
          />
        </Form>
      </Drawer>
    </div>
  );
}

export function SuppliersPage() { return <PartyPage kind="supplier" />; }
export function CustomersPage() { return <PartyPage kind="customer" />; }
