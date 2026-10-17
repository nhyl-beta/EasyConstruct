// server/src/jobs/overdue.ts: pure, no I/O (client demo change #8)
//
// What the daily overdue job decides before it touches the database or the mailer: when a workflow stage
// counts as overdue, who would get an email, and which of those were already sent today. Unit-tested in
// overdue.test.ts.

export const DEFAULT_STAGE_OVERDUE_HOURS = 48;

/** Hours a workflow stage may stay current before it is overdue: WORKFLOW_STAGE_OVERDUE_HOURS, default 48. */
export const stageOverdueHours = (raw: string | undefined = process.env.WORKFLOW_STAGE_OVERDUE_HOURS): number => {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 24 * 90 ? n : DEFAULT_STAGE_OVERDUE_HOURS;
};

/** Whole hours since a stage became active (never negative). */
export const stageAgeHours = (since: Date, now: Date): number => Math.max(0, Math.floor((now.getTime() - since.getTime()) / 3_600_000));

/** Workflow stages carry no due date: overdue means the stage has been waiting at least this many hours. */
export const isStageOverdue = (since: Date, now: Date, hours: number = stageOverdueHours()): boolean => stageAgeHours(since, now) >= hours;

/** The Manila calendar day, YYYY-MM-DD: the unit of "once per day". */
export const manilaDay = (now: Date): string => now.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export type OverdueItemType = "rfi" | "stage" | "report";

export interface OverdueItem {
  type: OverdueItemType;
  id: number;
  subject: string;
  /** One line saying what is overdue and for how long, for the email body. */
  detail: string;
  /** Path inside the app the email links to. */
  path: string;
}

export interface Person {
  id: number;
  name: string;
  email: string | null;
  /** The per-user setting "Email me overdue reminders". */
  emailOverdueReminders: boolean;
}

export interface EmailToSend {
  item: OverdueItem;
  to: Person;
}

export const sentKey = (type: OverdueItemType, itemId: number, userId: number, day: string): string => `${type}:${itemId}:${userId}:${day}`;

export interface Plan {
  send: EmailToSend[];
  /** People left out because they switched the reminders off or have no email address. */
  skippedOptOut: number;
  skippedNoEmail: number;
  /** Already emailed today. */
  skippedAlreadySent: number;
}

/**
 * Which emails to send for each item and its recipients. A person gets at most one email per item per day,
 * however many ways they are a recipient (an Admin who is also the assignee), and none if they switched the
 * setting off or have no address.
 */
export const planEmails = (
  candidates: readonly { item: OverdueItem; recipients: readonly Person[] }[],
  alreadySent: ReadonlySet<string>,
  day: string,
): Plan => {
  const plan: Plan = { send: [], skippedOptOut: 0, skippedNoEmail: 0, skippedAlreadySent: 0 };
  const planned = new Set<string>();
  for (const { item, recipients } of candidates) {
    for (const person of recipients) {
      const key = sentKey(item.type, item.id, person.id, day);
      if (planned.has(key)) continue;
      planned.add(key);
      if (!person.emailOverdueReminders) {
        plan.skippedOptOut++;
        continue;
      }
      if (!person.email?.trim()) {
        plan.skippedNoEmail++;
        continue;
      }
      if (alreadySent.has(key)) {
        plan.skippedAlreadySent++;
        continue;
      }
      plan.send.push({ item, to: person });
    }
  }
  return plan;
};

/** The same person listed twice (assignee and Admin) counts once. */
export const uniquePeople = (people: readonly Person[]): Person[] => {
  const seen = new Set<number>();
  return people.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
};

export const buildOverdueEmail = (item: OverdueItem, appUrl: string): { subject: string; text: string; html: string } => {
  const url = `${appUrl.replace(/\/+$/, "")}${item.path}`;
  const subject = `Overdue: ${item.subject}`.replace(/\s+/g, " ").trim().slice(0, 200);
  const text = [item.subject, "", item.detail, "", `Open it in EasyConstruct: ${url}`, "", "You can turn these emails off under Settings > Email me overdue reminders."].join("\n");
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:560px">
<h2 style="margin:0 0 8px">${esc(item.subject)}</h2>
<p>${esc(item.detail)}</p>
<p style="margin:16px 0"><a href="${esc(url)}" style="background:#15803d;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Open in EasyConstruct</a></p>
<p style="color:#6b7280;font-size:12px">You can turn these emails off under Settings, "Email me overdue reminders".</p>
</div>`;
  return { subject, text, html };
};
