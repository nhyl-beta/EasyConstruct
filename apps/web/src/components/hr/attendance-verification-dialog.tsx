// apps/web/src/components/hr/attendance-verification-dialog.tsx
//
// HR's attendance table showed a geofence verdict as a coloured badge and
// opened the clock-in photo in a new browser tab. Neither is enough to
// *confirm* a clock-in: the badge is a conclusion with the evidence stripped
// out (the recorded coordinates and the distance from the registered site
// were dropped by the API client), and a photo in another tab is no longer
// next to the record it belongs to.
//
// This puts the two pieces of evidence side by side — the photo and the
// position — and lets HR record the verdict, which nothing in the UI could
// previously write.
import { useEffect, useState } from "react";
import { Camera, Loader2, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AttendanceEntry } from "@/features/hr/attendance-api";
import { useFileObjectUrl } from "@/lib/file-url";

interface AttendanceVerificationDialogProps {
  entry: AttendanceEntry | null;
  onOpenChange: (open: boolean) => void;
  onVerify: (
    id: number,
    status: "Verified" | "Flagged",
    remarks: string,
  ) => Promise<void>;
}

export function AttendanceVerificationDialog({
  entry,
  onOpenChange,
  onVerify,
}: AttendanceVerificationDialogProps) {
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState<"Verified" | "Flagged" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRemarks(entry?.remarks ?? "");
    setError(null);
    setSaving(null);
  }, [entry]);

  // Stored photos are private — fetched with the caller's token (lib/file-url).
  const { objectUrl: photo } = useFileObjectUrl(entry?.photoUrl);

  const hasPosition = entry?.latitude != null && entry?.longitude != null;

  const submit = async (status: "Verified" | "Flagged") => {
    if (!entry) return;
    setSaving(status);
    setError(null);
    try {
      await onVerify(entry.id, status, remarks.trim());
      onOpenChange(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the verification.",
      );
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Verify clock-in</DialogTitle>
          <DialogDescription>
            {entry
              ? `${entry.name} · ${entry.site} · ${entry.logDate} at ${entry.clockIn}`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="grid gap-5 md:grid-cols-2">
            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <Camera className="h-3.5 w-3.5" /> Verification photo
              </h3>
              <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
                {photo ? (
                  <img
                    src={photo}
                    alt={`Clock-in photo for ${entry.name}`}
                    className="max-h-64 w-full object-contain"
                  />
                ) : (
                  <p className="px-6 py-10 text-center text-xs text-muted-foreground">
                    No photo was captured with this clock-in.
                  </p>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Recorded location
              </h3>
              <dl className="space-y-2 rounded-xl border border-border p-4 text-sm">
                <Row label="Geofence">
                  <Badge variant="outline" className="rounded-full text-overline">
                    {entry.geofence}
                  </Badge>
                </Row>
                <Row label="Coordinates">
                  {hasPosition ? (
                    <span className="font-mono text-xs">
                      {entry.latitude!.toFixed(6)}, {entry.longitude!.toFixed(6)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not captured
                    </span>
                  )}
                </Row>
                <Row label="Distance from site">
                  {entry.distanceFromSiteM != null ? (
                    <span className="text-xs tabular-nums">
                      {entry.distanceFromSiteM} m
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Not measured
                    </span>
                  )}
                </Row>
              </dl>

              {hasPosition ? (
                // An external map is the only way to judge whether a
                // coordinate is plausibly on site; the app has no map layer.
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${entry.latitude}&mlon=${entry.longitude}#map=17/${entry.latitude}/${entry.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open location on map
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This clock-in carries no coordinates, so the geofence could
                  not be evaluated. Confirm it from the photo and the site
                  roster instead.
                </p>
              )}

              {entry.distanceFromSiteM == null && hasPosition && (
                <p className="text-xs text-muted-foreground">
                  The project this clock-in belongs to has no registered site
                  coordinates, so no distance could be calculated. Set them on
                  the project to enable automatic geofencing.
                </p>
              )}
            </section>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="attendance-remarks">Verification note</Label>
              <Textarea
                id="attendance-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="What did you check, and what did you conclude?"
                className="min-h-20"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive-strong md:col-span-2">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving !== null}
            onClick={() => void submit("Flagged")}
          >
            {saving === "Flagged" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Flag for follow-up
          </Button>
          <Button
            disabled={saving !== null}
            onClick={() => void submit("Verified")}
          >
            {saving === "Verified" && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            Mark verified
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

AttendanceVerificationDialog.displayName = "AttendanceVerificationDialog";
