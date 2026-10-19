import { useProposalsController, type ProposalsListOptions } from "../controllers/proposal.controller";

export const useProposals = (options?: ProposalsListOptions) =>
  useProposalsController(options);
