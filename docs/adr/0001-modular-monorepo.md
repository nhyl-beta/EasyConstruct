# ADR 0001: Modular monorepo

- Status: Accepted
- Date: 2026-10-20

## Context

EasyConstruct's API and web client had grown as sibling application trees with cross-cutting API plumbing and feature folders mixed at the API source root. This made ownership and permitted dependencies hard to review. The restructuring must preserve routes, HTTP behavior, database schema, and migrations.

## Decision

Use npm workspaces for `apps/*` and `packages/*`. Keep the API's HTTP entry points and framework-independent plumbing in `apps/api/src/core`. Group feature code in explicit API modules, each with a manifest, an external `index.ts` barrel, and a list of owned tables. Keep the web application in its existing feature structure for this refactor.

## Consequences

- The API module registry is the single source for route mounts and feature flags.
- Modules may depend on core/shared packages and on other modules only through their public barrel.
- Core may not depend on API modules; dependency-specific operations are injected at the application edge.
- Database schema and migration files stay unchanged in content and location except for the schema source path configured for Drizzle.
- Local Docker Compose provides PostgreSQL and MinIO. MinIO is infrastructure only; no S3 storage adapter is part of this decision.
