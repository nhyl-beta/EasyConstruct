import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { useAuth } from "@/auth/auth-context";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRoleConfig } from "@/hooks/use-role-config";
import { useQuickSearchControls } from "./context";
import { useQuickSearch, type PaletteRow } from "./useQuickSearch";
import { isRole, type RecordSource, type RecordSourceState } from "./types";

/**
 * Runs one record source's list hook. It is only rendered after the palette
 * has been opened once, which is what keeps every list from loading on page
 * load. Results are pushed up whenever they actually change.
 */
function SourceRunner({
  id,
  source,
  report,
}: {
  id: string;
  source: RecordSource;
  report: (id: string, s: RecordSourceState) => void;
}) {
  const state = source.useItems();
  const signature = `${state.loading}|${state.error ?? ""}|${state.results.map((r) => `${r.id}:${r.title}`).join("\u0001")}`;
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => {
    report(id, latest.current);
  }, [id, report, signature]);
  return null;
}

const NAV_KEYS = new Set(["Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

export function QuickSearchPalette() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { identity } = useRoleConfig();
  const { open, query, everOpened, setQuery, closePalette, barRef, suppressFocusOpen } = useQuickSearchControls();

  const role = isRole(identity.role) ? identity.role : null;
  // Every call below needs a role; a role this registry does not know simply
  // gets no palette.
  const userKey = String(user?.id ?? user?.email ?? "anonymous");
  const qs = useQuickSearch(role ?? "project_manager", userKey);

  if (!role) return null;

  const choose = (row: PaletteRow) => {
    qs.remember(row);
    closePalette();
    navigate(row.route);
  };

  return (
    <>
      {everOpened &&
        qs.sources.map((s) => {
          const id = `${s.kind}:${s.label}`;
          return <SourceRunner key={id} id={id} source={s} report={qs.report} />;
        })}

      <Dialog open={open} onOpenChange={(next) => !next && closePalette()}>
        <DialogContent
          showCloseButton={false}
          className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 motion-reduce:animate-none motion-reduce:transition-none sm:max-w-2xl"
          onKeyDown={(e) => {
            // Refine's kbar (mounted in App.tsx) listens for these keys on
            // window and would activate its own first result. They are ours.
            if (NAV_KEYS.has(e.key)) e.stopPropagation();
          }}
          onCloseAutoFocus={(e) => {
            // Return focus to the header box without reopening the palette.
            const bar = barRef.current;
            if (bar && bar.offsetParent !== null) {
              e.preventDefault();
              suppressFocusOpen.current = true;
              bar.focus();
            }
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Search or jump to</DialogTitle>
            <DialogDescription>Find a page, start an action or open a record.</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} loop className="max-h-[70vh]">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, actions, records…"
              aria-label="Search or jump to"
            />
            <CommandList className="max-h-[min(60vh,420px)]">
              {qs.sections.map((section) => (
                <CommandGroup key={section.heading} heading={section.heading}>
                  {section.rows.map((row) => {
                    const Icon = row.icon;
                    return (
                      <CommandItem key={row.key} value={row.key} onSelect={() => choose(row)}>
                        <Icon className="text-muted-foreground" aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{row.label}</div>
                          {row.description && (
                            <div className="truncate text-xs text-muted-foreground">{row.description}</div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                  {section.loading && (
                    <div className="px-2 py-2 text-xs text-muted-foreground" role="status">
                      Searching…
                    </div>
                  )}
                  {section.error && (
                    <div className="px-2 py-2 text-xs text-destructive-strong" role="status">
                      {section.error}
                    </div>
                  )}
                </CommandGroup>
              ))}
              {qs.isEmpty && (
                <CommandEmpty className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No results for “{qs.parsed.text}”.
                  <span className="mt-1 block text-xs">
                    {qs.parsed.actionsOnly
                      ? "Try a different action, or remove the > to search everything."
                      : `You can search pages, actions${qs.searchableGroups.length ? `, ${qs.searchableGroups.join(", ").toLowerCase()}` : ""}.`}
                  </span>
                </CommandEmpty>
              )}
            </CommandList>
            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-2 text-overline text-muted-foreground">
              <span>↑↓ move · ↵ open · esc close</span>
              <span className="hidden sm:inline">Type &gt; for actions only</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
