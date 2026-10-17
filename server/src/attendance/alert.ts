// server/src/attendance/alert.ts: pure, no I/O (client demo change #7)
//
// The instant alert for a clock-in outside the project's radius. A flagged record used to wait for the daily
// exceptions check; now the project's PM, HR and Admin are told as soon as it is saved, with who, where, how
// far out and when. One notification per record, in-app only.

/** The people told: the project's PM, every HR user and every Admin. */
export const FLAGGED_CLOCK_IN_ROLES = ["project-manager", "human-resources", "admin"] as const;

export interface SavedClockIn {
  id: number;
  status: string;
  geofence: string;
  employeeId: string;
  projectCode: string | null;
  logDate: string;
  clockIn: string;
  distanceFromSiteM: number | null;
  validatedOffline: boolean;
}

/** Only a measured breach alerts: an unmeasured ("Pending") or inside clock-in never does. */
export const shouldAlertFlagged = (r: Pick<SavedClockIn, "status" | "geofence">): boolean => r.status === "Flagged" && r.geofence === "Outside";

/** "1.2 km" at a kilometre or more, otherwise "450 m". */
export const formatDistance = (meters: number | null | undefined): string => {
  if (meters == null || !Number.isFinite(meters)) return "an unknown distance";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
};

/** The link in the notification: the HR attendance page, filtered to the record and highlighting it. */
export const flaggedClockInLink = (recordId: number): string => `/attendance?highlight=${recordId}`;

export const buildFlaggedAlert = (input: {
  record: SavedClockIn;
  employeeName: string;
  projectName: string;
  radiusM: number;
}) => {
  const { record, employeeName, projectName, radiusM } = input;
  const how = record.validatedOffline ? " (recorded offline, synced later)" : "";
  return {
    title: `Clock-in outside the site radius: ${employeeName}`,
    body: `${employeeName} clocked in at ${record.clockIn} on ${record.logDate} for ${projectName} (${record.projectCode}), ${formatDistance(record.distanceFromSiteM)} from the site (allowed ${radiusM} m)${how}.`,
    link: flaggedClockInLink(record.id),
  };
};
