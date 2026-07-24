import { Card, Result, Button } from 'antd';
import { SafetyOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

interface AccessDeniedProps {
  moduleName?: string;
  requiredPermission?: string;
}

export function AccessDenied({ moduleName = 'this section', requiredPermission }: AccessDeniedProps) {
  const navigate = useNavigate();

  return (
    <div style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Card style={{ maxWidth: 520, width: '100%', borderRadius: 16, border: '1px solid #E2E8F0', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }}>
        <Result
          status="403"
          icon={<SafetyOutlined style={{ fontSize: 56, color: '#EF4444' }} />}
          title="Access Denied"
          subTitle={
            <div>
              <p style={{ margin: '8px 0 4px', fontSize: 14, color: '#475569' }}>
                You do not have permission to access <strong>{moduleName}</strong> in your currently selected plant scope.
              </p>
              {requiredPermission && (
                <p style={{ fontSize: 12, color: '#64748B', fontFamily: 'monospace' }}>
                  Required Permission: {requiredPermission}
                </p>
              )}
            </div>
          }
          extra={[
            <Button type="primary" key="dashboard" onClick={() => navigate('/dashboard')} style={{ background: '#4F46E5', borderRadius: 8 }}>
              Back to Dashboard
            </Button>,
            <Button key="company" onClick={() => navigate('/select-company')} style={{ borderRadius: 8 }}>
              Switch Plant Scope
            </Button>,
          ]}
        />
      </Card>
    </div>
  );
}
