import { Button, Typography, theme as antTheme } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

export function NotFoundPage() {
  const navigate = useNavigate();
  const { token: dt } = antTheme.useToken();

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: dt.colorBgLayout,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: 80,
          fontWeight: 800,
          lineHeight: 1,
          background: 'linear-gradient(135deg, #4F46E5, #818CF8)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: 16,
        }}
      >
        404
      </div>
      <Title level={3} style={{ margin: '0 0 8px', fontWeight: 700 }}>
        Page not found
      </Title>
      <Text type="secondary" style={{ fontSize: 14, maxWidth: 360, display: 'block', marginBottom: 32 }}>
        The page you're looking for doesn't exist or you don't have permission to view it.
      </Text>
      <div style={{ display: 'flex', gap: 12 }}>
        <Button onClick={() => navigate(-1)}>Go Back</Button>
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}
