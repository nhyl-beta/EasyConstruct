// Public page behind the link in an Owner approval email: no sidebar, no login. The Owner reads what is being
// changed, by whom, and chooses Approve or Decline. Opening the page changes nothing; only the buttons decide.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  OwnerApprovalError,
  ownerApprovalsRepository,
  type ApprovalDecision,
  type ApprovalDetails,
} from "@/features/owner-approvals/repositories/owner-approvals.repository";

const formatWhen = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "long", timeStyle: "short" });

type Load = { state: "loading" } | { state: "ready"; data: ApprovalDetails } | { state: "refused"; message: string };

export default function OwnerApprovalPage() {
  const { token = "" } = useParams();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApprovalDecision | null>(null);

  useEffect(() => {
    document.title = "Approve an account change";
    let active = true;
    ownerApprovalsRepository
      .open(token)
      .then((data) => active && setLoad({ state: "ready", data }))
      .catch((e: unknown) => {
        if (!active) return;
        const err = e instanceof OwnerApprovalError ? e : null;
        setLoad({ state: "refused", message: err?.message ?? "We could not open this request. Please check your connection and try again." });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const decide = async (decision: "approve" | "decline") => {
    setBusy(decision);
    setError(null);
    try {
      setResult(await ownerApprovalsRepository.decide(token, decision));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-4 py-8">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <ShieldCheck className="h-4 w-4" /> EasyConstruct · Owner approval
      </div>

      {load.state === "loading" && <Skeleton className="h-64 w-full rounded-2xl" />}

      {load.state === "refused" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>This link can't be used</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      )}

      {load.state === "ready" && !result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{load.data.actionLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p>
              <strong>{load.data.requestedByName}</strong>
              {load.data.requestedByRole ? ` (${load.data.requestedByRole})` : ""} is asking to make this change to your account.
              Nothing happens unless you approve it.
            </p>
            {load.data.details.length > 0 && (
              <ul className="list-disc space-y-1 rounded-xl border bg-muted/40 py-3 pl-8 pr-4">
                {load.data.details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
              <dt>Requested</dt>
              <dd>{formatWhen(load.data.requestedAt)}</dd>
              <dt>Expires</dt>
              <dd>{formatWhen(load.data.expiresAt)}</dd>
            </dl>
            {error && (
              <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive-strong">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button variant="outline" disabled={busy !== null} onClick={() => void decide("decline")}>
                {busy === "decline" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Decline
              </Button>
              <Button disabled={busy !== null} onClick={() => void decide("approve")}>
                {busy === "approve" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Approve
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">If you did not expect this, choose Decline.</p>
          </CardContent>
        </Card>
      )}

      {result && (
        <Alert variant={result.decision === "approve" && !result.applied ? "destructive" : "default"}>
          {result.decision === "approve" && result.applied ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{result.decision === "approve" ? "Approved" : "Declined"}</AlertTitle>
          <AlertDescription>{result.message} You can close this page.</AlertDescription>
        </Alert>
      )}
    </main>
  );
}
