import { useCallback, useEffect, useState } from "react";
import { RevisionRepository } from "../repositories/revision.repository";
import type { Revision, RevisionItemType, RevisionStatus } from "../types/revision.types";

/** All versions of one item (newest first) and the reviewer's status action. */
export function useRevisionHistory(itemType: RevisionItemType | null, itemId: number | null) {
  const [versions, setVersions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!itemType || itemId == null) {
      setVersions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setVersions(await RevisionRepository.history(itemType, itemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the version history");
    } finally {
      setLoading(false);
    }
  }, [itemType, itemId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Reviewer decision (Consultant / PM / Admin); the server enforces who may do what. */
  const setStatus = async (id: number, status: RevisionStatus, comment?: string): Promise<boolean> => {
    setSaving(true);
    setActionError(null);
    try {
      await RevisionRepository.setStatus(id, status, comment);
      await reload();
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not update the revision");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { versions, loading, error, reload, setStatus, saving, actionError, clearActionError: () => setActionError(null) } as const;
}
