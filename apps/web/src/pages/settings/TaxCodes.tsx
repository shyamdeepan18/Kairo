import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Tabs, Spin, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import { settingsApi, type TaxCode, type HsnCode } from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const RATE_TYPES = [
  { value: 'standard', label: 'Standard (5/12/18/28%)' },
  { value: 'nil',      label: 'Nil rated (0%, ITC allowed)' },
  { value: 'exempt',   label: 'Exempt (0%, ITC blocked)' },
  { value: 'zero',     label: 'Zero rated (export / SEZ)' },
  { value: 'cess',     label: 'Standard + Cess' },
  { value: 'ig_only',  label: 'IGST only' },
];

const bpToPct = (bp: number) => `${(bp / 100).toFixed(bp % 100 === 0 ? 0 : 2)}%`;

function TaxCodesTab() {
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();

  const [codes, setCodes] = useState<TaxCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    settingsApi.listTaxCodes(company.id)
      .then(setCodes)
      .catch(() => message.error('Failed to load tax codes'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(load, [load]);

  const open = (row: TaxCode | null) => {
    setEditing(row);
    form.resetFields();
    if (row) form.setFieldsValue({ ...row, gstRatePct: row.gstRateBp / 100, cessRatePct: row.cessRateBp / 100 });
    else form.setFieldsValue({ rateType: 'standard', gstRatePct: 18, cessRatePct: 0 });
    setDrawer(true);
  };

  const save = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      if (editing) {
        await settingsApi.updateTaxCode(company.id, editing.id, { name: values.name, isActive: values.isActive });
        message.success('Tax code updated.');
      } else {
        await settingsApi.createTaxCode(company.id, {
          code: values.code,
          name: values.name,
          rateType: values.rateType,
          gstRateBp: Math.round((values.gstRatePct ?? 0) * 100),
          cessRateBp: Math.round((values.cessRatePct ?? 0) * 100),
        });
        message.success('Tax code created.');
      }
      setDrawer(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      title: 'Code',
      dataIndex: 'code',
      key: 'code',
      render: (v: string, r: TaxCode) => (
        <span>
          <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text>
          {r.isSystemCode && <Tag color="default" style={{ marginLeft: 8, borderRadius: 10, border: 0, fontSize: 10 }}>System</Tag>}
        </span>
      ),
    },
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: 'GST',
      dataIndex: 'gstRateBp',
      key: 'gst',
      render: (v: number) => <Text strong style={{ fontSize: 13 }}>{bpToPct(v)}</Text>,
    },
    {
      title: 'CGST / SGST',
      key: 'split',
      render: (_: unknown, r: TaxCode) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{bpToPct(r.cgstRateBp)} + {bpToPct(r.sgstRateBp)}</Text>
      ),
    },
    {
      title: 'Cess',
      dataIndex: 'cessRateBp',
      key: 'cess',
      render: (v: number) => v > 0 ? <Text style={{ fontSize: 12 }}>{bpToPct(v)}</Text> : <Text type="secondary">—</Text>,
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
      render: (_: unknown, r: TaxCode) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} />
      ),
    },
  ];

  const cardStyle = {
    background: dt.colorBgContainer, borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`, overflow: 'hidden' as const,
  };

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Add Tax Code</Button>
      </div>
      <div style={cardStyle}>
        <Table
          dataSource={codes}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No tax codes yet.' }}
        />
      </div>

      <Drawer
        title={editing ? 'Edit Tax Code' : 'Add Tax Code'}
        open={drawer}
        onClose={() => setDrawer(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Required' }]}>
            <Input disabled={!!editing} placeholder="GST18" maxLength={20} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="GST @ 18%" />
          </Form.Item>
          <Form.Item name="rateType" label="Rate Type" rules={[{ required: true }]}>
            <Select disabled={!!editing} options={RATE_TYPES} />
          </Form.Item>
          <Form.Item name="gstRatePct" label="GST Rate (%)" extra="CGST/SGST split is computed automatically">
            <InputNumber min={0} max={50} step={0.5} disabled={!!editing} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          <Form.Item name="cessRatePct" label="Cess (%)">
            <InputNumber min={0} max={300} step={0.5} disabled={!!editing} style={{ width: '100%' }} addonAfter="%" />
          </Form.Item>
          {editing && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
          {editing && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Rates are immutable once created — to change a rate, deactivate this code and create a new one.
            </Text>
          )}
        </Form>
      </Drawer>
    </div>
  );
}

function HsnTab() {
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<HsnCode[]>([]);
  const [loading, setLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!company?.id) return;
    const h = setTimeout(() => {
      setLoading(true);
      settingsApi.searchHsn(company.id, q)
        .then(setResults)
        .catch(() => message.error('HSN search failed'))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(h);
  }, [q, company?.id]);

  const columns = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 120, render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Description', dataIndex: 'description', key: 'description', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: 'Kind',
      dataIndex: 'isService',
      key: 'kind',
      width: 100,
      render: (v: boolean) => <Tag color={v ? 'purple' : 'blue'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v ? 'SAC' : 'HSN'}</Tag>,
    },
    {
      title: 'Default GST',
      dataIndex: 'defaultGstRateBp',
      key: 'gst',
      width: 110,
      render: (v: number) => <Text style={{ fontSize: 13 }}>{bpToPct(v)}</Text>,
    },
  ];

  const cardStyle = {
    background: dt.colorBgContainer, borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`, overflow: 'hidden' as const,
  };

  return (
    <div>
      <Input
        size="large"
        allowClear
        prefix={loading ? <Spin size="small" /> : <SearchOutlined />}
        placeholder="Search HSN / SAC by code or description…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 520 }}
      />
      <div style={cardStyle}>
        <Table
          dataSource={results}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          locale={{ emptyText: q ? 'No matching HSN/SAC codes.' : 'Showing common codes. Type to search.' }}
        />
      </div>
    </div>
  );
}

export function TaxCodesPage() {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Tax Codes & HSN</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>GST rate codes used on documents, plus the HSN/SAC master.</Text>
      </div>
      <Tabs
        defaultActiveKey="codes"
        items={[
          { key: 'codes', label: 'Tax Codes', children: <TaxCodesTab /> },
          { key: 'hsn', label: 'HSN / SAC Lookup', children: <HsnTab /> },
        ]}
      />
    </div>
  );
}
