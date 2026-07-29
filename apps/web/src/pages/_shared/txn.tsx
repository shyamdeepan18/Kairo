/**
 * Shared scaffold for transaction screens (purchase / sales).
 * Keeps the document screens small + consistent: a controlled line editor,
 * lifecycle action buttons, money helpers, and a themed card style.
 */
import {
  Table, Button, Select, InputNumber, Input, Typography, Space, Popconfirm, Tooltip, theme as antTheme,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, SendOutlined, CheckOutlined, StopOutlined, CloseOutlined,
} from '@ant-design/icons';
import { AmountDisplay } from '../../components/shared/AmountDisplay';

const { Text } = Typography;

export interface DraftLine {
  key: number;
  itemId?: string;
  description?: string;
  quantity: number;
  uom?: string;
  rateRupees: number;
  discountPercent: number;
  taxCodeId?: string;
  poLineId?: string;
  grnLineId?: string;
  quotationLineId?: string;
  soLineId?: string;
}

let seq = 1;
export const newDraftLine = (): DraftLine => ({ key: seq++, quantity: 1, rateRupees: 0, discountPercent: 0 });

export interface RefItem { id: string; itemName: string; itemCode: string; primaryUom: string; defaultTaxCodeId?: string | null }
export interface RefTax { id: string; code: string; gstRateBp: number }

export function computeDraft(qty: number, ratePaise: number, discPct: number, gstBp: number) {
  const gross = Math.round(qty * ratePaise);
  const disc = Math.round((gross * discPct) / 100);
  const net = gross - disc;
  const gst = Math.round((net * gstBp) / 10000);
  const cgst = Math.round(gst / 2);
  const sgst = gst - cgst;
  return { netAmountPaise: net, cgstAmountPaise: cgst, sgstAmountPaise: sgst, taxAmountPaise: gst, totalAmountPaise: net + gst };
}

export function useCardStyle() {
  const { token: dt } = antTheme.useToken();
  return { dt, cardStyle: { background: dt.colorBgContainer, borderRadius: 12, border: `1px solid ${dt.colorBorderSecondary}`, overflow: 'hidden' as const } };
}

export const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...['draft', 'submitted', 'approved', 'rejected', 'cancelled', 'closed']
    .map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))
];
export const apiErr = (e: any): string => e?.response?.data?.error ?? e?.response?.data?.detail ?? 'Request failed';

export function LifecycleButtons({ status, onSubmit, onApprove, onReject, onCancel, disableApprove, disableApproveReason }: {
  status: string; onSubmit?: () => void; onApprove?: () => void; onReject?: () => void; onCancel?: () => void;
  disableApprove?: boolean; disableApproveReason?: string;
}) {
  const approveBtn = <Button type="text" size="small" icon={<CheckOutlined />} disabled={disableApprove}>Approve</Button>;

  return (
    <Space size={4}>
      {status === 'draft' && onSubmit && (
        <Button type="text" size="small" icon={<SendOutlined />} onClick={onSubmit}>Submit</Button>
      )}
      {status === 'submitted' && onApprove && (
        disableApprove ? (
          <Tooltip title={disableApproveReason || 'You cannot approve this'}>
            {approveBtn}
          </Tooltip>
        ) : (
          <Popconfirm title="Approve this document?" onConfirm={onApprove}>
            {approveBtn}
          </Popconfirm>
        )
      )}
      {status === 'submitted' && onReject && (
        <Popconfirm title="Reject this document?" onConfirm={onReject}>
          <Button type="text" size="small" danger icon={<CloseOutlined />}>Reject</Button>
        </Popconfirm>
      )}
      {status === 'approved' && onCancel && (
        <Popconfirm title="Cancel this document?" onConfirm={onCancel}>
          <Button type="text" size="small" danger icon={<StopOutlined />}>Cancel</Button>
        </Popconfirm>
      )}
    </Space>
  );
}

/** Controlled priced-line editor. Set showTax/showDiscount false for request/receipt docs. */
export function LinesEditor({ lines, onChange, items, taxCodes, showTax = true, showDiscount = true, rateLabel = 'Rate ₹' }: {
  lines: DraftLine[]; onChange: (l: DraftLine[]) => void; items: RefItem[]; taxCodes: RefTax[];
  showTax?: boolean; showDiscount?: boolean; rateLabel?: string;
}) {
  const gstBp = (id?: string) => taxCodes.find((t) => t.id === id)?.gstRateBp ?? 0;
  const set = (key: number, patch: Partial<DraftLine>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: number, itemId: string) => {
    const it = items.find((i) => i.id === itemId);
    set(key, { itemId, uom: it?.primaryUom, description: it?.itemName, taxCodeId: showTax ? (it?.defaultTaxCodeId ?? undefined) : undefined });
  };
  const itemOptions = items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.itemName}` }));
  const taxOptions = taxCodes.map((t) => ({ value: t.id, label: `${t.code} (${t.gstRateBp / 100}%)` }));
  const calc = (l: DraftLine) => computeDraft(l.quantity || 0, Math.round((l.rateRupees || 0) * 100), showDiscount ? (l.discountPercent || 0) : 0, showTax ? gstBp(l.taxCodeId) : 0);
  const totals = lines.reduce((a, l) => { const c = calc(l); a.net += c.netAmountPaise; a.tax += c.taxAmountPaise; a.total += c.totalAmountPaise; return a; }, { net: 0, tax: 0, total: 0 });

  return (
    <div className="w-full">
      <div className="border border-slate-200 dark:border-slate-700/50 overflow-x-auto m-0 border-t-0 border-l-0 border-r-0">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-800/80 border-b dark:border-slate-700/50 text-xs text-slate-500 dark:text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3 font-bold min-w-[200px]">Item</th>
              <th className="px-4 py-3 font-bold w-24">Qty</th>
              <th className="px-4 py-3 font-bold w-24">UOM</th>
              <th className="px-4 py-3 font-bold w-28">{rateLabel}</th>
              {showDiscount && <th className="px-4 py-3 font-bold w-24">Disc %</th>}
              {showTax && <th className="px-4 py-3 font-bold w-32">Tax</th>}
              <th className="px-4 py-3 font-bold text-right w-32">Total</th>
              <th className="px-4 py-3 font-bold w-12 text-center">
                <Button type="text" size="small" icon={<PlusOutlined />} onClick={() => onChange([...lines, newDraftLine()])} className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {lines.map((l) => (
              <tr key={l.key} className="bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                <td className="px-4 py-2">
                  <Select showSearch optionFilterProp="label" placeholder="Item" style={{ width: '100%' }} value={l.itemId} options={itemOptions} onChange={(v) => pick(l.key, v)} />
                </td>
                <td className="px-4 py-2">
                  <InputNumber min={0} value={l.quantity} onChange={(v) => set(l.key, { quantity: Number(v) || 0 })} style={{ width: '100%' }} />
                </td>
                <td className="px-4 py-2">
                  <Input value={l.uom} onChange={(e) => set(l.key, { uom: e.target.value })} />
                </td>
                <td className="px-4 py-2">
                  <InputNumber min={0} step={0.01} value={l.rateRupees} onChange={(v) => set(l.key, { rateRupees: Number(v) || 0 })} style={{ width: '100%' }} />
                </td>
                {showDiscount && (
                  <td className="px-4 py-2">
                    <InputNumber min={0} max={100} value={l.discountPercent} onChange={(v) => set(l.key, { discountPercent: Number(v) || 0 })} style={{ width: '100%' }} />
                  </td>
                )}
                {showTax && (
                  <td className="px-4 py-2">
                    <Select allowClear placeholder="Tax" style={{ width: '100%' }} value={l.taxCodeId} options={taxOptions} onChange={(v) => set(l.key, { taxCodeId: v })} />
                  </td>
                )}
                <td className="px-4 py-2 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                  <AmountDisplay paise={calc(l).totalAmountPaise} />
                </td>
                <td className="px-4 py-2 text-center">
                  <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => onChange(lines.filter((x) => x.key !== l.key))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end mt-4 p-4 mr-4 mb-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50">
        <div className="flex gap-8 text-sm">
          <div className="flex flex-col items-end">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Net Amount</span>
            <span className="font-mono text-slate-700 dark:text-slate-300"><AmountDisplay paise={totals.net} /></span>
          </div>
          {showTax && (
            <div className="flex flex-col items-end">
              <span className="text-slate-500 dark:text-slate-400 font-medium">Tax Amount</span>
              <span className="font-mono text-slate-700 dark:text-slate-300"><AmountDisplay paise={totals.tax} /></span>
            </div>
          )}
          <div className="flex flex-col items-end">
            <span className="text-slate-900 dark:text-white font-bold">Total Amount</span>
            <span className="font-mono text-lg font-black text-slate-900 dark:text-white"><AmountDisplay paise={totals.total} /></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Build a backend line body from a draft line (priced docs). */
export function pricedLineBody(l: DraftLine, gstBpOf: (id?: string) => number) {
  const ratePaise = Math.round((l.rateRupees || 0) * 100);
  const c = computeDraft(l.quantity || 0, ratePaise, l.discountPercent || 0, gstBpOf(l.taxCodeId));
  return {
    itemId: l.itemId, description: l.description || undefined, quantity: l.quantity, uom: l.uom ?? 'NOS',
    ratePaise, discountPercent: l.discountPercent || 0, taxCodeId: l.taxCodeId || undefined,
    cgstAmountPaise: c.cgstAmountPaise, sgstAmountPaise: c.sgstAmountPaise,
    poLineId: l.poLineId || undefined, grnLineId: l.grnLineId || undefined, quotationLineId: l.quotationLineId || undefined,
  };
}
