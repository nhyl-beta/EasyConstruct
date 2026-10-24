import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CameraError,
  captureFileName,
  captureFrame,
  classifyCameraError,
  fitWithin,
  startCameraStream,
  stopStream,
} from "./camera-capture-logic";

const domError = (name: string) => Object.assign(new Error(name), { name });
const fakeStream = () => {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream, stop };
};

describe("startCameraStream (mocked getUserMedia)", () => {
  it("opens the rear camera and returns the stream", async () => {
    const { stream } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const result = await startCameraStream({ isSecureContext: true, mediaDevices: { getUserMedia } });
    expect(result).toBe(stream);
    expect(getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" }, audio: false });
  });

  it("reports permission denied", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError("NotAllowedError"));
    await expect(startCameraStream({ isSecureContext: true, mediaDevices: { getUserMedia } })).rejects.toMatchObject({
      kind: "denied",
    });
  });

  it("reports no camera found", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError("NotFoundError"));
    await expect(startCameraStream({ isSecureContext: true, mediaDevices: { getUserMedia } })).rejects.toMatchObject({
      kind: "no-device",
    });
  });

  it("reports a busy camera", async () => {
    const getUserMedia = vi.fn().mockRejectedValue(domError("NotReadableError"));
    await expect(startCameraStream({ isSecureContext: true, mediaDevices: { getUserMedia } })).rejects.toMatchObject({
      kind: "busy",
    });
  });

  it("refuses an insecure page without asking for the camera", async () => {
    const getUserMedia = vi.fn();
    await expect(startCameraStream({ isSecureContext: false, mediaDevices: { getUserMedia } })).rejects.toMatchObject({
      kind: "insecure",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("reports an unsupported browser (no mediaDevices) — never a file-picker fallback", async () => {
    await expect(startCameraStream({ isSecureContext: true, mediaDevices: undefined })).rejects.toBeInstanceOf(CameraError);
  });

  it("falls back to a generic message for unknown errors", () => {
    expect(classifyCameraError(new Error("boom")).kind).toBe("unknown");
  });
});

describe("stopStream", () => {
  it("stops every track, and tolerates no stream", () => {
    const { stream, stop } = fakeStream();
    stopStream(stream);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(() => stopStream(null)).not.toThrow();
  });
});

describe("fitWithin / captureFileName", () => {
  it("scales the long side down to 1600 and never up", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("names captures capture-<timestamp>.jpg", () => {
    expect(captureFileName(1760000000000)).toBe("capture-1760000000000.jpg");
  });
});

describe("captureFrame", () => {
  it("draws a downscaled frame and returns a JPEG File", async () => {
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => {
        expect(type).toBe("image/jpeg");
        expect(q).toBe(0.8);
        cb(new Blob(["x"], { type: "image/jpeg" }));
      },
    } as unknown as HTMLCanvasElement;
    const file = await captureFrame({ videoWidth: 4000, videoHeight: 3000 }, canvas, 1760000000000);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(drawImage).toHaveBeenCalled();
    expect(file.name).toBe("capture-1760000000000.jpg");
    expect(file.type).toBe("image/jpeg");
  });

  it("refuses when the video has no frame yet", async () => {
    await expect(captureFrame({ videoWidth: 0, videoHeight: 0 }, {} as HTMLCanvasElement)).rejects.toBeInstanceOf(CameraError);
  });
});

// The test environment has no DOM, so the pages are checked at source level:
// the Site Personnel photo flows must not render a free-choice image picker.
describe("Site Personnel pages use the live camera", () => {
  const src = (rel: string) => readFileSync(resolve(__dirname, "../../", rel), "utf8");

  it("attendance has no file input and uses CameraCapture", () => {
    const code = src("pages/roles/site-personnel/sp-attendance.tsx");
    expect(code).toContain("<CameraCapture");
    expect(code).not.toMatch(/<input[^>]*type="file"/);
    expect(code).not.toMatch(/capture="environment"/);
  });

  it("documents: the only file input refuses images and photo types use the camera", () => {
    const code = src("pages/roles/site-personnel/sp-documents.tsx");
    expect(code).toContain("<CameraCapture");
    expect(code).not.toMatch(/accept="image/);
    expect(code).toContain('startsWith("image/")');
  });

  it("task completion turns camera-only on for Site Personnel, and the dialog drops image/* then", () => {
    expect(src("pages/roles/site-personnel/sp-tasks.tsx")).toMatch(/cameraOnly=\{user\?\.role === "site-personnel"\}/);
    const dialog = src("components/tasks/complete-task-dialog.tsx");
    expect(dialog).toContain('cameraOnly ? "application/pdf" : "image/*,application/pdf"');
  });
});
