/**
 * Settings layout — left sub-nav + routed content area.
 * Sits inside the main AppShell Content pane.
 */

import { useMemo } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { usePermissionStore } from '../../store/permission';
import { Menu, Typography, theme as antTheme } from 'antd';
import {
  BankOutlined, TeamOutlined, SafetyOutlined,
  AccountBookOutlined, TagsOutlined, NodeIndexOutlined,
  FieldTimeOutlined, PrinterOutlined, ApiOutlined,
  EnvironmentOutlined, SafetyCertificateOutlined, ReadOutlined
} from '@ant-design/icons';

const { Text } = Typography;

const SETTINGS_NAV = [
  { key: '/settings/company',         label: 'Company',             icon: <BankOutlined /> },
  { key: '/settings/plants',          label: 'Plants & Warehouses', icon: <EnvironmentOutlined /> },
  { key: '/settings/users',           label: 'Users',               icon: <TeamOutlined /> },
  { key: '/settings/roles',           label: 'Roles & Permissions', icon: <SafetyOutlined /> },
  { key: '/settings/approval-limits', label: 'Approval Limits',     icon: <SafetyCertificateOutlined /> },
  { key: '/settings/number-series',   label: 'Number Series',       icon: <FieldTimeOutlined /> },
  { key: '/settings/coa',             label: 'Chart of Accounts',   icon: <AccountBookOutlined /> },
  { key: '/settings/tax-codes',       label: 'Tax Codes',           icon: <TagsOutlined /> },
  { key: '/settings/custom-fields',   label: 'Custom Fields',       icon: <NodeIndexOutlined /> },
  { key: '/settings/print-templates', label: 'Print Templates',     icon: <PrinterOutlined /> },
  { key: '/settings/integrations',    label: 'Integrations',        icon: <ApiOutlined /> },
  { key: '/settings/user-guide',      label: 'User Guide & Workflows', icon: <ReadOutlined /> },
];

export function SettingsLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token: dt } = antTheme.useToken();
  const hasPermission = usePermissionStore((s) => s.hasPermission);

  const navItems = useMemo(() => {
    return SETTINGS_NAV.filter((nav) => {
      if (nav.key === '/settings/approval-limits') {
        return hasPermission('settings.approvalworkflow.manage');
      }
      return true; // We can add more permission checks here in the future
    });
  }, [hasPermission]);

  const selectedKey = useMemo(() => {
    const match = navItems.find((n) => location.pathname.startsWith(n.key));
    return match?.key ?? '/settings/company';
  }, [location.pathname, navItems]);

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Left nav */}
      <div
        style={{
          width: 200,
          flexShrink: 0,
          background: dt.colorBgContainer,
          borderRadius: 10,
          border: `1px solid ${dt.colorBorderSecondary}`,
          overflow: 'hidden',
          position: 'sticky',
          top: 80,
        }}
      >
        <div
          style={{
            padding: '14px 16px 10px',
            borderBottom: `1px solid ${dt.colorBorderSecondary}`,
          }}
        >
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Settings
          </Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={navItems}
          onClick={({ key }) => navigate(key)}
          style={{ border: 0, background: 'transparent' }}
        />
      </div>

      {/* Page content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Outlet />
      </div>
    </div>
  );
}
