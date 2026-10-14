import { CheckSquare, Flag, GitCommitHorizontal, Send } from "lucide-react";
import type { CalendarEventType } from "../types/calendar.types";

export const EVENT_STYLE: Record<CalendarEventType, { label: string; dot: string; icon: typeof Flag }> = {
  milestone: { label: "Milestone", dot: "bg-primary", icon: Flag },
  submission: { label: "Submission", dot: "bg-warning", icon: Send },
  progress: { label: "Progress update", dot: "bg-success", icon: GitCommitHorizontal },
  task: { label: "My task due", dot: "bg-muted-foreground", icon: CheckSquare },
};

/** "in-review" -> "In review". */
export const statusText = (s?: string): string => (s ? s.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase()) : "");
