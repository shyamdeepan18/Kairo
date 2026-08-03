import React, { useState, useEffect } from 'react';
import { 
  Row, Col, Card, Typography, Select, Table, DatePicker, Statistic, Tag, Tabs, Button, Spin 
} from 'antd';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, ShieldAlert, Sparkles, Filter, Download, PieChart as PieChartIcon, PackageCheck, Layers 
} from 'lucide-react';
import { reportsApi, type SalesProfitabilityRecord } from '../../api/reports';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DollarSign size={16} /> Total Revenue</span>}
              value={totalRevenuePaise / 100} 
              prefix="₹" 
              precision={2}
              valueStyle={{ color: '#0f172a', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Layers size={16} color="#f59e0b" /> Cost of Goods Sold (COGS)</span>}
              value={totalCogsPaise / 100} 
              prefix="₹" 
              precision={2}
              valueStyle={{ color: '#d97706', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={16} color="#10b981" /> Gross Profit</span>}
              value={totalGrossProfitPaise / 100} 
              prefix="₹" 
              precision={2}
              valueStyle={{ color: '#10b981', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} color="#3b82f6" /> Blended Gross Margin</span>}
              value={overallMarginPercent} 
              suffix="%" 
              valueStyle={{ color: '#3b82f6', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
      </Row>

      {chartData.length > 0 && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="Revenue vs COGS & Profit by Item (₹)" bordered={false} style={{ borderRadius: 12 }}>
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={val => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                    <Tooltip formatter={(val: any) => `₹${Number(val).toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="cogs" name="COGS" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Gross Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="Profit Distribution by Product" bordered={false} style={{ borderRadius: 12 }}>
              <div style={{ height: 350 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={110}
                      paddingAngle={4}
                      dataKey="profit"
                    >
                      {chartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val: any) => `₹${Number(val).toFixed(2)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Card title="Item & Customer Profitability Breakdown (COGS Ledger)" bordered={false} style={{ borderRadius: 12 }}>
        <Table 
          dataSource={profitabilityData}
          rowKey={(r) => `${r.item_id}_${r.customer_name}`}
          loading={loading}
          pagination={{ pageSize: 10 }}
          columns={[
            {
              title: 'Item Code',
              dataIndex: 'item_code',
              key: 'item_code',
              render: (v: string) => <Text strong>{v}</Text>,
            },
            {
              title: 'Item Name',
              dataIndex: 'item_name',
              key: 'item_name',
            },
            {
              title: 'Customer',
              dataIndex: 'customer_name',
              key: 'customer_name',
            },
            {
              title: 'Delivered Qty',
              dataIndex: 'total_delivered_qty',
              key: 'total_delivered_qty',
              align: 'right' as const,
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
              render: (v: number) => <AmountDisplay paise={v} />,
            },
            {
              title: 'Gross Profit (₹)',
              dataIndex: 'gross_profit_paise',
              key: 'gross_profit',
              align: 'right' as const,
              render: (v: number) => (
                <Text strong style={{ color: v >= 0 ? '#10b981' : '#ef4444' }}>
                  <AmountDisplay paise={v} />
                </Text>
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
      </Card>
    </div>
  );

  const renderLossPrevention = () => (
    <Card bordered={false} style={{ borderRadius: 12 }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Select defaultValue="ALL" style={{ width: 200 }} options={[{label: 'All Incident Types', value: 'ALL'}, {label: 'Void Bills', value: 'VOID'}, {label: 'High Discounts', value: 'DISC'}]} />
        <Button icon={<Download size={16} />}>Export Audit Log</Button>
      </div>
      <Table 
        dataSource={lossPreventionData} 
        rowKey="id"
        columns={[
          { title: 'Incident ID', dataIndex: 'id', render: (v: string) => <Text code>{v}</Text> },
          { title: 'Date', dataIndex: 'date' },
          { title: 'Type', dataIndex: 'type', render: (v: string) => <Tag color={v === 'VOID_BILL' ? 'red' : 'orange'}>{v.replace('_', ' ')}</Tag> },
          { title: 'User', dataIndex: 'user' },
          { title: 'Amount at Risk', dataIndex: 'amount', align: 'right' as const, render: (v: number) => <Text strong>₹{v}</Text> },
          { title: 'Risk Level', dataIndex: 'riskLevel', render: (v: string) => <Tag color={v === 'HIGH' ? 'error' : v === 'MEDIUM' ? 'warning' : 'success'}>{v}</Tag> },
          { title: 'Status', dataIndex: 'status', render: (v: string) => <Text type={v === 'Pending Review' ? 'danger' : 'success'} strong>{v}</Text> }
        ]}
      />
    </Card>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PieChartIcon color="#3b82f6" /> Sales Profitability & COGS Report
          </Title>
          <Text type="secondary">Real-time revenue, cost of goods sold (COGS), gross profit, and margin analytics</Text>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <RangePicker />
          <Button type="primary" icon={<Filter size={16} />}>Apply</Button>
        </div>
      </div>

      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={[
          { key: '1', label: <span style={{display:'flex', gap:8, alignItems:'center'}}><Sparkles size={16}/> Margin & COGS Analytics</span>, children: renderAnalytics() },
          { key: '2', label: <span style={{display:'flex', gap:8, alignItems:'center'}}><ShieldAlert size={16}/> Loss Prevention Audit</span>, children: renderLossPrevention() },
        ]} 
      />
    </div>
  );
}

export default SalesReportPage;
