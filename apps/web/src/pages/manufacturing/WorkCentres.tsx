import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Drawer, Form, Input, InputNumber, Typography, message } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type WorkCenter } from '../../api/manufacturing';
import { useCardStyle, apiErr } from '../_shared/txn';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Title, Text } = Typography;

export function WorkCentresPage() {
  const { company } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    manufacturingApi.workCenters.list(company.id)
      .then((r) => setRows(r.data)).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { form.resetFields(); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id) { message.error('Select company'); return; }
    setSaving(true);
    const body = {
      companyId: company.id,
      code: v.code,
      name: v.name,
      labourRatePaisePerHr: Math.round((v.labourRateRupees || 0) * 100),
      machineRatePaisePerHr: Math.round((v.machineRateRupees || 0) * 100),
      overheadRatePaisePerHr: Math.round((v.overheadRateRupees || 0) * 100),
    };
    try {
      await manufacturingApi.workCenters.create(body);
      message.success('Work Centre created.');
      setDrawer(false);
      load();
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13 }}>{v}</Text> },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Labour Rate/hr', dataIndex: 'labourRatePaisePerHr', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    { title: 'Machine Rate/hr', dataIndex: 'machineRatePaisePerHr', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
    { title: 'Overhead Rate/hr', dataIndex: 'overheadRatePaisePerHr', align: 'right' as const, render: (v: number) => <AmountDisplay paise={v} /> },
  ];

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Work Centres</Title><Text type="secondary" style={{ fontSize: 13 }}>Production stations with cost rates per hour.</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Work Centre</Button>
      </div>

      <div style={cardStyle}>
        <Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No work centres defined.' }} />
      </div>

      <Drawer title="New Work Centre" open={drawer} onClose={() => setDrawer(false)} width={400} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <Form.Item name="code" label="Code" rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}><Input /></Form.Item>
          <Form.Item name="labourRateRupees" label="Labour Rate ₹ / hr"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="machineRateRupees" label="Machine Rate ₹ / hr"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
          <Form.Item name="overheadRateRupees" label="Overhead Rate ₹ / hr"><InputNumber min={0} step={0.01} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
