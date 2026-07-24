/**
 * AmountDisplay — formats paise as ₹ rupees with optional debit/credit colouring.
 *
 * Usage:
 *   <AmountDisplay paise={150000} />                 → ₹1,500.00 (neutral)
 *   <AmountDisplay paise={150000} variant="debit" />  → green
 *   <AmountDisplay paise={150000} variant="credit" /> → red
 *   <AmountDisplay paise={-500} showSign />           → ₹-5.00
 */

interface AmountDisplayProps {
  /** Amount in paise (integer). Pass 0 to show ₹0.00 */
  paise: number;
  /** Visual colouring — debit = green, credit = red, neutral = inherit */
  variant?: 'debit' | 'credit' | 'neutral';
  /** Show + prefix for positive numbers */
  showSign?: boolean;
  /** Extra CSS class */
  className?: string;
  /** Font weight (default 500) */
  bold?: boolean;
}

const FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function AmountDisplay({
  paise,
  variant = 'neutral',
  showSign = false,
  className,
  bold = false,
}: AmountDisplayProps) {
  const rupees = paise / 100;
  let formatted = FORMATTER.format(Math.abs(rupees));

  // Build prefix: sign + ₹ symbol already in Intl output
  if (paise < 0) {
    formatted = '−' + formatted; // use proper minus sign
  } else if (showSign && paise > 0) {
    formatted = '+' + formatted;
  }

  const colorVar =
    variant === 'debit'
      ? 'var(--color-debit)'
      : variant === 'credit'
      ? 'var(--color-credit)'
      : undefined;

  return (
    <span
      className={className}
      style={{
        color: colorVar,
        fontWeight: bold ? 600 : 500,
        fontVariantNumeric: 'tabular-nums',
        fontFamily: '"Inter", monospace',
        whiteSpace: 'nowrap',
      }}
    >
      {formatted}
    </span>
  );
}
