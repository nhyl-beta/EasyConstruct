// apps/web/src/lib/nav-active.ts — NEW (Part C, round 3)
//
// C1/C2: header.tsx and sidebar.tsx each had their own copy of this exact
// match rule (byte-identical logic, two independent places to edit) —
// exactly the kind of duplication the task flagged as how they drift.
// Single source of truth now; both files import this instead of defining
// their own `isTabActive`/`isActive`.
export function isNavRouteActive(pathname: string | undefined, route: string): boolean {
  if (!pathname || !route) return false;
  return pathname === route || (route !== "/" && pathname.startsWith(route + "/"));
}
