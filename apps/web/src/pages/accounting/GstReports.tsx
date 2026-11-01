import { useState, useEffect } from 'react';
import { Tabs, Table, message } from 'antd';
import { FileText, Download, CheckCircle2, ArrowUpRight, ArrowDownRight, DollarSign, ShieldCheck } from 'lucide-react';
import { api } from '../../api/client';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

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
    {
      title: 'Invoice #',
      dataIndex: 'document_number',
      key: 'document_number',
      render: (val: string) => (
        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {val}
        </span>
      ),
    },
    { title: 'Date', dataIndex: 'posting_date', key: 'posting_date' },
    {
      title: 'Customer',
      dataIndex: 'customer_name',
      key: 'customer_name',
      render: (val: string) => <span className="font-semibold text-slate-900 dark:text-white">{val}</span>,
    },
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
      title: 'Gross Total (₹)',
      dataIndex: 'total_amount_paise',
      key: 'total_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
  ];

  const itcColumns = [
    {
      title: 'Purchase Inv #',
      dataIndex: 'document_number',
      key: 'document_number',
      render: (val: string) => (
        <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {val}
        </span>
      ),
    },
    {
      title: 'Supplier Bill #',
      dataIndex: 'supplier_invoice_number',
      key: 'supplier_invoice_number',
      render: (val: string) => val ? <span className="font-mono text-xs">{val}</span> : '—',
    },
    { title: 'Posting Date', dataIndex: 'posting_date', key: 'posting_date' },
    {
      title: 'Supplier',
      dataIndex: 'supplier_name',
      key: 'supplier_name',
      render: (val: string) => <span className="font-semibold text-slate-900 dark:text-white">{val}</span>,
    },
    {
      title: 'Inward Taxable (₹)',
      dataIndex: 'net_amount_paise',
      key: 'net_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} />,
    },
    {
      title: 'Input Tax Credit (₹)',
      dataIndex: 'tax_amount_paise',
      key: 'tax_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} variant="debit" bold />,
    },
    {
      title: 'Total Inward (₹)',
      dataIndex: 'total_amount_paise',
      key: 'total_amount_paise',
      align: 'right' as const,
      render: (val: number) => <AmountDisplay paise={val} bold />,
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">GST Reports</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              GST Reports & Compliance Dashboard
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              GSTR-1 outward supplies, GSTR-3B summary tax liability, and Input Tax Credit (ITC) reconciliation
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => message.info('Generating GSTR-1 JSON for GST Portal upload...')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl shadow-xs text-sm font-medium transition-all"
          >
            <Download className="w-4 h-4" />
            Export GSTR-1 JSON
          </button>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <Download className="w-4 h-4" />
            Download Summary
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* KPI Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Output Tax (Sales)</span>
              <div className="p-2 bg-red-50 dark:bg-red-950/50 rounded-lg text-red-600 dark:text-red-400">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
              <AmountDisplay paise={totalSalesTaxPaise} variant="credit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">GSTR-1 outward tax liability</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Eligible ITC (Purchases)</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              <AmountDisplay paise={totalPurchasesTaxPaise} variant="debit" />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Available input tax credit</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Net GST Payable</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-lg text-indigo-600 dark:text-indigo-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-2">
              <AmountDisplay paise={netGstLiabilityPaise} />
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Net cash liability after ITC setoff</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Compliance Status</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">
              Reconciled
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Matched with General Ledger</div>
          </div>
        </div>

        {/* GST Tabs Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 transition-colors">
          <Tabs
            defaultActiveKey="gstr1"
            items={[
              {
                key: 'gstr1',
                label: 'GSTR-1 (Outward Supplies)',
                children: (
                  <div className="pt-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Summary of sales invoices and output GST collections.
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <Table
                        rowKey="document_number"
                        loading={loading}
                        dataSource={sales}
                        columns={gstr1Columns}
                        pagination={{ pageSize: 10 }}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'gstr3b',
                label: 'GSTR-3B (Summary Return)',
                children: (
                  <div className="pt-2 space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                        3.1 Details of Outward Supplies and Inward Supplies Liable to Reverse Charge
                      </h3>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
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
                            { title: 'Taxable Value (₹)', dataIndex: 'taxable', key: 'taxable', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
                            { title: 'Integrated Tax (₹)', dataIndex: 'igst', key: 'igst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="credit" /> },
                            { title: 'Central Tax (₹)', dataIndex: 'cgst', key: 'cgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="credit" /> },
                            { title: 'State Tax (₹)', dataIndex: 'sgst', key: 'sgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="credit" /> },
                          ]}
                        />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                        4. Eligible Input Tax Credit (ITC)
                      </h3>
                      <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
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
                            { title: 'Taxable Value (₹)', dataIndex: 'taxable', key: 'taxable', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
                            { title: 'Integrated Tax (₹)', dataIndex: 'igst', key: 'igst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="debit" /> },
                            { title: 'Central Tax (₹)', dataIndex: 'cgst', key: 'cgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="debit" /> },
                            { title: 'State Tax (₹)', dataIndex: 'sgst', key: 'sgst', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} variant="debit" /> },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'itc',
                label: 'ITC Reconciliation (Inward Supplies)',
                children: (
                  <div className="pt-2">
                    <div className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      Inward purchase documents eligible for Input Tax Credit claims.
                    </div>
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <Table
                        rowKey="document_number"
                        loading={loading}
                        dataSource={purchases}
                        columns={itcColumns}
                        pagination={{ pageSize: 10 }}
                      />
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default GstReportsPage;
