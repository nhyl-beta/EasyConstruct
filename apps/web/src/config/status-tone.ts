export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "ai"
  | "brand"
  | "neutral";

/**
 * The one badge colour scheme, taken from the Alerts severity badges
 * (features/lifecycle/components/DecisionSupportSection.tsx): tinted ground,
 * matching border, darker text of the same hue. Every status / priority /
 * severity pill in the app takes its colours from here.
 */
export const STATUS_TONES: Record<StatusTone, string> = {
  success: "border-success/30 bg-success/10 text-success-strong",
  warning: "border-warning/30 bg-warning/10 text-warning-strong",
  danger: "border-destructive/30 bg-destructive/10 text-destructive-strong",
  info: "border-info/30 bg-info/10 text-info-strong",
  ai: "bg-ai-soft text-ai border-transparent",
  brand: "bg-primary-soft text-primary-strong border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
};
