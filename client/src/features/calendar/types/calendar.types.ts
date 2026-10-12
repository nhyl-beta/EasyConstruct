export type CalendarEventType = "milestone" | "submission" | "progress" | "task";

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  date: string; // ISO date (YYYY-MM-DD)
  title: string;
  projectCode: string;
  projectName: string;
  detail?: string;
  /** Id of the source row (milestone, workflow, phase-history row or task). */
  sourceId: number;
  status?: string;
  /** Names the event involves. */
  involves: string[];
  /** The signed-in user is one of the people the event involves. */
  mine: boolean;
  /** "overdue" milestone or task, or a submission "waiting" for a decision. */
  attention?: "overdue" | "waiting";
}

export type CalendarView = "month" | "week" | "agenda";
