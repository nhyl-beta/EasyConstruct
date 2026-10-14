// server/src/workflows/controller.ts
import fs from "node:fs";
import { Response, NextFunction } from "express";
import { storeBuffer } from "../uploads/service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { HTTP } from "../constants/http-status.js";
import { MSG } from "../constants/messages.js";
import { formatError, formatSuccess } from "../utils/response.js";
import { logAudit } from "../utils/audit.js";
import * as service from "./service.js";
import type { ApprovalScope } from "./types.js";
import { assertProjectVisible, scopeRowsToVisible, scopedProjectCodes, visibleProjectCodes } from "../projects/service.js";
import { parsePageRequest, sendPaged } from "../utils/pagination.js";
import { ALL_DOMAIN, cached } from "../cache/index.js";
import { userScope } from "../cache/scope.js";
import { WORKFLOW_SORT_COLUMNS } from "./repository.js";

export const getTemplates = async (_req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    // System configuration: identical for everyone, changes rarely. 5 min; any
    // write (a workflow created or a template edited) invalidates it, because
    // each template carries its active-workflow count.
    const data = await cached("workflows", "all", 300, () => service.getTemplates(), { deps: ["config"] });
    res.json(formatSuccess(data, MSG.workflows.retrieved));
  } catch (err) {
    next(err);
  }
};

export const createTemplate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    const data = await service.createTemplate(req.body);
    await logAudit({
      entityType: "workflow_template",
      entityId: String(data.id),
      action: "created",
      actor,
      summary: `Created workflow template "${data.name}" (${data.defaultStages.length} stages)`,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.workflows.created));
  } catch (err) {
    next(err);
  }
};

export const deleteTemplate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    const data = await service.deleteTemplate(Number(req.params.id));
    await logAudit({
      entityType: "workflow_template",
      entityId: String(data.id),
      action: "deleted",
      actor,
      summary: `Deleted workflow template "${data.name}"`,
    });
    res.json(formatSuccess(data, MSG.workflows.deleted));
  } catch (err) {
    next(err);
  }
};

// Project visibility for the caller (PM: own projects; staffed roles: assigned projects; null = unrestricted).
const scopeOf = (req: AuthedRequest) =>
  req.authUser ? { role: req.authUser.role, userId: req.authUser.id, name: req.authUser.name } : undefined;
const assertWorkflowVisible = async (req: AuthedRequest, workflowId: number) =>
  assertProjectVisible(req.authUser, await service.getWorkflowProjectCode(workflowId), "workflows");

export const getAll = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const paging = parsePageRequest(req.query, { sortable: Object.keys(WORKFLOW_SORT_COLUMNS) });
    if (paging.requested) {
      const codes = await scopedProjectCodes(req.authUser);
      const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      const { items, meta } = await service.getActiveWorkflowsPage(
        { ...(codes ? { codes } : {}), projectCode: text(req.query.projectCode), search: text(req.query.search) },
        paging,
      );
      sendPaged(res, items, MSG.workflows.retrieved, meta);
      return;
    }
    const data = await scopeRowsToVisible(req.authUser, await service.getActiveWorkflows(), (w) => w.projectCode);
    res.json(formatSuccess(data, MSG.workflows.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getById = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const data = await service.getWorkflowById(Number(req.params.id));
    await assertProjectVisible(req.authUser, data.projectCode, "workflows");
    res.json(formatSuccess(data, MSG.workflows.single));
  } catch (err) {
    next(err);
  }
};

export const update = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? "unknown";
    await assertWorkflowVisible(req, Number(req.params.id));
    const data = await service.updateWorkflow(
      Number(req.params.id),
      req.body,
      req.authUser?.role ?? "",
      actor,
    );
    await logAudit({
      entityType: "workflow",
      entityId: String(data.id),
      action: "updated",
      actor,
      summary: `Updated workflow "${data.title}" (${data.code})`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.workflows.updated));
  } catch (err) {
    next(err);
  }
};

export const remove = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? "unknown";
    await assertWorkflowVisible(req, Number(req.params.id));
    const data = await service.deleteWorkflow(
      Number(req.params.id),
      req.authUser?.role ?? "",
      actor,
    );
    await logAudit({
      entityType: "workflow",
      entityId: String(data.id),
      action: "deleted",
      actor,
      summary: `Deleted workflow "${data.title}" (${data.code})`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.workflows.deleted));
  } catch (err) {
    next(err);
  }
};

export const create = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const createdBy = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    await assertProjectVisible(req.authUser, req.body.projectCode, "workflows");
    const data = await service.createWorkflow(req.body, createdBy, req.authUser?.role, req.authUser?.id);
    await logAudit({
      entityType: "workflow",
      entityId: String(data.id),
      action: "created",
      actor: createdBy,
      summary: `Started workflow "${data.title}" (${data.code}) for project ${data.projectCode}`,
      projectCode: data.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.workflows.created));
  } catch (err) {
    next(err);
  }
};

export const decideStage = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const decidedBy = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    const requesterRole = req.authUser?.role ?? "";
    await assertWorkflowVisible(req, Number(req.params.id));
    const data = await service.decideStage(
      Number(req.params.id),
      Number(req.params.stageId),
      { ...req.body, decidedBy },
      requesterRole,
    );
    await logAudit({
      entityType: "workflow_stage",
      entityId: String(req.params.stageId),
      action: req.body.decision === "approve" ? "approved" : req.body.decision === "reject" ? "rejected" : "revision-requested",
      actor: decidedBy,
      summary: `Decided stage on workflow "${data.title}" (${data.code}): ${req.body.decision}`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.workflowStages.updated));
  } catch (err) {
    next(err);
  }
};

export const resubmitStage = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = { role: req.authUser?.role ?? "", name: req.authUser?.name ?? "unknown" };
    await assertWorkflowVisible(req, Number(req.params.id));
    const data = await service.resubmitStage(
      Number(req.params.id),
      Number(req.params.stageId),
      { attachment: req.body?.attachment },
      actor,
    );
    await logAudit({
      entityType: "workflow_stage",
      entityId: String(req.params.stageId),
      action: "resubmitted",
      actor: actor.name,
      summary: `Resubmitted stage on workflow "${data.title}" (${data.code})`,
      projectCode: data.projectCode,
    });
    res.json(formatSuccess(data, MSG.workflowStages.updated));
  } catch (err) {
    next(err);
  }
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export const getApprovals = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const scope = (req.query.scope as ApprovalScope) ?? "pending";
    const role = req.authUser?.role ?? "";
    const name = req.authUser?.name ?? req.authUser?.email ?? "";
    const codes = await visibleProjectCodes(scopeOf(req));
    const paging = parsePageRequest(req.query, { sortable: service.APPROVAL_SORTABLE });
    if (paging.requested) {
      const { items, meta } = await service.getApprovalQueuePage(scope, role, name, codes, paging, {
        type: text(req.query.type),
        requestedBy: text(req.query.requestedBy),
        from: text(req.query.from),
        to: text(req.query.to),
        search: text(req.query.search),
      });
      sendPaged(res, items, MSG.workflows.retrieved, meta);
      return;
    }
    const data = await service.getApprovalQueue(scope, role, name, codes);
    res.json(formatSuccess(data, MSG.workflows.retrieved));
  } catch (err) {
    next(err);
  }
};

export const getApprovalStats = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const role = req.authUser?.role ?? "";
    const name = req.authUser?.name ?? req.authUser?.email ?? "";
    // The sidebar / header badge asks for this on every page. It depends on the
    // caller's role and visible projects, so the entry is per user; any write
    // anywhere invalidates it (the `all` domain). 20 s.
    const load = async () => service.getApprovalStats(role, name, await visibleProjectCodes(scopeOf(req)));
    const scope = userScope(req.authUser);
    const data = scope ? await cached("workflows", scope, 20, load, { query: { stats: true }, deps: [ALL_DOMAIN] }) : await load();
    res.json(formatSuccess(data, MSG.workflows.retrieved));
  } catch (err) {
    next(err);
  }
};
export const addAttachment = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    const actor = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    await assertWorkflowVisible(req, Number(req.params.id));
    const data = await service.addAttachment(Number(req.params.id), req.body, actor);
    await logAudit({
      entityType: "workflow",
      entityId: String(req.params.id),
      action: "updated",
      actor,
      summary: `Filed "${req.body.label}" against workflow "${data.title}" (${data.code})`,
      projectCode: data.projectCode,
    });
    res.status(HTTP.CREATED).json(formatSuccess(data, MSG.workflows.updated));
  } catch (err) {
    next(err);
  }
};

// Upload path for the same thing: multipart instead of a JSON fileUrl, so
// roles without a documents page (HR, Engineer, Architect) can attach a file
// to a workflow without going through the documents module's own role gate.
export const uploadAttachment = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res
        .status(HTTP.BAD_REQUEST)
        .json(formatError("Please select a file to upload.", "FILE_REQUIRED"));
    }

    const actor = req.authUser?.name ?? req.authUser?.email ?? "unknown";
    await assertWorkflowVisible(req, Number(req.params.id));
    const sizeInMb = req.file.size / (1024 * 1024);
    const fileSize =
      sizeInMb >= 1
        ? `${sizeInMb.toFixed(2)} MB`
        : `${Math.max(1, Math.round(req.file.size / 1024))} KB`;

    // multer wrote the bytes to a temp file, which does not survive the next serverless
    // invocation. Move them into the durable store (Vercel Blob) and keep THAT url, so the
    // file is still there when the Consultant opens the proposal.
    const stored = await storeBuffer({
      buffer: await fs.promises.readFile(req.file.path),
      filename: req.file.originalname,
      contentType: req.file.mimetype || "application/octet-stream",
    }).finally(() => fs.promises.rm(req.file!.path, { force: true }).catch(() => undefined));

    const data = await service.addAttachment(
      Number(req.params.id),
      {
        kind: "document",
        label: String(req.body.label ?? "").trim() || req.file.originalname,
        content: req.body.content ? String(req.body.content) : undefined,
        fileUrl: stored.url,
        fileName: req.file.originalname,
        fileSize,
      },
      actor,
    );

    await logAudit({
      entityType: "workflow",
      entityId: String(req.params.id),
      action: "updated",
      actor,
      summary: `Attached file "${req.file.originalname}" to workflow "${data.title}" (${data.code})`,
      projectCode: data.projectCode,
    });

    return res.status(HTTP.CREATED).json(formatSuccess(data, MSG.workflows.updated));
  } catch (err) {
    return next(err);
  }
};

// ai-signals C8: re-runs the decision-support cost comparison on demand
// (e.g. after the reference catalog has been refreshed). Never fails the
// request over a validation-side error — service.revalidateWorkflow itself
// swallows those and just returns the workflow unchanged.
export const revalidate = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    await assertWorkflowVisible(req, Number(req.params.id));
    const data = await service.revalidateWorkflow(Number(req.params.id));
    res.json(formatSuccess(data, MSG.workflows.updated));
  } catch (err) {
    next(err);
  }
};

// Finance's budget-change review: every request raised from the Budget Change
// Request template, each carrying the line items behind its headline amount.
export const getBudgetChangeRequests = async (
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await scopeRowsToVisible(
      req.authUser,
      await service.getWorkflowsByTemplateName("Budget Change Request"),
      (w) => w.projectCode,
    );
    res.json(formatSuccess(data, MSG.workflows.retrieved));
  } catch (err) {
    next(err);
  }
};
