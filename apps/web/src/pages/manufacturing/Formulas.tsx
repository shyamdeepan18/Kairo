import { useState, useEffect, useCallback } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { Table, Button, Drawer, Form, Input, Select, InputNumber, Typography, Descriptions, message, Tabs } from 'antd';
import { PlusOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import { usePlantStore } from '../../store/plant';
import { manufacturingApi, type FormulaHeader, type WorkCenter } from '../../api/manufacturing';
import { mastersApi, type Item } from '../../api/masters';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { useCardStyle, STATUS_OPTIONS, apiErr, LifecycleButtons } from '../_shared/txn';

const { Title, Text } = Typography;

interface DraftInput { key: number; itemId?: string; quantity: number; uom?: string; wastagePercent: number; isOptional: boolean; description?: string; }
interface DraftOutput { key: number; itemId?: string; expectedQty: number; uom?: string; outputType: 'main' | 'by_product' | 'scrap'; allocationPercent: number; description?: string; }
interface DraftOp { key: number; operationNumber: number; name: string; workCenterId?: string; setupTimeMin: number; runTimePerUnitMin: number; description?: string; }

let s1 = 1, s2 = 1, s3 = 1;
const newIn = (): DraftInput => ({ key: s1++, quantity: 1, wastagePercent: 0, isOptional: false });
const newOut = (): DraftOutput => ({ key: s2++, expectedQty: 1, outputType: 'main', allocationPercent: 100 });
const newOp = (): DraftOp => ({ key: s3++, operationNumber: s3 * 10, name: '', setupTimeMin: 0, runTimePerUnitMin: 0 });

export function FormulasPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<FormulaHeader[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewing, setViewing] = useState<any | null>(null);

  const [inputs, setInputs] = useState<DraftInput[]>([newIn()]);
  const [outputs, setOutputs] = useState<DraftOutput[]>([newOut()]);
  const [ops, setOps] = useState<DraftOp[]>([newOp()]);

  const itemName = (id?: string) => items.find(i => i.id === id)?.itemName ?? '—';
  const wcName = (id?: string) => workCenters.find(w => w.id === id)?.name ?? '—';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    manufacturingApi.formulas.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then(r => setRows(r.data)).catch(e => message.error(apiErr(e))).finally(() => setLoading(false));
  }, [company?.id, statusFilter]);
  
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    manufacturingApi.workCenters.list(company.id).then(r => setWorkCenters(r.data)).catch(() => {});
  }, [company?.id]);

  const openNew = () => { form.resetFields(); setInputs([newIn()]); setOutputs([newOut()]); setOps([newOp()]); setDrawer(true); };
  
  const save = async (v: any) => {
    if (!company?.id) { message.error('Select company'); return; }
    const validIn = inputs.filter(i => i.itemId && i.quantity > 0);
    const validOut = outputs.filter(o => o.itemId && o.expectedQty > 0);
    if (!validIn.length || !validOut.length) { message.error('Requires at least one input and one output'); return; }
    
    setSaving(true);
    const body = {
      companyId: company.id, formulaCode: v.formulaCode, formulaName: v.formulaName,
      formulaType: v.formulaType ?? 'production', outputItemId: v.outputItemId,
      batchSizeQty: v.batchSizeQty, batchSizeUom: v.batchSizeUom,
      inputs: validIn.map(i => ({ itemId: i.itemId, quantity: i.quantity, uom: i.uom ?? 'NOS', wastagePercent: i.wastagePercent, isOptional: i.isOptional, description: i.description })),
      outputs: validOut.map(o => ({ itemId: o.itemId, expectedQty: o.expectedQty, uom: o.uom ?? 'NOS', outputType: o.outputType, allocationPercent: o.allocationPercent, description: o.description })),
      operations: ops.filter(o => o.name).map(o => ({ operationNumber: o.operationNumber, name: o.name, workCenterId: o.workCenterId, setupTimeMin: o.setupTimeMin, runTimePerUnitMin: o.runTimePerUnitMin, description: o.description }))
    };
    try {
      await manufacturingApi.formulas.create(body);
      message.success('Formula created.'); setDrawer(false); load();
    } catch (e) { message.error(apiErr(e)); } finally { setSaving(false); }
  };

  const act = async (r: FormulaHeader, a: 'submit' | 'approve' | 'reject' | 'cancel') => {
    if (!company?.id) return;
    try { await manufacturingApi.formulas.act(r.id, a, company.id); message.success(`Formula ${a}d.`); load(); } catch (e) { message.error(apiErr(e)); }
  };
  
  const openView = async (row: FormulaHeader) => {
    if (!company?.id) return;
    try { setViewing(await manufacturingApi.formulas.get(company.id, row.id)); } catch (e) { message.error(apiErr(e)); }
  };

  const itemOptions = items.map(i => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }));
  const wcOptions = workCenters.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }));

  return (
    <div>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
        <div><Title level={4} style={{ margin: 0, fontWeight: 700 }}>Formulas (BOM)</Title><Text type="secondary" style={{ fontSize: 13 }}>Bill of materials and operations routing.</Text></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openNew}>New Formula</Button>
      </div>
      <div style={{ marginBottom: 16 }}><Select allowClear placeholder="All statuses" value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 180 }} options={STATUS_OPTIONS} /></div>
      <div style={cardStyle}>
        <Table dataSource={rows} rowKey="id" loading={loading} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: 'No formulas yet.' }}
          columns={[
            { title: 'Formula Code', dataIndex: 'formulaCode', render: (v: string) => <Text strong style={{ fontFamily: 'monospace' }}>{v}</Text> },
            { title: 'Name', dataIndex: 'formulaName' },
            { title: 'Type', dataIndex: 'formulaType' },
            { title: 'Main Item', key: 'i', render: (_, r) => itemName(r.outputItemId) },
            { title: 'Status', dataIndex: 'status', render: v => <StatusBadge status={v as DocumentStatus} size="small" /> },
            { title: '', key: 'a', align: 'right', width: 260, render: (_, r) => (
              <span style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', alignItems: 'center' }}>
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openView(r)} />
                <LifecycleButtons status={r.status} onSubmit={() => act(r, 'submit')} onApprove={() => act(r, 'approve')} onReject={() => act(r, 'reject')} onCancel={() => act(r, 'cancel')} />
              </span>
            )}
          ]} />
      </div>

      <Drawer title="New Formula" open={drawer} onClose={async () => { if (await confirmClose(form)) { form.resetFields(); setDrawer(false); } }} width={960} extra={<Button type="primary" loading={saving} onClick={() => form.submit()}>Create</Button>}>
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="formulaCode" label="Code" rules={[{ required: true }]} style={{ width: 140 }}><Input /></Form.Item>
            <Form.Item name="formulaName" label="Name" rules={[{ required: true }]} style={{ flex: 1 }}><Input /></Form.Item>
            <Form.Item name="formulaType" label="Type" initialValue="production" style={{ width: 160 }}><Select options={[{value:'production',label:'Production'},{value:'disassembly',label:'Disassembly'},{value:'rework',label:'Rework'}]} /></Form.Item>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Form.Item name="outputItemId" label="Main Output Item" rules={[{ required: true }]} style={{ flex: 1 }}><Select showSearch optionFilterProp="label" options={itemOptions} /></Form.Item>
            <Form.Item name="batchSizeQty" label="Batch Qty" rules={[{ required: true }]} style={{ width: 120 }}><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="batchSizeUom" label="Batch UOM" rules={[{ required: true }]} style={{ width: 100 }}><Input /></Form.Item>
          </div>

          <Tabs defaultActiveKey="1" items={[
            {
              key: '1', label: 'Inputs (Raw Materials)', children: (
                <div>
                  <Table dataSource={inputs} rowKey="key" pagination={false} size="small"
                    columns={[
                      { title: 'Item', render: (_, l) => <Select showSearch optionFilterProp="label" value={l.itemId} onChange={v => setInputs(ls => ls.map(x => x.key === l.key ? {...x, itemId: v, uom: items.find(i=>i.id===v)?.primaryUom} : x))} options={itemOptions} style={{ width: '100%' }} /> },
                      { title: 'Qty', width: 90, render: (_, l) => <InputNumber min={0} value={l.quantity} onChange={v => setInputs(ls => ls.map(x => x.key === l.key ? {...x, quantity: Number(v)||0} : x))} /> },
                      { title: 'UOM', width: 80, render: (_, l) => <Input value={l.uom} onChange={e => setInputs(ls => ls.map(x => x.key === l.key ? {...x, uom: e.target.value} : x))} /> },
                      { title: 'Wastage %', width: 100, render: (_, l) => <InputNumber min={0} max={100} value={l.wastagePercent} onChange={v => setInputs(ls => ls.map(x => x.key === l.key ? {...x, wastagePercent: Number(v)||0} : x))} /> },
                      { title: '', width: 36, render: (_, l) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setInputs(ls => ls.filter(x => x.key !== l.key))} /> }
                    ]} />
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setInputs(ls => [...ls, newIn()])} style={{ marginTop: 8 }}>Add Input</Button>
                </div>
              )
            },
            {
              key: '2', label: 'Outputs (By-products/Scrap)', children: (
                <div>
                  <Table dataSource={outputs} rowKey="key" pagination={false} size="small"
                    columns={[
                      { title: 'Item', render: (_, l) => <Select showSearch optionFilterProp="label" value={l.itemId} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, itemId: v, uom: items.find(i=>i.id===v)?.primaryUom} : x))} options={itemOptions} style={{ width: '100%' }} /> },
                      { title: 'Type', width: 120, render: (_, l) => <Select value={l.outputType} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, outputType: v} : x))} options={[{value:'main',label:'Main'},{value:'by_product',label:'By-Product'},{value:'scrap',label:'Scrap'}]} /> },
                      { title: 'Expected Qty', width: 110, render: (_, l) => <InputNumber min={0} value={l.expectedQty} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, expectedQty: Number(v)||0} : x))} /> },
                      { title: 'UOM', width: 80, render: (_, l) => <Input value={l.uom} onChange={e => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, uom: e.target.value} : x))} /> },
                      { title: 'Cost Alloc %', width: 110, render: (_, l) => <InputNumber min={0} max={100} value={l.allocationPercent} onChange={v => setOutputs(ls => ls.map(x => x.key === l.key ? {...x, allocationPercent: Number(v)||0} : x))} /> },
                      { title: '', width: 36, render: (_, l) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setOutputs(ls => ls.filter(x => x.key !== l.key))} /> }
                    ]} />
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setOutputs(ls => [...ls, newOut()])} style={{ marginTop: 8 }}>Add Output</Button>
                </div>
              )
            },
            {
              key: '3', label: 'Operations (Routing)', children: (
                <div>
                  <Table dataSource={ops} rowKey="key" pagination={false} size="small"
                    columns={[
                      { title: 'Seq', width: 70, render: (_, l) => <InputNumber min={1} value={l.operationNumber} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, operationNumber: Number(v)||0} : x))} /> },
                      { title: 'Operation Name', render: (_, l) => <Input value={l.name} onChange={e => setOps(ls => ls.map(x => x.key === l.key ? {...x, name: e.target.value} : x))} /> },
                      { title: 'Work Centre', render: (_, l) => <Select showSearch allowClear optionFilterProp="label" value={l.workCenterId} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, workCenterId: v} : x))} options={wcOptions} style={{ width: '100%' }} /> },
                      { title: 'Setup Min', width: 100, render: (_, l) => <InputNumber min={0} value={l.setupTimeMin} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, setupTimeMin: Number(v)||0} : x))} /> },
                      { title: 'Run/Unit Min', width: 110, render: (_, l) => <InputNumber min={0} step={0.1} value={l.runTimePerUnitMin} onChange={v => setOps(ls => ls.map(x => x.key === l.key ? {...x, runTimePerUnitMin: Number(v)||0} : x))} /> },
                      { title: '', width: 36, render: (_, l) => <Button type="text" danger icon={<DeleteOutlined />} onClick={() => setOps(ls => ls.filter(x => x.key !== l.key))} /> }
                    ]} />
                  <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={() => setOps(ls => [...ls, newOp()])} style={{ marginTop: 8 }}>Add Operation</Button>
                </div>
              )
            }
          ]} />
        </Form>
      </Drawer>

      <Drawer title={viewing?.documentNumber ?? 'Formula'} open={!!viewing} onClose={() => setViewing(null)} width={800}>
        {viewing && (
          <>
            <Descriptions column={2} size="small" styles={{ label: { width: 130 } }}>
              <Descriptions.Item label="Name">{viewing.formulaName} ({viewing.formulaCode})</Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={viewing.status} size="small" /></Descriptions.Item>
              <Descriptions.Item label="Main Output">{itemName(viewing.outputItemId)}</Descriptions.Item>
              <Descriptions.Item label="Batch Size">{viewing.batchSizeQty} {viewing.batchSizeUom}</Descriptions.Item>
            </Descriptions>
            
            <Title level={5} style={{ marginTop: 24, fontSize: 14 }}>Inputs</Title>
            <Table size="small" pagination={false} dataSource={viewing.inputs ?? []} rowKey="id"
              columns={[{ title: 'Item', render: (_, r: any) => itemName(r.itemId) }, { title: 'Qty', dataIndex: 'quantity', align: 'right' }, { title: 'UOM', dataIndex: 'uom', width: 80 }]} />
              
            <Title level={5} style={{ marginTop: 24, fontSize: 14 }}>Outputs</Title>
            <Table size="small" pagination={false} dataSource={viewing.outputs ?? []} rowKey="id"
              columns={[{ title: 'Item', render: (_, r: any) => itemName(r.itemId) }, { title: 'Type', dataIndex: 'outputType' }, { title: 'Qty', dataIndex: 'expectedQty', align: 'right' }, { title: 'Alloc %', dataIndex: 'allocationPercent', align: 'right' }]} />
              
            <Title level={5} style={{ marginTop: 24, fontSize: 14 }}>Operations</Title>
            <Table size="small" pagination={false} dataSource={viewing.operations ?? []} rowKey="id"
              columns={[{ title: 'Seq', dataIndex: 'operationNumber', width: 60 }, { title: 'Name', dataIndex: 'name' }, { title: 'Work Centre', render: (_, r: any) => wcName(r.workCenterId) }, { title: 'Run Time/Unit', dataIndex: 'runTimePerUnitMin', align: 'right' }]} />
          </>
        )}
      </Drawer>
    </div>
  );
}
