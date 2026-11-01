import React, { useState, useEffect } from 'react';
import {
  Card, Form, Input, InputNumber, Select, Button, Row, Col, Typography,
  Alert, message, Modal, Tag, Divider,
} from 'antd';
import { ShieldAlert, CheckCircle2, History, Scale } from 'lucide-react';
import { adminApi, type AdminCompany, type AdminPlant } from '../../../api/admin';
import { mastersApi, type Item } from '../../../api/masters';
import { settingsApi, type Warehouse } from '../../../api/settings';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;

interface Props {
  companies: AdminCompany[];
  selectedCompany: AdminCompany | null;
}

export function AdminStockAdjustments({ companies, selectedCompany }: Props) {
  const [form] = Form.useForm();
  const [activeCompanyId, setActiveCompanyId] = useState<string | undefined>(selectedCompany?.id);
  const [plants, setPlants] = useState<AdminPlant[]>([]);
  const [selectedPlantId, setSelectedPlantId] = useState<string | undefined>();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultModal, setResultModal] = useState<any | null>(null);

  // Sync selected company
  useEffect(() => {
    if (selectedCompany?.id) {
      setActiveCompanyId(selectedCompany.id);
    }
  }, [selectedCompany?.id]);

  // Load plants and items when active company changes
  useEffect(() => {
    if (!activeCompanyId) return;
    adminApi.listPlants(activeCompanyId)
      .then((res) => {
        const plantList = res.plants || [];
        setPlants(plantList);
        if (plantList.length > 0) {
          setSelectedPlantId(plantList[0].id);
          form.setFieldsValue({ plantId: plantList[0].id });
        }
      })
      .catch(() => message.error('Failed to load plants'));

    mastersApi.listItems(activeCompanyId)
      .then((items) => setItems(items))
      .catch(() => message.error('Failed to load items'));
  }, [activeCompanyId, form]);

  // Load warehouses when plant changes
  useEffect(() => {
    if (!activeCompanyId) return;
    settingsApi.listWarehouses(activeCompanyId, selectedPlantId)
      .then((whs) => {
        setWarehouses(whs);
        if (whs.length > 0) {
          form.setFieldsValue({ warehouseId: whs[0].id });
        }
      })
      .catch(() => {});
  }, [activeCompanyId, selectedPlantId, form]);

  const handleSubmit = async (values: any) => {
    if (!activeCompanyId) {
      message.error('Please select a company');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        companyId: activeCompanyId,
        plantId: values.plantId,
        warehouseId: values.warehouseId,
        itemId: values.itemId,
        movementType: values.movementType,
        quantity: values.quantity,
        valuationRatePaise: Math.round((values.valuationRate || 0) * 100),
        postingDate: dayjs(values.postingDate).format('YYYY-MM-DD'),
        reasonCode: values.reasonCode,
        justification: values.justification,
        referenceDocNumber: values.referenceDocNumber,
      };

      const res = await adminApi.overrideStockAdjustment(payload);
      message.success(`Stock adjustment ${res.documentNumber} posted successfully!`);
      setResultModal(res);
      form.resetFields(['quantity', 'justification', 'referenceDocNumber']);
    } catch (err: any) {
      message.error(err?.response?.data?.error || err.message || 'Stock adjustment failed');
    } finally {
      setLoading(false);
    }
  };

  const handleItemSelect = (itemId: string) => {
    const selected = items.find((i) => i.id === itemId);
    if (selected) {
      form.setFieldsValue({
        valuationRate: ((selected.purchaseRatePaise || selected.standardCostPaise || 0) / 100),
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Alert
        message="Super-Admin Stock Reconciliation Console"
        description="Allows authorized administrators to adjust Finished Goods, Semi-Finished, and Raw Material balances with mandatory audit justification. Every override appends to the stock ledger and generates a balanced double-entry Journal Entry."
        type="warning"
        showIcon
        icon={<ShieldAlert size={20} />}
      />

      <Card
        title={
          <div className="flex items-center gap-2">
            <Scale className="text-amber-500" size={18} />
            <span className="font-semibold text-base">Post Inventory Override Adjustment</span>
          </div>
        }
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            postingDate: dayjs(),
            movementType: 'adjustment_in',
            reasonCode: 'physical_count_variance',
          }}
          onFinish={handleSubmit}
        >
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item label="Target Company" required>
                <Select
                  value={activeCompanyId}
                  onChange={setActiveCompanyId}
                  options={companies.map((c) => ({ value: c.id, label: `${c.name} (${c.legalName || 'Active'})` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="plantId" label="Plant" rules={[{ required: true }]}>
                <Select
                  value={selectedPlantId}
                  onChange={setSelectedPlantId}
                  options={plants.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
                <Select
                  options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseType})` }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="postingDate" label="Adjustment Posting Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={14}>
              <Form.Item name="itemId" label="Select Item (Finished / Raw / Spares)" rules={[{ required: true }]}>
                <Select
                  showSearch
                  placeholder="Search item code or name..."
                  optionFilterProp="label"
                  onChange={handleItemSelect}
                  options={items.map((it) => ({
                    value: it.id,
                    label: `${it.itemName} (${it.itemCode}) [${it.itemType}]`,
                  }))}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={10}>
              <Form.Item name="movementType" label="Adjustment Direction" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'adjustment_in', label: 'Inward (+) Stock Discovery / Gain' },
                    { value: 'adjustment_out', label: 'Outward (-) Stock Loss / Shrinkage' },
                    { value: 'opening_balance', label: 'Opening Balance Setup (+)' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="quantity" label="Quantity to Adjust" rules={[{ required: true }]}>
                <InputNumber min={0.0001} style={{ width: '100%' }} placeholder="Qty" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="valuationRate" label="Unit Valuation Rate (₹)">
                <InputNumber min={0} prefix="₹" style={{ width: '100%' }} placeholder="Rate per unit" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="reasonCode" label="Audit Reason Code" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'physical_count_variance', label: 'Physical Count Variance' },
                    { value: 'opening_stock_audit', label: 'Opening Stock Audit Setup' },
                    { value: 'damage_write_off', label: 'Damaged Goods Write-Off' },
                    { value: 'expiry_write_off', label: 'Expired Batch Write-Off' },
                    { value: 'production_variance_correction', label: 'Production Variance Correction' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="referenceDocNumber" label="Physical Audit Sheet / Count Reference Number">
            <Input placeholder="e.g. AUDIT-2026-Q3-SHEET-14" />
          </Form.Item>

          <Form.Item
            name="justification"
            label="Mandatory Audit Justification (Minimum 20 characters)"
            rules={[
              { required: true, message: 'Justification is mandatory' },
              { min: 20, message: 'Please provide at least 20 characters explaining the root cause' },
            ]}
          >
            <Input.TextArea
              rows={3}
              placeholder="Explain why this inventory adjustment is being posted (e.g. Annual physical count revealed 5 unrecorded finished crushed stone bags due to scale calibration drift)..."
            />
          </Form.Item>

          <Button
            type="primary"
            danger
            htmlType="submit"
            size="large"
            loading={loading}
            className="w-full font-bold"
          >
            Authorize & Post Stock Adjustment
          </Button>
        </Form>
      </Card>

      <Modal
        open={Boolean(resultModal)}
        onCancel={() => setResultModal(null)}
        footer={[
          <Button key="ok" type="primary" onClick={() => setResultModal(null)}>
            Done
          </Button>,
        ]}
      >
        <div className="py-4 text-center space-y-3">
          <div className="inline-flex p-3 bg-emerald-100 text-emerald-600 rounded-full dark:bg-emerald-950 dark:text-emerald-400">
            <CheckCircle2 size={32} />
          </div>
          <Title level={4} className="m-0">Stock Adjustment Authorized!</Title>
          <Paragraph type="secondary">
            Stock ledger movement and double-entry journal vouchers have been committed atomically.
          </Paragraph>
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-left text-xs space-y-1">
            <div className="flex justify-between">
              <span>Adjustment Ref Number:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-100">{resultModal?.documentNumber}</span>
            </div>
            <div className="flex justify-between">
              <span>Movement Type:</span>
              <Tag color={resultModal?.movementType?.includes('in') ? 'green' : 'red'}>
                {resultModal?.movementType}
              </Tag>
            </div>
            <div className="flex justify-between">
              <span>Adjusted Quantity:</span>
              <span className="font-semibold">{resultModal?.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Valuation Impact:</span>
              <span className="font-semibold">₹{((resultModal?.valuationAmountPaise || 0) / 100).toFixed(2)}</span>
            </div>
            {resultModal?.journalEntryId && (
              <div className="flex justify-between">
                <span>Journal Voucher ID:</span>
                <span className="font-mono text-indigo-600 font-bold">{resultModal?.journalEntryId}</span>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
