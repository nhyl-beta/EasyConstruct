// client/src/features/milestones/components/MilestonesPanel.tsx — NEW
//
// Draft milestones for a project — an estimated completion date the Project
// Manager is staking out for a chunk of work, before it's a firm commitment.
//
// This is deliberately a standalone note today (title + estimate + status),
// not yet gated on requirements/documents/budget/engineer progress — but the
// server's milestone_links table already exists for that correlation to grow
// into later (see server/src/db/schema/milestones.ts) without another
// migration on top of this one.
import { DataTablePagination } from "@/components/refine-ui/data-table/data-table-pagination";
import { usePagination } from "@/hooks/use-pagination";
import { useState } from "react";
import { CalendarClock, Flag, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { useMilestones } from "@/features/milestones/hooks/use-milestones";
import type { Milestone, MilestoneStatus } from "@/features/milestones/repositories/milestone.repository";
import { formatDue } from "@/features/projects/lib/project-format";

const STATUS_TONE: Record<MilestoneStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-info/10 text-info-strong border-info/20",
  "at-risk": "bg-warning/15 text-warning-strong border-warning/30",
  completed: "bg-success/10 text-success-strong border-success/20",
  cancelled: "bg-destructive/10 text-destructive-strong border-destructive/20",
};

interface MilestonesPanelProps {
  projectCode: string;
  /** PM/Admin/IT Designer only — mirrors the API's own write gate. */
  canManage: boolean;
}

export function MilestonesPanel({ projectCode, canManage }: MilestonesPanelProps) {
  const { milestones, loading, saving, error, createDraft, update, remove } =
    useMilestones(projectCode);
  const pg = usePagination(milestones, 8);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Flag className="h-4 w-4 text-muted-foreground" />
            Milestones
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft milestones with an estimated completion date for this project's progress.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Draft milestone
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive-strong">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No milestones drafted yet.</p>
      ) : (
        <ul className="space-y-2">
          {pg.pageItems.map((m) => (
            <li
              key={m.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border px-4 py-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.title}</span>
                  <Badge
                    variant="outline"
                    className={`rounded-full px-2 py-0.5 text-overline capitalize ${STATUS_TONE[m.status]}`}
                  >
                    {m.status.replace("-", " ")}
                  </Badge>
                </div>
                {m.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>
                )}
                {m.estimatedCompletionDate && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <CalendarClock className="h-3 w-3" />
                    Estimated {formatDue(m.estimatedCompletionDate)}
                  </p>
                )}
                {m.status === "completed" && m.completedBy && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Completed by {m.completedBy}
                    {m.completedAt ? ` on ${m.completedAt.slice(0, 10)}` : ""}
                  </p>
                )}
              </div>
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    disabled={saving}
                    title="Edit milestone"
                    onClick={() => setEditingMilestone(m)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive-strong hover:text-destructive-strong"
                    disabled={saving}
                    title="Delete"
                    onClick={() => void remove(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
          <div className="pt-2">
            <DataTablePagination {...pg} compact />
          </div>
        </ul>
      )}

      <NewMilestoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        saving={saving}
        onCreate={createDraft}
      />

      {/* F3: editing an already-drafted milestone's title/date — there was
          previously no way back into a milestone once created, short of
          deleting and redrafting it. */}
      <EditMilestoneDialog
        milestone={editingMilestone}
        onOpenChange={(open) => !open && setEditingMilestone(null)}
        saving={saving}
        onSave={update}
      />
    </div>
  );
}

function EditMilestoneDialog({
  milestone,
  onOpenChange,
  saving,
  onSave,
}: {
  milestone: Milestone | null;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onSave: (
    id: number,
    input: {
      title?: string;
      description?: string;
      estimatedCompletionDate?: string;
      status?: MilestoneStatus;
    },
  ) => Promise<unknown>;
}) {
  return (
    <Dialog open={milestone !== null} onOpenChange={onOpenChange}>
      {/* Remounted per milestone (via key) so each open starts from that
          milestone's own current values instead of whatever was last typed. */}
      {milestone && (
        <EditMilestoneForm
          key={milestone.id}
          milestone={milestone}
          saving={saving}
          onCancel={() => onOpenChange(false)}
          onSave={async (input) => {
            const ok = await onSave(milestone.id, input);
            if (ok) onOpenChange(false);
          }}
        />
      )}
    </Dialog>
  );
}

function EditMilestoneForm({
  milestone,
  saving,
  onCancel,
  onSave,
}: {
  milestone: Milestone;
  saving: boolean;
  onCancel: () => void;
  onSave: (input: {
    title: string;
    estimatedCompletionDate?: string;
    status: MilestoneStatus;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState(milestone.title);
  // Status used to be a dropdown on the row that saved the moment it changed.
  // It lives in this form now, so nothing about a milestone is written until
  // Save is clicked.
  const [status, setStatus] = useState<MilestoneStatus>(milestone.status);
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState(
    milestone.estimatedCompletionDate ?? "",
  );

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Edit milestone</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 py-1">
        <div className="grid gap-1.5">
          <Label htmlFor="ms-edit-title">Title</Label>
          <Input id="ms-edit-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ms-edit-date">Estimated completion</Label>
          <DatePicker
            id="ms-edit-date"
            value={estimatedCompletionDate}
            onChange={setEstimatedCompletionDate}
            placeholder="Select an estimated date"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ms-edit-status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as MilestoneStatus)} disabled={saving}>
            <SelectTrigger id="ms-edit-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="at-risk">At risk</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={saving || !title.trim()}
          onClick={() => void onSave({ title: title.trim(), estimatedCompletionDate: estimatedCompletionDate || undefined, status })}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewMilestoneDialog({
  open,
  onOpenChange,
  saving,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving: boolean;
  onCreate: (input: { title: string; description?: string; estimatedCompletionDate?: string }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setEstimatedCompletionDate("");
    setFormError(null);
  };

  const submit = async () => {
    if (!title.trim()) {
      setFormError("Give the milestone a title.");
      return;
    }
    const created = await onCreate({
      title: title.trim(),
      description: description.trim() || undefined,
      estimatedCompletionDate: estimatedCompletionDate || undefined,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Draft a milestone</DialogTitle>
          <DialogDescription>
            Created as a draft with an estimated completion date — not yet a
            commitment the project is held to.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {formError && <p className="text-sm text-destructive-strong">{formError}</p>}

          <div className="grid gap-1.5">
            <Label htmlFor="ms-title">Title</Label>
            <Input
              id="ms-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Foundation pour complete"
              disabled={saving}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ms-est">Estimated completion</Label>
            <DatePicker
              id="ms-est"
              value={estimatedCompletionDate}
              onChange={setEstimatedCompletionDate}
              placeholder="Select an estimated date"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ms-desc">Description (optional)</Label>
            <Textarea
              id="ms-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What has to be true for this milestone to be met."
              className="min-h-20"
              disabled={saving}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Creating…" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
