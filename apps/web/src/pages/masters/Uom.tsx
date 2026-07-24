import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, ArrowRightOutlined } from '@ant-design/icons';
import {
  mastersApi, UOM_DIMENSIONS,
  type Uom, type UomConversion,
} from '../../api/masters';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const DIM_COLORS: Record<string, string> = {
  weight: 'blue', volume: 'cyan', length: 'green', area: 'gold',
  quantity: 'purple', time: 'magenta', other: 'default',
};

export function UomPage() {
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [uomForm] = Form.useForm();
  const [convForm] = Form.useForm();

  const [uoms, setUoms] = useState<Uom[]>([]);
  const [conversions, setConversions] = useState<UomConversion[]>([]);
  const [loading, setLoading] = useState(true);
  const [uomDrawer, setUomDrawer] = useState(false);
  const [convDrawer, setConvDrawer] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    mastersApi.listUom(company.id)
      .then((d) => { setUoms(d.uom); setConversions(d.conversions); })
      .catch(() => message.error('Failed to load units'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(load, [load]);

  const saveUom = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      await mastersApi.createUom(company.id, values);
      message.success('Unit created.');
      setUomDrawer(false);
      uomForm.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const saveConv = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      await mastersApi.createUomConversion(company.id, values);
      message.success('Conversion created.');
      setConvDrawer(false);
      convForm.resetFields();
      load();
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

  const uomColumns = [
    { title: 'Code', dataIndex: 'code', key: 'code', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: 'Dimension',
      dataIndex: 'type',
      key: 'type',
      render: (v: string) => <Tag color={DIM_COLORS[v] ?? 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v ? 'Active' : 'Inactive'}</Tag>
      ),
    },
  ];

  const convColumns = [
    {
      title: 'Conversion',
      key: 'conv',
      render: (_: unknown, r: UomConversion) => (
        <Text style={{ fontSize: 13 }}>
          1 <Text strong style={{ fontFamily: 'monospace' }}>{r.fromUom}</Text>
          <ArrowRightOutlined style={{ margin: '0 8px', opacity: 0.5 }} />
          <Text strong>{Number(r.factor)}</Text> <Text strong style={{ fontFamily: 'monospace' }}>{r.toUom}</Text>
        </Text>
      ),
    },
    {
      title: 'Scope',
      key: 'scope',
      render: (_: unknown, r: UomConversion) => r.companyId
        ? <Tag color="geekblue" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Company</Tag>
        : <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Global</Tag>,
    },
    {
      title: 'Item-specific',
      key: 'item',
      render: (_: unknown, r: UomConversion) => r.itemId
        ? <Tag color="purple" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Yes</Tag>
        : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
  ];

  const uomOptions = uoms.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }));

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Units of Measure</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>Standard and custom units, plus conversion factors.</Text>
      </div>

      <Tabs
        defaultActiveKey="units"
        items={[
          {
            key: 'units',
            label: 'Units',
            children: (
              <div>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { uomForm.resetFields(); setUomDrawer(true); }}>Add Unit</Button>
                </div>
                <div style={cardStyle}>
                  <Table dataSource={uoms} columns={uomColumns} rowKey="id" loading={loading}
                    pagination={{ pageSize: 25, hideOnSinglePage: true }} locale={{ emptyText: 'No units yet.' }} />
                </div>
              </div>
            ),
          },
          {
            key: 'conversions',
            label: 'Conversions',
            children: (
              <div>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => { convForm.resetFields(); setConvDrawer(true); }}>Add Conversion</Button>
                </div>
                <div style={cardStyle}>
                  <Table dataSource={conversions} columns={convColumns} rowKey="id" loading={loading}
                    pagination={{ pageSize: 25, hideOnSinglePage: true }} locale={{ emptyText: 'No conversions defined.' }} />
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Unit drawer */}
      <Drawer
        title="Add Unit of Measure"
        open={uomDrawer}
        onClose={() => setUomDrawer(false)}
        width={400}
        extra={<Button type="primary" loading={saving} onClick={() => uomForm.submit()}>Save</Button>}
      >
        <Form form={uomForm} layout="vertical" onFinish={saveUom} requiredMark={false}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="DRUM" style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Drum" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="type" label="Dimension" rules={[{ required: true }]} extra="Prevents nonsensical conversions (kg → metres)">
            <Select options={UOM_DIMENSIONS.map((d) => ({ value: d, label: d }))} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* Conversion drawer */}
      <Drawer
        title="Add Conversion"
        open={convDrawer}
        onClose={() => setConvDrawer(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={() => convForm.submit()}>Save</Button>}
      >
        <Form form={convForm} layout="vertical" onFinish={saveConv} requiredMark={false}>
          <Row gutter={16} align="bottom">
            <Col span={8}>
              <Form.Item name="fromUom" label="From" rules={[{ required: true, message: 'Required' }]}>
                <Select showSearch optionFilterProp="label" options={uomOptions} placeholder="KG" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="factor" label="Factor" rules={[{ required: true, message: 'Required' }]}>
                <InputNumber min={0} step={0.0001} style={{ width: '100%' }} placeholder="1000" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="toUom" label="To" rules={[{ required: true, message: 'Required' }]}>
                <Select showSearch optionFilterProp="label" options={uomOptions} placeholder="G" />
              </Form.Item>
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Quantity in “To” unit = quantity in “From” unit × factor.
          </Text>
        </Form>
      </Drawer>
    </div>
  );
}
