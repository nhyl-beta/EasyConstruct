// apps/web/src/features/attendance/components/QuickAttendanceEntry.tsx
//
// Log one worker's attendance on the spot, with a photo — the in-app
// alternative to typing a row into the Excel sheet. Worker ID is resolved
// against the real roster server-side (same as the sheet import), so a typo
// is rejected rather than silently creating a bogus record. Logged for
// today only: a quick entry made right now shouldn't be able to backdate.
import { useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard } from "@/components/ui/section-card";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { useUploadFile } from "@/features/uploads/hooks/use-upload-file";
import { createManualAttendance, type AttendanceStatus } from "@/features/hr/attendance-api";

const STATUSES: AttendanceStatus[] = ["Present", "Late", "Absent", "On Leave", "Half Day"];
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export function QuickAttendanceEntry({
  projects,
  onLogged,
}: {
  /** The projects the caller may log for (staffed, in Construction/Closeout). */
  projects: { code: string; name: string }[];
  onLogged?: () => void;
}) {
  const [projectCode, setProjectCode] = useState("");
  const [employeeId, setEmployeeId] = useState("");
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

  const handlePhotoCaptured = (file: File) => {
    setCameraOpen(false);
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => setPhotoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const canSubmit = !!projectCode && !!employeeId.trim() && !!clockIn && !!photoFile && !saving && !uploading;

  const submit = async () => {
    if (!photoFile) return;
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
      });
      setSuccess(`Attendance logged for ${employeeId.trim().toUpperCase()}. Pending until HR verifies it.`);
      setEmployeeId("");
      setClockIn("");
      setClockOut("");
      setAttendanceStatus("Present");
      setRemarks("");
      setPhotoDataUrl(null);
      setPhotoFile(null);
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
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Worker ID</Label>
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="e.g. EMP-DEMO-01"
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
