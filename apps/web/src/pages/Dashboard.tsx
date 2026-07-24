import { Typography, Row, Col, Card, Statistic, Button, List, Tag, theme as antTheme, Skeleton } from 'antd';
import {
  ShoppingCartOutlined,
  ShopOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { usePlantStore } from '../store/plant';
import { useThemeStore } from '../store/theme';
import { AmountDisplay } from '../components/shared/AmountDisplay';

const { Title, Text } = Typography;

// ─── KPI card data (placeholder — will be wired to real API in Phase 7-8) ─────
const KPI_CARDS = [
  {
    title: "Today's Purchase Orders",
    icon: <ShoppingCartOutlined />,
    color: '#4F46E5',
    lightBg: '#EEF2FF',
    darkBg: 'rgba(129,140,248,0.12)',
    value: null,   // null = placeholder
    link: '/purchase/orders',
  },
  {
    title: "Today's Sales Orders",
    icon: <ShopOutlined />,
    color: '#1D4ED8',
    lightBg: '#EFF6FF',
    darkBg: 'rgba(96,165,250,0.12)',
    value: null,
    link: '/sales/orders',
  },
  {
    title: 'Pending Approvals',
    icon: <ClockCircleOutlined />,
    color: '#B45309',
    lightBg: '#FFFBEB',
    darkBg: 'rgba(252,211,77,0.10)',
    value: null,
    link: '/purchase/orders',
  },
  {
    title: 'Outstanding Payables',
    icon: <ArrowUpOutlined />,
    color: '#B91C1C',
    lightBg: '#FEF2F2',
    darkBg: 'rgba(248,113,113,0.10)',
    paise: null,
    link: '/accounting/ap-aging',
    isMoney: true,
  },
  {
    title: 'Outstanding Receivables',
    icon: <ArrowDownOutlined />,
    color: '#15803D',
    lightBg: '#F0FDF4',
    darkBg: 'rgba(74,222,128,0.10)',
    paise: null,
    link: '/accounting/ar-aging',
    isMoney: true,
  },
  {
    title: 'Inventory Value',
    icon: <DollarOutlined />,
    color: '#7C3AED',
    lightBg: '#F5F3FF',
    darkBg: 'rgba(167,139,250,0.10)',
    paise: null,
    link: '/inventory/stock',
    isMoney: true,
  },
];

// ─── Quick create shortcuts ────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { label: 'Purchase Requisition', path: '/purchase/requisitions/new' },
  { label: 'Sales Order',          path: '/sales/orders/new' },
  { label: 'Journal Voucher',      path: '/accounting/jv/new' },
  { label: 'Stock Adjustment',     path: '/inventory/adjustments' },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { company, plant } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const { isDark } = useThemeStore();

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Page header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
            Dashboard
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Welcome back, {user?.fullName?.split(' ')[0]}.
            {plant && (
              <> &nbsp;·&nbsp; <strong style={{ color: dt.colorText }}>{plant.name}</strong></>
            )}
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {QUICK_ACTIONS.slice(0, 2).map((a) => (
            <Button
              key={a.path}
              size="small"
              icon={<PlusOutlined />}
              onClick={() => navigate(a.path)}
            >
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {KPI_CARDS.map((card) => (
          <Col xs={24} sm={12} lg={8} key={card.title}>
            <Card
              style={{
                borderRadius: 12,
                border: `1px solid ${dt.colorBorderSecondary}`,
                cursor: 'pointer',
              }}
              styles={{ body: { padding: '20px 24px' } }}
              onClick={() => navigate(card.link)}
              hoverable
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}
                  >
                    {card.title}
                  </Text>
                  <div style={{ marginTop: 12 }}>
                    {card.value === null && !('isMoney' in card) ? (
                      <Skeleton.Input active size="small" style={{ width: 60, height: 28 }} />
                    ) : card.value === null && 'isMoney' in card ? (
                      <Skeleton.Input active size="small" style={{ width: 100, height: 28 }} />
                    ) : 'isMoney' in card && card.paise !== null ? (
                      <AmountDisplay paise={card.paise as unknown as number} bold />
                    ) : (
                      <Statistic
                        value={card.value as unknown as number}
                        valueStyle={{ fontSize: 24, fontWeight: 700 }}
                      />
                    )}
                  </div>
                </div>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: isDark ? card.darkBg : card.lightBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: card.color,
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  View details
                </Text>
                <RightOutlined style={{ fontSize: 10, color: dt.colorTextTertiary }} />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Bottom row: recent activity + quick actions */}
      <Row gutter={[16, 16]}>
        {/* Recent documents — placeholder */}
        <Col xs={24} lg={16}>
          <Card
            title={<Text strong style={{ fontSize: 14 }}>Recent Documents</Text>}
            extra={<Button type="link" size="small">View all</Button>}
            style={{ borderRadius: 12, border: `1px solid ${dt.colorBorderSecondary}` }}
            styles={{ body: { padding: '8px 0' } }}
          >
            <List
              dataSource={[]}
              locale={{
                emptyText: (
                  <div style={{ padding: '32px 0', color: dt.colorTextTertiary, fontSize: 13 }}>
                    No recent documents yet.
                    <br />
                    Create your first purchase order or sales order to get started.
                  </div>
                ),
              }}
              renderItem={() => null}
            />
          </Card>
        </Col>

        {/* Quick create */}
        <Col xs={24} lg={8}>
          <Card
            title={<Text strong style={{ fontSize: 14 }}>Quick Create</Text>}
            style={{ borderRadius: 12, border: `1px solid ${dt.colorBorderSecondary}` }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {QUICK_ACTIONS.map((a) => (
                <Button
                  key={a.path}
                  block
                  icon={<PlusOutlined />}
                  onClick={() => navigate(a.path)}
                  style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                >
                  {a.label}
                </Button>
              ))}
            </div>
          </Card>

          {/* Setup checklist — shown until all modules configured */}
          <Card
            title={<Text strong style={{ fontSize: 14 }}>Setup Checklist</Text>}
            style={{
              borderRadius: 12,
              marginTop: 16,
              border: `1px solid ${dt.colorBorderSecondary}`,
            }}
            styles={{ body: { padding: '12px 16px' } }}
          >
            {[
              { label: 'Add Company details', path: '/settings/company' },
              { label: 'Configure Chart of Accounts', path: '/settings/coa' },
              { label: 'Add Tax Codes (GST)', path: '/settings/tax-codes' },
              { label: 'Create Item catalogue', path: '/masters/items' },
              { label: 'Add Suppliers & Customers', path: '/masters/suppliers' },
            ].map((item) => (
              <div
                key={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: `1px solid ${dt.colorBorderSecondary}`,
                  cursor: 'pointer',
                }}
                onClick={() => navigate(item.path)}
              >
                <Text style={{ fontSize: 13 }}>{item.label}</Text>
                <Tag color="processing" style={{ fontSize: 10, borderRadius: 10, border: 0 }}>
                  Pending
                </Tag>
              </div>
            ))}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
