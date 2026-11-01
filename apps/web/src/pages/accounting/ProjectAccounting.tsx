import React, { useState, useEffect, useCallback } from 'react';
import { Drawer, Modal, Form, Input, InputNumber, DatePicker, Select, message, Tabs } from 'antd';
import dayjs from 'dayjs';
import {
  Briefcase, Plus, Search, DollarSign, TrendingUp, AlertTriangle,
  Layers, Package, CheckCircle2, Clock, Calendar, ArrowUpRight, BarChart3,
  Receipt, Truck, RefreshCw
} from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { accountingApi } from '../../api/accounting';
import { salesApi, type Customer } from '../../api/sales';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

interface Project {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  customerId?: string | null;
  contractValuePaise: number;
  budgetMaterialPaise: number;
  budgetLaborPaise: number;
  budgetSubconPaise: number;
  budgetOverheadPaise: number;
  startDate?: string | null;
  endDate?: string | null;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'closed';
  createdAt: string;
}

interface ProjectSummaryData {
  project: Project;
  totals: {
    contractValuePaise: number;
    totalBudgetPaise: number;
    actualRevenuePaise: number;
    actualMaterialPaise: number;
    actualProcurementPaise: number;
    actualLaborGlPaise: number;
    totalActualCostPaise: number;
    profitPaise: number;
    profitMarginPct: number;
    budgetVariancePaise: number;
    budgetUtilizationPct: number;
  };
  breakdown: Array<{
    category: string;
    budgetPaise: number;
    actualPaise: number;
    variancePaise: number;
    utilizationPct: number;
  }>;
  transactions: {
    salesInvoices: any[];
    materialMovements: any[];
    purchaseInvoices: any[];
    journalLines: any[];
  };
}

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  planning: { bg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', label: 'Planning' },
  active: { bg: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-400', label: 'Active' },
  on_hold: { bg: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', label: 'On Hold' },
  completed: { bg: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-400', label: 'Completed' },
  closed: { bg: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-700', text: 'text-slate-700 dark:text-slate-400', label: 'Closed' },
};

export function ProjectAccountingPage() {
  const { company } = usePlantStore();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();

  // Modal / Drawer state
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Summary drawer state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<ProjectSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const data = await accountingApi.listProjects(statusFilter ? { status: statusFilter } : undefined);
      setProjects(data);
    } catch (err: any) {
      message.error(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [company?.id, statusFilter]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!company?.id) return;
    salesApi.customers.list(company.id).then((r) => setCustomers(r.data)).catch(() => {});
  }, [company?.id]);

  const loadSummary = async (id: string) => {
    setSelectedProjectId(id);
    setSummaryLoading(true);
    try {
      const data = await accountingApi.getProjectSummary(id);
      setSummaryData(data);
    } catch (err: any) {
      message.error(err.message || 'Failed to load project summary');
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleCreateProject = async (values: any) => {
    setSaving(true);
    try {
      await accountingApi.createProject({
        code: values.code,
        name: values.name,
        description: values.description,
        customerId: values.customerId,
        contractValuePaise: Math.round((values.contractValueRupees || 0) * 100),
        budgetMaterialPaise: Math.round((values.budgetMaterialRupees || 0) * 100),
        budgetLaborPaise: Math.round((values.budgetLaborRupees || 0) * 100),
        budgetSubconPaise: Math.round((values.budgetSubconRupees || 0) * 100),
        budgetOverheadPaise: Math.round((values.budgetOverheadRupees || 0) * 100),
        startDate: values.dateRange?.[0]?.format('YYYY-MM-DD'),
        endDate: values.dateRange?.[1]?.format('YYYY-MM-DD'),
        status: values.status || 'active',
      });
      message.success('Project created successfully');
      setModalOpen(false);
      form.resetFields();
      loadProjects();
    } catch (err: any) {
      message.error(err.response?.data?.error || err.message || 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q);
  });

  // Calculate overview KPIs
  const totalContractValue = projects.reduce((acc, p) => acc + (p.contractValuePaise || 0), 0);
  const activeCount = projects.filter((p) => p.status === 'active').length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 rounded-xl shadow-xs">
            <Briefcase className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Accounting</span>
              <span>/</span>
              <span className="text-blue-600 dark:text-blue-400 font-medium">Projects & Costing</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Project Accounting & Job Costing
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                GAP 8
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Track project profitability, real-time material & labor cost absorption, and Budget vs Actual variance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ status: 'active', contractValueRupees: 0, budgetMaterialRupees: 0, budgetLaborRupees: 0, budgetSubconRupees: 0, budgetOverheadRupees: 0 });
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <Plus className="w-4 h-4" /> New Project
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Overview Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Projects</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{projects.length}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">{activeCount} actively in progress</p>
          </div>
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Committed Contract Value</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              <AmountDisplay paise={totalContractValue} />
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Across all discrete contracts</p>
          </div>
          <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Budget Allocation</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              <AmountDisplay
                paise={projects.reduce(
                  (acc, p) =>
                    acc +
                    (p.budgetMaterialPaise || 0) +
                    (p.budgetLaborPaise || 0) +
                    (p.budgetSubconPaise || 0) +
                    (p.budgetOverheadPaise || 0),
                  0
                )}
              />
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Material, Labor & Subcontracting</p>
          </div>
          <div className="p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 rounded-xl">
            <BarChart3 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Financial Integrity</p>
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-5 h-5" /> Double-Entry Post
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">100% SLE movement tagged</p>
          </div>
          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-xl">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>
      </div>

        {/* Floating Filter Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 transition-colors">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search by code or project name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-900 dark:text-white placeholder-slate-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select
              allowClear
              placeholder="All Statuses"
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ minWidth: 150 }}
              options={[
                { label: 'Active', value: 'active' },
                { label: 'Planning', value: 'planning' },
                { label: 'On Hold', value: 'on_hold' },
                { label: 'Completed', value: 'completed' },
                { label: 'Closed', value: 'closed' },
              ]}
            />
            <button
              onClick={loadProjects}
              className="p-2 border border-slate-200 dark:border-slate-700/80 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-xs"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProjects.map((p) => {
            const badge = STATUS_BADGES[p.status] || STATUS_BADGES.active;
            const totalBudget =
              (p.budgetMaterialPaise || 0) +
              (p.budgetLaborPaise || 0) +
              (p.budgetSubconPaise || 0) +
              (p.budgetOverheadPaise || 0);

            return (
              <div
                key={p.id}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/70 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                        {p.code}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white mt-2 leading-snug">
                        {p.name}
                      </h3>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${badge.bg}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  {p.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
                      {p.description}
                    </p>
                  )}

                  <div className="grid grid-cols-2 gap-3 py-3 border-y border-slate-100 dark:border-slate-700/50 mb-4">
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Contract Value</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white mt-0.5">
                        <AmountDisplay paise={p.contractValuePaise} />
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Budget</p>
                      <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        <AmountDisplay paise={totalBudget} />
                      </p>
                    </div>
                  </div>

                  {/* Budget breakdown mini-bars */}
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                      <span>Material: <AmountDisplay paise={p.budgetMaterialPaise} /></span>
                      <span>Labor: <AmountDisplay paise={p.budgetLaborPaise} /></span>
                    </div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400 text-[11px]">
                      <span>Subcon: <AmountDisplay paise={p.budgetSubconPaise} /></span>
                      <span>Overhead: <AmountDisplay paise={p.budgetOverheadPaise} /></span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {p.startDate ? dayjs(p.startDate).format('MMM D, YYYY') : 'No start date'}
                  </div>
                  <button
                    onClick={() => loadSummary(p.id)}
                    className="flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                  >
                    View Financials <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filteredProjects.length === 0 && !loading && (
          <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60">
            <Briefcase className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">No Projects Found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Create your first project to start tracking real-time costs, material absorption, and margins.
            </p>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-blue-600" />
            <span>Create New Project (Job)</span>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateProject} className="mt-4">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="code" label="Project Code" rules={[{ required: true, message: 'Code required' }]}>
              <Input placeholder="e.g. PRJ-2024-001" />
            </Form.Item>
            <Form.Item name="status" label="Initial Status" initialValue="active">
              <Select
                options={[
                  { label: 'Active', value: 'active' },
                  { label: 'Planning', value: 'planning' },
                  { label: 'On Hold', value: 'on_hold' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Project / Job Name" rules={[{ required: true, message: 'Name required' }]}>
            <Input placeholder="e.g. Fabrication & Assembly of Line 4 Reactor" />
          </Form.Item>

          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="customerId" label="Customer (Optional)">
              <Select
                allowClear
                placeholder="Select client"
                options={customers.map((c) => ({ label: c.name, value: c.id }))}
              />
            </Form.Item>
            <Form.Item name="contractValueRupees" label="Contract Value (₹)" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </div>

          <Form.Item name="dateRange" label="Schedule Duration">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-blue-600" /> Budget Allocations (₹)
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <Form.Item name="budgetMaterialRupees" label="Material Budget" className="mb-2">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
              <Form.Item name="budgetLaborRupees" label="Direct Labor Budget" className="mb-2">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
              <Form.Item name="budgetSubconRupees" label="Subcontracting Budget" className="mb-2">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
              <Form.Item name="budgetOverheadRupees" label="Overhead Budget" className="mb-2">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </div>
          </div>

          <Form.Item name="description" label="Notes / Scope of Work">
            <Input.TextArea rows={2} placeholder="Project objectives, milestone targets, or engineering scope..." />
          </Form.Item>

          <div className="flex justify-end gap-3 mt-5 pt-3 border-t border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm transition-all"
            >
              {saving ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </Form>
      </Modal>

      {/* Project Financial Breakdown Drawer */}
      <Drawer
        title={
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-slate-900 dark:text-white">
              {summaryData?.project?.name ?? 'Project Financials'}
            </span>
          </div>
        }
        open={Boolean(selectedProjectId)}
        onClose={() => {
          setSelectedProjectId(null);
          setSummaryData(null);
        }}
        width={850}
      >
        {summaryLoading && (
          <div className="py-20 text-center text-slate-500">Loading live project financial telemetry...</div>
        )}

        {summaryData && (
          <div className="space-y-6">
            {/* Top Stat Card */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contract Value</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  <AmountDisplay paise={summaryData.totals.contractValuePaise} />
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Billed Revenue</p>
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                  <AmountDisplay paise={summaryData.totals.actualRevenuePaise} />
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Incurred Cost</p>
                <p className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-1">
                  <AmountDisplay paise={summaryData.totals.totalActualCostPaise} />
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Net Margin</p>
                <p
                  className={`text-lg font-bold mt-1 ${
                    summaryData.totals.profitPaise >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  <AmountDisplay paise={summaryData.totals.profitPaise} />
                  <span className="text-xs ml-1 font-semibold">({summaryData.totals.profitMarginPct}%)</span>
                </p>
              </div>
            </div>

            {/* Budget vs Actual Variance Table */}
            <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Budget vs Actual (BvA) Variance Breakdown
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase tracking-wider">
                      <th className="py-2.5">Cost Category</th>
                      <th className="py-2.5">Budget</th>
                      <th className="py-2.5">Incurred Actual</th>
                      <th className="py-2.5">Variance</th>
                      <th className="py-2.5">Utilization %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {summaryData.breakdown.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                        <td className="py-3 font-semibold text-slate-800 dark:text-slate-200">{row.category}</td>
                        <td className="py-3 font-medium text-slate-600 dark:text-slate-400">
                          <AmountDisplay paise={row.budgetPaise} />
                        </td>
                        <td className="py-3 font-bold text-slate-900 dark:text-white">
                          <AmountDisplay paise={row.actualPaise} />
                        </td>
                        <td
                          className={`py-3 font-bold ${
                            row.variancePaise >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          <AmountDisplay paise={row.variancePaise} />
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-slate-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  row.utilizationPct > 100
                                    ? 'bg-rose-500'
                                    : row.utilizationPct > 80
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, row.utilizationPct)}%` }}
                              />
                            </div>
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {row.utilizationPct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transaction Ledger Tabs */}
            <div className="p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/60">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Project Audit Trail</h3>
              <Tabs
                defaultActiveKey="sales"
                items={[
                  {
                    key: 'sales',
                    label: `Sales Invoices (${summaryData.transactions.salesInvoices.length})`,
                    children: (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase">
                              <th className="py-2">Doc Number</th>
                              <th className="py-2">Date</th>
                              <th className="py-2">Status</th>
                              <th className="py-2 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {summaryData.transactions.salesInvoices.map((inv: any) => (
                              <tr key={inv.id}>
                                <td className="py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                                  {inv.documentNumber}
                                </td>
                                <td className="py-2.5 text-slate-500">{inv.postingDate}</td>
                                <td className="py-2.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
                                    {inv.status}
                                  </span>
                                </td>
                                <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                  <AmountDisplay paise={inv.totalAmountPaise} />
                                </td>
                              </tr>
                            ))}
                            {summaryData.transactions.salesInvoices.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-slate-400">
                                  No invoices billed to this project yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ),
                  },
                  {
                    key: 'material',
                    label: `Material Movements (${summaryData.transactions.materialMovements.length})`,
                    children: (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase">
                              <th className="py-2">Doc #</th>
                              <th className="py-2">Movement</th>
                              <th className="py-2">Qty</th>
                              <th className="py-2 text-right">Consumed Value</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {summaryData.transactions.materialMovements.map((sle: any) => (
                              <tr key={sle.id}>
                                <td className="py-2.5 font-mono font-medium">{sle.documentNumber}</td>
                                <td className="py-2.5 text-slate-600 dark:text-slate-400 font-semibold">{sle.movementType}</td>
                                <td className="py-2.5">{sle.quantity}</td>
                                <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                  <AmountDisplay paise={sle.valuationAmountPaise} />
                                </td>
                              </tr>
                            ))}
                            {summaryData.transactions.materialMovements.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-slate-400">
                                  No material issues tagged to this project yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ),
                  },
                  {
                    key: 'purchases',
                    label: `Purchase Expenses (${summaryData.transactions.purchaseInvoices.length})`,
                    children: (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase">
                              <th className="py-2">Doc #</th>
                              <th className="py-2">Date</th>
                              <th className="py-2 text-right">Invoiced Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {summaryData.transactions.purchaseInvoices.map((pi: any) => (
                              <tr key={pi.id}>
                                <td className="py-2.5 font-mono font-bold">{pi.documentNumber}</td>
                                <td className="py-2.5 text-slate-500">{pi.postingDate}</td>
                                <td className="py-2.5 text-right font-bold text-slate-900 dark:text-white">
                                  <AmountDisplay paise={pi.totalAmountPaise} />
                                </td>
                              </tr>
                            ))}
                            {summaryData.transactions.purchaseInvoices.length === 0 && (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-400">
                                  No supplier expenses tagged to this project yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

export default ProjectAccountingPage;

