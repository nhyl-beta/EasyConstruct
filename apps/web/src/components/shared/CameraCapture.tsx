// Live-camera photo capture for Site Personnel evidence (attendance, task
// completion, field photos). There is deliberately no file picker, gallery or
// drag-and-drop here, and no fallback to one: if the camera can't start, no
// photo can be produced. This is a front-end control only — the server cannot
// prove an image came from the camera.
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CameraError,
  captureFrame,
  classifyCameraError,
  startCameraStream,
  stopStream,
} from "./camera-capture-logic";

interface CameraCaptureProps {
  open: boolean;
  /** Called with the confirmed JPEG (`capture-<timestamp>.jpg`). */
  onCapture: (file: File) => void;
  /** Called on Cancel, Escape or clicking outside. */
  onCancel: () => void;
  title?: string;
}

type Phase = "starting" | "live" | "captured" | "error";

export function CameraCapture({ open, onCapture, onCancel, title = "Take a photo" }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);

  const stop = useCallback(() => {
    stopStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    setPhase("starting");
    setError(null);
    try {
      const stream = await startCameraStream();
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        // Closed while the permission prompt was open.
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      setPhase("live");
    } catch (err) {
      stop();
      setError(classifyCameraError(err).message);
      setPhase("error");
    }
  }, [stop]);

  // The dialog mounts its content on open, so the video element exists after
  // the first paint with open=true.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => void start());
    return () => {
      cancelAnimationFrame(id);
      stop();
    };
  }, [open, start, stop]);

  useEffect(
    () => () => {
      if (shot) URL.revokeObjectURL(shot.url);
    },
    [shot],
  );

  // Always leave with the camera released.
  useEffect(() => stop, [stop]);

  const snap = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    try {
      const file = await captureFrame(video, canvas);
      setShot({ file, url: URL.createObjectURL(file) });
      setPhase("captured");
    } catch (err) {
      setError(err instanceof CameraError ? err.message : classifyCameraError(err).message);
      setPhase("error");
    }
  };

  const retake = () => {
    setShot(null);
    setPhase("live");
  };

  const close = () => {
    stop();
    setShot(null);
    onCancel();
  };

  const use = () => {
    if (!shot) return;
    const file = shot.file;
    stop();
    setShot(null);
    onCapture(file);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Use the live camera. Photos can't be picked from the gallery or files.</DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-label="Live camera preview"
            className={`h-full w-full object-cover ${phase === "live" || phase === "starting" ? "" : "hidden"}`}
          />
          {phase === "captured" && shot && (
            <img src={shot.url} alt="Captured photo preview" className="h-full w-full object-cover" />
          )}
          {phase === "starting" && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white">Starting camera…</p>
          )}
          {phase === "error" && (
            <p role="alert" className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white">
              {error}
            </p>
          )}
        </div>
        <canvas ref={canvasRef} className="hidden" />

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          {phase === "error" && (
            <Button variant="outline" onClick={() => void start()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          )}
          {phase === "live" && (
            <Button onClick={() => void snap()}>
              <Camera className="mr-2 h-4 w-4" />
              Capture
            </Button>
          )}
          {phase === "captured" && (
            <>
              <Button variant="outline" onClick={retake}>
                Retake
              </Button>
              <Button onClick={use}>Use photo</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

CameraCapture.displayName = "CameraCapture";
