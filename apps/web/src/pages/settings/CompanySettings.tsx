import { useState, useEffect } from 'react';
import {
  Form, Input, Button, Tabs, Typography, Spin, Alert, message, Select,
  Row, Col, Divider, theme as antTheme,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { settingsApi, type CompanyDetail } from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const INDIAN_STATES = [
  { value: '01', label: '01 – Jammu & Kashmir' },
  { value: '02', label: '02 – Himachal Pradesh' },
  { value: '03', label: '03 – Punjab' },
  { value: '04', label: '04 – Chandigarh' },
  { value: '05', label: '05 – Uttarakhand' },
  { value: '06', label: '06 – Haryana' },
  { value: '07', label: '07 – Delhi' },
  { value: '08', label: '08 – Rajasthan' },
  { value: '09', label: '09 – Uttar Pradesh' },
  { value: '10', label: '10 – Bihar' },
  { value: '11', label: '11 – Sikkim' },
  { value: '12', label: '12 – Arunachal Pradesh' },
  { value: '13', label: '13 – Nagaland' },
  { value: '14', label: '14 – Manipur' },
  { value: '15', label: '15 – Mizoram' },
  { value: '16', label: '16 – Tripura' },
  { value: '17', label: '17 – Meghalaya' },
  { value: '18', label: '18 – Assam' },
  { value: '19', label: '19 – West Bengal' },
  { value: '20', label: '20 – Jharkhand' },
  { value: '21', label: '21 – Odisha' },
  { value: '22', label: '22 – Chhattisgarh' },
  { value: '23', label: '23 – Madhya Pradesh' },
  { value: '24', label: '24 – Gujarat' },
  { value: '27', label: '27 – Maharashtra' },
  { value: '28', label: '28 – Andhra Pradesh' },
  { value: '29', label: '29 – Karnataka' },
  { value: '30', label: '30 – Goa' },
  { value: '32', label: '32 – Kerala' },
  { value: '33', label: '33 – Tamil Nadu' },
  { value: '36', label: '36 – Telangana' },
];

export function CompanySettingsPage() {
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [generalForm] = Form.useForm();
  const [gstForm] = Form.useForm();
  const [financialForm] = Form.useForm();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);

  useEffect(() => {
    if (!company?.id) return;
    settingsApi.getCompany(company.id)
      .then((co) => {
        setDetail(co);
        generalForm.setFieldsValue(co);
        gstForm.setFieldsValue(co);
        financialForm.setFieldsValue(co);
      })
      .catch((e) => setError(e?.response?.data?.error ?? 'Failed to load company details'))
      .finally(() => setLoading(false));
  }, [company?.id]);

  const handleSave = async (values: Partial<CompanyDetail>) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      await settingsApi.updateCompany(company.id, values);
      message.success('Company settings saved.');
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const cardStyle = {
    background: dt.colorBgContainer,
    borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`,
    padding: '24px 28px 28px',
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Company Settings</Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          {detail?.legalName ?? detail?.name ?? company?.name}
        </Text>
      </div>

      {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16, borderRadius: 8 }} />}

      <Tabs
        defaultActiveKey="general"
        items={[
          {
            key: 'general',
            label: 'General',
            children: (
              <div style={cardStyle}>
                <Form
                  form={generalForm}
                  layout="vertical"
                  onFinish={handleSave}
                  requiredMark={false}
                >
                  <Row gutter={20}>
                    <Col xs={24} sm={12}>
                      <Form.Item name="name" label="Display Name" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="legalName" label="Legal / Registered Name">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="pan" label="PAN">
                        <Input placeholder="ABCDE1234F" maxLength={10} style={{ textTransform: 'uppercase' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="phone" label="Phone">
                        <Input placeholder="+91 98765 43210" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
                        <Input placeholder="info@company.com" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                      <Form.Item name="website" label="Website">
                        <Input placeholder="https://company.com" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Divider style={{ margin: '4px 0 20px' }} />
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500 }}>
                    Address
                  </Text>

                  <Row gutter={20}>
                    <Col xs={24}>
                      <Form.Item name="address" label="Street Address">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item name="city" label="City">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={10}>
                      <Form.Item name="state" label="State">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={6}>
                      <Form.Item name="pincode" label="PIN Code">
                        <Input maxLength={6} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item style={{ marginBottom: 0, marginTop: 4 }}>
                    <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                      Save General
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            ),
          },
          {
            key: 'gst',
            label: 'GST',
            children: (
              <div style={cardStyle}>
                <Form
                  form={gstForm}
                  layout="vertical"
                  onFinish={handleSave}
                  requiredMark={false}
                >
                  <Row gutter={20}>
                    <Col xs={24} sm={16}>
                      <Form.Item
                        name="gstin"
                        label="Company GSTIN"
                        extra="15-character GST identification number"
                        rules={[
                          { len: 15, message: 'GSTIN must be exactly 15 characters' },
                          { pattern: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, message: 'Invalid GSTIN format' },
                        ]}
                      >
                        <Input
                          placeholder="29ABCDE1234F1Z5"
                          maxLength={15}
                          style={{ textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'monospace' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item name="stateCode" label="GST State Code">
                        <Select
                          placeholder="Select state"
                          showSearch
                          options={INDIAN_STATES}
                          optionFilterProp="label"
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Alert
                    type="info"
                    showIcon
                    message="Plants in different states should have their own GSTIN"
                    description="If your company has manufacturing plants across multiple states, configure the plant-specific GSTIN under Settings → Plants & Warehouses."
                    style={{ borderRadius: 8, marginBottom: 20 }}
                  />

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                      Save GST Settings
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            ),
          },
          {
            key: 'financial',
            label: 'Financial',
            children: (
              <div style={cardStyle}>
                <Form
                  form={financialForm}
                  layout="vertical"
                  onFinish={handleSave}
                  requiredMark={false}
                >
                  <Row gutter={20}>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="baseCurrency"
                        label="Base Currency"
                        extra="Cannot be changed after transactions are posted"
                      >
                        <Select disabled options={[{ value: 'INR', label: '₹ INR — Indian Rupee' }]} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                      <Form.Item
                        name="financialYearStart"
                        label="Financial Year Start"
                        extra="Standard Indian FY: April 1 (04-01)"
                      >
                        <Select
                          options={[
                            { value: '04-01', label: 'April 1 (Indian FY)' },
                            { value: '01-01', label: 'January 1 (Calendar year)' },
                            { value: '07-01', label: 'July 1' },
                          ]}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Alert
                    type="warning"
                    showIcon
                    message="Financial year periods are locked once accounting entries exist"
                    description="Changing the financial year start only affects future periods. Historical entries retain their period assignments."
                    style={{ borderRadius: 8, marginBottom: 20 }}
                  />

                  <Form.Item style={{ marginBottom: 0 }}>
                    <Button type="primary" htmlType="submit" loading={saving} icon={<SaveOutlined />}>
                      Save Financial Settings
                    </Button>
                  </Form.Item>
                </Form>
              </div>
            ),
          },
          {
            key: 'branding',
            label: 'Branding',
            children: (
              <div style={cardStyle}>
                <Alert
                  type="info"
                  showIcon
                  message="Branding will be available in a future update"
                  description="Company logo, address block, and digital signature will be configurable here. These fields feed the universal print template used across all documents."
                  style={{ borderRadius: 8 }}
                />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
