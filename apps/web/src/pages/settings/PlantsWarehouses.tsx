import { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  message, Row, Col, theme as antTheme,
} from 'antd';
import {
  PlusOutlined, EnvironmentOutlined, EditOutlined, InboxOutlined,
} from '@ant-design/icons';
import {
  settingsApi, WAREHOUSE_TYPES,
  type Plant, type Warehouse, type WarehouseType,
} from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const STATE_CODES = Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0'));

export function PlantsWarehousesPage() {
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [plantForm] = Form.useForm();
  const [whForm] = Form.useForm();

  const [plants, setPlants] = useState<Plant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [whLoading, setWhLoading] = useState(false);

  const [plantDrawer, setPlantDrawer] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [whDrawer, setWhDrawer] = useState(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPlants = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    settingsApi.listPlants(company.id)
      .then((p) => {
        setPlants(p);
        setSelectedPlant((cur) => cur ?? p[0]?.id ?? null);
      })
      .catch(() => message.error('Failed to load plants'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  const loadWarehouses = useCallback((plantId: string) => {
    if (!company?.id) return;
    setWhLoading(true);
    settingsApi.listWarehouses(company.id, plantId)
      .then(setWarehouses)
      .catch(() => message.error('Failed to load warehouses'))
      .finally(() => setWhLoading(false));
  }, [company?.id]);

  useEffect(loadPlants, [loadPlants]);
  useEffect(() => { if (selectedPlant) loadWarehouses(selectedPlant); }, [selectedPlant, loadWarehouses]);

  // ── Plant drawer ───────────────────────────────────────────────────────────
  const openPlantDrawer = (plant: Plant | null) => {
    setEditingPlant(plant);
    plantForm.resetFields();
    if (plant) plantForm.setFieldsValue(plant);
    setPlantDrawer(true);
  };

  const savePlant = async (values: Partial<Plant>) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      if (editingPlant) {
        await settingsApi.updatePlant(company.id, editingPlant.id, values);
        message.success('Plant updated.');
      } else {
        await settingsApi.createPlant(company.id, values as Plant);
        message.success('Plant created.');
      }
      setPlantDrawer(false);
      loadPlants();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Warehouse drawer ─────────────────────────────────────────────────────────
  const openWhDrawer = (wh: Warehouse | null) => {
    setEditingWh(wh);
    whForm.resetFields();
    if (wh) whForm.setFieldsValue(wh);
    else whForm.setFieldsValue({ warehouseType: 'raw_material', isDefault: false });
    setWhDrawer(true);
  };

  const saveWh = async (values: any) => {
    if (!company?.id || !selectedPlant) return;
    setSaving(true);
    try {
      if (editingWh) {
        await settingsApi.updateWarehouse(company.id, editingWh.id, values);
        message.success('Warehouse updated.');
      } else {
        await settingsApi.createWarehouse(company.id, { ...values, plantId: selectedPlant });
        message.success('Warehouse created.');
      }
      setWhDrawer(false);
      loadWarehouses(selectedPlant);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cardStyle = {
    background: dt.colorBgContainer,
    borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`,
    overflow: 'hidden' as const,
  };

  const plantColumns = [
    {
      title: 'Plant',
      key: 'plant',
      render: (_: unknown, r: Plant) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 13 }}>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.code}</Text>
        </div>
      ),
    },
    {
      title: 'GSTIN',
      dataIndex: 'gstin',
      key: 'gstin',
      render: (v: string | null) =>
        v ? <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text>
          : <Text type="secondary" style={{ fontSize: 12 }}>—</Text>,
    },
    {
      title: 'Location',
      key: 'loc',
      render: (_: unknown, r: Plant) => (
        <Text style={{ fontSize: 12 }}>
          {[r.city, r.stateCode && `State ${r.stateCode}`].filter(Boolean).join(', ') || '—'}
        </Text>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, r: Plant) => (
        <Tag color={r.isActive ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, r: Plant) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openPlantDrawer(r); }} />
      ),
    },
  ];

  const whColumns = [
    {
      title: 'Warehouse',
      key: 'wh',
      render: (_: unknown, r: Warehouse) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 13 }}>
            {r.name}{r.isDefault && <Tag color="blue" style={{ marginLeft: 8, borderRadius: 10, border: 0, fontSize: 10 }}>Default</Tag>}
          </Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.code}</Text>
        </div>
      ),
    },
    {
      title: 'Type',
      key: 'type',
      render: (_: unknown, r: Warehouse) => {
        const t = WAREHOUSE_TYPES.find((w) => w.value === r.warehouseType);
        return <Tag color={t?.color} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{t?.label ?? r.warehouseType}</Tag>;
      },
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, r: Warehouse) => (
        <Tag color={r.isActive ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, r: Warehouse) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openWhDrawer(r)} />
      ),
    },
  ];

  const activePlant = plants.find((p) => p.id === selectedPlant);

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Plants & Warehouses</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {plants.length} plant{plants.length !== 1 ? 's' : ''} · select a plant to manage its warehouses
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openPlantDrawer(null)}>Add Plant</Button>
      </div>

      <div style={{ ...cardStyle, marginBottom: 24 }}>
        <Table
          dataSource={plants}
          columns={plantColumns}
          rowKey="id"
          loading={loading}
          pagination={false}
          rowClassName={(r) => (r.id === selectedPlant ? 'ant-table-row-selected' : '')}
          onRow={(r) => ({ onClick: () => setSelectedPlant(r.id), style: { cursor: 'pointer' } })}
          locale={{ emptyText: 'No plants yet. Add your first plant to get started.' }}
        />
      </div>

      <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Text strong style={{ fontSize: 14 }}>
            <InboxOutlined style={{ marginRight: 8 }} />
            Warehouses {activePlant && <Text type="secondary" style={{ fontWeight: 400 }}>· {activePlant.name}</Text>}
          </Text>
        </div>
        <Button icon={<PlusOutlined />} disabled={!selectedPlant} onClick={() => openWhDrawer(null)}>Add Warehouse</Button>
      </div>

      <div style={cardStyle}>
        <Table
          dataSource={warehouses}
          columns={whColumns}
          rowKey="id"
          loading={whLoading}
          pagination={false}
          locale={{ emptyText: selectedPlant ? 'No warehouses in this plant yet.' : 'Select a plant above.' }}
        />
      </div>

      {/* Plant drawer */}
      <Drawer
        title={editingPlant ? 'Edit Plant' : 'Add Plant'}
        open={plantDrawer}
        onClose={() => setPlantDrawer(false)}
        width={460}
        extra={<Button type="primary" loading={saving} onClick={() => plantForm.submit()}>Save</Button>}
      >
        <Form form={plantForm} layout="vertical" onFinish={savePlant} requiredMark={false}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="code" label="Plant Code" rules={[{ required: true, message: 'Code is required' }]}>
                <Input placeholder="MUM-01" prefix={<EnvironmentOutlined />} />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="name" label="Plant Name" rules={[{ required: true, message: 'Name is required' }]}>
                <Input placeholder="Mumbai Manufacturing Unit" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="gstin"
            label="GSTIN"
            extra="Plant in a different state needs its own GSTIN"
            rules={[{ len: 15, message: 'GSTIN must be 15 characters' }]}
          >
            <Input placeholder="27ABCDE1234F1Z5" maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={16}>
            <Col span={10}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col span={8}>
              <Form.Item name="stateCode" label="State Code">
                <Select showSearch placeholder="Code" options={STATE_CODES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
            <Col span={6}><Form.Item name="pincode" label="PIN"><Input maxLength={6} /></Form.Item></Col>
          </Row>
          <Form.Item name="phone" label="Phone"><Input placeholder="+91 98765 43210" /></Form.Item>
          {editingPlant && (
            <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>
          )}
        </Form>
      </Drawer>

      {/* Warehouse drawer */}
      <Drawer
        title={editingWh ? 'Edit Warehouse' : 'Add Warehouse'}
        open={whDrawer}
        onClose={() => setWhDrawer(false)}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={() => whForm.submit()}>Save</Button>}
      >
        <Form form={whForm} layout="vertical" onFinish={saveWh} requiredMark={false}>
          <Row gutter={16}>
            <Col span={10}>
              <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="RM-01" />
              </Form.Item>
            </Col>
            <Col span={14}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Raw Material Store" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="warehouseType" label="Type" rules={[{ required: true }]}>
            <Select options={WAREHOUSE_TYPES.map((w) => ({ value: w.value, label: w.label }))} />
          </Form.Item>
          <Form.Item name="isDefault" label="Default receiving warehouse for this plant" valuePropName="checked">
            <Switch />
          </Form.Item>
          {editingWh && (
            <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
