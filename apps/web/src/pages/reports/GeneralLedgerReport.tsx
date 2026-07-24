import { useState, useEffect } from 'react';
import { Table, Card, Typography, DatePicker, Select, Space, Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { reportsApi, type GeneralLedgerEntry } from '../../api/reports';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export function GeneralLedgerReport() {
  const [filters, setFilters] = useState<{ startDate?: string; endDate?: string; accountId?: string }>({});
  const [entries, setEntries] = useState<GeneralLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    reportsApi.getGeneralLedger(filters)
      .then(setEntries)
      .catch((err) => message.error(err.message || 'Failed to fetch General Ledger'))
      .finally(() => setIsLoading(false));
  }, [filters]);

  // Calculate running balance for display
  let runningBalance = 0;
  
  const dataSource = entries?.map((entry) => {
    // Normal accounting convention: Debits increase assets/expenses, Credits increase liabilities/equity/revenue
    // For a generic view, Balance = sum(Debit) - sum(Credit).
    const debit = entry.debitAmountPaise;
    const credit = entry.creditAmountPaise;
    
    runningBalance += (debit - credit);

    return {
      ...entry,
      key: entry.id,
      runningBalance,
    };
  });

  const columns = [
    {
      title: 'Date',
      dataIndex: 'postingDate',
      key: 'postingDate',
      render: (val: string) => dayjs(val).format('DD MMM YYYY'),
    },
    {
      title: 'Account',
      dataIndex: 'accountName',
      key: 'accountName',
      render: (text: string, record: any) => `${record.accountCode} - ${text}`,
    },
    {
      title: 'Entry No',
      dataIndex: 'entryNumber',
      key: 'entryNumber',
    },
    {
      title: 'Narration',
      key: 'narration',
      render: (text: string, record: any) => record.lineNarration || record.narration,
    },
    {
      title: 'Debit (₹)',
      dataIndex: 'debitAmountPaise',
      key: 'debit',
      align: 'right' as const,
      render: (val: number) => val > 0 ? (val / 100).toFixed(2) : '-',
    },
    {
      title: 'Credit (₹)',
      dataIndex: 'creditAmountPaise',
      key: 'credit',
      align: 'right' as const,
      render: (val: number) => val > 0 ? (val / 100).toFixed(2) : '-',
    },
    {
      title: 'Balance (₹)',
      dataIndex: 'runningBalance',
      key: 'balance',
      align: 'right' as const,
      render: (val: number) => {
        const absVal = Math.abs(val / 100).toFixed(2);
        return val >= 0 ? `${absVal} Dr` : `${absVal} Cr`;
      },
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>General Ledger Report</Title>
        <Space>
          <RangePicker 
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setFilters({ ...filters, startDate: dates[0].format('YYYY-MM-DD'), endDate: dates[1].format('YYYY-MM-DD') });
              } else {
                setFilters({ ...filters, startDate: undefined, endDate: undefined });
              }
            }} 
          />
          <Button icon={<DownloadOutlined />}>Export</Button>
        </Space>
      </div>

      <Card>
        <Table
          dataSource={dataSource}
          columns={columns}
          loading={isLoading}
          size="small"
          pagination={{ pageSize: 50 }}
        />
      </Card>
    </Space>
  );
}
