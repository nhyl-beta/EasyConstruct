// Confirmed bugs the owner is fixing on thesis-final-staging ("role-check fix pending"). Their tests are tagged @known so they stay
// Failed in the CSV without breaking the run's exit code. Decision of 2026-11-01: do NOT relabel these cells.
export const KNOWN_NOTE = "role-check-fix-pending";

interface KnownCell { role: string; page: string; part?: "read" | "write" | "fields" | "json" }
const KNOWN: KnownCell[] = [
  { role: "IT Designer", page: "ACTION: Build and submit payroll batch" },
  { role: "IT Designer", page: "ACTION: Approve or return payroll batch" },
  { role: "IT Designer", page: "Payroll" },                         // payroll batches read
  { role: "IT Designer", page: "Attendance Monitoring" },           // HR attendance read
  { role: "IT Designer", page: "Employees", part: "fields" },       // pay rates in the employee list
  { role: "IT Designer", page: "Attendance Clock-in" },             // POST /attendance
  { role: "Admin", page: "Payroll" },                               // payroll batches read
  { role: "Project Manager", page: "Blueprints", part: "write" },   // POST /blueprints
  { role: "Consultant", page: "Blueprints", part: "write" },
  { role: "Human Resources", page: "FUNCTION: Upload a document", part: "json" },   // POST /documents (JSON route)
  { role: "Finance Manager", page: "FUNCTION: Upload a document", part: "json" },
  { role: "Owner", page: "FUNCTION: Upload a document", part: "json" },
];
export const isKnown = (role: string, page: string, part?: KnownCell["part"]) =>
  KNOWN.some((k) => k.role === role && k.page === page && (!k.part || !part || k.part === part));
/** Title suffix for a known cell. */
export const knownTag = (role: string, page: string) => (isKnown(role, page) ? ` @known:${KNOWN_NOTE}` : "");
