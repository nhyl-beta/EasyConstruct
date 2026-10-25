// Pure helpers behind CameraCapture (components/shared/CameraCapture.tsx), kept
// free of React so they can be unit-tested without a DOM.
//
// A front-end control only: the server cannot tell a camera frame from any
// other JPEG, so this stops casual re-use of an old photo, not a determined
// user posting to the API directly.

export type CameraErrorKind = "insecure" | "unsupported" | "denied" | "no-device" | "busy" | "unknown";

export class CameraError extends Error {
  constructor(
    public kind: CameraErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "CameraError";
  }
}

const MESSAGES: Record<CameraErrorKind, string> = {
  insecure: "The camera only works on a secure (HTTPS) page. Open the site over HTTPS and try again.",
  unsupported: "This browser can't open the camera. Try a current version of Chrome, Safari or Edge.",
  denied: "Camera permission was denied. Allow camera access for this site in the browser settings, then try again.",
  "no-device": "No camera was found on this device.",
  busy: "The camera is in use by another app or tab. Close it and try again.",
  unknown: "The camera couldn't be started. Try again.",
};

export const cameraMessage = (kind: CameraErrorKind): string => MESSAGES[kind];

/** Maps a getUserMedia rejection to a CameraError with a user-facing message. */
export function classifyCameraError(err: unknown): CameraError {
  if (err instanceof CameraError) return err;
  const name = (err as { name?: string } | null)?.name ?? "";
  let kind: CameraErrorKind = "unknown";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") kind = "denied";
  else if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") kind = "no-device";
  else if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") kind = "busy";
  return new CameraError(kind, MESSAGES[kind]);
}

interface MediaEnv {
  isSecureContext?: boolean;
  mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> };
}

/**
 * Opens the rear camera. Never falls back to a file picker: if the camera is
 * unavailable the caller gets a CameraError and no photo can be produced.
 */
export async function startCameraStream(
  env: MediaEnv = { isSecureContext: window.isSecureContext, mediaDevices: navigator.mediaDevices },
): Promise<MediaStream> {
  if (env.isSecureContext === false) throw new CameraError("insecure", MESSAGES.insecure);
  if (!env.mediaDevices?.getUserMedia) throw new CameraError("unsupported", MESSAGES.unsupported);
  try {
    return await env.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (err) {
    throw classifyCameraError(err);
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Largest long side of an uploaded frame, and the JPEG quality used. */
export const MAX_CAPTURE_SIDE = 1600;
export const CAPTURE_QUALITY = 0.8;

/** Scales (w, h) down so the long side is at most `max`; never scales up. */
export function fitWithin(width: number, height: number, max: number = MAX_CAPTURE_SIDE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= max) return { width, height };
  const scale = max / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export const captureFileName = (now: number = Date.now()): string => `capture-${now}.jpg`;

/** Draws the current video frame to a canvas and returns it as a compressed JPEG File. */
export async function captureFrame(
  video: { videoWidth: number; videoHeight: number },
  canvas: HTMLCanvasElement,
  now: number = Date.now(),
): Promise<File> {
  const { width, height } = fitWithin(video.videoWidth, video.videoHeight);
  if (!width || !height) throw new CameraError("unknown", "The camera isn't ready yet. Wait a moment and try again.");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new CameraError("unknown", MESSAGES.unknown);
  ctx.drawImage(video as CanvasImageSource, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", CAPTURE_QUALITY));
  if (!blob) throw new CameraError("unknown", "The photo couldn't be captured. Try again.");
  return new File([blob], captureFileName(now), { type: "image/jpeg", lastModified: now });
}
