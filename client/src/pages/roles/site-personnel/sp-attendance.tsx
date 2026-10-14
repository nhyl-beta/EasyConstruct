// client/src/pages/roles/site-personnel/sp-attendance.tsx — NEW
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, MapPin, CheckCircle2, AlertTriangle, Clock, WifiOff, RefreshCw } from "lucide-react";
import { PageContainer } from "@/components/refine-ui/views/page-container";
import { PageHeader } from "@/components/refine-ui/views/page-header";
import { PageContent } from "@/components/refine-ui/views/page-content";
import { SectionCard } from "@/components/ui/section-card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/auth/auth-context";
import { useAttendance } from "@/features/attendance/hooks/use-attendance";
import { useUploadFile} from "@/features/uploads/hooks/use-upload-file";
import { useMyEmployee } from "@/features/employees/hooks/use-my-employee";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { ProjectMemberRepository } from "@/features/project-members/repositories/project-member.repository";
import { useOfflineAttendanceSync } from "@/features/attendance/offline/useOfflineSync";
import { enqueueAttendance } from "@/features/attendance/offline/queue";
import { AttendanceSheetImport } from "@/features/attendance/components/AttendanceSheetImport";

interface CachedSiteGeofence {
  siteLatitude: number;
  siteLongitude: number;
  geofenceRadiusM: number;
}

const GEOFENCE_CACHE_KEY = "easyconstruct_site_geofence_cache";

function cacheGeofences(projects: { code: string; siteLatitude?: number | null; siteLongitude?: number | null; geofenceRadiusM?: number | null }[]) {
  const cache: Record<string, CachedSiteGeofence> = {};
  for (const p of projects) {
    if (p.siteLatitude != null && p.siteLongitude != null) {
      cache[p.code] = {
        siteLatitude: p.siteLatitude,
        siteLongitude: p.siteLongitude,
        geofenceRadiusM: p.geofenceRadiusM ?? 300,
      };
    }
  }
  try {
    localStorage.setItem(GEOFENCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage full/unavailable — offline geofence check just won't have
    // cached coordinates for this project; the entry still queues, flagged
    // Unverified, for server-side review once synced.
  }
}

function getCachedGeofence(projectCode: string): CachedSiteGeofence | null {
  try {
    const raw = localStorage.getItem(GEOFENCE_CACHE_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, CachedSiteGeofence>;
    return cache[projectCode] ?? null;
  } catch {
    return null;
  }
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}



function useMyEmployeeId(): string | null {
  const { user } = useAuth();
  return useMemo(() => (user ? user.email.split("@")[0] : null), [user]);
}

/** G1: attendance can only be logged against a project this worker is
 * actually staffed on as site personnel — the server enforces this too,
 * but without a scoped picker the page had no way to pick a project at all. */
function useMyStaffedProjectCodes(): string[] {
  const { user } = useAuth();
  const [codes, setCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    ProjectMemberRepository.listForUser(user.id)
      .then((members) => {
        if (cancelled) return;
        setCodes(members.filter((m) => m.role === "site-personnel").map((m) => m.projectCode));
      })
      .catch(() => setCodes([]));
    return () => {
      cancelled = true;
    };
  }, [user]);

  return codes;
}

type GeoState = "idle" | "requesting" | "granted" | "denied";

export default function SPAttendancePage() {
  const { employeeId, loading: employeeLoading, error: employeeError } = useMyEmployee();
  const { today, loading, error, submitting, clockIn, clockOut } = useAttendance(employeeId);

  const { projects } = useProjects();
  const staffedCodes = useMyStaffedProjectCodes();
  const staffedProjects = useMemo(
    () => projects.filter((p) => staffedCodes.includes(p.code)),
    [projects, staffedCodes],
  );
  const [projectCode, setProjectCode] = useState("");

  // E1: cache each staffed project's geofence coordinates whenever they're
  // freshly fetched online, so a clock-in attempted while offline can still
  // run the Inside/Outside check against the last-known site location.
  useEffect(() => {
    if (staffedProjects.length > 0) cacheGeofences(staffedProjects);
  }, [staffedProjects]);

  const { isOnline, pendingCount, pendingEntries, syncing, lastSyncError, syncNotice, dismissSyncNotice, retrySync, discardPending } = useOfflineAttendanceSync();
  const needsAttention = pendingEntries.filter((e) => e.needsAttention);

  const {uploadDataUrl, uploading: uploadingPhoto} = useUploadFile();
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoState("denied");
      return;
    }
    setGeoState("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoState("granted");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handlePhotoSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSubmit = geoState === "granted" && !!photoDataUrl && !!projectCode && !submitting;

  // E1: try the network path first; if it fails (offline, or a request that
  // errors mid-flight), fall back to queuing the entry locally instead of
  // just showing an error and losing the clock-in attempt. Offline is
  // checked up front too, so a known-offline device skips straight to
  // queuing instead of waiting out a request that can only time out.
  const handleSubmit = async () => {
    if (!coords || !photoDataUrl || !photoFile || !projectCode || !employeeId) return;

    const cached = getCachedGeofence(projectCode);
    const offlineGeofence: "Inside" | "Outside" | "Unverified" = cached
      ? distanceMeters(coords.lat, coords.lng, cached.siteLatitude, cached.siteLongitude) <= cached.geofenceRadiusM
        ? "Inside"
        : "Outside"
      : "Unverified";

    const queueOffline = async () => {
      await enqueueAttendance({
        employeeId,
        site: "Assigned Site",
        projectCode,
        clockIn: new Date().toTimeString().slice(0, 5),
        logDate: new Date().toISOString().slice(0, 10),
        latitude: coords.lat,
        longitude: coords.lng,
        geofence: offlineGeofence,
        photo: photoFile,
        photoType: photoFile.type || "image/jpeg",
      });
      setQueuedMessage("Queued — will sync automatically once you're back online.");
      setPhotoDataUrl(null);
      setPhotoFile(null);
      setGeoState("idle");
      setCoords(null);
    };

    if (!navigator.onLine) {
      await queueOffline();
      return;
    }

    try {
      const [, mimeMatch] = /^data:([^;]+);base64,/.exec(photoDataUrl) ?? [];
      const photoUrl = await uploadDataUrl(`attendance-${Date.now()}.jpg`, mimeMatch ?? "image/jpeg", photoDataUrl);
      await clockIn({
        site: "Assigned Site",
        projectCode,
        latitude: coords.lat,
        longitude: coords.lng,
        photoUrl,
      });
      setPhotoDataUrl(null);
      setPhotoFile(null);
      setGeoState("idle");
      setCoords(null);
    } catch {
      await queueOffline();
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Attendance" description="Geofenced, photo-verified attendance for your assigned site" />
      <PageContent className="p-6 md:p-8 space-y-6">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
          <span className={`flex items-center gap-1.5 font-medium ${isOnline ? "text-success-strong" : "text-warning-strong"}`}>
            {isOnline ? <CheckCircle2 className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {isOnline ? "Online" : "Offline"}
          </span>
          {pendingCount > 0 && (
            <>
              <span className="text-muted-foreground">
                {pendingCount} attendance record{pendingCount === 1 ? "" : "s"} queued
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={!isOnline || syncing}
                onClick={() => void retrySync()}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Syncing…" : "Retry sync"}
              </Button>
            </>
          )}
          {lastSyncError && <span className="text-xs text-destructive-strong">{lastSyncError}</span>}
        </div>

        {syncNotice && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <span>{syncNotice}</span>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={dismissSyncNotice}>
              Dismiss
            </Button>
          </div>
        )}

        {needsAttention.length > 0 && (
          <ul className="space-y-2" aria-label="Queued records that need attention">
            {needsAttention.map((e) => (
              <li key={e.clientRequestId} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-strong">
                <span>
                  <strong>Needs attention:</strong> the record for {e.logDate} ({e.site}, {e.clockIn}) was not accepted. {e.syncError ?? ""}
                </span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => void discardPending(e.clientRequestId)}>
                  Discard
                </Button>
              </li>
            ))}
          </ul>
        )}

        {queuedMessage && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning-strong">
            {queuedMessage}
          </div>
        )}

        {!employeeLoading && (!employeeId || employeeError) && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning-strong">
            {employeeError ?? "No employee profile is linked to your account yet."}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive-strong">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading today's attendance…</p>
        ) : today ? (
          <SectionCard title="Today's attendance" subtitle={today.logDate}>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Clocked in at {today.clockIn}
              </div>
              {today.clockOut && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Clocked out at {today.clockOut}
                </div>
              )}
              <StatusBadge status={today.geofence} />
              <StatusBadge status={today.photo === "Verified" ? "Verified" : "Pending"} />
            </div>
            {!today.clockOut && (
              <Button className="mt-4" onClick={() => clockOut()} disabled={submitting}>
                Clock out
              </Button>
            )}
          </SectionCard>
        ) : (
          <SectionCard title="Log attendance" subtitle="Verify your location and identity to clock in">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Select value={projectCode || undefined} onValueChange={setProjectCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {staffedProjects.length === 0 && (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">
                        You are not staffed on any project as site personnel
                      </div>
                    )}
                    {staffedProjects.map((p) => (
                      <SelectItem key={p.code} value={p.code}>
                        {p.code} · {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant={geoState === "granted" ? "outline" : "default"}
                 
                  onClick={requestLocation}
                  disabled={geoState === "requesting"}
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  {geoState === "granted" ? "Location verified" : "Verify location"}
                </Button>
                {geoState === "granted" && <CheckCircle2 className="h-5 w-5 text-success-strong" />}
                {geoState === "denied" && (
                  <span className="flex items-center gap-1 text-xs text-destructive-strong">
                    <AlertTriangle className="h-4 w-4" /> Location permission denied — attendance cannot be verified without it.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoSelected}
                />
                <Button
                  variant={photoDataUrl ? "outline" : "default"}
                 
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="mr-2 h-4 w-4" />
                  {photoDataUrl ? "Retake photo" : "Take verification photo"}
                </Button>
                {photoDataUrl && <CheckCircle2 className="h-5 w-5 text-success-strong" />}
              </div>

              {photoDataUrl && (
                <img
                  src={photoDataUrl}
                  alt="Attendance verification preview"
                  className="h-40 w-40 rounded-lg border object-cover"
                />
              )}

              <Button disabled={!canSubmit || uploadingPhoto} onClick={handleSubmit}>
                {uploadingPhoto ? "Uploading photo…" : submitting ? "Submitting…" : "Confirm attendance"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Attendance already recorded today can't be duplicated — the server rejects a second clock-in for the same date.
              </p>
            </div>
          </SectionCard>
        )}

        {/* Several workers' attendance at once, from an Excel sheet. */}
        <AttendanceSheetImport
          projects={staffedProjects.filter((p) => ["Construction", "Closeout"].includes(p.status))}
        />
      </PageContent>
    </PageContainer>
  );
}

SPAttendancePage.displayName = "SPAttendancePage";