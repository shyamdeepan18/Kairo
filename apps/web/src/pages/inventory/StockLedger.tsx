import { useState, useEffect, useCallback } from 'react';
import { Table, Select, Typography, Tag, Space, message } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { useCardStyle } from '../_shared/txn';

const { Title, Text } = Typography;

const MOVEMENT_LABELS: Record<string, { label: string; dir: 'IN' | 'OUT' }> = {
  purchase_receipt:     { label: 'Purchase Receipt', dir: 'IN' },
  production_receipt:   { label: 'Production Receipt', dir: 'IN' },
  transfer_receipt:     { label: 'Transfer Receipt', dir: 'IN' },
  return_from_customer: { label: 'Sales Return', dir: 'IN' },
  opening_balance:      { label: 'Opening Balance', dir: 'IN' },
  adjustment_in:        { label: 'Adjustment In', dir: 'IN' },
  sales_delivery:       { label: 'Sales Delivery', dir: 'OUT' },
  issue_to_production:  { label: 'Issue to Production', dir: 'OUT' },
  transfer_issue:       { label: 'Transfer Issue', dir: 'OUT' },
  adjustment_out:       { label: 'Adjustment Out', dir: 'OUT' },
  scrap_write_off:      { label: 'Scrap Write-off', dir: 'OUT' },
};

export function StockLedgerPage() {
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemFilter, setItemFilter] = useState<string | undefined>();
  const [whFilter, setWhFilter] = useState<string | undefined>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    const params: Record<string, unknown> = {};
    if (itemFilter) params.itemId = itemFilter;
    if (whFilter) params.warehouseId = whFilter;
    inventoryApi.stockLedger.list(company.id, params)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(invErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, itemFilter, whFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
  }, [company?.id, plant?.id]);

  const columns = [
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Document', dataIndex: 'documentNumber', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Type', dataIndex: 'documentType', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
    {
      title: 'Movement', dataIndex: 'movementType',
      render: (v: string) => {
        const m = MOVEMENT_LABELS[v] ?? { label: v, dir: 'IN' as const };
        return (
          <Space size={4}>
            {m.dir === 'IN'
              ? <ArrowUpOutlined style={{ color: '#52c41a' }} />
              : <ArrowDownOutlined style={{ color: '#ff4d4f' }} />}
            <Tag color={m.dir === 'IN' ? 'green' : 'red'} style={{ fontSize: 11 }}>{m.label}</Tag>
          </Space>
        );
      }
    },
    {
      title: 'Item', dataIndex: 'itemName',
      render: (v: string, r: any) => (
        <><Text strong style={{ fontSize: 13 }}>{v}</Text><br /><Text type="secondary" style={{ fontSize: 11 }}>{r.itemCode}</Text></>
      )
    },
    { title: 'Warehouse', dataIndex: 'warehouseName', render: (v: string) => <Text style={{ fontSize: 13 }}>{v}</Text> },
    {
      title: 'Qty', key: 'qty', align: 'right' as const,
      render: (_: any, r: any) => {
        const m = MOVEMENT_LABELS[r.movementType];
        const isIn = m?.dir === 'IN';
        return <Text strong style={{ color: isIn ? '#52c41a' : '#ff4d4f' }}>{isIn ? '+' : '-'}{parseFloat(r.quantity).toFixed(2)} {r.uom}</Text>;
      }
    },
    { title: 'WAC (₹)', dataIndex: 'valuationRatePaise', align: 'right' as const, render: (v: number) => <Text>₹{(v / 100).toFixed(2)}</Text> },
    { title: 'Value', dataIndex: 'valuationAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Stock Ledger</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>Append-only audit trail of every stock movement</Text>
      </div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Select allowClear showSearch optionFilterProp="label" placeholder="Filter by Item" value={itemFilter} onChange={setItemFilter} style={{ minWidth: 240 }}
          options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))} />
        <Select allowClear placeholder="Filter by Warehouse" value={whFilter} onChange={setWhFilter} style={{ minWidth: 200 }}
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
      </div>
      <div style={cardStyle}>
        <Table
          dataSource={rows}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 50, hideOnSinglePage: true }}
          locale={{ emptyText: 'No ledger entries yet. Approve transactions to see movements here.' }}
        />
      </div>
    </div>
  );
}
