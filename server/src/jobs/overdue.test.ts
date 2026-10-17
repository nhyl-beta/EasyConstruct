import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LINES_PER_SECTION,
  buildDigestEmail,
  digestKey,
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
