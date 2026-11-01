import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Input, Select, DatePicker } from 'antd';
import { 
  Layers, Search, Filter, CheckCircle2, AlertTriangle, Clock, 
  Factory, ArrowRight, ShieldCheck, RefreshCw 
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type ProductionOrder, type FormulaHeader } from '../../api/manufacturing';
import { mastersApi, type Item } from '../../api/masters';
import { StatusBadge } from '../../components/shared/StatusBadge';

export function ProcessBatchesPage() {
  const { company } = usePlantStore();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [formulas, setFormulas] = useState<FormulaHeader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  const load = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const [orderRes, formulaRes, itemRes] = await Promise.all([
        manufacturingApi.orders.list(company.id, { pageSize: 100 }),
        manufacturingApi.formulas.list(company.id, { pageSize: 100 }).catch(() => ({ data: [] })),
        mastersApi.listItems(company.id).catch(() => []),
      ]);
      setOrders(orderRes.data || []);
      setFormulas(formulaRes.data || []);
      setItems(itemRes || []);
    } catch (e) {
      console.error('Failed to load process batches:', e);
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const formulaMap = new Map(formulas.map((f) => [f.id, f]));
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // Derive batch records from production orders
  const batchRecords = orders.map((o) => {
    const f = formulaMap.get(o.formulaId);
    const item = f?.outputItemId ? itemMap.get(f.outputItemId) : undefined;
    return {
      id: o.id,
      batchNumber: `PB-${o.documentNumber.replace(/\D/g, '').slice(-6) || 'BATCH-001'}`,
      orderNumber: o.documentNumber,
      formulaName: f?.formulaName || 'Standard Formulation',
      itemName: item?.itemName || 'Finished Formulation',
      itemCode: item?.itemCode || 'FG-PROD',
      plannedQty: Number(o.plannedQty || 0),
      actualQty: o.actualQty ? Number(o.actualQty) : 0,
      uom: f?.batchSizeUom || 'KG',
      status: o.status,
      startDate: o.actualStartDate || o.plannedStartDate,
      endDate: o.actualEndDate || o.plannedEndDate || '—',
      qcStatus: o.status === 'completed' || o.status === 'closed' ? 'Passed' : o.status === 'in_progress' ? 'Testing' : 'Pending',
    };
  });

  const filtered = batchRecords.filter((b) => {
    const matchQuery = !searchQuery || 
      b.batchNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.itemName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = !statusFilter || b.status === statusFilter;
    return matchQuery && matchStatus;
  });

  const totalBatches = batchRecords.length;
  const inProgressBatches = batchRecords.filter((b) => b.status === 'in_progress').length;
  const completedBatches = batchRecords.filter((b) => b.status === 'completed' || b.status === 'closed').length;
  const pendingBatches = batchRecords.filter((b) => b.status === 'draft' || b.status === 'submitted' || b.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Manufacturing</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Process Batches</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Process Batches & Lot Traceability
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Batch processing runs, recipe execution history, and production lot quality status
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl shadow-xs text-sm font-medium transition-all cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Batches</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalBatches}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Recorded production lots
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">In Process</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {inProgressBatches}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Active shopfloor batch runs
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">QC Released</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {completedBatches}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Completed and inspection passed
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Scheduled / Staged</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {pendingBatches}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting material issue
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search batch #, order, item..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Select
              allowClear
              placeholder="All Production Statuses"
              value={statusFilter}
              onChange={setStatusFilter}
              className="w-48"
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'approved', label: 'Approved' },
                { value: 'in_progress', label: 'In Progress' },
                { value: 'completed', label: 'Completed' },
                { value: 'closed', label: 'Closed' },
              ]}
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Process Batch Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Traceable production batches with recipe parameters and status
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filtered.length} batches
            </span>
          </div>

          <Table
            dataSource={filtered}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 15, showSizeChanger: true }}
            className="dark:bg-slate-900"
            locale={{ emptyText: 'No process batches found. Create a Production Order to initiate a batch.' }}
            columns={[
              {
                title: 'Batch Number',
                dataIndex: 'batchNumber',
                key: 'batchNumber',
                render: (v: string) => (
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs">
                    {v}
                  </span>
                ),
              },
              {
                title: 'Production Order',
                dataIndex: 'orderNumber',
                key: 'orderNumber',
                render: (v: string) => (
                  <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                    {v}
                  </span>
                ),
              },
              {
                title: 'Target Product',
                dataIndex: 'itemName',
                key: 'itemName',
                render: (v: string, r: any) => (
                  <div>
                    <div className="font-medium text-slate-900 dark:text-white text-sm">{v}</div>
                    <div className="text-xs font-mono text-slate-400">{r.itemCode}</div>
                  </div>
                ),
              },
              {
                title: 'Recipe / BOM',
                dataIndex: 'formulaName',
                key: 'formulaName',
                render: (v: string) => (
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {v}
                  </span>
                ),
              },
              {
                title: 'Planned Qty',
                dataIndex: 'plannedQty',
                key: 'plannedQty',
                align: 'right' as const,
                render: (v: number, r: any) => (
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {v} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Produced Qty',
                dataIndex: 'actualQty',
                key: 'actualQty',
                align: 'right' as const,
                render: (v: number, r: any) => (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {v > 0 ? `${v} ${r.uom}` : '—'}
                  </span>
                ),
              },
              {
                title: 'QC Status',
                dataIndex: 'qcStatus',
                key: 'qcStatus',
                render: (v: string) => {
                  const color = v === 'Passed' ? 'success' : v === 'Testing' ? 'processing' : 'default';
                  return <Tag color={color} style={{ borderRadius: 8, fontWeight: 600 }}>{v}</Tag>;
                },
              },
              {
                title: 'Stage',
                dataIndex: 'status',
                key: 'status',
                render: (v: string) => <StatusBadge status={v as any} />,
              },
              {
                title: 'Start Date',
                dataIndex: 'startDate',
                key: 'startDate',
                render: (v: string) => <span className="text-xs text-slate-500 dark:text-slate-400">{v}</span>,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default ProcessBatchesPage;

