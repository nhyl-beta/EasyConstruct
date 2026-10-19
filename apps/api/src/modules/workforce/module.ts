import type { ApiModule } from "../types.js";
import hrRoutes from "./hr/routes.js";
import employeeRoutes from "./employees/routes.js";
import attendanceRoutes from "./attendance/routes.js";
import payrollRoutes from "./payroll/routes.js";
import workforceReportRoutes from "./workforce-reports/routes.js";

export const module: ApiModule = {
  name: "workforce",
  flag: "MODULE_WORKFORCE",
  mounts: [
    { order: 11, prefix: "/api/hr", router: hrRoutes },
    { order: 12, prefix: "/api/employees", router: employeeRoutes },
    { order: 13, prefix: "/api/attendance", router: attendanceRoutes },
    { order: 14, prefix: "/api/payroll", router: payrollRoutes },
    { order: 15, prefix: "/api/workforce-reports", router: workforceReportRoutes },
  ],
  ownsTables: ["employees", "attendance", "payroll", "payroll_batch_decisions", "payroll_batch_acknowledgements", "payroll_batches"],
};
