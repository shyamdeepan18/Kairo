import React, { useState, useEffect, useCallback } from 'react';
import { Tabs, Modal, Form, Input, InputNumber, DatePicker, Select, message, Tag } from 'antd';
import dayjs from 'dayjs';
import {
  Factory, Plus, Search, Truck, ArrowDownLeft, ArrowUpRight,
  Package, CheckCircle2, RefreshCw, Layers, ShieldCheck, FileText, ChevronRight
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi } from '../../api/manufacturing';
import { purchaseApi } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse } from '../../api/settings';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

interface JWO {
  id: string;
  documentNumber: string;
  postingDate: string;
  status: string;
  vendorId: string;
  vendorName: string;
  targetItemId: string;
  targetItemName: string;
  targetQty: string;
  issuedQty: string;
  receivedQty: string;
  uom: string;
  serviceRatePaise: number;
  totalServicePaise: number;
  expectedCompletionDate?: string | null;
  createdAt: string;
}

export function SubcontractingPage() {
  const { company, plant } = usePlantStore();
  const [activeTab, setActiveTab] = useState<'orders' | 'challans' | 'receipts'>('orders');

  const [orders, setOrders] = useState<JWO[]>([]);
  const [challans, setChallans] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  // Order modal state
  const [orderModal, setOrderModal] = useState(false);
  const [orderForm] = Form.useForm();
  const [orderMaterials, setOrderMaterials] = useState<Array<{ itemId?: string; plannedQty: number; uom: string }>>([
    { plannedQty: 1, uom: 'NOS' },
  ]);

  // Challan modal state
  const [challanModal, setChallanModal] = useState(false);
  const [selectedJwoForChallan, setSelectedJwoForChallan] = useState<JWO | null>(null);
  const [challanForm] = Form.useForm();
  const [challanLines, setChallanLines] = useState<Array<{ itemId?: string; quantity: number; uom: string; batchNumber?: string }>>([]);

  // Receipt modal state
  const [receiptModal, setReceiptModal] = useState(false);
  const [selectedJwoForReceipt, setSelectedJwoForReceipt] = useState<JWO | null>(null);
  const [receiptForm] = Form.useForm();

  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      if (activeTab === 'orders') {
        const data = await manufacturingApi.subcontracting.listOrders();
        setOrders(data);
      } else if (activeTab === 'challans') {
        const data = await manufacturingApi.subcontracting.listChallans();
        setChallans(data);
      } else if (activeTab === 'receipts') {
        const data = await manufacturingApi.subcontracting.listReceipts();
        setReceipts(data);
      }
    } catch (err: any) {
      message.error(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [company?.id, activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!company?.id) return;
    purchaseApi.suppliers.list(company.id).then((r: any) => setSuppliers(r.data || [])).catch(() => {});
    settingsApi.listWarehouses(company.id, plant?.id).then(setWarehouses).catch(() => {});
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
  }, [company?.id, plant?.id]);

  // Create JWO
  const handleCreateOrder = async (values: any) => {
    if (!company?.id || !plant?.id) return;
    const validMaterials = orderMaterials.filter((m) => m.itemId && m.plannedQty > 0);
    if (validMaterials.length === 0) {
      message.error('At least 1 raw material input is required');
      return;
    }

    setSaving(true);
    try {
      await manufacturingApi.subcontracting.createOrder({
        plantId: plant.id,
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        vendorId: values.vendorId,
        vendorWarehouseId: values.vendorWarehouseId,
        targetItemId: values.targetItemId,
        targetQty: values.targetQty,
        uom: values.uom,
        serviceRatePaise: Math.round((values.serviceRateRupees || 0) * 100),
        expectedCompletionDate: values.expectedCompletionDate?.format('YYYY-MM-DD'),
        remarks: values.remarks,
        materials: validMaterials.map((m) => ({
          itemId: m.itemId!,
          plannedQty: m.plannedQty,
          uom: m.uom,
        })),
      });

      message.success('Job Work Order created successfully');
      setOrderModal(false);
      orderForm.resetFields();
      loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || 'Failed to create order');
    } finally {
      setSaving(false);
    }
  };

  // Transition JWO
  const handleTransitionOrder = async (id: string, action: 'submit' | 'approve' | 'cancel') => {
    try {
      await manufacturingApi.subcontracting.actOrder(id, action);
      message.success(`Job work order ${action}d successfully`);
      loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || `Failed to ${action} order`);
    }
  };

  // Open Outward Challan
  const openChallanModal = async (jwo: JWO) => {
    setSelectedJwoForChallan(jwo);
    try {
      const fullJwo = await manufacturingApi.subcontracting.getOrder(jwo.id);
      setChallanLines(
        fullJwo.materials.map((m: any) => ({
          itemId: m.itemId,
          quantity: Math.max(0, parseFloat(m.plannedQty) - parseFloat(m.issuedQty)),
          uom: m.uom,
        }))
      );
      challanForm.resetFields();
      challanForm.setFieldsValue({
        postingDate: dayjs(),
        sourceWarehouseId: warehouses.find((w) => w.id !== jwo.vendorId)?.id,
      });
      setChallanModal(true);
    } catch (err: any) {
      message.error('Failed to load order materials');
    }
  };

  // Submit Outward Challan
  const handleCreateChallan = async (values: any) => {
    if (!plant?.id || !selectedJwoForChallan) return;
    const validLines = challanLines.filter((l) => l.itemId && l.quantity > 0);
    if (validLines.length === 0) {
      message.error('At least 1 item line is required for outward dispatch');
      return;
    }

    setSaving(true);
    try {
      await manufacturingApi.subcontracting.createChallan({
        plantId: plant.id,
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        jobWorkOrderId: selectedJwoForChallan.id,
        sourceWarehouseId: values.sourceWarehouseId,
        vehicleNumber: values.vehicleNumber,
        ewayBillNumber: values.ewayBillNumber,
        remarks: values.remarks,
        lines: validLines.map((l) => ({
          itemId: l.itemId!,
          quantity: l.quantity,
          uom: l.uom,
          batchNumber: l.batchNumber,
        })),
      });

      message.success('Outward Subcontracting Challan dispatched.');
      setChallanModal(false);
      loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || 'Failed to dispatch challan');
    } finally {
      setSaving(false);
    }
  };

  // Open Receipt Modal
  const openReceiptModal = (jwo: JWO) => {
    setSelectedJwoForReceipt(jwo);
    receiptForm.resetFields();
    const remaining = Math.max(0, parseFloat(jwo.targetQty) - parseFloat(jwo.receivedQty));
    receiptForm.setFieldsValue({
      postingDate: dayjs(),
      receivedQty: remaining,
      uom: jwo.uom,
      destinationWarehouseId: warehouses[0]?.id,
    });
    setReceiptModal(true);
  };

  // Submit Subcon Receipt
  const handleCreateReceipt = async (values: any) => {
    if (!plant?.id || !selectedJwoForReceipt) return;

    setSaving(true);
    try {
      await manufacturingApi.subcontracting.createReceipt({
        plantId: plant.id,
        postingDate: values.postingDate.format('YYYY-MM-DD'),
        jobWorkOrderId: selectedJwoForReceipt.id,
        destinationWarehouseId: values.destinationWarehouseId,
        receivedQty: values.receivedQty,
        uom: values.uom,
        batchNumber: values.batchNumber,
        batchExpiryDate: values.batchExpiryDate?.format('YYYY-MM-DD'),
        remarks: values.remarks,
      });

      message.success('Finished goods received and subcontractor service fee capitalized.');
      setReceiptModal(false);
      loadData();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || 'Failed to receive goods');
    } finally {
      setSaving(false);
    }
  };

  const activeOrdersCount = orders.filter(o => o.status === 'in_progress' || o.status === 'approved').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400 border border-orange-100 dark:border-orange-900/40 rounded-xl shadow-xs">
            <Factory className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Manufacturing</span>
              <span>/</span>
              <span className="text-orange-600 dark:text-orange-400 font-medium">Outside Job Work</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Subcontracting & Outside Job Work
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                GAP 4
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage outside vendor processing orders, outward raw material challans, and capitalized finished goods receipts
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="p-2 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              orderForm.resetFields();
              orderForm.setFieldsValue({
                postingDate: dayjs(),
                uom: 'NOS',
                targetQty: 100,
                serviceRateRupees: 0,
              });
              setOrderMaterials([{ plannedQty: 100, uom: 'KG' }]);
              setOrderModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          >
            <Plus className="w-4 h-4" /> New Job Work Order
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Job Work Orders</span>
              <div className="p-2 bg-orange-50 dark:bg-orange-950/50 rounded-lg text-orange-600 dark:text-orange-400">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{orders.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Total outside processing orders</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Outward RM Challans</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{challans.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Dispatched material challans</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">In-Progress Processing</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/50 rounded-lg text-amber-600 dark:text-amber-400">
                <Factory className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-2">{activeOrdersCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Active subcontractor floor work</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Finished FG Receipts</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <ArrowDownLeft className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{receipts.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Capitalized receipts inward</div>
          </div>
        </div>

        {/* View Mode Tabs Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 shadow-xs flex items-center justify-between transition-colors">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'orders'
                  ? 'bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800/60 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" /> Job Work Orders ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('challans')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'challans'
                  ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/60 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Outward Challans ({challans.length})
            </button>
            <button
              onClick={() => setActiveTab('receipts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeTab === 'receipts'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" /> FG Receipts ({receipts.length})
            </button>
          </div>
        </div>

        {activeTab === 'orders' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors flex flex-col min-h-[400px]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Subcontracting Orders Registry</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">All registered outside job work processing orders</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                {orders.length} Orders
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Order #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Subcontractor</th>
                  <th className="py-3 px-4">Target FG Item</th>
                  <th className="py-3 px-4 text-center">Qty (Target / Rcvd)</th>
                  <th className="py-3 px-4">Service Rate</th>
                  <th className="py-3 px-4">Total Service</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-bold text-orange-600 dark:text-orange-400">
                      {o.documentNumber}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">{o.postingDate}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200">{o.vendorName}</td>
                    <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">{o.targetItemName}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="font-bold text-slate-900 dark:text-white">{o.receivedQty}</span> / {o.targetQty} {o.uom}
                    </td>
                    <td className="py-3.5 px-4 font-medium">
                      <AmountDisplay paise={o.serviceRatePaise} />
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                      <AmountDisplay paise={o.totalServicePaise} />
                    </td>
                    <td className="py-3.5 px-4">
                      <Tag
                        color={
                          o.status === 'completed' ? 'purple' :
                          o.status === 'in_progress' ? 'blue' :
                          o.status === 'approved' ? 'green' :
                          o.status === 'submitted' ? 'orange' : 'default'
                        }
                      >
                        {o.status.toUpperCase()}
                      </Tag>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {o.status === 'draft' && (
                          <button
                            onClick={() => handleTransitionOrder(o.id, 'submit')}
                            className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[11px]"
                          >
                            Submit
                          </button>
                        )}
                        {o.status === 'submitted' && (
                          <button
                            onClick={() => handleTransitionOrder(o.id, 'approve')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px]"
                          >
                            Approve
                          </button>
                        )}
                        {(o.status === 'approved' || o.status === 'in_progress') && (
                          <>
                            <button
                              onClick={() => openChallanModal(o)}
                              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1"
                            >
                              <ArrowUpRight className="w-3 h-3" /> Issue RM
                            </button>
                            <button
                              onClick={() => openReceiptModal(o)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[11px] flex items-center gap-1"
                            >
                              <ArrowDownLeft className="w-3 h-3" /> Receive FG
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      No Job Work Orders found. Click "+ New Job Work Order" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'challans' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors flex flex-col min-h-[400px]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Outward Delivery Challans</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Raw materials issued and in-transit to subcontractors</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                {challans.length} Challans
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Challan #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Subcontractor</th>
                  <th className="py-3 px-4">Vehicle #</th>
                  <th className="py-3 px-4">Eway Bill #</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {challans.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                    <td className="py-3 px-4 font-mono font-bold text-blue-600 dark:text-blue-400">
                      {c.documentNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{c.postingDate}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">{c.vendorName}</td>
                    <td className="py-3 px-4 font-mono">{c.vehicleNumber || '—'}</td>
                    <td className="py-3 px-4 font-mono">{c.ewayBillNumber || '—'}</td>
                    <td className="py-3 px-4">
                      <Tag color="green">DISPATCHED</Tag>
                    </td>
                  </tr>
                ))}
                {challans.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No outward delivery challans issued yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'receipts' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors flex flex-col min-h-[400px]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Subcontracting Finished Goods Receipts</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Capitalized inventory receipts with absorbed job work fee</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                {receipts.length} Receipts
              </span>
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Receipt #</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Subcontractor</th>
                  <th className="py-3 px-4">Item Produced</th>
                  <th className="py-3 px-4">Qty</th>
                  <th className="py-3 px-4">RM Value</th>
                  <th className="py-3 px-4">Service Fee</th>
                  <th className="py-3 px-4">Capitalized Unit Cost</th>
                  <th className="py-3 px-4">Total Cost</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {receipts.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30">
                    <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {r.documentNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-500">{r.postingDate}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800 dark:text-slate-200">{r.vendorName}</td>
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">{r.targetItemName}</td>
                    <td className="py-3 px-4 font-bold">{r.receivedQty} {r.uom}</td>
                    <td className="py-3 px-4">
                      <AmountDisplay paise={r.rawMaterialCostPaise} />
                    </td>
                    <td className="py-3 px-4">
                      <AmountDisplay paise={r.serviceChargePaise} />
                    </td>
                    <td className="py-3 px-4 font-bold text-orange-600 dark:text-orange-400">
                      <AmountDisplay paise={r.unitCostPaise} />
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                      <AmountDisplay paise={r.totalCostPaise} />
                    </td>
                    <td className="py-3 px-4">
                      <Tag color="purple">POSTED TO GL</Tag>
                    </td>
                  </tr>
                ))}
                {receipts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-slate-400">
                      No subcontracting receipts recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Job Work Order Modal */}
      <Modal
        title="Create Job Work Order (Outside Subcontracting)"
        open={orderModal}
        onCancel={() => setOrderModal(false)}
        footer={null}
        width={720}
      >
        <Form form={orderForm} layout="vertical" onFinish={handleCreateOrder} className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="vendorId" label="Subcontractor (Vendor)" rules={[{ required: true }]}>
              <Select
                placeholder="Select vendor"
                options={suppliers.map((s) => ({ label: s.name, value: s.id }))}
              />
            </Form.Item>
            <Form.Item name="vendorWarehouseId" label="Vendor Virtual Warehouse" rules={[{ required: true }]}>
              <Select
                placeholder="Select vendor site warehouse"
                options={warehouses.map((w) => ({ label: `${w.name} (${w.code})`, value: w.id }))}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="targetItemId" label="Target Output Item" rules={[{ required: true }]}>
              <Select
                placeholder="Select finished / processed item"
                options={items.map((i) => ({ label: `${i.itemName} (${i.itemCode})`, value: i.id }))}
              />
            </Form.Item>
            <Form.Item name="targetQty" label="Planned Target Qty" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={1} />
            </Form.Item>
            <Form.Item name="uom" label="UOM" rules={[{ required: true }]}>
              <Input placeholder="NOS, KG, etc." />
            </Form.Item>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="serviceRateRupees" label="Service Processing Rate (₹)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
            <Form.Item name="postingDate" label="Order Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="expectedCompletionDate" label="Target Completion">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* Raw Material Requirements table */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Required Materials to Supply Subcontractor
              </h4>
              <button
                type="button"
                onClick={() => setOrderMaterials([...orderMaterials, { plannedQty: 1, uom: 'NOS' }])}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Component
              </button>
            </div>
            <div className="space-y-2">
              {orderMaterials.map((mat, idx) => (
                <div key={idx} className="flex gap-3 items-center">
                  <Select
                    placeholder="Select component item"
                    style={{ flex: 2 }}
                    value={mat.itemId}
                    onChange={(val) => {
                      const updated = [...orderMaterials];
                      updated[idx].itemId = val;
                      const selectedItem = items.find((i) => i.id === val);
                      if (selectedItem) updated[idx].uom = selectedItem.primaryUom;
                      setOrderMaterials(updated);
                    }}
                    options={items.map((i) => ({ label: `${i.itemName} (${i.itemCode})`, value: i.id }))}
                  />
                  <InputNumber
                    placeholder="Planned Qty"
                    style={{ flex: 1 }}
                    min={0.1}
                    value={mat.plannedQty}
                    onChange={(val) => {
                      const updated = [...orderMaterials];
                      updated[idx].plannedQty = val || 0;
                      setOrderMaterials(updated);
                    }}
                  />
                  <Input
                    placeholder="UOM"
                    style={{ width: 80 }}
                    value={mat.uom}
                    onChange={(e) => {
                      const updated = [...orderMaterials];
                      updated[idx].uom = e.target.value;
                      setOrderMaterials(updated);
                    }}
                  />
                  {orderMaterials.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setOrderMaterials(orderMaterials.filter((_, i) => i !== idx))}
                      className="text-rose-500 font-bold px-2"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Form.Item name="remarks" label="Notes / Process Requirements">
            <Input.TextArea rows={2} placeholder="Process specs, coating thickness, tolerances..." />
          </Form.Item>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setOrderModal(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-xl shadow-sm"
            >
              {saving ? 'Creating...' : 'Create Order'}
            </button>
          </div>
        </Form>
      </Modal>

      {/* Outward Challan Modal */}
      <Modal
        title={`Issue Outward Challan (${selectedJwoForChallan?.documentNumber})`}
        open={challanModal}
        onCancel={() => setChallanModal(false)}
        footer={null}
        width={680}
      >
        <Form form={challanForm} layout="vertical" onFinish={handleCreateChallan} className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="sourceWarehouseId" label="Source Warehouse" rules={[{ required: true }]}>
              <Select
                placeholder="Dispatch from warehouse"
                options={warehouses.map((w) => ({ label: `${w.name} (${w.code})`, value: w.id }))}
              />
            </Form.Item>
            <Form.Item name="postingDate" label="Challan Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="vehicleNumber" label="Vehicle Number">
              <Input placeholder="e.g. MH-12-AB-1234" />
            </Form.Item>
            <Form.Item name="ewayBillNumber" label="E-Way Bill Number">
              <Input placeholder="e.g. 101234567890" />
            </Form.Item>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">
              Items to Dispatch to Subcontractor Site
            </h4>
            <div className="space-y-3">
              {challanLines.map((line, idx) => {
                const item = items.find((i) => i.id === line.itemId);
                return (
                  <div key={idx} className="flex gap-3 items-center">
                    <span className="font-semibold text-xs flex-1 truncate text-slate-800 dark:text-slate-200">
                      {item ? `${item.itemName} (${item.itemCode})` : 'Component'}
                    </span>
                    <InputNumber
                      placeholder="Qty"
                      min={0.1}
                      value={line.quantity}
                      onChange={(val) => {
                        const updated = [...challanLines];
                        updated[idx].quantity = val || 0;
                        setChallanLines(updated);
                      }}
                      style={{ width: 120 }}
                    />
                    <Input
                      placeholder="Batch #"
                      value={line.batchNumber}
                      onChange={(e) => {
                        const updated = [...challanLines];
                        updated[idx].batchNumber = e.target.value;
                        setChallanLines(updated);
                      }}
                      style={{ width: 140 }}
                    />
                    <span className="text-xs text-slate-500 w-12">{line.uom}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <Form.Item name="remarks" label="Transport Remarks">
            <Input placeholder="Driver contact, transit insurance info..." />
          </Form.Item>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setChallanModal(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm"
            >
              {saving ? 'Dispatching...' : 'Dispatch Outward Challan'}
            </button>
          </div>
        </Form>
      </Modal>

      {/* Subcon Receipt Modal */}
      <Modal
        title={`Receive Finished Goods from Subcontractor (${selectedJwoForReceipt?.documentNumber})`}
        open={receiptModal}
        onCancel={() => setReceiptModal(false)}
        footer={null}
        width={650}
      >
        <Form form={receiptForm} layout="vertical" onFinish={handleCreateReceipt} className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="destinationWarehouseId" label="Receiving Warehouse" rules={[{ required: true }]}>
              <Select
                placeholder="Internal warehouse"
                options={warehouses.map((w) => ({ label: `${w.name} (${w.code})`, value: w.id }))}
              />
            </Form.Item>
            <Form.Item name="postingDate" label="Receipt Date" rules={[{ required: true }]}>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="receivedQty" label="Received Qty" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0.1} />
            </Form.Item>
            <Form.Item name="uom" label="UOM" rules={[{ required: true }]}>
              <Input disabled />
            </Form.Item>
            <Form.Item name="batchNumber" label="FG Batch Number">
              <Input placeholder="e.g. BAT-2024-SC1" />
            </Form.Item>
          </div>

          <Form.Item name="batchExpiryDate" label="Batch Expiry Date (if applicable)">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>

          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300">
            <p className="font-bold flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> Automatic Cost Roll-Up & GL Capitalization
            </p>
            <p>
              Receiving this shipment will automatically consume issued raw materials from the vendor site warehouse and capitalize the vendor processing fee into the inventory asset valuation rate.
            </p>
          </div>

          <Form.Item name="remarks" label="Inspection / Quality Notes" className="mt-3">
            <Input.TextArea rows={2} placeholder="QC remarks, visual inspection check..." />
          </Form.Item>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setReceiptModal(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm"
            >
              {saving ? 'Receiving...' : 'Confirm Receipt & Capitalize Cost'}
            </button>
          </div>
        </Form>
      </Modal>
    </div>
  );
}

export default SubcontractingPage;

