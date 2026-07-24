import { Modal, Table, Tag, Typography, Alert, Space } from 'antd';
import { CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

export interface MatchLine {
  id: string;
  itemCode: string;
  itemName: string;
  poOrderedQty: number;
  poUnitPricePaise: number;
  grnReceivedQty: number;
  invoiceBilledQty: number;
  invoiceUnitPricePaise: number;
}

interface ThreeWayMatchModalProps {
  open: boolean;
  onClose: () => void;
  purchaseInvoiceNumber?: string;
  lines: MatchLine[];
}

export function ThreeWayMatchModal({
  open,
  onClose,
  purchaseInvoiceNumber,
  lines,
}: ThreeWayMatchModalProps) {
  // Compute variance flags across all lines
  const hasQuantityVariance = lines.some((l) => l.invoiceBilledQty > l.grnReceivedQty);
  const hasPriceVariance = lines.some((l) => l.invoiceUnitPricePaise > l.poUnitPricePaise);
  const isMatchValid = !hasQuantityVariance && !hasPriceVariance;

  const columns = [
    {
      title: 'Item',
      key: 'item',
      render: (_: any, r: MatchLine) => (
        <span>
          <Tag color="blue" style={{ marginRight: 8 }}>{r.itemCode}</Tag>
          <Text strong>{r.itemName}</Text>
        </span>
      ),
    },
    {
      title: 'PO Ordered Qty',
      dataIndex: 'poOrderedQty',
      key: 'poOrderedQty',
      align: 'right' as const,
    },
    {
      title: 'GRN Received Qty',
      dataIndex: 'grnReceivedQty',
      key: 'grnReceivedQty',
      align: 'right' as const,
      render: (val: number, r: MatchLine) => (
        <Text type={r.grnReceivedQty < r.poOrderedQty ? 'warning' : undefined} strong>
          {val}
        </Text>
      ),
    },
    {
      title: 'Invoice Billed Qty',
      dataIndex: 'invoiceBilledQty',
      key: 'invoiceBilledQty',
      align: 'right' as const,
      render: (val: number, r: MatchLine) => {
        const isOverBilled = val > r.grnReceivedQty;
        return (
          <Space>
            <Text style={{ color: isOverBilled ? '#B91C1C' : undefined }} strong>
              {val}
            </Text>
            {isOverBilled && <Tag color="error">Overbilled</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'PO Rate (₹)',
      dataIndex: 'poUnitPricePaise',
      key: 'poUnitPricePaise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} />,
    },
    {
      title: 'Billed Rate (₹)',
      dataIndex: 'invoiceUnitPricePaise',
      key: 'invoiceUnitPricePaise',
      align: 'right' as const,
      render: (val: number, r: MatchLine) => {
        const isHigherRate = val > r.poUnitPricePaise;
        return (
          <Space>
            <AmountDisplay paise={val} variant={isHigherRate ? 'credit' : 'neutral'} bold />
            {isHigherRate && <Tag color="warning">Price Hike</Tag>}
          </Space>
        );
      },
    },
    {
      title: 'Match Status',
      key: 'status',
      align: 'center' as const,
      render: (_: any, r: MatchLine) => {
        const qtyMatch = r.invoiceBilledQty <= r.grnReceivedQty;
        const priceMatch = r.invoiceUnitPricePaise <= r.poUnitPricePaise;

        if (qtyMatch && priceMatch) {
          return <Tag color="success" icon={<CheckCircleOutlined />}>Matched</Tag>;
        }
        return <Tag color="error" icon={<WarningOutlined />}>Variance</Tag>;
      },
    },
  ];

  return (
    <Modal
      title={
        <div>
          <Title level={4} style={{ margin: 0 }}>
            3-Way Match Verification
          </Title>
          <Text type="secondary">
            Invoice #{purchaseInvoiceNumber || 'DRAFT'} ↔ Goods Receipt Note (GRN) ↔ Purchase Order (PO)
          </Text>
        </div>
      }
      open={open}
      onCancel={onClose}
      width={1000}
      footer={null}
    >
      {isMatchValid ? (
        <Alert
          type="success"
          message="3-Way Match Verified"
          description="Billed quantities match received GRN stock, and unit prices match approved PO rates."
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : (
        <Alert
          type="warning"
          message="Variance Detected"
          description="Discrepancies found between PO rates, GRN received quantities, and vendor invoice lines."
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Table
        rowKey="id"
        dataSource={lines}
        columns={columns}
        pagination={false}
      />
    </Modal>
  );
}
export default ThreeWayMatchModal;
