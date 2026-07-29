import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Drawer, Form, DatePicker, Input, Select, Typography, message, Modal, Descriptions, Tooltip, Tabs } from 'antd';
import dayjs from 'dayjs';
import { PlusOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { useAuthStore } from '../../store/auth';
import { purchaseApi, type PurchaseHeader, type Supplier } from '../../api/purchase';
import { mastersApi, type Item } from '../../api/masters';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import {
  useCardStyle, STATUS_OPTIONS, apiErr, LinesEditor, LifecycleButtons,
  newDraftLine, type DraftLine, type RefItem,
} from '../_shared/txn';

const { Title, Text } = Typography;

export function RequisitionsPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { user } = useAuthStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PurchaseHeader[]>([]);
  const [pendingLinesData, setPendingLinesData] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [previewPR, setPreviewPR] = useState<(PurchaseHeader & { lines: any[], purpose?: string }) | null>(null);

  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>();

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    Promise.all([
      purchaseApi.requisitions.list(company.id, statusFilter ? { status: statusFilter } : undefined),
      purchaseApi.requisitions.pendingLines(company.id)
    ])
      .then(([reqRes, plRes]) => {
        setRows(reqRes.data);
        setPendingLinesData(plRes);
      }).catch((e) => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { 
    if (company?.id) {
      mastersApi.listItems(company.id).then(setItems).catch(() => {});
      purchaseApi.suppliers.list(company.id).then((r) => setSuppliers(r.data)).catch(() => {});
    }
  }, [company?.id]);

  const refItems: RefItem[] = items.map((i) => ({ id: i.id, itemName: i.itemName, itemCode: i.itemCode, primaryUom: i.primaryUom, defaultTaxCodeId: i.defaultTaxCodeId }));

  const openNew = () => { form.resetFields(); form.setFieldsValue({ postingDate: dayjs() }); setLines([newDraftLine()]); setDrawer(true); };
  const save = async (v: any) => {
    if (!company?.id || !plant?.id) { message.error('Select company & plant'); return; }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one line'); return; }
    setSaving(true);
    const body = {
      companyId: company.id, plantId: plant.id,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD'), requiredByDate: v.requiredByDate?.format?.('YYYY-MM-DD'),
      purpose: v.purpose,
      lines: valid.map((l) => ({ itemId: l.itemId, description: l.description, quantity: l.quantity, uom: l.uom ?? 'NOS', estimatedRatePaise: Math.round((l.rateRupees || 0) * 100) })),
    };
    try { await purchaseApi.requisitions.create(body); message.success('Requisition created.'); setDrawer(false); load(); }
    catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };
  const act = async (r: PurchaseHeader, a: 'submit' | 'approve' | 'reject') => {
    if (!company?.id) return;
    try {
      const res = await purchaseApi.requisitions.act(r.id, a, company.id);
      if (a === 'approve' && res?.status === 'submitted') {
        message.info('Approval recorded. Waiting for the next level of approval.');
      } else {
        message.success(`Requisition ${a === 'submit' ? 'submitted' : a === 'approve' ? 'approved' : a === 'reject' ? 'rejected' : 'processed'}.`);
      }
      load();
    } catch (e) {
      message.error(apiErr(e));
    }
  };

  const openPreview = async (r: PurchaseHeader) => {
    if (!company?.id) return;
    try {
      const details = await purchaseApi.requisitions.get(company.id, r.id);
      setPreviewPR(details as any);
    } catch (e) { message.error(apiErr(e)); }
  };

  const columns = [
    { title: 'PR Number', dataIndex: 'documentNumber', render: (v: string, r: PurchaseHeader) => <a onClick={() => openPreview(r)}><Text strong style={{ fontFamily: 'monospace', fontSize: 13, color: '#1677ff' }}>{v}</Text></a> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Amount', dataIndex: 'totalAmountPaise', render: (v: number) => `₹${(v / 100).toFixed(2)}` },
    { title: 'Raised By', dataIndex: 'submittedByName', render: (v: string, r: PurchaseHeader) => <Text>{v || r.createdByName || 'Unknown'}</Text> },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" /> },
    { 
      title: '', 
      key: 'a', 
      align: 'right' as const, 
      width: 220, 
      render: (_: any, r: any) => {
        const isMaker = user?.id === r.createdBy || user?.id === r.submittedBy;
        const hasWorkflow = !!r.approvalInfo;
        const isEligible = hasWorkflow ? r.approvalInfo.isEligibleApprover : true;
        const hasApproved = hasWorkflow ? r.approvalInfo.hasApproved : false;
        const canRecall = isMaker && r.status === 'submitted';

        if (hasWorkflow && (!isEligible || hasApproved) && !canRecall) {
          return (
            <div style={{ fontSize: 12 }}>
              {hasApproved ? (
                <Text type="success" style={{ fontStyle: 'italic' }}>Approved. Waiting for next level...</Text>
              ) : (
                <Text type="secondary" style={{ fontStyle: 'italic' }}>Pending: {r.approvalInfo.currentApproverName}</Text>
              )}
            </div>
          );
        }

        return (
          <LifecycleButtons 
            status={r.status} 
            onSubmit={() => act(r, 'submit')} 
            onApprove={isEligible ? (() => act(r, 'approve')) : undefined} 
            onReject={() => act(r, 'reject')} 
            disableApprove={isMaker}
            disableApproveReason={isMaker ? "Maker-Checker rule: You cannot approve a document you created/submitted." : undefined}
          />
        );
      }
    },
  ];

  const pendingLinesColumns = [
    { title: 'PR Number', dataIndex: 'documentNumber', render: (v: string) => <Text strong style={{ fontFamily: 'monospace', fontSize: 13, color: '#1677ff' }}>{v}</Text> },
    { title: 'Date', dataIndex: 'postingDate', render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
    { title: 'Item', render: (_: any, r: any) => items.find(i => i.id === r.itemId)?.itemName || r.description || r.itemId },
    { title: 'Req Qty', dataIndex: 'quantity', align: 'right' as const },
    { title: 'Pending Qty', render: (_: any, r: any) => <Text type="danger" strong>{Number(r.quantity) - Number(r.orderedQty)} {r.uom}</Text>, align: 'right' as const },
    { title: 'Est Rate', dataIndex: 'estimatedRatePaise', render: (v: number) => `₹${(v / 100).toFixed(2)}`, align: 'right' as const },
  ];

  const handleCreatePO = () => {
    if (!selectedSupplierId) { message.error('Please select a supplier'); return; }
    const selectedLines = pendingLinesData.filter(l => selectedRowKeys.includes(l.id));
    const firstPrId = selectedLines[0]?.requisitionId;
    const pr = rows.find(r => r.id === firstPrId);
    navigate('/purchase/orders', { state: { createPoFromLines: selectedLines, supplierId: selectedSupplierId, remarks: pr?.remarks || pr?.purpose } });
    setSupplierModalVisible(false);
  };

  const allReqsTab = (
    <div className="pb-2">
      <div className="mb-4"><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <Table dataSource={rows} columns={columns} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No requisitions yet.' }} />
    </div>
  );

  const pendingLinesTab = (
    <div className="pb-2">
      <div className="mb-4 flex gap-4">
        <Button 
          type="primary" 
          disabled={selectedRowKeys.length === 0} 
          onClick={() => setSupplierModalVisible(true)}
        >
          Create PO ({selectedRowKeys.length})
        </Button>
      </div>
      <Table 
        dataSource={pendingLinesData} 
        columns={pendingLinesColumns} 
        rowKey="id" 
        loading={loading} 
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        pagination={{ pageSize: 20, hideOnSinglePage: true }} 
        locale={{ emptyText: 'No pending lines.' }} 
      />
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex justify-between items-start">
        <div>
          <h2 className="m-0 font-bold text-lg text-slate-900 dark:text-white">Purchase Requisitions</h2>
          <span className="text-[13px] text-slate-500 dark:text-slate-400">{rows.length} requisition{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Requisition</Button>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
        <Tabs items={[
          { key: 'all', label: 'All Requisitions', children: allReqsTab },
          { key: 'pending', label: 'Pending PR Lines', children: pendingLinesTab },
        ]} className="px-4 pt-2" />
      </div>
      <Drawer title="New Requisition" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={820} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div className="flex gap-4">
            <Form.Item name="postingDate" label="Date" rules={[{ required: true, message: 'Required' }]} style={{ width: 180 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="requiredByDate" label="Required By" style={{ width: 180 }}><DatePicker style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="purpose" label="Purpose"><Input.TextArea rows={2} /></Form.Item>
          <LinesEditor lines={lines} onChange={setLines} items={refItems} taxCodes={[]} showTax={false} showDiscount={false} rateLabel="Est ₹" />
        </Form>
      </Drawer>

      <Modal
        title={`PR Preview: ${previewPR?.documentNumber}`}
        open={!!previewPR}
        onCancel={() => setPreviewPR(null)}
        footer={(() => {
          if (!previewPR) return null;
          if (previewPR.status !== 'submitted') {
            return <Button onClick={() => setPreviewPR(null)}>Close</Button>;
          }

          const isMaker = user?.id === previewPR.createdBy || user?.id === previewPR.submittedBy;
          const hasWorkflow = !!(previewPR as any).approvalInfo;
          const isEligible = hasWorkflow ? (previewPR as any).approvalInfo.isEligibleApprover : true;
          const hasApproved = hasWorkflow ? (previewPR as any).approvalInfo.hasApproved : false;
          const canRecall = isMaker;

          if (hasWorkflow && hasApproved) {
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Text type="success" style={{ fontStyle: 'italic' }}>Approved. Waiting for next level...</Text>
                <Button onClick={() => setPreviewPR(null)}>Close</Button>
              </div>
            );
          }

          if (hasWorkflow && !isEligible && !canRecall) {
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <Text type="secondary" style={{ fontStyle: 'italic' }}>Pending: {(previewPR as any).approvalInfo.currentApproverName}</Text>
                <Button onClick={() => setPreviewPR(null)}>Close</Button>
              </div>
            );
          }

          return (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
              {canRecall || isEligible ? (
                <Button onClick={() => { setPreviewPR(null); act(previewPR, 'reject'); }} danger>
                  {isMaker ? 'Recall Requisition' : 'Reject'}
                </Button>
              ) : null}
              {isEligible && (
                isMaker ? (
                  <Tooltip title="Maker-Checker rule: You cannot approve a document you created/submitted.">
                    <Button type="primary" disabled>Approve</Button>
                  </Tooltip>
                ) : (
                  <Button type="primary" onClick={() => { setPreviewPR(null); act(previewPR, 'approve'); }}>Approve</Button>
                )
              )}
              {!isEligible && (
                <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontStyle: 'italic' }}>Pending: {(previewPR as any).approvalInfo.currentApproverName}</Text>
                </div>
              )}
              <Button onClick={() => setPreviewPR(null)}>Close</Button>
            </div>
          );
        })()}
        width={750}
      >
        {previewPR && (
          <div className="flex flex-col gap-4 mt-4">
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="Date">{previewPR.postingDate}</Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={previewPR.status as DocumentStatus} size="small" /></Descriptions.Item>
              <Descriptions.Item label="Raised By">{previewPR.submittedByName || previewPR.createdByName || 'Unknown'}</Descriptions.Item>
              <Descriptions.Item label="Total Amount">₹{(previewPR.totalAmountPaise / 100).toFixed(2)}</Descriptions.Item>
              <Descriptions.Item label="Purpose" span={1}>{previewPR.purpose || '-'}</Descriptions.Item>
              <Descriptions.Item label="Remarks" span={1}>{previewPR.remarks || '-'}</Descriptions.Item>
            </Descriptions>
            <Table
              dataSource={previewPR.lines}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { title: 'Item', render: (_, r: any) => items.find(i => i.id === r.itemId)?.itemName || r.description || r.itemId },
                { title: 'Qty', dataIndex: 'quantity' },
                { title: 'UOM', dataIndex: 'uom' },
                { title: 'Est Rate', dataIndex: 'estimatedRatePaise', render: (v) => `₹${(v / 100).toFixed(2)}` },
                { title: 'Total', render: (_, r: any) => `₹${((r.quantity * (r.estimatedRatePaise || 0)) / 100).toFixed(2)}` }
              ]}
            />
          </div>
        )}
      </Modal>

      <Modal
        title="Create PO - Select Supplier"
        open={supplierModalVisible}
        onCancel={() => setSupplierModalVisible(false)}
        onOk={handleCreatePO}
        okText="Continue"
        okButtonProps={{ disabled: !selectedSupplierId }}
      >
        <div className="py-4">
          <span className="block mb-2 text-slate-700 dark:text-slate-300">Select the supplier you wish to raise a Purchase Order against for the selected lines:</span>
          <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Select a Supplier"
            optionFilterProp="children"
            value={selectedSupplierId}
            onChange={setSelectedSupplierId}
            options={suppliers.map(s => ({ value: s.id, label: s.name }))}
          />
        </div>
      </Modal>
    </div>
  );
}
