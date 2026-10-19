import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LINES_PER_SECTION,
  buildDigestEmail,
  digestKey,
  adminDigestSubject,
  digestSubject,
  isStageOverdue,
  isUndeliverableEmail,
  manilaDay,
  planDigests,
  sentKey,
  skipDomainsFromEnv,
  stageAgeHours,
  stageOverdueHours,
  subjectWithoutCode,
  uniquePeople,
  type DigestCandidate,
  type OverdueItem,
  type Person,
} from "./overdue.js";

const TODAY = "2026-10-10";
const item = (id: number, type: OverdueItem["type"] = "rfi", over: Partial<OverdueItem> = {}): OverdueItem => ({
  type,
  id,
  subject: `Item ${id}`,
  projectCode: "P1",
  late: "3 days overdue",
  detail: "Due 3 days ago",
  path: `/requests?open=${id}`,
  ...over,
});
const person = (id: number, over: Partial<Person> = {}): Person => ({ id, name: `User ${id}`, email: `u${id}@gmail.com`, emailOverdueReminders: true, ...over });
const cand = (it: OverdueItem, recipients: Person[], day = TODAY): DigestCandidate => ({ item: it, recipients, day });
const NONE = new Set<string>();
const SKIP = ["easyconstruct.demo", "example.com"];
const plan = (c: DigestCandidate[], sent: ReadonlySet<string> = NONE) => planDigests(c, sent, TODAY, SKIP);

describe("stage age", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  test("whole hours since the stage became active, never negative", () => {
    assert.equal(stageAgeHours(new Date("2026-10-10T00:00:00Z"), now), 12);
    assert.equal(stageAgeHours(new Date("2026-10-08T12:30:00Z"), now), 47);
    assert.equal(stageAgeHours(new Date("2026-10-11T00:00:00Z"), now), 0);
  });
  test("overdue at 48 hours, not at 47; configurable", () => {
    assert.equal(isStageOverdue(new Date("2026-10-08T12:00:00Z"), now, 48), true);
    assert.equal(isStageOverdue(new Date("2026-10-08T13:00:00Z"), now, 48), false);
    assert.equal(stageOverdueHours(undefined), 48);
    assert.equal(stageOverdueHours("72"), 72);
    assert.equal(stageOverdueHours("nonsense"), 48);
  });
  test("the day is the Manila calendar day", () => {
    assert.equal(manilaDay(new Date("2026-10-10T16:30:00Z")), "2026-10-11");
    assert.equal(manilaDay(new Date("2026-10-10T15:30:00Z")), "2026-10-10");
  });
});

describe("planDigests: one summary per person", () => {
  test("three items for one person become one digest with three items", () => {
    const p = person(1);
    const r = plan([cand(item(1), [p]), cand(item(2, "stage"), [p]), cand(item(3, "report"), [p])]);
    assert.equal(r.digests.length, 1);
    assert.deepEqual(r.digests[0]!.items.map((i) => i.item.type), ["rfi", "stage", "report"]);
  });

  test("two people get two digests", () => {
    const r = plan([cand(item(1), [person(1), person(2)]), cand(item(2), [person(2)])]);
    assert.deepEqual(r.digests.map((d) => [d.person.id, d.items.length]), [[1, 1], [2, 2]]);
  });

  test("the same person listed twice for an item, or an Admin who is also the assignee, counts once", () => {
    const a = person(1);
    const r = plan([cand(item(1), [a, a, person(2)]), cand(item(1), [a])]);
    assert.deepEqual(r.digests.map((d) => [d.person.id, d.items.length]), [[1, 1], [2, 1]]);
  });

  test("an item key already sent is dropped and counted; others stay", () => {
    const p = person(1);
    const r = plan([cand(item(1), [p]), cand(item(2), [p])], new Set([sentKey("rfi", 1, 1, TODAY)]));
    assert.deepEqual(r.digests[0]!.items.map((i) => i.item.id), [2]);
    assert.equal(r.skippedAlreadySent, 1);
  });

  test("today's digest key skips the person entirely, even for a brand-new item", () => {
    const r = plan([cand(item(1), [person(1)]), cand(item(2, "stage"), [person(1)])], new Set([digestKey(1, TODAY)]));
    assert.equal(r.digests.length, 0);
    assert.equal(r.skippedAlreadySent, 2);
  });

  test("yesterday's digest key does not block today", () => {
    const r = plan([cand(item(1), [person(1)])], new Set([digestKey(1, "2026-10-09")]));
    assert.equal(r.digests.length, 1);
  });

  test("a report item keeps its period-start key, not today's", () => {
    const rep = item(7, "report");
    const first = plan([cand(rep, [person(1)], "2026-10-05")]);
    assert.equal(first.digests[0]!.items[0]!.day, "2026-10-05");
    assert.equal(plan([cand(rep, [person(1)], "2026-10-05")], new Set([sentKey("report", 7, 1, "2026-10-05")])).digests.length, 0);
    // a key stored under today does not stand in for the period-start key
    assert.equal(plan([cand(rep, [person(1)], "2026-10-05")], new Set([sentKey("report", 7, 1, TODAY)])).digests.length, 1);
  });

  test("opted out, no email and undeliverable are each counted in their own counter", () => {
    const r = plan([
      cand(item(1), [
        person(1, { emailOverdueReminders: false }),
        person(2, { email: null }),
        person(3, { email: "   " }),
        person(4, { email: "a@EasyConstruct.demo" }),
        person(5),
      ]),
    ]);
    assert.deepEqual(r.digests.map((d) => d.person.id), [5]);
    assert.equal(r.skippedOptOut, 1);
    assert.equal(r.skippedNoEmail, 2);
    assert.equal(r.skippedUndeliverable, 1);
    assert.equal(r.skippedAlreadySent, 0);
  });

  test("empty input and items with nobody to tell give no digests", () => {
    assert.deepEqual(plan([]).digests, []);
    assert.deepEqual(plan([cand(item(1), [])]).digests, []);
  });

  test("uniquePeople keeps the first of a repeated person", () => {
    assert.deepEqual(uniquePeople([person(1), person(2), person(1)]).map((p) => p.id), [1, 2]);
  });
});

describe("isUndeliverableEmail", () => {
  test("an exact skipped domain, in any letter case", () => {
    assert.equal(isUndeliverableEmail("pm@easyconstruct.demo", SKIP), true);
    assert.equal(isUndeliverableEmail("PM@EasyConstruct.DEMO", SKIP), true);
    assert.equal(isUndeliverableEmail("  a@example.com ", SKIP), true);
  });
  test("a subdomain of a skipped domain, but not a look-alike", () => {
    assert.equal(isUndeliverableEmail("a@mail.example.com", SKIP), true);
    assert.equal(isUndeliverableEmail("a@notexample.com", SKIP), false);
    assert.equal(isUndeliverableEmail("a@example.com.ph", SKIP), false);
  });
  test(".test, .example, .invalid and .localhost are always undeliverable", () => {
    for (const d of ["x.test", "x.example", "x.invalid", "x.localhost", "localhost"]) assert.equal(isUndeliverableEmail(`a@${d}`, []), true, d);
  });
  test("a normal address passes; a missing @ or empty domain is undeliverable", () => {
    assert.equal(isUndeliverableEmail("someone@gmail.com", SKIP), false);
    assert.equal(isUndeliverableEmail("not-an-email", SKIP), true);
    assert.equal(isUndeliverableEmail("a@", SKIP), true);
  });
  test("skipDomainsFromEnv: defaults when unset, parsed when set, nothing extra when empty", () => {
    const defaults = skipDomainsFromEnv(undefined);
    for (const d of ["easyconstruct.demo", "example.com", "example.org", "example.net"]) assert.ok(defaults.includes(d), d);
    assert.deepEqual(skipDomainsFromEnv(" Foo.com, @bar.org ,"), ["foo.com", "bar.org"]);
    assert.deepEqual(skipDomainsFromEnv(""), []);
    assert.equal(isUndeliverableEmail("a@easyconstruct.demo", skipDomainsFromEnv("")), false, "with an empty list a demo domain is allowed");
  });
});

describe("buildDigestEmail", () => {
  const p = person(1, { name: "Ana Cruz" });
  const digestOf = (items: OverdueItem[]) => ({ person: p, items: items.map((i) => ({ item: i, day: TODAY })) });

  test("singular and plural subjects", () => {
    assert.equal(digestSubject(1), "EasyConstruct: 1 overdue item needs your attention");
    assert.equal(digestSubject(5), "EasyConstruct: 5 overdue items need your attention");
    assert.equal(buildDigestEmail(digestOf([item(1)]), "https://a.b", TODAY).subject, digestSubject(1));
  });

  test("sections come in the order RFI/RFA, Approvals, Missing reports, and empty ones are hidden", () => {
    const mail = buildDigestEmail(
      digestOf([item(3, "report", { subject: "P1: Daily Report missing", late: "missing for 2026-10-09", path: "/projects/4?tab=reports" }), item(1), item(2, "stage", { late: "waiting 72 h", path: "/approvals" })]),
      "https://app.example.com",
      TODAY,
    );
    const t = mail.text;
    assert.ok(t.indexOf("RFI/RFA overdue (1)") < t.indexOf("Approvals waiting (1)"));
    assert.ok(t.indexOf("Approvals waiting (1)") < t.indexOf("Missing reports (1)"));
    assert.match(t, /Hello Ana Cruz,/);
    assert.match(t, /2026-10-10/);
    assert.match(t, /Settings/);
    const only = buildDigestEmail(digestOf([item(1)]), "https://a.b", TODAY);
    assert.ok(!only.text.includes("Approvals waiting") && !only.text.includes("Missing reports"));
    assert.ok(!only.html.includes("Approvals waiting"));
  });

  test("each line has project code, what, how late and a link built from APP_URL, with no double slash", () => {
    for (const base of ["https://app.example.com", "https://app.example.com/", "https://app.example.com///"]) {
      const t = buildDigestEmail(digestOf([item(1)]), base, TODAY).text;
      assert.match(t, /- P1 · Item 1 · 3 days overdue\n {2}https:\/\/app\.example\.com\/requests\?open=1\n/);
      assert.ok(!/example\.com\/\//.test(t), base);
    }
  });

  test("the project code is not repeated when the subject already starts with it", () => {
    assert.equal(subjectWithoutCode("DEMO-S4: Daily Report missing", "DEMO-S4"), "Daily Report missing");
    assert.equal(subjectWithoutCode("RFI-DEMO-S4-AR-001-26: Door hardware", "DEMO-S4"), "RFI-DEMO-S4-AR-001-26: Door hardware");
    assert.equal(subjectWithoutCode("DEMO-S4: ", "DEMO-S4"), "DEMO-S4:");
    const mail = buildDigestEmail(digestOf([item(3, "report", { subject: "DEMO-S4: Daily Report missing", projectCode: "DEMO-S4", late: "missing for 2026-10-17" })]), "https://a.b", TODAY);
    assert.match(mail.text, /- DEMO-S4 · Daily Report missing · missing for 2026-10-17/);
    assert.ok(!mail.text.includes("DEMO-S4 · DEMO-S4"));
    assert.ok(!mail.html.includes("DEMO-S4 · DEMO-S4"));
  });

  test("a section with 26 or more items shows 25 lines and 'and N more'", () => {
    const mail = buildDigestEmail(digestOf(Array.from({ length: 30 }, (_, i) => item(i + 1))), "https://a.b", TODAY);
    assert.equal(mail.text.split("\n").filter((l) => l.startsWith("- ")).length, MAX_LINES_PER_SECTION);
    assert.match(mail.text, /RFI\/RFA overdue \(30\)/);
    assert.match(mail.text, /and 5 more\. Open EasyConstruct to see all/);
    assert.match(mail.html, /and 5 more/);
    assert.match(mail.subject, /30 overdue items need/);
    const exact = buildDigestEmail(digestOf(Array.from({ length: 25 }, (_, i) => item(i + 1))), "https://a.b", TODAY);
    assert.ok(!exact.text.includes("more. Open"));
  });

  test("the cap applies to each section on its own", () => {
    const items = [...Array.from({ length: 26 }, (_, i) => item(i + 1)), ...Array.from({ length: 3 }, (_, i) => item(100 + i, "stage"))];
    const mail = buildDigestEmail(digestOf(items), "https://a.b", TODAY);
    assert.equal(mail.text.split("\n").filter((l) => l.startsWith("- ")).length, 25 + 3);
    assert.match(mail.text, /and 1 more/);
  });

  test("HTML escapes <, >, & and \" in subjects and names; the subject line has no newline", () => {
    const evil = person(9, { name: 'Ana <b>"X"</b> & Co\nBcc: a@b.c' });
    const mail = buildDigestEmail({ person: evil, items: [{ item: item(1, "rfi", { subject: 'RFI <i>x</i> & "y"\nBcc: z@z.z' }), day: TODAY }] }, "https://a.b", TODAY);
    assert.ok(mail.html.includes("&lt;i&gt;x&lt;/i&gt; &amp; &quot;y&quot;"));
    assert.ok(mail.html.includes("&lt;b&gt;&quot;X&quot;&lt;/b&gt; &amp; Co"));
    assert.ok(!mail.html.includes("<i>x</i>") && !mail.html.includes("<b>"));
    assert.doesNotMatch(mail.subject, /[\r\n]/);
    assert.ok(!mail.text.includes("\nBcc:"));
  });
});

// ── Admin overview ─────────────────────────────────────────────────────────

describe("Admin overview in planDigests", () => {
  const admin = (id = 100, over: Partial<Person> = {}) => person(id, { name: "Ada Admin", role: "admin", ...over });
  const owner = person(1, { role: "architect" });
  /** `n` items spread over the given projects, owned by `owner`, with the Admin only as Admin. */
  const others = (n: number, projects: string[], a: Person, startId = 1000): DigestCandidate[] =>
    Array.from({ length: n }, (_, i) => ({ item: item(startId + i, "rfi", { projectCode: projects[i % projects.length] }), recipients: [owner], admins: [a], day: TODAY }));
  const digestFor = (p: ReturnType<typeof plan>, id: number) => p.digests.find((x) => x.person.id === id)!;

  test("2 own items and 30 others over 4 projects: 2 full lines plus 4 overview lines", () => {
    const a = admin();
    const own = [item(1), item(2)].map((it) => ({ item: it, recipients: [a], admins: [a], day: TODAY }));
    const d = digestFor(plan([...own, ...others(30, ["P1", "P2", "P3", "P4"], a)]), a.id);
    assert.equal(d.items.length, 2);
    assert.equal(d.overview!.length, 4);
    assert.equal(d.overview!.reduce((n, o) => n + o.rfi, 0), 30);
    const mail = buildDigestEmail(d, "https://a.b", TODAY);
    assert.equal(mail.text.split("\n").filter((l) => l.startsWith("- ")).length, 6);
    assert.equal(mail.subject, "EasyConstruct: 2 items need your attention, 30 overdue across 4 projects");
  });

  test("an Admin with no own items gets the overview only", () => {
    const a = admin();
    const d = digestFor(plan(others(5, ["P1", "P2"], a)), a.id);
    assert.equal(d.items.length, 0);
    const mail = buildDigestEmail(d, "https://a.b", TODAY);
    assert.ok(!mail.text.includes("Your items"));
    assert.ok(mail.text.includes("Across all projects (5 items in 2 projects)"));
    assert.equal(mail.subject, "EasyConstruct: 5 items overdue across 2 projects");
  });

  test("an Admin who is also the assignee sees the item under Your items and it is not counted in the overview", () => {
    const a = admin();
    const c: DigestCandidate = { item: item(7), recipients: [a], admins: [a], day: TODAY };
    const d = digestFor(plan([c, ...others(2, ["P2"], a)]), a.id);
    assert.deepEqual(d.items.map((i) => i.item.id), [7]);
    assert.equal(d.overview!.reduce((n, o) => n + o.rfi, 0), 2);
  });

  test("a non-Admin owner never gets an overview, and the Admin has no per-item entries for it", () => {
    const a = admin();
    const p = plan(others(3, ["P1"], a));
    assert.equal(digestFor(p, owner.id).overview, undefined);
    assert.equal(digestFor(p, owner.id).items.length, 3);
    assert.equal(digestFor(p, a.id).items.length, 0);
  });

  test("overview lines are ordered by total, then project code, and counted per kind", () => {
    const a = admin();
    const mk = (id: number, type: OverdueItem["type"], projectCode: string): DigestCandidate => ({ item: item(id, type, { projectCode }), recipients: [owner], admins: [a], day: TODAY });
    const d = digestFor(plan([mk(1, "rfi", "B"), mk(2, "rfi", "A"), mk(3, "stage", "C"), mk(4, "report", "C"), mk(5, "rfi", "C"), mk(6, "rfi", "C")]), a.id);
    assert.deepEqual(d.overview!.map((o) => o.projectCode), ["C", "A", "B"]);
    assert.deepEqual(d.overview![0], { projectCode: "C", rfi: 2, stage: 1, report: 1 });
  });

  test("more than 15 projects: 15 lines and 'and N more projects'", () => {
    const a = admin();
    const codes = Array.from({ length: 18 }, (_, i) => `P${String(i).padStart(2, "0")}`);
    const d = digestFor(plan(others(18, codes, a)), a.id);
    const mail = buildDigestEmail(d, "https://a.b", TODAY);
    assert.equal(mail.text.split("\n").filter((l) => l.startsWith("- ")).length, 15);
    assert.ok(mail.text.includes("...and 3 more projects."));
    assert.ok(mail.html.includes("and 3 more projects"));
    assert.ok(buildDigestEmail({ ...d, overview: d.overview!.slice(0, 16) }, "https://a.b", TODAY).text.includes("...and 1 more project."));
    assert.ok(!buildDigestEmail({ ...d, overview: d.overview!.slice(0, 15) }, "https://a.b", TODAY).text.includes("more project"));
  });

  test("overview line wording: singular and plural, zero kinds left out, link to the dashboard", () => {
    const a = admin();
    const mail = buildDigestEmail(
      { person: a, items: [], overview: [{ projectCode: "DEMO-S4", rfi: 12, stage: 2, report: 1 }, { projectCode: "X", rfi: 0, stage: 1, report: 0 }] },
      "https://app.example.com/",
      TODAY,
    );
    assert.ok(mail.text.includes("- DEMO-S4 · 12 RFI/RFA overdue · 2 approvals waiting · 1 missing report"));
    assert.ok(mail.text.includes("- X · 1 approval waiting"));
    assert.ok(mail.text.includes("  https://app.example.com/dashboard"));
    assert.ok(mail.html.includes('href="https://app.example.com/dashboard"'));
  });

  test("Admin subject: singular and plural, with and without own items", () => {
    assert.equal(adminDigestSubject(3, 95, 6), "EasyConstruct: 3 items need your attention, 95 overdue across 6 projects");
    assert.equal(adminDigestSubject(1, 1, 1), "EasyConstruct: 1 item needs your attention, 1 overdue across 1 project");
    assert.equal(adminDigestSubject(0, 1, 1), "EasyConstruct: 1 item overdue across 1 project");
    assert.equal(adminDigestSubject(0, 7, 2), "EasyConstruct: 7 items overdue across 2 projects");
    assert.equal(adminDigestSubject(4, 0, 0), digestSubject(4));
  });

  test("a same-day rerun sends nothing: today's digest key skips the Admin, overview included", () => {
    const a = admin();
    const p = plan(others(4, ["P1"], a), new Set([digestKey(a.id, TODAY)]));
    assert.equal(p.digests.some((x) => x.person.id === a.id), false);
    assert.equal(p.skippedAlreadySent >= 4, true);
  });

  test("an opted-out Admin gets neither part; no email and a demo address are skipped too", () => {
    const off = admin(100, { emailOverdueReminders: false });
    const own: DigestCandidate = { item: item(1), recipients: [off], admins: [off], day: TODAY };
    const p = plan([own, ...others(3, ["P1"], off)]);
    assert.equal(p.digests.some((x) => x.person.id === off.id), false);
    assert.equal(p.skippedOptOut, 4);
    assert.equal(plan(others(2, ["P1"], admin(101, { email: null }))).skippedNoEmail, 2);
    assert.equal(plan(others(2, ["P1"], admin(102, { email: "a@easyconstruct.demo" }))).skippedUndeliverable, 2);
  });

  test("the overview is not blocked by per-item keys and is recomputed the next day", () => {
    const a = admin();
    const keys = new Set([sentKey("rfi", 1000, a.id, TODAY), digestKey(a.id, "2026-10-09")]);
    assert.equal(digestFor(plan(others(2, ["P1"], a), keys), a.id).overview!.length, 1);
  });
});

describe("a non-Admin's summary is unchanged", () => {
  test("plain text of a fixed case", () => {
    const d = { person: person(1, { name: "Ana Cruz", role: "architect" }), items: [{ item: item(1), day: TODAY }, { item: item(2, "stage", { late: "waiting 72 h", path: "/approvals" }), day: TODAY }] };
    const mail = buildDigestEmail(d, "https://app.example.com", TODAY);
    assert.equal(mail.subject, "EasyConstruct: 2 overdue items need your attention");
    assert.equal(
      mail.text,
      [
        "Hello Ana Cruz,",
        "",
        "Here is what is overdue for you on 2026-10-10.",
        "",
        "RFI/RFA overdue (1)",
        "- P1 · Item 1 · 3 days overdue",
        "  https://app.example.com/requests?open=1",
        "",
        "Approvals waiting (1)",
        "- P1 · Item 2 · waiting 72 h",
        "  https://app.example.com/approvals",
        "",
        'You get at most one summary a day, and only when something is overdue. To turn these emails off, open Settings and switch off "Email me overdue reminders". You still get the alerts inside EasyConstruct.',
      ].join("\n"),
    );
  });
});
