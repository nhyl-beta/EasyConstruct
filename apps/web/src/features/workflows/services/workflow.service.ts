import { formatCompactCurrency, formatCurrency } from "@/lib/format-currency";

export const WorkflowFormatService = {
  amount(amount: string | null): string {
    if (!amount) return "—";
    const n = Number(amount);
    if (Number.isNaN(n)) return "—";
    return n >= 1_000_000 ? formatCompactCurrency(n) : formatCurrency(n);
  },

  avgDuration(hours: string): string {
    const h = Number(hours);
    if (Number.isNaN(h)) return "—";
    if (h < 24) return `${h.toFixed(1)}h`;
    return `${(h / 24).toFixed(1)} days`;
  },
};