import React, { useState, useEffect, useMemo } from 'react';
import { message, Modal, Form, Input, Switch, Select, Popconfirm } from 'antd';
import { 
  ShieldCheck, Save, Plus, Search, Layers, Lock, Trash2
} from 'lucide-react';
import { adminApi, type AdminRole } from '../../../api/admin';

interface PermEntry { code: string; label: string; }

const PERMISSION_CATALOG: { module: string; items: PermEntry[] }[] = [
  {
    module: 'Purchase',
    items: [
      { code: 'purchase.supplier.view',       label: 'View Suppliers' },
      { code: 'purchase.supplier.create',     label: 'Create Suppliers' },
      { code: 'purchase.supplier.edit',       label: 'Edit Suppliers' },
      { code: 'purchase.requisition.view',    label: 'View Purchase Requisitions' },
      { code: 'purchase.requisition.create',  label: 'Create Purchase Requisitions' },
      { code: 'purchase.requisition.submit',  label: 'Submit Purchase Requisitions' },
      { code: 'purchase.requisition.approve', label: 'Approve Purchase Requisitions' },
      { code: 'purchase.requisition.cancel',  label: 'Cancel Purchase Requisitions' },
      { code: 'purchase.po.view',             label: 'View Purchase Orders' },
      { code: 'purchase.po.create',           label: 'Create Purchase Orders' },
      { code: 'purchase.po.edit',             label: 'Edit Purchase Orders' },
      { code: 'purchase.po.submit',           label: 'Submit Purchase Orders' },
      { code: 'purchase.po.approve',          label: 'Approve Purchase Orders' },
      { code: 'purchase.po.cancel',           label: 'Cancel Purchase Orders' },
      { code: 'purchase.grn.view',            label: 'View Goods Receipt Notes' },
      { code: 'purchase.grn.create',          label: 'Create Goods Receipt Notes' },
      { code: 'purchase.grn.submit',          label: 'Submit Goods Receipt Notes' },
      { code: 'purchase.invoice.view',        label: 'View Purchase Invoices' },
      { code: 'purchase.invoice.create',      label: 'Create Purchase Invoices' },
      { code: 'purchase.invoice.approve',     label: 'Approve Purchase Invoices' },
      { code: 'purchase.payment.view',        label: 'View Purchase Payments' },
      { code: 'purchase.payment.create',      label: 'Create Purchase Payments' },
      { code: 'purchase.payment.approve',     label: 'Approve Purchase Payments' },
      { code: 'purchase.return.view',         label: 'View Purchase Returns' },
      { code: 'purchase.return.create',       label: 'Create Purchase Returns' },
      { code: 'purchase.return.approve',      label: 'Approve Purchase Returns' },
      { code: 'purchase.debitnote.create',    label: 'Create Debit Notes' },
      { code: 'purchase.reports.view',        label: 'View Purchase Reports' },
    ],
  },
  {
    module: 'Sales',
    items: [
      { code: 'sales.customer.view',          label: 'View Customers' },
      { code: 'sales.customer.create',        label: 'Create Customers' },
      { code: 'sales.customer.edit',          label: 'Edit Customers' },
      { code: 'sales.quotation.view',         label: 'View Quotations' },
      { code: 'sales.quotation.create',       label: 'Create Quotations' },
      { code: 'sales.quotation.submit',       label: 'Submit Quotations' },
      { code: 'sales.quotation.approve',      label: 'Approve Quotations' },
      { code: 'sales.so.view',                label: 'View Sales Orders' },
      { code: 'sales.so.create',              label: 'Create Sales Orders' },
      { code: 'sales.so.submit',              label: 'Submit Sales Orders' },
      { code: 'sales.so.approve',             label: 'Approve Sales Orders' },
      { code: 'sales.so.cancel',              label: 'Cancel Sales Orders' },
      { code: 'sales.delivery.view',          label: 'View Deliveries' },
      { code: 'sales.delivery.create',        label: 'Create Deliveries' },
      { code: 'sales.delivery.submit',        label: 'Submit Deliveries' },
      { code: 'sales.delivery.approve',       label: 'Approve Deliveries' },
      { code: 'sales.invoice.view',           label: 'View Sales Invoices' },
      { code: 'sales.invoice.create',         label: 'Create Sales Invoices' },
      { code: 'sales.invoice.submit',         label: 'Submit Sales Invoices' },
      { code: 'sales.invoice.approve',        label: 'Approve Sales Invoices' },
      { code: 'sales.receipt.view',           label: 'View Customer Receipts' },
      { code: 'sales.receipt.create',         label: 'Create Customer Receipts' },
      { code: 'sales.receipt.approve',        label: 'Approve Customer Receipts' },
      { code: 'sales.reports.view',           label: 'View Sales Reports' },
    ],
  },
  {
    module: 'Inventory',
    items: [
      { code: 'inventory.items.view',         label: 'View Items' },
      { code: 'inventory.items.create',       label: 'Create Items' },
      { code: 'inventory.items.edit',         label: 'Edit Items' },
      { code: 'inventory.stock.view',         label: 'View Stock Balances & Ledger' },
      { code: 'inventory.stock.transfer',     label: 'Transfer Stock' },
      { code: 'inventory.stock.adjust',       label: 'Adjust Stock' },
      { code: 'inventory.stock.count',        label: 'Physical Stock Count' },
      { code: 'inventory.reports.view',       label: 'View Inventory Reports' },
    ],
  },
  {
    module: 'Manufacturing',
    items: [
      { code: 'manufacturing.bom.view',       label: 'View Bill of Materials' },
      { code: 'manufacturing.bom.create',     label: 'Create Bill of Materials' },
      { code: 'manufacturing.bom.approve',    label: 'Approve Bill of Materials' },
      { code: 'manufacturing.order.view',     label: 'View Production Orders' },
      { code: 'manufacturing.order.create',   label: 'Create Production Orders' },
      { code: 'manufacturing.order.approve',  label: 'Approve Production Orders' },
      { code: 'manufacturing.order.issue',    label: 'Issue Material to Production' },
      { code: 'manufacturing.mrp.run',        label: 'Run MRP' },
      { code: 'manufacturing.eco.view',       label: 'View ECOs' },
      { code: 'manufacturing.eco.create',     label: 'Create ECOs' },
      { code: 'manufacturing.eco.approve',    label: 'Approve ECOs' },
      { code: 'manufacturing.reports.view',   label: 'View Manufacturing Reports' },
    ],
  },
  {
    module: 'Accounting',
    items: [
      { code: 'accounting.jv.view',           label: 'View Journal Vouchers' },
      { code: 'accounting.jv.create',         label: 'Create Journal Vouchers' },
      { code: 'accounting.jv.submit',         label: 'Submit Journal Vouchers' },
      { code: 'accounting.jv.approve',        label: 'Approve Journal Vouchers' },
      { code: 'accounting.coa.view',          label: 'View Chart of Accounts' },
      { code: 'accounting.coa.manage',        label: 'Manage Chart of Accounts' },
      { code: 'accounting.reports.view',      label: 'View Accounting Reports' },
      { code: 'accounting.reports.financial', label: 'View Financial Statements' },
      { code: 'accounting.period.close',      label: 'Close Accounting Period' },
      { code: 'accounting.bankrecon.view',    label: 'View Bank Reconciliations' },
      { code: 'accounting.bankrecon.manage',  label: 'Manage Bank Reconciliations' },
      { code: 'accounting.bankaccount.view',  label: 'View Bank Accounts' },
      { code: 'accounting.bankaccount.manage', label: 'Manage Bank Accounts' },
    ],
  },
  {
    module: 'Settings & Security',
    items: [
      { code: 'settings.company.view',        label: 'View Company Settings' },
      { code: 'settings.company.edit',        label: 'Edit Company Settings' },
      { code: 'settings.plants.view',         label: 'View Plants & Warehouses' },
      { code: 'settings.plant.create',        label: 'Create Plants' },
      { code: 'settings.plant.edit',          label: 'Edit Plants' },
      { code: 'settings.warehouse.create',    label: 'Create Warehouses' },
      { code: 'settings.warehouse.edit',      label: 'Edit Warehouses' },
      { code: 'auth.users.view',              label: 'View Users' },
      { code: 'auth.users.create',            label: 'Create Users' },
      { code: 'auth.users.edit',              label: 'Edit Users' },
      { code: 'auth.users.deactivate',        label: 'Deactivate Users' },
      { code: 'auth.roles.view',              label: 'View Roles' },
      { code: 'auth.roles.manage',            label: 'Manage Roles' },
      { code: 'system.bypass_sod',            label: 'Bypass Segregation of Duties (Maker/Checker)' },
    ],
  },
];

export function InteractiveRoles({ companyId }: { companyId: string }) {
  const [form] = Form.useForm();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  
  const [grantedCodes, setGrantedCodes] = useState<Set<string>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const selectedRole = useMemo(() => roles.find((r) => r.id === selectedRoleId), [roles, selectedRoleId]);

  const loadRoles = () => {
    if (!companyId) return;
    setRolesLoading(true);
    adminApi.listRoles(companyId)
      .then((r) => {
        setRoles(r.roles);
        if (r.roles.length > 0 && !selectedRoleId) {
          handleSelectRole(r.roles[0].id);
        }
      })
      .catch(() => message.error('Failed to load roles'))
      .finally(() => setRolesLoading(false));
  };

  useEffect(() => { loadRoles(); }, [companyId]);

  const handleSelectRole = async (roleId: string) => {
    setSelectedRoleId(roleId);
    setIsDirty(false);
    if (!companyId) return;
    try {
      const dbPermsData = await adminApi.getRolePermissions(companyId, roleId);
      setGrantedCodes(new Set(dbPermsData.permissionCodes));
    } catch (e) {
      message.error('Failed to load permissions for role');
    }
  };

  const handleToggle = (code: string, checked: boolean) => {
    setGrantedCodes(prev => {
      const next = new Set(prev);
      if (checked) next.add(code);
      else next.delete(code);
      return next;
    });
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!companyId || !selectedRoleId) return;
    setSaving(true);
    try {
      await adminApi.updateRolePermissions(companyId, selectedRoleId, Array.from(grantedCodes));
      message.success(`Permissions successfully updated.`);
      setIsDirty(false);
    } catch (e) {
      message.error('Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (values: any) => {
    if (!companyId) return;
    setSaving(true);
    try {
      await adminApi.createRole(companyId, values);
      message.success('Role created');
      setModalOpen(false);
      form.resetFields();
      loadRoles();
    } catch {
      message.error('Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!companyId || !selectedRoleId) return;
    try {
      await adminApi.deleteRole(companyId, selectedRoleId);
      message.success('Role deleted');
      setSelectedRoleId(null);
      loadRoles();
    } catch {
      message.error('Failed to delete role');
    }
  };

  return (
    <div className="flex flex-col bg-slate-50 dark:bg-slate-900 font-sans h-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 transition-colors">
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-6 shrink-0 space-y-4 transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg shrink-0 mt-0.5">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">User Roles & Permissions (RBAC)</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage system roles and configure granular permissions for the ERP system.</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <button onClick={() => setModalOpen(true)} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-sm rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center transition-colors">
              <Plus className="w-4 h-4 mr-2" /> New Role
            </button>
            <button onClick={handleSave} disabled={!isDirty || saving} className={`px-5 py-2 font-bold text-sm rounded-lg shadow-sm flex items-center transition-colors ${isDirty && !saving ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-indigo-300 dark:bg-indigo-800 text-indigo-50 dark:text-indigo-200 cursor-not-allowed'}`}>
              <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save Permissions'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row p-6 gap-6 min-h-[500px] min-h-0 overflow-hidden">
        {/* Roles List Sidebar */}
        <div className="w-full md:w-80 flex flex-col space-y-4 shrink-0 overflow-hidden">
          <div className="flex items-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-sm shrink-0">
            <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input type="text" placeholder="Search roles..." className="w-full text-sm outline-none bg-transparent dark:text-white" />
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pb-4">
            {roles.map(role => {
              const isSelected = selectedRoleId === role.id;
              let badgeText = 'CUSTOM';
              let badgeColors = 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
              if (role.isSystemRole) {
                badgeText = 'SYSTEM'; badgeColors = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300';
              } else if (role.name.toLowerCase().includes('admin') || role.name.toLowerCase().includes('owner')) {
                badgeText = 'ADMIN'; badgeColors = 'bg-slate-800 text-white dark:bg-slate-600';
              }
              
              return (
                <div key={role.id} onClick={() => handleSelectRole(role.id)} className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 shadow-sm' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-sm'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className={`font-bold ${isSelected ? 'text-indigo-950 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>{role.name}</h3>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${badgeColors}`}>{badgeText}</span>
                  </div>
                  <p className={`text-xs ${isSelected ? 'text-indigo-800 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400'}`}>{role.description || 'System defined role'}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Permissions Editor */}
        {selectedRole ? (
          <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm overflow-hidden">
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700 pb-4 shrink-0">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center">
                <Layers className="w-4 h-4 mr-2 text-indigo-500" /> Permission Matrix
              </h2>
              {!selectedRole.isSystemRole && (
                <Popconfirm title="Are you sure you want to delete this role?" onConfirm={handleDeleteRole} okText="Yes, Delete" cancelText="Cancel" okButtonProps={{ danger: true }}>
                  <button className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors flex items-center">
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete Role
                  </button>
                </Popconfirm>
              )}
            </div>
              
            <div className="flex-1 overflow-y-auto space-y-6 pt-4 pr-2 custom-scrollbar">
                {PERMISSION_CATALOG.map((group) => (
                  <div key={group.module} className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-5 border border-slate-100 dark:border-slate-700/50">
                    <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                        {group.module}
                      </div>
                      {!selectedRole.isSystemRole && (
                        <button 
                          onClick={() => {
                            const allCodes = group.items.map(i => i.code);
                            const hasAll = allCodes.every(c => grantedCodes.has(c));
                            setGrantedCodes(prev => {
                              const next = new Set(prev);
                              allCodes.forEach(c => hasAll ? next.delete(c) : next.add(c));
                              return next;
                            });
                            setIsDirty(true);
                          }}
                          className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                        >
                          {group.items.every(i => grantedCodes.has(i.code)) ? 'Clear All' : 'Select All'}
                        </button>
                      )}
                    </h3>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                      {group.items.map((item) => (
                        <div key={item.code} className="flex justify-between items-center bg-white dark:bg-slate-800 p-3 rounded-md border border-slate-200 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-700 transition-colors">
                          <div>
                            <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{item.label}</div>
                            <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded inline-block">
                              {item.code}
                            </div>
                          </div>
                          <Switch 
                            size="small" 
                            checked={grantedCodes.has(item.code)} 
                            onChange={(c) => handleToggle(item.code, c)} 
                            disabled={selectedRole.isSystemRole}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
            <Lock className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-4" />
            <p className="text-slate-500 dark:text-slate-400 font-bold">Select a role to configure permissions</p>
          </div>
        )}
      </div>

      <Modal title="Create New Role" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={440}>
        <Form form={form} layout="vertical" onFinish={handleCreateRole} requiredMark={false} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true, message: 'Role name is required' }]}>
            <Input placeholder="e.g. Purchase Manager" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} placeholder="What can this role do?" />
          </Form.Item>
          <Form.Item name="copyFromRoleIds" label="Copy permissions from existing role">
            <Select allowClear placeholder="Select a role to clone (optional)" mode="multiple" maxCount={1}>
              {roles.map(r => (
                <Select.Option key={r.id} value={r.id}>{r.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded-md">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">Create Role</button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
