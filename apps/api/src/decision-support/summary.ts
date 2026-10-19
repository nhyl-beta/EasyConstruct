// apps/api/src/decision-support/summary.ts: pure, no I/O (objectives fix 3.7)
//
// Turns raw usefulness events into the figures that show whether decision
// support is worth having: how much of it was shown, how much was accepted or
// dismissed, and the acceptance rate by kind. Nothing here changes any advice.

export const EVENT_KINDS = ["assignee", "allocation", "plan-item", "finding"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const EVENT_ACTIONS = ["shown", "accepted", "dismissed"] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

export const KIND_LABEL: Record<EventKind, string> = {
  assignee: "Task assignee suggestions",
  allocation: "Unassigned task allocation",
  "plan-item": "Suggested plan items",
  finding: "Detected issues and suggested actions",
};

export interface EventCount {
  kind: string;
  action: string;
  count: number;
}

export interface KindSummary {
  kind: EventKind;
  label: string;
  shown: number;
  accepted: number;
  dismissed: number;
  /** accepted / (accepted + dismissed): of the advice a person answered, how much they took. null when none was answered. */
  acceptanceRate: number | null;
  /** accepted / shown. null when nothing was shown. */
  acceptedOfShown: number | null;
}

const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

export const summarizeEvents = (counts: EventCount[]): KindSummary[] =>
  EVENT_KINDS.map((kind) => {
    const of = (action: EventAction) => counts.filter((c) => c.kind === kind && c.action === action).reduce((n, c) => n + c.count, 0);
    const shown = of("shown");
    const accepted = of("accepted");
    const dismissed = of("dismissed");
    return {
      kind,
      label: KIND_LABEL[kind],
      shown,
      accepted,
      dismissed,
      acceptanceRate: pct(accepted, accepted + dismissed),
      acceptedOfShown: pct(accepted, shown),
    };
  });

export const isEventKind = (v: string): v is EventKind => (EVENT_KINDS as readonly string[]).includes(v);
export const isEventAction = (v: string): v is EventAction => (EVENT_ACTIONS as readonly string[]).includes(v);
