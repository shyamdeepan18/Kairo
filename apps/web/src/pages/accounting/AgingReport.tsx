import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Table, Typography, Card, Segmented, message } from 'antd';
import { api } from '../../api/client';

const { Title } = Typography;

interface AgingRecord {
  party_id: string;
  customer_name?: string;
  supplier_name?: string;
  total_debit: number | string;
  total_credit: number | string;
  outstanding: number | string;
  "0_30": number | string;
  "31_60": number | string;
  "61_90": number | string;
  "90_plus": number | string;
}

const AgingReport: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isAp = location.pathname.includes('ap-aging');
  const type: 'AR' | 'AP' = isAp ? 'AP' : 'AR';

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AgingRecord[]>([]);

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

  const renderAmount = (val: number | string) => {
    const num = Number(val) || 0;
    if (num === 0) return '₹0.00';
    return `₹${(num / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
      render: (val: number | string) => <strong>{renderAmount(val)}</strong>
    },
  ];

  return (
    <Card 
      title={<Title level={3}>{type === 'AR' ? 'Accounts Receivable (AR) Aging' : 'Accounts Payable (AP) Aging'}</Title>} 
      extra={
        <Segmented 
          options={[
            { label: 'Receivables (AR)', value: 'AR' },
            { label: 'Payables (AP)', value: 'AP' },
          ]} 
          value={type} 
          onChange={(val) => navigate(`/accounting/${(val as string).toLowerCase()}-aging`)} 
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
