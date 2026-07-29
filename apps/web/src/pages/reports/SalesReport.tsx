import React, { useState } from 'react';
import { 
  Row, Col, Card, Typography, Select, Table, DatePicker, Statistic, Tag, Tabs, Button 
} from 'antd';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, DollarSign, ShieldAlert, Sparkles, Filter, Download, PieChart as PieChartIcon 
} from 'lucide-react';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Mock data
const marginData = [
  { category: 'Chronic (BP/Sugar)', revenue: 45000, margin: 28 },
  { category: 'OTC Essentials', revenue: 32000, margin: 42 },
  { category: 'Antibiotics', revenue: 28000, margin: 18 },
  { category: 'DPCO Regulated', revenue: 15000, margin: 12 },
  { category: 'Surgicals', revenue: 12450, margin: 35 },
];

const lossPreventionData = [
  { id: 'LP-001', date: '2026-07-27', type: 'VOID_BILL', user: 'Cashier 1', item: 'Multiple', amount: 4500, riskLevel: 'HIGH', status: 'Pending Review' },
  { id: 'LP-002', date: '2026-07-26', type: 'HIGH_DISCOUNT', user: 'Cashier 2', item: 'Insulin Pen', amount: 1200, riskLevel: 'MEDIUM', status: 'Reviewed' },
  { id: 'LP-003', date: '2026-07-25', type: 'STOCK_ADJUSTMENT', user: 'Store Mgr', item: 'Vicks Vaporub', amount: 250, riskLevel: 'LOW', status: 'Approved' },
];

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export function SalesReportPage() {
  const [activeTab, setActiveTab] = useState('1');

  const renderAnalytics = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><DollarSign size={16} /> Total Revenue</span>}
              value={132450} 
              prefix="₹" 
              valueStyle={{ color: '#0f172a', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingUp size={16} color="#10b981" /> Blended Gross Margin</span>}
              value={24.8} 
              suffix="%" 
              valueStyle={{ color: '#10b981', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card bordered={false} style={{ borderRadius: 12 }}>
            <Statistic 
              title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><TrendingDown size={16} color="#ef4444" /> DPCO Revenue Impact</span>}
              value={11.3} 
              suffix="%" 
              valueStyle={{ color: '#ef4444', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Margin Contribution by Category" bordered={false} style={{ borderRadius: 12 }}>
            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={marginData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="category" axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" orientation="left" stroke="#3b82f6" axisLine={false} tickLine={false} tickFormatter={val => `₹${val/1000}k`} />
                  <YAxis yAxisId="right" orientation="right" stroke="#10b981" axisLine={false} tickLine={false} tickFormatter={val => `${val}%`} />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="margin" name="Margin %" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="Revenue Distribution" bordered={false} style={{ borderRadius: 12 }}>
            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={marginData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={120}
                    paddingAngle={5}
                    dataKey="revenue"
                  >
                    {marginData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={val => `₹${val}`} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
      </Row>
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
            <PieChartIcon color="#3b82f6" /> Advanced Analytics & Compliance
          </Title>
          <Text type="secondary">Deep margin analysis, predictive forecasting, and loss prevention</Text>
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
          { key: '1', label: <span style={{display:'flex', gap:8, alignItems:'center'}}><Sparkles size={16}/> Margin Analytics</span>, children: renderAnalytics() },
          { key: '2', label: <span style={{display:'flex', gap:8, alignItems:'center'}}><ShieldAlert size={16}/> Loss Prevention Audit</span>, children: renderLossPrevention() },
        ]} 
      />
    </div>
  );
}

export default SalesReportPage;
