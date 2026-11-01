import React, { useEffect, useState, useMemo } from 'react';
import { Table, DatePicker, message, Tag } from 'antd';
import { ShoppingCart, Download, Search, Layers, DollarSign, ArrowDownRight, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';
import dayjs from 'dayjs';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { RangePicker } = DatePicker;

interface PurchaseRecord {
  document_number: string;
  posting_date: string;
  supplier_name: string;
  supplier_invoice_number: string;
  net_amount_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
  payment_status: string;
}

const PurchaseReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PurchaseRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get<PurchaseRecord[]>('/reports/purchases');
      setData(res.data || []);
    } catch (error) {
      console.error(error);
      message.error('Failed to load Purchase Report');
    } finally {
      setLoading(false);
    }
  };

  const totalInvoices = data.length;
  const totalNetPaise = data.reduce((s, r) => s + (r.net_amount_paise || 0), 0);
  const totalTaxPaise = data.reduce((s, r) => s + (r.tax_amount_paise || 0), 0);
  const totalGrossPaise = data.reduce((s, r) => s + (r.total_amount_paise || 0), 0);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (r) =>
        r.document_number?.toLowerCase().includes(q) ||
        r.supplier_name?.toLowerCase().includes(q) ||
        r.supplier_invoice_number?.toLowerCase().includes(q) ||
        r.payment_status?.toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  const handleExportCsv = () => {
    const headers = ['Invoice #', 'Supplier Bill #', 'Posting Date', 'Supplier', 'Taxable (₹)', 'Tax (₹)', 'Total (₹)', 'Status'];
    const csvLines = [headers.join(',')];

    data.forEach((r) => {
      csvLines.push(
        [
          `"${r.document_number}"`,
          `"${r.supplier_invoice_number || ''}"`,
          `"${r.posting_date}"`,
          `"${r.supplier_name}"`,
          (r.net_amount_paise / 100).toFixed(2),
          (r.tax_amount_paise / 100).toFixed(2),
          (r.total_amount_paise / 100).toFixed(2),
          `"${r.payment_status}"`,
        ].join(',')
      );
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchase_register_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const columns = [
    { 
      title: 'Invoice #', 
      dataIndex: 'document_number', 
      key: 'document_number',
      width: 150,
      render: (val: string) => (
        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {val}
        </span>
      ),
    },
    { 
      title: 'Supplier Bill #', 
      dataIndex: 'supplier_invoice_number', 
      key: 'supplier_invoice_number',
      width: 140,
      render: (val: string) => val ? <span className="font-mono text-xs">{val}</span> : <span className="text-slate-400">—</span>,
    },
    { 
      title: 'Posting Date', 
      dataIndex: 'posting_date', 
      key: 'posting_date',
      width: 130,
      render: (val: string) => (
        <span className="text-slate-600 dark:text-slate-300 font-medium">
          {dayjs(val).format('DD MMM YYYY')}
        </span>
      ),
    },
    { 
      title: 'Supplier', 
      dataIndex: 'supplier_name', 
      key: 'supplier_name',
      render: (val: string) => <span className="font-semibold text-slate-900 dark:text-white">{val}</span>,
    },
    { 
      title: 'Taxable (₹)', 
      dataIndex: 'net_amount_paise', 
      key: 'net_amount_paise', 
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} />,
    },
    { 
      title: 'Tax (₹)', 
      dataIndex: 'tax_amount_paise', 
      key: 'tax_amount_paise', 
      align: 'right' as const,
      width: 140,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" bold />,
    },
    { 
      title: 'Total Gross (₹)', 
      dataIndex: 'total_amount_paise', 
      key: 'total_amount_paise', 
      align: 'right' as const,
      width: 150,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
    {
      title: 'Payment Status',
      dataIndex: 'payment_status',
      key: 'payment_status',
      width: 130,
      align: 'center' as const,
      render: (status: string) => {
        const s = status?.toLowerCase();
        let colorClass = 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300';
        if (s === 'paid') colorClass = 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400';
        if (s === 'unpaid') colorClass = 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400';
        if (s === 'partial') colorClass = 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400';
        return (
          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${colorClass}`}>
            {status || 'UNPAID'}
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
            <ShoppingCart className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Reports</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">Purchase Register</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Purchase Register Report
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Vendor bills, GST input tax components, and settlement status
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <RangePicker className="rounded-xl py-1.5" />
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Bills</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{totalInvoices}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total recorded vendor invoices</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Taxable Purchases</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              <AmountDisplay paise={totalNetPaise} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Net merchandise value</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Input GST Paid</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={totalTaxPaise} variant="debit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Eligible input tax credit</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Gross Procurement</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/50 rounded-lg text-purple-600 dark:text-purple-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">
              <AmountDisplay paise={totalGrossPaise} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Cumulative invoice liability</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by invoice #, supplier name, or supplier bill #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <Table 
            columns={columns} 
            dataSource={filteredData} 
            rowKey="document_number" 
            loading={loading}
            pagination={{ pageSize: 20 }}
          />
        </div>
      </div>
    </div>
  );
};

export default PurchaseReport;
