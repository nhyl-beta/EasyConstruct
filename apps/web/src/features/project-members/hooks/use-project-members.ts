import { useCallback, useEffect, useState } from "react";
import {
  ProjectMemberRepository,
  type ProjectMember,
  type ProjectMemberRole,
} from "../repositories/project-member.repository";

/**
 * Scoped to a single role so the project detail page can render one
 * independent panel per role (Engineer/Architect/Site Personnel/Consultant)
 * — same shape the old engineer-only hook had, generalized with `role`.
 */
export function useProjectMembers(projectCode: string | null, role: ProjectMemberRole) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!projectCode) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await ProjectMemberRepository.listForProject(projectCode);
      setMembers(result.filter((m) => m.role === role));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team members");
    } finally {
      setLoading(false);
    }
  }, [projectCode, role]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addMember = useCallback(
    async (userId: number, userName: string) => {
      if (!projectCode) return false;
      setSaving(true);
      setError(null);
      try {
        await ProjectMemberRepository.create({ projectCode, userId, userName, role });
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add team member");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [projectCode, role, reload],
  );

  const removeMember = useCallback(
    async (id: number) => {
      setSaving(true);
      setError(null);
      try {
        await ProjectMemberRepository.remove(id);
        await reload();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove team member");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  return { members, loading, error, saving, addMember, removeMember, reload };
}
