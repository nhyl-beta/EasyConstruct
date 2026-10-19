// apps/web/src/features/account-recovery/repositories/account-recovery.repository.ts
import { apiClient } from "@/services/api.client";

// What the server reports after emailing the recovery link. The link itself
// is never returned to the browser — it exists only in the Owner's mailbox.
export interface OwnerRecoveryResult {
  to: string;
  targetUserId: number;
  targetName: string;
  targetEmail: string;
  expiresAt: string;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function unwrap<T>(promise: Promise<any>): Promise<T> {
  const json = await promise;
  if (json && typeof json === "object" && "data" in json) return json.data as T;
  return json as T;
}

export const AccountRecoveryRepository = {
  async initiate(targetUserId: number): Promise<OwnerRecoveryResult> {
    return unwrap<OwnerRecoveryResult>(
      apiClient.post("/auth/owner-recovery/initiate", { targetUserId }),
    );
  },
};
