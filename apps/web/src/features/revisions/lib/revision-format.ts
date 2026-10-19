import type { Revision } from "../types/revision.types";

export const versionText = (r: Pick<Revision, "versionNumber" | "versionLabel">): string =>
  r.versionLabel ? `v${r.versionNumber} · ${r.versionLabel}` : `v${r.versionNumber}`;

export const formatDateTime = (value: string | null): string =>
  value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
