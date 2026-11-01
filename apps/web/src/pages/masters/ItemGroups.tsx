import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  message, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import { FolderTree, Plus, Layers, CheckCircle2, ShieldCheck, GitFork } from 'lucide-react';
import { mastersApi, type ItemGroup } from '../../api/masters';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

interface TreeRow extends ItemGroup { children?: TreeRow[]; }

/** Build a parent→children tree for Ant Table's expandable tree mode. */
function buildTree(rows: ItemGroup[]): TreeRow[] {
  const byId = new Map<string, TreeRow>();
  rows.forEach((r) => byId.set(r.id, { ...r }));
  const roots: TreeRow[] = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId)!;
      (parent.children ??= []).push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

export function ItemGroupsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();

  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<ItemGroup | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    mastersApi.listItemGroups(company.id)
      .then(setGroups)
      .catch(() => message.error('Failed to load item groups'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(load, [load]);

  const tree = useMemo(() => buildTree(groups), [groups]);

  const open = (row: ItemGroup | null) => {
    setEditing(row);
    form.resetFields();
    if (row) form.setFieldsValue(row);
    setDrawer(true);
  };

  const save = async (values: any) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      if (editing) {
        await mastersApi.updateItemGroup(company.id, editing.id, values);
        message.success('Item group updated.');
      } else {
        await mastersApi.createItemGroup(company.id, values);
        message.success('Item group created.');
      }
      setDrawer(false);
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };



  // A group can be a parent of another only if it isn't the node being edited.
  const parentOptions = groups
    .filter((g) => !editing || g.id !== editing.id)
    .map((g) => ({ value: g.id, label: `${g.code} — ${g.name}` }));

  const columns = [
    {
      title: 'Group',
      key: 'group',
      render: (_: unknown, r: TreeRow) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.name}</Text>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace', marginLeft: 8 }}>{r.code}</Text>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      key: 'status',
      width: 120,
      render: (v: boolean) => (
        <Tag color={v ? 'success' : 'default'} style={{ borderRadius: 10, border: 0, fontSize: 11 }}>{v ? 'Active' : 'Inactive'}</Tag>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 48,
      render: (_: unknown, r: ItemGroup) => (
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(r)} />
      ),
    },
  ];

  const activeGroups = groups.filter(g => g.isActive).length;
  const subGroupCount = groups.filter(g => g.parentId).length;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 transition-colors">
        <div className="flex items-center space-x-3.5">
          <div className="p-2.5 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/40 rounded-xl shadow-xs">
            <FolderTree className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-0.5">
              <span>Masters</span>
              <span>/</span>
              <span className="text-teal-600 dark:text-teal-400 font-medium">Item Groups</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              Item Groups & Taxonomy
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hierarchical classification for inventory costing, category defaults, and sales reporting
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => open(null)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          >
            <Plus className="w-4 h-4" /> Add Group
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Item Groups</span>
              <div className="p-2 bg-teal-50 dark:bg-teal-950/50 rounded-lg text-teal-600 dark:text-teal-400">
                <FolderTree className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-2">{groups.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Configured category nodes</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Root Categories</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/50 rounded-lg text-blue-600 dark:text-blue-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400 mt-2">{tree.length}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Top-level product families</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Child Sub-Groups</span>
              <div className="p-2 bg-purple-50 dark:bg-purple-950/50 rounded-lg text-purple-600 dark:text-purple-400">
                <GitFork className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-2">{subGroupCount}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Sub-branches and sub-categories</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs transition-colors">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Groups</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-lg text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-2">{activeGroups}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">Currently active classifications</div>
          </div>
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">Item Group Taxonomy Tree</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Expandable tree structure of parent and nested product classifications</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
              {groups.length} Groups
            </span>
          </div>
          <Table
            dataSource={tree}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={false}
            expandable={{ defaultExpandAllRows: true }}
            locale={{ emptyText: 'No item groups yet.' }}
          />
        </div>
      </div>

      <Drawer
        title={editing ? 'Edit Item Group' : 'Add Item Group'}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={420}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Required' }]}>
            <Input disabled={!!editing} placeholder="STEEL" style={{ fontFamily: 'monospace' }} />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="Steel & Metals" />
          </Form.Item>
          <Form.Item name="parentId" label="Parent Group" extra="Leave empty for a top-level group">
            <Select allowClear showSearch optionFilterProp="label" options={parentOptions} placeholder="Top level" />
          </Form.Item>
          {editing && <Form.Item name="isActive" label="Active" valuePropName="checked"><Switch /></Form.Item>}
        </Form>
      </Drawer>
    </div>
  );
}
