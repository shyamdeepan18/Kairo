import { useState } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Typography, theme } from 'antd';
import {
  DashboardOutlined,
  LogoutOutlined,
  UserOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../store/auth';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

// ─── Navigation items ─────────────────────────────────────────────────────────
// Add new modules here as phases progress.
const navItems = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined /> },
  // Phase 1+:
  // { key: '/settings', label: 'Settings', icon: <SettingOutlined /> },
  // Phase 6+:
  // { key: '/purchase', label: 'Purchase', icon: <ShoppingCartOutlined /> },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token: designToken } = theme.useToken();
  const [collapsed, setCollapsed] = useState(false);

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const userMenu = {
    items: [
      {
        key: 'logout',
        label: 'Sign out',
        icon: <LogoutOutlined />,
        danger: true,
        onClick: handleLogout,
      },
    ],
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        trigger={null}
        theme="light"
        style={{ borderRight: `1px solid ${designToken.colorBorderSecondary}` }}
      >
        {/* Logo / brand */}
        <div
          style={{
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 20px',
            borderBottom: `1px solid ${designToken.colorBorderSecondary}`,
          }}
        >
          <Text strong style={{ fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {collapsed ? 'E' : 'ERP'}
          </Text>
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={navItems.map((item) => ({
            ...item,
            onClick: () => navigate(item.key),
          }))}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            padding: '0 24px',
            background: designToken.colorBgContainer,
            borderBottom: `1px solid ${designToken.colorBorderSecondary}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Sidebar toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: designToken.colorText }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>

          {/* User menu */}
          <Dropdown menu={userMenu} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              {!collapsed && <Text style={{ fontSize: 13 }}>{user?.fullName}</Text>}
            </div>
          </Dropdown>
        </Header>

        <Content style={{ padding: 24, background: designToken.colorBgLayout }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
