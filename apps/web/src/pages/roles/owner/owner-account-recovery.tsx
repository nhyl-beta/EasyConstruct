// apps/web/src/pages/roles/owner/owner-account-recovery.tsx — NEW
//
// "Fail-Safe Account Recovery": Owner is otherwise read-only (see
// role-tab.ts), but if the IT Designer account itself is the one locked out,
// no other account-management role can fix that — IT Designer IS account
// management. This is a narrow, one-directional exception: Owner may recover
// the IT Designer account only, and the confirmation link is delivered to
// the OWNER's own registered email, never the IT Designer's.
import { useState } from "react";
import { KeyRound, Mail, ShieldAlert, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { useAccountRecovery } from "@/features/account-recovery/hooks/use-account-recovery";

export default function OwnerAccountRecoveryPage() {
  const { targets, loading, sending, sent, error, sendRecoveryEmail } = useAccountRecovery();
  const [sentFor, setSentFor] = useState<number | null>(null);

  return (
    <PageContainer>
      <PageHeader
        title="Fail-safe account recovery"
        description="Recover the IT Designer account if it becomes locked out. A confirmation link is sent to your own registered email — not the IT Designer's — so you can complete the reset yourself."
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
          <p className="text-muted-foreground">
            This is a last-resort control, not a general password reset. It only ever targets IT
            Designer accounts, and every use is recorded in the{" "}
            <span className="font-medium text-foreground">Audit Trail</span>.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive-strong">
            {error}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UserCog className="h-4 w-4 text-muted-foreground" />
            IT Designer account
          </h3>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && targets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No IT Designer account exists to recover.
            </p>
          )}

          {!loading &&
            targets.map((t) => (
              <Card key={t.id}>
                <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{t.name}</span>
                      <Badge
                        variant="outline"
                        className={`rounded-full text-overline ${
                          t.isActive
                            ? "border-success/30 bg-success/10 text-success-strong"
                            : "border-destructive/30 bg-destructive/10 text-destructive-strong"
                        }`}
                      >
                        {t.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{t.email}</p>
                  </div>
                  <Button
                    size="sm"
                   
                    disabled={sending}
                    onClick={async () => {
                      setSentFor(t.id);
                      await sendRecoveryEmail(t.id);
                    }}
                  >
                    <KeyRound className="h-4 w-4" />
                    {sending && sentFor === t.id ? "Sending…" : "Send recovery email"}
                  </Button>
                </CardContent>
              </Card>
            ))}
        </div>

        {sent && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4 text-sm"
          >
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-success-strong" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                Recovery email sent to {sent.to}
              </p>
              <p className="text-muted-foreground">
                Open it from your inbox and use the link to set a new password for{" "}
                <span className="font-medium text-foreground">
                  {sent.targetName} ({sent.targetEmail})
                </span>
                . The link expires in 30 minutes, works once, and signs that account out everywhere
                when used. Check your spam folder if it doesn't arrive within a minute.
              </p>
            </div>
          </div>
        )}
      </PageContent>
    </PageContainer>
  );
}

OwnerAccountRecoveryPage.displayName = "OwnerAccountRecoveryPage";
