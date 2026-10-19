import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  CheckSquare,
  ClipboardList,
  FileText,
  FolderKanban,
  GitBranch,
  History,
  Layers,
  MessageSquareQuote,
  NotepadTextDashed,
  Receipt,
  Ruler,
  ShieldAlert,
  User,
} from "lucide-react";

import { useQuickSearchControls } from "./context";
import { capPerGroup, parseQuery, rankItems } from "./rank";
import { pushRecent, readRecent, type RecentItem } from "./recent";
import { defaultActionsFor, defaultPagesFor, entriesFor } from "./registry";
import { routeForRole, sourcesFor } from "./record-sources";
import type { QuickEntry, RecordKind, RecordResult, RecordSourceState, Role } from "./types";

export interface PaletteRow {
  key: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  route: string;
  kind: "action" | "page" | "record";
}

export interface PaletteSection {
  heading: string;
  rows: PaletteRow[];
  /** "Searching…" while a lazy list first loads. */
  loading?: boolean;
  /** Shown instead of rows when that group's list failed to load. */
  error?: string;
}

const RECORD_ICONS: Record<RecordKind, LucideIcon> = {
  project: FolderKanban,
  proposal: FileText,
  workflow: GitBranch,
  approval: CheckSquare,
  design: Ruler,
  document: FileText,
  person: User,
  task: CheckSquare,
  issue: ShieldAlert,
  requirement: ClipboardList,
  report: Layers,
  budget: Banknote,
  expense: Receipt,
  request: MessageSquareQuote,
  blueprint: NotepadTextDashed,
};

const ACTION_LIMIT = 8;
const PAGE_LIMIT = 8;

const entryRow = (e: QuickEntry): PaletteRow => ({
  key: `${e.kind}:${e.id}`,
  label: e.label,
  description: e.description,
  icon: e.icon,
  route: e.route,
  kind: e.kind,
});

const recentIcon = (r: RecentItem): LucideIcon => (r.kind === "record" ? FileText : History);

export function useQuickSearch(role: Role, userKey: string) {
  const { open, query, everOpened } = useQuickSearchControls();
  const [states, setStates] = useState<Record<string, RecordSourceState>>({});
  const [recent, setRecent] = useState<RecentItem[]>([]);

  // Re-read Recent each time the palette opens (it may have changed in another tab).
  useEffect(() => {
    if (open) setRecent(readRecent(userKey));
  }, [open, userKey]);

  const sources = useMemo(() => sourcesFor(role), [role]);
  const report = useCallback((id: string, s: RecordSourceState) => {
    setStates((prev) => ({ ...prev, [id]: s }));
  }, []);

  const entries = useMemo(() => entriesFor(role), [role]);
  const parsed = useMemo(() => parseQuery(query), [query]);

  const sections = useMemo<PaletteSection[]>(() => {
    const out: PaletteSection[] = [];

    if (!parsed.text && !parsed.actionsOnly) {
      if (recent.length) {
        out.push({
          heading: "Recent",
          rows: recent.map((r) => ({
            key: `recent:${r.key}`,
            label: r.label,
            description: r.subtitle,
            icon: recentIcon(r),
            route: r.route,
            kind: r.kind,
          })),
        });
      }
      out.push({ heading: "Quick actions", rows: defaultActionsFor(role).map(entryRow) });
      out.push({ heading: "Go to", rows: defaultPagesFor(role).map(entryRow) });
      return out.filter((s) => s.rows.length);
    }

    const actions = rankItems(
      entries.filter((e) => e.kind === "action"),
      parsed.text,
    ).slice(0, ACTION_LIMIT);
    if (actions.length) out.push({ heading: "Quick actions", rows: actions.map(entryRow) });
    if (parsed.actionsOnly) return out;

    const pages = rankItems(
      entries.filter((e) => e.kind === "page"),
      parsed.text,
    ).slice(0, PAGE_LIMIT);
    if (pages.length) out.push({ heading: "Go to", rows: pages.map(entryRow) });

    for (const source of sources) {
      const id = `${source.kind}:${source.label}`;
      const st = states[id];
      if (!st) {
        if (everOpened) out.push({ heading: source.label, rows: [], loading: true });
        continue;
      }
      if (st.error && st.results.length === 0) {
        out.push({ heading: source.label, rows: [], error: `Couldn’t load ${source.label.toLowerCase()}` });
        continue;
      }
      const ranked = rankItems(
        st.results.map((r) => ({
          label: r.title,
          kind: "record" as const,
          keywords: [r.subtitle ?? "", ...r.keywords],
          result: r,
        })),
        parsed.text,
      );
      const capped = capPerGroup(ranked, () => source.label);
      const rows: PaletteRow[] = capped.map((c: { result: RecordResult }) => ({
        key: `record:${source.kind}:${c.result.id}`,
        label: c.result.title,
        description: c.result.subtitle,
        icon: RECORD_ICONS[c.result.kind],
        route: routeForRole(role, c.result),
        kind: "record",
      }));
      if (rows.length || st.loading) out.push({ heading: source.label, rows, loading: st.loading && rows.length === 0 });
    }
    return out;
  }, [parsed, recent, role, entries, sources, states, everOpened]);

  const remember = useCallback(
    (row: PaletteRow) => {
      // Recent rows are stored under their original key.
      const key = row.key.startsWith("recent:") ? row.key.slice("recent:".length) : row.key;
      setRecent(
        pushRecent(userKey, {
          key,
          label: row.label,
          subtitle: row.description,
          route: row.route,
          kind: row.kind,
        }),
      );
    },
    [userKey],
  );

  const stillLoading = sections.some((s) => s.loading);
  const hasRows = sections.some((s) => s.rows.length > 0);
  const hasErrors = sections.some((s) => s.error);

  return {
    sources,
    report,
    sections,
    parsed,
    remember,
    stillLoading,
    isEmpty: !hasRows && !stillLoading && !hasErrors,
    searchableGroups: sources.map((s) => s.label),
  };
}
