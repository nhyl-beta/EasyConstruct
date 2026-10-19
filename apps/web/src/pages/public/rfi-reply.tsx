// Public page behind the link in an RFI/RFA email (client demo change #6): no sidebar, no login. The
// recipient reads the request, answers, adds a name and position, attaches files and sends. It is built to be
// read and used on a phone, with the company name at the top.
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, Download, Loader2, Paperclip, Send, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PublicReplyError, publicReplyRepository, type PublicReplyRequest } from "@/features/public-reply/repositories/public-reply.repository";

const formatBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) : "Not set");

type Load = { state: "loading" } | { state: "ready"; data: PublicReplyRequest } | { state: "refused"; message: string; code?: string };

export default function RfiReplyPage() {
  const { token = "" } = useParams();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [answer, setAnswer] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = "Reply to a request";
    let active = true;
    publicReplyRepository
      .open(token)
      .then((data) => active && setLoad({ state: "ready", data }))
      .catch((e: unknown) => {
        if (!active) return;
        const err = e instanceof PublicReplyError ? e : null;
        setLoad({ state: "refused", message: err?.message ?? "We could not open this request. Please check your connection and try again.", code: err?.code });
      });
    return () => {
      active = false;
    };
  }, [token]);

  const data = load.state === "ready" ? load.data : null;
  const problems = useMemo(() => {
    const p: Record<string, string> = {};
    if (answer.trim().length < 3) p.answer = "Please type your answer.";
    if (name.trim().length < 2) p.name = "Please enter your name.";
    if (position.trim().length < 2) p.position = "Please enter your position.";
    if (data && files.length > data.maxFiles) p.files = `You can attach at most ${data.maxFiles} file${data.maxFiles === 1 ? "" : "s"}.`;
    const tooBig = data && files.find((f) => f.size > data.maxFileMb * 1024 * 1024);
    if (tooBig && data) p.files = `"${tooBig.name}" is larger than ${data.maxFileMb} MB.`;
    return p;
  }, [answer, name, position, files, data]);

  const submit = async () => {
    setTried(true);
    setError(null);
    if (Object.keys(problems).length > 0) return;
    setSending(true);
    try {
      await publicReplyRepository.submit(token, { answer: answer.trim(), name: name.trim(), position: position.trim(), files });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your reply could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center px-4 py-4">
          <p className="font-display text-lg font-semibold tracking-tight text-primary-strong">{data?.companyName ?? "EasyConstruct"}</p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {load.state === "loading" && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading the request">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {load.state === "refused" && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="size-4" aria-hidden />
            <AlertTitle>{load.code === "REPLY_LINK_USED" ? "Already answered" : load.code === "REPLY_LINK_EXPIRED" ? "This link has expired" : "We could not open this request"}</AlertTitle>
            <AlertDescription>{load.message}</AlertDescription>
          </Alert>
        )}

        {data && done && (
          <Alert role="status" className="border-success/40 text-success-strong">
            <CheckCircle2 className="size-4" aria-hidden />
            <AlertTitle>Thank you, your reply has been sent</AlertTitle>
            <AlertDescription>
              {data.requestNumber} has been answered. The project team can see your reply now. You can close this page.
            </AlertDescription>
          </Alert>
        )}

        {data && !done && (
          <>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {data.kind === "RFI" ? "Request for information" : "Request for approval"} · {data.requestNumber}
              </p>
              <h1 className="mt-1 text-xl font-semibold leading-tight">{data.subject}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.projectName} · please respond by {formatDate(data.dueDate)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Hello {data.recipientName}. You do not need an account to answer.</p>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">What we need from you</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="whitespace-pre-wrap text-sm">{data.requestText}</p>
                {data.attachments.length > 0 && (
                  <div>
                    <h2 className="text-xs font-medium text-muted-foreground">Attachments</h2>
                    <ul className="mt-1 space-y-1.5">
                      {data.attachments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                          <span className="min-w-0 truncate">
                            {a.filename} <span className="text-xs text-muted-foreground">({formatBytes(a.sizeBytes)})</span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => {
                              setDownloadError(null);
                              publicReplyRepository.downloadAttachment(token, a).catch((e: unknown) => setDownloadError(e instanceof Error ? e.message : "Could not download the file"));
                            }}
                          >
                            <Download className="h-4 w-4" /> Download
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {downloadError && (
                      <p role="alert" className="mt-1 text-xs text-destructive-strong">
                        {downloadError}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {!data.acceptsReply ? (
              <Alert role="status">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>This request is no longer waiting for an answer</AlertTitle>
                <AlertDescription>Please contact the sender if you still need to reply.</AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Your answer</CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    noValidate
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="rr-answer">Answer</Label>
                      <Textarea id="rr-answer" rows={6} value={answer} onChange={(e) => setAnswer(e.target.value)} disabled={sending} aria-invalid={tried && !!problems.answer} maxLength={10000} />
                      {tried && problems.answer && <p className="text-xs text-destructive-strong">{problems.answer}</p>}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="rr-name">Your name</Label>
                        <Input id="rr-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} disabled={sending} aria-invalid={tried && !!problems.name} maxLength={100} />
                        {tried && problems.name && <p className="text-xs text-destructive-strong">{problems.name}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="rr-position">Your position</Label>
                        <Input id="rr-position" autoComplete="organization-title" value={position} onChange={(e) => setPosition(e.target.value)} disabled={sending} aria-invalid={tried && !!problems.position} maxLength={100} />
                        {tried && problems.position && <p className="text-xs text-destructive-strong">{problems.position}</p>}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Attach files (optional)</Label>
                      <input
                        ref={fileRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const picked = Array.from(e.target.files ?? []);
                          setFiles((prev) => [...prev, ...picked]);
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                      />
                      <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={sending}>
                        <Paperclip className="h-4 w-4" /> Attach files
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        Up to {data.maxFiles} file{data.maxFiles === 1 ? "" : "s"}, {data.maxFileMb} MB each. PDF, Word, Excel, images, CAD.
                      </p>
                      {files.length > 0 && (
                        <ul className="space-y-1">
                          {files.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-sm">
                              <span className="min-w-0 truncate">
                                {f.name} <span className="text-xs text-muted-foreground">({formatBytes(f.size)})</span>
                              </span>
                              <button type="button" aria-label={`Remove ${f.name}`} className="shrink-0 text-muted-foreground hover:text-destructive-strong" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} disabled={sending}>
                                <X className="h-4 w-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {tried && problems.files && <p className="text-xs text-destructive-strong">{problems.files}</p>}
                    </div>

                    {error && (
                      <Alert variant="destructive" role="alert">
                        <AlertCircle className="size-4" aria-hidden />
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    )}

                    <Button type="submit" className="w-full sm:w-auto" disabled={sending}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {sending ? "Sending…" : "Send reply"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

RfiReplyPage.displayName = "RfiReplyPage";
