import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import * as controller from "./controller.js";
import {
  attendanceSchema,
  createEmployeeSchema,
  updateAttendanceSchema,
  updateEmployeeSchema,
} from "./validators.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("human-resources", "admin", "it-designer"));

router.get("/employees", controller.listEmployees);
router.post("/employees", validate(createEmployeeSchema), controller.createEmployee);
router.get("/employees/:id", controller.getEmployee);
router.patch("/employees/:id", validate(updateEmployeeSchema), controller.updateEmployee);
router.delete("/employees/:id", controller.deleteEmployee);

router.get("/attendance/summary", controller.attendanceSummary);
router.get("/attendance", controller.listAttendance);
router.post("/attendance", validate(attendanceSchema), controller.createAttendance);
router.patch("/attendance/:id", validate(updateAttendanceSchema), controller.updateAttendance);
router.delete("/attendance/:id", controller.deleteAttendance);

router.get("/payroll/tracksheet", controller.tracksheet);
router.get("/payroll/gross-labor", controller.grossLabor);
router.get("/payroll/gross-tracking", controller.grossTracking);
router.get("/payroll", controller.listPayroll);

router.get("/reports/workforce", controller.workforceReport);

export default router;