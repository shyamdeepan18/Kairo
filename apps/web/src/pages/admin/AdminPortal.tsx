import { useState, useEffect, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Layout, Menu, Table, Button, Drawer, Form, Input, Select, Tag, Avatar,
  Typography, Space, Popconfirm, message, Alert, Badge, Tooltip, Divider,
  Statistic, Row, Col, Card, InputNumber, DatePicker, Checkbox, Modal, Spin, Collapse,
} from 'antd';
import {
  BankOutlined, ApartmentOutlined, UserOutlined, SafetyOutlined,
  PlusOutlined, CheckCircleOutlined, StopOutlined,
  ArrowLeftOutlined, CrownOutlined, TeamOutlined,
  LogoutOutlined, KeyOutlined, WarningOutlined, EditOutlined, DeleteOutlined, LockOutlined, BulbOutlined, BulbFilled, DashboardOutlined,
} from '@ant-design/icons';
import {
  adminApi,
  type AdminCompany, type AdminPlant, type AdminUser,
  type AdminRole, type AdminLicense, type AdminLicenseInfo, type AdminPermission, type AdminDiagnosticsHealth, type AdminAuditLog,
} from '../../api/admin';
import { useAuthStore } from '../../store/auth';
import { useThemeStore } from '../../store/theme';
import dayjs from 'dayjs';
import { ChangePasswordModal } from '../../components/ChangePasswordModal';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { InteractiveRoles } from './components/InteractiveRoles';
import { AdminStockAdjustments } from './components/AdminStockAdjustments';
import { IndustryBlueprints } from './components/IndustryBlueprints';

const { Sider, Content, Header } = Layout;
const { Title, Text } = Typography;

type Section = 'companies' | 'plants' | 'users' | 'roles' | 'license' | 'diagnostics' | 'stock-adjustments' | 'blueprints';

export function AdminPortalPage() {
  const { confirmClose } = useUnsavedChanges();
  const { user, logout } = useAuthStore();
  const { isDark, toggle } = useThemeStore();
  const [section, setSection] = useState<Section>('companies');
  const [selectedCompany, setSelectedCompany] = useState<AdminCompany | null>(null);

  // Data state
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [plants, setPlants] = useState<AdminPlant[]>([]);
  const [plantsLoading, setPlantsLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [allPermissions, setAllPermissions] = useState<AdminPermission[]>([]);
  const [licenseInfo, setLicenseInfo] = useState<AdminLicenseInfo | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);

  // Drawers & Modals
  const [companyDrawer, setCompanyDrawer] = useState(false);
  const [editingCompany, setEditingCompany] = useState<AdminCompany | null>(null);
  const [plantDrawer, setPlantDrawer] = useState(false);
  const [editingPlant, setEditingPlant] = useState<AdminPlant | null>(null);
  const [userDrawer, setUserDrawer] = useState(false);
  const [roleDrawer, setRoleDrawer] = useState<{ open: boolean; user: AdminUser | null }>({ open: false, user: null });
  const [licenseDrawer, setLicenseDrawer] = useState(false);

  // Role permissions editing
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);
  const [selectedPermCodes, setSelectedPermCodes] = useState<string[]>([]);
  const [rolePermsLoading, setRolePermsLoading] = useState(false);
  const [savingRolePerms, setSavingRolePerms] = useState(false);
  const [newRoleModal, setNewRoleModal] = useState(false);

  // Forms
  const [companyForm] = Form.useForm();
  const [plantForm] = Form.useForm();
  const [userForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [licenseForm] = Form.useForm();
  const [newRoleForm] = Form.useForm();

  const [inviteResult, setInviteResult] = useState<{ tempPassword: string; message: string } | null>(null);
  const [resetPasswordModal, setResetPasswordModal] = useState<{ open: boolean; tempPassword?: string; message?: string }>({ open: false });
  const [changeOwnPasswordModal, setChangeOwnPasswordModal] = useState(false);
  const [editUserRolePlantModal, setEditUserRolePlantModal] = useState<{
    open: boolean;
    user: AdminUser | null;
    roleId: string | null;
    roleName: string | null;
    currentPlantId: string | null;
  }>({ open: false, user: null, roleId: null, roleName: null, currentPlantId: null });
  const [savingLicense, setSavingLicense] = useState(false);

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadCompanies = () => {
    setCompaniesLoading(true);
    adminApi.listCompanies()
      .then((d) => setCompanies(d.companies))
      .catch(() => message.error('Failed to load companies'))
      .finally(() => setCompaniesLoading(false));
  };

  const loadPlants = (companyId: string) => {
    setPlantsLoading(true);
    adminApi.listPlants(companyId)
      .then((d) => setPlants(d.plants))
      .catch(() => message.error('Failed to load plants'))
      .finally(() => setPlantsLoading(false));
  };

  const loadUsers = (companyId: string) => {
    setUsersLoading(true);
    Promise.all([adminApi.listUsers(companyId), adminApi.listRoles(companyId)])
      .then(([u, r]) => { setUsers(u.users); setRoles(r.roles); })
      .catch(() => message.error('Failed to load users'))
      .finally(() => setUsersLoading(false));
  };

  const loadRoles = (companyId: string) => {
    setRolesLoading(true);
    adminApi.listRoles(companyId)
      .then((d) => setRoles(d.roles))
      .catch(() => message.error('Failed to load roles'))
      .finally(() => setRolesLoading(false));
  };

  const loadPermissions = () => {
    if (allPermissions.length > 0) return;
    adminApi.listPermissions()
      .then((d) => setAllPermissions(d.permissions))
      .catch(() => message.error('Failed to load system permissions'));
  };

  const loadLicense = (companyId: string) => {
    setLicenseLoading(true);
    adminApi.getLicense(companyId)
      .then(setLicenseInfo)
      .catch(() => message.error('Failed to load license'))
      .finally(() => setLicenseLoading(false));
  };

  useEffect(() => { loadCompanies(); }, []);

  const selectCompany = (company: AdminCompany, goTo: Section) => {
    setSelectedCompany(company);
    setSection(goTo);
    if (goTo === 'plants') loadPlants(company.id);
    if (goTo === 'users') { loadUsers(company.id); loadPlants(company.id); }
    if (goTo === 'roles') { loadRoles(company.id); loadPermissions(); }
    if (goTo === 'license') loadLicense(company.id);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────

    const openEditCompany = (company: AdminCompany) => {
    setEditingCompany(company);
    companyForm.setFieldsValue({
      name: company.name,
      legalName: company.legalName,
      gstin: company.gstin,
      baseCurrency: company.baseCurrency,
    });
    setCompanyDrawer(true);
  };

  const handleSaveCompany = async (values: any) => {
    try {
      if (editingCompany) {
        await adminApi.updateCompany(editingCompany.id, values);
        message.success('Company updated successfully');
      } else {
        await adminApi.createCompany(values);
        message.success('Company created successfully');
      }
      companyForm.resetFields();
      setEditingCompany(null);
      setCompanyDrawer(false);
      loadCompanies();
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to save company');
    }
  };

  const handleToggleCompany = async (id: string, isActive: boolean) => {
    try {
      await adminApi.toggleCompany(id, isActive);
      message.success(isActive ? 'Company activated' : 'Company suspended');
      loadCompanies();
    } catch { message.error('Failed to update company status'); }
  };

  const openEditPlant = (plant: AdminPlant) => {
    setEditingPlant(plant);
    plantForm.setFieldsValue({
      name: plant.name,
      code: plant.code,
      gstin: plant.gstin,
      city: plant.city,
      state: plant.state,
    });
    setPlantDrawer(true);
  };

  const handleSavePlant = async (values: any) => {
    if (!selectedCompany) return;
    try {
      if (editingPlant) {
        await adminApi.updatePlant(selectedCompany.id, editingPlant.id, values);
        message.success('Plant updated successfully');
      } else {
        await adminApi.createPlant(selectedCompany.id, values);
        message.success('Plant created successfully');
      }
      plantForm.resetFields();
      setEditingPlant(null);
      setPlantDrawer(false);
      loadPlants(selectedCompany.id);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to save plant');
    }
  };

  const handleCreateUser = async (values: any) => {
    if (!selectedCompany) return;
    try {
      const res = await adminApi.createUser(selectedCompany.id, values);
      setInviteResult({ tempPassword: res.tempPassword, message: res.message });
      userForm.resetFields();
      loadUsers(selectedCompany.id);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to create user');
    }
  };

  const handleToggleUser = async (userId: string, isActive: boolean) => {
    if (!selectedCompany) return;
    try {
      await adminApi.toggleUser(userId, isActive);
      message.success(isActive ? 'User activated' : 'User deactivated');
      loadUsers(selectedCompany.id);
    } catch { message.error('Failed to update user status'); }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!selectedCompany) return;
    try {
      await adminApi.deleteUser(userId);
      message.success('User deleted successfully');
      loadUsers(selectedCompany.id);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to delete user');
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      const res = await adminApi.resetUserPassword(userId);
      setResetPasswordModal({ open: true, tempPassword: res.tempPassword, message: res.message });
    } catch {
      message.error('Failed to reset user password');
    }
  };

  const handleUpdateUserRolePlant = async (plantId: string | null) => {
    if (!selectedCompany || !editUserRolePlantModal.user || !editUserRolePlantModal.roleId) return;
    try {
      await adminApi.updateUserRolePlant(
        selectedCompany.id,
        editUserRolePlantModal.user.id,
        editUserRolePlantModal.roleId,
        plantId,
      );
      message.success('Plant scope updated successfully');
      setEditUserRolePlantModal({ open: false, user: null, roleId: null, roleName: null, currentPlantId: null });
      loadUsers(selectedCompany.id);
    } catch {
      message.error('Failed to update plant scope');
    }
  };

  const handleAssignRole = async (values: any) => {
    if (!selectedCompany || !roleDrawer.user) return;
    try {
      await adminApi.assignRole(selectedCompany.id, roleDrawer.user.id, values.roleId, values.plantId);
      message.success('Role assigned');
      roleForm.resetFields();
      setRoleDrawer({ open: false, user: null });
      loadUsers(selectedCompany.id);
    } catch { message.error('Failed to assign role'); }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    if (!selectedCompany) return;
    try {
      await adminApi.removeRole(selectedCompany.id, userId, roleId);
      message.success('Role removed');
      loadUsers(selectedCompany.id);
    } catch { message.error('Failed to remove role'); }
  };

  const handleSaveLicense = async (values: any) => {
    if (!selectedCompany) return;
    setSavingLicense(true);
    try {
      const payload = {
        ...values,
        validFrom: values.validFrom ? dayjs(values.validFrom).toISOString() : undefined,
        validTo: values.validTo ? dayjs(values.validTo).toISOString() : undefined,
      };
      await adminApi.setLicense(selectedCompany.id, payload);
      message.success('License saved successfully');
      setLicenseDrawer(false);
      loadLicense(selectedCompany.id);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to save license');
    } finally { setSavingLicense(false); }
  };

  const handleRevokeLicense = async () => {
    if (!selectedCompany) return;
    try {
      await adminApi.revokeLicense(selectedCompany.id);
      message.warning('License revoked — company access is now blocked');
      loadLicense(selectedCompany.id);
    } catch { message.error('Failed to revoke license'); }
  };

  // Role & Permission Management Handlers
  const openEditRolePermissions = async (role: AdminRole) => {
    if (!selectedCompany) return;
    setEditingRole(role);
    setRolePermsLoading(true);
    try {
      const res = await adminApi.getRolePermissions(selectedCompany.id, role.id);
      setSelectedPermCodes(res.permissionCodes);
    } catch {
      message.error('Failed to load role permissions');
      setSelectedPermCodes([]);
    } finally {
      setRolePermsLoading(false);
    }
  };

  const handleSaveRolePermissions = async () => {
    if (!editingRole || !selectedCompany) return;
    setSavingRolePerms(true);
    try {
      await adminApi.updateRolePermissions(selectedCompany.id, editingRole.id, selectedPermCodes);
      message.success('Role permissions updated successfully');
      setEditingRole(null);
    } catch {
      message.error('Failed to update role permissions');
    } finally {
      setSavingRolePerms(false);
    }
  };

  const handleCreateCustomRole = async (values: { name: string; description?: string; copyFromRoleIds?: string[] }) => {
    if (!selectedCompany) return;
    try {
      const res = await adminApi.createRole(selectedCompany.id, values);
      message.success(`Custom role '${res.role.name}' created`);
      newRoleForm.resetFields();
      setNewRoleModal(false);
      loadRoles(selectedCompany.id);
      openEditRolePermissions(res.role);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to create role');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!selectedCompany) return;
    try {
      await adminApi.deleteRole(selectedCompany.id, roleId);
      message.success('Role deleted');
      loadRoles(selectedCompany.id);
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Failed to delete role');
    }
  };

  const groupedPermissions = useMemo(() => {
    const map: Record<string, AdminPermission[]> = {};
    for (const p of allPermissions) {
      const key = p.module.toUpperCase();
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    return map;
  }, [allPermissions]);

  // ── Table columns ─────────────────────────────────────────────────────────

  const companyColumns = [
    {
      title: 'Company', key: 'company',
      render: (_: any, r: AdminCompany) => (
        <Space>
          <Avatar size={36} style={{ background: '#4F46E5', fontWeight: 700, cursor: 'pointer' }} onClick={() => selectCompany(r, 'plants')}>{r.name.charAt(0).toUpperCase()}</Avatar>
          <div style={{ cursor: 'pointer' }} onClick={() => selectCompany(r, 'plants')}>
            <Text strong style={{ display: 'block', color: 'var(--ant-color-primary)' }}>{r.name}</Text>
            <Text style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', }}>{r.legalName ?? r.gstin ?? '—'}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Currency', dataIndex: 'baseCurrency', key: 'baseCurrency', width: 90 },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_: any, r: AdminCompany) => (
        <Tag icon={r.isActive ? <CheckCircleOutlined /> : <StopOutlined />}
          color={r.isActive ? 'success' : 'default'} style={{ borderRadius: 10, border: 0 }}>
          {r.isActive ? 'Active' : 'Suspended'}
        </Tag>
      ),
    },
    {
      title: 'Created', dataIndex: 'createdAt', key: 'createdAt',
      render: (v: string) => new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: any, r: AdminCompany) => (
        <Space size={4} wrap>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openEditCompany(r); }}>Edit</Button>
          <Popconfirm
            title={r.isActive ? 'Suspend this company?' : 'Activate this company?'}
            description={r.isActive ? 'All users will lose access immediately.' : 'All users will regain access.'}
            onConfirm={() => handleToggleCompany(r.id, !r.isActive)}
            okText="Confirm" okButtonProps={{ danger: r.isActive }}
          >
            <Button size="small" danger={r.isActive}>{r.isActive ? 'Suspend' : 'Activate'}</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const plantColumns = [
    {
      title: 'Plant', key: 'plant',
      render: (_: any, r: AdminPlant) => (
        <Space>
          <Avatar size={32} style={{ background: '#7C3AED' }}><ApartmentOutlined /></Avatar>
          <div>
            <Text strong >{r.name}</Text>
            <Text style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', display: 'block' }}>Code: {r.code}</Text>
          </div>
        </Space>
      ),
    },
    { title: 'Users', dataIndex: 'userCount', render: (v: number) => v ?? 0 },
    { title: 'City', dataIndex: 'city', render: (v: string) => v ?? '—' },
    { title: 'State', dataIndex: 'state', render: (v: string) => v ?? '—' },
    { title: 'GSTIN', dataIndex: 'gstin', render: (v: string) => v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : '—' },
    {
      title: 'Actions', key: 'actions', width: 120,
      render: (_: any, r: AdminPlant) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEditPlant(r)}>
          Edit Plant
        </Button>
      ),
    },
  ];

  const userColumns = [
    {
      title: 'User', key: 'user',
      render: (_: any, r: AdminUser) => (
        <Space>
          <Avatar size={36} style={{ background: '#059669', fontWeight: 700 }}>{r.fullName.charAt(0).toUpperCase()}</Avatar>
          <div>
            <Text strong style={{ display: 'block', }}>{r.fullName}</Text>
            <Text style={{ fontSize: 12, color: 'var(--ant-color-text-secondary)', }}>{r.email}</Text>
            <Text copyable style={{ fontSize: 10, display: 'block', color: 'var(--ant-color-text-tertiary)' }}>ID: {r.id}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Roles & Plant Scope', key: 'roles',
      render: (_: any, r: AdminUser) => (
        <Space size={4} wrap>
          {r.roles.length === 0
            ? <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>No roles</Text>
            : r.roles.map((role, i) => {
              const plantLabel = role.plantCode ?? (role.plantId ? 'Plant' : 'All Plants');
              return (
                <Tag key={i} closable color="processing"
                  style={{ borderRadius: 10, border: '1px solid #3B82F6', fontSize: 11, padding: '2px 8px' }}
                  onClose={(e) => { e.preventDefault(); handleRemoveRole(r.id, role.roleId); }}>
                  <span>{role.roleName}</span>
                  <Tag color="cyan" style={{ borderRadius: 8, fontSize: 10, marginLeft: 6, marginRight: 4, cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditUserRolePlantModal({
                        open: true,
                        user: r,
                        roleId: role.roleId,
                        roleName: role.roleName,
                        currentPlantId: role.plantId,
                      });
                    }}>
                    📍 {plantLabel} <EditOutlined style={{ fontSize: 9, marginLeft: 2 }} />
                  </Tag>
                </Tag>
              );
            })}
          <Tooltip title="Add another role">
            <Button size="small" type="dashed" icon={<PlusOutlined />}
              onClick={() => setRoleDrawer({ open: true, user: r })}
              style={{ fontSize: 11, height: 24, padding: '0 8px' }} />
          </Tooltip>
        </Space>
      ),
    },
    {
      title: 'Last Login', dataIndex: 'lastLoginAt',
      render: (v: string) => v ? new Date(v).toLocaleDateString('en-IN') : <Text style={{ color: 'var(--ant-color-text-secondary)', }}>Never</Text>,
    },
    {
      title: 'Status', key: 'status', width: 100,
      render: (_: any, r: AdminUser) => (
        <Popconfirm title={r.isActive ? 'Deactivate user?' : 'Activate user?'}
          onConfirm={() => handleToggleUser(r.id, !r.isActive)}
          okText="Confirm" okButtonProps={{ danger: r.isActive }}>
          <Tag icon={r.isActive ? <CheckCircleOutlined /> : <StopOutlined />}
            color={r.isActive ? 'success' : 'default'}
            style={{ cursor: 'pointer', borderRadius: 10, border: 0 }}>
            {r.isActive ? 'Active' : 'Inactive'}
          </Tag>
        </Popconfirm>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 150,
      render: (_: any, r: AdminUser) => (
        <Space>
          <Popconfirm
            title="Reset Password?"
            description={`Generate a new temporary password for ${r.fullName}?`}
            onConfirm={() => handleResetPassword(r.id)}
            okText="Reset Password"
          >
            <Button size="small" icon={<KeyOutlined />}>Reset Password</Button>
          </Popconfirm>
          {!r.isActive && !r.isSystemAdmin && (
            <Popconfirm
              title="Delete User?"
              description={`Are you sure you want to permanently delete ${r.fullName}?`}
              onConfirm={() => handleDeleteUser(r.id)}
              okText="Delete"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<DeleteOutlined />}>Delete</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────

  const licIsExpired = (lic: AdminLicense) =>
    lic.validTo ? new Date(lic.validTo) < new Date() : false;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout style={{ minHeight: '100vh', }}>
      {/* Header */}
      <Header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: 60,
      }}>
        <Space>
          <CrownOutlined style={{ fontSize: 20, color: '#FBBF24' }} />
          <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
            Kairo ERP — System Admin Portal
          </Title>
        </Space>
        <Space>
          <Badge dot status="success">
            <Avatar size={32} style={{ background: '#4F46E5', fontWeight: 700 }}>
              {user?.fullName?.charAt(0)?.toUpperCase() ?? 'S'}
            </Avatar>
          </Badge>
          <Text style={{ fontSize: 13 }}>{user?.fullName}</Text>
          <Button size="small" type="text" icon={isDark ? <BulbFilled /> : <BulbOutlined />}
            style={{ color: 'var(--ant-color-text-secondary)' }} onClick={toggle}>
            Theme
          </Button>
          <Button size="small" type="text" icon={<KeyOutlined />}
            style={{ color: 'var(--ant-color-text-secondary)', }} onClick={() => setChangeOwnPasswordModal(true)}>
            Change Password
          </Button>
          <Button size="small" type="text" icon={<LogoutOutlined />}
            style={{ color: 'var(--ant-color-text-secondary)', }} onClick={() => logout()}>
            Sign out
          </Button>
        </Space>
      </Header>

      <Layout>
        {/* Sidebar */}
        <Sider width={220} >
          <div style={{ padding: '16px 12px 8px' }}>
            <Text style={{ color: 'var(--ant-color-primary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Navigation
            </Text>
          </div>
          <Menu mode="inline" selectedKeys={[section]}
            style={{ background: 'transparent', border: 'none' }} 
            items={[
              { key: 'companies', icon: <BankOutlined />, label: 'Companies', onClick: () => { setSection('companies'); setSelectedCompany(null); } },
              { key: 'blueprints', icon: <ApartmentOutlined />, label: 'Industry Bundles', onClick: () => setSection('blueprints') },
              { key: 'diagnostics', icon: <DashboardOutlined />, label: 'Diagnostics', onClick: () => { setSection('diagnostics'); setSelectedCompany(null); } },
              { key: 'stock-adjustments', icon: <WarningOutlined />, label: 'Stock Reconciliation', onClick: () => setSection('stock-adjustments') },
              ...(selectedCompany ? [
                { key: 'plants', icon: <ApartmentOutlined />, label: 'Plants', onClick: () => selectCompany(selectedCompany, 'plants') },
                { key: 'users', icon: <TeamOutlined />, label: 'Users', onClick: () => selectCompany(selectedCompany, 'users') },
                { key: 'roles', icon: <SafetyOutlined />, label: 'Roles & Permissions', onClick: () => selectCompany(selectedCompany, 'roles') },
                { key: 'license', icon: <KeyOutlined />, label: 'License', onClick: () => selectCompany(selectedCompany, 'license') },
              ] : []),
            ]}
          />

          {selectedCompany && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <div style={{ padding: '0 16px' }}>
                <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 11 }}>Selected Company</Text>
                <div style={{ borderRadius: 8, padding: '8px 10px', marginTop: 6, }}>
                  <Text style={{ color: 'var(--ant-color-primary)', fontSize: 12, fontWeight: 600, display: 'block' }}>{selectedCompany.name}</Text>
                  <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 11 }}>{selectedCompany.baseCurrency}</Text>
                </div>
                <Button size="small" type="text" icon={<ArrowLeftOutlined />}
                  style={{ color: 'var(--ant-color-text-secondary)', marginTop: 8, fontSize: 12 }}
                  onClick={() => { setSection('companies'); setSelectedCompany(null); }}>
                  Back to Companies
                </Button>
              </div>
            </>
          )}
        </Sider>

        {/* Main Content */}
        <Content style={{ padding: 24, minHeight: 'calc(100vh - 60px)' }}>

          {/* ── Diagnostics ───────────────────────────────────────────────── */}
          {section === 'diagnostics' && <DiagnosticsPanel />}

          {/* ── Industry Blueprints & Bundles ─────────────────────────────── */}
          {section === 'blueprints' && (
            <IndustryBlueprints
              companies={companies}
              selectedCompany={selectedCompany}
            />
          )}

          {/* ── Stock Adjustments Override ─────────────────────────────────── */}
          {section === 'stock-adjustments' && (
            <AdminStockAdjustments
              companies={companies}
              selectedCompany={selectedCompany}
            />
          )}

          {/* ── Companies ─────────────────────────────────────────────────── */}
          {section === 'companies' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <Title level={4} style={{ margin: 0, }}>Tenant Companies</Title>
                  <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>All customer organizations provisioned on this instance.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />}
                  style={{ background: '#4F46E5', fontWeight: 600 }}
                  onClick={() => { companyForm.resetFields(); setEditingCompany(null); setCompanyDrawer(true); }}>
                  Create Company
                </Button>
              </div>

              <Table dataSource={companies} rowKey="id" loading={companiesLoading}
                columns={companyColumns} pagination={{ pageSize: 10 }}
                style={{ borderRadius: 12, overflow: 'hidden' }} />
            </div>
          )}

          {/* ── Plants ────────────────────────────────────────────────────── */}
          {section === 'plants' && selectedCompany && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <Title level={4} style={{ margin: 0, }}>Plants — {selectedCompany.name}</Title>
                  <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>Manufacturing units and branches for this company.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />}
                  style={{ background: '#7C3AED', borderColor: '#7C3AED', fontWeight: 600 }}
                  onClick={() => { setEditingPlant(null); plantForm.resetFields(); setPlantDrawer(true); }}>
                  Add Plant
                </Button>
              </div>

              <Table dataSource={plants} rowKey="id" loading={plantsLoading}
                columns={plantColumns} pagination={false}
                style={{ borderRadius: 12, overflow: 'hidden' }} />
            </div>
          )}

          {/* ── Users ─────────────────────────────────────────────────────── */}
          {section === 'users' && selectedCompany && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <Title level={4} style={{ margin: 0, }}>Users — {selectedCompany.name}</Title>
                  <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>Manage user access and role assignments.</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />}
                  style={{ background: '#059669', borderColor: '#059669', fontWeight: 600 }}
                  onClick={() => { userForm.resetFields(); setInviteResult(null); setUserDrawer(true); }}>
                  Add User
                </Button>
              </div>

              <Table dataSource={users} rowKey="id" loading={usersLoading}
                columns={userColumns} pagination={false}
                style={{ borderRadius: 12, overflow: 'hidden' }} />
            </div>
          )}

          {/* ── Roles & Permissions ────────────────────────────────────────── */}
          {section === 'roles' && selectedCompany && (
            <div style={{ height: 'calc(100vh - 108px)', minHeight: 600 }}>
              <InteractiveRoles companyId={selectedCompany.id} />
            </div>
          )}

          {/* ── License ────────────────────────────────────────────────────── */}
          {section === 'license' && selectedCompany && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <Title level={4} style={{ margin: 0, }}>
                    <KeyOutlined style={{ marginRight: 8, color: '#FBBF24' }} />
                    License & Modules — {selectedCompany.name}
                  </Title>
                  <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
                    Manage subscription edition, user limits, and validity period for this tenant company.
                  </Text>
                </div>
                <Space>
                  <Button type="primary" icon={<KeyOutlined />}
                    style={{ background: '#F59E0B', borderColor: '#F59E0B', fontWeight: 600 }}
                    onClick={() => {
                      if (licenseInfo?.license) {
                        licenseForm.setFieldsValue({
                          edition: licenseInfo.license.edition,
                          maxUsers: licenseInfo.license.maxUsers === -1 ? undefined : licenseInfo.license.maxUsers,
                          validFrom: licenseInfo.license.validFrom ? dayjs(licenseInfo.license.validFrom) : undefined,
                          validTo: licenseInfo.license.validTo ? dayjs(licenseInfo.license.validTo) : undefined,
                        });
                      } else {
                        licenseForm.resetFields();
                      }
                      setLicenseDrawer(true);
                    }}>
                    {licenseInfo?.license ? 'Update License' : 'Install License'}
                  </Button>
                  {licenseInfo?.license && (
                    <Popconfirm
                      title="Revoke License?"
                      description="This will immediately block all user access for this company."
                      onConfirm={handleRevokeLicense}
                      okText="Revoke" okButtonProps={{ danger: true }}
                    >
                      <Button danger icon={<StopOutlined />}>Revoke License</Button>
                    </Popconfirm>
                  )}
                </Space>
              </div>

              {licenseLoading ? (
                <Card loading style={{ borderRadius: 12 }} />
              ) : licenseInfo?.license ? (
                <>
                  {/* Status Alert */}
                  {licIsExpired(licenseInfo.license) && (
                    <Alert type="error" showIcon icon={<WarningOutlined />}
                      message="License Expired" description="This company's license has expired. Users cannot log in."
                      style={{ marginBottom: 16, borderRadius: 8 }} />
                  )}
                  {licenseInfo.isOverLimit && (
                    <Alert type="warning" showIcon icon={<WarningOutlined />}
                      message="User Limit Exceeded"
                      description={`This company has ${licenseInfo.activeUserCount} active users but the license allows only ${licenseInfo.license.maxUsers}. New logins may be blocked.`}
                      style={{ marginBottom: 16, borderRadius: 8 }} />
                  )}

                  {/* License details */}
                  <Row gutter={16}>
                    {[
                      {
                        title: 'Edition', value: licenseInfo.license.edition?.toUpperCase() ?? '—',
                        color: '#FBBF24',
                      },
                      {
                        title: 'Max Users',
                        value: licenseInfo.license.maxUsers === -1 ? 'Unlimited' : licenseInfo.license.maxUsers,
                        color: '#4F46E5',
                      },
                      {
                        title: 'Active Users', value: licenseInfo.activeUserCount,
                        color: licenseInfo.isOverLimit ? '#DC2626' : '#059669',
                      },
                      {
                        title: 'Valid Until',
                        value: licenseInfo.license.validTo
                          ? new Date(licenseInfo.license.validTo).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'Perpetual',
                        color: licIsExpired(licenseInfo.license) ? '#DC2626' : '#10B981',
                      },
                    ].map((s, i) => (
                      <Col span={6} key={i}>
                        <Card style={{ borderRadius: 12, textAlign: 'center' }}>
                          <Statistic
                            title={<Text style={{ color: '#94A3B8', fontSize: 13 }}>{s.title}</Text>}
                            value={s.value}
                            valueStyle={{ color: s.color, fontWeight: 700, fontSize: 22 }}
                          />
                        </Card>
                      </Col>
                    ))}
                  </Row>

                  <Card style={{ borderRadius: 12, marginTop: 16 }}>
                    <Row gutter={24}>
                      <Col span={8}>
                        <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>Valid From</Text>
                        <Text style={{ display: 'block', fontWeight: 600 }}>
                          {licenseInfo.license.validFrom
                            ? new Date(licenseInfo.license.validFrom).toLocaleDateString('en-IN')
                            : '—'}
                        </Text>
                      </Col>
                      <Col span={8}>
                        <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>Installed At</Text>
                        <Text style={{ display: 'block', fontWeight: 600 }}>
                          {new Date(licenseInfo.license.installedAt).toLocaleDateString('en-IN')}
                        </Text>
                      </Col>
                      <Col span={8}>
                        <Text style={{ color: 'var(--ant-color-text-secondary)', fontSize: 12 }}>Last Updated</Text>
                        <Text style={{ display: 'block', fontWeight: 600 }}>
                          {new Date(licenseInfo.license.updatedAt).toLocaleDateString('en-IN')}
                        </Text>
                      </Col>
                    </Row>
                  </Card>
                </>
              ) : (
                <Card style={{ borderRadius: 12, textAlign: 'center', padding: 40 }}>
                  <KeyOutlined style={{ fontSize: 48, color: '#475569', marginBottom: 16 }} />
                  <Title level={5} style={{ color: 'var(--ant-color-text-secondary)', }}>No License Installed</Title>
                  <Text style={{ color: '#475569' }}>This company has no license. Install one to grant access.</Text>
                  <br />
                  <Button type="primary" style={{ marginTop: 20 }} icon={<KeyOutlined />} onClick={() => setLicenseDrawer(true)}>
                    Install License
                  </Button>
                </Card>
              )}
            </div>
          )}
        </Content>
      </Layout>

      {/* ── Company Drawer ───────────────────────────────────────────────── */}
      <Drawer title="Create New Company" open={companyDrawer} onClose={async () => { if (await confirmClose(companyForm)) { companyForm.resetFields(); setCompanyDrawer(false); } }} width={440}
        extra={<Button type="primary" onClick={() => companyForm.submit()}>Create Company</Button>}>
        <Form form={companyForm} layout="vertical" onFinish={handleSaveCompany} requiredMark={false}>
          <Form.Item name="name" label="Company Name" rules={[{ required: true }]}>
            <Input placeholder="Acme Industries Ltd." />
          </Form.Item>
          <Form.Item name="legalName" label="Legal Name (optional)">
            <Input placeholder="Acme Industries Private Limited" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="gstin" label="GSTIN (optional)">
                <Input placeholder="22AAAAA0000A1Z5" style={{ textTransform: 'uppercase' }} maxLength={15} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="baseCurrency" label="Currency" initialValue="INR">
                <Select options={[{ value: 'INR', label: '₹ INR' }, { value: 'USD', label: '$ USD' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="city" label="City"><Input placeholder="Mumbai" /></Form.Item></Col>
            <Col span={12}><Form.Item name="state" label="State"><Input placeholder="Maharashtra" /></Form.Item></Col>
          </Row>
          <Form.Item name="email" label="Contact Email or User ID">
            <Input placeholder="admin@acme.com" />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Plant Drawer ─────────────────────────────────────────────────── */}
      <Drawer
        title={`${editingPlant ? 'Edit' : 'Add'} Plant — ${selectedCompany?.name}`}
        open={plantDrawer}
        onClose={async () => { if (await confirmClose(plantForm)) { plantForm.resetFields(); setPlantDrawer(false); setEditingPlant(null); } }}
        width={440}
        extra={
          <Button type="primary" onClick={() => plantForm.submit()}>
            {editingPlant ? 'Save Changes' : 'Create Plant'}
          </Button>
        }
      >
        <Form form={plantForm} layout="vertical" onFinish={handleSavePlant} requiredMark={false}>
          <Form.Item name="name" label="Plant Name" rules={[{ required: true }]}>
            <Input placeholder="Plant Mumbai North" />
          </Form.Item>
          <Form.Item name="code" label="Plant Code" rules={[{ required: true }]} extra="Used in document numbers e.g. MUM">
            <Input placeholder="MUM" maxLength={10} style={{ textTransform: 'uppercase' }} />
          </Form.Item>
          <Form.Item name="gstin" label="Plant GSTIN (optional)">
            <Input placeholder="27AAAAA0000A1Z5" maxLength={15} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="city" label="City"><Input placeholder="Mumbai" /></Form.Item></Col>
            <Col span={12}><Form.Item name="state" label="State"><Input placeholder="Maharashtra" /></Form.Item></Col>
          </Row>
          <Form.Item name="stateCode" label="State Code"><Input placeholder="27" maxLength={2} /></Form.Item>
        </Form>
      </Drawer>

      {/* ── User Drawer ──────────────────────────────────────────────────── */}
      <Drawer title={`Add User — ${selectedCompany?.name}`} open={userDrawer}
        onClose={async () => { if (await confirmClose(userForm)) { userForm.resetFields(); setUserDrawer(false); setInviteResult(null); } }} width={440}
        extra={!inviteResult && <Button type="primary" onClick={() => userForm.submit()}>Create User</Button>}>
        {inviteResult ? (
          <div>
            <Alert type="success" showIcon message={inviteResult.message} style={{ marginBottom: 16, borderRadius: 8 }} />
            <Alert type="warning" showIcon message="Share this temporary password with the user"
              description={
                <div>
                  <Text code style={{ fontSize: 18, letterSpacing: '2px', fontWeight: 700 }}>{inviteResult.tempPassword}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>Must be changed on first login. Won't be shown again.</Text>
                </div>
              } style={{ borderRadius: 8 }} />
            <Button block style={{ marginTop: 16 }} onClick={() => { setInviteResult(null); setUserDrawer(false); }}>Done</Button>
          </div>
        ) : (
          <Form form={userForm} layout="vertical" onFinish={handleCreateUser} requiredMark={false}>
            <Form.Item name="fullName" label="Full Name" rules={[{ required: true }]}>
              <Input prefix={<UserOutlined />} placeholder="Anita Sharma" />
            </Form.Item>
            <Form.Item name="email" label="Email Address or User ID" rules={[{ required: true }]}>
              <Input placeholder="anita@company.com" />
            </Form.Item>
            <Form.Item name="copyFromUserId" label="Copy Roles from Existing User (optional)">
              <Select placeholder="Select a user to copy from" allowClear
                options={users.map((u) => ({ value: u.id, label: u.fullName }))} />
            </Form.Item>

            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.copyFromUserId !== curr.copyFromUserId}>
              {({ getFieldValue }) => {
                const isCopying = !!getFieldValue('copyFromUserId');
                return (
                  <>
                    <Form.Item name="roleId" label="Assign Role" rules={[{ required: !isCopying }]} extra={isCopying ? "Roles will be copied from selected user" : "You can add more roles later"}>
                      <Select placeholder="Select role" disabled={isCopying}
                        options={roles.map((r) => ({ value: r.id, label: `${r.name}${r.isSystemRole ? ' (System)' : ''}` }))} />
                    </Form.Item>
                    <Form.Item name="plantId" label="Restrict to Plant (optional)" extra="Leave empty for all plants">
                      <Select placeholder="All plants" allowClear disabled={isCopying}
                        options={plants.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} />
                    </Form.Item>
                  </>
                );
              }}
            </Form.Item>
          </Form>
        )}
      </Drawer>

      {/* ── Assign Role Drawer ───────────────────────────────────────────── */}
      <Drawer title={`Assign Role — ${roleDrawer.user?.fullName}`}
        open={roleDrawer.open} onClose={() => setRoleDrawer({ open: false, user: null })} width={400}
        extra={<Button type="primary" onClick={() => roleForm.submit()}>Assign Role</Button>}>
        <Form form={roleForm} layout="vertical" onFinish={handleAssignRole} requiredMark={false}>
          <Form.Item name="roleId" label="Role" rules={[{ required: true }]}>
            <Select placeholder="Select role"
              options={roles.filter((r) => !roleDrawer.user?.roles.some((ur) => ur.roleId === r.id))
                .map((r) => ({ value: r.id, label: r.name }))} />
          </Form.Item>
          <Form.Item name="plantId" label="Restrict to Plant (optional)">
            <Select placeholder="All plants" allowClear
              options={plants.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))} />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── License Drawer ───────────────────────────────────────────────── */}
      <Drawer title={`${licenseInfo?.license ? 'Update' : 'Install'} License — ${selectedCompany?.name}`}
        open={licenseDrawer} onClose={async () => { if (await confirmClose(licenseForm)) { licenseForm.resetFields(); setLicenseDrawer(false); } }} width={440}
        extra={<Button type="primary" loading={savingLicense} onClick={() => licenseForm.submit()}>Save License</Button>}>
        <Form form={licenseForm} layout="vertical" onFinish={handleSaveLicense} requiredMark={false}>
          <Form.Item name="edition" label="Edition" rules={[{ required: true }]} initialValue="standard">
            <Select options={[
              { value: 'trial', label: '🔬 Trial (30 days)' },
              { value: 'standard', label: '⭐ Standard' },
              { value: 'professional', label: '🚀 Professional' },
              { value: 'enterprise', label: '🏢 Enterprise' },
            ]} />
          </Form.Item>
          <Form.Item
            name="maxUsers"
            label="Max Active Users"
            extra="Leave empty for unlimited users. Set a number to enforce a user cap."
          >
            <InputNumber min={1} max={9999} placeholder="Unlimited" style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="validFrom" label="Valid From" rules={[{ required: true, message: 'Start date is required' }]}>
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="validTo" label="Valid Until (optional)" extra="Leave empty for perpetual">
                <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Drawer>

      {/* ── Role Permissions Drawer ─────────────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <SafetyOutlined style={{ color: editingRole?.isSystemRole ? '#818CF8' : '#10B981' }} />
            <span>{editingRole?.name} — {editingRole?.isSystemRole ? 'System Permissions (Read Only)' : 'Edit Permissions'}</span>
          </Space>
        }
        open={!!editingRole}
        onClose={() => setEditingRole(null)}
        width={640}
        extra={
          !editingRole?.isSystemRole && (
            <Button type="primary" loading={savingRolePerms} onClick={handleSaveRolePermissions} style={{ background: '#10B981', borderColor: '#10B981' }}>
              Save Permissions ({selectedPermCodes.length} selected)
            </Button>
          )
        }
      >
        {editingRole?.isSystemRole && (
          <Alert
            type="info"
            showIcon
            message="System Role (Read-Only)"
            description="System roles are globally managed by the ERP system core to guarantee standard workflow security. To grant tailored rights, create a Custom Role for this company."
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        {rolePermsLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin size="large" /></div>
        ) : (
          <div>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                Total Selected: <Text strong style={{ color: '#10B981' }}>{selectedPermCodes.length}</Text> of {allPermissions.length} permissions
              </Text>
              {!editingRole?.isSystemRole && (
                <Space size={8}>
                  <Button size="small" onClick={() => setSelectedPermCodes(allPermissions.map((p) => p.code))}>Select All</Button>
                  <Button size="small" onClick={() => setSelectedPermCodes([])}>Clear All</Button>
                </Space>
              )}
            </div>

            <Collapse defaultActiveKey={Object.keys(groupedPermissions)} expandIconPosition="end">
              {Object.entries(groupedPermissions).map(([moduleKey, perms]) => {
                const moduleCodes = perms.map((p) => p.code);
                const allSelected = moduleCodes.every((c) => selectedPermCodes.includes(c));
                const someSelected = moduleCodes.some((c) => selectedPermCodes.includes(c)) && !allSelected;

                return (
                  <Collapse.Panel
                    key={moduleKey}
                    header={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: 12 }}>
                        <Space>
                          {!editingRole?.isSystemRole && (
                            <Checkbox
                              checked={allSelected}
                              indeterminate={someSelected}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.checked) {
                                  setSelectedPermCodes((prev) => Array.from(new Set([...prev, ...moduleCodes])));
                                } else {
                                  setSelectedPermCodes((prev) => prev.filter((c) => !moduleCodes.includes(c)));
                                }
                              }}
                            />
                          )}
                          <Text strong style={{ textTransform: 'capitalize' }}>{moduleKey.toLowerCase()} Module</Text>
                        </Space>
                        <Tag color="blue" style={{ borderRadius: 10, fontSize: 11 }}>
                          {perms.filter((p) => selectedPermCodes.includes(p.code)).length} / {perms.length}
                        </Tag>
                      </div>
                    }
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      {perms.map((p) => {
                        const isChecked = selectedPermCodes.includes(p.code);
                        return (
                          <div
                            key={p.code}
                            style={{
                              padding: '8px 10px',
                              borderRadius: 6,
                              background: isChecked ? '#F0FDF4' : '#F8FAFC',
                              border: isChecked ? '1px solid #86EFAC' : '1px solid #E2E8F0',
                            }}
                          >
                            <Checkbox
                              disabled={editingRole?.isSystemRole}
                              checked={isChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPermCodes((prev) => [...prev, p.code]);
                                } else {
                                  setSelectedPermCodes((prev) => prev.filter((c) => c !== p.code));
                                }
                              }}
                            >
                              <div>
                                <Text strong style={{ fontSize: 12, display: 'block', color: '#1E293B' }}>{p.label}</Text>
                                <Text type="secondary" style={{ fontSize: 10 }}>{p.code}</Text>
                              </div>
                            </Checkbox>
                          </div>
                        );
                      })}
                    </div>
                  </Collapse.Panel>
                );
              })}
            </Collapse>
          </div>
        )}
      </Drawer>

      {/* ── Create Custom Role Modal ────────────────────────────────────── */}
      <Modal
        title="Create Custom Role"
        open={newRoleModal}
        onCancel={() => setNewRoleModal(false)}
        onOk={() => newRoleForm.submit()}
        okText="Create & Assign Permissions"
      >
        <Form form={newRoleForm} layout="vertical" onFinish={handleCreateCustomRole} requiredMark={false}>
          <Form.Item name="name" label="Role Name" rules={[{ required: true, message: 'Please enter role name' }]}>
            <Input placeholder="e.g. Junior Purchase Executive" />
          </Form.Item>
          <Form.Item name="description" label="Description (optional)">
            <Input.TextArea placeholder="Describe the responsibilities granted by this role..." rows={3} />
          </Form.Item>
          <Form.Item name="copyFromRoleIds" label="Copy Permissions from Roles (optional)" extra="Select multiple roles to combine their permissions into this new role.">
            <Select
              mode="multiple"
              placeholder="Select roles to clone permissions from"
              allowClear
              options={roles.map((r) => ({ value: r.id, label: `${r.name}${r.isSystemRole ? ' (System)' : ''}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Reset Password Modal ────────────────────────────────────────── */}
      <Modal
        title="Password Reset Successful"
        open={resetPasswordModal.open}
        onCancel={() => setResetPasswordModal({ open: false })}
        footer={[
          <Button key="close" type="primary" onClick={() => setResetPasswordModal({ open: false })}>
            Done
          </Button>,
        ]}
      >
        <Alert type="success" showIcon message={resetPasswordModal.message} style={{ marginBottom: 16, borderRadius: 8 }} />
        <Alert type="warning" showIcon message="Share this temporary password with the user"
          description={
            <div>
              <Text code style={{ fontSize: 18, letterSpacing: '2px', fontWeight: 700 }}>{resetPasswordModal.tempPassword}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>Must be changed on next login. Won't be shown again.</Text>
            </div>
          } style={{ borderRadius: 8 }} />
      </Modal>

      {/* ── Edit User Role Plant Scope Modal ───────────────────────────── */}
      <Modal
        title={`Edit Plant Scope — ${editUserRolePlantModal.roleName ?? ''}`}
        open={editUserRolePlantModal.open}
        onCancel={() => setEditUserRolePlantModal({ open: false, user: null, roleId: null, roleName: null, currentPlantId: null })}
        footer={null}
        destroyOnClose
      >
        <p style={{ color: 'var(--ant-color-text-secondary)', fontSize: 13 }}>
          Restrict <strong>{editUserRolePlantModal.user?.fullName}</strong>'s access under <strong>{editUserRolePlantModal.roleName}</strong> to a specific plant, or select <strong>All Plants</strong> for company-wide access.
        </p>
        <Form
          layout="vertical"
          initialValues={{ plantId: editUserRolePlantModal.currentPlantId ?? undefined }}
          onFinish={(values) => handleUpdateUserRolePlant(values.plantId || null)}
        >
          <Form.Item name="plantId" label="Plant Scope">
            <Select
              allowClear
              placeholder="🌐 All Plants (Company-wide access)"
              options={[
                { value: '', label: '🌐 All Plants (Company-wide access)' },
                ...plants.map((p) => ({ value: p.id, label: `🏭 ${p.name} (${p.code})` })),
              ]}
            />
          </Form.Item>
          <div style={{ textAlign: 'right', marginTop: 20 }}>
            <Space>
              <Button onClick={() => setEditUserRolePlantModal({ open: false, user: null, roleId: null, roleName: null, currentPlantId: null })}>
                Cancel
              </Button>
              <Button type="primary" htmlType="submit">
                Save Plant Scope
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
      <ChangePasswordModal open={changeOwnPasswordModal} onClose={() => setChangeOwnPasswordModal(false)} />
    </Layout>
  );
}
