import { useCallback, useEffect, useState } from "react";
import { planSuggestionRepository, type PlanSuggestion } from "../repositories/plan-suggestion.repository";

/** Draft plans for a project. Every change goes through an explicit accept, discard or regenerate. */
export function usePlanSuggestions(projectCode: string, enabled = true) {
  const [suggestions, setSuggestions] = useState<PlanSuggestion[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [busyItem, setBusyItem] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !projectCode) return;
    setLoading(true);
    setError(null);
    try {
      setSuggestions(await planSuggestionRepository.listByProject(projectCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the suggested plan.");
    } finally {
      setLoading(false);
    }
  }, [projectCode, enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (itemId: number, action: () => Promise<unknown>) => {
      setBusyItem(itemId);
      setActionError(null);
      try {
        await action();
        await reload();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "That action failed.");
      } finally {
        setBusyItem(null);
      }
    },
    [reload],
  );

  const accept = useCallback(
    (s: number, item: number, assignedToUserId?: number) =>
      run(item, () => planSuggestionRepository.accept(s, item, assignedToUserId)),
    [run],
  );
  const discard = useCallback((s: number, item: number) => run(item, () => planSuggestionRepository.discard(s, item)), [run]);
  const regenerate = useCallback((s: number) => run(-s, () => planSuggestionRepository.regenerate(s)), [run]);

  return { suggestions, loading, error, actionError, busyItem, reload, accept, discard, regenerate };
}
