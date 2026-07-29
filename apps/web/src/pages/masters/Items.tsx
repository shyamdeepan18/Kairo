import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import {
  mastersApi, ITEM_TYPES, TRACKING_TYPES, itemTypeMeta,
  type Item, type ItemGroup, type Uom,
} from '../../api/masters';
import { settingsApi, type TaxCode } from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function ItemsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();
  const watchType = Form.useWatch('itemType', form);

  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback((params?: { q?: string; itemType?: string }) => {
    if (!company?.id) return;
    setLoading(true);
    mastersApi.listItems(company.id, params)
      .then(setItems)
      .catch(() => message.error('Failed to load items'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  // Reference data
  useEffect(() => {
    if (!company?.id) return;
    Promise.all([
      mastersApi.listItemGroups(company.id),
      mastersApi.listUom(company.id),
      settingsApi.listTaxCodes(company.id),
    ]).then(([g, u, t]) => { setGroups(g); setUoms(u.uom); setTaxCodes(t); }).catch(() => {});
  }, [company?.id]);

  useEffect(() => {
    const h = setTimeout(() => loadItems({ q: q || undefined, itemType: typeFilter }), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, typeFilter, company?.id]);

  const open = (row: Item | null) => {
    setEditing(row);
    form.resetFields();
    if (row) {
      form.setFieldsValue({ ...row, standardCostRupees: row.standardCostPaise ? row.standardCostPaise / 100 : 0 });
    } else {
      form.setFieldsValue({
        itemType: 'raw_material', isStockItem: true, trackingType: 'none',
        valuationMethod: 'weighted_average', standardCostRupees: 0,
        reorderLevelQty: 0, reorderQty: 0, leadTimeDays: 0, minOrderQty: 1,
      });
    }
    setDrawer(true);
  };

  const save = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    const { standardCostRupees, ...rest } = values;
    const body: any = { ...rest, standardCostPaise: Math.round((standardCostRupees ?? 0) * 100) };
    if (body.itemType === 'service') body.isStockItem = false;
    try {
      if (editing) {
        await mastersApi.updateItem(company.id, editing.id, body);
        message.success('Item updated.');
      } else {
        await mastersApi.createItem(company.id, body);
        message.success('Item created.');
      }
      setDrawer(false);
      loadItems({ q: q || undefined, itemType: typeFilter });
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };



  const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? '—';

  const columns = [
    {
      title: 'Item',
      key: 'item',
      render: (_: unknown, r: Item) => (
        <div>
          <Text strong style={{ display: 'block', fontSize: 13 }}>{r.itemName}</Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{r.itemCode}</Text>
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'itemType',
      key: 'type',
      render: (v: string) => {
        const m = itemTypeMeta(v);
        return <Tag color={m?.color} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{m?.label ?? v}</Tag>;
      },
    },
    { title: 'Group', key: 'group', render: (_: unknown, r: Item) => <Text style={{ fontSize: 12 }}>{groupName(r.itemGroupId)}</Text> },
    { title: 'UOM', dataIndex: 'primaryUom', key: 'uom', render: (v: string) => <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{v}</Text> },
    {
      title: 'Tracking',
      dataIndex: 'trackingType',
      key: 'tracking',
      render: (v: string) => v === 'none'
        ? <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        : <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v}</Tag>,
    },
    {
      title: 'Std Cost',
      dataIndex: 'standardCostPaise',
      key: 'cost',
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
      render: (_: unknown, r: Item) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} />
      ),
    },
  ];

  const uomOptions = uoms.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }));
  const isService = watchType === 'service';

  return (
    <div>
      <div className="mb-5 flex justify-between items-start">
        <div>
          <h2 className="m-0 font-bold text-lg text-slate-900 dark:text-white">Items</h2>
          <span className="text-[13px] text-slate-500 dark:text-slate-400">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Add Item</Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search by name or code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <Select
          allowClear
          placeholder="All types"
          value={typeFilter}
          onChange={setTypeFilter}
          options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
          style={{ minWidth: 180 }}
        />
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <Table
          dataSource={items}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No items yet.' }}
        />
      </div>

      <Drawer
        title={editing ? 'Edit Item' : 'Add Item'}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={560}
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
                        <Form.Item name="itemCode" label="Item Code" rules={[{ required: true, message: 'Required' }]}>
                          <Input placeholder="RM-0001" style={{ fontFamily: 'monospace' }} />
                        </Form.Item>
                      </Col>
                      <Col span={14}>
                        <Form.Item name="itemName" label="Item Name" rules={[{ required: true, message: 'Required' }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="itemType" label="Item Type" rules={[{ required: true }]}>
                          <Select options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="itemGroupId" label="Item Group">
                          <Select allowClear showSearch optionFilterProp="label"
                            options={groups.map((g) => ({ value: g.id, label: `${g.code} — ${g.name}` }))} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </>
                ),
              },
              {
                key: 'inventory',
                label: 'Inventory',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="primaryUom" label="Primary (Stock) UOM" rules={[{ required: true, message: 'Required' }]}>
                          <Select showSearch optionFilterProp="label" options={uomOptions} placeholder="Select UOM" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="secondaryUom" label="Secondary UOM">
                          <Select allowClear showSearch optionFilterProp="label" options={uomOptions} placeholder="Optional" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item name="conversionFactor" label="Conversion Factor" extra="1 secondary UOM = N primary UOM units">
                      <InputNumber min={0} step={0.0001} style={{ width: 220 }} />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="isStockItem" label="Maintain Stock" valuePropName="checked" extra={isService ? 'Services are non-stock' : undefined}>
                          <Switch disabled={isService} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="trackingType" label="Tracking">
                          <Select options={TRACKING_TYPES} disabled={isService} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}><Form.Item name="reorderLevelQty" label="Reorder Level"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={8}><Form.Item name="reorderQty" label="Reorder Qty"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={8}><Form.Item name="leadTimeDays" label="Lead Time (days)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <Form.Item name="minOrderQty" label="Minimum Order Qty"><InputNumber min={0} style={{ width: 220 }} /></Form.Item>
                  </>
                ),
              },
              {
                key: 'costing',
                label: 'Costing & Tax',
                children: (
                  <>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="valuationMethod" label="Valuation Method">
                          <Select options={[
                            { value: 'weighted_average', label: 'Weighted Average' },
                            { value: 'fifo', label: 'FIFO' },
                          ]} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="standardCostRupees" label="Standard Cost (₹ per unit)">
                          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="hsnSacCode" label="HSN / SAC Code">
                          <Input placeholder="e.g. 7208" style={{ fontFamily: 'monospace' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="defaultTaxCodeId" label="Default Tax Code">
                          <Select allowClear showSearch optionFilterProp="label"
                            options={taxCodes.map((t) => ({ value: t.id, label: `${t.code} (${(t.gstRateBp / 100)}%)` }))} />
                        </Form.Item>
                      </Col>
                    </Row>
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
