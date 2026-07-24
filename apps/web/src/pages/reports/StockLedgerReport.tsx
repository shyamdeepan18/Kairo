import { useState, useEffect } from 'react';
import { Table, Card, Typography, DatePicker, Select, Space, Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { reportsApi, type StockLedgerEntry } from '../../api/reports';
import dayjs from 'dayjs';

const { Title } = Typography;
const { RangePicker } = DatePicker;

export function StockLedgerReport() {
  const [filters, setFilters] = useState<{ startDate?: string; endDate?: string; itemId?: string; warehouseId?: string }>({});
  const [entries, setEntries] = useState<StockLedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    reportsApi.getStockLedger(filters)
      .then(setEntries)
      .catch((err) => message.error(err.message || 'Failed to fetch Stock Ledger'))
      .finally(() => setIsLoading(false));
  }, [filters]);

  // Calculate running balance for display
  let runningQty = 0;
  let runningValue = 0;
  
  const dataSource = entries?.map((entry) => {
    const qty = parseFloat(entry.quantityInPrimaryUom);
    const isOut = entry.movementType.toLowerCase().includes('out') || 
                  entry.movementType.toLowerCase().includes('issue') ||
                  entry.movementType.toLowerCase().includes('delivery');
    
    const signedQty = isOut ? -qty : qty;
    const signedValue = isOut ? -entry.valuationAmountPaise : entry.valuationAmountPaise;

    runningQty += signedQty;
    runningValue += signedValue;

    return {
      ...entry,
      key: entry.id,
      signedQty,
      runningQty,
      runningValue,
    };
  });

  const columns = [
    {
      title: 'Posting Date',
      dataIndex: 'postingDate',
      key: 'postingDate',
      render: (val: string) => dayjs(val).format('DD MMM YYYY'),
    },
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (text: string, record: any) => `${record.itemCode} - ${text}`,
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
    },
    {
      title: 'Document',
      dataIndex: 'documentNumber',
      key: 'documentNumber',
      render: (text: string, record: any) => `${record.documentType} / ${text}`,
    },
    {
      title: 'Qty Change',
      dataIndex: 'signedQty',
      key: 'signedQty',
      align: 'right' as const,
      render: (val: number) => (
        <span style={{ color: val < 0 ? '#cf1322' : '#3f8600' }}>
          {val > 0 ? '+' : ''}{val.toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Balance Qty',
      dataIndex: 'runningQty',
      key: 'runningQty',
      align: 'right' as const,
      render: (val: number) => val.toFixed(2),
    },
    {
      title: 'Valuation Rate',
      dataIndex: 'valuationRatePaise',
      key: 'valuationRatePaise',
      align: 'right' as const,
      render: (val: number) => `₹${(val / 100).toFixed(2)}`,
    },
    {
      title: 'Balance Value',
      dataIndex: 'runningValue',
      key: 'runningValue',
      align: 'right' as const,
      render: (val: number) => `₹${(val / 100).toFixed(2)}`,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>Stock Ledger Report</Title>
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
