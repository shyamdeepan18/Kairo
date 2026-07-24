import { useState, useEffect, useMemo } from 'react';
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
      { code: 'purchase.pr.view',        label: 'View Purchase Requisitions' },
      { code: 'purchase.pr.create',      label: 'Create / Edit PR' },
      { code: 'purchase.pr.submit',      label: 'Submit PR for approval' },
      { code: 'purchase.pr.approve',     label: 'Approve / Reject PR' },
      { code: 'purchase.po.view',        label: 'View Purchase Orders' },
      { code: 'purchase.po.create',      label: 'Create / Edit PO' },
      { code: 'purchase.po.approve',     label: 'Approve / Reject PO' },
      { code: 'purchase.grn.view',       label: 'View GRN' },
      { code: 'purchase.grn.create',     label: 'Create GRN' },
      { code: 'purchase.invoice.view',   label: 'View Purchase Invoices' },
      { code: 'purchase.invoice.create', label: 'Create Purchase Invoice' },
      { code: 'purchase.invoice.approve',label: 'Approve Purchase Invoice' },
      { code: 'purchase.payment.view',   label: 'View Vendor Payments' },
      { code: 'purchase.payment.create', label: 'Create Vendor Payment' },
      { code: 'purchase.payment.approve',label: 'Approve Vendor Payment' },
    ],
  },
  {
    module: 'Sales',
    items: [
      { code: 'sales.quotation.view',    label: 'View Quotations' },
      { code: 'sales.quotation.create',  label: 'Create / Edit Quotation' },
      { code: 'sales.order.view',        label: 'View Sales Orders' },
      { code: 'sales.order.create',      label: 'Create / Edit SO' },
      { code: 'sales.order.approve',     label: 'Approve / Reject SO' },
      { code: 'sales.delivery.view',     label: 'View Deliveries' },
      { code: 'sales.delivery.create',   label: 'Create Delivery Note' },
      { code: 'sales.invoice.view',      label: 'View Sales Invoices' },
      { code: 'sales.invoice.create',    label: 'Create Sales Invoice' },
      { code: 'sales.invoice.approve',   label: 'Approve Sales Invoice' },
      { code: 'sales.receipt.view',      label: 'View Customer Receipts' },
      { code: 'sales.receipt.create',    label: 'Create Customer Receipt' },
    ],
  },
  {
    module: 'Inventory',
    items: [
      { code: 'inventory.stock.view',         label: 'View Stock Balances' },
      { code: 'inventory.ledger.view',         label: 'View Stock Ledger' },
      { code: 'inventory.adjustment.create',   label: 'Post Stock Adjustment' },
      { code: 'inventory.transfer.create',     label: 'Create Stock Transfer' },
      { code: 'inventory.physical.create',     label: 'Run Physical Count' },
    ],
  },
  {
    module: 'Manufacturing',
    items: [
      { code: 'manufacturing.bom.view',    label: 'View Bill of Materials' },
      { code: 'manufacturing.bom.edit',    label: 'Create / Edit BOM' },
      { code: 'manufacturing.order.view',  label: 'View Production Orders' },
      { code: 'manufacturing.order.create',label: 'Create Production Order' },
      { code: 'manufacturing.order.close', label: 'Close Production Order' },
      { code: 'manufacturing.batch.view',  label: 'View Process Batches' },
      { code: 'manufacturing.batch.create',label: 'Create Process Batch' },
    ],
  },
  {
    module: 'Accounting',
    items: [
      { code: 'accounting.jv.view',        label: 'View Journal Vouchers' },
      { code: 'accounting.jv.create',      label: 'Create Journal Voucher' },
      { code: 'accounting.jv.approve',     label: 'Approve Journal Voucher' },
      { code: 'accounting.reports.view',   label: 'View Financial Reports' },
      { code: 'accounting.gst.view',       label: 'View GST Reports' },
    ],
  },
  {
    module: 'Settings',
    items: [
      { code: 'settings.company.edit',  label: 'Edit Company Settings' },
      { code: 'settings.users.invite',  label: 'Invite / Manage Users' },
      { code: 'settings.roles.edit',    label: 'Create / Edit Roles' },
      { code: 'settings.coa.edit',      label: 'Edit Chart of Accounts' },
      { code: 'settings.tax.edit',      label: 'Edit Tax Codes' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function RolesPage() {
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
                onClick={() => setSelectedRoleId(role.id)}
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
