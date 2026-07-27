import { useState, useEffect, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Switch, Button, Typography, Tag, Spin, Alert, message,
  Modal, Form, Input, Empty, Divider, theme as antTheme,
} from 'antd';
import { PlusOutlined, SaveOutlined, LockOutlined } from '@ant-design/icons';
import { settingsApi, type Role } from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

// ─── Permission catalog (frontend definition — matches seed data) ─────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function RolesPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();

  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [grantedCodes, setGrantedCodes] = useState<Set<string>>(new Set());
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set()); // codes that were toggled
  const [isDirty, setIsDirty] = useState(false);

  const [rolesLoading, setRolesLoading] = useState(true);
  const [permsLoading, setPermsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId),
    [roles, selectedRoleId]
  );

  const loadRoles = () => {
    if (!company?.id) return;
    setRolesLoading(true);
    settingsApi.listRoles(company.id)
      .then((r) => {
        setRoles(r);
        // Auto-select first role
        if (r.length > 0 && !selectedRoleId) {
          setSelectedRoleId(r[0].id);
        }
      })
      .catch(() => message.error('Failed to load roles'))
      .finally(() => setRolesLoading(false));
  };

  useEffect(loadRoles, [company?.id]);

  useEffect(() => {
    if (!company?.id || !selectedRoleId) return;
    setPermsLoading(true);
    setIsDirty(false);
    settingsApi.getRolePermissions(company.id, selectedRoleId)
      .then((codes) => setGrantedCodes(new Set(codes)))
      .catch(() => message.error('Failed to load permissions'))
      .finally(() => setPermsLoading(false));
  }, [selectedRoleId, company?.id]);

  const handleToggle = (code: string, checked: boolean) => {
    setGrantedCodes((prev) => {
      const next = new Set(prev);
      checked ? next.add(code) : next.delete(code);
      return next;
    });
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!company?.id || !selectedRoleId) return;
    setSaving(true);
    try {
      await settingsApi.setRolePermissions(company.id, selectedRoleId, [...grantedCodes]);
      setIsDirty(false);
      message.success('Permissions saved.');
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async (values: { name: string; description: string }) => {
    if (!company?.id) return;
    setCreating(true);
    try {
      const role = await settingsApi.createRole(company.id, values);
      setRoles((r) => [...r, role]);
      setSelectedRoleId(role.id);
      setModalOpen(false);
      form.resetFields();
      message.success(`Role "${role.name}" created.`);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Roles & Permissions</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Select a role to edit its permissions
          </Text>
        </div>
        <Button icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          New Role
        </Button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Role list */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            background: dt.colorBgContainer,
            borderRadius: 10,
            border: `1px solid ${dt.colorBorderSecondary}`,
            overflow: 'hidden',
          }}
        >
          {rolesLoading ? (
            <div style={{ textAlign: 'center', padding: 32 }}><Spin /></div>
          ) : roles.length === 0 ? (
            <Empty description="No roles yet" style={{ padding: 24 }} />
          ) : (
            roles.map((role, i) => (
              <div
                key={role.id}
                onClick={async () => {
                  if (isDirty && !(await confirmClose(isDirty, { content: 'You have unsaved permission changes. Switch role anyway?' }))) return;
                  setSelectedRoleId(role.id);
                }}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  borderBottom: i < roles.length - 1 ? `1px solid ${dt.colorBorderSecondary}` : undefined,
                  background: selectedRoleId === role.id
                    ? (dt.colorPrimary + '18')
                    : 'transparent',
                  borderLeft: selectedRoleId === role.id
                    ? `3px solid ${dt.colorPrimary}`
                    : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {role.isSystemRole && (
                    <LockOutlined style={{ fontSize: 11, color: dt.colorTextTertiary }} />
                  )}
                  <Text
                    strong={selectedRoleId === role.id}
                    style={{ fontSize: 13, color: selectedRoleId === role.id ? dt.colorPrimary : undefined }}
                  >
                    {role.name}
                  </Text>
                </div>
                {role.isSystemRole && (
                  <Tag style={{ fontSize: 10, marginTop: 2, borderRadius: 8, border: 0 }} color="default">
                    System
                  </Tag>
                )}
              </div>
            ))
          )}
        </div>

        {/* Permissions matrix */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedRoleId ? (
            <div
              style={{
                background: dt.colorBgContainer,
                borderRadius: 10,
                border: `1px solid ${dt.colorBorderSecondary}`,
                padding: 48,
                textAlign: 'center',
              }}
            >
              <Text type="secondary">Select a role to configure its permissions</Text>
            </div>
          ) : (
            <div
              style={{
                background: dt.colorBgContainer,
                borderRadius: 10,
                border: `1px solid ${dt.colorBorderSecondary}`,
                overflow: 'hidden',
              }}
            >
              {/* Matrix header */}
              <div
                style={{
                  padding: '14px 20px',
                  borderBottom: `1px solid ${dt.colorBorderSecondary}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: dt.colorBgElevated,
                  position: 'sticky',
                  top: 56,
                  zIndex: 10,
                }}
              >
                <div>
                  <Text strong style={{ fontSize: 14 }}>
                    {selectedRole?.name}
                  </Text>
                  {selectedRole?.isSystemRole && (
                    <Tag
                      icon={<LockOutlined />}
                      style={{ marginLeft: 8, borderRadius: 10, border: 0, fontSize: 11 }}
                    >
                      System Role
                    </Tag>
                  )}
                  {isDirty && (
                    <Tag color="warning" style={{ marginLeft: 8, borderRadius: 10, border: 0, fontSize: 11 }}>
                      Unsaved changes
                    </Tag>
                  )}
                </div>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  disabled={!isDirty}
                  onClick={handleSave}
                >
                  Save Changes
                </Button>
              </div>

              {/* Permissions list */}
              {permsLoading ? (
                <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
              ) : (
                <div style={{ padding: '8px 0 16px' }}>
                  {PERMISSION_CATALOG.map((group, gi) => (
                    <div key={group.module}>
                      {gi > 0 && <Divider style={{ margin: '4px 0' }} />}
                      {/* Module header */}
                      <div
                        style={{
                          padding: '10px 20px 6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            letterSpacing: '0.6px',
                            color: dt.colorTextTertiary,
                          }}
                        >
                          {group.module}
                        </Text>
                        {/* Select-all for module */}
                        <Button
                          type="link"
                          size="small"
                          style={{ fontSize: 11, padding: '0 4px', height: 'auto' }}
                          onClick={() => {
                            const allCodes = group.items.map((i) => i.code);
                            const allGranted = allCodes.every((c) => grantedCodes.has(c));
                            setGrantedCodes((prev) => {
                              const next = new Set(prev);
                              allCodes.forEach((c) => (allGranted ? next.delete(c) : next.add(c)));
                              return next;
                            });
                            setIsDirty(true);
                          }}
                        >
                          {group.items.every((i) => grantedCodes.has(i.code))
                            ? 'Deselect all'
                            : 'Select all'}
                        </Button>
                      </div>

                      {/* Permission rows */}
                      {group.items.map((item, pi) => (
                        <div
                          key={item.code}
                          style={{
                            padding: '10px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: pi % 2 === 0 ? 'transparent' : (dt.colorFillTertiary ?? 'rgba(0,0,0,0.02)'),
                          }}
                        >
                          <div>
                            <Text style={{ fontSize: 13 }}>{item.label}</Text>
                            <Text
                              type="secondary"
                              style={{ display: 'block', fontSize: 11, fontFamily: 'monospace' }}
                            >
                              {item.code}
                            </Text>
                          </div>
                          <Switch
                            size="small"
                            checked={grantedCodes.has(item.code)}
                            onChange={(checked) => handleToggle(item.code, checked)}
                            disabled={selectedRole?.isSystemRole}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* New role modal */}
      <Modal
        title="Create New Role"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={440}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateRole}
          requiredMark={false}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="name"
            label="Role Name"
            rules={[{ required: true, message: 'Role name is required' }]}
          >
            <Input placeholder="e.g. Purchase Manager" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea rows={2} placeholder="What can this role do?" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button type="primary" htmlType="submit" loading={creating}>
                Create Role
              </Button>
            </div>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
