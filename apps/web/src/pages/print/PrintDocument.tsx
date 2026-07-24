import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Table, Typography, Spin, Row, Col, Card } from 'antd';
import { PrinterOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import { usePlantStore } from '../../store/plant';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

interface DocumentHeader {
  id: string;
  documentNumber: string;
  postingDate?: string;
  orderDate?: string;
  requisitionDate?: string;
  status: string;
  supplierName?: string;
  customerName?: string;
  supplierInvoiceNumber?: string;
  netAmountPaise?: number;
  taxAmountPaise?: number;
  totalAmountPaise?: number;
  narration?: string;
  lines?: any[];
}

export function PrintDocumentPage() {
  const { docType, id } = useParams<{ docType: string; id: string }>();
  const navigate = useNavigate();
  const { company, plant } = usePlantStore();

  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState<DocumentHeader | null>(null);

  useEffect(() => {
    async function fetchDoc() {
      setLoading(true);
      try {
        let endpoint = '';
        if (docType === 'purchase_order' || docType === 'po') endpoint = `/purchase/orders/${id}`;
        else if (docType === 'purchase_requisition' || docType === 'pr') endpoint = `/purchase/requisitions/${id}`;
        else if (docType === 'grn') endpoint = `/purchase/grn/${id}`;
        else if (docType === 'purchase_invoice') endpoint = `/purchase/invoices/${id}`;
        else if (docType === 'sales_order' || docType === 'so') endpoint = `/sales/orders/${id}`;
        else if (docType === 'sales_invoice') endpoint = `/sales/invoices/${id}`;
        else if (docType === 'quotation') endpoint = `/sales/quotations/${id}`;

        if (endpoint) {
          const res = await api.get(endpoint);
          setDoc(res.data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }

    if (id && docType) fetchDoc();
  }, [docType, id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Loading printable document..." />
      </div>
    );
  }

  const docTitle = docType?.replace(/_/g, ' ').toUpperCase() || 'DOCUMENT';

  return (
    <div style={{ background: '#fff', minHeight: '100vh', padding: 32 }}>
      {/* Screen action bar — hidden during print */}
      <div className="no-print" style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between' }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Back
        </Button>
        <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint}>
          Print Document
        </Button>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .printable-card { border: none !important; box-shadow: none !important; padding: 0 !important; }
        }
      `}</style>

      <Card className="printable-card" style={{ maxWidth: 900, margin: '0 auto' }}>
        {/* Document Header */}
        <Row justify="space-between" align="middle" style={{ borderBottom: '2px solid #111', paddingBottom: 16, marginBottom: 24 }}>
          <Col span={14}>
            <Title level={3} style={{ margin: 0, textTransform: 'uppercase', color: '#1D4ED8' }}>
              {company?.name || 'ERP ENTERPRISE'}
            </Title>
            <Text type="secondary" style={{ display: 'block' }}>
              {plant?.name || 'Main Plant'}
            </Text>
            {company?.gstin && <Text style={{ display: 'block', fontSize: 12 }}>GSTIN: {company.gstin}</Text>}
          </Col>
          <Col span={10} style={{ textAlign: 'right' }}>
            <Title level={4} style={{ margin: 0, color: '#333' }}>
              {docTitle}
            </Title>
            <Text strong style={{ fontSize: 16 }}>
              #{doc?.documentNumber || id}
            </Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary">Date: </Text>
              <Text>{doc?.postingDate || doc?.orderDate || new Date().toISOString().slice(0, 10)}</Text>
            </div>
          </Col>
        </Row>

        {/* Party Info */}
        <Row gutter={24} style={{ marginBottom: 24 }}>
          <Col span={12}>
            <Card size="small" title="Billed To / Party" style={{ background: '#fafafa' }}>
              <Text strong style={{ display: 'block', fontSize: 15 }}>
                {doc?.supplierName || doc?.customerName || 'Vendor / Customer'}
              </Text>
              {doc?.supplierInvoiceNumber && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  Ref # {doc.supplierInvoiceNumber}
                </Text>
              )}
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="Document Details" style={{ background: '#fafafa' }}>
              <div>
                <Text type="secondary">Status: </Text>
                <Text strong style={{ textTransform: 'uppercase' }}>
                  {doc?.status || 'APPROVED'}
                </Text>
              </div>
              {doc?.narration && (
                <div style={{ marginTop: 4 }}>
                  <Text type="secondary">Notes: </Text>
                  <Text>{doc.narration}</Text>
                </div>
              )}
            </Card>
          </Col>
        </Row>

        {/* Line Items Table */}
        <Table
          pagination={false}
          rowKey={(r, idx) => r.id || idx}
          dataSource={doc?.lines || []}
          columns={[
            { title: '#', render: (_, __, idx) => idx + 1, width: 50 },
            { title: 'Item Description', dataIndex: 'itemName', render: (val: string, r: any) => val || r.itemCode || 'Line Item' },
            { title: 'Qty', dataIndex: 'quantity', align: 'right' as const, render: (val: any) => val || 1 },
            { title: 'UOM', dataIndex: 'uom', width: 80, render: (val: string) => val || 'PCS' },
            {
              title: 'Rate (₹)',
              dataIndex: 'unitPricePaise',
              align: 'right' as const,
              render: (val: number) => (val ? <AmountDisplay paise={val} /> : '—'),
            },
            {
              title: 'Amount (₹)',
              dataIndex: 'amountPaise',
              align: 'right' as const,
              render: (val: number, r: any) => <AmountDisplay paise={val || r.totalAmountPaise || 0} bold />,
            },
          ]}
        />

        {/* Summary Card */}
        <Row style={{ justifyContent: 'flex-end', marginTop: 24 }}>
          <Col span={10}>
            <div style={{ borderTop: '2px solid #eee', paddingTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text type="secondary">Taxable Amount:</Text>
                <AmountDisplay paise={doc?.netAmountPaise || doc?.totalAmountPaise || 0} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text type="secondary">GST Tax Total:</Text>
                <AmountDisplay paise={doc?.taxAmountPaise || 0} />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '2px solid #111',
                  paddingTop: 8,
                  marginTop: 8,
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  Total Amount:
                </Title>
                <AmountDisplay paise={doc?.totalAmountPaise || 0} bold />
              </div>
            </div>
          </Col>
        </Row>

        {/* Signatures & Footer */}
        <Row style={{ marginTop: 60, borderTop: '1px solid #ddd', paddingTop: 32 }}>
          <Col span={12}>
            <Text type="secondary">Prepared By: ___________________</Text>
          </Col>
          <Col span={12} style={{ textAlign: 'right' }}>
            <Text type="secondary">Authorized Signatory: ___________________</Text>
          </Col>
        </Row>
      </Card>
    </div>
  );
}
export default PrintDocumentPage;
