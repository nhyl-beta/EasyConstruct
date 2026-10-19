// src/components/workflows/edit-workflow-dialog.tsx
// Shared between pm-workflows.tsx and admin-workflows.tsx (EC-016) — title
// and project only; stage reassignment happens at creation time (see EC-001's
// NewWorkflowDialog), and status is driven by stage decisions.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectPicker } from "@/components/shared/project-picker";
import type { UpdateWorkflowInput, Workflow } from "@/features/workflows/types/workflow.types";

export function EditWorkflowDialog({
  workflow,
  onOpenChange,
  onSave,
}: {
  workflow: Workflow | null;
  onOpenChange: (open: boolean) => void;
  onSave: (id: number, input: UpdateWorkflowInput) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(workflow?.title ?? "");
  const [projectCode, setProjectCode] = useState(workflow?.projectCode ?? "");
  const [saving, setSaving] = useState(false);

  // The Dialog's `open` prop is flipped programmatically (clicking "Edit"
  // sets `workflow` from null to a record) — Radix's onOpenChange only
  // fires on user-driven close (Escape/overlay), not on that externally
  // controlled transition, so syncing here never actually ran.
  useEffect(() => {
    if (!workflow) return;
    setTitle(workflow.title);
    setProjectCode(workflow.projectCode);
  }, [workflow]);

  return (
    <Dialog open={workflow !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit workflow</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="edit-wf-title">Title</Label>
            <Input
              id="edit-wf-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Project</Label>
            {/* Picker, not free text: a workflow reassigned to a mistyped
                project code silently drops out of every project-scoped view. */}
            <ProjectPicker
              value={projectCode}
              onChange={setProjectCode}
              className="w-full"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || !title.trim() || !projectCode}
            onClick={async () => {
              if (!workflow) return;
              setSaving(true);
              try {
                await onSave(workflow.id, {
                  title: title.trim(),
                  projectCode,
                });
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
