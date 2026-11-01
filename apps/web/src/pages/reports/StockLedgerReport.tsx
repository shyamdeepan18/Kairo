import { useState, useEffect } from 'react';
import { Table, DatePicker, message } from 'antd';
import { Package, Download, Search, ArrowUpRight, ArrowDownRight, Layers, DollarSign } from 'lucide-react';
import { reportsApi, type StockLedgerEntry } from '../../api/reports';
import dayjs from 'dayjs';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { RangePicker } = DatePicker;

export function StockLedgerReport() {
  const [filters, setFilters] = useState<{ startDate?: string; endDate?: string; itemId?: string; warehouseId?: string }>({});
  const [entries, setEntries] = useState<StockLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setIsLoading(true);
    reportsApi.getStockLedger(filters)
      .then(setEntries)
      .catch((err) => message.error(err.message || 'Failed to fetch Stock Ledger'))
      .finally(() => setIsLoading(false));
  }, [filters]);

  let runningQty = 0;
  let runningValue = 0;
  
  const dataSource = entries?.map((entry) => {
    const qty = parseFloat(entry.quantityInPrimaryUom);
    const isOut = entry.movementType.toLowerCase().includes('out') || 
                  entry.movementType.toLowerCase().includes('issue') ||
                  entry.movementType.toLowerCase().includes('delivery');
    
    const signedQty = isOut ? -qty : qty;
    const signedValue = isOut ? -entry.valuationAmountPaise : entry.valuationAmountPaise;

    runningQty += signedQty;
    runningValue += signedValue;

    return {
      ...entry,
      key: entry.id,
      signedQty,
      runningQty,
      runningValue,
    };
  });

  const totalMovements = entries.length;
  const currentRunningQty = dataSource.length > 0 ? dataSource[dataSource.length - 1].runningQty : 0;
  const currentRunningVal = dataSource.length > 0 ? dataSource[dataSource.length - 1].runningValue : 0;

  const filteredData = dataSource.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.itemName?.toLowerCase().includes(q) ||
      e.itemCode?.toLowerCase().includes(q) ||
      e.warehouseName?.toLowerCase().includes(q) ||
      e.documentNumber?.toLowerCase().includes(q) ||
      e.movementType?.toLowerCase().includes(q)
    );
  });

  const handleExportCsv = () => {
    const headers = ['Posting Date', 'Item Code', 'Item Name', 'Warehouse', 'Movement Type', 'Document #', 'Qty Change', 'Balance Qty', 'Rate (₹)', 'Balance Value (₹)'];
    const csvLines = [headers.join(',')];

    dataSource.forEach((e) => {
      csvLines.push(
        [
          `"${e.postingDate}"`,
          `"${e.itemCode}"`,
          `"${e.itemName}"`,
          `"${e.warehouseName}"`,
          `"${e.movementType}"`,
          `"${e.documentNumber || ''}"`,
          e.signedQty.toFixed(2),
          e.runningQty.toFixed(2),
          (e.valuationRatePaise / 100).toFixed(2),
          (e.runningValue / 100).toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const columns = [
    {
      title: 'Posting Date',
      dataIndex: 'postingDate',
      key: 'postingDate',
      width: 130,
      render: (val: string) => (
        <span className="text-slate-600 dark:text-slate-300 font-medium">
          {dayjs(val).format('DD MMM YYYY')}
        </span>
      ),
    },
    {
      title: 'Item',
      key: 'item',
      render: (_: any, r: any) => (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {r.itemCode}
          </span>
          <span className="font-medium text-slate-900 dark:text-white">
            {r.itemName}
          </span>
        </div>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 140,
    },
    {
      title: 'Movement & Doc',
      key: 'doc',
      render: (_: any, r: any) => (
        <div>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            {r.movementType}
          </span>
          <div className="font-mono text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {r.documentNumber || '—'}
          </div>
        </div>
      ),
    },
    {
      title: 'Qty Delta',
      dataIndex: 'signedQty',
      key: 'signedQty',
      align: 'right' as const,
      width: 120,
      render: (val: number) => (
        <span className={`font-semibold ${val < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {val > 0 ? '+' : ''}{val.toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Balance Qty',
      dataIndex: 'runningQty',
      key: 'runningQty',
      align: 'right' as const,
      width: 120,
      render: (val: number) => <span className="font-bold text-slate-900 dark:text-white">{val.toFixed(2)}</span>,
    },
    {
      title: 'WAC Unit Rate (₹)',
      dataIndex: 'valuationRatePaise',
      key: 'rate',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} />,
    },
    {
      title: 'Balance Value (₹)',
      dataIndex: 'runningValue',
      key: 'runningValue',
      align: 'right' as const,
      width: 150,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Reports</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Stock Ledger</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Stock Ledger Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Movement-based audit trail, WAC unit cost valuation, and running inventory balance
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <RangePicker
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setFilters({ ...filters, startDate: dates[0].format('YYYY-MM-DD'), endDate: dates[1].format('YYYY-MM-DD') });
              } else {
                setFilters({ ...filters, startDate: undefined, endDate: undefined });
              }
            }}
            className="rounded-xl py-1.5"
          />
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl shadow-xs text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Stock Movements</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{totalMovements}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Immutable stock ledger transactions</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Running Balance Qty</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              {currentRunningQty.toFixed(2)}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Current cumulative physical quantity</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Running Stock Value</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              <AmountDisplay paise={currentRunningVal} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Valuation under Moving WAC</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by item code, item name, warehouse, or document #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <Table
            dataSource={filteredData}
            columns={columns}
            loading={isLoading}
            pagination={{ pageSize: 25 }}
          />
        </div>
      </div>
    </div>
  );
}

export default StockLedgerReport;
