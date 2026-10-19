// apps/web/src/features/lifecycle/components/RefreshReferencesCard.tsx — NEW (ai-signals E6)
//
// Admin-only, nice-to-have: a manual "do it now" for the cost catalog cache
// (ai-validation/cache.ts already refreshes it lazily every 7 days on its
// own). Never blocks anything — worst case, a click does nothing useful if
// the daily request budget is already spent.
import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiClient } from "@/services/api.client";
import { formatRelativeTime } from "@/lib/format-relative-time";

interface ReferencesStatus {
  totalItems: number;
  lastFetchedAt: string | null;
}

export function RefreshReferencesCard() {
  const [status, setStatus] = useState<ReferencesStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = (await apiClient.get("/ai-validation/references-status")) as { data: ReferencesStatus };
      setStatus(res.data);
    } catch {
      // Silent — this card is a convenience, not a critical read.
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await apiClient.post("/ai-validation/refresh-references", {});
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-ai" />
          Cost reference catalog
        </CardTitle>
        <Badge variant="outline" className="rounded-full border-ai/30 text-overline text-ai">
          AI
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {status
            ? `${status.totalItems.toLocaleString()} cached items · last refreshed ${
                status.lastFetchedAt ? formatRelativeTime(status.lastFetchedAt) : "never"
              }.`
            : "Loading status…"}
        </p>
        {error && <p className="text-xs text-destructive-strong">{error}</p>}
        <Button
          size="sm"
          variant="outline"
         
          disabled={refreshing}
          onClick={() => void handleRefresh()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh cost references"}
        </Button>
      </CardContent>
    </Card>
  );
}

RefreshReferencesCard.displayName = "RefreshReferencesCard";
