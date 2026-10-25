import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Download, ExternalLink, FileText, ListChecks } from "lucide-react";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SectionCard } from "@/components/ui/section-card";
import { saveBlob } from "@/lib/file-url";

// ── Checklists ─────────────────────────────────────────────────────────────

interface Checklist {
  id: string;
  title: string;
  when: string;
  items: string[];
}

const CHECKLISTS: Checklist[] = [
  {
    id: "pre-construction",
    title: "Pre-construction readiness",
    when: "Before advancing a project from Pre-Construction to Construction",
    items: [
      "Materials and Specifications requirements approved",
      "Budget lines approved and add up to the contract value",
      "Milestones dated and active, each with a task for a staffed site worker",
      "Site crew staffed; every crew member has an active employee record",
      "Notice to Proceed on file and the site location pinned",
      "Safety plan and permits received from the contractor",
    ],
  },
  {
    id: "weekly-site",
    title: "Weekly site review",
    when: "Every week during Construction",
    items: [
      "Tasks reviewed against the schedule; overdue tasks have a new date or a reason",
      "Open issues triaged; resolved ones have resolution notes",
      "Attendance verified for the week; flagged clock-ins followed up",
      "Open RFIs/RFAs checked; anything past its due date chased",
      "Expenses and pending budget changes reviewed with Finance",
      "Progress photos and the weekly report filed",
    ],
  },
  {
    id: "closeout",
    title: "Closeout and turnover",
    when: "Before a project leaves Closeout (Construction) or Turnover (Design)",
    items: [
      "No open RFI/RFA on the project",
      "Final inspection approved; punch list closed",
      "Certificate of Completion or Turnover Document filed",
      "As-built drawings filed by the Architect",
      "Final payroll batch approved by Finance",
      "Closeout / Design Turnover workflow completed",
    ],
  },
  {
    id: "rfi-quality",
    title: "Writing a good RFI/RFA",
    when: "Before sending a request to the design team",
    items: [
      "Quote the sheet number and section the question refers to",
      "State the question so it can be answered yes/no or with one value",
      "Say the cost and time impact if you know them (this prompts a change order)",
      "Attach the marked-up drawing or photo",
      "Pick the designer who owns that discipline; allow the full response window",
    ],
  },
];

const storageKey = (id: string) => `easyconstruct.resources.${id}`;
const readTicks = (id: string, count: number): boolean[] => {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed) && parsed.length === count) return parsed.map(Boolean);
  } catch {
    /* storage can be unavailable (private window); the checklist still works for this visit */
  }
  return Array<boolean>(count).fill(false);
};

function ChecklistCard({ list }: { list: Checklist }) {
  const [ticks, setTicks] = useState<boolean[]>(() => readTicks(list.id, list.items.length));
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey(list.id), JSON.stringify(ticks));
    } catch {
      /* ignore */
    }
  }, [list.id, ticks]);
  const done = ticks.filter(Boolean).length;
  return (
    <SectionCard title={list.title} subtitle={list.when} badge={`${done}/${list.items.length}`}>
      <ul className="space-y-2">
        {list.items.map((item, i) => (
          <li key={item}>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={ticks[i] ?? false}
                onCheckedChange={(on) => setTicks((cur) => cur.map((t, j) => (j === i ? on === true : t)))}
              />
              <span className={ticks[i] ? "text-muted-foreground line-through" : undefined}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
      {done > 0 && (
        <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={() => setTicks(Array<boolean>(list.items.length).fill(false))}>
          Reset
        </Button>
      )}
    </SectionCard>
  );
}

// ── Templates (generated in the browser — nothing is uploaded) ─────────────

interface Template {
  id: string;
  title: string;
  description: string;
  filename: string;
  mime: string;
  body: string;
}

const TEMPLATES: Template[] = [
  {
    id: "minutes",
    title: "Meeting minutes",
    description: "Attendees, decisions and action items with owners and due dates.",
    filename: "meeting-minutes-template.txt",
    mime: "text/plain",
    body: [
      "MEETING MINUTES",
      "Project: ______________________  Code: ____________",
      "Date: ____________  Time: ______  Venue: ______________",
      "Prepared by: ______________________",
      "",
      "ATTENDEES (name / role / present?)",
      "1. ",
      "2. ",
      "3. ",
      "",
      "AGENDA",
      "1. ",
      "2. ",
      "",
      "DECISIONS",
      "1. ",
      "",
      "ACTION ITEMS (what / owner / due date)",
      "1. ",
      "2. ",
      "",
      "NEXT MEETING: ____________",
    ].join("\n"),
  },
  {
    id: "punch-list",
    title: "Punch list",
    description: "Defects to close before handover; import-friendly CSV columns.",
    filename: "punch-list-template.csv",
    mime: "text/csv",
    body: "Item no.,Location / area,Description of defect,Trade,Priority,Assigned to,Date found,Target date,Status,Remarks\n1,,,,Medium,,,,Open,\n",
  },
  {
    id: "daily-report",
    title: "Daily site report",
    description: "Weather, manpower, equipment, work done and issues for one day.",
    filename: "daily-site-report-template.csv",
    mime: "text/csv",
    body: "Date,Weather,Manpower (count),Equipment on site,Work accomplished,Materials delivered,Issues / delays,Safety observations,Prepared by\n",
  },
  {
    id: "submittal",
    title: "Document submittal log",
    description: "Track every submittal sent for review and its return date.",
    filename: "submittal-log-template.csv",
    mime: "text/csv",
    body: "Submittal no.,Description,Discipline,Date sent,Sent to,Due back,Date returned,Outcome,Remarks\n",
  },
  {
    id: "rfi-note",
    title: "RFI/RFA request note",
    description: "A paper-style note to prepare the wording before raising the request in the app.",
    filename: "rfi-rfa-request-note.txt",
    mime: "text/plain",
    body: [
      "REQUEST FOR INFORMATION / APPROVAL — DRAFT NOTE",
      "Project: ______________________",
      "Drawing sheet no.: ______________  Section(s) referenced: ______________",
      "Overview: ______________________________________________",
      "",
      "Clarification required / approval requested:",
      "",
      "",
      "Cost impact:  [ ] none  [ ] increase  [ ] decrease   Note: ____________",
      "Time impact:  [ ] none  [ ] increase  [ ] decrease   Days: ______",
      "",
      "Raise it in the app: Requests > Raise request.",
    ].join("\n"),
  },
];

// ── Links ──────────────────────────────────────────────────────────────────

const INTERNAL_LINKS = [
  { to: "/requests", label: "Requests (RFI / RFA)" },
  { to: "/transmittals", label: "Transmittals" },
  { to: "/approvals", label: "Approvals" },
  { to: "/workflows", label: "Workflows" },
  { to: "/documents", label: "Documents" },
];

const EXTERNAL_LINKS = [
  { href: "https://www.dpwh.gov.ph", label: "DPWH — Department of Public Works and Highways" },
  { href: "https://www.pcab.gov.ph", label: "PCAB — Philippine Contractors Accreditation Board" },
  { href: "https://www.philgeps.gov.ph", label: "PhilGEPS — government procurement" },
  { href: "https://www.dole.gov.ph", label: "DOLE — labor standards and construction safety" },
  { href: "https://www.sss.gov.ph", label: "SSS — contributions" },
  { href: "https://www.philhealth.gov.ph", label: "PhilHealth — contributions" },
  { href: "https://www.pagibigfund.gov.ph", label: "Pag-IBIG Fund — contributions" },
];

export default function SharedResourcesPage() {
  const download = (t: Template) => saveBlob(new Blob([t.body], { type: `${t.mime};charset=utf-8` }), t.filename);

  return (
    <PageContainer>
      <PageHeader title="Resources & Tools" description="Checklists, templates and reference links for running a project." />
      <PageContent className="space-y-8 p-6 md:p-8">
        <section aria-labelledby="res-checklists" className="space-y-3">
          <h2 id="res-checklists" className="flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="h-4 w-4" /> Checklists
          </h2>
          <p className="text-xs text-muted-foreground">Ticks are remembered in this browser only; they are a working aid, not project records.</p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {CHECKLISTS.map((l) => (
              <ChecklistCard key={l.id} list={l} />
            ))}
          </div>
        </section>

        <section aria-labelledby="res-templates" className="space-y-3">
          <h2 id="res-templates" className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4" /> Templates
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.map((t) => (
              <SectionCard key={t.id} title={t.title} subtitle={t.description}>
                <Button size="sm" variant="outline" onClick={() => download(t)}>
                  <Download className="mr-1 h-3.5 w-3.5" /> Download {t.filename.split(".").pop()?.toUpperCase()}
                </Button>
              </SectionCard>
            ))}
          </div>
        </section>

        <section aria-labelledby="res-links" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <h2 id="res-links" className="sr-only">
            Links
          </h2>
          <SectionCard title="In this system" subtitle="Jump to the places this guidance refers to.">
            <ul className="space-y-1.5 text-sm">
              {INTERNAL_LINKS.map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="text-primary-strong hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard title="Government and regulatory" subtitle="Official sites; opens in a new tab.">
            <ul className="space-y-1.5 text-sm">
              {EXTERNAL_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-primary-strong hover:underline">
                    {l.label} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </SectionCard>
        </section>
      </PageContent>
    </PageContainer>
  );
}

SharedResourcesPage.displayName = "SharedResourcesPage";
