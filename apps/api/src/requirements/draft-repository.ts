// apps/api/src/requirements/draft-repository.ts (objectives fix 3.4): the rows the draft generator reads.
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/connection.js";
import { designs } from "../db/schema/designs.js";
import { projects } from "../db/schema/projects.js";
import { proposals } from "../db/schema/proposals.js";

export const loadDraftSources = async (projectCode: string) => {
  const [[project], proposalRows, designRows] = await Promise.all([
    db.select({ name: projects.name, projectType: projects.projectType }).from(projects).where(eq(projects.code, projectCode)),
    db
      .select({ title: proposals.title, content: proposals.content })
      .from(proposals)
      .where(and(eq(proposals.projectCode, projectCode), eq(proposals.status, "Approved")))
      .orderBy(desc(proposals.id))
      .limit(2),
    db
      .select({ name: designs.name, description: designs.description })
      .from(designs)
      .where(eq(designs.projectCode, projectCode))
      .orderBy(desc(designs.id))
      .limit(3),
  ]);
  return {
    project: project ?? null,
    proposalText: proposalRows.map((p) => `${p.title}. ${p.content ?? ""}`).join(" "),
    designText: designRows.map((d) => `${d.name}. ${d.description ?? ""}`).join(" "),
  };
};
