import { useState, useEffect, useCallback } from 'react';
import { Table, Select, Typography, Tag, message } from 'antd';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { useCardStyle } from '../_shared/txn';

const { Title, Text } = Typography;

export function StockBalancesPage() {
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
    inventoryApi.stockBalances.list(company.id, params)
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
    { title: 'Item Code', dataIndex: 'itemCode', render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Item Name', dataIndex: 'itemName', render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Warehouse', dataIndex: 'warehouseName' },
    {
      title: 'On Hand', dataIndex: 'quantityOnHand',
      render: (v: string, r: any) => <Text strong style={{ color: parseFloat(v) < 0 ? '#ff4d4f' : undefined }}>{parseFloat(v).toFixed(2)} {r.primaryUom}</Text>
    },
    { title: 'Reserved', dataIndex: 'quantityReserved', render: (v: string, r: any) => <Text type="secondary">{parseFloat(v).toFixed(2)} {r.primaryUom}</Text> },
    {
      title: 'Available', key: 'avail',
      render: (_: any, r: any) => {
        const avail = parseFloat(r.quantityOnHand) - parseFloat(r.quantityReserved);
        return <Tag color={avail <= 0 ? 'red' : avail < 10 ? 'orange' : 'green'}>{avail.toFixed(2)} {r.primaryUom}</Tag>;
      }
    },
    { title: 'WAC (₹/unit)', dataIndex: 'valuationRatePaise', align: 'right' as const, render: (v: number) => <Text>₹{(v / 100).toFixed(2)}</Text> },
    { title: 'Stock Value', dataIndex: 'valuationAmountPaise', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} bold /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Stock Balances</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Real-time stock position per item × warehouse</Text>
        </div>
      </div>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Select allowClear showSearch optionFilterProp="label" placeholder="Filter by Item" value={itemFilter} onChange={setItemFilter} style={{ minWidth: 220 }}
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
          locale={{ emptyText: 'No stock data. Approve a GRN to see stock appear here.' }}
          summary={(pageData) => {
            const total = pageData.reduce((s, r) => s + (r.valuationAmountPaise || 0), 0);
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={7}><Text strong>Total Stock Value</Text></Table.Summary.Cell>
                <Table.Summary.Cell index={7} align="right"><AmountDisplay paise={total} bold /></Table.Summary.Cell>
              </Table.Summary.Row>
            );
          }}
        />
      </div>
    </div>
  );
}
