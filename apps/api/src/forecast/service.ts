// apps/api/src/forecast/service.ts (objectives fix 3.2)
//
// Read-only. Builds the inputs for forecastChangeImpact from the workflow or
// request, the project and its budget, tasks and milestones. Nothing is written.
import { NotFoundError } from "../utils/errors.js";
import * as workflowsRepo from "../workflows/repository.js";
import * as designRequestsService from "../design-requests/service.js";
import * as repo from "./repository.js";
import { forecastChangeImpact, mapRequestImpact, type ImpactForecast } from "./change-impact.js";

/** Workflow templates that carry a cost change worth forecasting. */
const FORECAST_TEMPLATES = new Set(["Budget Change Request", "Change Order Request"]);

export type WorkflowForecast =
  | { applicable: false; reason: string }
  | { applicable: true; workflowId: number; projectCode: string; template: string; forecast: ImpactForecast; notes: string[] };

export const forecastForWorkflow = async (workflowId: number, timeImpactDays = 0): Promise<WorkflowForecast> => {
  const workflow = await workflowsRepo.findWorkflowById(workflowId);
  if (!workflow) throw new NotFoundError("Workflow", String(workflowId));
  const template = workflow.templateId ? await workflowsRepo.findTemplateById(workflow.templateId) : null;
  if (!template || !FORECAST_TEMPLATES.has(template.name)) {
    return { applicable: false, reason: "Only budget change requests and change orders carry a cost change to forecast." };
  }

  // The amount the change adds, worked out the same way approval applies it to
  // the budget (workflows/service.ts syncLinkedBudgetChange): the line items'
  // requested less current amounts, or the headline amount when there are none.
  const lineItems = await workflowsRepo.findLineItemsForWorkflows([workflowId]);
  const requestedAmount = lineItems.length
    ? lineItems.reduce((sum, item) => sum + (Number(item.requestedAmount) - Number(item.currentAmount)), 0)
    : Number(workflow.amount ?? 0);

  const inputs = await repo.loadProjectInputs(workflow.projectCode);
  const notes: string[] = [];
  if (timeImpactDays === 0) {
    notes.push("A workflow carries no schedule impact of its own. Enter the days to see how milestones would move.");
  }
  return {
    applicable: true,
    workflowId,
    projectCode: workflow.projectCode,
    template: template.name,
    forecast: forecastChangeImpact({ ...inputs, requestedAmount, timeImpactDays }),
    notes,
  };
};

/** Forecast for an RFI/RFA, mapping its cost and time impact fields to numbers. Visibility is checked by the request lookup. */
export const forecastForRequest = async (requestId: number, actor: designRequestsService.Actor) => {
  const request = await designRequestsService.getById(requestId, actor);
  const mapped = mapRequestImpact({
    costImpact: request.costImpact,
    costNote: request.costNote,
    timeImpact: request.timeImpact,
    timeDays: request.timeDays,
  });
  const inputs = await repo.loadProjectInputs(request.projectCode);
  return {
    requestId,
    projectCode: request.projectCode,
    number: request.number,
    forecast: forecastChangeImpact({
      ...inputs,
      requestedAmount: mapped.requestedAmount,
      timeImpactDays: mapped.timeImpactDays,
    }),
    notes: mapped.notes,
  };
};
