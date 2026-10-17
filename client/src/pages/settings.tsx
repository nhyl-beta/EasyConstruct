// Personal settings for the signed-in user (client demo change #8). One switch for now: whether overdue
// reminders (RFI/RFA, stalled approvals, missing reports) are also emailed. The in-app alert is sent either way.
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { useAuth } from "@/auth/auth-context";
import { apiClient } from "@/services/api.client";

async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const json = await p;
  return (json && typeof json === "object" && "data" in json ? (json as { data: T }).data : json) as T;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [value, setValue] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    unwrap<{ emailOverdueReminders: boolean }>(apiClient.get("/me/settings"))
      .then((s) => setValue(s.emailOverdueReminders))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load your settings"));
  }, []);

  const change = async (next: boolean) => {
    const previous = value;
    setValue(next);
    setSaving(true);
    try {
      const saved = await unwrap<{ emailOverdueReminders: boolean }>(apiClient.patch("/me/settings", { emailOverdueReminders: next }));
      setValue(saved.emailOverdueReminders);
      toast.success(saved.emailOverdueReminders ? "Overdue reminders will be emailed to you" : "Overdue reminders will not be emailed to you");
    } catch (e) {
      setValue(previous);
      toast.error(e instanceof Error ? e.message : "Couldn't save the setting");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Your own preferences." />
      <PageContent className="space-y-6 p-6 md:p-8">
        <SectionCard title="Notifications">
          {error && <p className="text-sm text-destructive-strong">{error}</p>}
          {!error && value === null && <Skeleton className="h-10 w-full max-w-md" />}
          {value !== null && (
            <div className="flex max-w-xl items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="email-overdue">Email me overdue reminders</Label>
                <p className="text-xs text-muted-foreground">
                  When an RFI/RFA, an approval or a report assigned to you is overdue, also send one summary email a day that lists everything overdue for you. You always get the in-app alerts.{user?.role === "admin" && " As an Admin you receive your own items plus a daily overview of all projects."}
                </p>
              </div>
              <Switch id="email-overdue" checked={value} disabled={saving} onCheckedChange={(v) => void change(v)} />
            </div>
          )}
        </SectionCard>
      </PageContent>
    </PageContainer>
  );
}
