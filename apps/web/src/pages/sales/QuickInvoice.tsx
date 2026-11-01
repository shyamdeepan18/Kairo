import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card, Form, Input, InputNumber, Select, Button, Row, Col, Typography,
  Table, Space, Radio, Tag, message, Modal, Divider,
} from 'antd';
import {
  Zap, Plus, Trash2, Printer, CheckCircle, User, Phone, MapPin, Receipt,
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { salesApi, type Customer } from '../../api/sales';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type TaxCode, type Warehouse } from '../../api/settings';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { DynamicCustomFields } from '../../components/DynamicCustomFields';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

interface QuickLine {
  key: string;
  itemId?: string;
  description?: string;
  quantity: number;
  uom: string;
  ratePaise: number;
  discountPercent: number;
  taxCodeId?: string;
}

export function QuickInvoicePage() {
  const navigate = useNavigate();
  const { company, plant } = usePlantStore();
  const [form] = Form.useForm();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [customerMode, setCustomerMode] = useState<'walkin' | 'registered'>('walkin');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'card' | 'bank_transfer' | 'credit'>('cash');
  const [loading, setLoading] = useState(false);
  const [completedDoc, setCompletedDoc] = useState<any | null>(null);

  const [lines, setLines] = useState<QuickLine[]>([
    { key: 'line_1', quantity: 1, uom: 'NOS', ratePaise: 0, discountPercent: 0 },
  ]);

  // Load masters on mount
  useEffect(() => {
    if (!company?.id) return;
    Promise.all([
      salesApi.customers.list(company.id),
      mastersApi.listItems(company.id),
      settingsApi.listTaxCodes(company.id),
      settingsApi.listWarehouses(company.id, plant?.id),
    ]).then(([c, it, tc, wh]) => {
      setCustomers(c.data || []);
      setItems(it);
      setTaxCodes(tc);
      setWarehouses(wh);
    }).catch(() => message.error('Failed to load masters'));
  }, [company?.id, plant?.id]);

  // Line calculations
  const calculatedLines = useMemo(() => {
    return lines.map((l) => {
      const grossPaise = Math.round((l.quantity || 0) * (l.ratePaise || 0));
      const discountPaise = Math.round((grossPaise * (l.discountPercent || 0)) / 100);
      const netPaise = grossPaise - discountPaise;

      const tc = taxCodes.find((t) => t.id === l.taxCodeId);
      const totalTaxBp = (tc?.cgstRateBp || 0) + (tc?.sgstRateBp || 0) + (tc?.igstRateBp || 0);
      const taxPaise = Math.round((netPaise * totalTaxBp) / 10000);
      const totalPaise = netPaise + taxPaise;

      return {
        ...l,
        grossPaise,
        discountPaise,
        netPaise,
        taxPaise,
        totalPaise,
      };
    });
  }, [lines, taxCodes]);

  const totals = useMemo(() => {
    const net = calculatedLines.reduce((s, l) => s + l.netPaise, 0);
    const tax = calculatedLines.reduce((s, l) => s + l.taxPaise, 0);
    const total = net + tax;
    return { net, tax, total };
  }, [calculatedLines]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { key: `line_${Date.now()}`, quantity: 1, uom: 'NOS', ratePaise: 0, discountPercent: 0 },
    ]);
  };

  const removeLine = (key: string) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updateLine = (key: string, patch: Partial<QuickLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated = { ...l, ...patch };
        if (patch.itemId) {
          const matchedItem = items.find((i) => i.id === patch.itemId);
          if (matchedItem) {
            updated.description = matchedItem.itemName;
            updated.uom = matchedItem.primaryUom || 'NOS';
            updated.ratePaise = matchedItem.sellingPricePaise || 0;
            updated.taxCodeId = matchedItem.defaultTaxCodeId || undefined;
          }
        }
        return updated;
      })
    );
  };

  const handleCheckout = async (values: any) => {
    if (!plant?.id) {
      message.error('Please select an active plant');
      return;
    }

    const validLines = lines.filter((l) => l.itemId && l.quantity > 0);
    if (validLines.length === 0) {
      message.error('Please add at least one item to the invoice');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        plantId: plant.id,
        warehouseId: values.warehouseId || warehouses[0]?.id,
        postingDate: dayjs(values.postingDate).format('YYYY-MM-DD'),
        customerId: customerMode === 'registered' ? values.customerId : undefined,
        customerName: customerMode === 'walkin' ? values.walkinName : undefined,
        customerPhone: customerMode === 'walkin' ? values.walkinPhone : undefined,
        customerGstin: customerMode === 'walkin' ? values.walkinGstin : undefined,
        paymentMode,
        paidAmountPaise: paymentMode !== 'credit' ? totals.total : 0,
        remarks: values.remarks,
        customData: values.customData || {},
        lines: validLines.map((l) => ({
          itemId: l.itemId!,
          description: l.description,
          quantity: l.quantity,
          uom: l.uom,
          ratePaise: l.ratePaise,
          discountPercent: l.discountPercent,
          taxCodeId: l.taxCodeId,
        })),
      };

      const res = await salesApi.invoices.quickInvoice(payload);
      message.success(`Invoice ${res.invoice.documentNumber} created and posted successfully!`);
      setCompletedDoc(res);
    } catch (err: any) {
      message.error(err?.response?.data?.error || err.message || 'Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: 'Item / Product',
      key: 'item',
      width: '32%',
      render: (_: any, r: QuickLine) => (
        <Select
          showSearch
          style={{ width: '100%' }}
          placeholder="Select item..."
          optionFilterProp="label"
          value={r.itemId}
          onChange={(val) => updateLine(r.key, { itemId: val })}
          options={items.map((i) => ({
            value: i.id,
            label: `${i.itemName} (${i.itemCode})`,
          }))}
        />
      ),
    },
    {
      title: 'Qty',
      key: 'qty',
      width: '12%',
      render: (_: any, r: QuickLine) => (
        <InputNumber
          min={0.0001}
          value={r.quantity}
          onChange={(val) => updateLine(r.key, { quantity: val || 1 })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Unit Price (₹)',
      key: 'rate',
      width: '16%',
      render: (_: any, r: QuickLine) => (
        <InputNumber
          min={0}
          value={(r.ratePaise || 0) / 100}
          onChange={(val) => updateLine(r.key, { ratePaise: Math.round((val || 0) * 100) })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Tax Code',
      key: 'tax',
      width: '18%',
      render: (_: any, r: QuickLine) => (
        <Select
          placeholder="Tax (GST)"
          allowClear
          value={r.taxCodeId}
          onChange={(val) => updateLine(r.key, { taxCodeId: val })}
          style={{ width: '100%' }}
          options={taxCodes.map((tc) => ({
            value: tc.id,
            label: `${tc.code} (${((tc.cgstRateBp + tc.sgstRateBp + tc.igstRateBp) / 100).toFixed(0)}%)`,
          }))}
        />
      ),
    },
    {
      title: 'Total (₹)',
      key: 'total',
      width: '16%',
      align: 'right' as const,
      render: (_: any, r: any) => (
        <span className="font-semibold text-slate-800 dark:text-slate-100">
          ₹{((r.totalPaise || 0) / 100).toFixed(2)}
        </span>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: '6%',
      render: (_: any, r: QuickLine) => (
        <Button
          type="text"
          danger
          icon={<Trash2 size={16} />}
          onClick={() => removeLine(r.key)}
          disabled={lines.length <= 1}
        />
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/40 rounded-xl shadow-xs">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Sales</span>
              <span>/</span>
              <span className="text-amber-600 dark:text-amber-400 font-medium">Quick Counter Sale</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Quick Invoice & Counter Sale
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                POS Mode
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fast single-screen billing for walk-in retail or quick trade sales with automated movement & double-entry ledger posting
            </p>
          </div>
        </div>
        <button
          onClick={() => navigate('/sales/invoices')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl shadow-xs text-sm font-semibold transition-all"
        >
          Back to Invoices
        </button>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            postingDate: dayjs(),
            warehouseId: warehouses[0]?.id,
            walkinName: 'Walk-in Cash Customer',
          }}
          onFinish={handleCheckout}
        >
        <Row gutter={[20, 20]}>
          {/* Main Left Column: Customer & Items */}
          <Col xs={24} lg={16} className="space-y-4">
            {/* Customer Details Box */}
            <Card
              size="small"
              title={
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">Customer Details</span>
                  <Radio.Group
                    size="small"
                    value={customerMode}
                    onChange={(e) => setCustomerMode(e.target.value)}
                  >
                    <Radio.Button value="walkin">Walk-in Customer</Radio.Button>
                    <Radio.Button value="registered">Registered Party</Radio.Button>
                  </Radio.Group>
                </div>
              }
            >
              {customerMode === 'walkin' ? (
                <Row gutter={12}>
                  <Col xs={24} sm={10}>
                    <Form.Item name="walkinName" label="Customer Name" rules={[{ required: true }]}>
                      <Input prefix={<User size={14} className="text-slate-400" />} placeholder="e.g. John Doe" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={7}>
                    <Form.Item name="walkinPhone" label="Phone / Mobile">
                      <Input prefix={<Phone size={14} className="text-slate-400" />} placeholder="Mobile number" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={7}>
                    <Form.Item name="walkinGstin" label="GSTIN (Optional)">
                      <Input placeholder="15-digit GSTIN" maxLength={15} />
                    </Form.Item>
                  </Col>
                </Row>
              ) : (
                <Row gutter={12}>
                  <Col xs={24} sm={16}>
                    <Form.Item name="customerId" label="Select Customer" rules={[{ required: true, message: 'Please select a customer' }]}>
                      <Select
                        showSearch
                        placeholder="Search existing customer..."
                        optionFilterProp="label"
                        options={customers.map((c) => ({
                          value: c.id,
                          label: `${c.name} (${c.customerCode})`,
                        }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={8}>
                    <Button type="dashed" className="mt-7 w-full" onClick={() => navigate('/masters/parties')}>
                      + New Customer Master
                    </Button>
                  </Col>
                </Row>
              )}
            </Card>

            {/* Line Items Table */}
            <Card
              size="small"
              title={<span className="font-semibold text-sm">Products & Services</span>}
              extra={
                <Button size="small" type="primary" icon={<Plus size={14} />} onClick={addLine}>
                  Add Item
                </Button>
              }
            >
              <Table
                dataSource={calculatedLines}
                columns={columns}
                pagination={false}
                size="small"
                rowKey="key"
              />
            </Card>

            {/* Dynamic Custom Fields (L2 Form Injection) */}
            <DynamicCustomFields
              companyId={company?.id}
              documentType="sales.invoice"
              title="Custom Invoice Attributes (L2)"
            />
          </Col>

          {/* Right Column: Checkout Summary & Settings */}
          <Col xs={24} lg={8} className="space-y-4">
            <Card size="small" title={<span className="font-semibold text-sm">Order Context</span>}>
              <Form.Item name="postingDate" label="Invoice Date" rules={[{ required: true }]}>
                <Input type="date" style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item name="warehouseId" label="Dispatch Warehouse">
                <Select
                  placeholder="Select warehouse"
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseType})` }))}
                />
              </Form.Item>

              <Form.Item name="remarks" label="Invoice Remarks / Note">
                <Input.TextArea rows={2} placeholder="Optional counter memo..." />
              </Form.Item>
            </Card>

            {/* Payment & Grand Total Box */}
            <Card
              className="border-indigo-200 dark:border-indigo-900 shadow-sm bg-gradient-to-br from-indigo-50/50 to-white dark:from-slate-900/60 dark:to-slate-900"
              title={<span className="font-bold text-base text-indigo-950 dark:text-indigo-200">Payment & Settlement</span>}
            >
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>Subtotal Net:</span>
                  <AmountDisplay paise={totals.net} />
                </div>
                <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
                  <span>GST Tax:</span>
                  <AmountDisplay paise={totals.tax} />
                </div>
                <Divider className="my-2" />
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-base text-slate-800 dark:text-slate-100">Grand Total:</span>
                  <span className="text-2xl font-extrabold text-indigo-700 dark:text-indigo-400">
                    ₹{(totals.total / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <Text strong className="block text-xs uppercase text-slate-500 mb-2">
                  Payment Mode
                </Text>
                <Radio.Group
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full grid grid-cols-2 gap-2"
                >
                  <Radio.Button value="cash" className="text-center">Cash</Radio.Button>
                  <Radio.Button value="upi" className="text-center">UPI</Radio.Button>
                  <Radio.Button value="card" className="text-center">Card</Radio.Button>
                  <Radio.Button value="bank_transfer" className="text-center">Bank Transfer</Radio.Button>
                  <Radio.Button value="credit" className="text-center col-span-2">Credit (Pay Later)</Radio.Button>
                </Radio.Group>
              </div>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                loading={loading}
                icon={<Zap size={18} />}
                className="w-full h-12 text-base font-bold bg-indigo-600 hover:bg-indigo-500"
              >
                Complete Sale & Print
              </Button>
            </Card>
          </Col>
        </Row>
      </Form>

      {/* Completion Modal with Print Action */}
      <Modal
        open={Boolean(completedDoc)}
        onCancel={() => {
          setCompletedDoc(null);
          form.resetFields();
          setLines([{ key: 'line_1', quantity: 1, uom: 'NOS', ratePaise: 0, discountPercent: 0 }]);
        }}
        footer={[
          <Button
            key="print"
            type="primary"
            icon={<Printer size={16} />}
            onClick={() => navigate(`/print/sales.invoice/${completedDoc?.invoice?.id}`)}
          >
            Print Tax Invoice
          </Button>,
          <Button
            key="next"
            onClick={() => {
              setCompletedDoc(null);
              form.resetFields();
              setLines([{ key: 'line_1', quantity: 1, uom: 'NOS', ratePaise: 0, discountPercent: 0 }]);
            }}
          >
            Start Next Sale
          </Button>,
        ]}
      >
        <div className="py-6 text-center space-y-3">
          <div className="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-full dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle size={36} />
          </div>
          <Title level={4} className="m-0">Sale Completed Successfully!</Title>
          <Paragraph type="secondary">
            Invoice <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{completedDoc?.invoice?.documentNumber}</span> has been approved and posted to the general ledger.
          </Paragraph>
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-left text-xs space-y-1">
            <div className="flex justify-between">
              <span>Amount Paid:</span>
              <span className="font-semibold">₹{((completedDoc?.invoice?.totalAmountPaise || 0) / 100).toFixed(2)}</span>
            </div>
            {completedDoc?.receipt && (
              <div className="flex justify-between">
                <span>Receipt Number:</span>
                <span className="font-mono font-semibold">{completedDoc.receipt.documentNumber}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Revenue Journal Voucher:</span>
              <span className="font-mono text-indigo-600">{completedDoc?.journalEntryId || 'Posted'}</span>
            </div>
            {completedDoc?.cogsJournalEntryId && (
              <div className="flex justify-between">
                <span>COGS Journal Voucher:</span>
                <span className="font-mono text-indigo-600">{completedDoc.cogsJournalEntryId}</span>
              </div>
            )}
          </div>
        </div>
      </Modal>
      </div>
    </div>
  );
}
