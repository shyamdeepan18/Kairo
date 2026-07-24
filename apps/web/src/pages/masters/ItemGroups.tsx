import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Switch, Typography, Tag,
  message, theme as antTheme,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
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

  const cardStyle = {
    background: dt.colorBgContainer, borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`, overflow: 'hidden' as const,
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

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Item Groups</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Hierarchical classification for reporting and defaults.</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open(null)}>Add Group</Button>
      </div>

      <div style={cardStyle}>
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

      <Drawer
        title={editing ? 'Edit Item Group' : 'Add Item Group'}
        open={drawer}
        onClose={() => setDrawer(false)}
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
