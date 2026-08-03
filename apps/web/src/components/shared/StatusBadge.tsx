/**
 * StatusBadge — colored pill for document / workflow status.
 *
 * Usage:
 *   <StatusBadge status="draft" />
 *   <StatusBadge status="approved" size="small" />
 */

import { Tag } from 'antd';

export type DocumentStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'partial'
  | 'completed'
  | 'closed'
  | 'open'
  | 'overdue'
  | 'dispatched';

const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; color: string }
> = {
  draft:      { label: 'Draft',      color: 'default' },
  submitted:  { label: 'Submitted',  color: 'processing' },
  approved:   { label: 'Approved',   color: 'success' },
  rejected:   { label: 'Rejected',   color: 'error' },
  cancelled:  { label: 'Cancelled',  color: 'default' },
  partial:    { label: 'Partial',    color: 'warning' },
  completed:  { label: 'Completed',  color: 'success' },
  closed:     { label: 'Closed',     color: 'default' },
  open:       { label: 'Open',       color: 'processing' },
  overdue:    { label: 'Overdue',    color: 'error' },
  dispatched: { label: 'Dispatched', color: 'cyan' },
};

interface StatusBadgeProps {
  status: DocumentStatus;
  size?: 'default' | 'small';
}

export function StatusBadge({ status, size = 'default' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, color: 'default' };
  return (
    <Tag
      color={config.color}
      style={{
        fontSize: size === 'small' ? 11 : 12,
        fontWeight: 500,
        padding: size === 'small' ? '0 6px' : '2px 8px',
        borderRadius: 20,
        lineHeight: '20px',
        border: 'none',
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
      }}
    >
      {config.label}
    </Tag>
  );
}
