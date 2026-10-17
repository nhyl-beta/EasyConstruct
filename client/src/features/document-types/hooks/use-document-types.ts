import { useCallback, useEffect, useMemo, useState } from "react";

import { documentTypesRepository, type DocumentTypeItem } from "../repositories/document-types.repository";

export interface DocumentTypeGroup {
  category: string;
  types: DocumentTypeItem[];
}

/** Groups types by category, keeping the server's order (category, then name). */
export function groupByCategory(types: DocumentTypeItem[]): DocumentTypeGroup[] {
  const groups: DocumentTypeGroup[] = [];
  for (const t of types) {
    const group = groups.find((g) => g.category === t.category);
    if (group) group.types.push(t);
    else groups.push({ category: t.category, types: [t] });
  }
  return groups;
}

/**
 * The document types for a dropdown. `categories` limits the list (Site Personnel only file field documents).
 * `all` includes inactive types and is for the management page only; the server ignores it for other roles.
 */
export function useDocumentTypes(opts: { categories?: string[]; all?: boolean } = {}) {
  const [types, setTypes] = useState<DocumentTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTypes(await documentTypesRepository.list({ all: opts.all }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load document types");
    } finally {
      setLoading(false);
    }
  }, [opts.all]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const categoriesKey = opts.categories?.join("|") ?? "";
  const visible = useMemo(
    () => (opts.categories ? types.filter((t) => opts.categories!.includes(t.category)) : types),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types, categoriesKey],
  );
  const groups = useMemo(() => groupByCategory(visible), [visible]);

  return { types: visible, groups, loading, error, refresh };
}
