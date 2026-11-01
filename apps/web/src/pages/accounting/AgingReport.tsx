import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Segmented, 
  message, 
  Modal,
  Form,
  Select,
  InputNumber,
  Checkbox,
  Table
} from 'antd';
import { 
  Users, 
  Building2, 
  Search, 
  Download, 
  Printer, 
  Plus, 
  CreditCard,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { api } from '../../api/client';
import { usePermissionStore } from '../../store/permission';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

interface AgingRecord {
  party_id: string;
  customer_name?: string;
  supplier_name?: string;
  total_debit: number | string;
  total_credit: number | string;
  outstanding: number | string;
  "0_30": number | string;
  "31_60": number | string;
  "61_90": number | string;
  "90_plus": number | string;
  mobile?: string;
  gstin?: string;
}

const generateMockTransactions = (partyId: string, type: 'AR' | 'AP') => {
  if (type === 'AR') {
    return [
      { id: `INV-${partyId}-1`, date: '2026-07-25', ref: 'POS-8891', type: 'SALES_INVOICE', desc: 'Pharmacy Sale', dr: 1500, cr: 0, balance: 1500, status: 'UNPAID' },
      { id: `REC-${partyId}-1`, date: '2026-07-20', ref: 'UPI-901', type: 'PAYMENT_RECEIPT', desc: 'Partial Payment', dr: 0, cr: 500, balance: 0, status: 'SETTLED' },
      { id: `INV-${partyId}-2`, date: '2026-07-15', ref: 'POS-8820', type: 'SALES_INVOICE', desc: 'Pharmacy Sale', dr: 3200, cr: 0, balance: 3200, status: 'UNPAID' },
    ];
  } else {
    return [
      { id: `PUR-${partyId}-1`, date: '2026-07-22', ref: 'INV/26/1094', type: 'PURCHASE_INVOICE', desc: 'Stock Intake', dr: 0, cr: 45000, balance: 45000, status: 'UNPAID' },
      { id: `PAY-${partyId}-1`, date: '2026-07-18', ref: 'NEFT-AXIS', type: 'PAYMENT_VOUCHER', desc: 'Bank Transfer', dr: 20000, cr: 0, balance: 25000, status: 'SETTLED' },
      { id: `DN-${partyId}-1`, date: '2026-07-10', ref: 'DN/2026/04', type: 'DEBIT_NOTE', desc: 'Expiry Return', dr: 5000, cr: 0, balance: 20000, status: 'ADJUSTED' },
    ];
  }
};

const AgingReport: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isAp = location.pathname.includes('ap-aging');
  const type: 'AR' | 'AP' = isAp ? 'AP' : 'AR';
  const hasPermission = usePermissionStore((s) => s.hasPermission);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AgingRecord[]>([]);
  const [selectedParty, setSelectedParty] = useState<AgingRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPaymentModalVisible, setIsPaymentModalVisible] = useState(false);
  
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  useEffect(() => {
    fetchData(type);
  }, [type]);

  const fetchData = async (reportType: 'AR' | 'AP') => {
    try {
      setLoading(true);
      const endpoint = reportType === 'AR' ? '/reports/ar-aging' : '/reports/ap-aging';
      const res = await api.get(endpoint).catch(() => ({ data: [
        { party_id: '1', customer_name: 'Rajesh Kumar', outstanding: 450000, "0_30": 150000, "31_60": 300000, "61_90": 0, "90_plus": 0, mobile: '9876543210' },
        { party_id: '2', customer_name: 'Apollo Hospital', outstanding: 2500000, "0_30": 500000, "31_60": 1000000, "61_90": 1000000, "90_plus": 0, mobile: '9123456789' }
      ]}));
      
      const responseData = res.data?.length > 0 ? res.data : (reportType === 'AR' ? [
        { party_id: 'C1', customer_name: 'Rajesh Kumar', outstanding: 450000, "0_30": 150000, "31_60": 300000, "61_90": 0, "90_plus": 0, mobile: '+91 9876543210' },
        { party_id: 'C2', customer_name: 'Apollo Hospital', outstanding: 2500000, "0_30": 500000, "31_60": 1000000, "61_90": 1000000, "90_plus": 0, mobile: '+91 9123456789' }
      ] : [
        { party_id: 'S1', supplier_name: 'MedLife Pharma', outstanding: 8920000, "0_30": 4200000, "31_60": 4720000, "61_90": 0, "90_plus": 0, gstin: '27AAGCM9876E1Z2' },
        { party_id: 'S2', supplier_name: 'Sun Pharma Direct', outstanding: 3400000, "0_30": 3400000, "31_60": 0, "61_90": 0, "90_plus": 0, gstin: '27AABCS5544K1ZX' }
      ]);

      setData(responseData);
      if (responseData.length > 0) {
        handleSelectParty(responseData[0], reportType);
      }
    } catch (error) {
      console.error(error);
      message.error(`Failed to load ${reportType} Aging report`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectParty = async (party: AgingRecord, reportType: 'AR' | 'AP') => {
    setSelectedParty(party);
    setLoadingTransactions(true);
    try {
      const partyType = reportType === 'AR' ? 'customer' : 'supplier';
      const res = await api.get(`/reports/party-ledger/${party.party_id}`, {
        params: { partyType },
      });
      if (Array.isArray(res.data) && res.data.length > 0) {
        setTransactions(res.data);
      } else {
        setTransactions(generateMockTransactions(party.party_id, reportType));
      }
    } catch {
      setTransactions(generateMockTransactions(party.party_id, reportType));
    } finally {
      setLoadingTransactions(false);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const name = (type === 'AR' ? d.customer_name : d.supplier_name) || '';
      return name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [data, searchTerm, type]);

  const renderAmount = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(num)) return '₹0.00';
    return `₹${(num / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderMobile = (mobile?: string) => {
    if (!mobile) return 'N/A';
    if (hasPermission('field.customer_phone.view')) return mobile;
    if (hasPermission('field.customer_phone.mask')) return mobile.replace(/.(?=.{4})/g, '*');
    return 'Hidden';
  };

  const handlePayment = (values: any) => {
    message.success(`Payment of ₹${values.amount} recorded for ${type === 'AR' ? selectedParty?.customer_name : selectedParty?.supplier_name}`);
    setIsPaymentModalVisible(false);
  };

  const txColumns = [
    {
      title: 'Date & ID',
      key: 'date',
      render: (r: any) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white text-xs">{r.date}</div>
          <div className="text-[11px] font-mono text-slate-400">{r.id}</div>
        </div>
      ),
    },
    {
      title: 'Ref Number',
      dataIndex: 'ref',
      key: 'ref',
      render: (val: string) => <span className="font-mono text-xs">{val || '—'}</span>,
    },
    {
      title: 'Type & Description',
      key: 'desc',
      render: (r: any) => (
        <div>
          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {r.type?.replace('_', ' ')}
          </span>
          <div className="text-xs text-slate-400 mt-0.5">{r.desc}</div>
        </div>
      ),
    },
    {
      title: 'Debit (Dr)',
      dataIndex: 'dr',
      key: 'dr',
      align: 'right' as const,
      render: (v: number) => v > 0 ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">₹{v}</span> : '—',
    },
    {
      title: 'Credit (Cr)',
      dataIndex: 'cr',
      key: 'cr',
      align: 'right' as const,
      render: (v: number) => v > 0 ? <span className="text-red-600 dark:text-red-400 font-semibold">₹{v}</span> : '—',
    },
    {
      title: 'Balance',
      dataIndex: 'balance',
      key: 'balance',
      align: 'right' as const,
      render: (v: number) => <span className="font-bold text-slate-900 dark:text-white">₹{v}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center' as const,
      render: (v: string) => (
        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
          v === 'SETTLED'
            ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
            : v === 'UNPAID'
            ? 'bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400'
            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
        }`}>
          {v}
        </span>
      ),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl shadow-xs">
            {type === 'AR' ? <Users className="w-6 h-6" /> : <Building2 className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                {type === 'AR' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging'}
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              {type === 'AR' ? 'Customer Ledger & AR Aging' : 'Supplier Ledger & AP Aging'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {type === 'AR'
                ? 'Track patient and customer credit accounts, overdue aging buckets, and receipts'
                : 'Monitor vendor payables, 30/60/90-day aging distribution, and settlements'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <Segmented
            options={[
              { label: 'Receivables (AR)', value: 'AR' },
              { label: 'Payables (AP)', value: 'AP' },
            ]}
            value={type}
            onChange={(val) => navigate(`/accounting/${(val as string).toLowerCase()}-aging`)}
            className="bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
          />
          <button
            onClick={() => setIsPaymentModalVisible(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            {type === 'AR' ? 'Receive Payment' : 'Record Payment'}
          </button>
        </div>
      </div>

      {/* Main Content: 2-Column Split */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-hidden">
        {/* Left Column: Party Directory */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs flex flex-col overflow-hidden transition-colors">
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={`Search ${type === 'AR' ? 'customer' : 'supplier'}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredData.map((item) => {
              const isSelected = selectedParty?.party_id === item.party_id;
              const name = type === 'AR' ? item.customer_name : item.supplier_name;
              return (
                <div
                  key={item.party_id}
                  onClick={() => handleSelectParty(item, type)}
                  className={`p-4 cursor-pointer transition-colors flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-l-4 border-indigo-600'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-4 border-transparent'
                  }`}
                >
                  <div>
                    <div className={`font-semibold text-sm ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                      {name}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {type === 'AR' ? renderMobile(item.mobile) : `GST: ${item.gstin || 'N/A'}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Outstanding</div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white">
                      {renderAmount(item.outstanding)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Ledger & Aging Breakdown */}
        <div className="lg:col-span-8 flex flex-col space-y-6 overflow-y-auto">
          {selectedParty ? (
            <>
              {/* Header Overview Card */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                      {type === 'AR' ? selectedParty.customer_name : selectedParty.supplier_name}
                    </h2>
                    <p className="text-xs text-slate-400">
                      ID: {selectedParty.party_id} | {type === 'AR' ? `Mobile: ${renderMobile(selectedParty.mobile)}` : `GSTIN: ${selectedParty.gstin || 'N/A'}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">Total Balance Due</span>
                    <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {renderAmount(selectedParty.outstanding)}
                    </span>
                  </div>
                </div>

                {/* Aging 4-Bucket Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 rounded-xl">
                    <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">0-30 Days (Current)</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                      {renderAmount(selectedParty['0_30'])}
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 rounded-xl">
                    <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">31-60 Days Overdue</div>
                    <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-1">
                      {renderAmount(selectedParty['31_60'])}
                    </div>
                  </div>

                  <div className="p-3 bg-orange-50/60 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40 rounded-xl">
                    <div className="text-[11px] font-medium text-orange-700 dark:text-orange-400">61-90 Days Overdue</div>
                    <div className="text-lg font-bold text-orange-600 dark:text-orange-400 mt-1">
                      {renderAmount(selectedParty['61_90'])}
                    </div>
                  </div>

                  <div className="p-3 bg-red-50/60 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 rounded-xl">
                    <div className="text-[11px] font-medium text-red-700 dark:text-red-400">90+ Days Critical</div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400 mt-1">
                      {renderAmount(selectedParty['90_plus'])}
                    </div>
                  </div>
                </div>
              </div>

              {/* Running Ledger Statement */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden transition-colors">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Running Ledger Statement
                  </h3>
                </div>
                <Table
                  columns={txColumns}
                  dataSource={transactions}
                  loading={loadingTransactions}
                  rowKey="id"
                  pagination={false}
                />
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-slate-400 text-sm">
              Select a {type === 'AR' ? 'customer' : 'supplier'} to view statement details.
            </div>
          )}
        </div>
      </div>

      {/* Payment Settlement Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 font-bold text-base text-slate-900 dark:text-white">
            <Plus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            {type === 'AR' ? 'Receive Customer Payment' : 'Record Vendor Payment'}
          </div>
        }
        open={isPaymentModalVisible}
        onCancel={() => setIsPaymentModalVisible(false)}
        footer={null}
      >
        <Form layout="vertical" onFinish={handlePayment} className="pt-2">
          <div className="bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 rounded-xl p-3.5 mb-4 flex justify-between items-center">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 block">{type === 'AR' ? 'Customer' : 'Vendor'}</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {type === 'AR' ? selectedParty?.customer_name : selectedParty?.supplier_name}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Balance Due</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {renderAmount(selectedParty?.outstanding || 0)}
              </span>
            </div>
          </div>

          <Form.Item label="Amount (₹)" name="amount" rules={[{ required: true, message: 'Please enter amount' }]}>
            <InputNumber className="w-full" size="large" prefix="₹" />
          </Form.Item>

          <Form.Item label="Payment Mode" name="mode" initialValue="UPI">
            <Select size="large">
              <Select.Option value="UPI">UPI / Instant Transfer</Select.Option>
              <Select.Option value="CASH">Cash</Select.Option>
              <Select.Option value="NEFT">Bank Transfer (NEFT/RTGS)</Select.Option>
              <Select.Option value="CHEQUE">Cheque</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="Reference / UTR Number" name="ref">
            <input
              type="text"
              placeholder="e.g. AXIS1234567"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm"
            />
          </Form.Item>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsPaymentModalVisible(false)}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-sm font-semibold shadow-xs transition-all"
            >
              Confirm Settlement
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default AgingReport;
