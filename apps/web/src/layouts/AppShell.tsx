import { useState, useMemo, useEffect, useCallback } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout, Menu, Avatar, Dropdown, Typography, Button, Drawer, Tooltip,
  Grid, theme as antTheme, Badge, Popover, List
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
  BellOutlined,
} from '@ant-design/icons';
import {
  Building2, Users, Package, FolderTree, Ruler, FileText, FileSignature, Truck, Receipt, CreditCard, ShoppingCart, PackageCheck, Banknote, Scale, BookOpen, Edit3, ArrowRightLeft, Layers, Barcode, ListTree, Factory, Cog, TrendingUp, Landmark, Clock, Percent, BarChart2, LineChart, PieChart, Activity, DollarSign, Building, Warehouse, Hash, Network, Printer, Plug, Shield, ShieldCheck, Sliders, RotateCcw, ReceiptText, Zap, FileSpreadsheet, Anchor, Briefcase, ArrowUpRight
} from 'lucide-react';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import { usePlantStore } from '../store/plant';
import { usePermissionStore } from '../store/permission';
import { authApi } from '../api/auth';
import { ChangePasswordModal } from '../components/ChangePasswordModal';
import { AccessDenied } from '../components/AccessDenied';
import { CommandPalette } from '../components/CommandPalette';
import { WorkspaceTabs } from '../components/WorkspaceTabs';
import { SwipeToCloseLogo } from '../components/SwipeToCloseLogo';
import { useWorkspaceStore } from '../store/workspace';
import { api } from '../api/client';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

// ─── Navigation tree ─────────────────────────────────────────────────────────

export interface NavItem {
  key: string;
  icon?: React.ReactNode;
  label: string;
  perms?: string[];
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
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
      { key: '/masters/suppliers',   icon: <Building2 size={16} />, label: 'Suppliers', perms: ['purchase.supplier.view'] },
      { key: '/masters/customers',   icon: <Users size={16} />, label: 'Customers', perms: ['sales.customer.view'] },
      { key: '/masters/items',       icon: <Package size={16} />, label: 'Items', perms: ['inventory.items.view', 'inventory.items.create'] },
      { key: '/masters/item-groups', icon: <FolderTree size={16} />, label: 'Item Groups', perms: ['inventory.items.view'] },
      { key: '/masters/uom',         icon: <Ruler size={16} />, label: 'Units of Measure', perms: ['inventory.items.view'] },
    ],
  },
  {
    key: 'purchase',
    icon: <ShoppingCartOutlined />,
    label: 'Purchase',
    perms: ['purchase.requisition.view', 'purchase.po.view', 'purchase.grn.view', 'purchase.invoice.view', 'purchase.payment.view', 'purchase.payment.create', 'purchase.debit_note.view'],
    children: [
      { key: '/purchase/requisitions', icon: <FileText size={16} />, label: 'Requisitions', perms: ['purchase.requisition.view'] },
      { key: '/purchase/blanket-orders', icon: <FileSpreadsheet size={16} />, label: 'Blanket POs', perms: ['purchase.blanket_po.view', 'purchase.po.view'] },
      { key: '/purchase/orders',       icon: <FileSignature size={16} />, label: 'Purchase Orders', perms: ['purchase.po.view'] },
      { key: '/purchase/grn',          icon: <Truck size={16} />, label: 'GRN', perms: ['purchase.grn.view'] },
      { key: '/purchase/landed-cost-vouchers', icon: <Anchor size={16} />, label: 'Landed Cost Vouchers', perms: ['purchase.lcv.view', 'purchase.grn.view'] },
      { key: '/purchase/invoices',     icon: <Receipt size={16} />, label: 'Invoices', perms: ['purchase.invoice.view'] },
      { key: '/purchase/payments',     icon: <CreditCard size={16} />, label: 'Payments', perms: ['purchase.payment.view', 'purchase.payment.create'] },
      { key: '/purchase/returns',      icon: <RotateCcw size={16} />, label: 'Returns', perms: ['purchase.return.view', 'purchase.grn.view'] },
      { key: '/purchase/debit-notes',  icon: <ReceiptText size={16} />, label: 'Debit Notes', perms: ['purchase.debit_note.view'] },
    ],
  },
  {
    key: 'sales',
    icon: <ShopOutlined />,
    label: 'Sales',
    perms: ['sales.quotation.view', 'sales.so.view', 'sales.delivery.view', 'sales.invoice.view', 'sales.receipt.view', 'sales.return.view', 'sales.credit_note.view'],
    children: [
      { key: '/sales/quick-invoice', icon: <Zap size={16} className="text-amber-500" />, label: 'Quick Bill (POS)', perms: ['sales.invoice.create'] },
      { key: '/sales/quotations', icon: <FileSignature size={16} />, label: 'Quotations', perms: ['sales.quotation.view'] },
      { key: '/sales/orders',     icon: <ShoppingCart size={16} />, label: 'Sales Orders', perms: ['sales.so.view'] },
      { key: '/sales/delivery',   icon: <PackageCheck size={16} />, label: 'Deliveries', perms: ['sales.delivery.view'] },
      { key: '/sales/invoices',   icon: <Receipt size={16} />, label: 'Invoices', perms: ['sales.invoice.view'] },
      { key: '/sales/receipts',   icon: <Banknote size={16} />, label: 'Receipts', perms: ['sales.receipt.view'] },
      { key: '/sales/returns',    icon: <RotateCcw size={16} />, label: 'Sales Returns', perms: ['sales.return.view'] },
      { key: '/sales/credit-notes', icon: <ReceiptText size={16} />, label: 'Credit Notes', perms: ['sales.credit_note.view'] },
    ],
  },
  {
    key: 'inventory',
    icon: <InboxOutlined />,
    label: 'Inventory',
    perms: ['inventory.stock.view', 'inventory.stock.adjust', 'inventory.stock.transfer'],
    children: [
      { key: '/inventory/stock',        icon: <Scale size={16} />, label: 'Stock Balance', perms: ['inventory.stock.view'] },
      { key: '/inventory/ledger',       icon: <BookOpen size={16} />, label: 'Stock Ledger', perms: ['inventory.stock.view'] },
      { key: '/inventory/adjustments',  icon: <Edit3 size={16} />, label: 'Adjustments', perms: ['inventory.stock.adjust'] },
      { key: '/inventory/transfers',    icon: <ArrowRightLeft size={16} />, label: 'Transfers', perms: ['inventory.stock.transfer'] },
      { key: '/inventory/batches',      icon: <Layers size={16} />, label: 'Batch Tracking', perms: ['inventory.stock.view'] },
      { key: '/inventory/serials',      icon: <Barcode size={16} />, label: 'Serial Tracking', perms: ['inventory.stock.view'] },
    ],
  },
  {
    key: 'manufacturing',
    icon: <BuildOutlined />,
    label: 'Manufacturing',
    perms: ['manufacturing.bom.view', 'manufacturing.order.view'],
    children: [
      { key: '/manufacturing/bom',          icon: <ListTree size={16} />, label: 'Bill of Materials', perms: ['manufacturing.bom.view'] },
      { key: '/manufacturing/orders',       icon: <Factory size={16} />, label: 'Production Orders', perms: ['manufacturing.order.view'] },
      { key: '/manufacturing/subcontracting', icon: <ArrowUpRight size={16} />, label: 'Subcontracting (Job Work)', perms: ['manufacturing.order.view'] },
      { key: '/manufacturing/batches',      icon: <Layers size={16} />, label: 'Process Batches', perms: ['manufacturing.order.view'] },
      { key: '/manufacturing/work-centres', icon: <Cog size={16} />, label: 'Work Centres', perms: ['manufacturing.order.view'] },
    ],
  },
  {
    key: 'accounting',
    icon: <AccountBookOutlined />,
    label: 'Accounting',
    perms: ['accounting.jv.view', 'accounting.coa.view', 'accounting.reports.view', 'accounting.reports.financial'],
    children: [
      { key: '/accounting/jv',             icon: <BookOpen size={16} />, label: 'Journal Vouchers', perms: ['accounting.jv.view'] },
      { key: '/accounting/projects',       icon: <Briefcase size={16} />, label: 'Project Accounting', perms: ['accounting.jv.view'] },
      { key: '/accounting/bank-reconciliation', icon: <Landmark size={16} />, label: 'Bank Reconciliation', perms: ['accounting.jv.view'] },
      { key: '/accounting/trial-balance',  icon: <Scale size={16} />, label: 'Trial Balance', perms: ['accounting.reports.financial'] },
      { key: '/accounting/profit-loss',    icon: <TrendingUp size={16} />, label: 'P&L', perms: ['accounting.reports.financial'] },
      { key: '/accounting/balance-sheet',  icon: <Landmark size={16} />, label: 'Balance Sheet', perms: ['accounting.reports.financial'] },
      { key: '/accounting/ledger',         icon: <BookOpen size={16} />, label: 'GL Ledger', perms: ['accounting.reports.view'] },
      { key: '/accounting/ap-aging',       icon: <Clock size={16} />, label: 'AP Aging', perms: ['accounting.reports.view'] },
      { key: '/accounting/ar-aging',       icon: <Clock size={16} />, label: 'AR Aging', perms: ['accounting.reports.view'] },
      { key: '/accounting/gst-reports',    icon: <Percent size={16} />, label: 'GST Reports', perms: ['accounting.reports.view'] },
    ],
  },
  {
    key: 'reports',
    icon: <BarChartOutlined />,
    label: 'Reports',
    perms: ['purchase.reports.view', 'sales.reports.view', 'inventory.reports.view', 'manufacturing.reports.view', 'accounting.reports.view'],
    children: [
      { key: '/reports/purchase',       icon: <BarChart2 size={16} />, label: 'Purchase', perms: ['purchase.reports.view'] },
      { key: '/reports/sales',          icon: <LineChart size={16} />, label: 'Sales', perms: ['sales.reports.view'] },
      { key: '/reports/inventory',      icon: <PieChart size={16} />, label: 'Inventory', perms: ['inventory.reports.view'] },
      { key: '/reports/manufacturing',  icon: <Activity size={16} />, label: 'Manufacturing', perms: ['manufacturing.reports.view'] },
      { key: '/reports/finance',        icon: <DollarSign size={16} />, label: 'Finance', perms: ['accounting.reports.view'] },
    ],
  },
  {
    key: 'settings',
    icon: <SettingOutlined />,
    label: 'Settings',
    perms: ['settings.company.view', 'settings.plants.view', 'auth.users.view', 'auth.roles.view', 'accounting.coa.view'],
    children: [
      { key: '/settings/company',        icon: <Building size={16} />, label: 'Company', perms: ['settings.company.view'] },
      { key: '/settings/plants',         icon: <Warehouse size={16} />, label: 'Plants & Warehouses', perms: ['settings.plants.view'] },
      { key: '/settings/users',          icon: <Users size={16} />, label: 'Users', perms: ['auth.users.view'] },
      { key: '/settings/roles',          icon: <Shield size={16} />, label: 'Roles & Permissions', perms: ['auth.roles.view'] },
      { key: '/settings/approval-limits', icon: <ShieldCheck size={16} />, label: 'Approval Limits', perms: ['settings.approvalworkflow.manage'] },
      { key: '/settings/number-series',  icon: <Hash size={16} />, label: 'Number Series', perms: ['settings.company.view'] },
      { key: '/settings/coa',            icon: <Network size={16} />, label: 'Chart of Accounts', perms: ['accounting.coa.view'] },
      { key: '/settings/tax-codes',      icon: <Percent size={16} />, label: 'Tax Codes', perms: ['settings.company.view'] },
      { key: '/settings/custom-fields',  icon: <Sliders size={16} />, label: 'Custom Fields', perms: ['settings.company.view'] },
      { key: '/settings/print-templates', icon: <Printer size={16} />, label: 'Print Templates', perms: ['settings.company.view'] },
      { key: '/settings/integrations',   icon: <Plug size={16} />, label: 'Integrations', perms: ['settings.company.view'] },
      { key: '/settings/user-guide',     icon: <BookOpen size={16} />, label: 'User Guide & Workflows' },
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
  const closeAllTabs = useWorkspaceStore((s) => s.closeAll);

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
  const derivedOpenKeys = useMemo(() => {
    return NAV_GROUP_KEYS.filter((g) =>
      location.pathname.startsWith('/' + g)
    );
  }, [location.pathname]);

  const [activeOpenKeys, setActiveOpenKeys] = useState<string[]>(derivedOpenKeys);

  useEffect(() => {
    setActiveOpenKeys(derivedOpenKeys);
  }, [derivedOpenKeys]);

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

  // ─── Real-time Notifications ────────────────────────────────────────────────
  const [notificationsList, setNotificationsList] = useState<Array<{
    id: string;
    title: string;
    description: string;
    time: string;
    unread: boolean;
    type: string;
    link?: string;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!company?.id) return;
    try {
      const res = await api.get('/notifications');
      if (res.data) {
        setNotificationsList(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount ?? 0);
      }
    } catch {
      setNotificationsList([
        { id: '1', title: 'Approval Required', description: 'Pending purchase/production approvals require action.', time: 'Active', unread: true, type: 'approval', link: '/governance/approvals' },
        { id: '2', title: 'Stock Status', description: 'Stock monitoring active for all plant warehouses.', time: '1h ago', unread: false, type: 'stock', link: '/inventory/stock-balances' },
      ]);
      setUnreadCount(1);
    }
  }, [company?.id]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleMarkAsRead = async (id: string, link?: string) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotificationsList((prev) => prev.map((n) => n.id === id ? { ...n, unread: false } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
      if (link) navigate(link);
    } catch {
      if (link) navigate(link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read');
      setNotificationsList((prev) => prev.map((n) => ({ ...n, unread: false })));
      setUnreadCount(0);
    } catch {
      setNotificationsList((prev) => prev.map((n) => ({ ...n, unread: false })));
      setUnreadCount(0);
    }
  };

  const notificationContent = (
    <div style={{ width: 340, margin: '-12px -16px' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${dt.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>Notifications {unreadCount > 0 && `(${unreadCount})`}</Text>
        {unreadCount > 0 && (
          <Button type="link" size="small" onClick={handleMarkAllRead} style={{ fontSize: 12, padding: 0 }}>
            Mark all as read
          </Button>
        )}
      </div>
      <List
        dataSource={notificationsList}
        locale={{ emptyText: <div style={{ padding: 16, color: dt.colorTextTertiary }}>No notifications</div> }}
        renderItem={(item) => (
          <List.Item
            onClick={() => handleMarkAsRead(item.id, item.link)}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              background: item.unread ? (isDark ? '#1e293b' : '#f0fdf4') : 'transparent',
              borderBottom: `1px solid ${dt.colorBorderSecondary}`,
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = dt.colorBgLayout)}
            onMouseLeave={(e) => (e.currentTarget.style.background = item.unread ? (isDark ? '#1e293b' : '#f0fdf4') : 'transparent')}
          >
            <List.Item.Meta
              title={<span style={{ fontSize: 13, fontWeight: item.unread ? 600 : 500 }}>{item.title}</span>}
              description={
                <div>
                  <div style={{ fontSize: 12, color: dt.colorTextSecondary }}>{item.description}</div>
                  <div style={{ fontSize: 11, color: dt.colorTextTertiary, marginTop: 4 }}>{item.time}</div>
                </div>
              }
            />
            {item.unread && <div style={{ width: 8, height: 8, borderRadius: 4, background: '#10b981' }} />}
          </List.Item>
        )}
      />
      <div style={{ padding: '10px 16px', textAlign: 'center', borderTop: `1px solid ${dt.colorBorderSecondary}` }}>
        <Button type="link" size="small" onClick={() => navigate('/governance/approvals')} style={{ fontSize: 12 }}>
          View Pending Approvals
        </Button>
      </div>
    </div>
  );

  // ─── Sidebar content ────────────────────────────────────────────────────────
  const siderContent = (
    <>
      <SwipeToCloseLogo 
        collapsed={collapsed} 
        isDesktop={isDesktop} 
        onDoubleClick={() => setActiveOpenKeys([])} 
      />

      {/* Navigation */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <Menu
          mode="inline"
          selectedKeys={selectedKeys}
          openKeys={activeOpenKeys}
          onOpenChange={setActiveOpenKeys}
          inlineCollapsed={collapsed && isDesktop}
          inlineIndent={16}
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
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {siderContent}
          </div>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Notification Inbox */}
            <Popover
              content={notificationContent}
              trigger="click"
              placement="bottomRight"
              arrow={false}
            >
              <Badge count={unreadCount} size="small" offset={[-4, 4]}>
                <Button
                  type="text"
                  shape="circle"
                  icon={<BellOutlined style={{ fontSize: 18, color: dt.colorTextSecondary }} />}
                />
              </Badge>
            </Popover>

            {/* Theme toggle */}
            <Tooltip title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              <Button
                type="text"
                shape="circle"
                icon={isDark ? <SunOutlined style={{ fontSize: 18 }} /> : <MoonOutlined style={{ fontSize: 18 }} />}
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

        {/* Workspace Tab Bar */}
        <WorkspaceTabs />

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
      <CommandPalette />
    </Layout>
  );
}
