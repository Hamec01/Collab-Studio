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

This branch is currently at **Stage 3A: PostgreSQL-backed project core**. Project, membership, track, and lyric version routes use Prisma/PostgreSQL; audio, comments, chat, tasks, annotations, and notifications are still legacy JSON-backed until later stages.

## Stage 3A Status

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
- project access middleware for admin/owner/editor/viewer
- Helmet, API rate limits, request ids, safe error responses, and Origin checks
- backup/restore script skeletons

Not done in this stage:

- audio metadata, comments, chat, tasks, annotations, and notifications still use the legacy JSON data path
- frontend auth/upload flows are not changed yet
- migrations are not applied automatically
- existing `database.json` is not deleted and is reserved for later one-off migration work

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

Project core routes now use PostgreSQL. Audio, comments, chat, tasks, annotations, and notifications still use legacy JSON handlers and are not complete for internet exposure until later stages.

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

Create and permission this host directory manually before running the app. The repository setup does not create or modify that system path.

## Migrations

Migrations are intentionally not run as part of normal app startup.

After reviewing `.env` and the migration files, run migrations explicitly:

```bash
docker compose --profile migrate run --rm migrate
```

Do not run this until the database target is confirmed.


## Future Data Migration

A future one-off migration should move existing `database.json` content into PostgreSQL after the remaining legacy subsystems are modeled. The planned direction is:

1. Stop the app and make a verified backup of `database.json` and uploads.
2. Parse `database.json` with a dedicated migration script.
3. Map legacy users by username/email to PostgreSQL users.
4. Insert projects, memberships, tracks, lyric versions, audio metadata, comments, chat, tasks, annotations, and notifications in transactions.
5. Verify row counts and sample project access before switching traffic.
6. Keep the original `database.json` read-only until restore has been tested.

This migration is not implemented or run in Stage 3A.

## Local Development

After dependencies are installed:

```bash
npm run prisma:generate
npm run dev
```

The current Stage 3A branch has auth plus project, member, track, and lyric version routes wired to Prisma/session. Audio, comments, chat, tasks, annotations, and notifications will move later.

## Health Checks

The existing app exposes:

```text
GET /api/health
```

A PostgreSQL readiness endpoint will be wired into the application routes in a later stage using the Prisma readiness helper.

## Backup

The backup skeleton is available as:

```bash
npm run backup
```

It is designed to dump PostgreSQL through Docker Compose and archive the configured uploads directory. Review the generated files and storage location before relying on it for production.

Restore is intentionally manual at this stage:

```bash
npm run restore
```

The restore script exits with instructions until a reviewed restore workflow is implemented.

## Security Notes

Before exposing the application to the internet, later stages must complete:

- JSON storage removal for remaining legacy subsystems
- protected multipart audio upload and streaming
- Origin checks for mutating requests
- Gemini rate limit and timeout
- request logging redaction
- PostgreSQL readiness checks
