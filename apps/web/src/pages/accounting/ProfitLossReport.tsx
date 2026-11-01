import React, { useEffect, useState } from 'react';
import { Table, DatePicker, message } from 'antd';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, DollarSign, Calendar } from 'lucide-react';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { RangePicker } = DatePicker;

interface PLRecord {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const ProfitLossReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PLRecord[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get<PLRecord[]>('/reports/profit-loss');
      setData(res.data);
    } catch (error) {
      console.error(error);
      message.error('Failed to load Profit & Loss report');
    } finally {
      setLoading(false);
    }
  };

  const revenueData = data.filter((d) => d.accountType === 'revenue');
  const expenseData = data.filter((d) => d.accountType === 'expense');

  const totalRevenue = revenueData.reduce((acc, curr) => acc + curr.balance, 0);
  const totalExpense = expenseData.reduce((acc, curr) => acc + curr.balance, 0);
  const netProfit = totalRevenue - totalExpense;

  const columns = [
    {
      title: 'Account Code',
      dataIndex: 'accountCode',
      key: 'accountCode',
      width: 150,
      render: (val: string) => (
        <span className="px-2.5 py-1 rounded-md text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          {val}
        </span>
      ),
    },
    {
      title: 'Account Name',
      dataIndex: 'accountName',
      key: 'accountName',
      render: (val: string) => (
        <span className="font-semibold text-slate-900 dark:text-white">{val}</span>
      ),
    },
    {
      title: 'Balance (₹)',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right' as const,
      width: 180,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Profit & Loss</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Profit & Loss Statement
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Operating revenues, production cost absorption, and operational expenses
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RangePicker className="rounded-xl py-1.5" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Revenue</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={totalRevenue} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total recognized sales income</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Expenses</span>
              <div className="p-2 bg-red-50 dark:bg-red-950/50 rounded-lg text-red-600 dark:text-red-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
              <AmountDisplay paise={totalExpense} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cost of goods sold + overheads</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Net Position</span>
              <div className={`p-2 rounded-lg ${netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'}`}>
                {netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            </div>
            <div className={`text-2xl font-bold mt-2 ${netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              <AmountDisplay paise={Math.abs(netProfit)} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {netProfit >= 0 ? 'Net Operating Profit' : 'Net Operating Loss'}
            </div>
          </div>
        </div>

        {/* Revenue Table Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              Revenue & Operating Income
            </h2>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Total: <AmountDisplay paise={totalRevenue} />
            </div>
          </div>
          <Table
            columns={columns}
            dataSource={revenueData}
            rowKey="accountId"
            pagination={false}
            loading={loading}
          />
        </div>

        {/* Expenses Table Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              Operating Expenses & COGS
            </h2>
            <div className="text-sm font-semibold text-red-600 dark:text-red-400">
              Total: <AmountDisplay paise={totalExpense} />
            </div>
          </div>
          <Table
            columns={columns}
            dataSource={expenseData}
            rowKey="accountId"
            pagination={false}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default ProfitLossReport;
