import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Button, Drawer, Form, DatePicker, Select, InputNumber, Typography, Descriptions, message, Tabs, Space, Popconfirm, Tag } from 'antd';
import { 
  Factory, Plus, Eye, PlayCircle, CheckSquare, StopCircle, Search, FileText, 
  Calendar, ClipboardList, Clock, ShieldCheck, DollarSign, Layers, CheckCircle2, Send 
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type ProductionOrder, type FormulaHeader, type WorkCenter } from '../../api/manufacturing';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { STATUS_OPTIONS, apiErr, LifecycleButtons } from '../_shared/txn';

const { Title, Text } = Typography;

export function ProductionOrdersPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();
  
  const [rows, setRows] = useState<ProductionOrder[]>([]);
  const [formulas, setFormulas] = useState<FormulaHeader[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewing, setViewing] = useState<any | null>(null);

  const itemName = (id?: string) => items.find(i => i.id === id)?.itemName ?? '—';
  const formulaName = (id?: string) => formulas.find(f => f.id === id)?.formulaName ?? '—';
  const whName = (id?: string) => warehouses.find(w => w.id === id)?.name ?? '—';
  const wcName = (id?: string) => workCenters.find(w => w.id === id)?.name ?? '—';

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
    manufacturingApi.workCenters.list(company.id).then(r => setWorkCenters(r.data)).catch(() => {});
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

  const completeOp = async (orderId: string, seq: number, actualMins: number) => {
    if (!company?.id) return;
    try {
      await manufacturingApi.orders.completeOperation(orderId, seq, company.id, { actualMins });
      message.success(`Stage ${seq} completed and labor/overhead capitalized into WIP GL.`);
      const updated = await manufacturingApi.orders.get(company.id, orderId);
      setViewing(updated);
      load();
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (row: ProductionOrder) => {
    if (!company?.id) return;
    try { setViewing(await manufacturingApi.orders.get(company.id, row.id)); } catch (e) { message.error(apiErr(e)); }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      formulaName(r.formulaId).toLowerCase().includes(q)
    );
  }, [rows, searchQuery, formulas]);

  const totalOrders = rows.length;
  const inProgressOrders = rows.filter((r) => r.status === 'approved' || (r as any).status === 'in_progress').length;
  const pendingApprovalOrders = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const closedOrders = rows.filter((r) => r.status === 'closed' || (r as any).status === 'completed').length;

  const formulaOpts = formulas.map(f => ({ value: f.id, label: `${f.formulaCode} — ${f.formulaName}` }));
  const whOpts = warehouses.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }));

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Manufacturing</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Work Orders</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Production Orders (Work Orders)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Schedule shopfloor runs, issue raw materials, execute routing stages, and capitalize WIP into finished goods
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Order
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Work Orders</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Production jobs scheduled
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">In Progress / Active</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <PlayCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {inProgressOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active shopfloor execution
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Approvals</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingApprovalOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting supervisor release
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Closed / Completed</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {closedOrders}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              FG received & WIP cleared
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search Order number or formula..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>
          <Select 
            allowClear 
            placeholder="All Statuses" 
            value={statusFilter} 
            onChange={setStatusFilter} 
            className="w-44" 
            options={STATUS_OPTIONS} 
          />
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Production Order Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Formula BOM conversion, routing sequences, and WIP GL capitalization
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} work orders
            </span>
          </div>

          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
              <tr>
                <th className="px-6 py-4 font-bold">Order No</th>
                <th className="px-6 py-4 font-bold">Formula / BOM</th>
                <th className="px-6 py-4 font-bold text-right">Plan Qty</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
              {filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 transition-colors">{r.documentNumber}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                      <span className="text-slate-800 dark:text-slate-200 font-medium transition-colors">{formulaName(r.formulaId)}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white transition-colors">
                    {r.plannedQty}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <StatusBadge status={r.status as DocumentStatus} size="small" />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-3">
                      <button onClick={() => openView(r)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer" title="View details">
                        <Eye className="w-4 h-4" />
                      </button>
                      
                      {r.status === 'draft' && (
                        <button onClick={() => act(r, 'submit')} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors cursor-pointer">
                          <Send className="w-3.5 h-3.5 mr-1" /> Submit
                        </button>
                      )}

                      {r.status === 'submitted' && (
                        <button onClick={() => act(r, 'approve')} className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors cursor-pointer">
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                        </button>
                      )}

                      {r.status === 'approved' && (
                        <button onClick={() => openView(r)} className="flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-bold transition-colors cursor-pointer">
                          <PlayCircle className="w-3.5 h-3.5 mr-1" /> Execute
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 transition-colors">
                    <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    No production orders found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Drawer title="New Production Order" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={500} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
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
                    <Popconfirm title="Issue all planned materials?" onConfirm={() => actionExt(viewing, 'issue')}><Button type="primary" icon={<PlayCircle className="w-4 h-4 inline-block" />}>Issue Materials</Button></Popconfirm>
                    <Popconfirm title="Receive all planned outputs?" onConfirm={() => actionExt(viewing, 'receive')}><Button type="primary" style={{ background: '#15803D' }} icon={<CheckSquare className="w-4 h-4 inline-block" />}>Receive Outputs</Button></Popconfirm>
                    <Popconfirm title="Close production order?" onConfirm={() => actionExt(viewing, 'close')}><Button danger icon={<StopCircle className="w-4 h-4 inline-block" />}>Close Order</Button></Popconfirm>
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
              },
              {
                key: '4', label: `Routing & Stages (${viewing.operations?.length ?? 0})`, children: (
                  <div>
                    <div style={{ marginBottom: 12, fontSize: 12, color: '#64748b' }}>
                      Shopfloor operations execution. Completing each stage absorbs actual machine and direct labor costs into WIP GL.
                    </div>
                    <Table size="small" pagination={false} dataSource={viewing.operations ?? []} rowKey="id"
                      columns={[
                        { title: 'Seq', dataIndex: 'sequence', width: 60, align: 'center' },
                        { title: 'Operation / Stage', dataIndex: 'operationName', render: (v: string) => <Text strong>{v}</Text> },
                        { title: 'Work Center', dataIndex: 'workCenterId', render: (id: string) => wcName(id) },
                        { title: 'Plan (min)', dataIndex: 'plannedMins', align: 'right' },
                        { title: 'Actual (min)', dataIndex: 'actualMins', align: 'right' },
                        { title: 'Labor Absorbed', dataIndex: 'actualLabourPaise', align: 'right', render: (v: number) => <AmountDisplay paise={v || 0} /> },
                        { title: 'Overhead Absorbed', dataIndex: 'actualOverheadPaise', align: 'right', render: (v: number) => <AmountDisplay paise={v || 0} /> },
                        {
                          title: 'Status',
                          dataIndex: 'status',
                          width: 110,
                          render: (st: string) => (
                            <Tag color={st === 'completed' ? 'green' : st === 'in_progress' ? 'blue' : 'default'}>
                              {(st || 'pending').toUpperCase()}
                            </Tag>
                          )
                        },
                        {
                          title: '',
                          key: 'act',
                          align: 'right',
                          width: 140,
                          render: (_, op: any) => {
                            if (op.status === 'completed') {
                              return <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 600 }}>✓ Done</span>;
                            }
                            if (viewing.status !== 'approved') {
                              return <span style={{ color: '#94a3b8', fontSize: 12 }}>Order not approved</span>;
                            }
                            return (
                              <Popconfirm
                                title={`Complete Step ${op.sequence}: ${op.operationName}`}
                                description={
                                  <div style={{ marginTop: 8 }}>
                                    <div style={{ fontSize: 12, marginBottom: 4 }}>Actual Run Minutes:</div>
                                    <InputNumber
                                      id={`op-mins-${op.sequence}`}
                                      defaultValue={Number(op.plannedMins) || 30}
                                      min={1}
                                      style={{ width: '100%' }}
                                    />
                                  </div>
                                }
                                onConfirm={() => {
                                  const el = document.getElementById(`op-mins-${op.sequence}`) as HTMLInputElement;
                                  const mins = el ? Number(el.value) || 30 : 30;
                                  completeOp(viewing.id, op.sequence, mins);
                                }}
                                okText="Complete & Absorb"
                                cancelText="Cancel"
                              >
                                <Button size="small" type="primary">
                                  Complete Stage
                                </Button>
                              </Popconfirm>
                            );
                          }
                        }
                      ]} />
                  </div>
                )
              }
            ]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
