import { Request, Response } from "express";
import type { AuthedRequest } from "../middleware/auth.js";
import { logAudit } from "../utils/audit.js";
import { assertAssignedToProject, assignedCodesFor, isAssignedScoped, scopeRowsToAssigned } from "../projects/scope.js";
import { parsePageRequest } from "../utils/pagination.js";
import { cached } from "../cache/index.js";
import { userScope } from "../cache/scope.js";
import { PROPOSAL_SORT_COLUMNS } from "./repository.js";
import { canSeeProposalFiles } from "./files.js";
import { ForbiddenError } from "../utils/errors.js";

import {
  proposalService,
} from "./service.js";

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
            excludeStatus: text(req.query.excludeStatus),
            reviewQueue: req.query.queue === "consultant",
          },
          paging,
        );
        if (req.query.counts === "1") {
          const statusCounts = await proposalService.statusCounts({
            ...(isAssignedScoped(auth) ? { codes: [...(await assignedCodesFor(auth))] } : {}),
            projectCode: text(req.query.projectCode),
          });
          return { data: items, meta: { ...meta, statusCounts } };
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
    const id = Number(req.params.id);

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
    const { proposal, files } = await proposalService.getFiles(Number(req.params.id));
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
    const data = await proposalService.validate(Number(req.params.id));

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

  async submit(
    req: AuthedRequest,
    res: Response,
  ) {
    await assertAssignedToProject(req.authUser, req.body.projectCode, "proposals");
    const data = await proposalService.submit(
      req.body,
      req.authUser?.name ?? req.body.submittedBy ?? "unknown",
      req.authUser?.role ?? "",
      req.authUser?.id,
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
    const id = Number(req.params.id);
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
    const id = Number(req.params.id);

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
    const id = Number(req.params.id);
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