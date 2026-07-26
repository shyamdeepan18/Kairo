import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useNavigate } from 'react-router-dom';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import {
  mastersApi, SUPPLIER_TYPES, CUSTOMER_TYPES,
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

  const cardStyle = {
    background: dt.colorBgContainer, borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`, overflow: 'hidden' as const,
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
        return <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{t?.label ?? (r as any)[typeField]}</Tag>;
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
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>{noun}s</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{rows.length} {noun.toLowerCase()}{rows.length !== 1 ? 's' : ''}</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Add {noun}</Button>
      </div>

      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder={`Search by name, code or GSTIN…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />

      <div style={cardStyle}>
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
        width={520}
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
                    {!isSupplier && (
                      <Row gutter={16}>
                        <Col span={12}>
                          <Form.Item name="defaultDiscountPercent" label="Default Discount (%)">
                            <InputNumber min={0} max={100} step={0.5} style={{ width: '100%' }} />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="creditHold" label="Credit Hold" valuePropName="checked" extra="Block new orders">
                            <Switch />
                          </Form.Item>
                        </Col>
                      </Row>
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
