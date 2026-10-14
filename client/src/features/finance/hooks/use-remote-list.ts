import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionResult } from "../types/purchasing.types";

/**
 * Loads a list once, and offers `run` for mutations: it runs the call, then
 * reloads the list whether it succeeded or not (a 409 means what is on screen
 * is stale). Shared by the purchase request and procurement hooks.
 */
export function useRemoteList<T>(fetcher: () => Promise<T[]>, enabled = true) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(fetcher);
  useEffect(() => {
    fetchRef.current = fetcher;
  });

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchRef.current());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void reload();
    else setLoading(false);
  }, [enabled, reload]);

  const run = useCallback(
    async <R,>(call: () => Promise<ActionResult<R>>): Promise<ActionResult<R>> => {
      const result = await call();
      await reload();
      return result;
    },
    [reload],
  );

  return { items, loading, error, reload, run };
}
