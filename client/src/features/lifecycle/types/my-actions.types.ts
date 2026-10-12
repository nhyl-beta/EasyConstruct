// K1
export interface MyActionItem {
  projectCode: string;
  projectName: string;
  kind: "gate" | "workflow" | "signal";
  title: string;
  detail: string;
  link: string;
  /** ai-signals E3: only present on kind "signal". */
  severity?: "warn" | "critical";
  /** Fix 3.5: advice on what to do about a signal, with similar resolved issues when there are any. */
  suggestedResolution?: {
    action: string;
    precedents?: { issueCode: string; projectCode: string; title: string; resolutionNotes: string; score: number }[];
  };
  /** Fix 3.5: when the scheduled scan first saw the condition (ISO date-time). */
  firstSeen?: string;
}
