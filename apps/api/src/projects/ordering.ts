// apps/api/src/projects/ordering.ts
//
// The project list used to come back with no ORDER BY, so Postgres returned
// rows in whatever physical order it liked: archived projects could sit among
// live ones and shift between pages as rows were updated. This is the one
// ordering rule: live work first, then Completed, Cancelled, and Archived
// last; within a group, most recently updated first (id breaks ties).
export const isArchivedStatus = (status: string): boolean => status === "Archived";

const GROUP_RANK = (status: string): number => {
  switch (status) {
    case "Completed":
      return 1;
    case "Cancelled":
      return 2;
    case "Archived":
      return 3;
    default:
      return 0; // Proposal … Closeout, On Hold — everything still in progress
  }
};

export interface Sortable {
  id: number;
  status: string;
  updatedAt: Date | string | null;
}

const time = (value: Date | string | null): number => (value ? new Date(value).getTime() : 0);

export const compareProjects = (a: Sortable, b: Sortable): number =>
  GROUP_RANK(a.status) - GROUP_RANK(b.status) || time(b.updatedAt) - time(a.updatedAt) || b.id - a.id;

export const sortProjects = <T extends Sortable>(rows: T[]): T[] => [...rows].sort(compareProjects);
