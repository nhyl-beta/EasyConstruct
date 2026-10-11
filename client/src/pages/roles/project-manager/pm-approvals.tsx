// src/pages/roles/project-manager/pm-approvals.tsx
//
// The shared /approvals screen. Despite living under project-manager/, this
// is the single approvals page every deciding role reaches — Project Manager,
// Consultant, Engineer, Finance Manager, Human Resources and Architect — and
// the server scopes the queue to the caller's own role.
//
// The queue itself is ApprovalQueuePanel, shared with the Admin's workflow
// oversight page. The PM's "Approval" view and the PM's workflow view were
// reported as two separate problems but are the same screen and the same
// gap — an approver could not see what they were approving — so the fix
// lives in one component rather than being applied twice and drifting.
import { ApprovalQueuePanel } from "@/components/workflows/approval-queue-panel";
import { RequirementApprovalsPanel } from "@/features/requirements/components/RequirementApprovalsPanel";
import { PmPurchasingPanel } from "@/features/finance/components/PmPurchasingPanel";
import { useAuth } from "@/auth/auth-context";
import { PageHeader } from "@/components/refine-ui/views/page-header";

export default function ApprovalsPage() {
  const { user } = useAuth();
  // Engineers' submitted requirements are the Project Manager's to decide
  // (the API enforces the same rule — requirements/service.ts).
  const decidesRequirements = user?.role === "project-manager" || user?.role === "admin";

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8">
      <PageHeader title="Approvals" />
      {decidesRequirements && <RequirementApprovalsPanel />}
      {/* Purchasing is the Project Manager's sub-feature; Admin has no UI for it (the server allows Admin). */}
      {user?.role === "project-manager" && <PmPurchasingPanel />}
      <ApprovalQueuePanel />
    </div>
  );
}

ApprovalsPage.displayName = "ApprovalsPage";
