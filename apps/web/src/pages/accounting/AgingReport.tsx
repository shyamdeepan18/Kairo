import React, { useEffect, useState } from 'react';
import { Table, Typography, Card, Segmented, message } from 'antd';
import { api } from '../../api/client';

const { Title } = Typography;

interface AgingRecord {
  party_id: string;
  customer_name?: string;
  supplier_name?: string;
  total_debit: number;
  total_credit: number;
  outstanding: number;
  "0_30": number;
  "31_60": number;
  "61_90": number;
  "90_plus": number;
}

const AgingReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AgingRecord[]>([]);
  const [type, setType] = useState<'AR' | 'AP'>('AR');

  useEffect(() => {
    fetchData(type);
  }, [type]);

  const fetchData = async (reportType: 'AR' | 'AP') => {
    try {
      setLoading(true);
      const endpoint = reportType === 'AR' ? '/reports/ar-aging' : '/reports/ap-aging';
      const res = await api.get(endpoint);
      setData(res.data);
    } catch (error) {
      console.error(error);
      message.error(`Failed to load ${reportType} Aging report`);
    } finally {
      setLoading(false);
    }
  };

  const renderAmount = (val: number) => {
    if (!val) return '-';
    return (val / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const columns = [
    { 
      title: type === 'AR' ? 'Customer' : 'Supplier', 
      dataIndex: type === 'AR' ? 'customer_name' : 'supplier_name', 
      key: 'partyName',
      width: '25%',
    },
    { 
      title: '0-30 Days', 
      dataIndex: '0_30', 
      key: '0_30', 
      align: 'right' as const,
      render: renderAmount 
    },
    { 
      title: '31-60 Days', 
      dataIndex: '31_60', 
      key: '31_60', 
      align: 'right' as const,
      render: renderAmount 
    },
    { 
      title: '61-90 Days', 
      dataIndex: '61_90', 
      key: '61_90', 
      align: 'right' as const,
      render: renderAmount 
    },
    { 
      title: '> 90 Days', 
      dataIndex: '90_plus', 
      key: '90_plus', 
      align: 'right' as const,
      render: renderAmount 
    },
    { 
      title: 'Total Outstanding', 
      dataIndex: 'outstanding', 
      key: 'outstanding', 
      align: 'right' as const,
      render: (val: number) => <strong>{renderAmount(val)}</strong>
    },
  ];

  return (
    <Card 
      title={<Title level={3}>Aging Report</Title>} 
      extra={
        <Segmented 
          options={['AR', 'AP']} 
          value={type} 
          onChange={(val) => setType(val as 'AR' | 'AP')} 
        />
      }
    >
      <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="party_id" 
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </Card>
  );
};

export default AgingReport;
