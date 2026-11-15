import { AppError, ValidationError } from "../../../core/utils/errors.js";
import { assertProjectWritable } from "../../projects/index.js";
import { db } from "../../../core/db/connection.js";
import { monthKey } from "../cash-flow/months.js";
import { refreshMonth } from "../cash-flow/service.js";
import { clientPaymentsRepository } from "./repository.js";
import type { CreateClientPaymentInput } from "./types.js";

export const clientPaymentsService = {
  async list(codes?: string[]) {
    return clientPaymentsRepository.list(codes);
  },

  /**
   * Recording a payment means the money is already in hand — there is no
   * approval step. In one transaction: insert the row, then recompute that
   * month's cash flow inflow (mirrors applyApprovedSpend for expenses).
   */
  async create(input: CreateClientPaymentInput, createdBy: string | null) {
    if (input.amount <= 0) {
      throw new ValidationError("Amount must be greater than zero");
    }
    await assertProjectWritable(input.project);
    return db.transaction(async (tx) => {
      const row = await clientPaymentsRepository.create({ ...input, createdBy }, tx);
      if (!row) throw new AppError(500, "PAYMENT_NOT_RECORDED", "The payment could not be recorded");
      await refreshMonth(monthKey(row.receivedAt), tx);
      return row;
    });
  },
};
