import { Router } from "express";
import { validate } from "../../../core/http/validate.js";
import { authenticate, requireRole } from "../../../core/auth/middleware.js";
import * as controller from "./controller.js";
import {
  attendanceSchema,
  createEmployeeSchema,
  updateAttendanceSchema,
  updateEmployeeSchema,
} from "./validators.js";

const router = Router();

router.use(authenticate);
// Admin may read these HR views; only HR (and IT Designer, unchanged) write.
router.use(requireRole("human-resources", "admin", "it-designer"));
const canWrite = requireRole("human-resources", "it-designer");

router.get("/employees", controller.listEmployees);
router.post("/employees", canWrite, validate(createEmployeeSchema), controller.createEmployee);
router.get("/employees/:id", controller.getEmployee);
router.patch("/employees/:id", canWrite, validate(updateEmployeeSchema), controller.updateEmployee);
router.delete("/employees/:id", canWrite, controller.deleteEmployee);

router.get("/attendance/summary", controller.attendanceSummary);
router.get("/attendance", controller.listAttendance);
router.post("/attendance", canWrite, validate(attendanceSchema), controller.createAttendance);
router.patch("/attendance/:id", canWrite, validate(updateAttendanceSchema), controller.updateAttendance);
router.delete("/attendance/:id", canWrite, controller.deleteAttendance);

router.get("/payroll/tracksheet", controller.tracksheet);
router.get("/payroll/gross-labor", controller.grossLabor);
router.get("/payroll/gross-tracking", controller.grossTracking);
router.get("/payroll", controller.listPayroll);

router.get("/reports/workforce", controller.workforceReport);

export default router;