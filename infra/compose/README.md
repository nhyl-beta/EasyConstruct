# Local infrastructure

Start PostgreSQL 16 and the S3-compatible MinIO service from the repository root:

```sh
docker compose -f infra/compose/docker-compose.yml up -d
```

PostgreSQL listens on `localhost:5432` with database/user `easyconstruct` and the local-only password `easyconstruct-local`. MinIO's S3 endpoint is `http://localhost:9000`; its console is at `http://localhost:9001` with the same local-only credentials. The database and object data persist in named Docker volumes.

Set `apps/api/.env` to use PostgreSQL:

```env
DATABASE_URL=postgresql://easyconstruct:easyconstruct-local@localhost:5432/easyconstruct
PORT=8000
JWT_SECRET=replace-for-local-development
```

The API's current storage adapter uses Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set and local disk otherwise. MinIO is provided for local infrastructure testing; wiring an S3 adapter is intentionally a separate change.

Stop the services with `docker compose -f infra/compose/docker-compose.yml down`. Add `-v` only when intentionally deleting both named data volumes.
