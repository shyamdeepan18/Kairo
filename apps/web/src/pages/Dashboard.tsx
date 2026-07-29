import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Row, Col, Card, Tabs, Typography, Tag, Statistic, Table, Button, theme as antTheme, Space } from 'antd';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { 
  DollarSign, 
  ShoppingBag, 
  AlertTriangle, 
  Package, 
  Activity, 
  TrendingUp, 
  BarChart3,
  Sun,
  CheckCircle2,
  Users,
  FileSignature,
  ShoppingCart,
  Plus
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { usePlantStore } from '../store/plant';

const { Title, Text } = Typography;

// Mock Data
const salesData = [
  { time: '08:00', today: 12000, yesterday: 10000 },
  { time: '10:00', today: 25000, yesterday: 22000 },
  { time: '12:00', today: 45000, yesterday: 38000 },
  { time: '14:00', today: 60000, yesterday: 55000 },
  { time: '16:00', today: 78000, yesterday: 70000 },
  { time: '18:00', today: 95000, yesterday: 85000 },
  { time: '20:00', today: 115000, yesterday: 105000 },
  { time: '22:00', today: 132450, yesterday: 118000 },
];

const categoryData = [
  { name: 'Chronic (BP/Sugar)', sales: 45000 },
  { name: 'OTC & FMCG', sales: 32000 },
  { name: 'Antibiotics', sales: 28000 },
  { name: 'Supplements', sales: 15000 },
  { name: 'Surgicals', sales: 12450 },
];

const mockNearExpiryItems = [
  { id: 'E-101', drugName: 'Almox 500mg Capsule', batchNo: 'B-ALX24', expiryDate: '2026-08-15', daysRemaining: 19, stockQty: 140, valueAtRisk: 15680 },
  { id: 'E-102', drugName: 'Ciprofloxacin 500mg', batchNo: 'CIP-9921', expiryDate: '2026-08-28', daysRemaining: 32, stockQty: 85, valueAtRisk: 5525 },
];

const mockLowStockPredictions = [
  { id: 'P-201', drugName: 'Augmentin 625 Duo Tablet', currentStock: 12, daysUntilStockout: 0.8, recommendedOrderQty: 150, confidence: 96 },
  { id: 'P-202', drugName: 'Telma 40mg Tablet', currentStock: 25, daysUntilStockout: 1.4, recommendedOrderQty: 200, confidence: 92 },
];

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { plant } = usePlantStore();
  const { token } = antTheme.useToken();
  const [activeTab, setActiveTab] = useState('1');

  const navigate = useNavigate();

  const overviewContent = (
    <div className="flex flex-col gap-6">
      {/* KPI Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex justify-between">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-500">
                <DollarSign size={20} />
              </div>
              <Tag color="success">+12.5% vs Yesterday</Tag>
            </div>
            <span className="block mt-4 text-xs uppercase text-slate-500 dark:text-slate-400 font-medium">Today's Revenue (Gross)</span>
            <h3 className="mt-1 mb-2 text-2xl font-bold text-slate-900 dark:text-white">₹ 1,32,450</h3>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>UPI: <strong className="text-slate-700 dark:text-slate-300">₹74,000</strong></span>
              <span>Cash: <strong className="text-slate-700 dark:text-slate-300">₹58,450</strong></span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex justify-between">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400">
                <ShoppingBag size={20} />
              </div>
              <Tag color="processing">342 Orders</Tag>
            </div>
            <span className="block mt-4 text-xs uppercase text-slate-500 dark:text-slate-400 font-medium">Avg Sales Order Value</span>
            <h3 className="mt-1 mb-2 text-2xl font-bold text-slate-900 dark:text-white">₹ 3,875.20</h3>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Top Customer: <strong className="text-slate-700 dark:text-slate-300">Acme Corp</strong></span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex justify-between">
              <div className="p-2 bg-rose-50 dark:bg-rose-900/30 rounded-lg text-rose-500">
                <AlertTriangle size={20} />
              </div>
              <Tag color="error">5 Overdue</Tag>
            </div>
            <span className="block mt-4 text-xs uppercase text-slate-500 dark:text-slate-400 font-medium">Pending Payables Risk</span>
            <h3 className="mt-1 mb-2 text-2xl font-bold text-rose-600 dark:text-rose-400">₹ 2,12,050</h3>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Due in &lt; 7d: <strong className="text-slate-700 dark:text-slate-300">12 Invoices</strong></span>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} className="rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <div className="flex justify-between">
              <div className="p-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                <Package size={20} />
              </div>
              <Tag color="purple">Action Required</Tag>
            </div>
            <span className="block mt-4 text-xs uppercase text-slate-500 dark:text-slate-400 font-medium">Purchase Orders Pending</span>
            <h3 className="mt-1 mb-2 text-2xl font-bold text-purple-700 dark:text-purple-400">12 Open POs</h3>
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Pending Approval: <strong className="text-slate-700 dark:text-slate-300">3 POs</strong></span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Morning Huddle */}
      <Card bordered={false} className="rounded-xl bg-gradient-to-r from-blue-50 to-sky-50 dark:from-slate-800 dark:to-slate-800 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 mb-4">
          <Sun size={24} className="text-amber-500" />
          <h2 className="m-0 text-lg font-bold text-blue-900 dark:text-blue-400">Morning Huddle</h2>
        </div>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg flex items-start gap-3 border border-slate-200 dark:border-slate-700 shadow-sm">
              <AlertTriangle className="text-rose-500 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">System Alerts</strong>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <strong className="text-rose-500">5 invoices</strong> overdue. <strong className="text-amber-500">3 POs</strong> need approval.
                </div>
              </div>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg flex items-start gap-3 border border-slate-200 dark:border-slate-700 shadow-sm">
              <CheckCircle2 className="text-emerald-500 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">Pending Tasks</strong>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  3 supplier payments due today. 5 pending deliveries.
                </div>
              </div>
            </div>
          </Col>
          <Col xs={24} md={8}>
            <div className="bg-white dark:bg-slate-900 p-4 rounded-lg flex items-start gap-3 border border-slate-200 dark:border-slate-700 shadow-sm">
              <Users className="text-blue-500 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">Shift Handover</strong>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Cash drawer verified: ₹12,450. Discrepancy: ₹0.
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </Card>

      {/* Charts */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card title="Real-time Hourly Sales Telemetry" bordered={false} className="rounded-xl h-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorToday" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorYesterday" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => `₹${val/1000}k`} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <Tooltip formatter={(value) => [`₹${value}`, '']} />
                  <Area type="monotone" dataKey="today" name="Today Sales" stroke="#10b981" strokeWidth={3} fill="url(#colorToday)" />
                  <Area type="monotone" dataKey="yesterday" name="Yesterday Sales" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" fill="url(#colorYesterday)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="Sales by Category" bordered={false} className="rounded-xl h-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(value) => [`₹${value}`, 'Revenue']} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                  <Bar dataKey="sales" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );

  const items = [
    { key: '1', label: <span className="flex items-center gap-2"><Activity size={16} /> Overview</span>, children: overviewContent },
    { key: '2', label: <span className="flex items-center gap-2 text-rose-500"><AlertTriangle size={16} /> Payables Alerts (5)</span>, children: <Card>Payables Alerts Table Here</Card> },
    { key: '3', label: <span className="flex items-center gap-2 text-purple-500"><TrendingUp size={16} /> Pending Approvals (3)</span>, children: <Card>Pending Approvals Table Here</Card> },
    { key: '4', label: <span className="flex items-center gap-2 text-emerald-500"><BarChart3 size={16} /> Margin Analysis</span>, children: <Card>Margin Analysis Here</Card> },
  ];

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6">
      <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="m-0 flex items-center gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            <Activity className="text-emerald-500" /> Business Command Center
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Real-time enterprise resource telemetry, financials & operational forecasting</p>
        </div>
      </div>

      {/* Quick Actions Row */}
      <div className="mb-8">
        <Row gutter={[16, 16]}>
          <Col xs={12} sm={12} md={6}>
            <Card
              hoverable
              onClick={() => navigate('/sales/quotations')}
              className="rounded-xl shadow-sm border border-indigo-100 dark:border-indigo-900/50 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-900/20 dark:to-slate-800 transition-all hover:scale-[1.02]"
              bodyStyle={{ padding: '16px 20px' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-500 text-white rounded-lg shadow-sm">
                  <FileSignature size={20} />
                </div>
                <div>
                  <h3 className="m-0 font-bold text-slate-800 dark:text-white text-sm">New Quotation</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Draft a sales offer</span>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card
              hoverable
              onClick={() => navigate('/purchase/orders')}
              className="rounded-xl shadow-sm border border-purple-100 dark:border-purple-900/50 bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/20 dark:to-slate-800 transition-all hover:scale-[1.02]"
              bodyStyle={{ padding: '16px 20px' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-purple-500 text-white rounded-lg shadow-sm">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <h3 className="m-0 font-bold text-slate-800 dark:text-white text-sm">Purchase Order</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Restock inventory</span>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card
              hoverable
              onClick={() => navigate('/masters/items')}
              className="rounded-xl shadow-sm border border-emerald-100 dark:border-emerald-900/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-slate-800 transition-all hover:scale-[1.02]"
              bodyStyle={{ padding: '16px 20px' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-emerald-500 text-white rounded-lg shadow-sm">
                  <Package size={20} />
                </div>
                <div>
                  <h3 className="m-0 font-bold text-slate-800 dark:text-white text-sm">Add Item</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">New product to master</span>
                </div>
              </div>
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card
              hoverable
              onClick={() => navigate('/masters/customers')}
              className="rounded-xl shadow-sm border border-blue-100 dark:border-blue-900/50 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-slate-800 transition-all hover:scale-[1.02]"
              bodyStyle={{ padding: '16px 20px' }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-500 text-white rounded-lg shadow-sm">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="m-0 font-bold text-slate-800 dark:text-white text-sm">Add Customer</h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Onboard new client</span>
                </div>
              </div>
            </Card>
          </Col>
        </Row>
      </div>

      <Tabs defaultActiveKey="1" items={items} />
    </div>
  );
}
