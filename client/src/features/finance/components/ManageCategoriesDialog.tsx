import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, Plus, Settings2, X } from "lucide-react";

import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePagination } from "@/hooks/use-pagination";
import { useExpenseCategories } from "../hooks/use-expense-categories";
import { nameProblem } from "../lib/category-name";
import { CategoryRepository } from "../repositories/categories.repository";
import type { CategoryUsage, ExpenseCategory } from "../types/categories.types";

const USAGE_LABELS: Record<keyof CategoryUsage, [string, string]> = {
  budgets: ["budget line", "budget lines"],
  expenses: ["expense", "expenses"],
  purchaseRequests: ["purchase request", "purchase requests"],
  reimbursements: ["reimbursement claim", "reimbursement claims"],
  procurementOrders: ["procurement order", "procurement orders"],
  budgetAllocations: ["budget allocation", "budget allocations"],
};

const usageTotal = (u?: CategoryUsage) => (u ? Object.values(u).reduce((a, b) => a + b, 0) : 0);

const usageBreakdown = (u?: CategoryUsage) =>
  u
    ? (Object.keys(USAGE_LABELS) as (keyof CategoryUsage)[])
        .filter((k) => u[k] > 0)
        .map((k) => `${u[k]} ${USAGE_LABELS[k][u[k] === 1 ? 0 : 1]}`)
        .join(", ")
    : "";

/** A button that stays focusable when disabled so the reason can be read by hover and keyboard. */
function WithReason({ reason, children }: { reason: string | null; children: React.ReactNode }) {
  if (!reason) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}

/** Finance: add, rename (only while unused) and retire / restore the expense categories every dropdown reads. */
export function ManageCategoriesDialog({ trigger }: { trigger?: React.ReactNode }) {
  const shared = useExpenseCategories();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [touched, setTouched] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pg = usePagination(rows, 8);

  // The dialog's own copy carries the usage counts; the shared list (what the dropdowns read) is refreshed after every change.
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setRows(await CategoryRepository.list(true));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const run = async (call: () => Promise<{ ok: boolean; error: string | null }>) => {
    setBusy(true);
    setError(null);
    const r = await call();
    if (r.ok) {
      await Promise.all([load(), shared.refresh()]);
    } else {
      setError(r.error);
    }
    setBusy(false);
    return r.ok;
  };

  const addProblem = nameProblem(newName, rows);
  const add = async () => {
    setTouched(true);
    if (addProblem) return;
    if (await run(() => CategoryRepository.create(newName.trim().replace(/\s+/g, " ")))) {
      setNewName("");
      setTouched(false);
    }
  };

  const saveRename = async (c: ExpenseCategory) => {
    if (nameProblem(draft, rows, c.id)) return;
    if (await run(() => CategoryRepository.rename(c.id, draft.trim().replace(/\s+/g, " ")))) setEditing(null);
  };

  const draftProblem = editing !== null ? nameProblem(draft, rows, editing) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setEditing(null);
          setError(null);
          setNewName("");
          setTouched(false);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Settings2 className="h-3.5 w-3.5" /> Manage categories
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Expense categories</DialogTitle>
          <DialogDescription>
            One list for budgets, expenses, purchase requests and claims. A retired category stays on existing records but is hidden from new entries.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Label htmlFor="new-category">Add a category</Label>
          <div className="flex gap-2">
            <Input
              id="new-category"
              value={newName}
              maxLength={80}
              placeholder="e.g. Concrete works"
              aria-invalid={touched && !!addProblem}
              aria-describedby={touched && addProblem ? "new-category-error" : undefined}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => newName && setTouched(true)}
            />
            <Button type="submit" disabled={busy}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </div>
          {touched && addProblem && (
            <p id="new-category-error" className="text-sm text-destructive-strong">
              {addProblem}
            </p>
          )}
        </form>

        {error && (
          <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive-strong">
            {error}
          </p>
        )}

        {loadError ? (
          <div role="alert" className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-strong">
            <span>Couldn't load the categories: {loadError}</span>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : loading && rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <TooltipProvider delayDuration={150}>
            <ul className="divide-y divide-border rounded-md border border-border">
              {pg.pageItems.map((c) => {
                const used = usageTotal(c.usage);
                const renameReason = c.isSystem
                  ? "System category: it keeps its name (payroll and the standard budget lines depend on it)."
                  : used > 0
                    ? `Used by ${usageBreakdown(c.usage)}. Retire it and add a new category instead.`
                    : null;
                const retireReason = c.isSystem ? "System category: it cannot be retired." : null;
                const isEditing = editing === c.id;
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="space-y-1">
                          <Label htmlFor={`rename-${c.id}`} className="sr-only">
                            New name for {c.name}
                          </Label>
                          <Input
                            id={`rename-${c.id}`}
                            autoFocus
                            value={draft}
                            maxLength={80}
                            aria-invalid={!!draftProblem}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void saveRename(c);
                              if (e.key === "Escape") setEditing(null);
                            }}
                          />
                          {draftProblem && <p className="text-sm text-destructive-strong">{draftProblem}</p>}
                        </div>
                      ) : (
                        <>
                          <p className={c.isActive ? "truncate text-sm font-medium" : "truncate text-sm font-medium text-muted-foreground"}>{c.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {used > 0 ? `Used by ${used} ${used === 1 ? "record" : "records"}` : "Not used yet"}
                            {c.isSystem ? " · system" : ""}
                          </p>
                        </>
                      )}
                    </div>
                    <StatusBadge status={c.isActive ? "Active" : "Retired"} tone={c.isActive ? "success" : "neutral"} />
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <Button size="icon" variant="ghost" aria-label={`Save name for ${c.name}`} disabled={busy || !!draftProblem} onClick={() => void saveRename(c)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Cancel rename" onClick={() => setEditing(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <WithReason reason={renameReason}>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Rename ${c.name}`}
                              disabled={busy || !!renameReason}
                              className={renameReason ? "pointer-events-none" : undefined}
                              onClick={() => {
                                setEditing(c.id);
                                setDraft(c.name);
                                setError(null);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </WithReason>
                          <WithReason reason={retireReason}>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || !!retireReason}
                              className={retireReason ? "pointer-events-none" : undefined}
                              onClick={() => void run(() => (c.isActive ? CategoryRepository.retire(c.id) : CategoryRepository.restore(c.id)))}
                            >
                              {c.isActive ? "Retire" : "Restore"}
                            </Button>
                          </WithReason>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              <li className="p-2">
                <DataTablePagination {...pg} compact />
              </li>
            </ul>
          </TooltipProvider>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
