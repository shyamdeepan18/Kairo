import React, { useState, useEffect, useCallback } from 'react';
import { Table, Select, Tag, Space, message } from 'antd';
import { 
  BookOpen, ArrowUpRight, ArrowDownRight, Package, Warehouse, 
  Search, RefreshCw, Layers, ShieldCheck, Scale 
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse as WarehouseType } from '../../api/settings';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const MOVEMENT_LABELS: Record<string, { label: string; dir: 'IN' | 'OUT' }> = {
  purchase_receipt:     { label: 'Purchase Receipt', dir: 'IN' },
  production_receipt:   { label: 'Production Receipt', dir: 'IN' },
  transfer_receipt:     { label: 'Transfer Receipt', dir: 'IN' },
  return_from_customer: { label: 'Sales Return', dir: 'IN' },
  opening_balance:      { label: 'Opening Balance', dir: 'IN' },
  adjustment_in:        { label: 'Adjustment In', dir: 'IN' },
  sales_delivery:       { label: 'Sales Delivery', dir: 'OUT' },
  issue_to_production:  { label: 'Issue to Production', dir: 'OUT' },
  transfer_issue:       { label: 'Transfer Issue', dir: 'OUT' },
  adjustment_out:       { label: 'Adjustment Out', dir: 'OUT' },
  scrap_write_off:      { label: 'Scrap Write-off', dir: 'OUT' },
};

export function StockLedgerPage() {
  const { company, plant } = usePlantStore();
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemFilter, setItemFilter] = useState<string | undefined>();
  const [whFilter, setWhFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    const params: Record<string, unknown> = {};
    if (itemFilter) params.itemId = itemFilter;
    if (whFilter) params.warehouseId = whFilter;
    inventoryApi.stockLedger.list(company.id, params)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(invErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, itemFilter, whFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
  }, [company?.id, plant?.id]);

  const filtered = rows.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (r.documentNumber && r.documentNumber.toLowerCase().includes(q)) ||
      (r.itemName && r.itemName.toLowerCase().includes(q)) ||
      (r.itemCode && r.itemCode.toLowerCase().includes(q)) ||
      (r.warehouseName && r.warehouseName.toLowerCase().includes(q))
    );
  });

  const totalMovements = filtered.length;
  const inMovements = filtered.filter((r) => MOVEMENT_LABELS[r.movementType]?.dir === 'IN').length;
  const outMovements = filtered.filter((r) => MOVEMENT_LABELS[r.movementType]?.dir === 'OUT').length;
  const totalValuationPaise = filtered.reduce((acc, r) => acc + (Number(r.valuationAmountPaise) || 0), 0);

  const columns = [
    {
      title: 'Posting Date',
      dataIndex: 'postingDate',
      key: 'postingDate',
      render: (v: string) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          {v}
        </span>
      ),
    },
    {
      title: 'Document',
      dataIndex: 'documentNumber',
      key: 'documentNumber',
      render: (v: string, r: any) => (
        <div>
          <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">
            {v}
          </span>
          <div className="text-[11px] text-slate-400 dark:text-slate-500">
            {r.documentType}
          </div>
        </div>
      ),
    },
    {
      title: 'Movement Type',
      dataIndex: 'movementType',
      key: 'movementType',
      render: (v: string) => {
        const m = MOVEMENT_LABELS[v] ?? { label: v, dir: 'IN' as const };
        const isIn = m.dir === 'IN';
        return (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
            isIn 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40' 
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
          }`}>
            {isIn ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {m.label}
          </span>
        );
      },
    },
    {
      title: 'Item Details',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (v: string, r: any) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white text-sm">{v}</div>
          <div className="font-mono text-xs text-slate-400">{r.itemCode}</div>
        </div>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      render: (v: string) => (
        <span className="text-slate-700 dark:text-slate-300 text-sm font-medium flex items-center gap-1.5">
          <Warehouse className="w-3.5 h-3.5 text-slate-400" />
          {v}
        </span>
      ),
    },
    {
      title: 'Quantity',
      key: 'qty',
      align: 'right' as const,
      render: (_: any, r: any) => {
        const m = MOVEMENT_LABELS[r.movementType];
        const isIn = m?.dir === 'IN';
        const qty = parseFloat(r.quantity || 0).toFixed(2);
        return (
          <span className={`font-bold font-mono text-sm ${isIn ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {isIn ? '+' : '-'}{qty} {r.uom}
          </span>
        );
      },
    },
    {
      title: 'WAC Unit Rate (₹)',
      dataIndex: 'valuationRatePaise',
      key: 'valuationRatePaise',
      align: 'right' as const,
      render: (v: number) => (
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
          ₹{(Number(v || 0) / 100).toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Valuation (₹)',
      dataIndex: 'valuationAmountPaise',
      key: 'valuationAmountPaise',
      align: 'right' as const,
      render: (v: number) => (
        <span className="font-semibold text-slate-900 dark:text-white text-sm">
          <AmountDisplay paise={v || 0} />
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Inventory</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Stock Ledger</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Stock Ledger Audit Trail
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Append-only immutable record of all inventory movements, receipts, issues, and WAC valuations
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
            Refresh Ledger
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Movements</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <BookOpen className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalMovements}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Posted ledger transactions
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Inward Receipts</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {inMovements}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Purchases, productions & transfers in
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Outward Dispatches</span>
              <div className="p-2 bg-rose-50 dark:bg-rose-950/60 rounded-xl text-rose-600 dark:text-rose-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {outMovements}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Sales dispatches & production issues
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Valued Turnover</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Scale className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              <AmountDisplay paise={totalValuationPaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cumulative movement value
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search document, item, warehouse..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Filter by Item"
              value={itemFilter}
              onChange={setItemFilter}
              className="w-64"
              options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
            />
            <Select
              allowClear
              placeholder="Filter by Warehouse"
              value={whFilter}
              onChange={setWhFilter}
              className="w-52"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Ledger Entries
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Movement-based stock audit entries
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filtered.length} records
            </span>
          </div>

          <Table
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 25, showSizeChanger: true }}
            className="dark:bg-slate-900"
            locale={{ emptyText: 'No stock ledger entries found. Approve transactions to record movements here.' }}
          />
        </div>
      </div>
    </div>
  );
}

export default StockLedgerPage;
