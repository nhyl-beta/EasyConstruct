import { NotFoundError, ValidationError } from "../utils/errors.js";
import { db } from "../db/connection.js";
import { projects } from "../db/schema/projects.js";
import { eq } from "drizzle-orm";
import { ensureValidation, validateProposal } from "./validation.js";
import { loadValidationContext } from "./validation-context.js";
import { FEATURES } from "../config/features.js";
import { assertProjectWritable, refreshProjectProgress } from "../lifecycle/service.js";
import { createWorkflow, decideStage } from "../workflows/service.js";
import * as workflowsRepo from "../workflows/repository.js";

import {
  proposalRepository,
  PROPOSAL_SORT_COLUMNS,
  defaultProposalOrder,
  statusCounts,
  type ProposalFilters,
} from "./repository.js";
import { proposals as proposalsTable } from "../db/schema/proposals.js";
import { orderByFor, paginate, type PageRequest } from "../utils/pagination.js";

const DESIGN_APPROVAL_TEMPLATE = "Design Proposal Approval";

export interface SubmittedProposalFile {
  id: number;
  name: string;
  label: string;
  url: string;
  size: string | null;
  uploadedBy: string;
  stage: string | null;
  filedAt: Date | null;
}

export const proposalService = {
  async getAll() {
    return proposalRepository.findAll();
  },

  async getPage(filters: ProposalFilters, request: PageRequest) {
    return paginate(
      request,
      () => proposalRepository.countFiltered(filters),
      (window) =>
        proposalRepository.findPage(
          filters,
          window,
          orderByFor(request, PROPOSAL_SORT_COLUMNS, defaultProposalOrder, proposalsTable.id),
        ),
    );
  },

  statusCounts: (filters: ProposalFilters) => statusCounts(filters),

  async getById(id: number) {
    const proposal =
      await proposalRepository.findById(id);

    if (!proposal) {
      throw new NotFoundError(
        "Proposal not found",
      );
    }

    return proposal;
  },

  /**
   * J: proposals created while the AI flag was off (or before validation
   * existed) have no stored summary. Compute it on demand and store it. Only
   * the validation text is written; the proposal status is never touched.
   * 404 when the flag is off, and a stored summary is returned unchanged.
   */
  async validate(id: number) {
    if (!FEATURES.ai) throw new NotFoundError("Proposal validation is not enabled");
    const proposal = await this.getById(id);
    const [project] = await db.select().from(projects).where(eq(projects.code, proposal.projectCode));
    const context = await loadValidationContext({
      projectCode: proposal.projectCode,
      excludeProposalId: proposal.id,
    });
    const { changed, aiValidation } = ensureValidation(proposal, !!project, context);
    if (!changed) return proposal;
    const updated = await proposalRepository.update(id, { aiValidation });
    return updated ?? proposal;
  },

  /**
   * B1: the files an Architect submitted with a proposal. They are stored as
   * "document" attachments on the proposal's Design Proposal Approval workflow
   * (proposals.workflow_id), NOT as project documents — which is why the
   * Consultant's review, which listed project documents, never showed them.
   */
  async getFiles(id: number) {
    const proposal = await this.getById(id);
    if (!proposal.workflowId) return { proposal, files: [] as SubmittedProposalFile[] };
    const rows = await workflowsRepo.findAttachmentsForWorkflows([proposal.workflowId]);
    const files = rows
      .filter(({ attachment }) => attachment.kind === "document" && !!attachment.fileUrl)
      .map(({ attachment, stageLabel }) => ({
        id: attachment.id,
        name: attachment.fileName ?? attachment.label,
        label: attachment.label,
        url: attachment.fileUrl as string,
        size: attachment.fileSize,
        uploadedBy: attachment.uploadedBy,
        stage: stageLabel ?? null,
        filedAt: attachment.createdAt,
      }));
    return { proposal, files };
  },

  async create(data: any) {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.code, data.projectCode));

    // Unknown project codes used to only surface as an "AI issue" buried in
    // aiValidation — with that surface hidden behind the flag, a bad code
    // would otherwise be silently accepted. Reject it directly instead.
    if (!project) {
      throw new ValidationError(
        `Project code "${data.projectCode}" does not match any existing project.`,
      );
    }

    const aiValidation = FEATURES.ai
      ? JSON.stringify(
          validateProposal(
            { title: data.title, content: data.content, amount: data.amount },
            true,
            data.projectCode,
            await loadValidationContext({ projectCode: data.projectCode }),
          ),
        )
      : null;

    await assertProjectWritable(data.projectCode);

    const proposal = await proposalRepository.create({
      ...data,
      aiValidation,
    });
    if (!proposal) {
      throw new Error("Failed to create proposal");
    }
    await refreshProjectProgress(data.projectCode);
    return proposal;
  },

  /**
   * D2: creating a proposal and opening its Design Proposal Approval
   * workflow used to be two separate client round trips (create, then
   * initiate) with no link back to the proposal — proposals.workflow_id
   * stayed null forever, so gates P3/P4 ("a proposal was submitted" /
   * "approved") could never pass. One call, one transaction of intent: the
   * proposal is created, the workflow is opened against it (auto-approving
   * the architect's own stage, same as any other workflow the initiator's
   * role owns stage 1 of — see workflows/service.ts createWorkflow), and the
   * two are linked before either is returned.
   */
  async submit(
    data: any,
    createdBy: string,
    createdByRole: string,
    createdByUserId?: number,
  ) {
    const [project] = await db.select().from(projects).where(eq(projects.code, data.projectCode));
    if (!project) {
      throw new ValidationError(
        `Project code "${data.projectCode}" does not match any existing project.`,
      );
    }
    await assertProjectWritable(data.projectCode);

    const template = await workflowsRepo.findTemplateByName(DESIGN_APPROVAL_TEMPLATE);
    if (!template) {
      throw new ValidationError(
        `No "${DESIGN_APPROVAL_TEMPLATE}" workflow template is configured.`,
      );
    }

    const aiValidation = FEATURES.ai
      ? JSON.stringify(
          validateProposal(
            { title: data.title, content: data.content, amount: data.amount },
            true,
            data.projectCode,
            await loadValidationContext({ projectCode: data.projectCode }),
          ),
        )
      : null;

    const proposal = await proposalRepository.create({ ...data, aiValidation });
    if (!proposal) throw new Error("Failed to create proposal");

    const workflow = await createWorkflow(
      {
        title: proposal.title,
        projectCode: proposal.projectCode,
        templateId: template.id,
        type: "Design Proposal",
        amount: proposal.amount ? Number(proposal.amount) : undefined,
        attachments: [
          {
            kind: "note",
            label: `Design proposal ${proposal.proposalId}`,
            content:
              proposal.content?.trim() ||
              "No design description was provided with this proposal.",
          },
        ],
      },
      createdBy,
      createdByRole,
      createdByUserId,
    );

    const linked = await proposalRepository.update(proposal.id, { workflowId: workflow.id });
    await refreshProjectProgress(data.projectCode);
    return { proposal: linked ?? proposal, workflow };
  },

  async update(
    id: number,
    data: any,
  ) {
    const proposal =
      await proposalRepository.update(
        id,
        data,
      );

    if (!proposal) {
      throw new NotFoundError(
        "Proposal not found",
      );
    }

    return proposal;
  },

  /**
   * D3: for a proposal linked to a workflow (proposals.workflow_id), this
   * no longer writes the proposal directly — it decides the workflow's
   * current stage instead, and decideStage's own sync keeps the proposal's
   * status in agreement (see workflows/service.ts syncLinkedProposal). A
   * legacy, unlinked proposal (predating D2, or created via plain
   * POST /proposals) still gets the old direct write, since it has no
   * workflow to decide against.
   */
  async review(
    id: number,
    data: {
      status:
        | "Approved"
        | "Revision Requested"
        | "Rejected";

      reviewerName: string;
      reviewComment: string;
    },
    requesterRole: string,
  ) {
    const existing = await proposalService.getById(id);

    if (existing.workflowId != null) {
      const stages = await workflowsRepo.findStagesByWorkflow(existing.workflowId);
      const currentStage = stages.find((s) => s.status === "current");
      if (!currentStage) {
        throw new ValidationError(
          "This proposal's workflow has no stage currently awaiting a decision.",
        );
      }
      const decision =
        data.status === "Approved" ? "approve" : data.status === "Rejected" ? "reject" : "revise";
      await decideStage(
        existing.workflowId,
        currentStage.id,
        { decision, comments: data.reviewComment, decidedBy: data.reviewerName },
        requesterRole,
      );
      const proposal = await proposalService.getById(id);
      return proposal;
    }

    const proposal =
      await proposalRepository.review(
        id,
        data,
      );

    if (!proposal) {
      throw new NotFoundError(
        "Proposal not found",
      );
    }

    return proposal;
  },

  async remove(id: number) {
    const proposal =
      await proposalRepository.remove(id);

    if (!proposal) {
      throw new NotFoundError(
        "Proposal not found",
      );
    }

    return proposal;
  },
};