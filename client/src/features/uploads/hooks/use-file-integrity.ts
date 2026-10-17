import { useEffect, useSyncExternalStore } from "react";
import { getIntegrity, requestIntegrity, subscribeIntegrity } from "../lib/integrity-store";

/** The integrity status of a stored file ("verified" | "unverified" | "damaged"), or undefined while it is loading. */
export function useFileIntegrity(url: string | null | undefined) {
  useEffect(() => {
    requestIntegrity(url);
  }, [url]);
  return useSyncExternalStore(
    subscribeIntegrity,
    () => getIntegrity(url),
    () => undefined,
  );
}
