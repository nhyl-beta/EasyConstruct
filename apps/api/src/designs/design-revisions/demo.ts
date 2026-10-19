// apps/api/src/designs/design-revisions/demo.ts
//
// Explicit, idempotent demo-data generator for design revisions. Never called
// from a GET: it runs only from `npm run demo:revisions`, the demo seeders, or
// the admin-only POST /api/design-revisions/demo. Every row it writes is flagged
// `is_demo`, so `removeDemoRevisions()` can take them (and nothing else) out.
import { desc, eq } from "drizzle-orm";
import { db } from "../../db/connection.js";
import { designs } from "../../db/schema/designs.js";
import { users } from "../../db/schema/users.js";
import * as projectMemberRepo from "../../project-members/repository.js";
import * as projectsRepo from "../../projects/repository.js";
import * as designsRepo from "../repository.js";
import * as repo from "./repository.js";
import * as service from "./service.js";
import { NotFoundError } from "../../utils/errors.js";

/** FNV-1a — a stable seed from a string (so randomness is deterministic per project/design). */
export const hash = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

const rng = (seed: number) => {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const VERSIONS = ["v0.1", "v1.0", "v1.1", "v2.0", "v2.1"];

// ≤ 255 chars each; written as real construction changes, by discipline.
const REASONS: Record<string, string[]> = {
  Structural: [
    "Initial structural scheme issued for coordination.",
    "Column C-4 enlarged from 400×400 to 450×450 after consultant structural review.",
    "Slab thickness on level 2 increased to 200 mm to satisfy the deflection check.",
    "Footing F-3 widened after the geotechnical report revised the allowable bearing pressure.",
    "Rebar schedule updated to the final cutting list; lap lengths corrected.",
  ],
  Architectural: [
    "Initial architectural layout issued for client review.",
    "Ground-floor lobby layout revised at client request; stair relocated to grid B–C.",
    "Window schedule updated after the facade supplier changed the frame series.",
    "Accessible ramp added at the main entrance to meet the accessibility code.",
    "Door numbering and finishes schedule reconciled with the interior package.",
  ],
  MEPF: [
    "Initial MEPF routing issued for coordination.",
    "Main electrical panel relocated to the service room after clearance check.",
    "Sprinkler mains rerouted around the new structural beam on grid 4.",
    "Chilled-water riser shifted 600 mm to clear the elevator pit.",
    "Fire alarm device layout updated after the fire marshal's comments.",
  ],
  Civil: [
    "Initial site and drainage scheme issued for review.",
    "Drainage outfall rerouted after site survey.",
    "Retaining wall height increased on the north boundary after the topographic update.",
    "Access road gradient reduced from 12% to 8% to suit delivery trucks.",
    "Manhole inverts adjusted to match the municipal tie-in level.",
  ],
};
// Discipline names used on other screens map onto the closest reason set.
REASONS["Electrical"] = REASONS["MEPF"]!;
REASONS["Mechanical"] = REASONS["MEPF"]!;
REASONS["Plumbing"] = REASONS["MEPF"]!;
const DEFAULT_REASONS = REASONS["Architectural"]!;

const DISCIPLINE_BY_TYPE: Record<string, string> = {
  Commercial: "Architectural",
  Residential: "Architectural",
  Industrial: "Structural",
  Infrastructure: "Civil",
  "Renewable Energy": "MEPF",
};

export interface PlannedRevision {
  version: string;
  parentVersion: string | null;
  revisionNumber: number;
  reason: string;
  changeSummary: string;
  status: "Approved" | "Rejected" | "Under Review";
  createdBy: string;
  createdAt: Date;
  approvedAt?: Date;
}

/** Pure and deterministic: the revision chain for one design. */
export const planChain = (input: {
  projectCode: string;
  designCode: string;
  discipline: string;
  projectStatus: string;
  start: Date;
  /** The latest moment a revision may be dated: now, or the project's completion date once it is Completed/Archived. */
  now: Date;
  authors: string[];
}): PlannedRevision[] => {
  const rand = rng(hash(`${input.projectCode}|${input.designCode}`));
  const n = 3 + Math.floor(rand() * 3); // 3..5
  const reasons = REASONS[input.discipline] ?? DEFAULT_REASONS;
  const lastStatus: PlannedRevision["status"] = input.projectStatus === "Design" ? "Under Review" : "Approved";
  const span = Math.max(input.now.getTime() - input.start.getTime(), 3 * 86_400_000);
  const out: PlannedRevision[] = [];
  for (let i = 0; i < n; i++) {
    // Evenly spaced across the project's life with a little jitter, strictly increasing, never in the future.
    const slot = ((i + 1) / (n + 1)) * span;
    const jitter = (rand() - 0.5) * (span / (n + 1)) * 0.3;
    const createdAt = new Date(Math.min(input.start.getTime() + slot + jitter, input.now.getTime() - 3600_000));
    const status: PlannedRevision["status"] = i === n - 1 ? lastStatus : n >= 4 && i === 2 ? "Rejected" : "Approved";
    const approvedAt =
      status === "Approved"
        ? new Date(Math.min(createdAt.getTime() + (2 + Math.floor(rand() * 5)) * 86_400_000, input.now.getTime()))
        : undefined;
    const reason = reasons[i % reasons.length]!;
    out.push({
      version: VERSIONS[i]!,
      parentVersion: i === 0 ? null : VERSIONS[i - 1]!,
      revisionNumber: i + 1,
      reason: reason.slice(0, 255),
      changeSummary:
        status === "Rejected"
          ? "Returned by the reviewer for clarification; superseded by the next issue."
          : status === "Under Review"
            ? "Issued for review; awaiting the reviewer's decision."
            : "Affected sheets and schedules updated and re-issued; the previous sheets are withdrawn.",
      status,
      createdBy: input.authors[Math.floor(rand() * input.authors.length)] ?? input.authors[0]!,
      createdAt,
      approvedAt,
    });
  }
  return out;
};

export interface EnsureOptions {
  dryRun?: boolean;
  includeProposal?: boolean;
}
export interface EnsureResult {
  projectCode: string;
  created: number;
  designsCreated: number;
  skipped?: string;
  plan?: { design: string; versions: string[] }[];
}

/** Existing architect/engineer names staffed on the project; falls back to an architect account name (read only). */
const authorsFor = async (projectCode: string): Promise<string[]> => {
  const members = await projectMemberRepo.findAll({ projectCode });
  const names = members.filter((m) => m.role === "architect" || m.role === "engineer").map((m) => m.userName);
  if (names.length) return [...new Set(names)];
  const [architect] = await db.select({ name: users.name }).from(users).where(eq(users.role, "architect")).limit(1);
  return architect ? [architect.name] : [];
};

export async function ensureProjectRevisionDemo(projectCode: string, opts: EnsureOptions = {}): Promise<EnsureResult> {
  const project = await projectsRepo.findByCode(projectCode);
  if (!project) throw new NotFoundError("Project", projectCode);
  const result: EnsureResult = { projectCode, created: 0, designsCreated: 0 };

  if (project.status === "Proposal" && !opts.includeProposal) return { ...result, skipped: "Proposal phase: no design exists yet" };
  if ((await repo.countForProject(projectCode)) > 0) return { ...result, skipped: "already has revisions" };

  const authors = await authorsFor(projectCode);
  if (authors.length === 0) return { ...result, skipped: "no architect or engineer available to author revisions" };

  let projectDesigns = (await designsRepo.findAll({ projectCode })).sort((a, b) => a.id - b.id).slice(0, 3);
  const willCreateDesign = projectDesigns.length === 0;
  if (willCreateDesign && opts.dryRun) {
    result.plan = [{ design: `DSN-${projectCode}-DEMO (would be created)`, versions: ["v0.1", "v1.0", "v1.1"] }];
    return { ...result, designsCreated: 1, created: 3 };
  }
  if (willCreateDesign) {
    const discipline = DISCIPLINE_BY_TYPE[project.projectType ?? ""] ?? "Architectural";
    const [created] = await db
      .insert(designs)
      .values({
        code: `DSN-${projectCode}-DEMO`.slice(0, 50),
        name: `${project.name} — design package`,
        projectCode,
        discipline,
        category: discipline,
        leadArchitect: authors[0]!,
        client: project.client,
        description: "Placeholder design created by the demo revision generator.",
        isDemo: true,
      })
      .returning();
    projectDesigns = [created!];
    result.designsCreated = 1;
  }

  const start = project.createdAt ?? new Date(Date.now() - 90 * 86_400_000);
  // A finished project's design history ends when the project did.
  const now = project.completedAt ?? project.archivedAt ?? new Date();
  result.plan = [];
  for (const d of projectDesigns) {
    const chain = planChain({
      projectCode,
      designCode: d.code,
      discipline: d.discipline,
      projectStatus: project.status,
      start,
      now,
      authors,
    });
    result.plan.push({ design: d.code, versions: chain.map((c) => c.version) });
    if (opts.dryRun) {
      result.created += chain.length;
      continue;
    }
    for (const c of chain) {
      await service.create(
        {
          designId: d.id,
          version: c.version,
          parentVersion: c.parentVersion ?? undefined,
          revisionNumber: c.revisionNumber,
          reason: c.reason,
          changeSummary: c.changeSummary,
          status: c.status,
          createdBy: c.createdBy,
          isDemo: true,
          createdAt: c.createdAt,
          approvedAt: c.approvedAt,
        },
        { id: 0, name: "Demo generator", role: "admin" },
        { bypassLock: true },
      );
      result.created += 1;
    }
  }
  return result;
}

/** Removes only is_demo revisions, then is_demo designs left with none. */
export const removeDemoRevisions = (projectCode?: string) => repo.removeDemo(projectCode);

/** Newest-first list used by the CLI report. */
export const demoCounts = async () => {
  const rows = await db.select({ id: designs.id, isDemo: designs.isDemo }).from(designs).orderBy(desc(designs.id));
  return { designs: rows.length, demoDesigns: rows.filter((r) => r.isDemo).length };
};
