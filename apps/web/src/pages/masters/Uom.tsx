import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, Input, Select, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { Scale, Plus, Layers, ArrowRightLeft, Boxes } from 'lucide-react';
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
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [activeTab, setActiveTab] = useState('units');
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

  const weightUnits = uoms.filter((u) => u.type === 'weight').length;
  const volumeUnits = uoms.filter((u) => u.type === 'volume').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-900/40 rounded-xl shadow-xs">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Masters</span>
              <span>/</span>
              <span className="text-cyan-600 dark:text-cyan-400 font-medium">Units of Measure</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Units of Measure & Conversions
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Standard base units, dual-UOM catch weights, and precision conversion factors
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'units' ? (
            <button
              onClick={() => { uomForm.resetFields(); setUomDrawer(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              <Plus className="w-4 h-4" /> Add Unit
            </button>
          ) : (
            <button
              onClick={() => { convForm.resetFields(); setConvDrawer(true); }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              <Plus className="w-4 h-4" /> Add Conversion
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Defined Units</span>
              <div className="p-2 bg-cyan-50 dark:bg-cyan-950/50 rounded-lg text-cyan-600 dark:text-cyan-400">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{uoms.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Available measurement units</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Weight & Mass</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{weightUnits}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">KG, GM, MT, Quintal</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Volume & Liquid</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{volumeUnits}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">LTR, ML, Gallon</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Conversion Factors</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/50 rounded-lg text-purple-600 dark:text-purple-400">
                <ArrowRightLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">{conversions.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Configured unit multipliers</div>
          </div>
        </div>

        {/* View Mode Tabs Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-xs flex items-center justify-between transition-colors">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('units')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'units'
                  ? 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/60 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Units of Measure ({uoms.length})
            </button>
            <button
              onClick={() => setActiveTab('conversions')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'conversions'
                  ? 'bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800/60 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Unit Conversions ({conversions.length})
            </button>
          </div>
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {activeTab === 'units' ? 'Measurement Units Registry' : 'Unit Conversion Registry'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {activeTab === 'units' ? 'All standard and discrete measurement units' : 'Dimensional conversion rules and item-specific catch weight ratios'}
              </p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {activeTab === 'units' ? uoms.length : conversions.length} Records
            </span>
          </div>
          {activeTab === 'units' ? (
            <Table
              dataSource={uoms}
              columns={uomColumns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 25, hideOnSinglePage: true }}
              locale={{ emptyText: 'No units yet.' }}
            />
          ) : (
            <Table
              dataSource={conversions}
              columns={convColumns}
              rowKey="id"
              loading={loading}
              pagination={{ pageSize: 25, hideOnSinglePage: true }}
              locale={{ emptyText: 'No conversions defined.' }}
            />
          )}
        </div>
      </div>

      {/* Unit drawer */}
      <Drawer
        title="Add Unit of Measure"
        open={uomDrawer}
        onClose={async () => { if (await confirmClose(uomForm)) { uomForm.resetFields(); setUomDrawer(false); } }}
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
        onClose={async () => { if (await confirmClose(convForm)) { convForm.resetFields(); setConvDrawer(false); } }}
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
