import { useCallback, useEffect, useState } from "react";
import { stakeholderRepository, type Stakeholder, type StakeholderInput } from "../repositories/stakeholder.repository";

/** The stakeholders of one project, with add / edit / remove. Errors from the server are returned as messages. */
export function useStakeholders(projectCode: string | null) {
  const [items, setItems] = useState<Stakeholder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!projectCode) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setItems(await stakeholderRepository.list(projectCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load stakeholders");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<string | null> => {
      setSaving(true);
      try {
        await action();
        await reload();
        return null;
      } catch (e) {
        return e instanceof Error ? e.message : "Couldn't save the change";
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return {
    items,
    loading,
    error,
    saving,
    reload,
    add: (input: StakeholderInput) => run(() => stakeholderRepository.create(projectCode!, input)),
    edit: (id: number, input: Partial<StakeholderInput>) => run(() => stakeholderRepository.update(id, input)),
    remove: (id: number) => run(() => stakeholderRepository.remove(id)),
  };
}
