import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * The selected row of a list, kept in the URL (`?selected=<id>`) so a detail
 * panel can be deep-linked. Opening from nothing pushes a history entry, so the
 * back button closes the panel; switching rows or closing replaces it.
 */
export function useSelectedParam(key = "selected") {
  const [params, setParams] = useSearchParams();
  const selected = params.get(key);

  const select = useCallback(
    (id: string | number | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id === null) next.delete(key);
          else next.set(key, String(id));
          return next;
        },
        // Push only when going from "closed" to "open"; everything else replaces.
        { replace: id === null || selected !== null },
      );
    },
    [key, selected, setParams],
  );

  return [selected, select] as const;
}
