import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Button, Drawer, Form, Input, Select, Switch, Typography, Tag, Empty,
  message, Row, Col, Segmented, Popconfirm, Space, theme as antTheme,
} from 'antd';
import {
  PlusOutlined, EditOutlined, DeleteOutlined, NodeIndexOutlined,
} from '@ant-design/icons';
import {
  settingsApi, DOCUMENT_TYPES, docTypeLabel,
  type CustomFieldDef, type CustomFieldType,
} from '../../api/settings';
import { usePlantStore } from '../../store/plant';

const { Title, Text } = Typography;

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Text area' },
  { value: 'number', label: 'Number' },
  { value: 'integer', label: 'Integer' },
  { value: 'currency', label: 'Currency (₹)' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & time' },
  { value: 'select', label: 'Dropdown (single)' },
  { value: 'multiselect', label: 'Dropdown (multiple)' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'link', label: 'Link to master' },
];

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const randomId = () => 'cf_' + Math.random().toString(36).slice(2, 10);

export function CustomFieldsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { token: dt } = antTheme.useToken();
  const [form] = Form.useForm();
  const watch = Form.useWatch([], form);

  const [docType, setDocType] = useState(DOCUMENT_TYPES[1].value); // default: Purchase Order
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDef | null>(null);

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    settingsApi.getCustomFields(company.id, docType)
      .then(setFields)
      .catch(() => message.error('Failed to load custom fields'))
      .finally(() => setLoading(false));
  }, [company?.id, docType]);

  useEffect(load, [load]);

  const persist = async (next: CustomFieldDef[]) => {
    if (!company?.id) return;
    setSaving(true);
    try {
      await settingsApi.saveCustomFields(company.id, docType, next);
      setFields(next);
      message.success('Custom fields saved.');
    } catch (e: any) {
      message.error(e?.response?.data?.error ?? 'Save failed');
      load();
    } finally {
      setSaving(false);
    }
  };

  const open = (field: CustomFieldDef | null) => {
    setEditing(field);
    form.resetFields();
    if (field) {
      form.setFieldsValue({ ...field, optionsText: field.options?.join('\n') });
    } else {
      form.setFieldsValue({ fieldType: 'text', scope: 'header', required: false, showInList: false });
    }
    setDrawer(true);
  };

  const submitField = (values: any) => {
    const needsOptions = values.fieldType === 'select' || values.fieldType === 'multiselect';
    const def: CustomFieldDef = {
      id: editing?.id ?? randomId(),
      fieldName: editing?.fieldName ?? slugify(values.label),
      label: values.label,
      fieldType: values.fieldType,
      scope: values.scope,
      required: !!values.required,
      showInList: !!values.showInList,
      options: needsOptions
        ? String(values.optionsText ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean)
        : undefined,
      linkTo: values.fieldType === 'link' ? values.linkTo : undefined,
    };
    const next = editing
      ? fields.map((f) => (f.id === editing.id ? def : f))
      : [...fields, def];
    setDrawer(false);
    persist(next);
  };

  const remove = (id: string) => persist(fields.filter((f) => f.id !== id));

  const cardStyle = {
    background: dt.colorBgContainer, borderRadius: 12,
    border: `1px solid ${dt.colorBorderSecondary}`,
  };

  const headerFields = fields.filter((f) => f.scope === 'header');
  const lineFields = fields.filter((f) => f.scope === 'line');
  const needsOptions = watch?.fieldType === 'select' || watch?.fieldType === 'multiselect';

  const FieldRow = ({ f }: { f: CustomFieldDef }) => (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', borderBottom: `1px solid ${dt.colorBorderSecondary}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text strong style={{ fontSize: 13 }}>{f.label}</Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>{f.fieldName}</Text>
      </div>
      <Tag style={{ borderRadius: 10, border: 0, fontSize: 11 }}>
        {FIELD_TYPES.find((t) => t.value === f.fieldType)?.label ?? f.fieldType}
      </Tag>
      {f.required && <Tag color="error" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>Required</Tag>}
      {f.showInList && <Tag color="blue" style={{ borderRadius: 10, border: 0, fontSize: 11 }}>In list</Tag>}
      <Space size={0}>
        <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(f)} />
        <Popconfirm title="Delete this field?" description="Existing saved values stay in the database." onConfirm={() => remove(f.id)} okButtonProps={{ danger: true }}>
          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space>
    </div>
  );

  const Section = ({ title, list }: { title: string; list: CustomFieldDef[] }) => (
    <div style={{ ...cardStyle, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${dt.colorBorderSecondary}` }}>
        <Text strong style={{ fontSize: 13 }}>{title}</Text>
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{list.length} field{list.length !== 1 ? 's' : ''}</Text>
      </div>
      {list.length === 0
        ? <div style={{ padding: 24 }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`No ${title.toLowerCase()}`} /></div>
        : list.map((f) => <FieldRow key={f.id} f={f} />)}
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 700 }}>Custom Fields</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Add company-specific fields to documents without code changes (L2 configuration).
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} loading={saving} onClick={() => open(null)}>Add Field</Button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>Document type</Text>
        <Select
          value={docType}
          onChange={setDocType}
          showSearch
          optionFilterProp="label"
          style={{ minWidth: 280 }}
          options={DOCUMENT_TYPES.map((d) => ({ value: d.value, label: d.label }))}
        />
      </div>

      {loading
        ? <div style={{ ...cardStyle, padding: 40, textAlign: 'center' }}><Text type="secondary">Loading…</Text></div>
        : (
          <>
            <Section title="Header fields" list={headerFields} />
            <Section title="Line item fields" list={lineFields} />
          </>
        )}

      <Drawer
        title={editing ? 'Edit Custom Field' : 'Add Custom Field'}
        open={drawer}
        onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }}
        width={440}
        extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Save</Button>}
      >
        <div style={{ marginBottom: 12 }}>
          <Tag icon={<NodeIndexOutlined />} color="processing" style={{ borderRadius: 10, border: 0 }}>
            {docTypeLabel(docType)}
          </Tag>
        </div>
        <Form form={form} layout="vertical" onFinish={submitField} requiredMark={false}>
          <Form.Item name="label" label="Field Label" rules={[{ required: true, message: 'Required' }]}
            extra={editing ? undefined : 'A machine name is generated automatically from the label'}>
            <Input placeholder="Cost Centre" />
          </Form.Item>
          {editing && (
            <Form.Item label="Machine Name">
              <Input value={editing.fieldName} disabled style={{ fontFamily: 'monospace' }} />
            </Form.Item>
          )}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="fieldType" label="Field Type" rules={[{ required: true }]}>
                <Select disabled={!!editing} options={FIELD_TYPES} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="scope" label="Applies To" rules={[{ required: true }]}>
                <Segmented
                  block
                  options={[{ value: 'header', label: 'Header' }, { value: 'line', label: 'Line' }]}
                />
              </Form.Item>
            </Col>
          </Row>

          {needsOptions && (
            <Form.Item name="optionsText" label="Options" extra="One option per line" rules={[{ required: true, message: 'Add at least one option' }]}>
              <Input.TextArea rows={4} placeholder={'Option A\nOption B\nOption C'} />
            </Form.Item>
          )}

          {watch?.fieldType === 'link' && (
            <Form.Item name="linkTo" label="Link To Master" rules={[{ required: true, message: 'Required' }]}>
              <Select
                options={[
                  { value: 'project', label: 'Project' },
                  { value: 'cost_centre', label: 'Cost Centre' },
                  { value: 'supplier', label: 'Supplier' },
                  { value: 'customer', label: 'Customer' },
                  { value: 'item', label: 'Item' },
                ]}
              />
            </Form.Item>
          )}

          <Form.Item name="required" label="Required field" valuePropName="checked"><Switch /></Form.Item>
          <Form.Item name="showInList" label="Show in list / table views" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}
