import { useState, useEffect } from 'react';
import { Button, Typography, Space, Form, Select, InputNumber, Card, message, Row, Col, Divider } from 'antd';
import { PlusOutlined, DeleteOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const DOC_TYPES = [
  { label: 'Purchase Requisition', value: 'purchase.requisition' },
  { label: 'Purchase Order', value: 'purchase.po' },
  { label: 'Goods Receipt Note (GRN)', value: 'purchase.grn' },
  { label: 'Purchase Invoice', value: 'purchase.invoice' },
  { label: 'Sales Order', value: 'sales.so' },
];

export function ApprovalLimits() {
  const company = usePlantStore((s) => s.company);
  const [form] = Form.useForm();
  
  const [selectedDocType, setSelectedDocType] = useState<string>('purchase.requisition');
  const [users, setUsers] = useState<any[]>([]);
  const [roles, setRoles] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchDependencies = async () => {
    if (!company?.id) return;
    try {
      const [usrRes, roleRes] = await Promise.all([
        api.get(`/settings/${company.id}/users`),
        api.get(`/settings/${company.id}/roles`),
      ]);
      setUsers(usrRes.data.users);
      setRoles(roleRes.data.roles);
    } catch (err) {
      message.error('Failed to load users or roles');
    }
  };

  const loadWorkflow = async (docType: string) => {
    if (!company?.id) return;
    setIsLoading(true);
    try {
      const res = await api.get(`/settings/${company.id}/workflows/${docType}`);
      const levels = res.data.levels || [];
      
      form.setFieldsValue({
        levels: levels.map((l: any) => ({
          ...l,
          thresholdMin: l.thresholdMinPaise / 100,
          thresholdMax: l.thresholdMaxPaise ? l.thresholdMaxPaise / 100 : undefined,
          isUnlimited: !l.thresholdMaxPaise,
        }))
      });
      
      if (levels.length === 0) {
        // Initialize with one default level if empty
        form.setFieldsValue({
          levels: [{
            thresholdMin: 0,
            thresholdMax: undefined,
            isUnlimited: true,
            approverType: 'user',
          }]
        });
      }
    } catch (err) {
      message.error('Failed to load workflow configuration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDependencies();
  }, [company?.id]);

  useEffect(() => {
    loadWorkflow(selectedDocType);
  }, [selectedDocType, company?.id]);

  const handleFinish = async (values: any) => {
    if (!company?.id) return;
    setIsSaving(true);
    try {
      const payload = {
        levels: values.levels.map((l: any, index: number) => ({
          level: index + 1,
          thresholdMinPaise: Math.round((l.thresholdMin || 0) * 100),
          thresholdMaxPaise: l.isUnlimited ? null : Math.round((l.thresholdMax || 0) * 100),
          approverType: l.approverType,
          approverUserId: l.approverType === 'user' ? l.approverUserId : null,
          approverRoleId: l.approverType === 'role' ? l.approverRoleId : null,
          requiredApprovals: 1, // Defaulting to 1 for now
        }))
      };
      
      await api.post(`/settings/${company.id}/workflows/${selectedDocType}`, payload);
      message.success('Approval workflow saved successfully');
      loadWorkflow(selectedDocType);
    } catch (err) {
      message.error('Failed to save workflow');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>Approval Workflows</Title>
          <Text type="secondary">Define multi-level approval routing and price ranges per document type.</Text>
        </div>
      </div>

      <Card loading={isLoading}>
        <Space direction="vertical" style={{ width: '100%', marginBottom: 24 }}>
          <Text strong>Select Document Type to Configure</Text>
          <Select 
            style={{ width: 300 }}
            value={selectedDocType}
            onChange={(val) => setSelectedDocType(val)}
            options={DOC_TYPES}
          />
        </Space>
        
        <Divider />

        <Form form={form} layout="vertical" onFinish={handleFinish}>
          <Form.List name="levels">
            {(fields, { add, remove }) => (
              <div style={{ display: 'flex', flexDirection: 'column', rowGap: 16 }}>
                {fields.map(({ key, name, ...restField }, index) => (
                  <Card 
                    key={key} 
                    size="small" 
                    title={`Level ${index + 1}`} 
                    extra={
                      <Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(name)} />
                    }
                  >
                    <Row gutter={16}>
                      <Col span={6}>
                        <Form.Item
                          {...restField}
                          name={[name, 'thresholdMin']}
                          label="Min Amount (₹)"
                          rules={[{ required: true, message: 'Required' }]}
                        >
                          <InputNumber style={{ width: '100%' }} min={0} />
                        </Form.Item>
                      </Col>
                      <Col span={6}>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, curr) => 
                            prev.levels?.[name]?.isUnlimited !== curr.levels?.[name]?.isUnlimited
                          }
                        >
                          {() => {
                            const isUnlimited = form.getFieldValue(['levels', name, 'isUnlimited']);
                            return (
                              <Form.Item
                                {...restField}
                                name={[name, 'thresholdMax']}
                                label={
                                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <span>Max Amount (₹)</span>
                                    <a 
                                      onClick={() => {
                                        const current = form.getFieldValue(['levels']);
                                        current[name].isUnlimited = !isUnlimited;
                                        if (current[name].isUnlimited) current[name].thresholdMax = undefined;
                                        form.setFieldsValue({ levels: current });
                                      }}
                                    >
                                      {isUnlimited ? 'Set Limit' : 'Set Unlimited'}
                                    </a>
                                  </div>
                                }
                                rules={[{ required: !isUnlimited, message: 'Required' }]}
                              >
                                <InputNumber style={{ width: '100%' }} min={0} disabled={isUnlimited} placeholder={isUnlimited ? 'Unlimited' : ''} />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                        {/* Hidden field to keep track of isUnlimited state */}
                        <Form.Item name={[name, 'isUnlimited']} hidden><InputNumber /></Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, 'approverType']}
                          label="Approver Type"
                          rules={[{ required: true }]}
                        >
                          <Select options={[{ label: 'User', value: 'user' }, { label: 'Role', value: 'role' }]} />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          noStyle
                          shouldUpdate={(prev, curr) => 
                            prev.levels?.[name]?.approverType !== curr.levels?.[name]?.approverType
                          }
                        >
                          {() => {
                            const approverType = form.getFieldValue(['levels', name, 'approverType']);
                            if (approverType === 'role') {
                              return (
                                <Form.Item
                                  {...restField}
                                  name={[name, 'approverRoleId']}
                                  label="Select Role"
                                  rules={[{ required: true, message: 'Required' }]}
                                >
                                  <Select
                                    showSearch
                                    optionFilterProp="children"
                                    options={roles?.map((r) => ({ label: r.name, value: r.id }))}
                                  />
                                </Form.Item>
                              );
                            }
                            return (
                              <Form.Item
                                {...restField}
                                name={[name, 'approverUserId']}
                                label="Select User"
                                rules={[{ required: true, message: 'Required' }]}
                              >
                                <Select
                                  showSearch
                                  optionFilterProp="children"
                                  options={users?.map((u: any) => ({ label: `${u.fullName} (${u.email})`, value: u.id }))}
                                />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                      </Col>
                    </Row>
                  </Card>
                ))}
                <Button type="dashed" onClick={() => add({ approverType: 'user', isUnlimited: true, thresholdMin: 0 })} block icon={<PlusOutlined />}>
                  Add Approval Level
                </Button>
              </div>
            )}
          </Form.List>

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={isSaving}>
              Save Workflow Configuration
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
