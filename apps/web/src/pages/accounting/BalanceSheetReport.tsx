import React, { useEffect, useState } from 'react';
import { Table, DatePicker, message } from 'antd';
import { Landmark, CheckCircle2, AlertTriangle, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

interface BSRecord {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

const BalanceSheetReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BSRecord[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get<BSRecord[]>('/reports/balance-sheet');
      setData(res.data);
    } catch (error) {
      console.error(error);
      message.error('Failed to load Balance Sheet');
    } finally {
      setLoading(false);
    }
  };

  const assetData = data.filter((d) => d.accountType === 'asset');
  const liabilityData = data.filter((d) => d.accountType === 'liability');
  const equityData = data.filter((d) => d.accountType === 'equity');

  const totalAssets = assetData.reduce((acc, curr) => acc + curr.balance, 0);
  const totalLiabilities = liabilityData.reduce((acc, curr) => acc + curr.balance, 0);
  const totalEquity = equityData.reduce((acc, curr) => acc + curr.balance, 0);

  const liabilitiesAndEquity = totalLiabilities + totalEquity;
  const isEquationBalanced = Math.abs(totalAssets - liabilitiesAndEquity) < 100;

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
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Balance Sheet</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Balance Sheet Statement
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Assets, Liabilities, and Equity financial standing as of posting date
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DatePicker className="rounded-xl py-1.5" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* KPI Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Assets</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={totalAssets} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Current & non-current enterprise assets</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Liabilities & Equity</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
              <AmountDisplay paise={liabilitiesAndEquity} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total claims against company assets</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Accounting Equation</span>
              <div className={`p-2 rounded-lg ${isEquationBalanced ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400'}`}>
                {isEquationBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              </div>
            </div>
            <div className={`text-2xl font-bold mt-2 ${isEquationBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {isEquationBalanced ? 'Balanced' : 'Discrepancy'}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isEquationBalanced ? 'Assets = Liabilities + Equity invariant holds' : 'Variance between assets and liabilities'}
            </div>
          </div>
        </div>

        {/* Assets Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              Assets
            </h2>
            <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Total: <AmountDisplay paise={totalAssets} />
            </div>
          </div>
          <Table
            columns={columns}
            dataSource={assetData}
            rowKey="accountId"
            pagination={false}
            loading={loading}
          />
        </div>

        {/* Liabilities Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              Liabilities
            </h2>
            <div className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              Total: <AmountDisplay paise={totalLiabilities} />
            </div>
          </div>
          <Table
            columns={columns}
            dataSource={liabilityData}
            rowKey="accountId"
            pagination={false}
            loading={loading}
          />
        </div>

        {/* Equity Section */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              Equity & Retained Earnings
            </h2>
            <div className="text-sm font-semibold text-purple-600 dark:text-purple-400">
              Total: <AmountDisplay paise={totalEquity} />
            </div>
          </div>
          <Table
            columns={columns}
            dataSource={equityData}
            rowKey="accountId"
            pagination={false}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default BalanceSheetReport;
