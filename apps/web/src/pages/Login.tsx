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
      localStorage.setItem('erp_last_user', values.email);
      navigate('/select-company', { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ?? err?.response?.data?.error ?? 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-300 ${isDark ? 'bg-[#191C24]' : 'bg-gradient-to-br from-indigo-50 via-sky-50 to-slate-50'}`}>
      {/* Card */}
      <div className="w-full max-w-[400px] bg-white dark:bg-slate-800 rounded-2xl shadow-[0_8px_32px_rgba(15,23,42,0.10)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)] border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-indigo-600 to-indigo-400" />

        <div className="px-10 pt-10 pb-9">
          {/* Logo + title */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-400 inline-flex items-center justify-center mb-4 shadow-[0_4px_14px_rgba(79,70,229,0.35)]">
              <span className="text-white font-bold text-2xl">E</span>
            </div>
            <h1 className="m-0 font-bold text-xl text-slate-900 dark:text-white">
              Sign in to ERP
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 block mt-1 m-0">
              Manufacturing ERP for Indian SMEs
            </p>
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
              email: localStorage.getItem('erp_last_user') || '',
              password: ''
            }}
          >
            <Form.Item
              name="email"
              label={<span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Email or User ID</span>}
              rules={[
                { required: true, message: 'Email or User ID is required' },
              ]}
              className="mb-4"
            >
              <Input
                prefix={<MailOutlined className="text-slate-400" />}
                placeholder="you@company.com or User ID"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Password</span>}
              rules={[{ required: true, message: 'Password is required' }]}
              className="mb-6"
            >
              <Input.Password
                prefix={<LockOutlined className="text-slate-400" />}
                placeholder="••••••••"
                className="rounded-lg"
              />
            </Form.Item>

            <Form.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                className="h-[42px] rounded-lg font-semibold text-sm bg-indigo-600 hover:bg-indigo-700 border-none"
              >
                Sign in
              </Button>
            </Form.Item>
          </Form>

          {/* Footer note */}
          <div className="text-center mt-7">
            <p className="text-xs text-slate-500 dark:text-slate-400 m-0">
              Contact your administrator if you need access.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
