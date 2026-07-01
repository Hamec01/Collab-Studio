# Collab-Studio

Collab-Studio is being migrated to a fully self-hosted architecture:

- React frontend
- Express backend
- PostgreSQL on the Docker host
- Prisma ORM
- local audio storage in a persistent uploads volume
- PostgreSQL-backed server sessions
- Argon2id password hashing
- HttpOnly SameSite=Lax session cookie
- Gemini API as the only external service

This branch is currently at **Stage 4: frontend migration to session auth and PostgreSQL API**. Backend metadata uses Prisma/PostgreSQL, and frontend now talks to same-origin session endpoints with `credentials: include`.

## Stage 3C Status

Added in this stage:

- Prisma schema and an initial migration file
- environment validation module
- Prisma client module
- session configuration module
- Dockerfile
- compose.yaml with app, postgres, and one-off migrate service
- safe `.env.example`
- working admin bootstrap script
- server-side auth routes backed by PostgreSQL sessions
- Argon2id password hashing
- PostgreSQL-backed projects, project members, tracks, and lyric versions
- PostgreSQL-backed comments, chat messages, tasks, annotations, and user-scoped notifications
- PostgreSQL-backed AudioVersion metadata, multipart uploads, signature validation, and protected Range streaming
- authenticated Gemini route with Zod validation, per-IP and per-user rate limits, a 10-second timeout, and local fallback
- project access middleware for admin/owner/editor/viewer
- Helmet, API rate limits, request ids, safe error responses, and Origin checks
- guarded PostgreSQL and private uploads backup/restore scripts

Not done in this stage:

- migrations are not applied automatically
- an existing `database.json` on disk is an untouched legacy artifact; runtime code no longer reads or creates it

## Environment

For production Docker, real app secrets are read from `/home/deploy/secrets/collab-studio.env` by the `app` service only. Do not copy that file into the repository, Docker image, build context, or backups. `.env.example` contains placeholders only.

Required production values:

```env
NODE_ENV=production
PORT=3000
APP_URL=http://localhost:3000
TRUST_PROXY=false
COOKIE_SECURE=false
ALLOW_PUBLIC_REGISTRATION=false
POSTGRES_DB=collab_studio
POSTGRES_USER=collab_studio
POSTGRES_PASSWORD=replace-with-a-long-random-postgres-password
DATABASE_URL=postgresql://collab_studio:replace-with-a-long-random-postgres-password@postgres:5432/collab_studio?schema=public
SESSION_SECRET=replace-with-a-real-random-secret-at-least-32-characters
UPLOADS_DIR=/app/uploads
UPLOADS_HOST_DIR=/home/deploy/app-data/collab-studio/uploads
GEMINI_API_KEY=
```

`ALLOW_PUBLIC_REGISTRATION` is false by default. The first administrator must be created with:

```bash
npm run create-admin
```

Do not create users with known production passwords.

`TRUST_PROXY` and `COOKIE_SECURE` must stay `false` for localhost-only HTTP testing, including `http://127.0.0.1:3000` and SSH tunnels. After HTTPS is terminated by a trusted reverse proxy such as Caddy, set `TRUST_PROXY=true`, `COOKIE_SECURE=true`, and `APP_URL=https://your-domain`.


## Authentication

Implemented auth endpoints:

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
```

Sessions are stored in PostgreSQL through `connect-pg-simple`. The session stores only `userId`. Passwords are hashed with Argon2id. Public registration is disabled unless `ALLOW_PUBLIC_REGISTRATION=true`.

The first administrator must be created manually after migrations are applied and PostgreSQL is available:

```bash
npm run create-admin
```

The script is interactive, hides password input, checks uniqueness, and never prints the password or password hash.

Project, collaboration, notification, and audio routes use PostgreSQL with session-backed ACL. Local files are available only through protected project stream routes.

Frontend auth and API behavior in Stage 4:

- `GET /api/auth/me` is the source of truth for current user state
- no localStorage/sessionStorage auth source is used
- no client-side bearer token storage is used
- frontend API requests use relative same-origin paths and include credentials
- local audio upload uses multipart `FormData` (`file` field), not Base64 JSON
- audio playback uses backend `streamUrl` (local) or validated `externalUrl` (external)
- `/uploads` is never used as a public static frontend URL
- Gemini is backend-only (`POST /api/gemini/rhymes`); no browser Gemini key or SDK

## Gemini Operational Limits

Gemini uses independent in-memory rate-limit stores for the IP and authenticated-user limits. This is suitable only while one app instance is running; multiple replicas require a shared limiter store in a later infrastructure stage.

The SDK request uses both a 10-second HTTP timeout and an AbortSignal. This cancels the client-side HTTP wait and prevents a background promise from being left unobserved. The Gemini SDK explicitly notes that client cancellation may not cancel work already accepted by the remote service, so billable remote processing can still continue after local cancellation.

## Docker Layout

`compose.yaml` defines:

- `postgres`: PostgreSQL with a named volume
- `migrate`: one-off Prisma migration service under the `migrate` profile
- `app`: application service bound to `127.0.0.1:3000`

PostgreSQL is not published to the host network. The `migrate` service does not read the app production secrets file; it receives only `DATABASE_URL` composed from the PostgreSQL compose variables, so it does not receive `GEMINI_API_KEY`.

Uploads are a bind mount configured by `UPLOADS_HOST_DIR`:

```env
UPLOADS_HOST_DIR=/home/deploy/app-data/collab-studio/uploads
```

Create and permission this host directory manually before running the app. The non-root `node` user in `node:22-bookworm-slim` must be able to create directories and files there (normally UID:GID `1000:1000`). Keep permissions private; do not use `chmod 777`. The repository setup does not create or modify that host path. PostgreSQL and the migrate service do not mount uploads.
`UPLOADS_DIR=/app/uploads` is private container storage. Never publish it through a web server or include it in the image; all local audio access must pass project ACL.

## Migrations

Migrations are intentionally not run as part of normal app startup.

After reviewing `.env` and the migration files, run migrations explicitly:

```bash
docker compose --profile migrate run --rm migrate
```

Do not run this until the database target is confirmed.


## Future Data Migration

A future one-off migration must import legacy `database.json` audio metadata and existing `uploads` files into PostgreSQL `AudioVersion` rows and the new `<projectId>/<trackId>/<uuid>.<ext>` layout. It must run only after the app is stopped and both sources are backed up. The migration must validate every source path and file signature, preserve the originals, avoid duplicate copies, and verify row/file counts before any manual cleanup. It is documented but not implemented or run in Stage 3C.

The foundation migration has never been applied and may still be reviewed now. After its first application it must not be edited; subsequent schema changes require a new migration.

## Local Development

After dependencies are installed:

```bash
npm run prisma:generate
npm run dev
```

The current Stage 4 branch uses session auth on the frontend and keeps audio metadata/streaming on the protected PostgreSQL-backed backend.

## Stage 5.5 Notes

- `/api/health` is the liveness endpoint
- `/api/ready` checks PostgreSQL readiness
- `npm run create-admin` works inside the production app image without a `src` bind mount
- project deletion removes only that project's upload subtree inside `UPLOADS_DIR`
- `npm run audit-orphan-audio` performs a dry-run by default and supports explicit `--delete`
- public deployment and Caddy are not part of this stage

## Health Checks

The existing app exposes:

```text
GET /api/health
```

A PostgreSQL readiness endpoint will be wired into the application routes in a later stage using the Prisma readiness helper.

## Backup

The backup command stops the app, writes a PostgreSQL dump and a private uploads archive, and leaves the app stopped for artifact verification. It aborts if the uploads source is unavailable:

```bash
npm run backup
```

Backups never include the production env file. Store and test both artifacts together before relying on them.

Restore requires reviewed dump/archive paths, validates archive traversal and links, stops the app, and requires typing `RESTORE`:

```bash
npm run restore -- backups/postgres-TIMESTAMP.sql.gz backups/uploads-TIMESTAMP.tar.gz
```

Restore keeps the previous uploads directory as a timestamped pre-restore copy. Verify ownership and data before restarting the app.

## Security Notes

Before exposing the application to the internet, later stages must complete:

- frontend migration to server sessions and multipart audio uploads
- PostgreSQL readiness checks
- reverse proxy, domain, and HTTPS configuration
- operational backup/restore testing
