import { useEffect, useState } from "react";
import { useAuth } from "@/auth/auth-context";
import {
  ProjectMemberRepository,
  type ProjectMemberRole,
} from "../repositories/project-member.repository";

/**
 * Codes of the projects the signed-in user is staffed on in `role`
 * (project_members), so pickers can offer only projects they can act on.
 */
export function useStaffedProjectCodes(role: ProjectMemberRole) {
  const { user } = useAuth();
  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setCodes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    ProjectMemberRepository.listForUser(user.id)
      .then((rows) => {
        if (!cancelled) setCodes(Array.from(new Set(rows.filter((r) => r.role === role).map((r) => r.projectCode))));
      })
      .catch(() => {
        if (!cancelled) setCodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, role]);

  return { codes, loading };
}
