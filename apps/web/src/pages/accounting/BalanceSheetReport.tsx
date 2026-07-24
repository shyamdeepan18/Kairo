import React, { useEffect, useState } from 'react';
import { Table, Typography, Card, Space, DatePicker, message, Row, Col } from 'antd';
import axios from 'axios';

const { Title } = Typography;

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
      const res = await axios.get('/api/reports/balance-sheet', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setData(res.data);
    } catch (error) {
      console.error(error);
      message.error('Failed to load Balance Sheet');
    } finally {
      setLoading(false);
    }
  };

  const assetData = data.filter(d => d.accountType === 'asset');
  const liabilityData = data.filter(d => d.accountType === 'liability');
  const equityData = data.filter(d => d.accountType === 'equity');

  const totalAssets = assetData.reduce((acc, curr) => acc + curr.balance, 0);
  const totalLiabilities = liabilityData.reduce((acc, curr) => acc + curr.balance, 0);
  const totalEquity = equityData.reduce((acc, curr) => acc + curr.balance, 0);
  
  const liabilitiesAndEquity = totalLiabilities + totalEquity;

  const columns = [
    { title: 'Account', dataIndex: 'accountName', key: 'accountName', render: (text: string, record: BSRecord) => `${record.accountCode} - ${text}` },
    { 
      title: 'Balance (₹)', 
      dataIndex: 'balance', 
      key: 'balance', 
      align: 'right' as const,
      render: (val: number) => (val / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
    }
  ];

  return (
    <Card title={<Title level={3}>Balance Sheet</Title>} extra={<DatePicker />}>
      <Row gutter={24}>
        
        {/* Assets Side */}
        <Col span={12}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Title level={5}>Assets</Title>
              <Table 
                columns={columns} 
                dataSource={assetData} 
                rowKey="accountId" 
                pagination={false} 
                loading={loading}
                summary={() => (
                  <Table.Summary.Row style={{ backgroundColor: '#fafafa' }}>
                    <Table.Summary.Cell index={0}><strong>Total Assets</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <strong>{(totalAssets / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </div>
          </Space>
        </Col>

        {/* Liabilities & Equity Side */}
        <Col span={12}>
          <Space direction="vertical" style={{ width: '100%' }} size="large">
            <div>
              <Title level={5}>Liabilities</Title>
              <Table 
                columns={columns} 
                dataSource={liabilityData} 
                rowKey="accountId" 
                pagination={false} 
                loading={loading}
                summary={() => (
                  <Table.Summary.Row style={{ backgroundColor: '#fafafa' }}>
                    <Table.Summary.Cell index={0}><strong>Total Liabilities</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <strong>{(totalLiabilities / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </div>

            <div>
              <Title level={5}>Equity</Title>
              <Table 
                columns={columns} 
                dataSource={equityData} 
                rowKey="accountId" 
                pagination={false} 
                loading={loading}
                summary={() => (
                  <Table.Summary.Row style={{ backgroundColor: '#fafafa' }}>
                    <Table.Summary.Cell index={0}><strong>Total Equity</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <strong>{(totalEquity / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />
            </div>

            <Card type="inner" style={{ backgroundColor: '#f0f5ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={5} style={{ margin: 0 }}>Total Liabilities & Equity</Title>
                <Title level={5} style={{ margin: 0 }}>
                  ₹ {(liabilitiesAndEquity / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Title>
              </div>
            </Card>

          </Space>
        </Col>

      </Row>
    </Card>
  );
};

export default BalanceSheetReport;
