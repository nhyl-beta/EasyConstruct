// apps/web/src/features/account-recovery/hooks/use-account-recovery.ts
import { useCallback, useEffect, useState } from "react";
import { UserRepository, type PublicUser } from "@/features/users/repositories/user.repository";
import {
  AccountRecoveryRepository,
  type OwnerRecoveryResult,
} from "../repositories/account-recovery.repository";

export function useAccountRecovery() {
  const [targets, setTargets] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<OwnerRecoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTargets(await UserRepository.listByRole("it-designer"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load account recovery.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sendRecoveryEmail = useCallback(async (targetUserId: number) => {
    setSending(true);
    setError(null);
    setSent(null);
    try {
      const result = await AccountRecoveryRepository.initiate(targetUserId);
      setSent(result);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send the recovery email.");
      return null;
    } finally {
      setSending(false);
    }
  }, []);

  return { targets, loading, sending, sent, error, reload, sendRecoveryEmail } as const;
}
