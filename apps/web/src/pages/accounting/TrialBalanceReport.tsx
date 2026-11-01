import { useState, useEffect } from 'react';
import { Table, Tag } from 'antd';
import { Scale, Download, Search, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

interface CoaAccount {
  id: string;
  code: string;
  name: string;
  accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
}

interface GeneralLedgerLine {
  id: string;
  accountCode: string;
  accountName: string;
  debitAmountPaise: number;
  creditAmountPaise: number;
}

interface TrialBalanceRow {
  key: string;
  code: string;
  name: string;
  accountType: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  netDebitPaise: number;
  netCreditPaise: number;
}

export function TrialBalanceReportPage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [search, setSearch] = useState('');

  const fetchTrialBalance = async () => {
    setLoading(true);
    try {
      const [coaRes, glRes] = await Promise.all([
        api.get<{ accounts: CoaAccount[] }>('/settings/coa'),
        api.get<GeneralLedgerLine[]>('/reports/general-ledger'),
      ]);

      const accounts = coaRes.data?.accounts || [];
      const ledger = glRes.data || [];

      // Group debits and credits by account
      const totalsMap: Record<string, { debit: number; credit: number; code: string; name: string; type: string }> = {};

      accounts.forEach((acc) => {
        totalsMap[acc.code] = {
          debit: 0,
          credit: 0,
          code: acc.code,
          name: acc.name,
          type: acc.accountType,
        };
      });

      ledger.forEach((line) => {
        if (!totalsMap[line.accountCode]) {
          totalsMap[line.accountCode] = {
            debit: 0,
            credit: 0,
            code: line.accountCode,
            name: line.accountName,
            type: 'asset',
          };
        }
        totalsMap[line.accountCode].debit += line.debitAmountPaise || 0;
        totalsMap[line.accountCode].credit += line.creditAmountPaise || 0;
      });

      const parsedRows: TrialBalanceRow[] = Object.values(totalsMap)
        .filter((acc) => acc.debit > 0 || acc.credit > 0)
        .map((acc) => {
          const diff = acc.debit - acc.credit;
          return {
            key: acc.code,
            code: acc.code,
            name: acc.name,
            accountType: acc.type,
            totalDebitPaise: acc.debit,
            totalCreditPaise: acc.credit,
            netDebitPaise: diff > 0 ? diff : 0,
            netCreditPaise: diff < 0 ? Math.abs(diff) : 0,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));

      setRows(parsedRows);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
  }, []);

  const filteredRows = rows.filter(
    (r) =>
      r.code.toLowerCase().includes(search.toLowerCase()) ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.accountType.toLowerCase().includes(search.toLowerCase())
  );

  const grandTotalDebitPaise = rows.reduce((sum, r) => sum + r.totalDebitPaise, 0);
  const grandTotalCreditPaise = rows.reduce((sum, r) => sum + r.totalCreditPaise, 0);
  const isTrialBalanceInSync = grandTotalDebitPaise === grandTotalCreditPaise;

  const handleExportCsv = () => {
    const headers = ['Account Code', 'Account Name', 'Account Type', 'Total Debit (₹)', 'Total Credit (₹)', 'Net Debit (₹)', 'Net Credit (₹)'];
    const csvLines = [headers.join(',')];

    rows.forEach((r) => {
      csvLines.push(
        [
          `"${r.code}"`,
          `"${r.name}"`,
          `"${r.accountType}"`,
          (r.totalDebitPaise / 100).toFixed(2),
          (r.totalCreditPaise / 100).toFixed(2),
          (r.netDebitPaise / 100).toFixed(2),
          (r.netCreditPaise / 100).toFixed(2),
        ].join(',')
      );
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trial_balance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          {code}
        </span>
      ),
    },
    {
      title: 'Account Name',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <span className="font-semibold text-slate-900 dark:text-white">
          {name}
        </span>
      ),
    },
    {
      title: 'Category',
      dataIndex: 'accountType',
      key: 'accountType',
      width: 130,
      render: (type: string) => (
        <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {type}
        </span>
      ),
    },
    {
      title: 'Total Debit (₹)',
      dataIndex: 'totalDebitPaise',
      key: 'totalDebitPaise',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" />,
    },
    {
      title: 'Total Credit (₹)',
      dataIndex: 'totalCreditPaise',
      key: 'totalCreditPaise',
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="credit" />,
    },
    {
      title: 'Net Debit (₹)',
      dataIndex: 'netDebitPaise',
      key: 'netDebitPaise',
      align: 'right' as const,
      width: 150,
      render: (val: number) => (val > 0 ? <AmountDisplay paise={val} variant="debit" bold /> : <span className="text-slate-300 dark:text-slate-600">—</span>),
    },
    {
      title: 'Net Credit (₹)',
      dataIndex: 'netCreditPaise',
      key: 'netCreditPaise',
      align: 'right' as const,
      width: 150,
      render: (val: number) => (val > 0 ? <AmountDisplay paise={val} variant="credit" bold /> : <span className="text-slate-300 dark:text-slate-600">—</span>),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Trial Balance</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Trial Balance Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Summary of all ledger debits and credits for double-entry verification
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Debits</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={grandTotalDebitPaise} variant="debit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative debits across all accounts</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Credits</span>
              <div className="p-2 bg-red-50 dark:bg-red-950/50 rounded-lg text-red-600 dark:text-red-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
              <AmountDisplay paise={grandTotalCreditPaise} variant="credit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative credits across all accounts</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Trial Balance Status</span>
              <div className={`p-2 rounded-lg ${isTrialBalanceInSync ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'}`}>
                {isTrialBalanceInSync ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
            </div>
            <div className={`text-2xl font-bold mt-2 ${isTrialBalanceInSync ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {isTrialBalanceInSync ? 'In Balance' : 'Out of Balance'}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isTrialBalanceInSync ? 'Debits and Credits are perfectly equal' : 'Difference detected in postings'}
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Filter by account code, name, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <Table
            rowKey="key"
            loading={loading}
            dataSource={filteredRows}
            columns={columns}
            pagination={{ pageSize: 25 }}
            summary={() => (
              <Table.Summary fixed>
                <Table.Summary.Row className="bg-slate-50 dark:bg-slate-800 font-bold">
                  <Table.Summary.Cell index={0} colSpan={3}>
                    <span className="text-slate-900 dark:text-white">Grand Total</span>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="right">
                    <AmountDisplay paise={grandTotalDebitPaise} variant="debit" bold />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="right">
                    <AmountDisplay paise={grandTotalCreditPaise} variant="credit" bold />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="right">
                    <AmountDisplay
                      paise={rows.reduce((s, r) => s + r.netDebitPaise, 0)}
                      variant="debit"
                      bold
                    />
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="right">
                    <AmountDisplay
                      paise={rows.reduce((s, r) => s + r.netCreditPaise, 0)}
                      variant="credit"
                      bold
                    />
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default TrialBalanceReportPage;
