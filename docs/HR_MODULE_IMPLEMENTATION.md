# Human Resources module

The HR module is implemented as a persisted Express/Drizzle feature mounted
under `/api/hr`. It uses the existing PostgreSQL connection, response envelope,
validation middleware, React routing, and role resource configuration. The
existing authentication flow and role names are unchanged; the seeded
`hr@easyconstruct.test` account already existed and was not duplicated.

## Database

Migration `server/drizzle/0005_hr_module.sql` adds employee contact and
compensation fields (`email`, `phone`, `pay_rate`, `rate_type`) and payroll
period boundaries. Run the normal migration command before using the module:

```text
npm --prefix server run db:migrate
```

Employees remain keyed by the existing unique `employee_id`. Attendance rows
reference that business identifier so existing data remains compatible.

## API

All successful responses use `{ success, message, data }`; validation and
domain errors use the existing error middleware.

### Employees

- `GET /api/hr/employees?search=&department=&status=`
- `POST /api/hr/employees`
- `GET /api/hr/employees/:id`
- `PATCH /api/hr/employees/:id`
- `DELETE /api/hr/employees/:id`

Create/update payloads include `employeeId`, `name`, `role`, `department`,
`site`, `hiredOn`, optional `email`, `phone`, `status`, `payRate`, and
`rateType` (`Hourly`, `Daily`, or `Monthly`). Employee IDs are checked for
duplicates and names generate initials automatically.

### Attendance

- `GET /api/hr/attendance?date=&from=&to=&employeeId=&site=&status=`
- `POST /api/hr/attendance`
- `PATCH /api/hr/attendance/:id`
- `DELETE /api/hr/attendance/:id`
- `GET /api/hr/attendance/summary?date=`

Attendance accepts clock-in/out times, date, site, geofence, photo result, and
status. Hours are calculated from clock times when omitted. Outside geofences
and failed photo checks are automatically flagged.

### Payroll

- `GET /api/hr/payroll?period=`
- `POST /api/hr/payroll/generate` with `periodStart`, `periodEnd`, and optional
  `deductionRate`
- `GET /api/hr/payroll/tracksheet?periodStart=&periodEnd=`
- `GET /api/hr/payroll/gross-labor?period=`
- `GET /api/hr/payroll/gross-tracking?periodStart=&periodEnd=`

Generation reads persisted attendance and active employee compensation, creates
one persisted row per active employee, and replaces a previously generated
batch for the same period (safe to regenerate). Regular hours are capped at
eight hours per attendance record; overtime is paid at 1.25x the derived
hourly rate. The default deduction rate is 10%.

### Workforce reporting

- `GET /api/hr/reports/workforce?from=&to=`

The report returns headcount/status totals, department allocation, site
allocation, and daily present/late/absent totals.

## Frontend

The following routes use the HR API and hooks in
`client/src/features/hr/`:

- `/employees` — server-filtered employee directory, archive/delete, and
  persisted records
- `/employees/create` and `/employees/edit/:id` — employee CRUD form
- `/attendance` — date-filtered monitoring and live summary
- `/payroll` — period selection and payroll generation
- `/workforce-reports` — date-range workforce report

The HR dashboard also requests live workforce totals while retaining its
existing presentation sections.

## Validation and operational notes

Run `npm run build:server` and `npm run build:client` after changes. There is no
first-party automated test suite in this repository. The server still does not
apply JWT middleware to feature routes; this preserves the repository's
existing authentication behavior and should be addressed as a separate,
cross-module security task.
