import * as repository from "./repository.js";
import { payrollService } from "../../workforce/index.js";
import { NotFoundError } from "../../../core/utils/errors.js";

import type { PayrollBatchFilters } from "./types.js";
import type { DecideBatchInput } from "../../workforce/index.js";

// Finance never sees a batch HR is still drafting.
export const listPayrollBatches = async (filters: PayrollBatchFilters) =>
  (await repository.findAll(filters)).filter((b) => b.status !== "draft");

export const getPayrollBatch = async (id: string) => {
  const batch = await repository.findById(id);
  if (!batch || batch.status === "draft") throw new NotFoundError("Payroll batch", id);
  return batch;
};

// The decision itself (status guard, history row, Labor budget booking) is one
// transaction in the payroll service.
export const decidePayrollBatch = async (
  id: string,
  input: DecideBatchInput,
  actor: payrollService.Actor,
) => payrollService.decideBatch(id, input, actor);
