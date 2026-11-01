import React, { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Drawer, Form, Input, InputNumber, message } from 'antd';
import { Cog, Plus, RefreshCw, Search, DollarSign, Activity } from 'lucide-react';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type WorkCenter } from '../../api/manufacturing';
import { apiErr } from '../_shared/txn';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

export function WorkCentresPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    manufacturingApi.workCenters.list(company.id)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(apiErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { form.resetFields(); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id) { message.error('Select company'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      code: v.code,
      name: v.name,
      labourRatePaisePerHr: Math.round((v.labourRateRupees || 0) * 100),
      machineRatePaisePerHr: Math.round((v.machineRateRupees || 0) * 100),
      overheadRatePaisePerHr: Math.round((v.overheadRateRupees || 0) * 100),
    };
    try {
      await manufacturingApi.workCenters.create(body);
      message.success('Work Centre created.');
      setDrawer(false);
      load();
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const filtered = rows.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q);
  });

  const totalCentres = rows.length;
  const avgLabourRate = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.labourRatePaisePerHr || 0), 0) / rows.length)
    : 0;
  const avgMachineRate = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + (r.machineRatePaisePerHr || 0), 0) / rows.length)
    : 0;

  const columns = [
    { 
      title: 'Work Centre Code', 
      dataIndex: 'code', 
      render: (v: string) => (
        <span className="font-mono font-bold text-xs text-indigo-600 dark:text-indigo-400">{v}</span>
      ) 
    },
    { 
      title: 'Station Name', 
      dataIndex: 'name',
      render: (v: string) => (
        <span className="font-medium text-slate-900 dark:text-white text-sm">{v}</span>
      )
    },
    { 
      title: 'Labour Rate (₹ / hr)', 
      dataIndex: 'labourRatePaisePerHr', 
      align: 'right' as const, 
      render: (v: number) => <AmountDisplay paise={v} /> 
    },
    { 
      title: 'Machine Rate (₹ / hr)', 
      dataIndex: 'machineRatePaisePerHr', 
      align: 'right' as const, 
      render: (v: number) => <AmountDisplay paise={v} /> 
    },
    { 
      title: 'Overhead Rate (₹ / hr)', 
      dataIndex: 'overheadRatePaisePerHr', 
      align: 'right' as const, 
      render: (v: number) => <AmountDisplay paise={v} /> 
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/40 rounded-xl">
            <Cog className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Manufacturing</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">Shop Floor</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Work Centres & Production Stations
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Machinery lines, work stations, and hourly operational cost rates (labour, machine, overhead absorption)
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
            New Work Centre
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Work Centres</span>
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                <Cog className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalCentres}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Available production machinery lines
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Avg Labour Rate / Hr</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              <AmountDisplay paise={avgLabourRate} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Base operator absorption rate
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Avg Machine Rate / Hr</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <Activity className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              <AmountDisplay paise={avgMachineRate} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Power & maintenance absorption rate
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search station name or code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-xl shadow-xs text-sm font-medium transition-all cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Work Centre Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configured manufacturing stations and cost drivers
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filtered.length} stations
            </span>
          </div>

          <Table 
            dataSource={filtered} 
            columns={columns} 
            rowKey="id" 
            loading={loading} 
            pagination={{ pageSize: 20, showSizeChanger: true }} 
            className="dark:bg-slate-900"
            locale={{ emptyText: 'No work centres defined yet. Click New Work Centre to register a manufacturing station.' }} 
          />
        </div>
      </div>

      {/* Drawer: New Work Centre */}
      <Drawer 
        title="Register Work Centre / Station" 
        open={drawer} 
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} 
        width={440} 
        extra={
          <button
            type="button"
            disabled={saving}
            onClick={() => form.submit()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            {saving ? 'Creating...' : 'Create Centre'}
          </button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="code" label="Work Centre Code" rules={[{ required: true, message: 'Code is required' }]}>
            <Input placeholder="e.g. WC-MILL-01" />
          </Form.Item>
          <Form.Item name="name" label="Station Name" rules={[{ required: true, message: 'Name is required' }]}>
            <Input placeholder="e.g. Roller Milling & Crushing Line" />
          </Form.Item>
          <Form.Item name="labourRateRupees" label="Labour Rate (₹ / hr)" extra="Direct operator absorption rate">
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="e.g. 250" />
          </Form.Item>
          <Form.Item name="machineRateRupees" label="Machine Rate (₹ / hr)" extra="Electricity, power & depreciation">
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="e.g. 500" />
          </Form.Item>
          <Form.Item name="overheadRateRupees" label="Overhead Rate (₹ / hr)" extra="Factory overhead & indirect costs">
            <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="e.g. 150" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

export default WorkCentresPage;
