import { Request, Response } from "express";
import type { AuthedRequest } from "../../../core/auth/middleware.js";
import { logAudit } from "../../../core/audit/audit.js";
import { assertAssignedToProject, assignedCodesFor, isAssignedScoped, scopeRowsToAssigned } from "../../projects/index.js";
import { parsePageRequest } from "../../../core/utils/pagination.js";
import { cached } from "../../../core/cache/index.js";
import { userScope } from "../../../core/cache/scope.js";
import { PROPOSAL_SORT_COLUMNS } from "./repository.js";
import { canSeeProposalFiles } from "./files.js";
import { ForbiddenError, ValidationError } from "../../../core/utils/errors.js";
import { assertContentMatches, storeBuffer } from "../../documents/index.js";
import { buildBoqTemplate, formatBoqText, parseBoqSheet } from "./boq-import.js";

import {
  proposalService,
} from "./service.js";
import { parseIdParam } from "../../../core/utils/params.js";

/** "2.44 MB" / "180 KB" — mirrors workflows/controller.ts's uploadAttachment inline calc. */
const describeFileSize = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export const proposalController = {
  async getAll(
    req: Request,
    res: Response,
  ) {
    const auth = (req as AuthedRequest).authUser;
    const paging = parsePageRequest(req.query, { sortable: Object.keys(PROPOSAL_SORT_COLUMNS) });
    const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

    const load = async () => {
      if (paging.requested) {
        const { items, meta } = await proposalService.getPage(
          {
            ...(isAssignedScoped(auth) ? { codes: [...(await assignedCodesFor(auth))] } : {}),
            projectCode: text(req.query.projectCode),
            status: text(req.query.status),
            search: text(req.query.search),
            submittedBy: text(req.query.submittedBy),
            reviewer: text(req.query.reviewer),
            excludeStatus: text(req.query.excludeStatus),
            reviewQueue: req.query.queue === "consultant",
          },
          paging,
        );
        if (req.query.counts === "1") {
          const scope = {
            ...(isAssignedScoped(auth) ? { codes: [...(await assignedCodesFor(auth))] } : {}),
            projectCode: text(req.query.projectCode),
          };
          const [statusCounts, failedValidation, facets] = await Promise.all([
            proposalService.statusCounts(scope),
            proposalService.failedValidationCount(scope),
            proposalService.filterFacets(scope),
          ]);
          return { data: items, meta: { ...meta, statusCounts, failedValidation, facets } };
        }
        return { data: items, meta };
      }
      const data = await scopeRowsToAssigned(
        auth,
        await proposalService.getAll(),
        (p) => p.projectCode,
      );
      return { data, meta: undefined };
    };

    // 60 s. Only an architect gets a narrowed list (its assigned projects), so
    // an architect's entry is its own; every other role shares one.
    const scope = isAssignedScoped(auth) ? userScope(auth) : "all";
    const result = scope ? await cached("proposals", scope, 60, load, { query: req.query }) : await load();

    return res.json(result.meta ? { success: true, data: result.data, meta: result.meta } : { success: true, data: result.data });
  },

  async getById(
    req: Request,
    res: Response,
  ) {
    const id = parseIdParam(req.params.id, "id");

    const data =
      await proposalService.getById(id);
    await assertAssignedToProject((req as AuthedRequest).authUser, data.projectCode, "proposals");

    return res.json({
      success: true,
      data,
    });
  },

  async files(
    req: Request,
    res: Response,
  ) {
    const { proposal, files } = await proposalService.getFiles(parseIdParam(req.params.id, "id"));
    const auth = (req as AuthedRequest).authUser;
    if (isAssignedScoped(auth) && !canSeeProposalFiles(auth, await assignedCodesFor(auth), proposal.projectCode)) {
      throw new ForbiddenError("You can only access proposals for projects you are assigned to");
    }

    return res.json({
      success: true,
      data: files,
    });
  },

  async validate(
    req: Request,
    res: Response,
  ) {
    const data = await proposalService.validate(parseIdParam(req.params.id, "id"));

    return res.json({
      success: true,
      data,
    });
  },

  async create(
    req: AuthedRequest,
    res: Response,
  ) {
    await assertAssignedToProject(req.authUser, req.body.projectCode, "proposals");
    const data =
      await proposalService.create(
        req.body,
      );

    await logAudit({
      entityType: "proposal",
      entityId: String(data.id),
      action: "created",
      actor: req.authUser?.name ?? data.submittedBy ?? "unknown",
      summary: `Submitted proposal "${data.title}" for project ${data.projectCode}`,
      projectCode: data.projectCode,
    });

    return res.status(201).json({
      success: true,
      data,
    });
  },

  async boqTemplate(
    _req: Request,
    res: Response,
  ) {
    const buffer = await buildBoqTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="bill-of-materials-template.xlsx"');
    return res.send(buffer);
  },

  async boqPreview(
    req: Request,
    res: Response,
  ) {
    if (!req.file) throw new ValidationError("Upload the filled-in Bill of Materials file.");
    assertContentMatches(req.file.originalname, req.file.mimetype || "", req.file.buffer);
    const report = await parseBoqSheet(req.file.buffer, req.file.originalname);

    return res.json({
      success: true,
      data: report,
    });
  },

  async submit(
    req: AuthedRequest,
    res: Response,
  ) {
    await assertAssignedToProject(req.authUser, req.body.projectCode, "proposals");

    if (!req.file) {
      throw new ValidationError("A Bill of Materials file is required — download the template, fill it in, and upload it.");
    }
    assertContentMatches(req.file.originalname, req.file.mimetype || "", req.file.buffer);

    const report = await parseBoqSheet(req.file.buffer, req.file.originalname);
    if (report.validRows === 0 || report.invalidRows > 0) {
      const issues = report.rows
        .filter((r) => r.errors.length > 0)
        .slice(0, 5)
        .map((r) => `Row ${r.row}: ${r.errors.join("; ")}`);
      throw new ValidationError(
        report.validRows === 0
          ? "The Bill of Materials has no valid rows. Fix the sheet and upload again."
          : `The Bill of Materials has ${report.invalidRows} invalid row${report.invalidRows === 1 ? "" : "s"}: ${issues.join(" | ")}`,
      );
    }

    const stored = await storeBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      uploadedByUserId: req.authUser?.id,
    });
    const fileSize = describeFileSize(req.file.size);

    const breakdown = report.rows.map((r) => ({
      description: r.description,
      quantity: r.quantity!,
      unit: r.unit!,
      unitCost: r.unitCost!,
    }));
    const content = [req.body.content?.trim(), formatBoqText(report)].filter(Boolean).join("\n\n");

    const data = await proposalService.submit(
      { ...req.body, amount: report.total.toFixed(2), content, breakdown },
      req.authUser?.name ?? req.body.submittedBy ?? "unknown",
      req.authUser?.role ?? "",
      req.authUser?.id,
      { fileUrl: stored.url, fileName: req.file.originalname, fileSize },
    );

    await logAudit({
      entityType: "proposal",
      entityId: String(data.proposal.id),
      action: "created",
      actor: req.authUser?.name ?? data.proposal.submittedBy ?? "unknown",
      summary: `Submitted proposal "${data.proposal.title}" for project ${data.proposal.projectCode} — workflow ${data.workflow.code} started`,
      projectCode: data.proposal.projectCode,
    });

    return res.status(201).json({
      success: true,
      data,
    });
  },

  async update(
    req: Request,
    res: Response,
  ) {
    const id = parseIdParam(req.params.id, "id");
    const auth = (req as AuthedRequest).authUser;
    await assertAssignedToProject(auth, (await proposalService.getById(id)).projectCode, "proposals");
    if (req.body.projectCode) await assertAssignedToProject(auth, req.body.projectCode, "proposals");

    const data =
      await proposalService.update(
        id,
        req.body,
      );

    return res.json({
      success: true,
      data,
    });
  },

  async review(
    req: AuthedRequest,
    res: Response,
  ) {
    const id = parseIdParam(req.params.id, "id");

    const data =
      await proposalService.review(
        id,
        req.body,
        req.authUser?.role ?? "",
      );

    await logAudit({
      entityType: "proposal",
      entityId: String(id),
      action: data.status === "Approved" ? "approved" : data.status === "Rejected" ? "rejected" : "revision-requested",
      actor: req.authUser?.name ?? req.body.reviewerName ?? "unknown",
      summary: `Reviewed proposal "${data.title}": ${data.status}`,
      projectCode: data.projectCode,
    });

    return res.json({
      success: true,
      data,
    });
  },

  async remove(
    req: Request,
    res: Response,
  ) {
    const id = parseIdParam(req.params.id, "id");
    await assertAssignedToProject(
      (req as AuthedRequest).authUser,
      (await proposalService.getById(id)).projectCode,
      "proposals",
    );

    const data =
      await proposalService.remove(id);

    return res.json({
      success: true,
      data,
    });
  },
};