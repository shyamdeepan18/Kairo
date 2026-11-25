import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { Users, Building2, Plus, Search, CheckCircle2, ShieldCheck, DollarSign } from 'lucide-react';
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
      message.error(e?.response?.data?.error ?? e?.response?.data?.message ?? 'Save failed');
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

  const activeCount = rows.filter(r => r.isActive).length;
  const registeredCount = rows.filter(r => ((isSupplier ? (r as any).supplierType : (r as any).customerType) === 'registered')).length;
  const totalCreditLimitPaise = rows.reduce((sum, r) => sum + (r.creditLimitPaise || 0), 0);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            {isSupplier ? <Building2 className="w-6 h-6" /> : <Users className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Masters</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">{noun}s</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {noun} Master Directory
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage commercial accounts, credit limits, GSTIN profiles, and payment terms
            </p>
          </div>
        </div>
        <button
          onClick={() => open(null)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        >
          <Plus className="w-4 h-4" />
          Add {noun}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total {noun}s</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                {isSupplier ? <Building2 className="w-4 h-4" /> : <Users className="w-4 h-4" />}
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{rows.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Configured {noun.toLowerCase()} entities</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Accounts</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{activeCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Operational commercial accounts</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">GST Registered</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{registeredCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">With verified GSTIN compliance</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Credit Cap</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/50 rounded-lg text-purple-600 dark:text-purple-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">
              ₹ {rupees(totalCreditLimitPaise)}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative assigned credit limit</div>
          </div>
        </div>

        {/* Floating Filter Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={`Search ${noun.toLowerCase()} by name, code, or GSTIN...`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{noun} Directory Registry</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Click any row to inspect detail ledger and transaction history</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {rows.length} Records
            </span>
          </div>
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
