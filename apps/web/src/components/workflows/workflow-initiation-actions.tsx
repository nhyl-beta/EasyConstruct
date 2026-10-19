// apps/web/src/components/workflows/workflow-initiation-actions.tsx
//
// Which workflows a given role may START, in one place.
//
// Each role in a seeded template owns a stage in some chain, but only
// PM/Admin could ever create one — so an Architect could be asked to review a
// design-approval workflow and had no way to raise one, an Engineer had a
// "Engineer Justification" stage and nothing that produced it, and HR had an
// "HR Verification" stage with no subcontracting plan behind it.
//
// These all reuse the existing workflow abstraction (workflow_templates →
// workflows → workflow_stages); nothing here defines a new workflow engine.
// The template is named, not id'd, because template ids differ per database.
import { useState } from "react";
import { ClipboardCheck, FileSignature, LandPlot, Users, Wallet, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  InitiateWorkflowDialog,
  type InitiateWorkflowDialogProps,
} from "@/components/workflows/initiate-workflow-dialog";
import type { Workflow } from "@/features/workflows/types/workflow.types";

type ActionConfig = Omit<
  InitiateWorkflowDialogProps,
  "open" | "onOpenChange" | "onCreated"
> & {
  /** Button label on the launcher. */
  action: string;
  icon: LucideIcon;
  variant?: "default" | "outline";
};

/**
 * Design proposal submission (Architect).
 *
 * Submitting the proposal IS what starts the approval chain — the architect
 * does not file a proposal and then separately ask someone to route it.
 */
export const DESIGN_PROPOSAL_ACTION: ActionConfig = {
  action: "Submit design proposal",
  icon: FileSignature,
  templateName: "Design Proposal Approval",
  title: "Submit design proposal",
  description:
    "Submits the proposal and opens its design-approval workflow in one step: Consultant review, then PM approval.",
  workflowType: "Design Proposal",
  titleLabel: "Proposal title",
  titlePlaceholder: "Curtain wall system — Tower A",
  noteLabel: "Design summary",
  notePlaceholder:
    "What is being proposed, the design intent, and anything the consultant should look at first.",
  noteRequired: true,
  noteAttachmentLabel: "Design proposal",
  showDocumentUpload: true,
  documentLabel: "Design document (optional)",
  showAmount: true,
  amountLabel: "Estimated amount (optional)",
  submitLabel: "Submit & start approval",
};

/** Public-works compliance (Architect). */
export const PUBLIC_WORKS_COMPLIANCE_ACTION: ActionConfig = {
  action: "Initiate public-works compliance",
  icon: LandPlot,
  variant: "outline",
  templateName: "Public works compliance",
  title: "Initiate public-works compliance",
  description:
    "Starts the public-works compliance chain for a public-sector project: Architect review, then PM, Finance and Admin sign-off.",
  workflowType: "Public Works Compliance",
  titleLabel: "Compliance review title",
  titlePlaceholder: "Public works compliance — Riverside Bridge",
  noteLabel: "Compliance notes",
  notePlaceholder:
    "Which statutory requirements this covers, and what has already been checked.",
  noteAttachmentLabel: "Architect compliance review",
  showDocumentUpload: true,
  documentLabel: "Compliance document (optional)",
  submitLabel: "Start compliance review",
};

/** Budget change request (Engineer). */
export const BUDGET_CHANGE_ACTION: ActionConfig = {
  action: "Request budget change",
  icon: Wallet,
  templateName: "Budget Change Request",
  title: "Request a budget change",
  description:
    "Raises a budget change against a project with the justification and the cost changes behind it: Finance review, then PM and Admin sign-off.",
  workflowType: "Budget Change",
  titleLabel: "Request title",
  titlePlaceholder: "Rebar price escalation — Tower A",
  noteLabel: "Justification",
  notePlaceholder:
    "Why the change is needed, what caused it, and what happens if it is not approved.",
  noteRequired: true,
  noteAttachmentLabel: "Justification",
  showLineItems: true,
  showDocumentUpload: true,
  documentLabel: "Supporting document (optional)",
  submitLabel: "Submit request",
};

/** Subcontractor planning (Human Resources). */
export const SUBCONTRACTING_PLAN_ACTION: ActionConfig = {
  action: "Plan subcontracting",
  icon: Users,
  templateName: "Subcontractor onboarding",
  title: "Create a subcontractor plan",
  description:
    "Starts the subcontracting chain for a project: HR verification, then PM approval and Admin sign-off.",
  workflowType: "Subcontracting Plan",
  titleLabel: "Plan title",
  titlePlaceholder: "Steel erection subcontractor — Tower A",
  noteLabel: "Subcontracting scope",
  notePlaceholder:
    "Scope being subcontracted, headcount, engagement dates, and the vendor under consideration.",
  noteRequired: true,
  noteAttachmentLabel: "Subcontracting plan",
  showDocumentUpload: true,
  documentLabel: "Subcontracting document",
  submitLabel: "Start plan",
};

/** Document compliance review (Consultant). */
export const DOCUMENT_COMPLIANCE_ACTION: ActionConfig = {
  action: "Flag document for compliance review",
  icon: ClipboardCheck,
  variant: "outline",
  templateName: "Document Compliance Review",
  title: "Flag a document for compliance review",
  description:
    "Starts a compliance review on an advisory document: Architect sign-off, then Admin sign-off.",
  workflowType: "Document Compliance",
  titleLabel: "Review title",
  titlePlaceholder: "Fire code compliance — Tower A egress plan",
  noteLabel: "Compliance concern",
  notePlaceholder:
    "What in the document needs checking, and against which requirement.",
  noteRequired: true,
  noteAttachmentLabel: "Compliance review",
  showDocumentUpload: true,
  documentLabel: "Document under review (optional)",
  submitLabel: "Start review",
};

/**
 * Role → the workflows that role initiates. Roles absent from this map get no
 * launcher; PM/Admin keep the full template picker on their own Workflows and
 * Workflow-oversight pages, which is a superset of these.
 */
export const WORKFLOW_ACTIONS_BY_ROLE: Record<string, ActionConfig[]> = {
  architect: [DESIGN_PROPOSAL_ACTION, PUBLIC_WORKS_COMPLIANCE_ACTION],
  engineer: [BUDGET_CHANGE_ACTION],
  "human-resources": [SUBCONTRACTING_PLAN_ACTION],
  consultant: [DOCUMENT_COMPLIANCE_ACTION],
};

interface WorkflowInitiationActionsProps {
  role: string;
  /** Restricts the bar to specific templates, e.g. one action on one page. */
  only?: string[];
  onCreated?: (workflow: Workflow) => void;
  className?: string;
}

export function WorkflowInitiationActions({
  role,
  only,
  onCreated,
  className,
}: WorkflowInitiationActionsProps) {
  const [openTemplate, setOpenTemplate] = useState<string | null>(null);

  const all = WORKFLOW_ACTIONS_BY_ROLE[role] ?? [];
  const actions = only
    ? all.filter((action) => only.includes(action.templateName))
    : all;

  if (actions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      {actions.map((action) => {
        const Icon = action.icon;
        return (
          <div key={action.templateName}>
            <Button
              size="sm"
              variant={action.variant ?? "default"}
             
              onClick={() => setOpenTemplate(action.templateName)}
            >
              <Icon className="h-4 w-4" />
              {action.action}
            </Button>

            <InitiateWorkflowDialog
              {...action}
              open={openTemplate === action.templateName}
              onOpenChange={(open) => setOpenTemplate(open ? action.templateName : null)}
              onCreated={onCreated}
            />
          </div>
        );
      })}
    </div>
  );
}

WorkflowInitiationActions.displayName = "WorkflowInitiationActions";
