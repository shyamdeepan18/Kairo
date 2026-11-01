import { useState, useEffect } from 'react';
import { Table, DatePicker, message } from 'antd';
import { BookOpen, Download, Search, ArrowUpRight, ArrowDownRight, Layers, FileSpreadsheet } from 'lucide-react';
import { reportsApi, type GeneralLedgerEntry } from '../../api/reports';
import dayjs from 'dayjs';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { RangePicker } = DatePicker;

export function GeneralLedgerReport() {
  const [filters, setFilters] = useState<{ startDate?: string; endDate?: string; accountId?: string }>({});
  const [entries, setEntries] = useState<GeneralLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setIsLoading(true);
    reportsApi.getGeneralLedger(filters)
      .then(setEntries)
      .catch((err) => message.error(err.message || 'Failed to fetch General Ledger'))
      .finally(() => setIsLoading(false));
  }, [filters]);

  // Calculate running balance for display
  let runningBalance = 0;
  
  const dataSource = entries?.map((entry) => {
    const debit = entry.debitAmountPaise || 0;
    const credit = entry.creditAmountPaise || 0;
    runningBalance += (debit - credit);

    return {
      ...entry,
      key: entry.id,
      runningBalance,
    };
  });

  const totalDebits = entries.reduce((acc, e) => acc + (e.debitAmountPaise || 0), 0);
  const totalCredits = entries.reduce((acc, e) => acc + (e.creditAmountPaise || 0), 0);

  const filteredData = dataSource.filter((e) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      e.accountName?.toLowerCase().includes(q) ||
      e.accountCode?.toLowerCase().includes(q) ||
      e.entryNumber?.toLowerCase().includes(q) ||
      e.narration?.toLowerCase().includes(q) ||
      e.documentNumber?.toLowerCase().includes(q)
    );
  });

  const handleExportCsv = () => {
    const headers = ['Date', 'Entry No', 'Account Code', 'Account Name', 'Narration', 'Debit (₹)', 'Credit (₹)', 'Running Balance (₹)'];
    const csvLines = [headers.join(',')];

    dataSource.forEach((e) => {
      csvLines.push(
        [
          `"${e.postingDate}"`,
          `"${e.entryNumber || e.documentNumber || ''}"`,
          `"${e.accountCode}"`,
          `"${e.accountName}"`,
          `"${(e.narration || '').replace(/"/g, '""')}"`,
          (e.debitAmountPaise / 100).toFixed(2),
          (e.creditAmountPaise / 100).toFixed(2),
          (e.runningBalance / 100).toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `general_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
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
      title: 'Entry / Doc #',
      dataIndex: 'entryNumber',
      key: 'entryNumber',
      width: 150,
      render: (val: string, r: any) => (
        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {val || r.documentNumber || '—'}
        </span>
      ),
    },
    {
      title: 'Account',
      key: 'account',
      render: (_: any, r: any) => (
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {r.accountCode}
          </span>
          <span className="font-medium text-slate-900 dark:text-white">
            {r.accountName}
          </span>
        </div>
      ),
    },
    {
      title: 'Narration',
      dataIndex: 'narration',
      key: 'narration',
      render: (val: string) => (
        <span className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
          {val || '—'}
        </span>
      ),
    },
    {
      title: 'Debit (₹)',
      dataIndex: 'debitAmountPaise',
      key: 'debit',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" bold />,
    },
    {
      title: 'Credit (₹)',
      dataIndex: 'creditAmountPaise',
      key: 'credit',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="credit" bold />,
    },
    {
      title: 'Running Balance',
      dataIndex: 'runningBalance',
      key: 'balance',
      align: 'right' as const,
      width: 150,
      render: (val: number) => {
        const absPaise = Math.abs(val);
        return (
          <span className={`font-bold ${val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            <AmountDisplay paise={absPaise} /> {val >= 0 ? 'Dr' : 'Cr'}
          </span>
        );
      },
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Reports</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">General Ledger</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              General Ledger Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Detailed chronological statement of financial postings and running balance per account
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
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Entries</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{entries.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total posted transactions</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Period Debits</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={totalDebits} variant="debit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative debited ledger balance</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Period Credits</span>
              <div className="p-2 bg-red-50 dark:bg-red-950/50 rounded-lg text-red-600 dark:text-red-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
              <AmountDisplay paise={totalCredits} variant="credit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative credited ledger balance</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by entry #, account code, account name, or narration..."
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

export default GeneralLedgerReport;
