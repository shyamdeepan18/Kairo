import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Row, Col, Alert, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined, FieldTimeOutlined } from '@ant-design/icons';
import {
  settingsApi, DOCUMENT_TYPES, docTypeLabel,
  type NumberSeries, type Plant,
} from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

/** Build a live preview string from the current form values. */
function buildPreview(v: {
  prefix?: string; padding?: number; includeFiscalYear?: boolean;
  includePlantCode?: boolean; fiscalYear?: string; currentNumber?: number; plantCode?: string;
}): string {
  if (!v.prefix) return '—';
  const seq = String((v.currentNumber ?? 0) + 1).padStart(v.padding ?? 4, '0');
  const parts = [v.prefix];
  if (v.includeFiscalYear && v.fiscalYear) parts.push(v.fiscalYear);
  if (v.includePlantCode) parts.push(v.plantCode ?? 'PLT');
  parts.push(seq);
  return parts.join('/');
}

export function NumberSeriesPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();
  const watch = Form.useWatch([], form);

  const [series, setSeries] = useState<NumberSeries[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [fy, setFy] = useState('');
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<NumberSeries | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    Promise.all([
      settingsApi.listNumberSeries(company.id),
      settingsApi.listPlants(company.id),
    ])
      .then(([s, p]) => { setSeries(s.series); setFy(s.currentFiscalYear); setPlants(p); })
      .catch(() => message.error('Failed to load number series'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(load, [load]);

  const open = (row: NumberSeries | null) => {
    setEditing(row);
    form.resetFields();
    if (row) {
      form.setFieldsValue(row);
    } else {
      form.setFieldsValue({
        includeFiscalYear: true, includePlantCode: false, padding: 4,
        currentNumber: 0, resetOnNewYear: true, fiscalYear: fy,
      });
    }
    setDrawer(true);
  };

  const save = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      if (editing) {
        await settingsApi.updateNumberSeries(company.id, editing.id, values);
        message.success('Number series updated.');
      } else {
        await settingsApi.createNumberSeries(company.id, values);
        message.success('Number series created.');
      }
      setDrawer(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const plantCodeFor = useMemo(() => {
    const id = watch?.plantId;
    return id ? plants.find((p) => p.id === id)?.code : undefined;
  }, [watch?.plantId, plants]);

  const cardStyle = {
    background: dt.colorBgContainer,
    borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`,
    overflow: 'hidden' as const,
  };

  const columns = [
    {
      title: 'Document Type',
      dataIndex: 'documentType',
      key: 'documentType',
      render: (v: string) => <Text strong style={{ fontSize: 13 }}>{docTypeLabel(v)}</Text>,
    },
    {
      title: 'Scope',
      key: 'scope',
      render: (_: unknown, r: NumberSeries) =>
        r.plantCode
          ? <Tag color="geekblue" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Plant {r.plantCode}</Tag>
          : <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Company-wide</Tag>,
    },
    {
      title: 'FY',
      dataIndex: 'fiscalYear',
      key: 'fiscalYear',
      render: (v: string | null) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Next Number',
      key: 'preview',
      render: (_: unknown, r: NumberSeries) => (
        <Text code style={{ fontSize: 12 }}>{r.preview}</Text>
      ),
    },
    {
      title: 'Reset Yearly',
      dataIndex: 'resetOnNewYear',
      key: 'reset',
      render: (v: boolean) => v
        ? <Tag color="success" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Yes</Tag>
        : <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>No</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>
          {v ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, r: NumberSeries) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Number Series</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Document numbering per type & plant · current FY <Text code>{fy}</Text>
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Add Series</Button>
      </div>

      <div style={cardStyle}>
        <Table
          dataSource={series}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No number series configured. Add one to control document numbering.' }}
        />
      </div>

      <Drawer
        title={editing ? 'Edit Number Series' : 'Add Number Series'}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={460}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="documentType" label="Document Type" rules={[{ required: true, message: 'Required' }]}>
            <Select
              disabled={!!editing}
              showSearch
              optionFilterProp="label"
              placeholder="Select document type"
              options={DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.label }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="prefix" label="Prefix" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="PO" maxLength={20} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fiscalYear" label="Fiscal Year" extra="e.g. 2627">
                <Input maxLength={5} disabled={!!editing} placeholder={fy} style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="plantId" label="Plant Scope" extra="Leave empty for company-wide numbering">
            <Select
              allowClear
              disabled={!!editing}
              placeholder="Company-wide"
              options={plants.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="padding" label="Number Padding" extra="4 → 0001">
                <InputNumber min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currentNumber" label="Current Number" extra="Last issued; next = +1">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="includeFiscalYear" label="Include fiscal year segment" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="includePlantCode" label="Include plant code segment" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="resetOnNewYear" label="Reset to 0 each fiscal year" valuePropName="checked"><Switch /></Form.Item>
          {editing && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}

          <Alert
            type="info"
            showIcon
            icon={<FieldTimeOutlined />}
            message="Preview of next number"
            description={<Text code style={{ fontSize: 15 }}>{buildPreview({ ...watch, plantCode: plantCodeFor })}</Text>}
            style={{ borderRadius: 8, marginTop: 8 }}
          />
        </Form>
      </Drawer>
    </div>
  );
}
