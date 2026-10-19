import { Router } from "express";
import * as controller from "./controller.js";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  createAttendanceSchema,
  markAbsentSchema,
  updateAttendanceSchema,
} from "../validators/attendance-validators.js";
import multer from "multer";
import { ValidationError } from "../utils/errors.js";

const router = Router();

// The sheet is read straight from memory and never stored as a file: it is
// parsed, validated and (on commit) turned into attendance rows.
const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!/\.xlsx$/i.test(file.originalname)) {
      return cb(new ValidationError("Upload an Excel workbook (.xlsx). Start from the template if you're unsure."));
    }
    cb(null, true);
  },
});

router.use(authenticate);

// Site attendance by spreadsheet. Declared before "/:id" so "import" isn't
// taken for an id. Site Personnel upload for the projects they are staffed
// on; Admin may upload for any.
const canImportSheets = requireRole("site-personnel", "admin");
router.get("/import/template", canImportSheets, controller.importTemplate);
router.post("/import/preview", canImportSheets, sheetUpload.single("file"), controller.importPreview);
router.post("/import/commit", canImportSheets, sheetUpload.single("file"), controller.importCommit);

router.get("/", controller.getAll);
// E1: declared before "/:id" so these are not read as ids.
router.get("/heatmap", controller.heatmap);
router.post("/bulk-verify", requireRole("human-resources", "admin"), controller.bulkVerify);
// Fix 2.3: exception flags and the one-click "Mark absent". Before "/:id".
router.get("/exceptions", requireRole("human-resources", "admin"), controller.exceptions);
router.post("/mark-absent", requireRole("human-resources", "admin"), validate(markAbsentSchema), controller.markAbsent);
router.get("/:id", controller.getById);
router.post(
  "/",
  requireRole("site-personnel", "admin", "it-designer"),
  validate(createAttendanceSchema),
  controller.create,
);
// Site Personnel is on this list so that clocking out works at all: the UI's
// "Clock out" button is a PATCH of the same record the worker just created
// (see apps/web/src/features/attendance/hooks/use-attendance.ts), and without
// the role here every clock-out returned 403 while the button stayed enabled.
// Route-level access is "who may ever PATCH"; "which record, and which
// fields" is enforced in service.update via assertCanUpdateAttendance —
// Site Personnel may only close out their own open record.
router.patch(
  "/:id",
  requireRole(
    "site-personnel",
    "project-manager",
    "human-resources",
    "admin",
    "it-designer",
  ),
  validate(updateAttendanceSchema),
  controller.update,
);
router.delete(
  "/:id",
  requireRole("human-resources", "admin", "it-designer"),
  controller.remove,
);

export default router;