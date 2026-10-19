// EasyConstruct is a Philippine construction system — every amount in the
// product is pesos. Keep the default here rather than per-screen, so a screen
// that forgets to pass a currency still renders ₱ and not $.
export const DEFAULT_CURRENCY = "PHP";
export const CURRENCY_SYMBOL = "₱";

// en-PH renders PHP as "₱1,234.00"; en-US renders it as "PHP 1,234.00".
const LOCALE = "en-PH";

export function formatCurrency(
  amount: number,
  currency: string = DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Compact form for KPI tiles. Scales the unit to the amount so a ₱184,000
 * payroll line doesn't render as "₱0.18M".
 * e.g. 12_400_000 -> "₱12.40M", 184_000 -> "₱184.0K", 950 -> "₱950"
 */
export function formatCompactCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  if (abs >= 1_000_000_000) return `${sign}${CURRENCY_SYMBOL}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${CURRENCY_SYMBOL}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${CURRENCY_SYMBOL}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${CURRENCY_SYMBOL}${abs.toFixed(0)}`;
}

/** Chart axis / tooltip: whole millions with one decimal, e.g. 15_800_000 -> "₱15.8M". Pesos in, pesos kept in the data. */
export function formatMillions(amount: number): string {
  return `${amount < 0 ? "-" : ""}${CURRENCY_SYMBOL}${(Math.abs(amount) / 1_000_000).toFixed(1)}M`;
}

/** Chart axis tick that scales with the amount: ₱950, ₱12k, ₱1.5M. */
export function formatAxisCurrency(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}${CURRENCY_SYMBOL}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${CURRENCY_SYMBOL}${Math.round(abs / 1_000)}k`;
  return `${sign}${CURRENCY_SYMBOL}${Math.round(abs)}`;
}

/** e.g. formatPercent(0.862) -> "86.2%" */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
