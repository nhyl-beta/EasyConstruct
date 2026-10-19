import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";

import { WorkflowStatusBadge } from "./WorkflowStatusBadge";

import type {
  Workflow,
} from "@/features/workflows/types/workflow.types";

interface WorkflowCardProps {
  workflow: Workflow;

  currentRole: string;

  onApprove?: (workflow: Workflow) => void;

  onRequestRevision?: (workflow: Workflow) => void;
}

export function WorkflowCard({
  workflow,
  currentRole,
  onApprove,
  onRequestRevision,
}: WorkflowCardProps) {
  /*
   * Find the workflow stage assigned to the current role.
   *
   * assignedTo belongs to WorkflowStage, not Workflow.
   */
  const currentStage = workflow.stages.find(
    (stage) =>
      stage.role === currentRole ||
      stage.roleLabel === currentRole,
  );

  /*
   * The current user can act when:
   *
   * 1. Their role has a workflow stage.
   * 2. That stage is currently active.
   * 3. The overall workflow is still active.
   */
  const canAct =
    workflow.status === "active" &&
    currentStage?.status === "current";

  /*
   * Find the most recent comment from the workflow stages.
   */
  const latestComment = [...workflow.stages]
    .reverse()
    .find((stage) => stage.comments);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">
            {workflow.code}
          </p>

          <h3 className="font-semibold">
            {workflow.title}
          </h3>

          <p className="text-sm text-muted-foreground">
            Project: {workflow.projectCode}
          </p>
        </div>

        <WorkflowStatusBadge status={workflow.status} />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Workflow information */}
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-muted-foreground">
              Type
            </p>

            <p className="font-medium">
              {workflow.type ?? "—"}
            </p>
          </div>

          <div>
            <p className="text-muted-foreground">
              Amount
            </p>

            <p className="font-medium">
              {workflow.amount ?? "—"}
            </p>
          </div>

          <div>
            <p className="text-muted-foreground">
              Created by
            </p>

            <p className="font-medium">
              {workflow.createdBy}
            </p>
          </div>

          <div>
            <p className="text-muted-foreground">
              Severity
            </p>

            <p className="font-medium capitalize">
              {workflow.severity}
            </p>
          </div>
        </div>

        {/* Workflow stages */}
        {workflow.stages.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              Workflow stages
            </p>

            <div className="space-y-2">
              {workflow.stages.map((stage) => (
                <div
                  key={stage.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {stage.roleLabel}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {stage.assignedTo ?? "Unassigned"}
                    </p>
                  </div>

                  <span className="text-xs capitalize text-muted-foreground">
                    {stage.status.replace("-", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {canAct && (
          <div className="flex gap-2 border-t pt-3">
            {onApprove && (
              <Button
                size="sm"
                onClick={() => onApprove(workflow)}
              >
                Approve
              </Button>
            )}

            {onRequestRevision && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => onRequestRevision(workflow)}
              >
                Request Revision
              </Button>
            )}
          </div>
        )}

        {/* Latest comment */}
        {latestComment?.comments && (
          <div className="border-t pt-3">
            <p className="text-xs font-medium">
              Latest comment
            </p>

            <p className="text-sm text-muted-foreground">
              {latestComment.comments}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
