import { DecisionSupportLabel } from "@/components/shared/decision-support-label";
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { useState, type FormEvent } from "react";
import { RequirementPurchase } from "@/features/finance/components/RequirementPurchase";
import { usePurchaseRequests } from "@/features/finance/hooks/use-purchase-requests";
import { useProcurement } from "@/features/finance/hooks/use-procurement";
import { useOpenOnAction } from "@/features/quick-search/useOpenOnAction";
import { FileText, ListChecks, Paperclip, Send, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KpiStrip } from "@/components/ui/kpi-strip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FEATURES } from "@/config/features";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { ProjectPicker } from "@/components/shared/project-picker";
import { FileListPicker } from "@/components/shared/file-list-picker";
import { uploadsRepository } from "@/features/uploads/repositories/uploads.repository";
import { openFileUrl } from "@/lib/file-url";
import { useRequirements } from "@/features/requirements/hooks/useRequirements";
import {
  REQUIREMENT_CATEGORIES,
  type Requirement,
  type RequirementAttachment,
  type RequirementCategory,
  type GenerateDraftInput,
  type RequirementDraft,
  type StructureRequirementInput,
  type StructuredRequirement,
  type StructuredRewrite,
  type StructuredSuggestion,
} from "@/features/requirements/types/requirements.types";
import { appendToSection, undoRewrite } from "@/features/requirements/lib/structured-format";
import { useAuth } from "@/auth/auth-context";
import { useStaffedProjectCodes } from "@/features/project-members/hooks/use-staffed-project-codes";
import { FileIntegrityBadge } from "@/features/uploads/components/FileIntegrityBadge";

const STATUS_TONE: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border",
  "Under Review": "bg-warning/15 text-warning-strong border-warning/30",
  Approved: "bg-success/10 text-success-strong border-success/20",
  Rejected: "bg-destructive/10 text-destructive-strong border-destructive/20",
};

/** Reads a File and stores it through POST /api/uploads. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function uploadAttachments(files: File[]): Promise<RequirementAttachment[]> {
  const uploaded: RequirementAttachment[] = [];
  for (const file of files) {
    const res = await uploadsRepository.upload(file.name, file.type || "application/octet-stream", await readAsDataUrl(file));
    uploaded.push({
      url: res.data.url,
      filename: res.data.filename,
      contentType: res.data.contentType,
      sizeBytes: res.data.sizeBytes,
    });
  }
  return uploaded;
}

function NewRequirementDialog({
  createRequirement,
  structureRequirement,
  generateDraft,
  engineerName,
  canStructure,
  allowedProjectCodes,
}: {
  createRequirement: (payload: {
    title: string;
    project: string;
    category: RequirementCategory;
    description: string;
    attachments: RequirementAttachment[];
    createdBy: string;
  }) => Promise<void>;
  structureRequirement: (input: StructureRequirementInput) => Promise<StructuredRequirement>;
  generateDraft: (input: GenerateDraftInput) => Promise<RequirementDraft>;
  engineerName: string;
  /** Rule-based structuring is for engineers/admins only (the endpoint refuses others). */
  canStructure: boolean;
  /** When set, the project picker offers only these (site personnel: projects they are staffed on). */
  allowedProjectCodes?: string[];
}) {
  const [open, setOpen] = useState(false);
  useOpenOnAction("new-requirement", () => setOpen(true));
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [category, setCategory] = useState<RequirementCategory | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [triedSubmit, setTriedSubmit] = useState(false);
  // "Structure with AI" (rule-based). before holds what the engineer typed so
  // the whole step can be undone; nothing is overwritten without a way back.
  const [structuring, setStructuring] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [before, setBefore] = useState<{ description: string; category: RequirementCategory | "" } | null>(null);
  const [suggestions, setSuggestions] = useState<StructuredSuggestion[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rewrites, setRewrites] = useState<StructuredRewrite[]>([]);

  // "Generate draft" (rule-based template packs). The draft is added to the text
  // box for the engineer to edit; Undo restores what was there before.
  const [generating, setGenerating] = useState(false);
  const [draftBasis, setDraftBasis] = useState<string[]>([]);

  const runGenerateDraft = async () => {
    if (!project || !category) return;
    setStructureError(null);
    setGenerating(true);
    try {
      const draft = await generateDraft({ projectCode: project, category });
      setBefore((current) => current ?? { description, category });
      setDescription(description.trim() ? `${description.trim()}

${draft.description}` : draft.description);
      setDraftBasis(draft.basis);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : "Could not generate a draft.");
    } finally {
      setGenerating(false);
    }
  };

  const clearStructuring = () => {
    setDraftBasis([]);
    setBefore(null);
    setSuggestions([]);
    setPicked(new Set());
    setRewrites([]);
    setStructureError(null);
  };

  const runStructure = async () => {
    setStructureError(null);
    setStructuring(true);
    try {
      const result = await structureRequirement({ text: description, title: title || undefined });
      // Re-structuring keeps the very first original so Undo goes all the way back.
      setBefore((current) => current ?? { description, category });
      setDescription(result.description);
      setCategory(result.category);
      setSuggestions(result.suggestions);
      setPicked(new Set());
      setRewrites(result.rewrites);
    } catch (err) {
      setStructureError(err instanceof Error ? err.message : "Could not structure the description.");
    } finally {
      setStructuring(false);
    }
  };

  const undoStructuring = () => {
    if (!before) return;
    setDescription(before.description);
    setCategory(before.category);
    clearStructuring();
  };

  const addSelectedSuggestions = () => {
    let next = description;
    for (const s of suggestions) {
      if (picked.has(s.text)) next = appendToSection(next, s.section, s.text);
    }
    setDescription(next);
    setSuggestions((current) => current.filter((s) => !picked.has(s.text)));
    setPicked(new Set());
  };

  const undoOneRewrite = (rewrite: StructuredRewrite) => {
    setDescription((current) => undoRewrite(current, rewrite));
    setRewrites((current) => current.filter((r) => r !== rewrite));
  };

  const reset = () => {
    clearStructuring();
    setTitle("");
    setProject("");
    setCategory("");
    setDescription("");
    setFiles([]);
    setFileError(null);
    setTriedSubmit(false);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    if (!title || !project || !category || !description) return;
    // A requirement — even a draft — has to carry its supporting file.
    if (files.length === 0) {
      setFileError("Attach at least one file.");
      return;
    }
    setSubmitting(true);
    try {
      const attachments = await uploadAttachments(files);
      await createRequirement({
        title,
        project,
        category,
        description,
        attachments,
        createdBy: engineerName,
      });
      toast.success("Requirement saved as draft");
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save requirement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New requirement</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Draft a requirement</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="req-title">Title</Label>
            <Input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Curtain wall thermal performance"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <ProjectPicker value={project} onChange={setProject} className="w-full" allowedCodes={allowedProjectCodes} />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as RequirementCategory)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {REQUIREMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="req-description">Description</Label>
              {FEATURES.ai && canStructure && (
                <div className="flex items-center gap-1">
                  {before && (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={undoStructuring}>
                      <Undo2 className="h-3 w-3" /> Undo structuring
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={generating || !project || !category}
                    title={!project || !category ? "Pick a project and a category first" : "Fill the text box from the template pack for this category and project type"}
                    onClick={() => void runGenerateDraft()}
                  >
                    <ListChecks className="h-3 w-3" /> {generating ? "Generating…" : "Generate draft"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={structuring || description.trim().length < 10}
                    title={description.trim().length < 10 ? "Write a rough description first (10+ characters)" : "Organize into Objectives, Materials, Constraints and Specifications"}
                    onClick={() => void runStructure()}
                  >
                    <Sparkles className="h-3 w-3" /> {structuring ? "Structuring…" : "Structure with AI"}
                  </Button>
                </div>
              )}
            </div>
            <Textarea
              id="req-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={before ? 10 : 4}
              required
            />
            {structureError && (
              <p role="alert" className="text-xs text-destructive-strong">
                {structureError} You can keep writing the description yourself.
              </p>
            )}
            {FEATURES.ai && canStructure && draftBasis.length > 0 && (
              <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <DecisionSupportLabel />
                  Draft from templates. Edit the [specify] blanks; nothing was saved.
                </p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {draftBasis.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            {FEATURES.ai && canStructure && before && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <DecisionSupportLabel />
                  Rule-based structuring. Review the text above; nothing was saved.
                </p>
                {rewrites.length > 0 && (
                  <ul className="space-y-1">
                    {rewrites.map((r) => (
                      <li key={r.from} className="flex items-start justify-between gap-2">
                        <span>
                          Reworded: <span className="font-medium">{r.from}</span> → {r.to}
                        </span>
                        <button type="button" className="shrink-0 text-primary-strong hover:underline" onClick={() => undoOneRewrite(r)}>
                          Undo
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {suggestions.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="font-medium">Commonly required, not mentioned yet</p>
                    {suggestions.map((s) => (
                      <label key={s.text} className="flex cursor-pointer items-start gap-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={picked.has(s.text)}
                          onCheckedChange={(on) =>
                            setPicked((current) => {
                              const next = new Set(current);
                              if (on) next.add(s.text);
                              else next.delete(s.text);
                              return next;
                            })
                          }
                        />
                        <span>
                          {s.text}
                          <span className="block text-muted-foreground">
                            {s.section} · {s.reason}
                          </span>
                        </span>
                      </label>
                    ))}
                    <Button type="button" size="sm" variant="secondary" className="h-7 text-xs" disabled={picked.size === 0} onClick={addSelectedSuggestions}>
                      Add selected
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No further common elements to suggest.</p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>
              Supporting file <span className="text-destructive-strong">*</span>
            </Label>
            <FileListPicker
              files={files}
              onChange={(next) => {
                setFiles(next);
                if (next.length > 0) setFileError(null);
              }}
              onError={setFileError}
              disabled={submitting}
              invalid={triedSubmit && files.length === 0}
            />
            {fileError && <p role="alert" className="text-xs text-destructive-strong">{fileError}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save as draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function RequirementsPage() {
  const { user } = useAuth();
  const { requirements, loading, counts, pagination, createRequirement, submitRequirement, addAttachments, structureRequirement, generateDraft } =
    useRequirements();
  const [busyId, setBusyId] = useState<number | null>(null);
  const role = user?.role;
  const isSitePersonnel = role === "site-personnel";
  const canCreate = role === "engineer" || role === "admin" || isSitePersonnel;
  // Purchasing: Engineers raise requests, Engineers and Site Personnel confirm what arrives.
  // Nothing is fetched for any other role. The server scopes both lists to staffed projects.
  const followsPurchasing = role === "engineer" || isSitePersonnel;
  const purchasing = { requests: usePurchaseRequests(followsPurchasing), orders: useProcurement(followsPurchasing) };
  const { codes: staffedSiteCodes } = useStaffedProjectCodes("site-personnel");
  // Site personnel submit only drafts they wrote themselves (requirements
  // store the author as a display name); engineers/admins submit any draft.
  const canSubmit = (r: Requirement) =>
    role === "engineer" || role === "admin" || (isSitePersonnel && r.createdBy.trim().toLowerCase() === (user?.name ?? "").trim().toLowerCase());

  const submitForApproval = async (r: Requirement) => {
    setBusyId(r.dbId);
    try {
      await submitRequirement(r.dbId);
      toast.success("Submitted — it's now in the Project Manager's approval queue");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit requirement");
    } finally {
      setBusyId(null);
    }
  };

  // Older drafts may have no file on record; let the engineer add one so the
  // draft can be submitted.
  const attachTo = async (r: Requirement, picked: FileList | null) => {
    if (!picked || picked.length === 0) return;
    setBusyId(r.dbId);
    try {
      await addAttachments(r, await uploadAttachments(Array.from(picked)));
      toast.success("File attached");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to attach file");
    } finally {
      setBusyId(null);
    }
  };

  const { approved, underReview, drafts } = counts;

  return (
    <PageContainer>
      <PageHeader
        title="Requirements"
        description="Manage project requirements and specifications"
        actions={
          canCreate ? (
            <NewRequirementDialog
              createRequirement={createRequirement}
              structureRequirement={structureRequirement}
              generateDraft={generateDraft}
              engineerName={user?.name ?? "Unknown"}
              canStructure={!isSitePersonnel}
              allowedProjectCodes={isSitePersonnel ? staffedSiteCodes : undefined}
            />
          ) : undefined
        }
      />
      <PageContent className="space-y-6 p-6 md:p-8">
        <KpiStrip
          items={[
            {
              label: "Total requirements",
              value: loading ? "…" : `${counts.total}`,
              icon: ListChecks,
              hint: "on file",
            },
            {
              label: "Approved",
              value: loading ? "…" : `${approved}`,
              icon: FileText,
              tone: "good",
            },
            {
              label: "Under review",
              value: loading ? "…" : `${underReview}`,
              icon: FileText,
              tone: underReview > 0 ? "warn" : "neutral",
            },
            {
              label: "Drafts",
              value: loading ? "…" : `${drafts}`,
              icon: FileText,
              hint: "not yet submitted",
            },
          ]}
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All requirements</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-5 text-sm text-muted-foreground">Loading requirements…</div>
            ) : requirements.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No requirements drafted yet.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {requirements.map((r) => (
                  <div key={r.id} className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.id} · {r.project} · {r.category}
                        </div>
                        <div className="text-sm font-medium">{r.title}</div>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-overline font-medium ${
                          STATUS_TONE[r.status]
                        }`}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{r.description}</p>
                    {followsPurchasing && (
                      <RequirementPurchase
                        requirement={{ dbId: r.dbId, title: r.title, project: r.project, category: r.category, status: r.status }}
                        purchasing={purchasing}
                        canRaise={role === "engineer"}
                        canReceive
                        routingHint="It goes to the Project Manager to endorse, then to Finance to approve."
                      />
                    )}
                    {r.attachments.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {r.attachments.map((a) => (
                          <li key={a.url} className="flex items-center gap-1">
                            <button
                              type="button"
                              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-primary-strong hover:bg-muted/40"
                              onClick={() => void openFileUrl(a.url).catch((err: Error) => toast.error(err.message))}
                            >
                              <Paperclip className="h-3 w-3" /> {a.filename}
                            </button>
                            <FileIntegrityBadge url={a.url} />
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-muted-foreground">
                        {r.createdBy} · {r.updatedAgo}
                      </div>
                      {r.status === "Draft" && canSubmit(r) && (
                        <div className="flex items-center gap-2">
                          {r.attachments.length === 0 && (
                            <label className="cursor-pointer text-xs text-primary-strong hover:underline">
                              Attach a file to submit
                              <input
                                type="file"
                                className="hidden"
                                disabled={busyId === r.dbId}
                                onChange={(e) => {
                                  void attachTo(r, e.target.files);
                                  e.target.value = "";
                                }}
                              />
                            </label>
                          )}
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={busyId === r.dbId || r.attachments.length === 0}
                            title={r.attachments.length === 0 ? "Attach a file before submitting" : "Send to the Project Manager for approval"}
                            onClick={() => void submitForApproval(r)}
                          >
                            <Send className="h-3 w-3" /> {busyId === r.dbId ? "Working…" : "Submit for approval"}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="border-t border-border px-4 py-3">
                  <DataTablePagination {...pagination} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageContent>
    </PageContainer>
  );
}

RequirementsPage.displayName = "RequirementsPage";