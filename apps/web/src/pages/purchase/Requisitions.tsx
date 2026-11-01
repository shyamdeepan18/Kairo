import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useNavigate } from 'react-router-dom';
import { Drawer, Form, DatePicker, Input, Select, message, Modal, Tooltip } from 'antd';
import dayjs from 'dayjs';
import {
  FileText, Plus, Eye, Send, CheckCircle2, XCircle, Search, User, Calendar,
  ClipboardList, ShoppingCart, ArrowRight, Clock
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { STATUS_OPTIONS, apiErr, LinesEditor, newDraftLine, type DraftLine, type RefItem } from '../_shared/txn';

export function RequisitionsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { user } = useAuthStore();
  const [form] = Form.useForm();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'all' | 'pending'>('all');
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [pendingLinesData, setPendingLinesData] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewing, setViewing] = useState<(PurchaseHeader & { lines: any[], purpose?: string }) | null>(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    Promise.all([
      purchaseApi.requisitions.list(company.id, statusFilter ? { status: statusFilter } : undefined),
      purchaseApi.requisitions.pendingLines(company.id)
    ])
      .then(([reqRes, plRes]) => {
        setRows(reqRes.data);
        setPendingLinesData(plRes);
      })
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { 
    if (company?.id) {
      mastersApi.listItems(company.id).then(setItems).catch(() => {});
      purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    }
  }, [company?.id]);

  const refItems: RefItem[] = items.map((i) => ({
    id: i.id,
    itemName: i.itemName,
    itemCode: i.itemCode,
    primaryUom: i.primaryUom,
    defaultTaxCodeId: i.defaultTaxCodeId,
    sellingPricePaise: i.sellingPricePaise,
    purchaseRatePaise: i.purchaseRatePaise,
    standardCostPaise: i.standardCostPaise,
    minSellingPricePaise: i.minSellingPricePaise,
    barcode: i.barcode,
  }));

  const openNew = () => {
    form.resetFields();
    form.setFieldsValue({ postingDate: dayjs() });
    setLines([newDraftLine()]);
    setDrawer(true);
  };

  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'),
      requiredByDate: v.requiredByDate?.format?.('YYYY-MM-DD'),
      purpose: v.purpose,
      lines: valid.map((l) => ({
        itemId: l.itemId,
        description: l.description,
        quantity: l.quantity,
        uom: l.uom ?? 'NOS',
        estimatedRatePaise: Math.round((l.rateRupees || 0) * 100),
      })),
    };
    try {
      await purchaseApi.requisitions.create(body);
      message.success('Requisition created.');
      setDrawer(false);
      load();
    } catch (e) {
      message.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: PurchaseHeader, a: 'submit' | 'approve' | 'reject') => {
    if (!company?.id) return;
    try {
      const res = await purchaseApi.requisitions.act(r.id, a, company.id);
      if (a === 'approve' && res?.status === 'submitted') {
        message.info('Approval recorded. Waiting for the next level of approval.');
      } else {
        message.success(`Requisition ${a === 'submit' ? 'submitted' : a === 'approve' ? 'approved' : 'rejected'}.`);
      }
      load();
      if (viewing?.id === r.id) setViewing(null);
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openView = async (r: PurchaseHeader) => {
    if (!company?.id) return;
    try {
      const details = await purchaseApi.requisitions.get(company.id, r.id);
      setViewing(details as any);
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const handleCreatePO = () => {
    if (!selectedSupplierId) { message.error('Please select a supplier'); return; }
    const selectedLines = pendingLinesData.filter(l => selectedRowKeys.includes(l.id));
    const firstPrId = selectedLines[0]?.requisitionId;
    const pr = rows.find(r => r.id === firstPrId);
    navigate('/purchase/orders', {
      state: {
        createPoFromLines: selectedLines,
        supplierId: selectedSupplierId,
        remarks: pr?.remarks || pr?.purpose,
      },
    });
    setSupplierModalVisible(false);
  };

  const toggleSelectLine = (id: string) => {
    setSelectedRowKeys(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedRowKeys.length === pendingLinesData.length) {
      setSelectedRowKeys([]);
    } else {
      setSelectedRowKeys(pendingLinesData.map(l => l.id));
    }
  };

  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) =>
      r.documentNumber.toLowerCase().includes(q) ||
      (r.submittedByName && r.submittedByName.toLowerCase().includes(q)) ||
      (r.createdByName && r.createdByName.toLowerCase().includes(q)) ||
      ((r as any).purpose && (r as any).purpose.toLowerCase().includes(q))
    );
  }, [rows, searchQuery]);

  const filteredPendingLines = useMemo(() => {
    if (!searchQuery.trim()) return pendingLinesData;
    const q = searchQuery.toLowerCase();
    return pendingLinesData.filter((l) =>
      l.documentNumber?.toLowerCase().includes(q) ||
      l.description?.toLowerCase().includes(q) ||
      items.find(i => i.id === l.itemId)?.itemName?.toLowerCase().includes(q)
    );
  }, [pendingLinesData, searchQuery, items]);

  const totalPRs = rows.length;
  const pendingApprovalPRs = rows.filter((r) => r.status === 'submitted').length;
  const approvedPRs = rows.filter((r) => r.status === 'approved').length;
  const pendingLinesCount = pendingLinesData.length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Purchase</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Requisitions</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Purchase Requisitions
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Internal material indent requests, departmental approvals, and PO conversion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Requisition
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Requisitions</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <FileText className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalPRs}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Total indents logged
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Approvals</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingApprovalPRs}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting HOD sign-off
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Approved Indents</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {approvedPRs}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Ready for procurement
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Lines to PO</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <ShoppingCart className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {pendingLinesCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Unordered item requirements
            </div>
          </div>
        </div>

        {/* Filter & Tabs Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              All Requisitions ({rows.length})
            </button>
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-colors flex items-center space-x-2 cursor-pointer ${
                activeTab === 'pending'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span>Pending PR Lines</span>
              {pendingLinesData.length > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'pending' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'}`}>
                  {pendingLinesData.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {activeTab === 'pending' && selectedRowKeys.length > 0 && (
              <button
                onClick={() => setSupplierModalVisible(true)}
                className="flex items-center px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4 mr-1.5" />
                Convert {selectedRowKeys.length} Lines to PO
              </button>
            )}

            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={activeTab === 'all' ? "Search PR number, requester..." : "Search pending lines..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
              />
            </div>
            {activeTab === 'all' && (
              <Select
                allowClear
                placeholder="All Statuses"
                value={statusFilter}
                onChange={setStatusFilter}
                className="w-40"
                options={STATUS_OPTIONS}
              />
            )}
          </div>
        </div>

        {/* All Requisitions Tab */}
        {activeTab === 'all' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Indent Registry
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Department purchase requests and approval lifecycle
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                {filteredRows.length} indents
              </span>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
                <tr>
                  <th className="px-6 py-4 font-bold">PR Number</th>
                  <th className="px-6 py-4 font-bold">Date</th>
                  <th className="px-6 py-4 font-bold">Raised By</th>
                  <th className="px-6 py-4 font-bold text-right">Est. Total (₹)</th>
                  <th className="px-6 py-4 font-bold text-center">Status</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
                {filteredRows.map((r) => {
                  const isMaker = user?.id === r.createdBy || user?.id === r.submittedBy;
                  const hasWorkflow = !!(r as any).approvalInfo;
                  const isEligible = hasWorkflow ? (r as any).approvalInfo.isEligibleApprover : true;
                  const hasApproved = hasWorkflow ? (r as any).approvalInfo.hasApproved : false;
                  const canRecall = isMaker && r.status === 'submitted';

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          <span className="font-mono font-bold text-blue-700 dark:text-blue-400 transition-colors">{r.documentNumber}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          <span className="text-slate-500 dark:text-slate-400 font-medium transition-colors">{r.postingDate}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center space-x-2">
                          <User className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          <span className="text-slate-800 dark:text-slate-200 font-medium transition-colors">
                            {r.submittedByName || r.createdByName || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white transition-colors">
                        <AmountDisplay paise={r.totalAmountPaise} />
                      </td>
                      <td className="px-6 py-4 text-center">
                        <StatusBadge status={r.status as DocumentStatus} size="small" />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-3">
                          <button onClick={() => openView(r)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" title="View details">
                            <Eye className="w-4 h-4" />
                          </button>

                          {r.status === 'draft' && (
                            <button onClick={() => act(r, 'submit')} className="flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 text-xs font-bold transition-colors">
                              <Send className="w-3.5 h-3.5 mr-1" /> Submit
                            </button>
                          )}

                          {r.status === 'submitted' && (
                            <>
                              {hasWorkflow && hasApproved && (
                                <span className="text-emerald-600 dark:text-emerald-500 text-xs italic font-bold">Approved. Waiting...</span>
                              )}
                              {hasWorkflow && !isEligible && !hasApproved && !canRecall && (
                                <span className="text-slate-500 dark:text-slate-400 text-xs italic">Pending: {(r as any).approvalInfo.currentApproverName}</span>
                              )}
                              {isEligible && !isMaker && (
                                <>
                                  <button onClick={() => act(r, 'approve')} className="flex items-center text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 text-xs font-bold transition-colors">
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                                  </button>
                                  <button onClick={() => act(r, 'reject')} className="flex items-center text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 text-xs font-bold transition-colors">
                                    <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                                  </button>
                                </>
                              )}
                              {isMaker && (
                                <button onClick={() => act(r, 'reject')} className="flex items-center text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs font-bold transition-colors" title="Recall your submitted requisition">
                                  <XCircle className="w-3.5 h-3.5 mr-1" /> Recall
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 transition-colors">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No requisitions found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pending PR Lines Tab */}
        {activeTab === 'pending' && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Approved Indent Requirements
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Select approved requisition lines and convert directly into Purchase Orders
                </p>
              </div>
              <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
                {filteredPendingLines.length} line items
              </span>
            </div>
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 transition-colors">
                <tr>
                  <th className="px-4 py-4 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={pendingLinesData.length > 0 && selectedRowKeys.length === pendingLinesData.length}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                  </th>
                  <th className="px-6 py-4 font-bold">PR Number</th>
                  <th className="px-6 py-4 font-bold">Item Description</th>
                  <th className="px-6 py-4 font-bold text-right">Req Qty</th>
                  <th className="px-6 py-4 font-bold text-right">Pending Qty</th>
                  <th className="px-6 py-4 font-bold text-right">Est Rate (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 dark:divide-slate-800/50">
                {filteredPendingLines.map((l) => {
                  const pendingQty = Number(l.quantity) - Number(l.orderedQty || 0);
                  const isSelected = selectedRowKeys.includes(l.id);

                  return (
                    <tr key={l.id} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-blue-50/40 dark:bg-blue-900/20' : ''}`}>
                      <td className="px-4 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLine(l.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-blue-700 dark:text-blue-400">
                        {l.documentNumber}
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                        {items.find(i => i.id === l.itemId)?.itemName || l.description || l.itemId}
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-600 dark:text-slate-400">
                        {l.quantity} {l.uom}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-amber-700 dark:text-amber-400">
                        {pendingQty} {l.uom}
                      </td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                        <AmountDisplay paise={l.estimatedRatePaise || 0} />
                      </td>
                    </tr>
                  );
                })}
                {filteredPendingLines.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400 transition-colors">
                      <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No pending lines found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Requisition Drawer */}
      <Drawer
        title={<span className="font-bold text-slate-900 dark:text-white">New Purchase Requisition</span>}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={960}
        extra={
          <button onClick={() => form.submit()} disabled={saving} className="px-4 py-1.5 bg-blue-600 text-white font-bold rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
            {saving ? 'Saving...' : 'Create Requisition'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
            <Form.Item name="postingDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Requisition Date</span>} rules={[{ required: true }]} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="requiredByDate" label={<span className="font-bold text-slate-700 dark:text-slate-300">Required By Date</span>} className="mb-0">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="purpose" label={<span className="font-bold text-slate-700 dark:text-slate-300">Purpose / Department Need</span>} className="mb-0 col-span-2">
              <Input placeholder="E.g., Routine production batch, maintenance spare replenishment" />
            </Form.Item>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center">
                <FileText className="w-4 h-4 mr-2 text-blue-600" /> Requested Items
              </h3>
            </div>
            
            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg bg-white dark:bg-slate-900 overflow-hidden">
              <LinesEditor
                lines={lines}
                onChange={setLines}
                items={refItems}
                taxCodes={[]}
                showTax={false}
                showDiscount={false}
                rateLabel="Est Rate (₹)"
                mode="purchase"
              />
            </div>
          </div>
        </Form>
      </Drawer>

      {/* View Drawer */}
      <Drawer
        title={
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-slate-900 dark:text-white">{viewing?.documentNumber ?? 'Purchase Requisition'}</span>
          </div>
        }
        open={!!viewing}
        onClose={() => setViewing(null)}
        width={850}
      >
        {viewing && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700/50">
              <div className="col-span-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Raised By</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">{viewing.submittedByName || viewing.createdByName || '—'}</p>
                {viewing.purpose && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Purpose: {viewing.purpose}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Date</p>
                <p className="font-medium text-slate-900 dark:text-white mt-1">{viewing.postingDate}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">Status</p>
                <div className="mt-1"><StatusBadge status={viewing.status as DocumentStatus} size="small" /></div>
              </div>
            </div>

            <div className="flex justify-end p-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 rounded-lg">
              <div className="flex flex-col items-end">
                <p className="text-sm font-bold text-blue-800">Total Estimated Amount</p>
                <p className="font-mono text-2xl font-black text-blue-700 mt-1"><AmountDisplay paise={viewing.totalAmountPaise} /></p>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-3 border-b pb-2">Requested Items</h3>
              <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 border-b text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="px-4 py-3 font-bold w-12">#</th>
                      <th className="px-4 py-3 font-bold">Item Description</th>
                      <th className="px-4 py-3 font-bold text-right">Qty</th>
                      <th className="px-4 py-3 font-bold">UOM</th>
                      <th className="px-4 py-3 font-bold text-right">Est. Rate</th>
                      <th className="px-4 py-3 font-bold text-right">Est. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {viewing.lines?.map((l: any, i: number) => (
                      <tr key={l.id} className="bg-white dark:bg-slate-900">
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                          {items.find(item => item.id === l.itemId)?.itemName || l.description || '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{l.quantity}</td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{l.uom}</td>
                        <td className="px-4 py-3 text-right font-mono"><AmountDisplay paise={l.estimatedRatePaise || 0} /></td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                          <AmountDisplay paise={Math.round((l.quantity || 0) * (l.estimatedRatePaise || 0))} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Bar inside view drawer */}
            {viewing.status === 'submitted' && (
              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                {user?.id !== viewing.createdBy && user?.id !== viewing.submittedBy ? (
                  <>
                    <button
                      onClick={() => act(viewing, 'reject')}
                      className="px-4 py-2 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 font-bold rounded-lg transition-colors text-sm"
                    >
                      Reject Requisition
                    </button>
                    <button
                      onClick={() => act(viewing, 'approve')}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition-colors text-sm shadow-sm"
                    >
                      Approve Requisition
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => act(viewing, 'reject')}
                    className="px-4 py-2 border border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 font-bold rounded-lg transition-colors text-sm"
                  >
                    Recall Requisition
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Convert to PO Supplier Modal */}
      <Modal
        title={<span className="font-bold text-slate-900 dark:text-white">Raise Purchase Order from Selected Lines</span>}
        open={supplierModalVisible}
        onCancel={() => setSupplierModalVisible(false)}
        onOk={handleCreatePO}
        okText="Continue to PO"
        okButtonProps={{ disabled: !selectedSupplierId, className: 'bg-emerald-600 hover:bg-emerald-700 font-bold' }}
      >
        <div className="py-4 space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Select the vendor/supplier to raise a Purchase Order against for the {selectedRowKeys.length} selected requisition lines:
          </p>
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Search and select supplier"
            optionFilterProp="label"
            value={selectedSupplierId}
            onChange={setSelectedSupplierId}
            options={suppliers.map(s => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))}
          />
        </div>
      </Modal>
    </div>
  );
}

export default RequisitionsPage;
