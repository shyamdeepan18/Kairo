import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Input, List, Typography, theme as antTheme } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { NAV_ITEMS, NavItem } from '../layouts/AppShell';

const { Text } = Typography;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { token: dt } = antTheme.useToken();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  const searchableItems = useMemo(() => {
    const items: { key: string; label: string; icon: React.ReactNode; group: string }[] = [];
    NAV_ITEMS.forEach((group) => {
      if (group.children) {
        group.children.forEach((child) => {
          items.push({
            key: child.key,
            label: child.label,
            icon: child.icon,
            group: group.label,
          });
        });
      } else {
        items.push({
          key: group.key,
          label: group.label,
          icon: group.icon,
          group: 'General',
        });
      }
    });
    return items;
  }, []);

  const filteredItems = useMemo(() => {
    if (!query) return searchableItems;
    const lowerQuery = query.toLowerCase();
    return searchableItems.filter((item) =>
      item.label.toLowerCase().includes(lowerQuery) ||
      item.group.toLowerCase().includes(lowerQuery)
    );
  }, [query, searchableItems]);

  const onSelect = (key: string) => {
    navigate(key);
    handleClose();
  };

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      footer={null}
      closable={false}
      width={600}
      styles={{
        body: { padding: 0 },
        mask: { backdropFilter: 'blur(4px)' }
      }}
      bodyStyle={{ padding: 0, borderRadius: 12, overflow: 'hidden' }}
    >
      <Input
        size="large"
        placeholder="Type a command or search... (e.g. Tax Codes)"
        prefix={<SearchOutlined style={{ color: dt.colorTextTertiary, fontSize: 18 }} />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        style={{
          border: 'none',
          boxShadow: 'none',
          padding: '16px 24px',
          fontSize: 16,
          borderBottom: `1px solid ${dt.colorBorderSecondary}`,
          borderRadius: 0,
        }}
      />
      <List
        style={{ maxHeight: 400, overflowY: 'auto' }}
        dataSource={filteredItems}
        renderItem={(item) => (
          <List.Item
            onClick={() => onSelect(item.key)}
            style={{
              padding: '12px 24px',
              cursor: 'pointer',
              borderBottom: 'none',
              transition: 'background 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = dt.colorBgLayout)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ color: dt.colorTextSecondary }}>{item.icon}</div>
              <div>
                <Text style={{ fontSize: 14, fontWeight: 500 }}>{item.label}</Text>
                <div style={{ fontSize: 11, color: dt.colorTextTertiary }}>{item.group}</div>
              </div>
            </div>
          </List.Item>
        )}
      />
    </Modal>
  );
}
