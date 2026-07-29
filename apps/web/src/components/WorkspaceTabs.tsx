import React, { useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs, theme as antTheme } from 'antd';
import { useWorkspaceStore } from '../store/workspace';
import { NAV_ITEMS } from '../layouts/AppShell';

export function WorkspaceTabs() {
  const location = useLocation();
  const navigate = useNavigate();
  const { tabs, addTab, removeTab } = useWorkspaceStore();
  const { token: dt } = antTheme.useToken();

  // Helper to map pathname to a label from our routing tree
  const getLabelForPath = (path: string) => {
    for (const group of NAV_ITEMS) {
      if (group.children) {
        const match = group.children.find((c) => path.startsWith(c.key));
        if (match) return match.label;
      } else if (path.startsWith(group.key)) {
        return group.label;
      }
    }
    // Fallback parsing (e.g. /purchase/orders -> Purchase Orders)
    const segments = path.split('/').filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      return last.charAt(0).toUpperCase() + last.slice(1).replace('-', ' ');
    }
    return 'Dashboard';
  };

  // Sync current route to workspace store
  useEffect(() => {
    // Avoid adding select-company or login
    if (location.pathname === '/select-company' || location.pathname === '/login') return;

    addTab({
      path: location.pathname,
      label: getLabelForPath(location.pathname),
    });
  }, [location.pathname, addTab]);

  const activeKey = useMemo(() => {
    // Find the best matching tab for current location
    const exactMatch = tabs.find((t) => t.path === location.pathname);
    if (exactMatch) return exactMatch.path;
    const partialMatch = tabs.find((t) => location.pathname.startsWith(t.path));
    return partialMatch?.path || location.pathname;
  }, [location.pathname, tabs]);

  const onEdit = (targetKey: React.MouseEvent | React.KeyboardEvent | string, action: 'add' | 'remove') => {
    if (action === 'remove' && typeof targetKey === 'string') {
      removeTab(targetKey);
      // If we closed the active tab, navigate to another open tab or dashboard
      if (activeKey === targetKey) {
        const remaining = tabs.filter(t => t.path !== targetKey);
        if (remaining.length > 0) {
          navigate(remaining[remaining.length - 1].path);
        } else {
          navigate('/dashboard');
        }
      }
    }
  };

  if (tabs.length === 0) return null;

  return (
    <div style={{ background: dt.colorBgContainer, padding: '0 20px', borderBottom: `1px solid ${dt.colorBorderSecondary}` }}>
      <Tabs
        hideAdd
        type="editable-card"
        onChange={(key) => navigate(key)}
        activeKey={activeKey}
        onEdit={onEdit}
        style={{ marginBottom: -16, marginTop: 8 }}
        items={tabs.map((tab) => ({
          key: tab.path,
          label: tab.label,
          closable: true,
        }))}
      />
    </div>
  );
}
