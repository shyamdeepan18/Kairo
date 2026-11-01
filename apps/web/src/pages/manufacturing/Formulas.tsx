import React, { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Drawer, Form, Input, Select, InputNumber, Descriptions, message, Tabs } from 'antd';
import { Plus, Trash2, Eye, ListTree, RefreshCw, Layers, CheckCircle2, Factory, Search } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type FormulaHeader, type WorkCenter } from '../../api/manufacturing';
import { mastersApi, type Item } from '../../api/masters';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { STATUS_OPTIONS, apiErr, LifecycleButtons } from '../_shared/txn';

interface DraftInput { key: number; itemId?: string; quantity: number; uom?: string; wastagePercent: number; isOptional: boolean; description?: string; }
interface DraftOutput { key: number; itemId?: string; expectedQty: number; uom?: string; outputType: 'main' | 'by_product' | 'scrap'; allocationPercent: number; description?: string; }
interface DraftOp { key: number; operationNumber: number; name: string; workCenterId?: string; setupTimeMin: number; runTimePerUnitMin: number; description?: string; }

let s1 = 1, s2 = 1, s3 = 1;
const newIn = (): DraftInput => ({ key: s1++, quantity: 1, wastagePercent: 0, isOptional: false });
const newOut = (): DraftOutput => ({ key: s2++, expectedQty: 1, outputType: 'main', allocationPercent: 100 });
const newOp = (): DraftOp => ({ key: s3++, operationNumber: s3 * 10, name: '', setupTimeMin: 0, runTimePerUnitMin: 0 });

export function FormulasPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<FormulaHeader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState<any | null>(null);

  const [inputs, setInputs] = useState<DraftInput[]>([newIn()]);
  const [outputs, setOutputs] = useState<DraftOutput[]>([newOut()]);
  const [ops, setOps] = useState<DraftOp[]>([newOp()]);

  const itemName = (id?: string) => items.find(i => i.id === id)?.itemName ?? '—';
  const itemCode = (id?: string) => items.find(i => i.id === id)?.itemCode ?? '—';
  const wcName = (id?: string) => workCenters.find(w => w.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    manufacturingApi.formulas.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then(r => setRows(r.data))
      .catch(e => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    manufacturingApi.workCenters.list(company.id).then(r => setWorkCenters(r.data)).catch(() => {});
  }, [company?.id]);

  const openNew = () => { form.resetFields(); setInputs([newIn()]); setOutputs([newOut()]); setOps([newOp()]); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id) { message.error('Select company'); return; }
    const validIn = inputs.filter(i => i.itemId && i.quantity > 0);
    const validOut = outputs.filter(o => o.itemId && o.expectedQty > 0);
    if (!validIn.length || !validOut.length) { message.error('Requires at least one input and one output'); return; }
    
    setSaving(true);
    const body = {
      companyId: company.id, formulaCode: v.formulaCode, formulaName: v.formulaName,
      formulaType: v.formulaType ?? 'production', outputItemId: v.outputItemId,
      batchSizeQty: v.batchSizeQty, batchSizeUom: v.batchSizeUom,
      inputs: validIn.map(i => ({ itemId: i.itemId, quantity: i.quantity, uom: i.uom ?? 'NOS', wastagePercent: i.wastagePercent, isOptional: i.isOptional, description: i.description })),
      outputs: validOut.map(o => ({ itemId: o.itemId, expectedQty: o.expectedQty, uom: o.uom ?? 'NOS', outputType: o.outputType, allocationPercent: o.allocationPercent, description: o.description })),
      operations: ops.filter(o => o.name).map(o => ({ operationNumber: o.operationNumber, name: o.name, workCenterId: o.workCenterId, setupTimeMin: o.setupTimeMin, runTimePerUnitMin: o.runTimePerUnitMin, description: o.description }))
    };
    try {
      await manufacturingApi.formulas.create(body);
      message.success('Formula created.'); setDrawer(false); load();
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: FormulaHeader, a: 'submit' | 'approve' | 'reject' | 'cancel') => {
    if (!company?.id) return;
    try { await manufacturingApi.formulas.act(r.id, a, company.id); message.success(`Formula ${a}d.`); load(); } catch (e) { message.error(apiErr(e)); }
  };
  
  const openView = async (row: FormulaHeader) => {
    if (!company?.id) return;
    try { setViewing(await manufacturingApi.formulas.get(company.id, row.id)); } catch (e) { message.error(apiErr(e)); }
  };

  const filtered = rows.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const it = itemName(r.outputItemId).toLowerCase();
    return r.formulaCode.toLowerCase().includes(q) || r.formulaName.toLowerCase().includes(q) || it.includes(q);
  });

  const totalFormulas = rows.length;
  const approvedBoms = rows.filter((r) => r.status === 'approved').length;
  const draftBoms = rows.filter((r) => r.status === 'draft' || r.status === 'submitted').length;
  const uniqueSkus = new Set(rows.map((r) => r.outputItemId)).size;

  const itemOptions = items.map(i => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }));
  const wcOptions = workCenters.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }));

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <ListTree className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Manufacturing</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Bill of Materials</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Formulas & Bill of Materials (BOM)
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Recipe management, raw material inputs, expected yields, and machine routing operations
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
            New Formula
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Formulas</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <ListTree className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalFormulas}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active & draft recipe versions
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved BOMs</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedBoms}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ready for production orders
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">In Review / Draft</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {draftBoms}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pending technical approval
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Output SKUs</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {uniqueSkus}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Distinct finished products
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search code, recipe name, product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select 
              allowClear 
              placeholder="All Statuses" 
              value={statusFilter} 
              onChange={setStatusFilter} 
              className="w-48"
              options={STATUS_OPTIONS} 
            />
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl shadow-xs text-sm font-medium transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                BOM & Formulation Catalog
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Standard formulations and assembly routings
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filtered.length} formulas
            </span>
          </div>

          <Table 
            dataSource={filtered} 
            rowKey="id" 
            loading={loading} 
            pagination={{ pageSize: 20, showSizeChanger: true }} 
            className="dark:bg-slate-900"
            locale={{ emptyText: 'No BOM formulas defined yet. Click New Formula to configure a bill of materials.' }}
            columns={[
              { 
                title: 'Formula Code', 
                dataIndex: 'formulaCode', 
                render: (v: string) => (
                  <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">{v}</span>
                ) 
              },
              { 
                title: 'Formula Name', 
                dataIndex: 'formulaName',
                render: (v: string) => (
                  <span className="font-medium text-slate-900 dark:text-white">{v}</span>
                )
              },
              { 
                title: 'Type', 
                dataIndex: 'formulaType',
                render: (v: string) => (
                  <span className="capitalize text-xs text-slate-600 dark:text-slate-400">{v}</span>
                )
              },
              { 
                title: 'Main Output Product', 
                key: 'i', 
                render: (_, r) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{itemName(r.outputItemId)}</div>
                    <div className="text-xs font-mono text-slate-400">{itemCode(r.outputItemId)}</div>
                  </div>
                )
              },
              { 
                title: 'Batch Size', 
                key: 'batch', 
                render: (_, r) => (
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {r.batchSizeQty} {r.batchSizeUom}
                  </span>
                )
              },
              { 
                title: 'Status', 
                dataIndex: 'status', 
                render: v => <StatusBadge status={v as DocumentStatus} size="small" /> 
              },
              { 
                title: 'Actions', 
                key: 'a', 
                align: 'right' as const, 
                width: 260, 
                render: (_, r) => (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openView(r)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="View Details"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <LifecycleButtons 
                      status={r.status} 
                      onSubmit={() => act(r, 'submit')} 
                      onApprove={() => act(r, 'approve')} 
                      onReject={() => act(r, 'reject')} 
                      onCancel={() => act(r, 'cancel')} 
                    />
                  </div>
                )
              }
            ]} 
          />
        </div>
      </div>

      {/* Drawer: New Formula */}
      <Drawer 
        title="Create New Formula / BOM" 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} 
        width={960} 
        extra={
          <button
            type="button"
            disabled={saving}
            onClick={() => form.submit()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            {saving ? 'Creating...' : 'Create Formula'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-2">
            <Form.Item name="formulaCode" label="Formula Code" rules={[{ required: true }]}>
              <Input placeholder="e.g. BOM-PAR-500" />
            </Form.Item>
            <Form.Item name="formulaName" label="Formula Name" rules={[{ required: true }]}>
              <Input placeholder="e.g. Paracetamol 500mg Batch Recipe" />
            </Form.Item>
            <Form.Item name="formulaType" label="Type" initialValue="production">
              <Select options={[{value:'production',label:'Production'},{value:'disassembly',label:'Disassembly'},{value:'rework',label:'Rework'}]} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <Form.Item name="outputItemId" label="Main Output Product" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" placeholder="Select output item" options={itemOptions} />
            </Form.Item>
            <Form.Item name="batchSizeQty" label="Standard Batch Qty" rules={[{ required: true }]}>
              <InputNumber min={0.01} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="batchSizeUom" label="Batch UOM" rules={[{ required: true }]}>
              <Input placeholder="e.g. KG, NOS, LTR" />
            </Form.Item>
          </div>

          <Tabs defaultActiveKey="1" items={[
            {
              key: '1', 
              label: 'Inputs (Raw Materials & Packaging)', 
              children: (
                <div>
                  <Table dataSource={inputs} rowKey="key" pagination={false} size="small"
                    columns={[
                      { title: 'Item', render: (_, l) => <Select showSearch optionFilterProp="label" placeholder="Select RM..." value={l.itemId} onChange={v => setInputs(ls => ls.map(x => x.key === l.key ? {...x, itemId: v, uom: items.find(i=>i.id===v)?.primaryUom} : x))} options={itemOptions} style={{ width: '100%' }} /> },
                      { title: 'Qty', width: 100, render: (_, l) => <InputNumber min={0} value={l.quantity} onChange={v => setInputs(ls => ls.map(x => x.key === l.key ? {...x, quantity: Number(v)||0} : x))} /> },
                      { title: 'UOM', width: 90, render: (_, l) => <Input value={l.uom} onChange={e => setInputs(ls => ls.map(x => x.key === l.key ? {...x, uom: e.target.value} : x))} /> },
                      { title: 'Wastage %', width: 110, render: (_, l) => <InputNumber min={0} max={100} value={l.wastagePercent} onChange={v => setInputs(ls => ls.map(x => x.key === l.key ? {...x, wastagePercent: Number(v)||0} : x))} /> },
                      { title: '', width: 44, render: (_, l) => (
                        <button type="button" onClick={() => setInputs(ls => ls.filter(x => x.key !== l.key))} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    ]} 
                  />
                  <button type="button" onClick={() => setInputs(ls => [...ls, newIn()])} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add Raw Material
                  </button>
                </div>
              )
            },
            {
              key: '2', 
              label: 'Outputs (By-products / Scrap)', 
              children: (
                <div>
                  <Table dataSource={outputs} rowKey="key" pagination={false} size="small"
                    columns={[
                      { title: 'Item', render: (_, l) => <Select showSearch optionFilterProp="label" placeholder="Select output..." value={l.itemId} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, itemId: v, uom: items.find(i=>i.id===v)?.primaryUom} : x))} options={itemOptions} style={{ width: '100%' }} /> },
                      { title: 'Type', width: 130, render: (_, l) => <Select value={l.outputType} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, outputType: v} : x))} options={[{value:'main',label:'Main'},{value:'by_product',label:'By-Product'},{value:'scrap',label:'Scrap'}]} /> },
                      { title: 'Expected Qty', width: 120, render: (_, l) => <InputNumber min={0} value={l.expectedQty} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, expectedQty: Number(v)||0} : x))} /> },
                      { title: 'UOM', width: 90, render: (_, l) => <Input value={l.uom} onChange={e => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, uom: e.target.value} : x))} /> },
                      { title: 'Cost Alloc %', width: 120, render: (_, l) => <InputNumber min={0} max={100} value={l.allocationPercent} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, allocationPercent: Number(v)||0} : x))} /> },
                      { title: '', width: 44, render: (_, l) => (
                        <button type="button" onClick={() => setOutputs(ls => ls.filter(x => x.key !== l.key))} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    ]} 
                  />
                  <button type="button" onClick={() => setOutputs(ls => [...ls, newOut()])} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add Output
                  </button>
                </div>
              )
            },
            {
              key: '3', 
              label: 'Operations (Routing & Stations)', 
              children: (
                <div>
                  <Table dataSource={ops} rowKey="key" pagination={false} size="small"
                    columns={[
                      { title: 'Seq', width: 80, render: (_, l) => <InputNumber min={1} value={l.operationNumber} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, operationNumber: Number(v)||0} : x))} /> },
                      { title: 'Operation Name', render: (_, l) => <Input placeholder="e.g. Granulation, Blending, Packing" value={l.name} onChange={e => setOps(ls => ls.map(x => x.key === l.key ? {...x, name: e.target.value} : x))} /> },
                      { title: 'Work Centre', render: (_, l) => <Select showSearch allowClear optionFilterProp="label" placeholder="Select station..." value={l.workCenterId} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, workCenterId: v} : x))} options={wcOptions} style={{ width: '100%' }} /> },
                      { title: 'Setup Min', width: 110, render: (_, l) => <InputNumber min={0} value={l.setupTimeMin} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, setupTimeMin: Number(v)||0} : x))} /> },
                      { title: 'Run/Unit Min', width: 120, render: (_, l) => <InputNumber min={0} step={0.1} value={l.runTimePerUnitMin} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, runTimePerUnitMin: Number(v)||0} : x))} /> },
                      { title: '', width: 44, render: (_, l) => (
                        <button type="button" onClick={() => setOps(ls => ls.filter(x => x.key !== l.key))} className="text-slate-400 hover:text-rose-600 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    ]} 
                  />
                  <button type="button" onClick={() => setOps(ls => [...ls, newOp()])} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Add Routing Operation
                  </button>
                </div>
              )
            }
          ]} />
        </Form>
      </Drawer>

      {/* Drawer: View Formula Details */}
      <Drawer 
        title={viewing ? `${viewing.formulaName} (${viewing.formulaCode})` : 'Formula Details'} 
        open={!!viewing} 
        onClose={() => setViewing(null)} 
        width={800}
      >
        {viewing && (
          <div className="flex flex-col gap-6">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Formula Code">{viewing.formulaCode}</Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={viewing.status} size="small" /></Descriptions.Item>
              <Descriptions.Item label="Output Product">{itemName(viewing.outputItemId)}</Descriptions.Item>
              <Descriptions.Item label="Batch Size">{viewing.batchSizeQty} {viewing.batchSizeUom}</Descriptions.Item>
            </Descriptions>
            
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Input Materials</h4>
              <Table size="small" pagination={false} dataSource={viewing.inputs ?? []} rowKey="id"
                columns={[
                  { title: 'Item', render: (_, r: any) => itemName(r.itemId) }, 
                  { title: 'Qty', dataIndex: 'quantity', align: 'right' as const }, 
                  { title: 'UOM', dataIndex: 'uom', width: 80 }
                ]} 
              />
            </div>
              
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Output Items & Scrap</h4>
              <Table size="small" pagination={false} dataSource={viewing.outputs ?? []} rowKey="id"
                columns={[
                  { title: 'Item', render: (_, r: any) => itemName(r.itemId) }, 
                  { title: 'Type', dataIndex: 'outputType' }, 
                  { title: 'Qty', dataIndex: 'expectedQty', align: 'right' as const }, 
                  { title: 'Cost Alloc %', dataIndex: 'allocationPercent', align: 'right' as const }
                ]} 
              />
            </div>
              
            <div>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2">Operations Routing</h4>
              <Table size="small" pagination={false} dataSource={viewing.operations ?? []} rowKey="id"
                columns={[
                  { title: 'Seq', dataIndex: 'operationNumber', width: 60 }, 
                  { title: 'Name', dataIndex: 'name' }, 
                  { title: 'Work Centre', render: (_, r: any) => wcName(r.workCenterId) }, 
                  { title: 'Run Time/Unit (Min)', dataIndex: 'runTimePerUnitMin', align: 'right' as const }
                ]} 
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default FormulasPage;
