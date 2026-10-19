// Builds the full route inventory by observing how the real Express app is assembled.
// Patches Router.use / Router.route BEFORE the app is imported, so every mount prefix
// and every method+path (with its handler names, e.g. requireRole) is recorded.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const routerPkg = require("router");
const Router = routerPkg.default ?? routerPkg;
const proto = Router.prototype ?? routerPkg.Router?.prototype ?? routerPkg.prototype;

type Node = { id: number; mounts: { path: string; child: any }[]; routes: { path: string; methods: string[]; handlers: string[] }[] };
const nodes = new Map<any, Node>();
let nextId = 1;
const nodeOf = (r: any): Node => {
  let n = nodes.get(r);
  if (!n) { n = { id: nextId++, mounts: [], routes: [] }; nodes.set(r, n); }
  return n;
};

const origUse = proto.use;
proto.use = function (this: any, ...args: any[]) {
  const first = args[0];
  const path = typeof first === "string" ? first : "/";
  const rest = typeof first === "string" ? args.slice(1) : args;
  for (const h of rest.flat()) if (h && typeof h === "function" && h.use && h.route) nodeOf(this).mounts.push({ path, child: h });
  return origUse.apply(this, args);
};
const origRoute = proto.route;
proto.route = function (this: any, path: string) {
  const route = origRoute.call(this, path);
  const rec = { path: String(path), methods: [] as string[], handlers: [] as string[] };
  nodeOf(this).routes.push(rec);
  for (const m of ["get", "post", "put", "patch", "delete"]) {
    const orig = route[m];
    route[m] = function (...hs: any[]) {
      rec.methods.push(m.toUpperCase());
      for (const h of hs.flat()) rec.handlers.push(`${m.toUpperCase()}:${h?.name || "anonymous"}`);
      return orig.apply(this, hs);
    };
  }
  return route;
};

const { default: app } = await import("../../../src/app.js");
const root = (app as any).router ?? (app as any)._router;
// app.use("/api/x", router) on the Express app delegates to its internal router
const rootNode = nodes.get(root);
const out: { method: string; path: string; handlers: string[] }[] = [];
function walk(node: Node | undefined, prefix: string) {
  if (!node) return;
  for (const r of node.routes) {
    const p = (prefix + (r.path === "/" ? "" : r.path)) || "/";
    for (const m of new Set(r.methods)) out.push({ method: m, path: p, handlers: r.handlers.filter((h) => h.startsWith(m + ":")).map((h) => h.slice(m.length + 1)) });
  }
  for (const m of node.mounts) walk(nodes.get(m.child), prefix + (m.path === "/" ? "" : m.path));
}
walk(rootNode, "");
out.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
const target = process.argv[2] ?? "inventory.json";
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`routes found: ${out.length}  (${rootNode ? "root ok" : "root node missing"})`);
process.exit(0);
