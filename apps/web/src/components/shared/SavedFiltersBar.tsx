// "Saved filters" control for list pages (objectives fix 2.7). Name the filters
// currently applied, bring a saved set back with one click, delete the ones no
// longer wanted. Kept in this browser only, per signed-in user.
import { useCallback, useEffect, useState } from "react";
import { Bookmark, X } from "lucide-react";

import { useAuth } from "@/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteFilter, loadSavedFilters, saveFilter, type SavedFilter } from "@/lib/saved-filters";

export function SavedFiltersBar<T>({
  page,
  current,
  hasActive,
  onApply,
}: {
  /** Which page these belong to, for example "hr-attendance". */
  page: string;
  /** The filters as they are now. */
  current: T;
  /** Whether any filter is applied (saving nothing is pointless). */
  hasActive: boolean;
  onApply: (values: T) => void;
}) {
  const { user } = useAuth();
  const userId = user?.id ?? "anonymous";
  const [filters, setFilters] = useState<SavedFilter<T>[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    setFilters(loadSavedFilters<T>(userId, page));
  }, [userId, page]);

  const save = useCallback(() => {
    if (!name.trim()) return;
    setFilters(saveFilter(userId, page, name, current));
    setName("");
    setNaming(false);
  }, [userId, page, name, current]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <Badge key={f.name} variant="outline" className="flex items-center gap-1 rounded-full pr-1 text-overline">
          <button type="button" className="px-1 hover:underline" onClick={() => onApply(f.values)} title="Apply this saved filter">
            {f.name}
          </button>
          <button
            type="button"
            aria-label={`Delete saved filter ${f.name}`}
            className="rounded-full p-0.5 hover:bg-muted"
            onClick={() => setFilters(deleteFilter<T>(userId, page, f.name))}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {naming ? (
        <div className="flex items-center gap-1.5">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            placeholder="Name this filter"
            className="h-8 w-40 text-xs"
            autoFocus
          />
          <Button type="button" size="sm" className="h-8" disabled={!name.trim()} onClick={save}>
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setNaming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 gap-1 px-2 text-xs"
          disabled={!hasActive}
          title={hasActive ? "Save the filters now applied" : "Apply a filter first, then save it"}
          onClick={() => setNaming(true)}
        >
          <Bookmark className="h-3.5 w-3.5" /> Save filter
        </Button>
      )}
    </div>
  );
}
