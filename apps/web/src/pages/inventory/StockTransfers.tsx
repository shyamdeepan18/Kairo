import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import {
  Table, Button, Drawer, Form, DatePicker, Select, Input, InputNumber,
  Typography, Space, Popconfirm, message, Tag, Radio, Card, Row, Col,
  Statistic, Tooltip, Divider, Modal, Descriptions,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SwapOutlined, CarOutlined,
  CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, SendOutlined,
  InboxOutlined, ArrowRightOutlined, EditOutlined, RollbackOutlined, StopOutlined,
} from '@ant-design/icons';
import { 
  ArrowLeftRight, Search as LucideSearch, Truck, Clock, ShieldCheck, DollarSign, Layers, Plus 
} from 'lucide-react';
import dayjs from 'dayjs';
import { usePlantStore } from '../../store/plant';
import { inventoryApi, invErr } from '../../api/inventory';
import { mastersApi, type Item } from '../../api/masters';
import { settingsApi, type Warehouse, type Plant } from '../../api/settings';
import { StatusBadge, type DocumentStatus } from '../../components/shared/StatusBadge';
import { AmountDisplay } from '../../components/shared/AmountDisplay';
import { useCardStyle, STATUS_OPTIONS } from '../_shared/txn';

const { Title, Text } = Typography;

interface BatchOption { id: string; batchNumber: string; expiryDate: string | null }

interface DraftLine {
  key: number;
  itemId?: string;
  quantity: number;
  uom?: string;
  valuationRatePaise: number;
  trackingType?: string;
  batchId?: string;
  batches?: BatchOption[];
}

let seq = 1;
const newLine = (): DraftLine => ({ key: seq++, quantity: 1, valuationRatePaise: 0 });

export function StockTransfersPage() {
  const { confirmClose } = useUnsavedChanges();
  const { company, plant } = usePlantStore();
  const { cardStyle } = useCardStyle();
  const [form] = Form.useForm();
  const [rows, setRows] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([newLine()]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [viewRecord, setViewRecord] = useState<any | null>(null);
  const [detailModal, setDetailModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Receive (partial inward) modal
  const [receiveRecord, setReceiveRecord] = useState<any | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [receiving, setReceiving] = useState(false);

  // Watch form fields for dependent warehouse dropdowns
  const selectedFromPlantId = Form.useWatch('fromPlantId', form) ?? plant?.id;
  const selectedToPlantId = Form.useWatch('toPlantId', form) ?? plant?.id;
  const transferType = Form.useWatch('transferType', form) ?? 'direct';

  const load = useCallback(() => {
    if (!company?.id) return;
    setLoading(true);
    inventoryApi.transfers.list(company.id, statusFilter ? { status: statusFilter } : undefined)
      .then((r) => setRows(r.data))
      .catch((e) => message.error(invErr(e)))
      .finally(() => setLoading(false));
  }, [company?.id, statusFilter]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!company?.id) return;
    mastersApi.listItems(company.id).then(setItems).catch(() => {});
    settingsApi.listPlants(company.id).then(setPlants).catch(() => {});
    settingsApi.listWarehouses(company.id).then(setAllWarehouses).catch(() => {});
  }, [company?.id]);

  const setLine = (key: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const handleItemSelect = (key: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    if (it?.trackingType === 'serial') {
      message.warning(`'${it.itemCode}' is serial-tracked and cannot be transferred from this screen yet.`);
      setLine(key, { itemId: undefined, trackingType: undefined, batchId: undefined, batches: undefined });
      return;
    }
    const defaultRate = (it?.purchaseRatePaise ?? 0) / 100;
    setLine(key, {
      itemId,
      uom: it?.primaryUom ?? 'NOS',
      valuationRatePaise: defaultRate,
      trackingType: it?.trackingType,
      batchId: undefined,
      batches: undefined,
    });
    if (it?.trackingType === 'batch' && company?.id) {
      inventoryApi.itemBatches(company.id, itemId)
        .then((batches) => setLine(key, { batches }))
        .catch(() => setLine(key, { batches: [] }));
    }
  };

  const save = async (v: any) => {
    if (!company?.id) { message.error('No company selected'); return; }
    if (v.fromWarehouseId === v.toWarehouseId) {
      message.error('Source and destination warehouse must be different');
      return;
    }
    const valid = lines.filter((l) => l.itemId && l.quantity > 0);
    if (!valid.length) { message.error('Add at least one item line'); return; }
    // Batch-tracked lines must have a batch selected
    const missingBatch = valid.find((l) => l.trackingType === 'batch' && !l.batchId);
    if (missingBatch) {
      const it = items.find((i) => i.id === missingBatch.itemId);
      message.error(`Select a batch for '${it?.itemCode ?? 'the batch-tracked item'}'`);
      return;
    }

    setSaving(true);
    // Plant is derived from the warehouse server-side (A8) — we don't send it.
    const body = {
      fromWarehouseId: v.fromWarehouseId,
      toWarehouseId: v.toWarehouseId,
      postingDate: v.postingDate?.format?.('YYYY-MM-DD') ?? dayjs().format('YYYY-MM-DD'),
      transferType: v.transferType || 'direct',
      reason: v.reason || undefined,
      remarks: v.remarks || undefined,
      vehicleNo: v.vehicleNo || undefined,
      driverName: v.driverName || undefined,
      driverPhone: v.driverPhone || undefined,
      lrNumber: v.lrNumber || undefined,
      lines: valid.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        uom: l.uom ?? 'NOS',
        valuationRatePaise: Math.round((l.valuationRatePaise || 0) * 100),
        batchId: l.batchId || undefined,
      })),
    };

    try {
      if (editingId) {
        await inventoryApi.transfers.update(editingId, body);
        message.success('Draft transfer updated.');
      } else {
        await inventoryApi.transfers.create(body);
        message.success('Stock transfer order created in draft state.');
      }
      setDrawer(false);
      setEditingId(null);
      load();
    } catch (e) {
      message.error(invErr(e));
    } finally {
      setSaving(false);
    }
  };

  const act = async (r: any, action: 'submit' | 'approve' | 'reject' | 'cancel' | 'reopen' | 'delete') => {
    if (!company?.id || busyId) return;
    setBusyId(r.id);
    try {
      if (action === 'submit') await inventoryApi.transfers.submit(r.id, company.id);
      else if (action === 'approve') await inventoryApi.transfers.approve(r.id, company.id);
      else if (action === 'reject') await inventoryApi.transfers.reject(r.id, company.id);
      else if (action === 'cancel') await inventoryApi.transfers.cancel(r.id, company.id);
      else if (action === 'reopen') await inventoryApi.transfers.reopen(r.id, company.id);
      else await inventoryApi.transfers.remove(r.id, company.id);

      const actionLabels: Record<string, string> = {
        submit: 'submitted for approval',
        approve: r.transferType === 'in_transit' ? 'approved & dispatched' : 'approved & posted',
        reject: 'rejected',
        cancel: 'cancelled',
        reopen: 'reopened to draft',
        delete: 'deleted',
      };
      message.success(`Transfer ${actionLabels[action]}.`);
      load();
    } catch (e) {
      message.error(invErr(e));
    } finally {
      setBusyId(null);
    }
  };

  const openEdit = async (r: any) => {
    if (!company?.id) return;
    try {
      const data = await inventoryApi.transfers.get(company.id, r.id);
      setEditingId(data.id);
      form.resetFields();
      form.setFieldsValue({
        transferType: data.transferType,
        fromPlantId: data.fromPlantId ?? data.plantId,
        toPlantId: data.toPlantId ?? data.plantId,
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        postingDate: data.postingDate ? dayjs(data.postingDate) : dayjs(),
        vehicleNo: data.vehicleNo, lrNumber: data.lrNumber,
        driverName: data.driverName, driverPhone: data.driverPhone,
        reason: data.reason,
      });
      setLines((data.lines || []).map((l: any) => {
        const it = items.find((i) => i.id === l.itemId);
        const dl: DraftLine = {
          key: seq++, itemId: l.itemId, quantity: parseFloat(l.quantity),
          uom: l.uom, valuationRatePaise: (l.valuationRatePaise ?? 0) / 100,
          trackingType: it?.trackingType, batchId: l.batchId ?? undefined,
        };
        if (it?.trackingType === 'batch') {
          inventoryApi.itemBatches(company.id!, l.itemId).then((batches) => setLine(dl.key, { batches })).catch(() => {});
        }
        return dl;
      }));
      setDrawer(true);
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const openReceive = async (r: any) => {
    if (!company?.id) return;
    try {
      const data = await inventoryApi.transfers.get(company.id, r.id);
      const init: Record<string, number> = {};
      for (const l of data.lines || []) {
        const remaining = parseFloat(l.quantity) - parseFloat(l.receivedQty ?? '0');
        init[l.id] = remaining > 0 ? remaining : 0;
      }
      setReceiveQty(init);
      setReceiveRecord(data);
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const doReceive = async () => {
    if (!company?.id || !receiveRecord) return;
    const payloadLines = (receiveRecord.lines || [])
      .map((l: any) => ({ lineId: l.id, receivedQty: receiveQty[l.id] ?? 0 }))
      .filter((x: any) => x.receivedQty > 0);
    if (!payloadLines.length) { message.error('Enter a received quantity for at least one line'); return; }
    setReceiving(true);
    try {
      const res = await inventoryApi.transfers.receive(receiveRecord.id, { lines: payloadLines });
      message.success(res.status === 'completed'
        ? 'Transfer fully received & completed.'
        : 'Partial receipt posted; transfer remains dispatched.');
      setReceiveRecord(null);
      load();
    } catch (e) {
      message.error(invErr(e));
    } finally {
      setReceiving(false);
    }
  };

  const viewTransfer = async (id: string) => {
    if (!company?.id) return;
    try {
      const data = await inventoryApi.transfers.get(company.id, id);
      setViewRecord(data);
      setDetailModal(true);
    } catch (e) {
      message.error(invErr(e));
    }
  };

  const plantName = (id?: string) => plants.find((p) => p.id === id)?.name ?? '—';
  const whName = (id?: string) => allWarehouses.find((w) => w.id === id)?.name ?? '—';

  // Metrics
  const totalCount = rows.length;
  const inTransitCount = rows.filter((r) => r.status === 'dispatched').length;
  const pendingCount = rows.filter((r) => r.status === 'submitted').length;
  const totalValuePaise = rows.reduce((s, r) => s + (r.totalAmountPaise || 0), 0);

  const columns = [
    {
      title: 'Document',
      dataIndex: 'documentNumber',
      render: (v: string, r: any) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13, cursor: 'pointer', color: '#1677ff' }} onClick={() => viewTransfer(r.id)}>
            {v}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.postingDate}</Text>
        </Space>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'transferType',
      width: 120,
      render: (v: string) => (
        <Tag color={v === 'in_transit' ? 'cyan' : 'purple'} style={{ borderRadius: 12 }}>
          {v === 'in_transit' ? 'In-Transit (2-Step)' : 'Direct (1-Step)'}
        </Tag>
      ),
    },
    {
      title: 'Route',
      key: 'route',
      render: (_: any, r: any) => {
        const fromP = plantName(r.fromPlantId ?? r.plantId);
        const toP = plantName(r.toPlantId ?? r.plantId);
        const fromW = whName(r.fromWarehouseId);
        const toW = whName(r.toWarehouseId);
        const isInterPlant = r.fromPlantId && r.toPlantId && r.fromPlantId !== r.toPlantId;

        return (
          <Space direction="vertical" size={2}>
            <Space size={6} align="center">
              <Tag color={isInterPlant ? 'blue' : 'default'} style={{ margin: 0 }}>
                {fromP} · {fromW}
              </Tag>
              <ArrowRightOutlined style={{ color: '#8c8c8c', fontSize: 12 }} />
              <Tag color={isInterPlant ? 'geekblue' : 'default'} style={{ margin: 0 }}>
                {toP} · {toW}
              </Tag>
            </Space>
            {r.vehicleNo && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <CarOutlined style={{ marginRight: 4 }} />
                {r.vehicleNo} {r.lrNumber ? `· LR: ${r.lrNumber}` : ''}
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 120,
      render: (v: string) => <StatusBadge status={v as DocumentStatus} size="small" />,
    },
    {
      title: 'Total Value',
      dataIndex: 'totalAmountPaise',
      align: 'right' as const,
      render: (v: number) => <AmountDisplay paise={v} />,
    },
    {
      title: 'Actions',
      key: 'actions',
      align: 'right' as const,
      width: 320,
      render: (_: any, r: any) => {
        const busy = busyId === r.id;
        return (
        <Space size={2} wrap>
          <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => viewTransfer(r.id)}>
            View
          </Button>
          {r.status === 'draft' && (
            <Button type="text" size="small" icon={<EditOutlined />} disabled={busy} onClick={() => openEdit(r)}>
              Edit
            </Button>
          )}
          {r.status === 'draft' && (
            <Button type="text" size="small" icon={<SendOutlined />} loading={busy} onClick={() => act(r, 'submit')}>
              Submit
            </Button>
          )}
          {r.status === 'submitted' && (
            <Popconfirm
              title={r.transferType === 'in_transit' ? 'Approve and dispatch transfer?' : 'Approve and post transfer directly?'}
              description="Maker-checker policy applies. Approval posts stock issue immediately."
              onConfirm={() => act(r, 'approve')}
            >
              <Button type="text" size="small" style={{ color: '#52c41a' }} icon={<CheckCircleOutlined />} loading={busy}>
                {r.transferType === 'in_transit' ? 'Dispatch' : 'Approve'}
              </Button>
            </Popconfirm>
          )}
          {r.status === 'submitted' && (
            <Popconfirm title="Reject this transfer order?" onConfirm={() => act(r, 'reject')}>
              <Button type="text" size="small" danger icon={<CloseCircleOutlined />} disabled={busy}>
                Reject
              </Button>
            </Popconfirm>
          )}
          {r.status === 'dispatched' && (
            <Button type="primary" size="small" icon={<InboxOutlined />} disabled={busy} onClick={() => openReceive(r)}>
              Receive
            </Button>
          )}
          {(r.status === 'draft' || r.status === 'submitted' || r.status === 'dispatched') && (
            <Popconfirm
              title="Cancel this transfer?"
              description={r.status === 'dispatched' ? 'Stock still in transit will be returned to the source warehouse.' : undefined}
              onConfirm={() => act(r, 'cancel')}
            >
              <Button type="text" size="small" danger icon={<StopOutlined />} disabled={busy}>
                Cancel
              </Button>
            </Popconfirm>
          )}
          {r.status === 'rejected' && (
            <Button type="text" size="small" icon={<RollbackOutlined />} loading={busy} onClick={() => act(r, 'reopen')}>
              Reopen
            </Button>
          )}
          {r.status === 'draft' && (
            <Popconfirm title="Delete this draft transfer?" onConfirm={() => act(r, 'delete')}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={busy} />
            </Popconfirm>
          )}
        </Space>
        );
      },
    },
  ];

  const lineColumns = [
    {
      title: 'Item',
      dataIndex: 'itemId',
      width: 260,
      render: (v: string, r: DraftLine) => (
        <Select
          size="small"
          showSearch
          optionFilterProp="label"
          placeholder="Select item..."
          value={v}
          style={{ width: '100%' }}
          onChange={(val) => handleItemSelect(r.key, val)}
          options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }))}
        />
      ),
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      width: 90,
      render: (v: number, r: DraftLine) => (
        <InputNumber
          size="small"
          value={v}
          min={0.0001}
          style={{ width: '100%' }}
          onChange={(val) => setLine(r.key, { quantity: val ?? 0 })}
        />
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uom',
      width: 80,
      render: (v: string, r: DraftLine) => (
        <Input
          size="small"
          value={v}
          style={{ width: '100%' }}
          onChange={(e) => setLine(r.key, { uom: e.target.value })}
        />
      ),
    },
    {
      title: 'Batch',
      dataIndex: 'batchId',
      width: 170,
      render: (v: string, r: DraftLine) =>
        r.trackingType === 'batch' ? (
          <Select
            size="small"
            showSearch
            optionFilterProp="label"
            placeholder="Select batch..."
            value={v}
            style={{ width: '100%' }}
            onChange={(val) => setLine(r.key, { batchId: val })}
            options={(r.batches || []).map((b) => ({
              value: b.id,
              label: b.batchNumber + (b.expiryDate ? ` (exp ${b.expiryDate})` : ''),
            }))}
            notFoundContent="No batches"
          />
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        ),
    },
    {
      title: 'Unit Rate (₹)',
      dataIndex: 'valuationRatePaise',
      width: 120,
      render: (v: number, r: DraftLine) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => setLine(r.key, { valuationRatePaise: val ?? 0 })}
          prefix="₹"
        />
      ),
    },
    {
      title: 'Total (₹)',
      key: 'lineTotal',
      width: 110,
      align: 'right' as const,
      render: (_: any, r: DraftLine) => (
        <Text strong style={{ fontSize: 12 }}>
          ₹{((r.valuationRatePaise || 0) * (r.quantity || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: '',
      key: 'del',
      width: 40,
      render: (_: any, r: DraftLine) => (
        <Popconfirm title="Remove line?" onConfirm={() => setLines((ls) => ls.filter((l) => l.key !== r.key))}>
          <Button type="text" size="small" icon={<DeleteOutlined />} danger />
        </Popconfirm>
      ),
    },
  ];

  const filteredFromWarehouses = allWarehouses.filter(
    (w) => !selectedFromPlantId || w.plantId === selectedFromPlantId
  );
  const filteredToWarehouses = allWarehouses.filter(
    (w) => !selectedToPlantId || w.plantId === selectedToPlantId
  );

  const calculatedTotal = lines.reduce(
    (s, l) => s + (l.valuationRatePaise || 0) * (l.quantity || 0),
    0
  );

  const [searchQuery, setSearchQuery] = useState('');
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter((r) => {
      const doc = (r.documentNumber || '').toLowerCase();
      const fromP = plantName(r.fromPlantId ?? r.plantId).toLowerCase();
      const toP = plantName(r.toPlantId ?? r.plantId).toLowerCase();
      const fromW = whName(r.fromWarehouseId).toLowerCase();
      const toW = whName(r.toWarehouseId).toLowerCase();
      return doc.includes(q) || fromP.includes(q) || toP.includes(q) || fromW.includes(q) || toW.includes(q);
    });
  }, [rows, searchQuery, plants, allWarehouses]);

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 min-h-screen text-slate-900 dark:text-slate-100 transition-colors">
      {/* Universal Page Header Bar */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 dark:text-cyan-400 border border-cyan-100 dark:border-cyan-900/40 rounded-xl">
            <ArrowLeftRight className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Inventory</span>
              <span className="text-xs text-slate-300 dark:text-slate-700">/</span>
              <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">Transfers</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Stock Transfers
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Multi-Plant & Inter-Warehouse stock routing with maker-checker approval & in-transit control
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            type="button"
            onClick={() => {
              setEditingId(null);
              form.resetFields();
              form.setFieldsValue({
                postingDate: dayjs(),
                transferType: 'direct',
                fromPlantId: plant?.id,
                toPlantId: plant?.id,
              });
              setLines([newLine()]);
              setDrawer(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white rounded-xl shadow-xs text-sm font-semibold transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Transfer Order
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
        {/* KPI Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Transfers</span>
              <div className="p-2 bg-cyan-50 dark:bg-cyan-950/60 rounded-xl text-cyan-600 dark:text-cyan-400">
                <ArrowLeftRight className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {totalCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Transfer orders issued
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">In-Transit Freight</span>
              <div className="p-2 bg-blue-50 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                <Truck className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
              {inTransitCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              2-step shipments in motion
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Approvals</span>
              <div className="p-2 bg-amber-50 dark:bg-amber-950/60 rounded-xl text-amber-600 dark:text-amber-400">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
              {pendingCount}
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Awaiting checker release
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Value Moved</span>
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <AmountDisplay paise={totalValuePaise} />
            </div>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Cumulative inventory routed
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <LucideSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input 
              type="text" 
              placeholder="Search document, plant, warehouse..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:text-white"
            />
          </div>
          <Select 
            allowClear 
            placeholder="All Statuses" 
            value={statusFilter} 
            onChange={setStatusFilter} 
            className="w-44" 
            options={STATUS_OPTIONS} 
          />
        </div>

        {/* Table Container Card */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Transfer Order Registry
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Warehouse movements, in-transit shipments, and inter-plant logistics
              </p>
            </div>
            <span className="text-xs font-mono px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-400">
              {filteredRows.length} transfers
            </span>
          </div>

          <Table
            dataSource={filteredRows}
            columns={columns}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: 'No stock transfers found.' }}
          />
        </div>
      </div>

      {/* Create / Edit Transfer Drawer */}
      <Drawer
        title={editingId ? 'Edit Stock Transfer (Draft)' : 'Create Stock Transfer'}
        open={drawer}
        onClose={async () => {
          if (await confirmClose(form)) {
            form.resetFields();
            setEditingId(null);
            setDrawer(false);
          }
        }}
        width={920}
        extra={
          <Button type="primary" loading={saving} onClick={() => form.submit()}>
            {editingId ? 'Save Changes' : 'Create Transfer'}
          </Button>
        }
      >
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false}>
          {/* Transfer Mode */}
          <Form.Item name="transferType" label="Transfer Mode" rules={[{ required: true }]}>
            <Radio.Group buttonStyle="solid">
              <Radio.Button value="direct">Direct Transfer (1-Step Instant)</Radio.Button>
              <Radio.Button value="in_transit">In-Transit Transfer (2-Step Dispatch & Receive)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Card size="small" style={{ background: '#fafafa', marginBottom: 16, borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {transferType === 'direct'
                ? '⚡ Direct Transfer: Approving immediately deducts stock from source warehouse and adds to destination warehouse in one transaction.'
                : '🚚 In-Transit Transfer: Approving dispatches stock (deducted from source warehouse). Stock remains in transit until destination plant verifies and receives it.'}
            </Text>
          </Card>

          {/* Route Section */}
          <div style={{ background: '#f5f7fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>Transfer Route</Text>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="fromPlantId" label="From Plant" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select source plant..."
                    onChange={() => form.setFieldValue('fromWarehouseId', undefined)}
                    options={plants.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  />
                </Form.Item>
                <Form.Item name="fromWarehouseId" label="From Warehouse" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select source warehouse..."
                    options={filteredFromWarehouses.map((w) => ({ value: w.id, label: w.name }))}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="toPlantId" label="To Plant" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select destination plant..."
                    onChange={() => form.setFieldValue('toWarehouseId', undefined)}
                    options={plants.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                  />
                </Form.Item>
                <Form.Item name="toWarehouseId" label="To Warehouse" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select destination warehouse..."
                    options={filteredToWarehouses.map((w) => ({ value: w.id, label: w.name }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Metadata & Logistics */}
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="postingDate" label="Posting Date" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="vehicleNo" label="Vehicle No.">
                <Input placeholder="e.g. MH-12-AB-1234" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="lrNumber" label="LR / Challan No.">
                <Input placeholder="e.g. LR-9872" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="driverName" label="Driver Name">
                <Input placeholder="e.g. Ramesh Kumar" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="driverPhone" label="Driver Phone">
                <Input placeholder="e.g. +91 9876543210" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="reason" label="Reason / Remarks">
            <Input.TextArea rows={2} placeholder="Reason for inventory transfer..." />
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />

          {/* Item Lines */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text strong>Items to Transfer</Text>
            <Button size="small" icon={<PlusOutlined />} onClick={() => setLines((ls) => [...ls, newLine()])}>
              Add Line
            </Button>
          </div>
          <Table dataSource={lines} columns={lineColumns} rowKey="key" pagination={false} size="small" />

          {/* Summary */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <Space size={16} align="baseline">
              <Text type="secondary">Total Estimated Valuation:</Text>
              <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
                ₹{calculatedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </Space>
          </div>
        </Form>
      </Drawer>

      {/* View Transfer Details Modal */}
      <Modal
        title={
          <Space>
            <span>Stock Transfer Details</span>
            {viewRecord && <Tag color="blue">{viewRecord.documentNumber}</Tag>}
            {viewRecord && <StatusBadge status={viewRecord.status} size="small" />}
          </Space>
        }
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        width={800}
        footer={[
          <Button key="close" onClick={() => setDetailModal(false)}>
            Close
          </Button>,
        ]}
      >
        {viewRecord && (
          <div>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Transfer Mode">
                <Tag color={viewRecord.transferType === 'in_transit' ? 'cyan' : 'purple'}>
                  {viewRecord.transferType === 'in_transit' ? 'In-Transit (2-Step)' : 'Direct (1-Step)'}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Posting Date">{viewRecord.postingDate}</Descriptions.Item>
              <Descriptions.Item label="From Route">
                {plantName(viewRecord.fromPlantId ?? viewRecord.plantId)} · {whName(viewRecord.fromWarehouseId)}
              </Descriptions.Item>
              <Descriptions.Item label="To Route">
                {plantName(viewRecord.toPlantId ?? viewRecord.plantId)} · {whName(viewRecord.toWarehouseId)}
              </Descriptions.Item>
              {viewRecord.vehicleNo && <Descriptions.Item label="Vehicle No">{viewRecord.vehicleNo}</Descriptions.Item>}
              {viewRecord.lrNumber && <Descriptions.Item label="LR Number">{viewRecord.lrNumber}</Descriptions.Item>}
              {viewRecord.driverName && <Descriptions.Item label="Driver">{viewRecord.driverName} ({viewRecord.driverPhone || '—'})</Descriptions.Item>}
              {viewRecord.reason && <Descriptions.Item label="Reason" span={2}>{viewRecord.reason}</Descriptions.Item>}
            </Descriptions>

            <Title level={5} style={{ fontSize: 13, marginBottom: 8 }}>Transfer Items</Title>
            <Table
              dataSource={viewRecord.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Item',
                  key: 'item',
                  render: (_: any, l: any) => {
                    const it = items.find((i) => i.id === l.itemId);
                    return it ? `${it.itemCode} — ${it.itemName}` : l.itemId;
                  },
                },
                { title: 'Quantity', dataIndex: 'quantity', width: 90 },
                { title: 'UOM', dataIndex: 'uom', width: 80 },
                {
                  title: 'Rate',
                  dataIndex: 'valuationRatePaise',
                  align: 'right' as const,
                  render: (v: number) => <AmountDisplay paise={v} />,
                },
                {
                  title: 'Amount',
                  dataIndex: 'valuationAmountPaise',
                  align: 'right' as const,
                  render: (v: number) => <AmountDisplay paise={v} />,
                },
              ]}
            />

            {/* Audit Trail */}
            <Divider style={{ margin: '16px 0 8px 0' }} />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Lifecycle Trail: Created at {viewRecord.createdAt ? new Date(viewRecord.createdAt).toLocaleString() : '—'}
              {viewRecord.submittedAt && ` · Submitted at ${new Date(viewRecord.submittedAt).toLocaleString()}`}
              {viewRecord.approvedAt && ` · Approved at ${new Date(viewRecord.approvedAt).toLocaleString()}`}
              {viewRecord.dispatchedAt && ` · Dispatched at ${new Date(viewRecord.dispatchedAt).toLocaleString()}`}
              {viewRecord.receivedAt && ` · Received at ${new Date(viewRecord.receivedAt).toLocaleString()}`}
            </Text>
          </div>
        )}
      </Modal>

      {/* Receive Inward Modal (supports partial receipts) */}
      <Modal
        title={
          <Space>
            <span>Receive Inward Stock</span>
            {receiveRecord && <Tag color="blue">{receiveRecord.documentNumber}</Tag>}
          </Space>
        }
        open={!!receiveRecord}
        onCancel={() => setReceiveRecord(null)}
        width={720}
        okText="Confirm Receipt"
        confirmLoading={receiving}
        onOk={doReceive}
      >
        {receiveRecord && (
          <div>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
              Enter the quantity arriving at {whName(receiveRecord.toWarehouseId)}. Leave a line at 0 to receive it later.
            </Text>
            <Table
              dataSource={receiveRecord.lines || []}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  title: 'Item',
                  key: 'item',
                  render: (_: any, l: any) => {
                    const it = items.find((i) => i.id === l.itemId);
                    return it ? `${it.itemCode} — ${it.itemName}` : l.itemId;
                  },
                },
                { title: 'Dispatched', dataIndex: 'quantity', width: 100, align: 'right' as const },
                {
                  title: 'Received',
                  key: 'recd',
                  width: 100,
                  align: 'right' as const,
                  render: (_: any, l: any) => parseFloat(l.receivedQty ?? '0'),
                },
                {
                  title: 'Remaining',
                  key: 'rem',
                  width: 100,
                  align: 'right' as const,
                  render: (_: any, l: any) => parseFloat(l.quantity) - parseFloat(l.receivedQty ?? '0'),
                },
                {
                  title: 'Receive Now',
                  key: 'recv',
                  width: 130,
                  render: (_: any, l: any) => {
                    const remaining = parseFloat(l.quantity) - parseFloat(l.receivedQty ?? '0');
                    return (
                      <InputNumber
                        size="small"
                        min={0}
                        max={remaining}
                        value={receiveQty[l.id] ?? 0}
                        style={{ width: '100%' }}
                        disabled={remaining <= 0}
                        onChange={(val) => setReceiveQty((q) => ({ ...q, [l.id]: val ?? 0 }))}
                      />
                    );
                  },
                },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}
