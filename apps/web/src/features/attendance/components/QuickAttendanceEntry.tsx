// apps/web/src/features/attendance/components/QuickAttendanceEntry.tsx
//
// Log one worker's attendance on the spot, with a photo — the in-app
// alternative to typing a row into the Excel sheet. Worker ID is resolved
// against the real roster server-side (same as the sheet import), so a typo
// is rejected rather than silently creating a bogus record. Logged for
// today only: a quick entry made right now shouldn't be able to backdate.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, CheckCircle2, Loader2, MapPin, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/ui/section-card";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { useUploadFile } from "@/features/uploads/hooks/use-upload-file";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { employeesRepository, type EmployeeLookupResult } from "@/features/employees/repositories/employees.repository";
import { createManualAttendance, type AttendanceStatus } from "@/features/hr/attendance-api";

// Absent/On Leave don't fit a form that requires a photo and a clock-in time
// for every entry — a worker who isn't there can't be photographed. Those
// statuses belong to HR's separate "Mark absent" flow, not here.
const STATUSES: AttendanceStatus[] = ["Present", "Late", "Half Day"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

type GeoState = "idle" | "requesting" | "granted" | "denied";

export function QuickAttendanceEntry({
  projects,
  onLogged,
}: {
  /** The projects the caller may log for (staffed, in Construction/Closeout). */
  projects: { code: string; name: string }[];
  onLogged?: () => void;
}) {
  const [projectCode, setProjectCode] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [matches, setMatches] = useState<EmployeeLookupResult[]>([]);
  const [matchesOpen, setMatchesOpen] = useState(false);
  const debouncedName = useDebouncedValue(workerName, 300);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState<AttendanceStatus>("Present");
  const [remarks, setRemarks] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const { uploadFile, uploading } = useUploadFile();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Site Personnel's own location, at the moment they're making this entry —
  // not the worker's, which there is no way to measure. Same device-GPS
  // request the self clock-in page already uses.
  const [geoState, setGeoState] = useState<GeoState>("idle");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

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

  // A worker already in the roster: looking up their name fills in the ID,
  // so it doesn't have to be typed (or remembered) from scratch.
  useEffect(() => {
    if (debouncedName.trim().length < 2) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    employeesRepository
      .lookup(debouncedName.trim())
      .then((res) => {
        if (!cancelled) setMatches(res.data);
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedName]);

  const pickMatch = (m: EmployeeLookupResult) => {
    setWorkerName(m.name);
    setEmployeeId(m.employeeId);
    setMatches([]);
    setMatchesOpen(false);
  };

  const handlePhotoCaptured = (file: File) => {
    setCameraOpen(false);
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSubmit =
    !!projectCode && !!employeeId.trim() && !!clockIn && !!photoFile && geoState === "granted" && !saving && !uploading;

  const submit = async () => {
    if (!photoFile || !coords) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const photoUrl = await uploadFile(photoFile);
      await createManualAttendance({
        employeeId: employeeId.trim().toUpperCase(),
        projectCode,
        logDate: today(),
        clockIn,
        clockOut: clockOut || undefined,
        attendanceStatus,
        remarks: remarks.trim() || undefined,
        photoUrl,
        latitude: coords.lat,
        longitude: coords.lng,
      });
      setSuccess(`Attendance logged for ${employeeId.trim().toUpperCase()}. Pending until HR verifies it.`);
      setWorkerName("");
      setEmployeeId("");
      setMatches([]);
      setClockIn("");
      setClockOut("");
      setAttendanceStatus("Present");
      setRemarks("");
      setPhotoDataUrl(null);
      setPhotoFile(null);
      setGeoState("idle");
      setCoords(null);
      onLogged?.();
      clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setSuccess(null), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this attendance");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Quick attendance entry"
      subtitle="Log one worker's attendance now, with a photo — for workers without their own account"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Project</Label>
            <SearchableSelect
              value={projectCode || undefined}
              onValueChange={setProjectCode}
              options={projects.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))}
              placeholder="Select a project"
              searchPlaceholder="Search projects…"
              emptyText="You are not staffed on any project as site personnel"
            />
          </div>
          <div className="relative space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Worker name</Label>
            <Input
              value={workerName}
              onChange={(e) => {
                setWorkerName(e.target.value);
                setEmployeeId("");
              }}
              onFocus={() => setMatchesOpen(true)}
              onBlur={() => setTimeout(() => setMatchesOpen(false), 150)}
              placeholder="Start typing a name…"
              autoComplete="off"
            />
            {matchesOpen && matches.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-border bg-popover text-sm shadow-md">
                {matches.map((m) => (
                  <li key={m.employeeId}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickMatch(m)}
                    >
                      <span>{m.name}</span>
                      <span className="font-mono text-overline text-muted-foreground">{m.employeeId}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Worker ID</Label>
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="Fills in from the name, or type it directly"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Time in</Label>
            <Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Time out (optional)</Label>
            <Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Status</Label>
            <Select value={attendanceStatus} onValueChange={(v) => setAttendanceStatus(v as AttendanceStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Remarks (optional)</Label>
            <Input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any notes" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
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
              <AlertTriangle className="h-4 w-4" /> Location permission denied — this entry needs it to record where it was made.
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <CameraCapture
            open={cameraOpen}
            title="Worker's photo"
            onCapture={handlePhotoCaptured}
            onCancel={() => setCameraOpen(false)}
          />
          <Button type="button" variant={photoDataUrl ? "outline" : "default"} onClick={() => setCameraOpen(true)}>
            <Camera className="mr-2 h-4 w-4" />
            {photoDataUrl ? "Retake photo" : "Take worker's photo"}
          </Button>
          {photoDataUrl && <CheckCircle2 className="h-5 w-5 text-success-strong" />}
        </div>

        {photoDataUrl && (
          <img src={photoDataUrl} alt="Worker photo preview" className="h-40 w-40 rounded-lg border object-cover" />
        )}

        <Button disabled={!canSubmit} onClick={() => void submit()}>
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserPlus className="h-4 w-4" />
          )}
          {uploading ? "Uploading photo…" : saving ? "Logging…" : "Log attendance"}
        </Button>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive-strong">
            {error}
          </p>
        )}
        {success && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success-strong">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {success}
          </p>
        )}
      </div>
    </SectionCard>
  );
}
