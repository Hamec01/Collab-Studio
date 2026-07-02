# Restore Drill Evidence (2026-07-02)

## Scope

- Stage 0 isolated restore drill.
- No restore to production database.
- No production app wiring.
- No production secrets used.

## Backup set used

- Manifest: `manifest-20260701T235459Z.sha256`
- PostgreSQL dump: `postgres-20260701T235459Z.sql.gz`
- Uploads archive: `uploads-20260701T235459Z.tar.gz`

## Checksum and archive validation

- `sha256sum -c manifest-20260701T235459Z.sha256`:
  - `postgres-20260701T235459Z.sql.gz: OK`
  - `uploads-20260701T235459Z.tar.gz: OK`
- `gzip -t postgres-20260701T235459Z.sql.gz`: OK
- Upload archive listing count: 5 entries

## Isolated environment

- Disposable container: `postgres:16-alpine`
- Host bind: `127.0.0.1:55432 -> 5432`
- Temporary DB name: `collabstudio_restore`
- Temporary role required by dump owner metadata: `collab_studio` (created only inside disposable container)
- Temporary uploads extraction directory: `/tmp/collabstudio-restore-drill-20260702/uploads`

## Safe command shape

1. Start disposable PostgreSQL container bound to localhost.
2. Wait for readiness with `pg_isready`.
3. Create temporary role expected by dump metadata (`collab_studio`) inside disposable DB container.
4. Restore SQL with:
   - `gunzip -c postgres-20260701T235459Z.sql.gz | psql ...`
5. Run integrity checks (counts and schema presence only).
6. Extract uploads archive into temporary directory only.
7. Remove disposable container and temporary files.

## Integrity checks (no private content output)

- Resolved core relation names:
  - `users_table=public."User"`
  - `projects_table=public."Project"`
  - `tracks_table=public."Track"`
- Row counts:
  - `users_count=1`
  - `projects_count=1`
  - `tracks_count=1`
- Prisma migrations table readable:
  - `prisma_migrations_count=1`
- Core tables check:
  - `tables_ok=true`

## Uploads validation

- Extracted files count in isolated temp directory: `uploads_extracted_files=1`
- No production app mount or production volume bind was used.

## Cleanup

- Disposable PostgreSQL container removed.
- Temporary restore and uploads directories removed.
- Source backups were not modified or deleted.

## Result

- PASS

## Known limitations

- Drill verified restore integrity and archive usability in isolated environment only.
- This drill does not validate end-to-end application business flows against restored data.
