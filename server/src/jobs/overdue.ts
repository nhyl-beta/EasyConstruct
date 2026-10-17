// server/src/jobs/overdue.ts: pure, no I/O (client demo change #8, daily summary email)
//
// What the daily overdue job decides before it touches the database or the mailer: when a workflow stage
// counts as overdue, who gets a summary email, what is in it, and which items were already sent. Unit-tested in
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
  /** Project code shown at the start of the item's line in the summary. */
  projectCode: string;
  /** How late it is, for the summary line: "3 days overdue", "waiting 72 h", "missing for Oct 12 to 18". */
  late: string;
  /** One line saying what is overdue and for how long (used by the in-app alert). */
  detail: string;
  /** Path inside the app the summary links to. */
  path: string;
}

export interface Person {
  id: number;
  name: string;
  email: string | null;
  /** The per-user setting "Email me overdue reminders". */
  emailOverdueReminders: boolean;
  /** The user's role. An Admin gets their own items plus an overview of everything else. */
  role?: string;
}

export const sentKey = (type: OverdueItemType | "digest", itemId: number, userId: number, day: string): string => `${type}:${itemId}:${userId}:${day}`;

/** The per-person, per-day record that today's summary already went out. */
export const digestKey = (userId: number, today: string): string => sentKey("digest", 0, userId, today);

// ── Addresses that can never receive mail ──────────────────────────────────

export const DEFAULT_SKIP_DOMAINS = ["easyconstruct.demo", "example.com", "example.org", "example.net"] as const;
const RESERVED_TLDS = ["test", "example", "invalid", "localhost"] as const;

/** MAIL_SKIP_DOMAINS: comma separated, case-insensitive. Unset means the defaults; set to nothing means only the reserved TLDs. */
export const skipDomainsFromEnv = (raw: string | undefined = process.env.MAIL_SKIP_DOMAINS): string[] =>
  raw === undefined
    ? [...DEFAULT_SKIP_DOMAINS]
    : raw
        .split(",")
        .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean);

/** Demo and test addresses: a skipped domain or any subdomain of it, or a reserved top-level domain. */
export const isUndeliverableEmail = (email: string, skipDomains: readonly string[] = skipDomainsFromEnv()): boolean => {
  const clean = email.trim().toLowerCase();
  const at = clean.lastIndexOf("@");
  if (at < 0) return true;
  const domain = clean.slice(at + 1);
  if (!domain) return true;
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  if ((RESERVED_TLDS as readonly string[]).includes(tld)) return true;
  return skipDomains.some((d) => domain === d || domain.endsWith(`.${d}`));
};

// ── Planning ───────────────────────────────────────────────────────────────

/**
 * An item with its recipients and the day its "already sent" record is kept under (today, or a period's start).
 * `recipients` are the real owners (assignee, raiser, stage approver, PM). `admins` are Admins who are on the
 * list only because they are Admin: they see the item counted in their overview, not listed. An Admin who is
 * also an owner is listed in full.
 */
export interface DigestCandidate {
  item: OverdueItem;
  recipients: readonly Person[];
  admins?: readonly Person[];
  day: string;
}

export interface DigestItem {
  item: OverdueItem;
  day: string;
}

/** One project's line in an Admin's overview: how many items of each kind are overdue there. */
export interface OverviewProject {
  projectCode: string;
  rfi: number;
  stage: number;
  report: number;
}

export interface Digest {
  person: Person;
  /** The person's own items, listed in full. */
  items: DigestItem[];
  /** Admins only: everything else overdue, counted by project (most first). Not recorded per item. */
  overview?: OverviewProject[];
}

export const overviewTotal = (o: OverviewProject): number => o.rfi + o.stage + o.report;

export interface DigestPlan {
  digests: Digest[];
  /** Items left out because the person switched the reminders off, has no email, or has a demo/test address. */
  skippedOptOut: number;
  skippedNoEmail: number;
  skippedUndeliverable: number;
  /** Items already emailed, or belonging to a person whose summary for today already went out. */
  skippedAlreadySent: number;
}

/**
 * Groups what is overdue into one summary per person. A person is left out if they switched the setting off,
 * have no address or a demo/test one, or already had today's summary; an item they were already emailed about
 * is dropped. The same person listed twice for an item counts once.
 */
export const planDigests = (
  candidates: readonly DigestCandidate[],
  alreadySent: ReadonlySet<string>,
  today: string,
  skipDomains: readonly string[] = skipDomainsFromEnv(),
): DigestPlan => {
  const plan: DigestPlan = { digests: [], skippedOptOut: 0, skippedNoEmail: 0, skippedUndeliverable: 0, skippedAlreadySent: 0 };
  const byPerson = new Map<number, Digest>();
  const overviews = new Map<number, Map<string, OverviewProject>>();
  const seen = new Set<string>();
  const skipReason = (person: Person): "optOut" | "noEmail" | "undeliverable" | null =>
    !person.emailOverdueReminders ? "optOut" : !person.email?.trim() ? "noEmail" : isUndeliverableEmail(person.email, skipDomains) ? "undeliverable" : null;
  const count = (reason: "optOut" | "noEmail" | "undeliverable") => {
    if (reason === "optOut") plan.skippedOptOut++;
    else if (reason === "noEmail") plan.skippedNoEmail++;
    else plan.skippedUndeliverable++;
  };
  for (const { item, recipients, admins = [], day } of candidates) {
    // Admins who are not owners: counted in the overview. Nothing is recorded per item, only the daily digest key.
    for (const admin of admins) {
      if (recipients.some((r) => r.id === admin.id)) continue;
      const key = `overview:${item.type}:${item.id}:${admin.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = skipReason(admin);
      if (reason) count(reason);
      else if (alreadySent.has(digestKey(admin.id, today))) plan.skippedAlreadySent++;
      else {
        if (!byPerson.has(admin.id)) byPerson.set(admin.id, { person: admin, items: [] });
        const projects = overviews.get(admin.id) ?? new Map<string, OverviewProject>();
        const line = projects.get(item.projectCode) ?? { projectCode: item.projectCode, rfi: 0, stage: 0, report: 0 };
        line[item.type]++;
        projects.set(item.projectCode, line);
        overviews.set(admin.id, projects);
      }
    }
    for (const person of recipients) {
      const key = sentKey(item.type, item.id, person.id, day);
      if (seen.has(key)) continue;
      seen.add(key);
      const reason = skipReason(person);
      if (reason) count(reason);
      else if (alreadySent.has(digestKey(person.id, today)) || alreadySent.has(key)) plan.skippedAlreadySent++;
      else {
        const digest = byPerson.get(person.id) ?? { person, items: [] };
        digest.person = person;
        digest.items.push({ item, day });
        byPerson.set(person.id, digest);
      }
    }
  }
  for (const [id, projects] of overviews) {
    byPerson.get(id)!.overview = [...projects.values()].sort((a, b) => overviewTotal(b) - overviewTotal(a) || a.projectCode.localeCompare(b.projectCode));
  }
  plan.digests = [...byPerson.values()];
  return plan;
};

/** The same person listed twice (assignee and Admin) counts once. */
export const uniquePeople = (people: readonly Person[]): Person[] => {
  const seen = new Set<number>();
  return people.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
};

// ── The summary email ──────────────────────────────────────────────────────

export const MAX_LINES_PER_SECTION = 25;

const SECTIONS: { type: OverdueItemType; title: string }[] = [
  { type: "rfi", title: "RFI/RFA overdue" },
  { type: "stage", title: "Approvals waiting" },
  { type: "report", title: "Missing reports" },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** The line already starts with the project code, so a subject that begins "DEMO-S4: " does not repeat it. */
export const subjectWithoutCode = (subject: string, projectCode: string): string => {
  const clean = oneLine(subject);
  const prefix = `${projectCode}: `;
  return clean.startsWith(prefix) && clean.length > prefix.length ? clean.slice(prefix.length) : clean;
};

export const MAX_OVERVIEW_PROJECTS = 15;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const digestSubject = (count: number): string => `EasyConstruct: ${count} overdue ${count === 1 ? "item needs" : "items need"} your attention`;

/** Admin subject: their own items and everything else, each counted plainly. */
export const adminDigestSubject = (own: number, others: number, projects: number): string => {
  if (others === 0) return digestSubject(own);
  const acrossProjects = `across ${plural(projects, "project", "projects")}`;
  return own === 0
    ? `EasyConstruct: ${plural(others, "item", "items")} overdue ${acrossProjects}`
    : `EasyConstruct: ${plural(own, "item", "items")} ${own === 1 ? "needs" : "need"} your attention, ${others} overdue ${acrossProjects}`;
};

/** "12 RFI/RFA overdue · 2 approvals waiting · 1 missing report", zero counts left out. */
export const overviewCounts = (o: OverviewProject): string =>
  [
    o.rfi > 0 ? `${o.rfi} RFI/RFA overdue` : "",
    o.stage > 0 ? `${plural(o.stage, "approval", "approvals")} waiting` : "",
    o.report > 0 ? plural(o.report, "missing report", "missing reports") : "",
  ]
    .filter(Boolean)
    .join(" · ");

export const buildDigestEmail = (digest: Digest, appUrl: string, today: string): { subject: string; text: string; html: string } => {
  const base = appUrl.replace(/\/+$/, "");
  const isAdmin = digest.person.role === "admin";
  const overview = isAdmin ? (digest.overview ?? []) : [];
  const sections = SECTIONS.map((s) => ({ ...s, items: digest.items.filter((i) => i.item.type === s.type).map((i) => i.item) })).filter((s) => s.items.length > 0);

  const intro = isAdmin ? `Here is what is overdue on ${today}.` : `Here is what is overdue for you on ${today}.`;
  const text: string[] = [`Hello ${oneLine(digest.person.name)},`, "", intro];
  const html: string[] = [`<p>Hello ${esc(oneLine(digest.person.name))},</p>`, `<p>${esc(intro)}</p>`];
  if (isAdmin && sections.length > 0) {
    text.push("", "Your items");
    html.push('<h2 style="margin:20px 0 0;font-size:16px">Your items</h2>');
  }
  for (const s of sections) {
    const shown = s.items.slice(0, MAX_LINES_PER_SECTION);
    const more = s.items.length - shown.length;
    text.push("", `${s.title} (${s.items.length})`);
    html.push(`<h3 style="margin:18px 0 6px">${esc(s.title)} (${s.items.length})</h3><ul style="padding-left:18px;margin:0">`);
    for (const it of shown) {
      const url = `${base}${it.path}`;
      const what = subjectWithoutCode(it.subject, it.projectCode);
      text.push(`- ${it.projectCode} · ${what} · ${oneLine(it.late)}`, `  ${url}`);
      html.push(`<li style="margin:4px 0"><a href="${esc(url)}">${esc(it.projectCode)} · ${esc(what)}</a> · ${esc(oneLine(it.late))}</li>`);
    }
    html.push("</ul>");
    if (more > 0) {
      text.push(`  ...and ${more} more. Open EasyConstruct to see all.`);
      html.push(`<p style="margin:4px 0;color:#6b7280">and ${more} more. <a href="${esc(base)}">Open EasyConstruct</a> to see all.</p>`);
    }
  }
  const othersTotal = overview.reduce((n, o) => n + overviewTotal(o), 0);
  if (overview.length > 0) {
    const url = `${base}/dashboard`;
    const shown = overview.slice(0, MAX_OVERVIEW_PROJECTS);
    const more = overview.length - shown.length;
    const heading = `Across all projects (${plural(othersTotal, "item", "items")} in ${plural(overview.length, "project", "projects")})`;
    text.push("", heading);
    html.push(`<h2 style="margin:24px 0 0;font-size:16px">${esc(heading)}</h2><ul style="padding-left:18px;margin:6px 0 0">`);
    for (const o of shown) {
      text.push(`- ${o.projectCode} · ${overviewCounts(o)}`, `  ${url}`);
      html.push(`<li style="margin:4px 0"><a href="${esc(url)}">${esc(o.projectCode)}</a> · ${esc(overviewCounts(o))}</li>`);
    }
    html.push("</ul>");
    if (more > 0) {
      text.push(`  ...and ${plural(more, "more project", "more projects")}. Open the dashboard to see all.`);
      html.push(`<p style="margin:4px 0;color:#6b7280">and ${esc(plural(more, "more project", "more projects"))}. <a href="${esc(url)}">Open the dashboard</a> to see all.</p>`);
    }
  }
  const footer = 'You get at most one summary a day, and only when something is overdue. To turn these emails off, open Settings and switch off "Email me overdue reminders". You still get the alerts inside EasyConstruct.';
  text.push("", footer);
  html.push(`<p style="color:#6b7280;font-size:12px;margin-top:20px">${esc(footer)}</p>`);
  return {
    subject: isAdmin ? adminDigestSubject(digest.items.length, othersTotal, overview.length) : digestSubject(digest.items.length),
    text: text.join("\n"),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;max-width:600px">${html.join("\n")}</div>`,
  };
};
