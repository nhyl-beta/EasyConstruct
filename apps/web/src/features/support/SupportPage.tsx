import { useState } from "react";
import { Link } from "react-router";
import { LifeBuoy, Wrench } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/auth/auth-context";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/ui/section-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useServerList } from "@/hooks/use-server-list";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { apiClient } from "@/services/api.client";
import { SUPPORT_CATEGORIES, categoryLabel, supportApi, type SupportRequest, type SupportStatus } from "./support-api";

const STATUS_LABEL: Record<SupportStatus, string> = { open: "Open", in_progress: "In progress", resolved: "Resolved", declined: "Declined" };
const STATUS_TONE: Record<SupportStatus, string> = {
  open: "border-warning/30 bg-warning/15 text-warning-strong",
  in_progress: "border-primary/20 bg-primary/10 text-primary-strong",
  resolved: "border-success/20 bg-success/10 text-success-strong",
  declined: "border-destructive/20 bg-destructive/10 text-destructive-strong",
};
const ALL = "all";

/**
 * User Support, the same page for every role. It is for ACCOUNT help only (password reset, email or name
 * change, role or access change, sign-in problems). Site reports written by engineers live on the Reports tab.
 * Anyone can send a request; only IT Designer can act on one (Admin can read the inbox).
 */
export default function SupportPage() {
  const { user } = useAuth();
  const isIt = user?.role === "it-designer";
  const seesAll = isIt || user?.role === "admin";

  const [status, setStatus] = useState<string>(ALL);
  const list = useServerList<SupportRequest>({
    key: (params) => ["support-requests", params],
    filters: { status },
    fetchPage: async (params, signal) => {
      const qs = new URLSearchParams({ page: String(params.page), limit: String(params.limit) });
      if (params.search) qs.set("search", params.search);
      if (status !== ALL) qs.set("status", status);
      const json = await apiClient.get(`/support-requests?${qs.toString()}`, { signal });
      return { items: (json?.data ?? []) as SupportRequest[], total: json?.meta?.total ?? 0, pages: json?.meta?.pages };
    },
  });

  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const canSend = category !== "" && subject.trim().length >= 3 && details.trim().length >= 5 && !sending;

  const send = async () => {
    setSending(true);
    try {
      await supportApi.create({ category, subject: subject.trim(), details: details.trim() });
      toast.success("Request sent to IT");
      setCategory("");
      setSubject("");
      setDetails("");
      await list.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the request");
    } finally {
      setSending(false);
    }
  };

  const act = async (r: SupportRequest, next: SupportStatus) => {
    try {
      await supportApi.update(r.id, { status: next });
      toast.success(`Marked ${STATUS_LABEL[next].toLowerCase()}`);
      await list.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the request");
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="User support"
        description="Account help only: password resets, email or name changes, role or access changes and sign-in problems. IT makes the changes."
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        <SectionCard title="Send a request to IT" subtitle="Only IT can change accounts. Site reports from engineers are on the Reports tab, not here.">
          <div className="grid max-w-2xl gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="support-category">What do you need?</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="support-category" className="w-full sm:w-72">
                  <SelectValue placeholder="Choose a type" />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="support-subject">Subject</Label>
              <Input id="support-subject" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="Short summary" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="support-details">Details</Label>
              <Textarea id="support-details" value={details} maxLength={2000} rows={4} onChange={(e) => setDetails(e.target.value)} placeholder="What do you need changed, and why?" />
            </div>
            <div>
              <Button onClick={() => void send()} disabled={!canSend}>
                <LifeBuoy className="h-4 w-4" /> {sending ? "Sending…" : "Send request"}
              </Button>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={seesAll ? "All support requests" : "My requests"}
          subtitle={isIt ? "You can start, resolve or decline each request." : seesAll ? "Read only. IT handles requests." : undefined}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              aria-label="Search requests"
              placeholder={seesAll ? "Search subject or requester…" : "Search subject…"}
              value={list.searchInput}
              onChange={(e) => list.setSearchInput(e.target.value)}
              className="h-9 w-64 text-xs"
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filter by status" className="h-9 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as SupportStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {list.loading && list.pageItems.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!list.loading && list.pageItems.length === 0 && (
            <p className="text-sm text-muted-foreground">{seesAll ? "No requests yet." : "You haven't sent any requests."}</p>
          )}
          {list.pageItems.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-overline uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5">Request</th>
                    {seesAll && <th className="px-3 py-2.5">From</th>}
                    <th className="px-3 py-2.5">Type</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Sent</th>
                    {isIt && <th className="px-4 py-2.5" />}
                  </tr>
                </thead>
                <tbody>
                  {list.pageItems.map((r) => (
                    <tr key={r.id} className="border-b border-border align-top last:border-0">
                      <td className="max-w-md px-4 py-3">
                        <div className="font-medium">{r.subject}</div>
                        <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{r.details}</div>
                        {r.resolutionNote && <div className="mt-1 text-xs">IT: {r.resolutionNote}</div>}
                      </td>
                      {seesAll && (
                        <td className="px-3 py-3 text-xs">
                          <div>{r.requesterName}</div>
                          <div className="capitalize text-muted-foreground">{r.requesterRole.replace(/-/g, " ")}</div>
                        </td>
                      )}
                      <td className="px-3 py-3 text-xs text-muted-foreground">{categoryLabel(r.category)}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className={`rounded-full text-overline ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">{formatRelativeTime(r.createdAt)}</td>
                      {isIt && (
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {r.status === "open" && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void act(r, "in_progress")}>Start</Button>}
                            {(r.status === "open" || r.status === "in_progress") && (
                              <>
                                <Button size="sm" className="h-7 text-xs" onClick={() => void act(r, "resolved")}>Resolve</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void act(r, "declined")}>Decline</Button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-border px-2 py-3">
                <DataTablePagination {...list} />
              </div>
            </div>
          )}
        </SectionCard>

        <Link to="/resources" className="block max-w-md">
          <Card className="transition hover:border-primary/40">
            <CardContent className="flex items-center gap-3 p-5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-medium">Resources</h3>
                <p className="text-xs text-muted-foreground">Shared tools and templates</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </PageContent>
    </PageContainer>
  );
}
