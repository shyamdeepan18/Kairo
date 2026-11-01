import { useState, useEffect } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Switch, Row, Col, Typography, Card, Spin } from 'antd';
import { settingsApi, type CustomFieldDef } from '../api/settings';

const { Text } = Typography;

interface DynamicCustomFieldsProps {
  companyId?: string;
  documentType: string;
  scope?: 'header' | 'line';
  prefixPath?: (string | number)[];
  disabled?: boolean;
  title?: string;
}

export function DynamicCustomFields({
  companyId,
  documentType,
  scope = 'header',
  prefixPath = ['customData'],
  disabled = false,
  title = 'Additional / Custom Fields',
}: DynamicCustomFieldsProps) {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !documentType) return;
    setLoading(true);
    settingsApi.getCustomFields(companyId, documentType)
      .then((allFields) => {
        const filtered = (allFields || []).filter((f) => f.scope === scope);
        setFields(filtered);
      })
      .catch(() => {
        // Silently tolerate if custom fields fail to load or are not configured
        setFields([]);
      })
      .finally(() => setLoading(false));
  }, [companyId, documentType, scope]);

  if (loading) {
    return (
      <div className="py-2 text-center">
        <Spin size="small" />
      </div>
    );
  }

  if (fields.length === 0) {
    return null;
  }

  const renderFieldInput = (f: CustomFieldDef) => {
    const commonProps = { disabled };

    switch (f.fieldType) {
      case 'textarea':
        return <Input.TextArea rows={2} placeholder={`Enter ${f.label}`} {...commonProps} />;
      case 'number':
        return <InputNumber style={{ width: '100%' }} placeholder={`Enter ${f.label}`} {...commonProps} />;
      case 'integer':
        return <InputNumber precision={0} style={{ width: '100%' }} placeholder={`Enter ${f.label}`} {...commonProps} />;
      case 'currency':
        return <InputNumber prefix="₹" style={{ width: '100%' }} placeholder={`Enter ${f.label}`} {...commonProps} />;
      case 'date':
        return <DatePicker style={{ width: '100%' }} {...commonProps} />;
      case 'datetime':
        return <DatePicker showTime style={{ width: '100%' }} {...commonProps} />;
      case 'select':
        return (
          <Select
            placeholder={`Select ${f.label}`}
            options={(f.options || []).map((opt) => ({ label: opt, value: opt }))}
            allowClear
            {...commonProps}
          />
        );
      case 'multiselect':
        return (
          <Select
            mode="multiple"
            placeholder={`Select ${f.label}`}
            options={(f.options || []).map((opt) => ({ label: opt, value: opt }))}
            allowClear
            {...commonProps}
          />
        );
      case 'checkbox':
        return <Switch {...commonProps} />;
      case 'text':
      default:
        return <Input placeholder={`Enter ${f.label}`} {...commonProps} />;
    }
  };

  return (
    <Card
      size="small"
      title={<Text strong className="text-xs uppercase tracking-wider text-slate-500">{title}</Text>}
      className="my-3 bg-slate-50/50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-800"
    >
      <Row gutter={[16, 12]}>
        {fields.map((f) => (
          <Col xs={24} sm={f.fieldType === 'textarea' ? 24 : 12} key={f.id || f.fieldName}>
            <Form.Item
              name={[...prefixPath, f.fieldName]}
              label={f.label}
              valuePropName={f.fieldType === 'checkbox' ? 'checked' : 'value'}
              rules={[
                {
                  required: f.required,
                  message: `${f.label} is required`,
                },
              ]}
              className="mb-1"
            >
              {renderFieldInput(f)}
            </Form.Item>
          </Col>
        ))}
      </Row>
    </Card>
  );
}

