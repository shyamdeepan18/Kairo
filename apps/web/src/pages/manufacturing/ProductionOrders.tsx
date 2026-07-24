import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, DatePicker, Select, InputNumber, Typography, Descriptions, message, Tabs, Space, Popconfirm } from 'antd';
import { PlusOutlined, EyeOutlined, PlayCircleOutlined, CheckSquareOutlined, StopOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type ProductionOrder, type FormulaHeader } from '../../api/manufacturing';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { useCardStyle, STATUS_OPTIONS, apiErr, LifecycleButtons } from '../_shared/txn';

const { Title, Text } = Typography;

export function ProductionOrdersPage() {
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  
  const [rows, setRows] = useState<ProductionOrder[]>([]);
  const [formulas, setFormulas] = useState<FormulaHeader[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewing, setViewing] = useState<any | null>(null);

  const itemName = (id?: string) => items.find(i => i.id === id)?.itemName ?? '—';
  const formulaName = (id?: string) => formulas.find(f => f.id === id)?.formulaName ?? '—';
  const whName = (id?: string) => warehouses.find(w => w.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    manufacturingApi.orders.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then(r => setRows(r.data)).catch(e => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    manufacturingApi.formulas.list(company.id, { status: 'approved' }).then(r => setFormulas(r.data)).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
  }, [company?.id, plant?.id]);

  const openNew = () => { form.resetFields(); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id,
      formulaId: v.formulaId, plannedQty: v.plannedQty,
      plannedStartDate: v.plannedStartDate?.format?.('YYYY-MM-DD'),
      plannedEndDate: v.plannedEndDate?.format?.('YYYY-MM-DD'),
      warehouseId: v.warehouseId, outputWarehouseId: v.outputWarehouseId
    };
    try {
      await manufacturingApi.orders.create(body);
      message.success('Production order created.'); setDrawer(false); load();
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: ProductionOrder, a: 'submit' | 'approve' | 'reject' | 'cancel') => {
    if (!company?.id) return;
    try { await manufacturingApi.orders.act(r.id, a, company.id); message.success(`Order ${a}d.`); load(); } catch (e) { message.error(apiErr(e)); }
  };

  const actionExt = async (r: ProductionOrder, a: 'issue' | 'receive' | 'close') => {
    if (!company?.id) return;
    try {
      if (a === 'issue') await manufacturingApi.orders.issue(r.id, company.id, {});
      else if (a === 'receive') await manufacturingApi.orders.receive(r.id, company.id, {});
      else if (a === 'close') await manufacturingApi.orders.close(r.id, company.id);
      message.success(`Order ${a}d successfully.`); load(); setViewing(null);
    } catch (e) { message.error(apiErr(e)); }
  };

  const openView = async (row: ProductionOrder) => {
    if (!company?.id) return;
    try { setViewing(await manufacturingApi.orders.get(company.id, row.id)); } catch (e) { message.error(apiErr(e)); }
  };

  const formulaOpts = formulas.map(f => ({ value: f.id, label: `${f.formulaCode} — ${f.formulaName}` }));
  const whOpts = warehouses.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }));

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Production Orders</Title><Text type="secondary" style={{ fontSize: 13 }}>Schedule, issue materials, and receive finished goods.</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Order</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      
      <div style={cardStyle}>
        <Table dataSource={rows} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No production orders yet.' }}
          columns={[
            { title: 'Order No', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
            { title: 'Formula', key: 'f', render: (_, r) => formulaName(r.formulaId) },
            { title: 'Plan Qty', dataIndex: 'plannedQty', align: 'right' },
            { title: 'Status', dataIndex: 'status', render: v => <StatusBadge status={v as DocumentStatus} size="small" /> },
            { title: '', key: 'a', align: 'right', width: 280, render: (_, r) => (
              <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
                <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} onReject={() => act(r, 'reject')} onCancel={() => act(r, 'cancel')} />
              </span>
            )}
          ]} />
      </div>

      <Drawer title="New Production Order" open={drawer} onClose={() => setDrawer(false)} width={500} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="formulaId" label="Formula" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={formulaOpts} /></Form.Item>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="plannedQty" label="Planned Qty" rules={[{ required: true }]} style={{ flex: 1 }}><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <Form.Item name="plannedStartDate" label="Plan Start" rules={[{ required: true }]} style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="plannedEndDate" label="Plan End" style={{ flex: 1 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="warehouseId" label="Issue Materials From (WIP)" rules={[{ required: true }]}><Select showSearch options={whOpts} /></Form.Item>
          <Form.Item name="outputWarehouseId" label="Receive Outputs To (FG)" rules={[{ required: true }]}><Select showSearch options={whOpts} /></Form.Item>
        </Form>
      </Drawer>

      <Drawer title={viewing?.documentNumber ?? 'Production Order'} open={!!viewing} onClose={() => setViewing(null)} width={900}>
        {viewing && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
              <Descriptions column={2} size="small" styles={{ label: { width: 130 } }} style={{ flex: 1 }}>
                <Descriptions.Item label="Formula">{formulaName(viewing.formulaId)}</Descriptions.Item>
                <Descriptions.Item label="Status"><StatusBadge status={viewing.status} size="small" /></Descriptions.Item>
                <Descriptions.Item label="Planned Qty">{viewing.plannedQty}</Descriptions.Item>
                <Descriptions.Item label="Actual Qty">{viewing.actualQty ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Issue WH">{whName(viewing.warehouseId)}</Descriptions.Item>
                <Descriptions.Item label="Receive WH">{whName(viewing.outputWarehouseId)}</Descriptions.Item>
              </Descriptions>
              
              <Space direction="vertical" align="end">
                {viewing.status === 'approved' && (
                  <>
                    <Popconfirm title="Issue all planned materials?" onConfirm={() => actionExt(viewing, 'issue')}><Button type="primary" icon={<PlayCircleOutlined />}>Issue Materials</Button></Popconfirm>
                    <Popconfirm title="Receive all planned outputs?" onConfirm={() => actionExt(viewing, 'receive')}><Button type="primary" style={{ background: '#15803D' }} icon={<CheckSquareOutlined />}>Receive Outputs</Button></Popconfirm>
                    <Popconfirm title="Close production order?" onConfirm={() => actionExt(viewing, 'close')}><Button danger icon={<StopOutlined />}>Close Order</Button></Popconfirm>
                  </>
                )}
              </Space>
            </div>

            <Tabs defaultActiveKey="1" items={[
              {
                key: '1', label: 'Materials', children: (
                  <Table size="small" pagination={false} dataSource={viewing.materials ?? []} rowKey="id"
                    columns={[
                      { title: 'Item', render: (_, r: any) => itemName(r.itemId) },
                      { title: 'Plan Qty', dataIndex: 'plannedQty', align: 'right' },
                      { title: 'Issued Qty', dataIndex: 'issuedQty', align: 'right' },
                      { title: 'UOM', dataIndex: 'uom', width: 60 }
                    ]} />
                )
              },
              {
                key: '2', label: 'Outputs', children: (
                  <Table size="small" pagination={false} dataSource={viewing.outputs ?? []} rowKey="id"
                    columns={[
                      { title: 'Item', render: (_, r: any) => itemName(r.itemId) },
                      { title: 'Type', dataIndex: 'outputType' },
                      { title: 'Plan Qty', dataIndex: 'plannedQty', align: 'right' },
                      { title: 'Received', dataIndex: 'receivedQty', align: 'right' },
                    ]} />
                )
              },
              {
                key: '3', label: 'Costs', children: (
                  <Descriptions bordered size="small" column={1}>
                    <Descriptions.Item label="Total Material Cost"><AmountDisplay paise={viewing.totalMaterialCostPaise} /></Descriptions.Item>
                    <Descriptions.Item label="Total Labour Cost"><AmountDisplay paise={viewing.totalLabourCostPaise} /></Descriptions.Item>
                    <Descriptions.Item label="Total Machine Cost"><AmountDisplay paise={viewing.totalMachineCostPaise} /></Descriptions.Item>
                    <Descriptions.Item label="Total Overhead Cost"><AmountDisplay paise={viewing.totalOverheadCostPaise} /></Descriptions.Item>
                    <Descriptions.Item label="Total Cost"><AmountDisplay paise={viewing.totalCostPaise} bold /></Descriptions.Item>
                  </Descriptions>
                )
              }
            ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
