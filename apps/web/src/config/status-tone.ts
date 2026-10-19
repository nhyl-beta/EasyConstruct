export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "brand"
  | "neutral";

/** Soft ground, strong text (>= 5.7:1 in both themes). The word carries the meaning. */
export const STATUS_TONES: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-strong border-transparent",
  warning: "bg-warning-soft text-warning-strong border-transparent",
  danger: "bg-destructive-soft text-destructive-strong border-transparent",
  info: "bg-info-soft text-info-strong border-transparent",
  ai: "bg-ai-soft text-ai border-transparent",
  brand: "bg-primary-soft text-primary-strong border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
};
