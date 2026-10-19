// `warning` is `text-warning-strong`, not `text-warning-foreground` — see the note
// on RISK_CLASS below; this is rendered inside an outline Badge (no filled
// background), so the "-foreground" pairing (dark text for a light chip)
// applies here too.
export const STATUS_TONE_CLASS: Record<string, string> = {
  success: "text-success-strong",
  warning: "text-warning-strong",
  destructive: "text-destructive-strong",
  neutral: "text-foreground",
};

// Was hardcoded Tailwind palette colors (text-green-600/amber-600/red-600),
// which have no dark-mode variant — on a dark background they render as the
// same mid-tone color as in light mode, which reads as low-contrast/hard to
// read instead of "switching to a light color in dark mode".
//
// `medium` is `text-warning-strong` (the token itself — a bright amber, redefined
// per theme in App.css), not `text-warning-foreground`: that second token is
// the dark ink meant to sit ON a full-strength `bg-warning` chip, not to be
// used as a standalone text color. Used bare like this, its dark-mode value
// (oklch lightness 0.22 — nearly black) sits directly on the app's own dark
// background, which is dark-on-dark and exactly this bug, just reintroduced
// by picking the wrong one of the pair.
export const RISK_CLASS: Record<string, string> = {
  low: "text-success-strong",
  medium: "text-warning-strong",
  high: "text-destructive-strong",
};

export const DEFAULT_PER_PAGE = 20;
