import { useState, useMemo, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, Avatar, Dropdown, Typography, Button, Drawer, Tooltip,
  Grid, theme as antTheme,
} from 'antd';
import {
  DashboardOutlined,
  DatabaseOutlined,
  ShoppingCartOutlined,
  ShopOutlined,
  InboxOutlined,
  BuildOutlined,
  AccountBookOutlined,
  BarChartOutlined,
  SettingOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  SunOutlined,
  MoonOutlined,
  BankOutlined,
  EnvironmentOutlined,
  RightOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { usePlantStore } from '../store/plant';
import { usePermissionStore } from '../store/permission';
import { authApi } from '../api/auth';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { AccessDenied } from '../components/AccessDenied';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// ─── Navigation tree ─────────────────────────────────────────────────────────

interface NavItem {
  key: string;
  icon?: React.ReactNode;
  label: string;
  perms?: string[];
  children?: NavItem[];
}

const NAV_ITEMS: NavItem[] = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: 'masters',
    icon: <DatabaseOutlined />,
    label: 'Masters',
    perms: ['inventory.items.view', 'inventory.items.create', 'purchase.supplier.view', 'sales.customer.view'],
    children: [
      { key: '/masters/suppliers',   label: 'Suppliers', perms: ['purchase.supplier.view'] },
      { key: '/masters/customers',   label: 'Customers', perms: ['sales.customer.view'] },
      { key: '/masters/items',       label: 'Items', perms: ['inventory.items.view', 'inventory.items.create'] },
      { key: '/masters/item-groups', label: 'Item Groups', perms: ['inventory.items.view'] },
      { key: '/masters/uom',         label: 'Units of Measure', perms: ['inventory.items.view'] },
    ],
  },
  {
    key: 'purchase',
    icon: <ShoppingCartOutlined />,
    label: 'Purchase',
    perms: ['purchase.requisition.view', 'purchase.po.view', 'purchase.grn.view', 'purchase.invoice.view', 'purchase.payment.view', 'purchase.payment.create'],
    children: [
      { key: '/purchase/requisitions', label: 'Requisitions', perms: ['purchase.requisition.view'] },
      { key: '/purchase/orders',       label: 'Purchase Orders', perms: ['purchase.po.view'] },
      { key: '/purchase/grn',          label: 'GRN', perms: ['purchase.grn.view'] },
      { key: '/purchase/invoices',     label: 'Invoices', perms: ['purchase.invoice.view'] },
      { key: '/purchase/payments',     label: 'Payments', perms: ['purchase.payment.view', 'purchase.payment.create'] },
    ],
  },
  {
    key: 'sales',
    icon: <ShopOutlined />,
    label: 'Sales',
    perms: ['sales.quotation.view', 'sales.so.view', 'sales.delivery.view', 'sales.invoice.view', 'sales.receipt.view'],
    children: [
      { key: '/sales/quotations', label: 'Quotations', perms: ['sales.quotation.view'] },
      { key: '/sales/orders',     label: 'Sales Orders', perms: ['sales.so.view'] },
      { key: '/sales/delivery',   label: 'Deliveries', perms: ['sales.delivery.view'] },
      { key: '/sales/invoices',   label: 'Invoices', perms: ['sales.invoice.view'] },
      { key: '/sales/receipts',   label: 'Receipts', perms: ['sales.receipt.view'] },
    ],
  },
  {
    key: 'inventory',
    icon: <InboxOutlined />,
    label: 'Inventory',
    perms: ['inventory.stock.view', 'inventory.stock.adjust', 'inventory.stock.transfer'],
    children: [
      { key: '/inventory/stock',        label: 'Stock Balance', perms: ['inventory.stock.view'] },
      { key: '/inventory/ledger',       label: 'Stock Ledger', perms: ['inventory.stock.view'] },
      { key: '/inventory/adjustments',  label: 'Adjustments', perms: ['inventory.stock.adjust'] },
      { key: '/inventory/transfers',    label: 'Transfers', perms: ['inventory.stock.transfer'] },
      { key: '/inventory/batches',      label: 'Batch Tracking', perms: ['inventory.stock.view'] },
      { key: '/inventory/serials',      label: 'Serial Tracking', perms: ['inventory.stock.view'] },
    ],
  },
  {
    key: 'manufacturing',
    icon: <BuildOutlined />,
    label: 'Manufacturing',
    perms: ['manufacturing.bom.view', 'manufacturing.order.view'],
    children: [
      { key: '/manufacturing/bom',          label: 'Bill of Materials', perms: ['manufacturing.bom.view'] },
      { key: '/manufacturing/orders',       label: 'Production Orders', perms: ['manufacturing.order.view'] },
      { key: '/manufacturing/batches',      label: 'Process Batches', perms: ['manufacturing.order.view'] },
      { key: '/manufacturing/work-centres', label: 'Work Centres', perms: ['manufacturing.order.view'] },
    ],
  },
  {
    key: 'accounting',
    icon: <AccountBookOutlined />,
    label: 'Accounting',
    perms: ['accounting.jv.view', 'accounting.coa.view', 'accounting.reports.view', 'accounting.reports.financial'],
    children: [
      { key: '/accounting/jv',             label: 'Journal Vouchers', perms: ['accounting.jv.view'] },
      { key: '/accounting/trial-balance',  label: 'Trial Balance', perms: ['accounting.reports.financial'] },
      { key: '/accounting/profit-loss',    label: 'P&L', perms: ['accounting.reports.financial'] },
      { key: '/accounting/balance-sheet',  label: 'Balance Sheet', perms: ['accounting.reports.financial'] },
      { key: '/accounting/ledger',         label: 'GL Ledger', perms: ['accounting.reports.view'] },
      { key: '/accounting/ap-aging',       label: 'AP Aging', perms: ['accounting.reports.view'] },
      { key: '/accounting/ar-aging',       label: 'AR Aging', perms: ['accounting.reports.view'] },
      { key: '/accounting/gst-reports',    label: 'GST Reports', perms: ['accounting.reports.view'] },
    ],
  },
  {
    key: 'reports',
    icon: <BarChartOutlined />,
    label: 'Reports',
    perms: ['purchase.reports.view', 'sales.reports.view', 'inventory.reports.view', 'manufacturing.reports.view', 'accounting.reports.view'],
    children: [
      { key: '/reports/purchase',       label: 'Purchase', perms: ['purchase.reports.view'] },
      { key: '/reports/sales',          label: 'Sales', perms: ['sales.reports.view'] },
      { key: '/reports/inventory',      label: 'Inventory', perms: ['inventory.reports.view'] },
      { key: '/reports/manufacturing',  label: 'Manufacturing', perms: ['manufacturing.reports.view'] },
      { key: '/reports/finance',        label: 'Finance', perms: ['accounting.reports.view'] },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Settings',
    perms: ['settings.company.view', 'settings.plants.view', 'auth.users.view', 'auth.roles.view', 'accounting.coa.view'],
    children: [
      { key: '/settings/company',        label: 'Company', perms: ['settings.company.view'] },
      { key: '/settings/plants',         label: 'Plants & Warehouses', perms: ['settings.plants.view'] },
      { key: '/settings/users',          label: 'Users & Roles', perms: ['auth.users.view', 'auth.roles.view'] },
      { key: '/settings/number-series',  label: 'Number Series', perms: ['settings.company.view'] },
      { key: '/settings/coa',            label: 'Chart of Accounts', perms: ['accounting.coa.view'] },
      { key: '/settings/tax-codes',      label: 'Tax Codes', perms: ['settings.company.view'] },
      { key: '/settings/print-templates', label: 'Print Templates', perms: ['settings.company.view'] },
      { key: '/settings/integrations',   label: 'Integrations', perms: ['settings.company.view'] },
    ],
  },
];

// Groups that have sub-menus (for openKeys calculation)
const NAV_GROUP_KEYS = NAV_ITEMS
  .filter((item) => 'children' in item)
  .map((item) => item.key);

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const { token: dt } = antTheme.useToken();

  // Responsive: use drawer on screens narrower than lg (992px)
  const isDesktop = !!screens.lg;

  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [changePasswordModal, setChangePasswordModal] = useState(false);

  // Close drawer when navigating
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const setAuth = useAuthStore((s) => s.setAuth);
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const { company, plant } = usePlantStore();
  const { permissions, fetchPermissions, hasAnyPermission } = usePermissionStore();

  // Sync server session context and access token whenever company or plant changes
  useEffect(() => {
    if (company?.id) {
      authApi.selectContext(company.id, plant?.id ?? null).then(({ accessToken }) => {
        if (user) setAuth(user, accessToken);
      }).catch(() => {});
    }
  }, [company?.id, plant?.id, user, setAuth]);

  // Fetch permissions whenever company or plant changes
  useEffect(() => {
    fetchPermissions(company?.id, plant?.id);
  }, [company?.id, plant?.id]);

  // Dynamically filter navigation tree based on permissions
  const filteredNavItems = useMemo(() => {
    if (permissions.includes('*')) return NAV_ITEMS;

    return NAV_ITEMS.map((group) => {
      if (!group.children) {
        if (!group.perms || hasAnyPermission(group.perms)) return group;
        return null;
      }

      const allowedChildren = group.children.filter(
        (child) => !child.perms || hasAnyPermission(child.perms)
      );

      if (allowedChildren.length === 0) return null;

      return {
        ...group,
        children: allowedChildren,
      };
    }).filter(Boolean) as NavItem[];
  }, [permissions, hasAnyPermission]);

  // Check if current route is allowed
  const isRouteAllowed = useMemo(() => {
    if (permissions.includes('*')) return true;
    if (location.pathname === '/dashboard' || location.pathname === '/') return true;

    // Find target child item in NAV_ITEMS
    for (const group of NAV_ITEMS) {
      if (group.children) {
        const child = group.children.find((c) => c.key === location.pathname);
        if (child) {
          if (!child.perms) return true;
          return hasAnyPermission(child.perms);
        }
      } else if (group.key === location.pathname) {
        if (!group.perms) return true;
        return hasAnyPermission(group.perms);
      }
    }

    return true;
  }, [location.pathname, permissions, hasAnyPermission]);

  // Derive selected + open menu keys from current path
  const selectedKeys = [location.pathname];
  const openKeys = useMemo(() => {
    return NAV_GROUP_KEYS.filter((g) =>
      location.pathname.startsWith('/' + g)
    );
  }, [location.pathname]);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const userMenuItems = [
    {
      key: 'profile',
      label: user?.fullName ?? 'Profile',
      icon: <UserOutlined />,
      disabled: true,
    },
    { type: 'divider' as const },
    {
      key: 'change-company',
      label: 'Change Company / Plant',
      icon: <EnvironmentOutlined />,
      onClick: () => navigate('/select-company'),
    },
    {
      key: 'change-password',
      label: 'Change Password',
      icon: <KeyOutlined />,
      onClick: () => setChangePasswordModal(true),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      label: 'Sign out',
      icon: <LogoutOutlined />,
      danger: true,
      onClick: handleLogout,
    },
  ];

  // ─── Sidebar content ────────────────────────────────────────────────────────
  const siderContent = (
    <>
      {/* Logo / brand */}
      <div
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed && isDesktop ? 'center' : 'flex-start',
          padding: collapsed && isDesktop ? 0 : '0 20px',
          borderBottom: `1px solid ${dt.colorBorderSecondary}`,
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Logo icon — hexagon */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 800,
              fontSize: 16,
              boxShadow: '0 2px 8px rgba(79, 70, 229, 0.4)',
              flexShrink: 0,
            }}
          >
            K
          </div>
          {(!collapsed || !isDesktop) && (
            <Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
              KAIRO ERP
            </Text>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          defaultOpenKeys={openKeys}
          inlineCollapsed={collapsed && isDesktop}
          items={filteredNavItems as any}
          onClick={handleMenuClick}
          style={{ border: 0, marginTop: 4, background: 'transparent' }}
        />
      </div>

      {/* Collapse toggle — desktop only */}
      {isDesktop && (
        <div
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${dt.colorBorderSecondary}`,
          }}
        >
          <Tooltip
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            placement="right"
          >
            <Button
              type="text"
              size="small"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ color: dt.colorTextSecondary }}
            />
          </Tooltip>
        </div>
      )}
    </>
  );

  // ─── Layout ────────────────────────────────────────────────────────────────
  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Desktop sidebar */}
      {isDesktop && (
        <Sider
          width={240}
          collapsedWidth={64}
          collapsed={collapsed}
          trigger={null}
          theme={isDark ? 'dark' : 'light'}
          style={{
            borderRight: `1px solid ${dt.colorBorderSecondary}`,
            display: 'flex',
            flexDirection: 'column',
            position: 'sticky',
            top: 0,
            height: '100vh',
            overflow: 'hidden',
            background: isDark ? '#1F2433' : '#fff',
          }}
        >
          {siderContent}
        </Sider>
      )}

      {/* Mobile / Tablet drawer */}
      {!isDesktop && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          width={240}
          styles={{ body: { padding: 0 } }}
          title={null}
          closeIcon={null}
        >
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {siderContent}
          </div>
        </Drawer>
      )}

      {/* Main section */}
      <Layout>
        {/* Header */}
        <Header
          style={{
            height: 56,
            lineHeight: '56px',
            padding: '0 20px',
            background: dt.colorBgContainer,
            borderBottom: `1px solid ${dt.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          {/* Left header controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Mobile hamburger button */}
            {!isDesktop && (
              <Button
                type="text"
                icon={<MenuUnfoldOutlined />}
                onClick={() => setDrawerOpen(true)}
              />
            )}

            {/* Active Company / Plant pill */}
            <Button
              type="text"
              onClick={() => navigate('/select-company')}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                background: dt.colorBgLayout,
                border: `1px solid ${dt.colorBorderSecondary}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <BankOutlined style={{ color: dt.colorPrimary }} />
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {company?.name ?? 'Select Company'}
                </div>
                {plant && (
                  <div style={{ fontSize: 10, color: dt.colorTextSecondary }}>
                    📍 {plant.name} ({plant.code})
                  </div>
                )}
              </div>
              <EnvironmentOutlined style={{ fontSize: 11, color: dt.colorTextQuaternary }} />
            </Button>
          </div>

          {/* Right header controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Theme toggle */}
            <Tooltip title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              <Button
                type="text"
                shape="circle"
                icon={isDark ? <SunOutlined /> : <MoonOutlined />}
                onClick={toggleTheme}
              />
            </Tooltip>

            {/* User profile dropdown */}
            <Dropdown menu={{ items: userMenuItems }} trigger={['click']}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 8,
                }}
              >
                <Avatar
                  size={28}
                  style={{ background: '#4F46E5', fontSize: 12, fontWeight: 600 }}
                >
                  {user?.fullName?.charAt(0)?.toUpperCase() ?? 'U'}
                </Avatar>
                {screens.sm && (
                  <Text style={{ fontSize: 13, fontWeight: 500 }}>
                    {user?.fullName?.split(' ')[0]}
                  </Text>
                )}
              </div>
            </Dropdown>
          </div>
        </Header>

        {/* Page content */}
        <Content
          style={{
            padding: 24,
            background: dt.colorBgLayout,
            minHeight: 'calc(100vh - 56px)',
          }}
        >
          {isRouteAllowed ? <Outlet /> : <AccessDenied moduleName={location.pathname} />}
        </Content>
      </Layout>

      <ChangePasswordModal open={changePasswordModal} onClose={() => setChangePasswordModal(false)} />
    </Layout>
  );
}
