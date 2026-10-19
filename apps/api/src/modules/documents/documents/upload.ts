import { maxUploadBytes } from "../uploads/limits.js";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// Vercel's serverless functions only allow writes under os.tmpdir();
// the rest of the deployment bundle is a read-only filesystem.
const uploadDirectory = process.env.VERCEL
  ? path.join(os.tmpdir(), "uploads", "documents")
  : path.resolve(process.cwd(), "uploads", "documents");

fs.mkdirSync(uploadDirectory, {
  recursive: true,
});

const allowedMimeTypes = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png",
  "image/jpeg",
]);

const allowedExtensions = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".png",
  ".jpg",
  ".jpeg",
  // Floor plans / CAD (browsers report these as octet-stream or vendor types).
  ".dwg",
  ".dxf",
]);

const genericMimeTypes = new Set(["application/octet-stream", "application/acad", "image/vnd.dwg", "application/dxf", ""]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname);

    const safeName =
      path
        .basename(
          file.originalname,
          extension,
        )
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 50) || "document";

    const uniqueName = `${Date.now()}-${Math.round(
      Math.random() * 1_000_000,
    )}`;

    cb(
      null,
      `${safeName}-${uniqueName}${extension}`,
    );
  },
});

export const advisoryDocumentUpload = multer({
  storage,

  limits: {
    fileSize: maxUploadBytes(),
  },

  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (
      !(allowedMimeTypes.has(file.mimetype) || genericMimeTypes.has(file.mimetype)) ||
      !allowedExtensions.has(extension)
    ) {
      return cb(
        new Error(
          "Unsupported file type. Please upload PDF, DWG/DXF, Word, Excel, PowerPoint, PNG, or JPG files.",
        ),
      );
    }

    cb(null, true);
  },
});