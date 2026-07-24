import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Form, Input, Button, Alert, Typography, theme as antTheme,
} from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/auth';
import { useThemeStore } from '../store/theme';
import type { LoginInput } from '@erp/shared';

const { Title, Text } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { isDark } = useThemeStore();
  const { token: dt } = antTheme.useToken();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginInput) => {
    setError(null);
    setLoading(true);
    try {
      await login(values.email, values.password);
      navigate('/select-company', { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ?? 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDark
          ? '#191C24'
          : 'linear-gradient(135deg, #EEF2FF 0%, #F0F9FF 50%, #F4F6FB 100%)',
        padding: 24,
      }}
    >
      {/* Card */}
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: dt.colorBgContainer,
          borderRadius: 16,
          boxShadow: isDark
            ? '0 8px 32px rgba(0,0,0,0.4)'
            : '0 8px 32px rgba(15,23,42,0.10)',
          border: `1px solid ${dt.colorBorderSecondary}`,
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            height: 4,
            background: 'linear-gradient(90deg, #4F46E5, #818CF8)',
          }}
        />

        <div style={{ padding: '40px 40px 36px' }}>
          {/* Logo + title */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 4px 14px rgba(79,70,229,0.35)',
              }}
            >
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 22 }}>E</span>
            </div>
            <Title level={4} style={{ margin: 0, fontWeight: 700 }}>
              Sign in to ERP
            </Title>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
              Manufacturing ERP for Indian SMEs
            </Text>
          </div>

          {/* Error alert */}
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          {/* Form */}
          <Form
            layout="vertical"
            onFinish={onFinish}
            size="large"
            autoComplete="off"
            requiredMark={false}
            initialValues={{
              email: 'admin@erp.com',
              password: 'password123'
            }}
          >
            <Form.Item
              name="email"
              label={<Text style={{ fontSize: 13, fontWeight: 500 }}>Email</Text>}
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
              style={{ marginBottom: 16 }}
            >
              <Input
                prefix={<MailOutlined style={{ color: dt.colorTextTertiary }} />}
                placeholder="you@company.com"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<Text style={{ fontSize: 13, fontWeight: 500 }}>Password</Text>}
              rules={[{ required: true, message: 'Password is required' }]}
              style={{ marginBottom: 24 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: dt.colorTextTertiary }} />}
                placeholder="••••••••"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                style={{
                  height: 42,
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                Sign in
              </Button>
            </Form.Item>
          </Form>

          {/* Footer note */}
          <div style={{ textAlign: 'center', marginTop: 28 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Contact your administrator if you need access.
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}
