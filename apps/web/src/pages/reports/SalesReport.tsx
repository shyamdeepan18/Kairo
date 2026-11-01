import React, { useState, useEffect } from 'react';
import { 
  Row, Col, Typography, Select, Table, DatePicker, Tag, Tabs 
} from 'antd';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, DollarSign, ShieldAlert, Sparkles, Filter, Download, PieChart as PieChartIcon, Layers 
} from 'lucide-react';
import { reportsApi, type SalesProfitabilityRecord } from '../../api/reports';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Text } = Typography;
const { RangePicker } = DatePicker;

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899'];

const lossPreventionData = [
  { id: 'LP-001', date: '2026-07-27', type: 'VOID_BILL', user: 'Cashier 1', item: 'Multiple', amount: 4500, riskLevel: 'HIGH', status: 'Pending Review' },
  { id: 'LP-002', date: '2026-07-26', type: 'HIGH_DISCOUNT', user: 'Cashier 2', item: 'Insulin Pen', amount: 1200, riskLevel: 'MEDIUM', status: 'Reviewed' },
  { id: 'LP-003', date: '2026-07-25', type: 'STOCK_ADJUSTMENT', user: 'Store Mgr', item: 'Vicks Vaporub', amount: 250, riskLevel: 'LOW', status: 'Approved' },
];

export function SalesReportPage() {
  const [activeTab, setActiveTab] = useState('1');
  const [loading, setLoading] = useState(false);
  const [profitabilityData, setProfitabilityData] = useState<SalesProfitabilityRecord[]>([]);

  useEffect(() => {
    setLoading(true);
    reportsApi.getSalesProfitability()
      .then((data) => setProfitabilityData(data || []))
      .catch((err) => console.error('Failed to load profitability report:', err))
      .finally(() => setLoading(false));
  }, []);

  const totalRevenuePaise = profitabilityData.reduce((acc, row) => acc + Number(row.total_revenue_paise || 0), 0);
  const totalCogsPaise = profitabilityData.reduce((acc, row) => acc + Number(row.total_cogs_paise || 0), 0);
  const totalGrossProfitPaise = totalRevenuePaise - totalCogsPaise;
  const overallMarginPercent = totalRevenuePaise > 0 
    ? ((totalGrossProfitPaise / totalRevenuePaise) * 100).toFixed(1)
    : '0.0';

  const chartData = profitabilityData.slice(0, 8).map((row) => ({
    name: row.item_name.length > 15 ? row.item_name.substring(0, 15) + '...' : row.item_name,
    revenue: Number(row.total_revenue_paise || 0) / 100,
    cogs: Number(row.total_cogs_paise || 0) / 100,
    profit: Number(row.gross_profit_paise || 0) / 100,
    margin: Number(row.gross_margin_percent || 0),
  }));

  const renderAnalytics = () => (
    <div className="flex flex-col gap-6">
      {/* 4-Column KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Revenue</span>
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            <AmountDisplay paise={totalRevenuePaise} />
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Total top-line invoiced sales
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Cost of Goods (COGS)</span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
            <AmountDisplay paise={totalCogsPaise} />
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Weighted avg cost of inventory dispatched
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Gross Profit</span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
            <AmountDisplay paise={totalGrossProfitPaise} />
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Revenue minus COGS realized
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Blended Margin</span>
            <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
            {overallMarginPercent}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Gross margin percentage
          </div>
        </div>
      </div>

      {/* Visual Analytics Grid */}
      {chartData.length > 0 && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Revenue vs COGS & Profit by Item (₹)
              </div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11 }} tickFormatter={val => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                    <Tooltip formatter={(val: any) => `₹${Number(val).toFixed(2)}`} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="revenue" name="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cogs" name="COGS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Gross Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Col>
          <Col xs={24} lg={10}>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
              <div className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                Profit Distribution by Product
              </div>
              <div style={{ height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="profit"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => `₹${Number(val).toFixed(2)}`} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Col>
        </Row>
      )}

      {/* Table Container */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">
              Item & Customer Profitability Breakdown
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Derived from COGS ledger and sales invoicing journals
            </p>
          </div>
          <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
            {profitabilityData.length} records
          </span>
        </div>

        <Table 
          dataSource={profitabilityData}
          rowKey={(r) => `${r.item_id}_${r.customer_name}`}
          loading={loading}
          pagination={{ pageSize: 10, showSizeChanger: true }}
          className="dark:bg-slate-900"
          columns={[
            {
              title: 'Item Code',
              dataIndex: 'item_code',
              key: 'item_code',
              render: (v: string) => <Text strong className="dark:text-slate-200 font-mono text-xs">{v}</Text>,
            },
            {
              title: 'Item Name',
              dataIndex: 'item_name',
              key: 'item_name',
              render: (v: string) => <span className="dark:text-slate-200 font-medium">{v}</span>,
            },
            {
              title: 'Customer',
              dataIndex: 'customer_name',
              key: 'customer_name',
              render: (v: string) => <span className="dark:text-slate-300">{v}</span>,
            },
            {
              title: 'Delivered Qty',
              dataIndex: 'total_delivered_qty',
              key: 'total_delivered_qty',
              align: 'right' as const,
              render: (v: number) => <span className="dark:text-slate-200 font-semibold">{v}</span>,
            },
            {
              title: 'Revenue (₹)',
              dataIndex: 'total_revenue_paise',
              key: 'revenue',
              align: 'right' as const,
              render: (v: number) => <AmountDisplay paise={v} />,
            },
            {
              title: 'COGS (₹)',
              dataIndex: 'total_cogs_paise',
              key: 'cogs',
              align: 'right' as const,
              render: (v: number) => <span className="text-amber-600 dark:text-amber-400"><AmountDisplay paise={v} /></span>,
            },
            {
              title: 'Gross Profit (₹)',
              dataIndex: 'gross_profit_paise',
              key: 'gross_profit',
              align: 'right' as const,
              render: (v: number) => (
                <span className={v >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-rose-600 dark:text-rose-400 font-bold'}>
                  <AmountDisplay paise={v} />
                </span>
              ),
            },
            {
              title: 'Gross Margin %',
              dataIndex: 'gross_margin_percent',
              key: 'margin_percent',
              align: 'right' as const,
              render: (v: number | string) => {
                const pct = Number(v);
                return (
                  <Tag color={pct >= 20 ? 'success' : (pct > 0 ? 'warning' : 'error')} style={{ fontWeight: 'bold', borderRadius: 8 }}>
                    {pct.toFixed(1)}%
                  </Tag>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );

  const renderLossPrevention = () => (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs">
      <div className="mb-4 flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
        <Select 
          defaultValue="ALL" 
          className="w-56"
          options={[
            { label: 'All Incident Types', value: 'ALL' }, 
            { label: 'Void Bills', value: 'VOID' }, 
            { label: 'High Discounts', value: 'DISC' }
          ]} 
        />
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl shadow-xs text-sm font-medium transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Export Audit Log
        </button>
      </div>
      <Table 
        dataSource={lossPreventionData} 
        rowKey="id"
        className="dark:bg-slate-900"
        columns={[
          { title: 'Incident ID', dataIndex: 'id', render: (v: string) => <Text code className="dark:text-slate-300">{v}</Text> },
          { title: 'Date', dataIndex: 'date', render: (v: string) => <span className="dark:text-slate-300">{v}</span> },
          { title: 'Type', dataIndex: 'type', render: (v: string) => <Tag color={v === 'VOID_BILL' ? 'red' : 'orange'}>{v.replace('_', ' ')}</Tag> },
          { title: 'User', dataIndex: 'user', render: (v: string) => <span className="dark:text-slate-300 font-medium">{v}</span> },
          { title: 'Amount at Risk', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <span className="font-bold dark:text-slate-200">₹{v}</span> },
          { title: 'Risk Level', dataIndex: 'riskLevel', render: (v: string) => <Tag color={v === 'HIGH' ? 'error' : v === 'MEDIUM' ? 'warning' : 'success'}>{v}</Tag> },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <span className={v === 'Pending Review' ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>{v}</span> }
        ]}
      />
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <PieChartIcon className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Reports</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Sales Analytics</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Sales Profitability & COGS
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Real-time revenue, cost of goods sold (COGS), gross profit, and margin analytics
            </p>
          </div>
        </div>

        {/* Global Actions */}
        <div className="flex items-center gap-3">
          <RangePicker className="rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800" />
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Filter className="w-4 h-4" />
            Apply Filter
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1">
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          className="dark:text-slate-200"
          items={[
            { 
              key: '1', 
              label: (
                <span className="flex items-center gap-2 font-medium">
                  <Sparkles className="w-4 h-4 text-indigo-500" /> Margin & COGS Analytics
                </span>
              ), 
              children: renderAnalytics() 
            },
            { 
              key: '2', 
              label: (
                <span className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="w-4 h-4 text-rose-500" /> Loss Prevention Audit
                </span>
              ), 
              children: renderLossPrevention() 
            },
          ]} 
        />
      </div>
    </div>
  );
}

export default SalesReportPage;
