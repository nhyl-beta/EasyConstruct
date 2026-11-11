import type { Blueprint } from "../types/blueprint.types";

// The library is a directory tree: project folder -> architect folder -> that architect's drawings.
export const NO_PROJECT = "No project";

export interface DirectoryEntry {
  name: string;
  count: number;
}

const projectOf = (b: Blueprint) => b.projectCode ?? NO_PROJECT;

const tally = (items: Blueprint[], key: (b: Blueprint) => string): DirectoryEntry[] => {
  const counts = new Map<string, number>();
  for (const b of items) counts.set(key(b), (counts.get(key(b)) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
};

export const projectFolders = (items: Blueprint[]) => tally(items, projectOf);

export const architectFolders = (items: Blueprint[], project: string) =>
  tally(items.filter((b) => projectOf(b) === project), (b) => b.author);

/** Drawings inside a project, and inside one architect's folder when `architect` is given; null = no filter. */
export const filesIn = (items: Blueprint[], project: string | null, architect: string | null) =>
  items.filter((b) => (project === null || projectOf(b) === project) && (architect === null || b.author === architect));
