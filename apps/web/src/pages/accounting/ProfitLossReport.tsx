import React, { useEffect, useState } from 'react';
import { Table, Typography, Card, Space, DatePicker, message } from 'antd';
import { api } from '../../api/client';

const { Title, Text } = Typography;
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

  const revenueData = data.filter(d => d.accountType === 'revenue');
  const expenseData = data.filter(d => d.accountType === 'expense');

  const totalRevenue = revenueData.reduce((acc, curr) => acc + curr.balance, 0);
  const totalExpense = expenseData.reduce((acc, curr) => acc + curr.balance, 0);
  const netProfit = totalRevenue - totalExpense;

  const columns = [
    { title: 'Account Code', dataIndex: 'accountCode', key: 'accountCode', width: '20%' },
    { title: 'Account Name', dataIndex: 'accountName', key: 'accountName', width: '50%' },
    { 
      title: 'Balance (₹)', 
      dataIndex: 'balance', 
      key: 'balance', 
      align: 'right' as const,
      render: (val: number) => (val / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
    }
  ];

  return (
    <Card title={<Title level={3}>Profit & Loss Statement</Title>} extra={<RangePicker />}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        
        <div>
          <Title level={5}>Revenue</Title>
          <Table 
            columns={columns} 
            dataSource={revenueData} 
            rowKey="accountId" 
            pagination={false} 
            loading={loading}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}><strong>Total Revenue</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <strong>{(totalRevenue / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>

        <div>
          <Title level={5}>Expenses</Title>
          <Table 
            columns={columns} 
            dataSource={expenseData} 
            rowKey="accountId" 
            pagination={false} 
            loading={loading}
            summary={() => (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={2}><strong>Total Expenses</strong></Table.Summary.Cell>
                <Table.Summary.Cell index={2} align="right">
                  <strong>{(totalExpense / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </Table.Summary.Cell>
              </Table.Summary.Row>
            )}
          />
        </div>

        <Card type="inner" style={{ backgroundColor: netProfit >= 0 ? '#f6ffed' : '#fff2f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Title level={4} style={{ margin: 0, color: netProfit >= 0 ? '#389e0d' : '#cf1322' }}>
              {netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
            </Title>
            <Title level={4} style={{ margin: 0, color: netProfit >= 0 ? '#389e0d' : '#cf1322' }}>
              ₹ {(Math.abs(netProfit) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Title>
          </div>
        </Card>

      </Space>
    </Card>
  );
};

export default ProfitLossReport;
