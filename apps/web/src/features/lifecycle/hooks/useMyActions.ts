import { useEffect, useState } from "react";
import { LifecycleRepository } from "../repositories/lifecycle.repository";
import type { MyActionItem } from "../types/my-actions.types";

// K1
export function useMyActions() {
  const [actions, setActions] = useState<MyActionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    LifecycleRepository.getMyActions()
      .then((data) => {
        if (!cancelled) setActions(data);
      })
      .catch(() => {
        if (!cancelled) setActions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { actions, loading };
}
