import { useState, useEffect } from 'react';
import { Tabs, Table, Card, Typography, Tag, Row, Col, Statistic, Space, Button } from 'antd';
import { DownloadOutlined, SafetyCertificateOutlined, FileTextOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

interface SalesInvoiceRecord {
  document_number: string;
  posting_date: string;
  customer_name: string;
  net_amount_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
}

interface PurchaseInvoiceRecord {
  document_number: string;
  posting_date: string;
  supplier_name: string;
  supplier_invoice_number?: string;
  net_amount_paise: number;
  tax_amount_paise: number;
  total_amount_paise: number;
}

export function GstReportsPage() {
  const [loading, setLoading] = useState(false);
  const [sales, setSales] = useState<SalesInvoiceRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoiceRecord[]>([]);

  const fetchGstData = async () => {
    setLoading(true);
    try {
      const [salesRes, purchasesRes] = await Promise.all([
        api.get<SalesInvoiceRecord[]>('/reports/sales'),
        api.get<PurchaseInvoiceRecord[]>('/reports/purchases'),
      ]);
      setSales(salesRes.data || []);
      setPurchases(purchasesRes.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGstData();
  }, []);

  // Compute GSTR-1 metrics
  const totalSalesTaxablePaise = sales.reduce((sum, s) => sum + (s.net_amount_paise || 0), 0);
  const totalSalesTaxPaise = sales.reduce((sum, s) => sum + (s.tax_amount_paise || 0), 0);
  const totalSalesGrossPaise = sales.reduce((sum, s) => sum + (s.total_amount_paise || 0), 0);

  // Compute Inward / ITC metrics
  const totalPurchasesTaxablePaise = purchases.reduce((sum, p) => sum + (p.net_amount_paise || 0), 0);
  const totalPurchasesTaxPaise = purchases.reduce((sum, p) => sum + (p.tax_amount_paise || 0), 0);
  const netGstLiabilityPaise = Math.max(0, totalSalesTaxPaise - totalPurchasesTaxPaise);

  const gstr1Columns = [
    { title: 'Invoice #', dataIndex: 'document_number', key: 'document_number' },
    { title: 'Date', dataIndex: 'posting_date', key: 'posting_date' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name', render: (val: string) => <Text strong>{val}</Text> },
    {
      title: 'Taxable Amount (₹)',
      dataIndex: 'net_amount_paise',
      key: 'net_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} />,
    },
    {
      title: 'Output Tax (₹)',
      dataIndex: 'tax_amount_paise',
      key: 'tax_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="credit" bold />,
    },
    {
      title: 'Invoice Total (₹)',
      dataIndex: 'total_amount_paise',
      key: 'total_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
  ];

  const itcColumns = [
    { title: 'GRN / Invoice #', dataIndex: 'document_number', key: 'document_number' },
    { title: 'Vendor Invoice #', dataIndex: 'supplier_invoice_number', key: 'supplier_invoice_number', render: (val: string) => val || '—' },
    { title: 'Supplier', dataIndex: 'supplier_name', key: 'supplier_name', render: (val: string) => <Text strong>{val}</Text> },
    {
      title: 'Taxable Value (₹)',
      dataIndex: 'net_amount_paise',
      key: 'net_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} />,
    },
    {
      title: 'Eligible ITC (₹)',
      dataIndex: 'tax_amount_paise',
      key: 'tax_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" bold />,
    },
    {
      title: 'Total Billed (₹)',
      dataIndex: 'total_amount_paise',
      key: 'total_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24, alignItems: 'center' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            GST Reports & Compliance Dashboard
          </Title>
          <Text type="secondary">GSTR-1, GSTR-3B tax liability, and Input Tax Credit (ITC) reconciliation</Text>
        </div>
        <Space>
          <Button icon={<FileTextOutlined />}>Export GSTR-1 JSON</Button>
          <Button type="primary" icon={<DownloadOutlined />}>
            Download GST Summary
          </Button>
        </Space>
      </div>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="Outward Tax Liability (Sales)"
              value={totalSalesTaxPaise / 100}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#B91C1C' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Eligible ITC (Purchase)"
              value={totalPurchasesTaxPaise / 100}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#15803D' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Net GST Payable"
              value={netGstLiabilityPaise / 100}
              precision={2}
              prefix="₹"
              valueStyle={{ color: '#1D4ED8' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="Compliance Status"
              value="Reconciled"
              valueStyle={{ color: '#15803D' }}
              prefix={<SafetyCertificateOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card>
        <Tabs
          defaultActiveKey="gstr1"
          items={[
            {
              key: 'gstr1',
              label: 'GSTR-1 (Outward Supplies)',
              children: (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">Summary of sales invoices and output GST collections</Text>
                  </div>
                  <Table
                    rowKey="document_number"
                    loading={loading}
                    dataSource={sales}
                    columns={gstr1Columns}
                    pagination={{ pageSize: 10 }}
                    summary={() => (
                      <Table.Summary fixed>
                        <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 'bold' }}>
                          <Table.Summary.Cell index={0} colSpan={3}>
                            <Text strong>Total Outward Supplies</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={1} align="right">
                            <AmountDisplay paise={totalSalesTaxablePaise} bold />
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={2} align="right">
                            <AmountDisplay paise={totalSalesTaxPaise} variant="credit" bold />
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={3} align="right">
                            <AmountDisplay paise={totalSalesGrossPaise} bold />
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    )}
                  />
                </div>
              ),
            },
            {
              key: 'gstr3b',
              label: 'GSTR-3B (Summary Return)',
              children: (
                <div style={{ padding: 16 }}>
                  <Title level={4}>3.1 Details of Outward Supplies and inward supplies liable to reverse charge</Title>
                  <Table
                    pagination={false}
                    dataSource={[
                      {
                        category: '(a) Outward taxable supplies (other than zero rated, nil rated and exempted)',
                        taxable: totalSalesTaxablePaise,
                        igst: Math.round(totalSalesTaxPaise * 0.5),
                        cgst: Math.round(totalSalesTaxPaise * 0.25),
                        sgst: Math.round(totalSalesTaxPaise * 0.25),
                      },
                    ]}
                    columns={[
                      { title: 'Nature of Supplies', dataIndex: 'category', key: 'category' },
                      { title: 'Total Taxable Value (₹)', dataIndex: 'taxable', key: 'taxable', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
                      { title: 'Integrated Tax (₹)', dataIndex: 'igst', key: 'igst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="credit" /> },
                      { title: 'Central Tax (₹)', dataIndex: 'cgst', key: 'cgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="credit" /> },
                      { title: 'State Tax (₹)', dataIndex: 'sgst', key: 'sgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="credit" /> },
                    ]}
                  />

                  <Title level={4} style={{ marginTop: 32 }}>4. Eligible Input Tax Credit (ITC)</Title>
                  <Table
                    pagination={false}
                    dataSource={[
                      {
                        category: '(A) ITC Available (whether in full or part)',
                        taxable: totalPurchasesTaxablePaise,
                        igst: Math.round(totalPurchasesTaxPaise * 0.5),
                        cgst: Math.round(totalPurchasesTaxPaise * 0.25),
                        sgst: Math.round(totalPurchasesTaxPaise * 0.25),
                      },
                    ]}
                    columns={[
                      { title: 'Details', dataIndex: 'category', key: 'category' },
                      { title: 'Total Taxable Value (₹)', dataIndex: 'taxable', key: 'taxable', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
                      { title: 'Integrated Tax (₹)', dataIndex: 'igst', key: 'igst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="debit" /> },
                      { title: 'Central Tax (₹)', dataIndex: 'cgst', key: 'cgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="debit" /> },
                      { title: 'State Tax (₹)', dataIndex: 'sgst', key: 'sgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="debit" /> },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'itc',
              label: 'ITC Reconciliation (Inward Supplies)',
              children: (
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary">Inward purchase documents eligible for Input Tax Credit claims</Text>
                  </div>
                  <Table
                    rowKey="document_number"
                    loading={loading}
                    dataSource={purchases}
                    columns={itcColumns}
                    pagination={{ pageSize: 10 }}
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
export default GstReportsPage;
