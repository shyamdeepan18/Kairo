import React, { useEffect, useState } from 'react';
import { Table, Typography, Card, DatePicker, message, Tag } from 'antd';
import { api } from '../../api/client';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

interface SalesRecord {
  document_number: string;
  posting_date: string;
  customer_name: string;
  net_amount_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
  payment_status: string;
}

const SalesReport: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SalesRecord[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await api.get<SalesRecord[]>('/reports/sales');
      setData(res.data);
    } catch (error) {
      console.error(error);
      message.error('Failed to load Sales Report');
    } finally {
      setLoading(false);
    }
  };

  const renderAmount = (val: number) => {
    return (val / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const columns = [
    { 
      title: 'Invoice Number', 
      dataIndex: 'document_number', 
      key: 'document_number'
    },
    { 
      title: 'Date', 
      dataIndex: 'posting_date', 
      key: 'posting_date',
      render: (val: string) => dayjs(val).format('DD MMM YYYY')
    },
    { 
      title: 'Customer', 
      dataIndex: 'customer_name', 
      key: 'customer_name'
    },
    { 
      title: 'Net Amount (₹)', 
      dataIndex: 'net_amount_paise', 
      key: 'net_amount_paise',
      align: 'right' as const,
      render: renderAmount 
    },
    { 
      title: 'Tax Amount (₹)', 
      dataIndex: 'tax_amount_paise', 
      key: 'tax_amount_paise',
      align: 'right' as const,
      render: renderAmount 
    },
    { 
      title: 'Total Amount (₹)', 
      dataIndex: 'total_amount_paise', 
      key: 'total_amount_paise',
      align: 'right' as const,
      render: (val: number) => <strong>{renderAmount(val)}</strong>
    },
    {
      title: 'Status',
      dataIndex: 'payment_status',
      key: 'payment_status',
      render: (status: string) => {
        let color = 'default';
        if (status === 'paid') color = 'success';
        if (status === 'unpaid') color = 'error';
        if (status === 'partial') color = 'warning';
        return <Tag color={color}>{status.toUpperCase()}</Tag>;
      }
    }
  ];

  return (
    <Card 
      title={<Title level={3}>Sales Report</Title>} 
      extra={<RangePicker />}
    >
      <Table 
        columns={columns} 
        dataSource={data} 
        rowKey="document_number" 
        loading={loading}
        pagination={{ pageSize: 20 }}
      />
    </Card>
  );
};

export default SalesReport;
