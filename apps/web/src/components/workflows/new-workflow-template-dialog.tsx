// apps/web/src/components/workflows/new-workflow-template-dialog.tsx
//
// Admin/IT Designer defining a NEW workflow template — the steps/roles/order
// a workflow can later be started from. admin-workflow-configuration.tsx was
// entirely read-only ("configured read-only here" was the literal copy on
// the page) — the set of templates a workflow could ever be raised from was
// whatever had been seeded into the database, with no way to add another
// without a migration.
import { useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WORKFLOW_STAGE_ICONS } from "@/components/workflows/workflow-stage-pipeline";
import type { CreateWorkflowTemplateInput } from "@/features/workflows/types/workflow.types";

// The roles a workflow stage can actually be decided by — matches the
// `requireRole()` slugs used on every protected route across the API
// (apps/api/src/**/routes.ts), not a display label. Owner is deliberately
// absent: every role in the app is read-only-oversight-only elsewhere and
// never appears as a decision-maker on any seeded template's stage.
const STAGE_ROLES: { value: string; label: string }[] = [
  { value: "project-manager", label: "Project Manager" },
  { value: "admin", label: "Admin" },
  { value: "finance-manager", label: "Finance Manager" },
  { value: "human-resources", label: "Human Resources" },
  { value: "architect", label: "Architect" },
  { value: "engineer", label: "Engineer" },
  { value: "consultant", label: "Consultant" },
  { value: "site-personnel", label: "Site Personnel" },
  { value: "it-designer", label: "IT Designer" },
];

// The only icon keys the stage-pipeline UI actually maps to a real icon
// (see components/workflows/workflow-stage-pipeline.tsx's
// WORKFLOW_STAGE_ICONS) — anything else silently falls back to a default,
// so the picker only offers ones that render distinctly.
//
// The keys are component names (`UserCheck`), which is what the tester saw
// listed verbatim. What a person picks is the kind of step, so each key gets
// a readable label, and the roles allowed to hold it (same rules as
// createWorkflowTemplateSchema on the server, which is the authority).
const STEP_TYPES: { key: string; label: string; hint: string; roles: string[] | null }[] = [
  { key: "UserCheck", label: "Review", hint: "Checks and comments on the request", roles: null },
  { key: "FileSignature", label: "Submission", hint: "Prepares or submits the paperwork", roles: null },
  { key: "Wallet", label: "Financial review", hint: "Checks cost and budget impact", roles: ["finance-manager"] },
  { key: "ShieldCheck", label: "Sign-off", hint: "Final approval authority", roles: ["project-manager", "admin"] },
];

const stepTypesForRole = (role: string) =>
  STEP_TYPES.filter((t) => !t.roles || t.roles.includes(role));

/** A role's natural step type — chosen for it when the role is picked. */
const DEFAULT_STEP_TYPE_BY_ROLE: Record<string, string> = {
  "finance-manager": "Wallet",
  "project-manager": "ShieldCheck",
  admin: "ShieldCheck",
  architect: "FileSignature",
  engineer: "FileSignature",
};

const MAX_STAGES = 10;

interface DraftStage {
  role: string;
  roleLabel: string;
  iconKey: string;
}

// No step type until a role is chosen: the old default of "UserCheck" meant a
// stage looked configured before anyone had decided what it was.
const emptyStage = (): DraftStage => ({ role: "", roleLabel: "", iconKey: "" });

export interface NewWorkflowTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creating: boolean;
  onSubmit: (input: CreateWorkflowTemplateInput) => Promise<unknown>;
}

export function NewWorkflowTemplateDialog({
  open,
  onOpenChange,
  creating,
  onSubmit,
}: NewWorkflowTemplateDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avgDurationHours, setAvgDurationHours] = useState("24");
  const [stages, setStages] = useState<DraftStage[]>([emptyStage(), emptyStage()]);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setAvgDurationHours("24");
    setStages([emptyStage(), emptyStage()]);
    setError(null);
  };

  const updateStage = (index: number, patch: Partial<DraftStage>) =>
    setStages((prev) => prev.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));

  const handleRoleChange = (index: number, role: string) => {
    const roleLabel = STAGE_ROLES.find((r) => r.value === role)?.label ?? "";
    // Keep the current step type if this role may hold it, otherwise fall
    // back to the role's natural one.
    const current = stages[index]?.iconKey ?? "";
    const allowed = stepTypesForRole(role).some((t) => t.key === current);
    updateStage(index, {
      role,
      roleLabel,
      iconKey: allowed ? current : (DEFAULT_STEP_TYPE_BY_ROLE[role] ?? "UserCheck"),
    });
  };

  const moveStage = (index: number, direction: -1 | 1) => {
    setStages((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSubmit = async () => {
    setError(null);

    if (!name.trim()) {
      setError("Give the template a name.");
      return;
    }
    if (!description.trim()) {
      setError("Give the template a short description.");
      return;
    }
    const hours = Number(avgDurationHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError("Average duration must be a positive number of hours.");
      return;
    }
    if (stages.length < 2) {
      setError("A template needs at least two stages — one to decide is really just self-approval.");
      return;
    }
    if (stages.some((s) => !s.role)) {
      setError("Every stage needs a role assigned to it.");
      return;
    }
    if (stages.some((s) => !s.iconKey)) {
      setError("Every stage needs a step type.");
      return;
    }
    const roles = stages.map((s) => s.role);
    const repeated = roles.find((r, i) => roles.indexOf(r) !== i);
    if (repeated) {
      const label = STAGE_ROLES.find((r) => r.value === repeated)?.label ?? repeated;
      setError(`${label} is assigned to more than one stage. Each role can decide only one stage of a template.`);
      return;
    }

    const created = await onSubmit({
      name: name.trim(),
      description: description.trim(),
      avgDurationHours: hours,
      defaultStages: stages.map((s) => ({
        role: s.role,
        roleLabel: s.roleLabel,
        iconKey: s.iconKey,
      })),
    });

    if (!created) return;
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New workflow template</DialogTitle>
          <DialogDescription>
            Define the stage sequence — who decides, in what order — that a
            new workflow can be started from.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive-strong"
            >
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Site safety incident review"
                disabled={creating}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tpl-hours">Average duration (hours)</Label>
              <Input
                id="tpl-hours"
                type="number"
                min="1"
                value={avgDurationHours}
                onChange={(e) => setAvgDurationHours(e.target.value)}
                disabled={creating}
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tpl-description">Description</Label>
            <Textarea
              id="tpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this workflow is for and when it should be used."
              className="min-h-20"
              disabled={creating}
            />
          </div>

          <div className="grid gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Stages, in order ({stages.length}/{MAX_STAGES})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                disabled={creating || stages.length >= MAX_STAGES}
                onClick={() => setStages((prev) => [...prev, emptyStage()])}
              >
                <Plus className="h-3.5 w-3.5" /> Add stage
              </Button>
            </div>

            {stages.map((stage, index) => (
              <div
                key={index}
                className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg bg-muted/30 p-2"
              >
                <div className="flex flex-col items-center text-muted-foreground">
                  <GripVertical className="h-3.5 w-3.5" />
                  <span className="text-overline tabular-nums">{index + 1}</span>
                </div>
                <Select
                  value={stage.role}
                  onValueChange={(v) => handleRoleChange(index, v)}
                  disabled={creating}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_ROLES.map((r) => (
                      <SelectItem
                        key={r.value}
                        value={r.value}
                        // A role already holding another stage is not offered
                        // again (see the one-stage-per-role rule).
                        disabled={stages.some((s, i) => i !== index && s.role === r.value)}
                      >
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={stage.iconKey || undefined}
                  onValueChange={(v) => updateStage(index, { iconKey: v })}
                  disabled={creating || !stage.role}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={stage.role ? "Step type" : "Pick a role first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {stepTypesForRole(stage.role).map((type) => {
                      const Icon = WORKFLOW_STAGE_ICONS[type.key];
                      return (
                        <SelectItem key={type.key} value={type.key}>
                          <span className="flex items-center gap-2">
                            {Icon && <Icon className="h-3.5 w-3.5" />}
                            {type.label}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {/* Reorder arrows sit in their own grid cell, beside the
                    selects, instead of a 2rem column the old row squeezed
                    them into (which is what pushed them out of the row). */}
                <div className="flex items-center">
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    disabled={creating || index === 0}
                    onClick={() => moveStage(index, -1)}
                    title="Move up"
                    aria-label={`Move stage ${index + 1} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    disabled={creating || index === stages.length - 1}
                    onClick={() => moveStage(index, 1)}
                    title="Move down"
                    aria-label={`Move stage ${index + 1} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive-strong hover:text-destructive-strong"
                  disabled={creating || stages.length <= 2}
                  title="Remove this stage"
                  aria-label={`Remove stage ${index + 1}`}
                  onClick={() => setStages((prev) => prev.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={creating} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={creating}>
            {creating ? "Creating…" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

NewWorkflowTemplateDialog.displayName = "NewWorkflowTemplateDialog";
