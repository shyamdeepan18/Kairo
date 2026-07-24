import { useState, useEffect } from 'react';
import {
  Table, Button, Drawer, Form, Input, Select, Switch,
  Typography, Tag, Avatar, Tooltip, Popconfirm, message,
  Alert, Space, theme as antTheme,
} from 'antd';
import {
  PlusOutlined, UserOutlined, CheckCircleOutlined, StopOutlined,
} from '@ant-design/icons';
import { settingsApi, type CompanyUser, type Role } from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

export function UsersPage() {
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();

  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{ tempPassword: string | null; message: string } | null>(null);

  const load = () => {
    if (!company?.id) return;
    setLoading(true);
    Promise.all([
      settingsApi.listUsers(company.id),
      settingsApi.listRoles(company.id),
    ])
      .then(([u, r]) => { setUsers(u); setRoles(r); })
      .catch(() => message.error('Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [company?.id]);

  const handleInvite = async (values: { email: string; fullName: string; roleId: string }) => {
    if (!company?.id) return;
    setInviting(true);
    try {
      const result = await settingsApi.inviteUser(company.id, values);
      setInviteResult(result);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  const handleToggle = async (userId: string, isActive: boolean) => {
    if (!company?.id) return;
    try {
      await settingsApi.toggleUserActive(company.id, userId, isActive);
      setUsers((u) => u.map((user) => user.id === userId ? { ...user, isActive } : user));
      message.success(isActive ? 'User activated.' : 'User deactivated.');
    } catch {
      message.error('Failed to update user status');
    }
  };

  const columns = [
    {
      title: 'User',
      key: 'user',
      render: (_: unknown, record: CompanyUser) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar
            size={32}
            style={{ background: '#4F46E5', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
          >
            {record.fullName.charAt(0).toUpperCase()}
          </Avatar>
          <div>
            <Text strong style={{ display: 'block', fontSize: 13 }}>{record.fullName}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{record.email}</Text>
          </div>
        </div>
      ),
    },
    {
      title: 'Roles',
      key: 'roles',
      render: (_: unknown, record: CompanyUser) => (
        <Space size={4} wrap>
          {record.roles.length === 0
            ? <Text type="secondary" style={{ fontSize: 12 }}>No roles</Text>
            : record.roles.map((r) => (
                <Tag key={r.roleId} style={{ fontSize: 11, borderRadius: 10, border: 0, margin: 0 }} color="processing">
                  {r.roleName}
                  {r.plantId && <span style={{ opacity: 0.7 }}> (plant)</span>}
                </Tag>
              ))}
        </Space>
      ),
    },
    {
      title: 'Last Login',
      dataIndex: 'lastLoginAt',
      key: 'lastLoginAt',
      render: (v: string | null) =>
        v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
          : <Text type="secondary" style={{ fontSize: 12 }}>Never</Text>,
    },
    {
      title: 'Status',
      key: 'status',
      render: (_: unknown, record: CompanyUser) => (
        <Tooltip title={record.isActive ? 'Click to deactivate' : 'Click to activate'}>
          <Popconfirm
            title={record.isActive ? 'Deactivate this user?' : 'Activate this user?'}
            description={record.isActive
              ? 'They will lose access to all modules immediately.'
              : 'They will regain access based on their roles.'}
            onConfirm={() => handleToggle(record.id, !record.isActive)}
            okText="Confirm"
            okButtonProps={{ danger: record.isActive }}
          >
            <Tag
              icon={record.isActive ? <CheckCircleOutlined /> : <StopOutlined />}
              color={record.isActive ? 'success' : 'default'}
              style={{ cursor: 'pointer', borderRadius: 10, border: 0, fontSize: 11 }}
            >
              {record.isActive ? 'Active' : 'Inactive'}
            </Tag>
          </Popconfirm>
        </Tooltip>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Users</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            {users.length} user{users.length !== 1 ? 's' : ''} in this company
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setInviteResult(null); setDrawerOpen(true); }}>
          Invite User
        </Button>
      </div>

      <div
        style={{
          background: dt.colorBgContainer,
          borderRadius: 12,
          border: `1px solid ${dt.colorBorderSecondary}`,
          overflow: 'hidden',
        }}
      >
        <Table
          dataSource={users}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'No users yet. Invite someone to get started.' }}
          style={{ borderRadius: 0 }}
        />
      </div>

      {/* Invite drawer */}
      <Drawer
        title="Invite User"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
        extra={
          !inviteResult && (
            <Button
              type="primary"
              loading={inviting}
              onClick={() => form.submit()}
            >
              Send Invite
            </Button>
          )
        }
      >
        {inviteResult ? (
          <div>
            <Alert
              type="success"
              showIcon
              message={inviteResult.message}
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
            {inviteResult.tempPassword && (
              <Alert
                type="warning"
                showIcon
                message="Share this temporary password with the user"
                description={
                  <div>
                    <Text code style={{ fontSize: 16, letterSpacing: '1px' }}>
                      {inviteResult.tempPassword}
                    </Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      They should change it on first login. This won't be shown again.
                    </Text>
                  </div>
                }
                style={{ borderRadius: 8 }}
              />
            )}
            <Button block style={{ marginTop: 16 }} onClick={() => { setInviteResult(null); setDrawerOpen(false); }}>
              Done
            </Button>
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleInvite}
            requiredMark={false}
          >
            <Form.Item
              name="fullName"
              label="Full Name"
              rules={[{ required: true, message: 'Name is required' }]}
            >
              <Input prefix={<UserOutlined />} placeholder="Anita Sharma" />
            </Form.Item>

            <Form.Item
              name="email"
              label="Email Address"
              rules={[{ required: true }, { type: 'email' }]}
            >
              <Input placeholder="anita@company.com" />
            </Form.Item>

            <Form.Item
              name="roleId"
              label="Assign Role"
              rules={[{ required: true, message: 'Please assign a role' }]}
              extra="You can change or add roles later from the Roles section"
            >
              <Select
                placeholder="Select role"
                options={roles.map((r) => ({ value: r.id, label: r.name }))}
              />
            </Form.Item>
          </Form>
        )}
      </Drawer>
    </div>
  );
}
