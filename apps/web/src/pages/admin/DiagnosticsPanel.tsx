import { useState, useEffect } from 'react';
import { Card, Table, Typography, Row, Col, Statistic, Alert, Tag, Space, Button } from 'antd';
import { ReloadOutlined, DatabaseOutlined, DesktopOutlined } from '@ant-design/icons';
import { adminApi, type AdminDiagnosticsHealth, type AdminAuditLog } from '../../api/admin';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

export function DiagnosticsPanel() {
  const [health, setHealth] = useState<AdminDiagnosticsHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);

  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsTotal, setLogsTotal] = useState(0);

  const [pagination, setPagination] = useState({ current: 1, pageSize: 50 });

  const fetchHealth = () => {
    setHealthLoading(true);
    setHealthError(null);
    adminApi.getSystemHealth()
      .then(setHealth)
      .catch((e: any) => setHealthError(e.response?.data?.error || e.message))
      .finally(() => setHealthLoading(false));
  };

  const fetchLogs = (page = pagination.current, size = pagination.pageSize) => {
    setLogsLoading(true);
    adminApi.listAuditLogs({ limit: size, offset: (page - 1) * size })
      .then(res => {
        setLogs(res.logs);
        setLogsTotal(res.total);
        setPagination({ current: page, pageSize: size });
      })
      .catch(console.error)
      .finally(() => setLogsLoading(false));
  };

  useEffect(() => {
    fetchHealth();
    fetchLogs();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0 0 40px 0' }}>
      <Row justify="space-between" align="middle">
        <Col>
          <Title level={4} style={{ margin: 0 }}>System Diagnostics</Title>
          <Text type="secondary">Global database health and audit logs.</Text>
        </Col>
        <Col>
          <Button icon={<ReloadOutlined />} onClick={() => { fetchHealth(); fetchLogs(); }}>Refresh</Button>
        </Col>
      </Row>

      {healthError && (
        <Alert 
          type="error" 
          showIcon 
          message="System Health Unavailable" 
          description={healthError} 
        />
      )}

      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card>
            <Statistic 
              title="Active DB Connections" 
              value={health?.activeConnections || 0} 
              prefix={<DatabaseOutlined />} 
              loading={healthLoading} 
            />
          </Card>
        </Col>
        <Col span={16}>
          <Card title="Slowest SQL Queries (Top 10)" size="small">
            <Table
              dataSource={health?.slowQueries || []}
              loading={healthLoading}
              rowKey="query"
              size="small"
              pagination={false}
              columns={[
                { title: 'Query', dataIndex: 'query', width: '60%', render: (t) => <Text code ellipsis style={{ maxWidth: '400px' }}>{t.substring(0, 100)}</Text> },
                { title: 'Calls', dataIndex: 'calls', align: 'right' },
                { title: 'Total Time (ms)', dataIndex: 'total_exec_time', align: 'right', render: (t) => Number(t).toFixed(2) },
                { title: 'Avg Time (ms)', dataIndex: 'mean_exec_time', align: 'right', render: (t) => Number(t).toFixed(2) },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Global Audit Trail" size="small">
        <Table
          dataSource={logs}
          loading={logsLoading}
          rowKey="id"
          size="small"
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: logsTotal,
            onChange: (p, s) => fetchLogs(p, s),
          }}
          columns={[
            {
              title: 'Time',
              dataIndex: 'createdAt',
              width: 160,
              render: (t) => dayjs(t).format('YYYY-MM-DD HH:mm:ss')
            },
            {
              title: 'Action',
              dataIndex: 'action',
              width: 100,
              render: (a) => (
                <Tag color={a === 'CREATE' ? 'green' : a === 'DELETE' ? 'red' : 'blue'}>
                  {a}
                </Tag>
              )
            },
            {
              title: 'Entity',
              dataIndex: 'entity',
              width: 150,
              render: (t, r) => (
                <Space direction="vertical" size={0}>
                  <Text strong>{t}</Text>
                  {r.entityId && <Text type="secondary" style={{ fontSize: 11 }}>{r.entityId}</Text>}
                </Space>
              )
            },
            {
              title: 'User',
              dataIndex: 'userEmail',
              render: (t) => t || <Text type="secondary">System</Text>
            },
            {
              title: 'Company',
              dataIndex: 'companyName',
              render: (t) => t || <Text type="secondary">Global</Text>
            },
            {
              title: 'Details',
              dataIndex: 'details',
              render: (d) => (
                <Space direction="vertical" size={0}>
                  <Text style={{ fontSize: 12 }}>{d?.method} {d?.url}</Text>
                  {d?.statusCode && <Tag style={{ margin: 0, fontSize: 10 }}>{d.statusCode}</Tag>}
                </Space>
              )
            },
            {
              title: 'IP Address',
              dataIndex: 'ipAddress',
              width: 130,
              render: (t) => <Text type="secondary" style={{ fontSize: 12 }}>{t}</Text>
            }
          ]}
        />
      </Card>
    </div>
  );
}
