import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  InputNumber, message, Tabs, Row, Col, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { Package, Plus, Search, Layers, CheckCircle2, Boxes, Factory } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('general');

  const FIELD_META: Record<string, { label: string; tabKey: string; tabLabel: string }> = {
    itemCode: { label: 'Item Code', tabKey: 'general', tabLabel: 'General' },
    itemName: { label: 'Item Name', tabKey: 'general', tabLabel: 'General' },
    description: { label: 'Description', tabKey: 'general', tabLabel: 'General' },
    itemType: { label: 'Item Type', tabKey: 'general', tabLabel: 'General' },
    itemGroupId: { label: 'Item Group', tabKey: 'general', tabLabel: 'General' },
    barcode: { label: 'Barcode / EAN', tabKey: 'general', tabLabel: 'General' },
    primaryUom: { label: 'Primary (Stock) UOM', tabKey: 'inventory', tabLabel: 'Inventory' },
    secondaryUom: { label: 'Secondary UOM', tabKey: 'inventory', tabLabel: 'Inventory' },
    conversionFactor: { label: 'Conversion Factor', tabKey: 'inventory', tabLabel: 'Inventory' },
    isStockItem: { label: 'Maintain Stock', tabKey: 'inventory', tabLabel: 'Inventory' },
    trackingType: { label: 'Tracking', tabKey: 'inventory', tabLabel: 'Inventory' },
    shelfLifeDays: { label: 'Shelf Life (Days)', tabKey: 'inventory', tabLabel: 'Inventory' },
    grossWeight: { label: 'Gross Weight', tabKey: 'inventory', tabLabel: 'Inventory' },
    weightUom: { label: 'Weight UOM', tabKey: 'inventory', tabLabel: 'Inventory' },
    isQcRequired: { label: 'QC Required', tabKey: 'inventory', tabLabel: 'Inventory' },
    reorderLevelQty: { label: 'Reorder Level', tabKey: 'inventory', tabLabel: 'Inventory' },
    reorderQty: { label: 'Reorder Qty', tabKey: 'inventory', tabLabel: 'Inventory' },
    safetyStockQty: { label: 'Safety Stock', tabKey: 'inventory', tabLabel: 'Inventory' },
    maxStockLevel: { label: 'Max Stock Level', tabKey: 'inventory', tabLabel: 'Inventory' },
    leadTimeDays: { label: 'Lead Time', tabKey: 'inventory', tabLabel: 'Inventory' },
    minOrderQty: { label: 'Minimum Order Qty', tabKey: 'inventory', tabLabel: 'Inventory' },
    valuationMethod: { label: 'Valuation Method', tabKey: 'costing', tabLabel: 'Costing & Tax' },
    standardCostRupees: { label: 'Standard Cost', tabKey: 'costing', tabLabel: 'Costing & Tax' },
    sellingPriceRupees: { label: 'Selling Price', tabKey: 'costing', tabLabel: 'Costing & Tax' },
    minSellingPriceRupees: { label: 'Min Selling Price', tabKey: 'costing', tabLabel: 'Costing & Tax' },
    purchaseRateRupees: { label: 'Purchase Rate', tabKey: 'costing', tabLabel: 'Costing & Tax' },
    hsnSacCode: { label: 'HSN / SAC Code', tabKey: 'costing', tabLabel: 'Costing & Tax' },
    defaultTaxCodeId: { label: 'Default Tax Code', tabKey: 'costing', tabLabel: 'Costing & Tax' },
  };

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
    setActiveTab('general');
    form.resetFields();
    if (row) {
      form.setFieldsValue({
        ...row,
        standardCostRupees: row.standardCostPaise ? row.standardCostPaise / 100 : 0,
        sellingPriceRupees: row.sellingPricePaise ? row.sellingPricePaise / 100 : 0,
        minSellingPriceRupees: row.minSellingPricePaise ? row.minSellingPricePaise / 100 : 0,
        purchaseRateRupees: row.purchaseRatePaise ? row.purchaseRatePaise / 100 : 0,
      });
    } else {
      form.setFieldsValue({
        itemType: 'raw_material', isStockItem: true, trackingType: 'none',
        valuationMethod: 'weighted_average', standardCostRupees: 0,
        sellingPriceRupees: 0, minSellingPriceRupees: 0, purchaseRateRupees: 0,
        shelfLifeDays: 0, safetyStockQty: 0, maxStockLevel: 0,
        reorderLevelQty: 0, reorderQty: 0, leadTimeDays: 0, minOrderQty: 1,
        isQcRequired: false,
      });
    }
    setDrawer(true);
  };

  const handleFinishFailed = (errorInfo: any) => {
    if (errorInfo?.errorFields?.length > 0) {
      const firstError = errorInfo.errorFields[0];
      const fieldName = String(firstError.name[0]);
      const meta = FIELD_META[fieldName];
      if (meta) {
        setActiveTab(meta.tabKey);
        message.error(`Please fill required field '${meta.label}' in the [${meta.tabLabel}] tab.`);
      } else {
        message.error(`Please fill required fields: ${firstError.errors.join(', ')}`);
      }
    }
  };

  const save = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    const { standardCostRupees, sellingPriceRupees, minSellingPriceRupees, purchaseRateRupees, ...rest } = values;
    const body: any = {
      ...rest,
      standardCostPaise: Math.round((standardCostRupees ?? 0) * 100),
      sellingPricePaise: Math.round((sellingPriceRupees ?? 0) * 100),
      minSellingPricePaise: Math.round((minSellingPriceRupees ?? 0) * 100),
      purchaseRatePaise: Math.round((purchaseRateRupees ?? 0) * 100),
    };
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
      const data = e?.response?.data;
      if (data?.issues && data.issues.length > 0) {
        const firstIssueField = String(data.issues[0]?.path?.[0]);
        const meta = FIELD_META[firstIssueField];
        if (meta) {
          setActiveTab(meta.tabKey);
        }
        const msg = data.issues.map((i: any) => {
          const field = i.path[0];
          const itemMeta = FIELD_META[field];
          const tabPrefix = itemMeta ? `[${itemMeta.tabLabel} tab] ` : '';
          return `${tabPrefix}${itemMeta?.label || i.path.join('.')}: ${i.message}`.trim();
        }).join(', ');
        message.error(`Validation failed: ${msg}`, 5);
      } else {
        message.error(data?.error ?? 'Save failed');
      }
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
      title: 'Last Purch (LPP)',
      dataIndex: 'purchaseRatePaise',
      key: 'purchaseRate',
      align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ fontSize: 12, fontWeight: 500 }}>₹{rupees(v)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Std Cost',
      dataIndex: 'standardCostPaise',
      key: 'cost',
      align: 'right' as const,
      render: (v: number) => v > 0 ? <Text style={{ fontSize: 12 }}>₹{rupees(v)}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: 'Min Floor',
      dataIndex: 'minSellingPricePaise',
      key: 'minFloor',
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

  const activeCount = items.filter(i => i.isActive).length;
  const rawCount = items.filter(i => i.itemType === 'raw_material').length;
  const fgCount = items.filter(i => i.itemType === 'finished_good').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 rounded-xl shadow-xs">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Masters</span>
              <span>/</span>
              <span className="text-teal-600 dark:text-teal-400 font-medium">Item Catalog</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Item & SKU Master
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage raw materials, work-in-progress, finished products, and service items with dual-UOM controls
            </p>
          </div>
        </div>
        <button
          onClick={() => open(null)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Catalog Items</span>
              <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-lg text-teal-600 dark:text-teal-400">
                <Package className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{items.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Configured items & parts</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active SKUs</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{activeCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Eligible for transaction posting</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Raw Materials</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <Boxes className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{rawCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Procurement inputs</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Finished Goods</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/50 rounded-lg text-amber-600 dark:text-amber-400">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{fgCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Manufactured & commercial sale</div>
          </div>
        </div>

        {/* Floating Filter Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by item name, SKU code, or barcode..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select
              allowClear
              placeholder="All Item Types"
              value={typeFilter}
              onChange={setTypeFilter}
              options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              style={{ minWidth: 180 }}
            />
          </div>
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Item Catalog Registry</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">All master SKUs and pricing definitions</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {items.length} Records
            </span>
          </div>
          <Table
            dataSource={items}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: 'No items yet.' }}
          />
        </div>
      </div>

      <Drawer
        title={editing ? 'Edit Item' : 'Add Item'}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={560}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} onFinishFailed={handleFinishFailed} requiredMark={false}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
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
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="barcode" label="Barcode / EAN / UPC">
                          <Input placeholder="e.g. 8901234567890" style={{ fontFamily: 'monospace' }} />
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
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="conversionFactor" label="Conversion Factor" extra="1 secondary UOM = N primary UOM units">
                          <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="shelfLifeDays" label="Shelf Life (Days)" extra="Auto-calculates batch expiry date on receipt">
                          <InputNumber min={0} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="grossWeight" label="Gross Weight per Unit">
                          <InputNumber min={0} step={0.001} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="weightUom" label="Weight UOM">
                          <Select allowClear showSearch optionFilterProp="label" options={uomOptions} placeholder="e.g. KG, G" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <Form.Item name="isStockItem" label="Maintain Stock" valuePropName="checked" extra={isService ? 'Services are non-stock' : undefined}>
                          <Switch disabled={isService} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="trackingType" label="Tracking">
                          <Select options={TRACKING_TYPES} disabled={isService} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="isQcRequired" label="QC Required" valuePropName="checked" extra="Mandates inspection before stock release">
                          <Switch disabled={isService} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16} className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 mb-4">
                      <Col span={8}>
                        <Form.Item name="isCatchWeight" label="Catch-Weight Dual UOM" valuePropName="checked" extra="For items where weight varies per piece">
                          <Switch disabled={isService} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="secondaryUom" label="Secondary UOM (Weight / Measure)">
                          <Select allowClear showSearch optionFilterProp="label" options={uomOptions} placeholder="e.g. KG, MT, LTR" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item name="catchWeightTolerancePct" label="Weight Tolerance (±%)" extra="Max allowed deviation from nominal">
                          <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={6}><Form.Item name="safetyStockQty" label="Safety Stock"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={6}><Form.Item name="reorderLevelQty" label="Reorder Level"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={6}><Form.Item name="reorderQty" label="Reorder Qty"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={6}><Form.Item name="maxStockLevel" label="Max Stock Level"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}><Form.Item name="leadTimeDays" label="Lead Time (days)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                      <Col span={12}><Form.Item name="minOrderQty" label="Minimum Order Qty"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
                    </Row>
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
                        <Form.Item name="sellingPriceRupees" label="Selling Price (₹)" extra="Default rate populated on SO / Quotation">
                          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="minSellingPriceRupees" label="Min Selling Price Floor (₹)" extra="Minimum allowable price after discounts">
                          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="purchaseRateRupees" label="Standard Purchase Rate (₹)" extra="Default rate populated on PO / Requisition">
                          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="standardCostRupees" label="Standard Cost (₹ per unit)" extra="Used for manufacturing cost roll-up & variance">
                          <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
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
                        <Form.Item name="defaultTaxCodeId" label="Default Tax Code">
                          <Select allowClear showSearch optionFilterProp="label"
                            options={taxCodes.map((t) => ({ value: t.id, label: `${t.code} (${(t.gstRateBp / 100)}%)` }))} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Form.Item name="hsnSacCode" label="HSN / SAC Code">
                          <Input placeholder="e.g. 7208" style={{ fontFamily: 'monospace' }} />
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
