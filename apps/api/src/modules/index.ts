import type { ApiModule, ModuleMount } from "./types.js";
import { module as iam } from "./iam/module.js";
import { module as documents } from "./documents/module.js";
import { module as projects } from "./projects/module.js";
import { module as design } from "./design/module.js";
import { module as workflow } from "./workflow/module.js";
import { module as workforce } from "./workforce/module.js";
import { module as finance } from "./finance/module.js";
import { module as insights } from "./insights/module.js";
import { module as platform } from "./platform/module.js";

export const modules: ApiModule[] = [
  iam,
  documents,
  projects,
  design,
  workflow,
  workforce,
  finance,
  insights,
  platform,
];

export function getEnabledMounts(): ModuleMount[] {
  return modules
    .filter((entry) => {
      if (!entry.flag) return true;
      if (process.env[entry.flag]?.toLowerCase() === "false") return false;
      return entry.name !== "insights" || process.env.FEATURE_AI?.toLowerCase() !== "false";
    })
    .flatMap((entry) => entry.mounts)
    .sort((a, b) => a.order - b.order);
}

export type { ApiModule, ModuleMount } from "./types.js";
