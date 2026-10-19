import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import importPlugin from "eslint-plugin-import";
import { fileURLToPath } from "node:url";

const modules = [
  "iam",
  "documents",
  "projects",
  "design",
  "workflow",
  "workforce",
  "finance",
  "insights",
  "platform",
];

const zones = modules.flatMap((target) =>
  modules
    .filter((source) => source !== target)
    .map((source) => ({
      target: `./src/modules/${target}`,
      from: `./src/modules/${source}`,
      except: ["./index.ts"],
      message: "Import peer-module code through that module's index.ts.",
    })),
);
zones.push({
  target: "./src/core",
  from: "./src/modules",
  message: "Core code must not depend on API modules.",
});

export default [
  {
    ignores: ["dist/**", "node_modules/**", "scripts/ops/system-check/**"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
          alwaysTryTypes: true,
        },
        node: {
          extensions: [".js", ".ts", ".tsx"],
        },
      },
    },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          basePath: fileURLToPath(new URL(".", import.meta.url)),
          zones,
        },
      ],
    },
  },
];
