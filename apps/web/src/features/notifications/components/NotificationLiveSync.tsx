import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRealtimeClient, type SealedLiveQuery } from "@neon/realtime/client";
import { drizzleParsers } from "@neon/realtime-drizzle/client";
import { RealtimeProvider, useLiveQuery } from "@neon/realtime-react";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { apiClient } from "@/services/api.client";

type Row = { id: number; isRead: boolean };
type Sealed = SealedLiveQuery<Row>;

const url = import.meta.env.VITE_NEON_REALTIME_URL as string | undefined;

// The server seals the caller's inbox query; the 503 answer (Realtime off / wrong branch) just means "no live sync".
async function fetchSealed(): Promise<Sealed> {
  const json = (await apiClient.get("/notifications/live")) as { data?: Sealed } | Sealed;
  return ("data" in json && json.data ? json.data : json) as Sealed;
}

function Watch({ sealed, onChange }: { sealed: Sealed; onChange: () => void }) {
  const { data } = useLiveQuery(sealed, { refreshQuery: fetchSealed });
  // The first snapshot is what the bell already loaded; only later changes need a refetch.
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!data) return;
    const sig = JSON.stringify(data);
    if (last.current !== null && last.current !== sig) onChange();
    last.current = sig;
  }, [data, onChange]);
  return null;
}

/** Calls onChange whenever the signed-in user's inbox changes in the database. Renders nothing. */
export function NotificationLiveSync({ onChange }: { onChange: () => void }) {
  const client = useMemo(() => (url ? createRealtimeClient({ url, parsers: drizzleParsers }) : null), []);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const queryClient = useQueryClient();
  // shortcut: most domain events also write a notification, so a new row stands in for "something changed".
  // Anything that changes without one still waits for the next page load; upgrade = one sealed query per table.
  const changed = useCallback(() => {
    onChange();
    void queryClient.invalidateQueries({ queryKey: qk.approvals.stats });
    void queryClient.invalidateQueries({ queryKey: qk.lifecycle.myActions });
  }, [onChange, queryClient]);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    fetchSealed().then((s) => !cancelled && setSealed(s)).catch(() => { /* SSE stream still covers pushes */ });
    return () => { cancelled = true; };
  }, [client]);

  if (!client || !sealed) return null;
  return (
    <RealtimeProvider client={client}>
      <Watch sealed={sealed} onChange={changed} />
    </RealtimeProvider>
  );
}
