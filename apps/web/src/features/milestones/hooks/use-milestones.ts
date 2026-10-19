// apps/web/src/features/milestones/hooks/use-milestones.ts — NEW
import { useCallback, useEffect, useState } from "react";
import {
  MilestoneRepository,
  type CreateMilestoneInput,
  type Milestone,
  type UpdateMilestoneInput,
} from "../repositories/milestone.repository";

export function useMilestones(projectCode: string) {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!projectCode) return;
    setLoading(true);
    setError(null);
    try {
      setMilestones(await MilestoneRepository.listByProject(projectCode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load milestones.");
    } finally {
      setLoading(false);
    }
  }, [projectCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Always creates a DRAFT — see apps/api/src/milestones/service.ts. Status is
  // only ever changed afterward, through update().
  const createDraft = useCallback(
    async (input: Omit<CreateMilestoneInput, "projectCode">) => {
      setSaving(true);
      setError(null);
      try {
        const created = await MilestoneRepository.create({ ...input, projectCode });
        await reload();
        return created;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create milestone.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [projectCode, reload],
  );

  const update = useCallback(
    async (id: number, input: UpdateMilestoneInput) => {
      setSaving(true);
      setError(null);
      try {
        const updated = await MilestoneRepository.update(id, input);
        await reload();
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update milestone.");
        return null;
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const remove = useCallback(
    async (id: number) => {
      setSaving(true);
      setError(null);
      try {
        await MilestoneRepository.remove(id);
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete milestone.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return { milestones, loading, saving, error, reload, createDraft, update, remove } as const;
}
