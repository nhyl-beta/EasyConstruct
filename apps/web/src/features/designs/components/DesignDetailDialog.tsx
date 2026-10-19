import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Design } from "../types/design.types";
import { DesignFileLinks } from "./DesignFileLinks";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="text-sm">{children}</dd>
  </div>
);

/**
 * Read-only design detail for the Consultant register: no editing, and no link
 * into the Architect's editable design page.
 */
export function DesignDetailDialog({
  design,
  onOpenChange,
}: {
  design: Design | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={design !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {design && (
          <>
            <DialogHeader>
              <DialogTitle>{design.name}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{design.code}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Project">{design.projectCode}</Field>
              <Field label="Status">
                <StatusBadge status={design.status} />
              </Field>
              <Field label="Discipline">{design.discipline}</Field>
              <Field label="Phase">{design.phase || "—"}</Field>
              <Field label="Version">
                {design.version} · rev {design.revision}
              </Field>
              <Field label="Lead architect">{design.leadArchitect}</Field>
              <div className="col-span-2">
                <Field label="Assigned engineers">
                  {design.assignedEngineers?.length
                    ? design.assignedEngineers.map((e) => e.userName).join(", ")
                    : "—"}
                </Field>
              </div>
            </dl>
            <div>
              <div className="text-xs text-muted-foreground">Description</div>
              <p className="whitespace-pre-line text-sm">{design.description?.trim() || "—"}</p>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">Files</div>
              <DesignFileLinks files={design.fileUrls} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
