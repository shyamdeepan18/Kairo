import { useState, useEffect, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Tree, Button, Typography, Tag, Drawer, Form, Input, Select,
  Switch, Spin, message, Modal, Alert, Tooltip, theme as antTheme,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import {
  PlusOutlined, EditOutlined, FolderOutlined, FileTextOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import { settingsApi, type Account } from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

// ─── Account type config ──────────────────────────────────────────────────────

const ACCOUNT_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  asset:     { color: 'blue',    label: 'Asset' },
  liability: { color: 'red',     label: 'Liability' },
  equity:    { color: 'purple',  label: 'Equity' },
  revenue:   { color: 'green',   label: 'Revenue' },
  expense:   { color: 'orange',  label: 'Expense' },
};

const POSTING_CATEGORIES = [
  // Assets
  'inventory_raw_material', 'inventory_semi_finished', 'inventory_wip', 'inventory_finished',
  'inventory_stores', 'inventory_scrap',
  'accounts_receivable', 'customer_advance', 'supplier_advance',
  'cash', 'bank',
  'input_cgst', 'input_sgst', 'input_igst',
  // Liabilities
  'accounts_payable', 'output_cgst', 'output_sgst', 'output_igst',
  // Clearing
  'grn_clearing', 'grn_tax_clearing', 'round_off',
  // Revenue
  'sales_revenue', 'service_revenue',
  // Expenses
  'purchases', 'raw_material_consumed', 'cogs',
  // Manufacturing
  'stock_adjustment', 'production_variance',
  'labour_absorption', 'overhead_absorption',
];

// ─── Tree builder ─────────────────────────────────────────────────────────────

interface AccountNode extends Account {
  children: AccountNode[];
}

function buildTree(accounts: Account[]): AccountNode[] {
  const map = new Map<string, AccountNode>();
  accounts.forEach((a) => map.set(a.id, { ...a, children: [] }));

  const roots: AccountNode[] = [];
  accounts.forEach((a) => {
    const node = map.get(a.id)!;
    if (a.parentId) {
      const parent = map.get(a.parentId);
      parent ? parent.children.push(node) : roots.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function toTreeData(
  nodes: AccountNode[],
  onAdd: (parent: AccountNode) => void,
  onEdit: (account: AccountNode) => void,
  dt: ReturnType<typeof antTheme.useToken>['token']
): DataNode[] {
  return nodes.map((node) => {
    const typeConfig = ACCOUNT_TYPE_CONFIG[node.accountType] ?? { color: 'default', label: node.accountType };
    const title = (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 0',
          width: '100%',
        }}
        className="coa-tree-row"
      >
        {/* Code + Name */}
        <Text style={{ fontSize: 13, fontFamily: 'monospace', color: dt.colorTextSecondary, minWidth: 56 }}>
          {node.code}
        </Text>
        <Text
          strong={node.isGroup}
          style={{ fontSize: 13, opacity: node.isActive ? 1 : 0.45 }}
        >
          {node.name}
        </Text>

        {/* Badges */}
        <Tag
          color={typeConfig.color}
          style={{ fontSize: 10, borderRadius: 8, border: 0, padding: '0 6px', lineHeight: '18px' }}
        >
          {typeConfig.label}
        </Tag>
        {node.postingCategory && (
          <Tag
            style={{ fontSize: 10, borderRadius: 8, border: 0, padding: '0 6px', lineHeight: '18px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}
            color="processing"
          >
            {node.postingCategory}
          </Tag>
        )}
        {!node.isActive && (
          <Tooltip title="Inactive account">
            <EyeInvisibleOutlined style={{ fontSize: 12, color: dt.colorTextTertiary }} />
          </Tooltip>
        )}

        {/* Action buttons (shown on hover via CSS) */}
        <div className="coa-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 4, opacity: 0, transition: 'opacity 0.15s' }}>
          {node.isGroup && (
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              onClick={(e) => { e.stopPropagation(); onAdd(node); }}
              style={{ fontSize: 11, height: 22, padding: '0 6px', color: dt.colorTextSecondary }}
            >
              Add
            </Button>
          )}
          {!node.isSystemAccount && (
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit(node); }}
              style={{ fontSize: 11, height: 22, padding: '0 6px', color: dt.colorTextSecondary }}
            />
          )}
        </div>
      </div>
    );

    return {
      key: node.id,
      title,
      icon: node.isGroup ? <FolderOutlined /> : <FileTextOutlined />,
      isLeaf: !node.isGroup,
      children: node.children.length > 0 ? toTreeData(node.children, onAdd, onEdit, dt) : undefined,
    } as DataNode;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ChartOfAccountsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [addForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  // Drawers
  const [addParent, setAddParent] = useState<AccountNode | null>(null);
  const [editTarget, setEditTarget] = useState<AccountNode | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Expanded keys — expand all groups by default
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const load = () => {
    if (!company?.id) return;
    setLoading(true);
    settingsApi.listAccounts(company.id)
      .then((list) => {
        setAccounts(list);
        // Auto-expand top-level groups
        const groupIds = list.filter((a) => a.isGroup && !a.parentId).map((a) => a.id);
        setExpandedKeys(groupIds);
      })
      .catch(() => message.error('Failed to load chart of accounts'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [company?.id]);

  const tree = useMemo(() => {
    if (accounts.length === 0) return [];
    const roots = buildTree(accounts);
    return toTreeData(
      roots,
      (parent) => { setAddParent(parent); addForm.resetFields(); },
      (account) => { setEditTarget(account); editForm.setFieldsValue(account); },
      dt
    );
  }, [accounts, dt]);

  const handleAdd = async (values: {
    code: string; name: string; isGroup: boolean; postingCategory?: string;
  }) => {
    if (!company?.id || !addParent) return;
    setAddSaving(true);
    try {
      const created = await settingsApi.createAccount(company.id, {
        ...values,
        postingCategory: values.postingCategory || null,
        accountType: addParent.accountType,
        normalBalance: addParent.normalBalance,
        parentId: addParent.id,
        isGroup: values.isGroup ?? false,
      });
      setAccounts((prev) => [...prev, created]);
      setAddParent(null);
      message.success(`Account "${created.name}" created.`);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Create failed');
    } finally {
      setAddSaving(false);
    }
  };

  const handleEdit = async (values: { name: string; postingCategory?: string; isActive: boolean }) => {
    if (!company?.id || !editTarget) return;
    setEditSaving(true);
    try {
      const updated = await settingsApi.updateAccount(company.id, editTarget.id, values);
      setAccounts((prev) => prev.map((a) => a.id === updated.id ? updated : a));
      setEditTarget(null);
      message.success('Account updated.');
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Chart of Accounts</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {accounts.length} accounts · Hover a group to add child accounts
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="small" onClick={() => setExpandedKeys(accounts.filter((a) => a.isGroup).map((a) => a.id))}>
            Expand all
          </Button>
          <Button size="small" onClick={() => setExpandedKeys([])}>
            Collapse all
          </Button>
        </div>
      </div>

      {/* COA tree */}
      <div
        style={{
          background: dt.colorBgContainer,
          borderRadius: 12,
          border: `1px solid ${dt.colorBorderSecondary}`,
          padding: '16px 8px',
          minHeight: 400,
        }}
      >
        {/* CSS for hover reveal of action buttons */}
        <style>{`
          .coa-tree-row:hover .coa-actions { opacity: 1 !important; }
          .ant-tree-treenode { width: 100%; }
          .ant-tree-node-content-wrapper { flex: 1; }
        `}</style>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
        ) : accounts.length === 0 ? (
          <Alert
            type="info"
            showIcon
            message="No chart of accounts found"
            description="Run the COA seed script to populate the standard Indian chart of accounts, or create accounts manually."
            style={{ margin: 16, borderRadius: 8 }}
          />
        ) : (
          <Tree
            showIcon
            showLine={{ showLeafIcon: false }}
            treeData={tree}
            expandedKeys={expandedKeys}
            onExpand={(keys) => setExpandedKeys(keys as string[])}
            selectable={false}
            blockNode
          />
        )}
      </div>

      {/* Add account drawer */}
      <Drawer
        title={addParent ? `Add account under "${addParent.name}"` : 'Add Account'}
        open={!!addParent}
        onClose={async () => { if (await confirmClose(addForm)) { addForm.resetFields(); setAddParent(null); } }}
        width={420}
        extra={
          <Button type="primary" loading={addSaving} onClick={() => addForm.submit()}>
            Create Account
          </Button>
        }
      >
        {addParent && (
          <Form form={addForm} layout="vertical" onFinish={handleAdd} requiredMark={false}>
            <Alert
              type="info"
              showIcon
              message={`Account type: ${ACCOUNT_TYPE_CONFIG[addParent.accountType]?.label ?? addParent.accountType}`}
              description={`Normal balance: ${addParent.normalBalance}. Inherited from parent group.`}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />

            <Form.Item
              name="code"
              label="Account Code"
              rules={[{ required: true, message: 'Code is required' }]}
              extra="Unique code within this company (e.g. 1310)"
            >
              <Input placeholder="1310" style={{ fontFamily: 'monospace' }} />
            </Form.Item>

            <Form.Item
              name="name"
              label="Account Name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input placeholder="e.g. Cash in Hand" />
            </Form.Item>

            <Form.Item name="isGroup" label="Account Type" initialValue={false}>
              <Select
                options={[
                  { value: false, label: 'Leaf — can receive postings' },
                  { value: true, label: 'Group — contains child accounts' },
                ]}
              />
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => prev.isGroup !== curr.isGroup}
            >
              {({ getFieldValue }) =>
                !getFieldValue('isGroup') && (
                  <Form.Item
                    name="postingCategory"
                    label="Posting Category"
                    extra="Links this account to automatic postings from documents"
                  >
                    <Select
                      allowClear
                      showSearch
                      placeholder="Select category (optional)"
                      options={POSTING_CATEGORIES.map((c) => ({ value: c, label: c }))}
                    />
                  </Form.Item>
                )
              }
            </Form.Item>
          </Form>
        )}
      </Drawer>

      {/* Edit account drawer */}
      <Drawer
        title={editTarget ? `Edit "${editTarget.name}"` : 'Edit Account'}
        open={!!editTarget}
        onClose={async () => { if (await confirmClose(editForm)) { editForm.resetFields(); setEditTarget(null); } }}
        width={420}
        extra={
          <Button type="primary" loading={editSaving} onClick={() => editForm.submit()}>
            Save Changes
          </Button>
        }
      >
        {editTarget && (
          <Form form={editForm} layout="vertical" onFinish={handleEdit} requiredMark={false}>
            <Form.Item label="Account Code">
              <Input value={editTarget.code} disabled style={{ fontFamily: 'monospace' }} />
            </Form.Item>

            <Form.Item
              name="name"
              label="Account Name"
              rules={[{ required: true }]}
            >
              <Input />
            </Form.Item>

            {!editTarget.isGroup && (
              <Form.Item
                name="postingCategory"
                label="Posting Category"
                extra="Links this account to automatic postings from documents"
              >
                <Select
                  allowClear
                  showSearch
                  placeholder="None"
                  options={POSTING_CATEGORIES.map((c) => ({ value: c, label: c }))}
                />
              </Form.Item>
            )}

            <Form.Item name="isActive" label="Active" valuePropName="checked">
              <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
            </Form.Item>

            {editTarget.isSystemAccount && (
              <Alert
                type="warning"
                showIcon
                message="System account — code and type cannot be changed"
                style={{ borderRadius: 8 }}
              />
            )}
          </Form>
        )}
      </Drawer>
    </div>
  );
}
