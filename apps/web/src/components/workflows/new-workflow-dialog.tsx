// src/components/workflows/new-workflow-dialog.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectPicker } from "@/components/shared/project-picker";
import { UserRepository, type PublicUser } from "@/features/users/repositories/user.repository";
import { useBudgetsController } from "@/features/finance/budgets/controllers/budget.controllers";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { useAuth } from "@/auth/auth-context";
import type { CreateWorkflowInput, WorkflowTemplate } from "@/features/workflows/types/workflow.types";

// Q1/H3: the one place "Project Closeout" is special-cased on the client —
// mirrors workflows/service.ts's own rule (only Engineer/Admin, and only
// once the project is in Closeout) so the dialog can refuse to submit
// something the server is only going to reject anyway, instead of letting
// the user find out from a swallowed error.
const CLOSEOUT_TEMPLATE_NAME = "Project Closeout";
const CLOSEOUT_ALLOWED_ROLES = new Set(["engineer", "admin"]);

interface NewWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: WorkflowTemplate[];
  creating: boolean;
  onSubmit: (input: CreateWorkflowInput) => Promise<unknown>;
  /** Q1: the create/update error from the caller's own hook state — shown
   * inline instead of the dialog silently closing on a rejected create. */
  error?: Error | null;
  /** C1: pre-select a template by exact name (e.g. from the Closeout
   * summary card's "Start Project Closeout workflow" action). */
  presetTemplateName?: string;
  /** C1: pre-select a project by code, same source as presetTemplateName. */
  presetProjectCode?: string;
  /** C1: when true, the Template and Project fields are fixed and cannot be
   * changed — the dialog was opened for one specific thing, not a blank
   * "New workflow" form. */
  lockPreset?: boolean;
  /** Pre-fill the title (e.g. a change order raised from an RFI). */
  presetTitle?: string;
  /** Pre-fill the amount. */
  presetAmount?: number;
}

export function NewWorkflowDialog({
  open,
  onOpenChange,
  templates,
  creating,
  onSubmit,
  error,
  presetTemplateName,
  presetProjectCode,
  lockPreset,
  presetTitle,
  presetAmount,
}: NewWorkflowDialogProps) {
  const { user } = useAuth();
  const { projects } = useProjects();
  const [title, setTitle] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [type, setType] = useState("");
  // Keyed by stage sequence (1-based, matching stageAssignments/service.ts),
  // value is the assignee's display name (assignedTo is a free-text varchar,
  // same as everywhere else this column is populated).
  const [stageAssignments, setStageAssignments] = useState<Record<string, string>>({});
  const [usersByRole, setUsersByRole] = useState<Record<string, PublicUser[]>>({});
  const [budgetId, setBudgetId] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === templateId) ?? null,
    [templates, templateId],
  );

  // C1: re-apply the preset every time the dialog opens, not just on first
  // mount — the same dialog instance is reused for both the general "New
  // workflow" button and the Closeout summary card's preset action.
  useEffect(() => {
    if (!open) return;
    if (presetProjectCode) setProjectCode(presetProjectCode);
    if (presetTitle) setTitle(presetTitle);
    if (presetAmount != null) setAmount(String(presetAmount));
    if (presetTemplateName) {
      const match = templates.find((t) => t.name === presetTemplateName);
      if (match) setTemplateId(String(match.id));
    }
  }, [open, presetProjectCode, presetTemplateName, presetTitle, presetAmount, templates]);

  const role = user?.role;
  const selectedProject = useMemo(
    () => projects.find((p) => p.code === projectCode) ?? null,
    [projects, projectCode],
  );
  const isCloseoutTemplate = selectedTemplate?.name === CLOSEOUT_TEMPLATE_NAME;

  // Q1/H3: mirrors the server's own two Closeout preconditions exactly, so
  // the reason shown here always matches what workflows/service.ts would
  // actually reject with — computed client-side to disable submission
  // rather than round-tripping to find out.
  const closeoutBlockReason = useMemo(() => {
    if (!isCloseoutTemplate) return null;
    if (!role || !CLOSEOUT_ALLOWED_ROLES.has(role)) {
      return "Only the Engineer (or Admin) can start a Project Closeout workflow.";
    }
    if (selectedProject && selectedProject.status !== "Closeout") {
      return `This project isn't in the Closeout phase yet (currently "${selectedProject.status}"). Advance it to Closeout first.`;
    }
    return null;
  }, [isCloseoutTemplate, role, selectedProject]);

  // B2: Project Closeout only ever makes sense for Engineer/Admin — hidden
  // from the template list for every other role rather than left visible
  // and guaranteed to fail. Never hidden from Admin.
  const visibleTemplates = useMemo(
    () =>
      templates.filter(
        (t) => t.name !== CLOSEOUT_TEMPLATE_NAME || (role && CLOSEOUT_ALLOWED_ROLES.has(role)),
      ),
    [templates, role],
  );

  // G4: a Budget Change Request workflow needs to know which budget its
  // approval should sync (budgets.planned + a budget_adjustments row) —
  // every other template has nothing to link, so this only shows here.
  const isBudgetChangeRequest = selectedTemplate?.name === "Budget Change Request";
  const { budgets } = useBudgetsController();
  const projectBudgets = useMemo(
    () => budgets.filter((b) => b.project === projectCode),
    [budgets, projectCode],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      setUsersByRole({});
      return;
    }
    let cancelled = false;
    const roles = Array.from(new Set(selectedTemplate.defaultStages.map((s) => s.role)));
    Promise.all(roles.map((role) => UserRepository.listByRole(role).then((users) => [role, users] as const)))
      .then((entries) => {
        if (!cancelled) setUsersByRole(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) setUsersByRole({});
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  const reset = () => {
    setTitle("");
    setProjectCode("");
    setTemplateId("");
    setAmount("");
    setType("");
    setStageAssignments({});
    setBudgetId("");
  };

  const handleSubmit = async () => {
    if (!title || !projectCode || !templateId || closeoutBlockReason) return;
    const cleanedAssignments = Object.fromEntries(
      Object.entries(stageAssignments).filter(([, v]) => v.trim().length > 0),
    );
    const created = await onSubmit({
      title,
      projectCode,
      templateId: Number(templateId),
      amount: amount ? Number(amount) : undefined,
      type: type || undefined,
      stageAssignments: Object.keys(cleanedAssignments).length ? cleanedAssignments : undefined,
      budgetId: isBudgetChangeRequest && budgetId ? Number(budgetId) : undefined,
    });

    // Q1: a rejected create (403/409/etc.) returns a falsy result from the
    // caller's hook — previously reset()+close ran unconditionally here, so
    // the dialog looked like it had succeeded no matter what the server
    // said. Now it only resets and closes on an actual success; on failure
    // the form stays exactly as the user left it and `error` (passed down
    // from the caller's hook state) renders below.
    if (created) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New workflow</DialogTitle>
          <DialogDescription>
            Initiate an approval pipeline from an existing template.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="wf-title">Title</Label>
            <Input
              id="wf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Steel erection — subcontractor proposal"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Project</Label>
            {/* Was a free-text "project code" box: a typo produced a workflow
                whose projectCode matched no real project, so it never showed
                up in any project-scoped view and could not be traced back to
                the job it belonged to. Same picker the rest of the app uses,
                backed by /api/projects. */}
            <ProjectPicker
              value={projectCode}
              onChange={setProjectCode}
              className="w-full"
              disabled={lockPreset}
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Template</Label>
            <Select
              value={templateId}
              onValueChange={(v) => {
                setTemplateId(v);
                setStageAssignments({});
              }}
              disabled={lockPreset}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a workflow template" />
              </SelectTrigger>
              <SelectContent>
                {visibleTemplates.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {closeoutBlockReason && (
            <p
              role="alert"
              className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning-strong"
            >
              {closeoutBlockReason}
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong"
            >
              {error.message}
            </p>
          )}

          {isBudgetChangeRequest && (
            <div className="grid gap-1.5">
              <Label>Budget to change</Label>
              <Select value={budgetId || undefined} onValueChange={setBudgetId}>
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      !projectCode
                        ? "Select a project first"
                        : projectBudgets.length === 0
                          ? "No budgets on file for this project"
                          : "Select a budget"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {projectBudgets.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.category} · {b.fiscalYear} · ₱{b.planned.toLocaleString()} planned
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                On final approval, this budget's planned amount is updated by the line items' requested delta.
              </p>
            </div>
          )}

          {selectedTemplate && (
            <div className="grid gap-2 rounded-lg border border-border p-3">
              <Label className="text-xs text-muted-foreground">
                Assign stages (optional)
              </Label>
              {selectedTemplate.defaultStages.map((stage, index) => {
                const sequence = String(index + 1);
                const candidates = usersByRole[stage.role] ?? [];
                return (
                  <div key={sequence} className="grid grid-cols-2 items-center gap-2">
                    <span className="text-sm text-muted-foreground">{stage.roleLabel}</span>
                    <SearchableSelect
                      value={stageAssignments[sequence] || undefined}
                      onValueChange={(v) =>
                        setStageAssignments((prev) => ({ ...prev, [sequence]: v }))
                      }
                      disabled={candidates.length === 0}
                      options={candidates.map((u) => ({ value: u.name, label: u.name, description: u.email }))}
                      placeholder={candidates.length === 0 ? "No users with this role" : "Unassigned"}
                      searchPlaceholder="Search people…"
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="wf-amount">Amount (optional)</Label>
              <Input
                id="wf-amount"
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1240000"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wf-type">Type (optional)</Label>
              <Input
                id="wf-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="Proposal"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={creating || !title || !projectCode || !templateId || !!closeoutBlockReason}
          >
            {creating ? "Starting…" : "Start workflow"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}