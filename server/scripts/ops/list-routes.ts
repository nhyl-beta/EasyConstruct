import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as ts from "typescript";
import app from "../../src/app.js";

type ImportBinding = {
  specifier: string;
  exportName: string;
};

type RouteLayer = {
  route?: {
    path?: string | string[];
    methods?: Record<string, boolean>;
  };
  handle?: { stack?: RouteLayer[] };
};

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src",
);
const routes = new Set<string>();
const routerObjects = new Map<string, Promise<Record<string, unknown>>>();

function parseSource(source: string, filename: string): ts.SourceFile {
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
}

function getImports(sourceFile: ts.SourceFile): Map<string, ImportBinding> {
  const imports = new Map<string, ImportBinding>();

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const clause = statement.importClause;
    if (!clause) continue;
    const specifier = statement.moduleSpecifier.text;

    if (clause.name) {
      imports.set(clause.name.text, { specifier, exportName: "default" });
    }

    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        imports.set(element.name.text, {
          specifier,
          exportName: element.propertyName?.text ?? element.name.text,
        });
      }
    }
  }

  return imports;
}

async function loadImport(
  sourceFilePath: string,
  binding: ImportBinding,
): Promise<Record<string, unknown>> {
  if (!binding.specifier.startsWith(".")) return {};

  const cacheKey = `${sourceFilePath}:${binding.specifier}`;
  let loaded = routerObjects.get(cacheKey);
  if (!loaded) {
    const importedPath = path.resolve(
      path.dirname(sourceFilePath),
      binding.specifier.replace(/\.js$/, ".ts"),
    );
    loaded = import(pathToFileURL(importedPath).href) as Promise<Record<string, unknown>>;
    routerObjects.set(cacheKey, loaded);
  }
  return loaded;
}

function getIdentifiers(node: ts.Node): string[] {
  const names = new Set<string>();
  const visit = (current: ts.Node) => {
    if (ts.isIdentifier(current)) names.add(current.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return [...names];
}

function getStringArgument(node: ts.Expression | undefined): string | undefined {
  if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
    return node.text;
  }
  return undefined;
}

function getCallExpressions(sourceFile: ts.SourceFile): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return calls;
}

function joinPath(prefix: string, routePath: string): string {
  const combined = `${prefix}/${routePath}`.replace(/\/+/g, "/").replace(/\/+$/, "");
  return combined.startsWith("/") ? combined || "/" : `/${combined}`;
}

async function findMountedRouters(
  sourceFilePath: string,
  sourceFile: ts.SourceFile,
): Promise<Array<{ prefix: string; sourceFilePath: string; router: RouteLayer }>> {
  const imports = getImports(sourceFile);
  const mounts: Array<{ prefix: string; sourceFilePath: string; router: RouteLayer }> = [];

  for (const node of getCallExpressions(sourceFile)) {
    if (
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "use"
    ) {
      const receiver = node.expression.expression.getText(sourceFile);
      if (receiver === "app" || receiver === "router") {
        const prefix = getStringArgument(node.arguments[0]) ?? "";
        const candidates = node.arguments.slice(prefix ? 1 : 0);

        for (const name of candidates.flatMap(getIdentifiers)) {
          const binding = imports.get(name);
          if (!binding) continue;
          const imported = await loadImport(sourceFilePath, binding);
          const router = imported[binding.exportName] as RouteLayer | undefined;
          if (!router || !Array.isArray(router.stack)) continue;

          mounts.push({
            prefix,
            sourceFilePath: path.resolve(
              path.dirname(sourceFilePath),
              binding.specifier.replace(/\.js$/, ".ts"),
            ),
            router,
          });
          break;
        }
      }
    }
  }
  return mounts;
}

function addRoute(prefix: string, routePath: string, methods: Record<string, boolean> = {}) {
  const activeMethods = Object.entries(methods)
    .filter(([, active]) => active)
    .map(([method]) => (method === "_all" ? "ALL" : method.toUpperCase()));
  for (const method of activeMethods) {
    routes.add(`${method} ${joinPath(prefix, routePath)}`);
  }
}

async function collectRoutes(
  prefix: string,
  router: RouteLayer,
  sourceFilePath: string,
): Promise<void> {
  const source = await readFile(sourceFilePath, "utf8");
  const sourceFile = parseSource(source, sourceFilePath);
  const nestedRouters = await findMountedRouters(sourceFilePath, sourceFile);

  for (const layer of router.stack ?? []) {
    if (layer.route) {
      const routePaths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path ?? "/"];
      for (const routePath of routePaths) {
        addRoute(prefix, routePath, layer.route.methods);
      }
      continue;
    }

    if (!layer.handle?.stack) continue;
    const nested = nestedRouters.find((candidate) => candidate.router === layer.handle);
    if (nested) {
      await collectRoutes(
        joinPath(prefix, nested.prefix),
        nested.router,
        nested.sourceFilePath,
      );
    }
  }
}

const appSourcePath = path.join(sourceRoot, "app.ts");
const appSource = await readFile(appSourcePath, "utf8");
const appSourceFile = parseSource(appSource, appSourcePath);
const appMounts = await findMountedRouters(appSourcePath, appSourceFile);

for (const mount of appMounts) {
  await collectRoutes(mount.prefix, mount.router, mount.sourceFilePath);
}

void app;
process.stdout.write(`${[...routes].sort().join("\n")}\n`);
