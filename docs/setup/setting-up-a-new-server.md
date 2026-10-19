# Setting up a new server

For a new, EMPTY PostgreSQL database (for example the client's own server). Not for Neon or any database that already holds data.

## 1. Build the database once

```bash
cd apps/api
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME"   # the new, empty database
npm ci                                                               # drizzle-kit (a dev dependency) is needed
npm run db:bootstrap -- --dry-run                                    # shows the target host and what it would do
npm run db:bootstrap -- --yes
npm run db:migrate -- --dry-run                                      # must say: Nothing to apply
npm run db:verify-schema                                             # must say: OK
```

`db:bootstrap` builds the schema from the Drizzle schema, adds the sequences and indexes only the migrations define, inserts the reference data (expense categories, document types, the "Design Turnover" workflow template) and records every migration as applied.

It refuses to run when `public.projects` exists or `drizzle.__drizzle_migrations` has rows, so running it twice, or against a database in use, does nothing.

**Never point `db:bootstrap` at an existing database such as Neon.** Check the `Target database` line it prints before adding `--yes`.

## 2. Every later change

Use `npm run db:migrate` (deploy order: migrate first, then deploy). Do not use `drizzle-kit push` on this database: it would drop the sequences and indexes that only the migrations define.

## 3. Then, on the new server

- Set the environment variables in `apps/api/.env.example` (database, `JWT_SECRET`, mail, Blob token, `CRON_SECRET`, `APP_URL`, and `MAIL_SKIP_DOMAINS` if needed).
- A first Admin account is needed to sign in. How to create one on a non-demo server is not covered here yet (the demo seed creates demo accounts only); decide this with the owner before go-live.
- Optional: `npm run ai:seed-references` fills the price catalog from the EstimationPro.ai API; demo data is `npm run db:seed` and `npm run demo:seed` and is for demo databases only.
