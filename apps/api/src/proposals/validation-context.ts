// apps/api/src/proposals/validation-context.ts (objectives fix 3.3)
//
// Reads the few rows the comparison checks in validation.ts need. Read-only, and
// best effort: if anything fails the checks that need it are simply skipped,
// because validation is advice and must never stop a proposal being filed.
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../core/db/connection.js";
import { projects } from "../core/db/schema/projects.js";
import { proposals } from "../core/db/schema/proposals.js";
import { parseAmount, type ValidationContext } from "./validation.js";

/** Past proposals compared against; the newest ones are the relevant market. */
const SAMPLE_LIMIT = 200;

export const loadValidationContext = async (input: {
  projectCode: string;
  excludeProposalId?: number;
}): Promise<ValidationContext> => {
  try {
    const [project] = await db
      .select({ projectType: projects.projectType, contractValue: projects.contractValue })
      .from(projects)
      .where(eq(projects.code, input.projectCode));
    if (!project) return {};

    const notSelf = input.excludeProposalId != null ? [ne(proposals.id, input.excludeProposalId)] : [];

    const [similarRows, siblingRows] = await Promise.all([
      project.projectType
        ? db
            .select({ amount: proposals.amount })
            .from(proposals)
            .innerJoin(projects, eq(proposals.projectCode, projects.code))
            .where(and(eq(projects.projectType, project.projectType), ne(proposals.status, "Rejected"), ...notSelf))
            .orderBy(desc(proposals.id))
            .limit(SAMPLE_LIMIT)
        : Promise.resolve([] as { amount: string | null }[]),
      db
        .select({
          proposalId: proposals.proposalId,
          title: proposals.title,
          amount: proposals.amount,
          createdAt: proposals.createdAt,
        })
        .from(proposals)
        .where(and(eq(proposals.projectCode, input.projectCode), ...notSelf))
        .orderBy(desc(proposals.id))
        .limit(50),
    ]);

    return {
      projectType: project.projectType,
      contractValue: project.contractValue != null ? Number(project.contractValue) : null,
      similarAmounts: similarRows.map((r) => parseAmount(r.amount)).filter((n): n is number => n != null),
      siblings: siblingRows.map((r) => ({
        proposalId: r.proposalId,
        title: r.title,
        amount: parseAmount(r.amount),
        createdAt: r.createdAt,
      })),
    };
  } catch (err) {
    console.error("[proposals] could not load the validation context", err);
    return {};
  }
};
