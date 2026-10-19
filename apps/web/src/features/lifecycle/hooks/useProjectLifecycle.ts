import { useCallback, useEffect, useState } from "react";
import { LifecycleRepository } from "../repositories/lifecycle.repository";
import type { GateCheck, LifecycleView } from "../types/lifecycle.types";

interface LifecycleActionError {
  message: string;
  failing: GateCheck[] | null;
}

function toActionError(err: unknown): LifecycleActionError {
  if (err instanceof Error) {
    const body = (err as Error & { body?: { failing?: GateCheck[] } }).body;
    return { message: err.message, failing: body?.failing ?? null };
  }
  return { message: "Something went wrong.", failing: null };
}

export function useProjectLifecycle(projectId: string | number | undefined) {
  const [view, setView] = useState<LifecycleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<LifecycleActionError | null>(null);

  const reload = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await LifecycleRepository.get(projectId);
      setView(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lifecycle status.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const runAction = useCallback(
    async (action: () => Promise<LifecycleView>) => {
      setActing(true);
      setActionError(null);
      try {
        const data = await action();
        setView(data);
        return true;
      } catch (err) {
        setActionError(toActionError(err));
        return false;
      } finally {
        setActing(false);
      }
    },
    [],
  );

  const advance = useCallback(
    (opts: { reason?: string; override?: boolean } = {}) => {
      if (!projectId) return Promise.resolve(false);
      return runAction(() => LifecycleRepository.advance(projectId, opts));
    },
    [projectId, runAction],
  );

  const hold = useCallback(
    (reason: string) => {
      if (!projectId) return Promise.resolve(false);
      return runAction(() => LifecycleRepository.hold(projectId, reason));
    },
    [projectId, runAction],
  );

  const resume = useCallback(() => {
    if (!projectId) return Promise.resolve(false);
    return runAction(() => LifecycleRepository.resume(projectId));
  }, [projectId, runAction]);

  const cancel = useCallback(
    (reason: string) => {
      if (!projectId) return Promise.resolve(false);
      return runAction(() => LifecycleRepository.cancel(projectId, reason));
    },
    [projectId, runAction],
  );

  const archive = useCallback(() => {
    if (!projectId) return Promise.resolve(false);
    return runAction(() => LifecycleRepository.archive(projectId));
  }, [projectId, runAction]);

  return {
    view,
    loading,
    error,
    acting,
    actionError,
    reload,
    advance,
    hold,
    resume,
    cancel,
    archive,
  } as const;
}
