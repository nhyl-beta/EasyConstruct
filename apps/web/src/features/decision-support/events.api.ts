// Usefulness events for decision support (objectives fix 3.7): was the advice
// shown, taken or dismissed. Fire-and-forget: a failure here must never get in
// the way of what the person is doing, and the server counts each person, item
// and action once however many times it is sent.
import { apiClient } from "@/services/api.client";

export type DecisionSupportKind = "assignee" | "allocation" | "plan-item" | "finding";
export type DecisionSupportAction = "shown" | "accepted" | "dismissed";

export interface DecisionSupportEvent {
  kind: DecisionSupportKind;
  itemKey: string;
  projectCode?: string | null;
  action: DecisionSupportAction;
}

// Keys already sent from this tab, so a re-render does not call the server again.
const sent = new Set<string>();

export function recordDecisionSupport(events: DecisionSupportEvent[]): void {
  const fresh = events.filter((e) => {
    const id = `${e.kind}|${e.itemKey}|${e.action}`;
    if (sent.has(id)) return false;
    sent.add(id);
    return true;
  });
  if (fresh.length === 0) return;
  for (let i = 0; i < fresh.length; i += 50) {
    void apiClient.post("/decision-support/events", { events: fresh.slice(i, i + 50) }).catch(() => undefined);
  }
}

export interface KindSummary {
  kind: DecisionSupportKind;
  label: string;
  shown: number;
  accepted: number;
  dismissed: number;
  acceptanceRate: number | null;
  acceptedOfShown: number | null;
}

export async function getDecisionSupportSummary(): Promise<{ kinds: KindSummary[]; note: string }> {
  const json = (await apiClient.get("/decision-support/summary")) as { data: { kinds: KindSummary[]; note: string } };
  return json.data;
}
