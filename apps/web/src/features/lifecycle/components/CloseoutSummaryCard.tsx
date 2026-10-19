// H6: closeout-summary — documents, budgets planned-vs-actual, payroll and
// the closeout workflow's status, in one place instead of four screens.
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, XCircle } from "lucide-react";
import { LifecycleRepository } from "../repositories/lifecycle.repository";
import type { CloseoutSummary } from "../types/lifecycle.types";
import { formatCompactCurrency } from "@/lib/format-currency";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/auth-context";
import { useWorkflowTemplates } from "@/features/workflows/hooks/useWorkflows";
import { NewWorkflowDialog } from "@/components/workflows/new-workflow-dialog";

const CLOSEOUT_TEMPLATE_NAME = "Project Closeout";

function DocRow({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {present ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-success-strong" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className={present ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}

export function CloseoutSummaryCard({
  projectId,
  projectCode,
  onWorkflowStarted,
}: {
  projectId: string | number;
  /** C1: the project's code (not its numeric id) — CreateWorkflowInput and
   * the "Project Closeout" eligibility check both key off this. */
  projectCode?: string;
  /** C1: lets the parent's own lifecycle view (gate checks, phase stepper)
   * refresh too — starting the workflow auto-approves the Engineer's own
   * Final Inspection stage, which can change what the gate checks show. */
  onWorkflowStarted?: () => void;
}) {
  const [summary, setSummary] = useState<CloseoutSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { templates, creating, createWorkflow, error, clearError } = useWorkflowTemplates();
  const [startDialogOpen, setStartDialogOpen] = useState(false);

  const loadSummary = useCallback(() => {
    setLoading(true);
    return LifecycleRepository.getCloseoutSummary(projectId)
      .then((data) => setSummary(data))
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  if (loading) {
    return <p className="text-xs text-muted-foreground">Loading closeout summary…</p>;
  }
  if (!summary) return null;

  // C1: the one entry point for actually starting a Project Closeout
  // workflow — mirrors workflows/service.ts's own rule (Engineer or Admin
  // only, mirrored client-side in new-workflow-dialog.tsx too) and only
  // shows once there is genuinely nothing started yet.
  const canStartCloseout =
    !!projectCode &&
    summary.closeoutWorkflow === null &&
    (user?.role === "engineer" || user?.role === "admin");

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Closeout summary</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <DocRow label="Certificate of Completion on file" present={summary.documents.certificateOfCompletion} />
          <DocRow label="As-Built Drawing on file" present={summary.documents.asBuiltDrawing} />
        </div>
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Payroll: {summary.payroll.pending > 0 ? `${summary.payroll.pending} pending` : "none pending"}
            {summary.payroll.approvedSinceCloseout > 0
              ? `, ${summary.payroll.approvedSinceCloseout} approved since Closeout`
              : ""}
          </p>
          <p>
            Closeout workflow:{" "}
            {summary.closeoutWorkflow
              ? summary.closeoutWorkflow.status === "completed"
                ? "completed"
                : `awaiting ${summary.closeoutWorkflow.currentStageRoleLabel ?? "next stage"}`
              : "not started"}
          </p>
          {canStartCloseout && (
            <Button
              size="sm"
              className="mt-1 h-7 text-xs"
              onClick={() => {
                clearError();
                setStartDialogOpen(true);
              }}
            >
              <Eye className="h-3.5 w-3.5" /> Start Project Closeout workflow
            </Button>
          )}
        </div>
      </div>

      {summary.budgets.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/50">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left">Category</th>
                <th className="px-2 py-1.5 text-right">Planned</th>
                <th className="px-2 py-1.5 text-right">Actual</th>
                <th className="px-2 py-1.5 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {summary.budgets.map((b) => (
                <tr key={b.category} className="border-t border-border/40">
                  <td className="px-2 py-1.5">{b.category}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactCurrency(b.planned)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatCompactCurrency(b.spent)}</td>
                  <td
                    className={`px-2 py-1.5 text-right tabular-nums ${
                      b.spent > b.planned ? "text-destructive-strong" : "text-muted-foreground"
                    }`}
                  >
                    {formatCompactCurrency(b.planned - b.spent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canStartCloseout && (
        <NewWorkflowDialog
          open={startDialogOpen}
          onOpenChange={setStartDialogOpen}
          templates={templates}
          creating={creating}
          error={error}
          presetTemplateName={CLOSEOUT_TEMPLATE_NAME}
          presetProjectCode={projectCode}
          lockPreset
          onSubmit={async (input) => {
            const created = await createWorkflow(input);
            if (created) {
              await loadSummary();
              onWorkflowStarted?.();
            }
            return created;
          }}
        />
      )}
    </div>
  );
}

CloseoutSummaryCard.displayName = "CloseoutSummaryCard";
