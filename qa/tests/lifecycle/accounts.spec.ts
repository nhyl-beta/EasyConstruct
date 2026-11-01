// LC-001 account creation, LC-003 deactivate/reactivate, LC-004 Admin read-only. Reference: matrix rows User Accounts / Employees.
import { api, raw, steps, expect, test, ADMIN, HR, IT, ENG, SITE, uid, today } from "../../src/kit.js";
import { QA_PASSWORD } from "../../src/roles.js";
import { assertQaEnvironment } from "../../src/guard.js";

const login = async (email: string, password: string) => {
  const r = await fetch(`${assertQaEnvironment().apiUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { status: r.status, body: (await r.json().catch(() => null)) as any };
};
async function newEmployee(role = "Site Worker") {
  const n = uid();
  const r = await raw(HR, "POST", "/employees", { employeeId: `EMP-QA-${n}`, name: `QA Person ${n}`, role, department: "Field Operations", site: "Main Site", status: "Active", hiredOn: today(), email: `qa.person.${n.toLowerCase()}@easyconstruct.demo`, payRate: 150, rateType: "Hourly" });
  return { r, n, email: `qa.person.${n.toLowerCase()}@easyconstruct.demo` };
}

test("LC-001 Account creation is linked to an employee record", async () => {
  const S = steps("LC-001");
  let emp!: Awaited<ReturnType<typeof newEmployee>>;
  let userId = 0;
  await S.run(1, "HR creates a new employee record -> saved and listed", async () => {
    emp = await newEmployee();
    expect(emp.r.ok, `${emp.r.status} ${emp.r.body?.message}`).toBe(true);
    expect((await api<any[]>(HR, "GET", "/hr/employees")).some((e) => e.email === emp.email)).toBe(true);
  });
  await S.run(2, "IT Designer finds the employee among those without an account", async () => {
    const list = await api<any[]>(IT, "GET", "/users/linkable-employees");
    expect(list.some((e) => e.email === emp.email), "new employee not offered for account creation").toBe(true);
  });
  await S.run(3, "Selecting the employee supplies full name and email", async () => {
    const e = (await api<any[]>(IT, "GET", "/users/linkable-employees")).find((x) => x.email === emp.email);
    expect(e?.name).toBeTruthy(); expect(e?.email).toBeTruthy();
  });
  await S.run(4, "A 5-character password is blocked", async () => {
    const e = (await api<any[]>(IT, "GET", "/users/linkable-employees")).find((x) => x.email === emp.email);
    const r = await raw(IT, "POST", "/users", { employeeId: e.id, password: "12345", role: "engineer" });
    expect(r.status, `short password returned ${r.status}`).toBe(400);
    expect(String(r.body?.message)).toMatch(/10/);
  });
  await S.run(5, "A valid password and role creates the account", async () => {
    const e = (await api<any[]>(IT, "GET", "/users/linkable-employees")).find((x) => x.email === emp.email);
    const r = await raw(IT, "POST", "/users", { employeeId: e.id, password: QA_PASSWORD, role: "engineer" });
    expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    userId = r.data.id;
    expect((await api<any[]>(IT, "GET", "/users")).some((u) => u.id === userId && u.email === emp.email)).toBe(true);
  });
  await S.run(6, "The new user signs in and lands on the dashboard of the assigned role only", async () => {
    const r = await login(emp.email, QA_PASSWORD);
    expect(r.status, `login ${r.status}`).toBe(200);
    expect(r.body?.data?.user?.role).toBe("engineer");
    const adminOnly = await fetch(`${assertQaEnvironment().apiUrl}/users`, { headers: { Authorization: `Bearer ${r.body.data.token}` } });
    expect(adminOnly.status, "new Engineer could read User Accounts").toBe(403);
  });
  S.done();
});

test("LC-003 Deactivate and reactivate an account", async () => {
  const S = steps("LC-003");
  const emp = await newEmployee();
  const e = (await api<any[]>(IT, "GET", "/users/linkable-employees")).find((x) => x.email === emp.email);
  const created = await api<{ id: number }>(IT, "POST", "/users", { employeeId: e.id, password: QA_PASSWORD, role: "site-personnel" });
  await S.run(1, "IT Designer deactivates the account -> Deactivated", async () => {
    const r = await raw(IT, "PATCH", `/users/${created.id}/status`, { isActive: false });
    expect(r.ok, `${r.status} ${r.body?.message}`).toBe(true);
    const u = (await api<any[]>(IT, "GET", "/users")).find((x) => x.id === created.id);
    expect(u?.isActive).toBe(false);
  });
  await S.run(2, "Login is blocked with a clear message", async () => {
    const r = await login(emp.email, QA_PASSWORD);
    expect(r.status, `deactivated account got ${r.status}`).toBeGreaterThanOrEqual(400);
    expect(String(r.body?.message), "message does not say the account is deactivated").toMatch(/deactivat|disabled|inactive/i);
  });
  await S.run(3, "Dashboard Active / Deactivated counts equal the User Accounts table", async () => {
    const users = await api<any[]>(IT, "GET", "/users");
    const active = users.filter((u) => u.isActive).length, inactive = users.filter((u) => !u.isActive).length;
    const byRole = await api<any[]>(IT, "GET", "/roles/summary");
    const sActive = byRole.reduce((n, r) => n + (r.activeUsers ?? 0), 0);
    const sInactive = byRole.reduce((n, r) => n + (r.users ?? []).filter((u: any) => !u.isActive).length, 0);
    expect({ active: sActive, deactivated: sInactive }, `summary vs table (${active} active, ${inactive} deactivated)`).toEqual({ active, deactivated: inactive });
  });
  await S.run(4, "Account changes / Activity Logs hold an entry with actor and time", async () => {
    const logs = (await api<any>(IT, "GET", "/audit-logs?limit=100")).data as any[];
    const hit = logs.find((l) => l.entityType === "user" && String(l.entityId) === String(created.id));
    expect(hit, "no audit entry for the deactivation in the latest 100 entries").toBeTruthy();
    expect(hit.actor, "entry has no actor").toBeTruthy(); expect(hit.createdAt, "entry has no time").toBeTruthy();
  });
  await S.run(5, "Reactivating restores login", async () => {
    await api(IT, "PATCH", `/users/${created.id}/status`, { isActive: true });
    expect((await login(emp.email, QA_PASSWORD)).status).toBe(200);
  });
  S.done();
});

test("LC-004 Admin is read-only on accounts and employees", async () => {
  const S = steps("LC-004");
  await S.run(1, "Admin sees accounts and employees", async () => {
    expect((await raw(ADMIN, "GET", "/users")).ok, "Admin cannot read User Accounts").toBe(true);
    expect((await raw(ADMIN, "GET", "/hr/employees")).ok, "Admin cannot read Employees").toBe(true);
  });
  await S.run(2, "Admin create, edit and deactivate APIs all return 403", async () => {
    const some = (await api<any[]>(ADMIN, "GET", "/users"))[0];
    const calls: [string, string, unknown][] = [["POST", "/users", { employeeId: 1, password: QA_PASSWORD, role: "engineer" }], ["PATCH", `/users/${some.id}`, { name: "QA rename" }], ["PATCH", `/users/${some.id}/status`, { isActive: false }], ["POST", "/employees", { employeeId: "EMP-QA-X", name: "x" }]];
    const bad: string[] = [];
    for (const [m, path, body] of calls) { const r = await raw(ADMIN, m, path, body); if (r.status !== 403) bad.push(`${m} ${path} -> ${r.status}`); }
    expect(bad, `Admin write calls not blocked: ${bad.join("; ")}`).toEqual([]);
  });
  S.done();
});

test("LC-002 Owner approves or declines account creation by emailed link @pending-feature", async () => {
  // The feature (an account created by IT stays pending until the Owner approves it from an emailed link) is detected, not assumed:
  // if a new account can sign in straight away, the feature is not on this branch and the case is reported Not Executed.
  const emp = await newEmployee();
  const e = (await api<any[]>(IT, "GET", "/users/linkable-employees")).find((x) => x.email === emp.email);
  const r = await raw(IT, "POST", "/users", { employeeId: e.id, password: QA_PASSWORD, role: "engineer" });
  const first = await login(emp.email, QA_PASSWORD);
  test.skip(r.ok && first.status === 200, "new accounts are active immediately: Owner approval for account creation is not on this branch");
  expect(String(r.data?.status ?? r.body?.message)).toMatch(/pending/i);
});

test("LC-002 step 5 Deactivating the Owner account needs Owner approval first", async () => {
  const S = steps("LC-002");
  const owner = (await api<any[]>(IT, "GET", "/users")).find((u) => u.email === "qa-owner@easyconstruct.demo");
  const r = await raw(IT, "PATCH", `/users/${owner.id}/status`, { isActive: false });
  // With a single Owner account the last-owner guard answers first, which says nothing about the approval flow.
  test.skip(/last owner/i.test(JSON.stringify(r.body)), "the seed has only one Owner account, so the last-owner guard fires before any approval step (needs a second Owner to test)");
  await S.run(5, "IT Designer tries to deactivate the Owner account -> Owner approval required first", async () => {
    expect(JSON.stringify(r.body), `status ${r.status}: ${JSON.stringify(r.body).slice(0, 140)}`).toMatch(/approv/i);
    const still = (await api<any[]>(IT, "GET", "/users")).find((u) => u.id === owner.id);
    expect(still.isActive, "the Owner account was deactivated without approval").toBe(true);
  });
  S.done();
});
