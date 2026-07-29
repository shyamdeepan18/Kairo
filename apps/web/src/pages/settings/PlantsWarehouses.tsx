import React, { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Drawer, Form, Input, Select, Switch, message } from 'antd';
import {
  Building2, Package, Plus, MapPin, Edit2, ArrowRight, ShieldCheck, Inbox
} from 'lucide-react';
import {
  settingsApi, WAREHOUSE_TYPES,
  type Plant, type Warehouse
} from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const STATE_CODES = Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0'));

export function PlantsWarehousesPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const [plantForm] = Form.useForm();
  const [whForm] = Form.useForm();

  const [plants, setPlants] = useState<Plant[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedPlant, setSelectedPlant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [whLoading, setWhLoading] = useState(false);

  const [plantDrawer, setPlantDrawer] = useState(false);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [whDrawer, setWhDrawer] = useState(false);
  const [editingWh, setEditingWh] = useState<Warehouse | null>(null);
  const [saving, setSaving] = useState(false);

  const loadPlants = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    settingsApi.listPlants(company.id)
      .then((p) => {
        setPlants(p);
        setSelectedPlant((cur) => cur ?? p[0]?.id ?? null);
      })
      .catch(() => message.error('Failed to load plants'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  const loadWarehouses = useCallback((plantId: string) => {
    if (!company?.id) return;
    setWhLoading(true);
    settingsApi.listWarehouses(company.id, plantId)
      .then(setWarehouses)
      .catch(() => message.error('Failed to load warehouses'))
      .finally(() => setWhLoading(false));
  }, [company?.id]);

  useEffect(loadPlants, [loadPlants]);
  useEffect(() => { if (selectedPlant) loadWarehouses(selectedPlant); }, [selectedPlant, loadWarehouses]);

  // ── Plant drawer ───────────────────────────────────────────────────────────
  const openPlantDrawer = (plant: Plant | null) => {
    setEditingPlant(plant);
    plantForm.resetFields();
    if (plant) plantForm.setFieldsValue(plant);
    setPlantDrawer(true);
  };

  const savePlant = async (values: Partial<Plant>) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      if (editingPlant) {
        await settingsApi.updatePlant(company.id, editingPlant.id, values);
        message.success('Plant updated.');
      } else {
        await settingsApi.createPlant(company.id, values as Plant);
        message.success('Plant created.');
      }
      setPlantDrawer(false);
      loadPlants();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Warehouse drawer ─────────────────────────────────────────────────────────
  const openWhDrawer = (wh: Warehouse | null) => {
    setEditingWh(wh);
    whForm.resetFields();
    if (wh) whForm.setFieldsValue(wh);
    else whForm.setFieldsValue({ warehouseType: 'raw_material', isDefault: false });
    setWhDrawer(true);
  };

  const saveWh = async (values: any) => {
    if (!company?.id || !selectedPlant) return;
    setSaving(true);
    try {
      if (editingWh) {
        await settingsApi.updateWarehouse(company.id, editingWh.id, values);
        message.success('Warehouse updated.');
      } else {
        await settingsApi.createWarehouse(company.id, { ...values, plantId: selectedPlant });
        message.success('Warehouse created.');
      }
      setWhDrawer(false);
      loadWarehouses(selectedPlant);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const activePlant = plants.find((p) => p.id === selectedPlant);

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 font-sans transition-colors rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 shrink-0 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0 mt-0.5">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">Plants & Warehouses</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {plants.length} plant{plants.length !== 1 ? 's' : ''} · Select a plant to manage its warehouses
              </p>
            </div>
          </div>
          <button onClick={() => openPlantDrawer(null)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-lg shadow-sm flex items-center transition-colors">
            <Plus className="w-4 h-4 mr-2" /> Add Plant
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col xl:flex-row p-6 gap-6 min-h-0 overflow-hidden">
        {/* Plants List */}
        <div className="w-full xl:w-1/2 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
            <h2 className="font-bold text-slate-800 dark:text-white flex items-center">
              <MapPin className="w-4 h-4 mr-2 text-indigo-500" /> Manufacturing Units
            </h2>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center text-slate-500">Loading plants...</div>
            ) : plants.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No plants yet. Add your first plant to get started.</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3 font-bold">Plant</th>
                    <th className="px-5 py-3 font-bold">Location</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {plants.map((p) => {
                    const isSelected = p.id === selectedPlant;
                    return (
                      <tr 
                        key={p.id} 
                        onClick={() => setSelectedPlant(p.id)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/20 hover:bg-indigo-50 dark:hover:bg-indigo-900/30' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                      >
                        <td className="px-5 py-3">
                          <div className={`font-bold ${isSelected ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>{p.name}</div>
                          <div className={`text-xs font-mono mt-0.5 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{p.code}</div>
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-slate-600 dark:text-slate-300">
                            {[p.city, p.stateCode && `State ${p.stateCode}`].filter(Boolean).join(', ') || '—'}
                          </div>
                          {p.gstin && <div className="text-[10px] font-mono text-slate-400 mt-0.5">{p.gstin}</div>}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${p.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                            {p.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={(e) => { e.stopPropagation(); openPlantDrawer(p); }} className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Warehouses List */}
        <div className="w-full xl:w-1/2 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden transition-colors">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
            <h2 className="font-bold text-slate-800 dark:text-white flex items-center">
              <Inbox className="w-4 h-4 mr-2 text-indigo-500" /> 
              Warehouses
              {activePlant && <span className="ml-2 text-slate-400 font-normal text-xs px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded">in {activePlant.name}</span>}
            </h2>
            <button disabled={!selectedPlant} onClick={() => openWhDrawer(null)} className={`text-xs font-bold px-3 py-1.5 rounded transition-colors flex items-center ${selectedPlant ? 'bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700 cursor-not-allowed'}`}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {whLoading ? (
              <div className="p-8 text-center text-slate-500">Loading warehouses...</div>
            ) : !selectedPlant ? (
              <div className="p-12 text-center flex flex-col items-center justify-center h-full">
                <ArrowRight className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 font-bold">Select a plant to view its warehouses</p>
              </div>
            ) : warehouses.length === 0 ? (
              <div className="p-8 text-center text-slate-500">No warehouses in this plant yet.</div>
            ) : (
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-3 font-bold">Warehouse</th>
                    <th className="px-5 py-3 font-bold">Type</th>
                    <th className="px-5 py-3 font-bold">Status</th>
                    <th className="px-5 py-3 font-bold w-12 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                  {warehouses.map((w) => {
                    const t = WAREHOUSE_TYPES.find((wt) => wt.value === w.warehouseType);
                    return (
                      <tr key={w.id} className="bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center">
                            <div className="font-bold text-slate-900 dark:text-white">{w.name}</div>
                            {w.isDefault && <span className="ml-2 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded">DEFAULT</span>}
                          </div>
                          <div className="text-xs font-mono mt-0.5 text-slate-500 dark:text-slate-400">{w.code}</div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border" style={{ borderColor: t?.color || '#ccc', color: t?.color || '#666', backgroundColor: `${t?.color || '#ccc'}15` }}>
                            {t?.label ?? w.warehouseType}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${w.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`}>
                            {w.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button onClick={() => openWhDrawer(w)} className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded transition-colors">
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Plant drawer */}
      <Drawer
        title={<div className="font-bold text-slate-800 dark:text-white">{editingPlant ? 'Edit Plant' : 'Add Plant'}</div>}
        open={plantDrawer}
        onClose={async () => { if (await confirmClose(plantForm)) { plantForm.resetFields(); setPlantDrawer(false); } }}
        width={460}
        extra={<button onClick={() => plantForm.submit()} disabled={saving} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-md shadow-sm transition-colors">{saving ? 'Saving...' : 'Save'}</button>}
      >
        <Form form={plantForm} layout="vertical" onFinish={savePlant} requiredMark={false} className="dark:text-white">
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="code" label={<span className="font-bold text-slate-700 dark:text-slate-300">Plant Code</span>} rules={[{ required: true, message: 'Code is required' }]}>
              <Input placeholder="MUM-01" />
            </Form.Item>
            <Form.Item name="name" label={<span className="font-bold text-slate-700 dark:text-slate-300">Plant Name</span>} rules={[{ required: true, message: 'Name is required' }]}>
              <Input placeholder="Mumbai Manufacturing Unit" />
            </Form.Item>
          </div>
          <Form.Item
            name="gstin"
            label={<span className="font-bold text-slate-700 dark:text-slate-300">GSTIN</span>}
            extra={<span className="text-xs text-slate-500">Plant in a different state needs its own GSTIN</span>}
            rules={[{ len: 15, message: 'GSTIN must be 15 characters' }]}
          >
            <Input placeholder="27ABCDE1234F1Z5" maxLength={15} style={{ textTransform: 'uppercase', fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="address" label={<span className="font-bold text-slate-700 dark:text-slate-300">Address</span>}><Input.TextArea rows={2} /></Form.Item>
          <div className="grid grid-cols-3 gap-4">
            <Form.Item name="city" label={<span className="font-bold text-slate-700 dark:text-slate-300">City</span>}><Input /></Form.Item>
            <Form.Item name="stateCode" label={<span className="font-bold text-slate-700 dark:text-slate-300">State</span>}>
              <Select showSearch placeholder="Code" options={STATE_CODES.map((c) => ({ value: c, label: c }))} />
            </Form.Item>
            <Form.Item name="pincode" label={<span className="font-bold text-slate-700 dark:text-slate-300">PIN</span>}><Input maxLength={6} /></Form.Item>
          </div>
          <Form.Item name="phone" label={<span className="font-bold text-slate-700 dark:text-slate-300">Phone</span>}><Input placeholder="+91 98765 43210" /></Form.Item>
          {editingPlant && (
            <Form.Item name="isActive" label={<span className="font-bold text-slate-700 dark:text-slate-300">Active</span>} valuePropName="checked"><Switch /></Form.Item>
          )}
        </Form>
      </Drawer>

      {/* Warehouse drawer */}
      <Drawer
        title={<div className="font-bold text-slate-800 dark:text-white">{editingWh ? 'Edit Warehouse' : 'Add Warehouse'}</div>}
        open={whDrawer}
        onClose={async () => { if (await confirmClose(whForm)) { whForm.resetFields(); setWhDrawer(false); } }}
        width={420}
        extra={<button onClick={() => whForm.submit()} disabled={saving} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-md shadow-sm transition-colors">{saving ? 'Saving...' : 'Save'}</button>}
      >
        <Form form={whForm} layout="vertical" onFinish={saveWh} requiredMark={false}>
          <div className="grid grid-cols-5 gap-4">
            <div className="col-span-2">
              <Form.Item name="code" label={<span className="font-bold text-slate-700 dark:text-slate-300">Code</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="RM-01" />
              </Form.Item>
            </div>
            <div className="col-span-3">
              <Form.Item name="name" label={<span className="font-bold text-slate-700 dark:text-slate-300">Name</span>} rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Raw Material Store" />
              </Form.Item>
            </div>
          </div>
          <Form.Item name="warehouseType" label={<span className="font-bold text-slate-700 dark:text-slate-300">Type</span>} rules={[{ required: true }]}>
            <Select options={WAREHOUSE_TYPES.map((w) => ({ value: w.value, label: w.label }))} />
          </Form.Item>
          <Form.Item name="isDefault" label={<span className="font-bold text-slate-700 dark:text-slate-300">Default receiving warehouse for this plant</span>} valuePropName="checked">
            <Switch />
          </Form.Item>
          {editingWh && (
            <Form.Item name="isActive" label={<span className="font-bold text-slate-700 dark:text-slate-300">Active</span>} valuePropName="checked"><Switch /></Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
}
