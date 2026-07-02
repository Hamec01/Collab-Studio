# Backup/Restore Verification Procedure

This runbook defines the Stage 0 verification flow for guarded backup and restore scripts.

## Preconditions

- Operator has shell access to production host.
- Compose file is `compose.yaml`.
- Production env file is `/home/deploy/secrets/collab-studio.env`.
- Backup directory is `/home/deploy/backups/collab-studio`.

## 1. Backup verification

1. Check current services:
   - `docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml ps`
2. Run backup:
   - `ENV_FILE=/home/deploy/secrets/collab-studio.env npm run backup`
3. Confirm artifacts:
   - `ls -la /home/deploy/backups/collab-studio`
4. Verify manifest integrity:
   - `cd /home/deploy/backups/collab-studio && sha256sum -c manifest-<TIMESTAMP>.sha256`
5. Confirm app recovered to healthy state (if it was running before backup):
   - `curl -fsS https://collabstudio.run/api/health`
   - `curl -fsS https://collabstudio.run/api/ready`

## 2. Restore verification (controlled test only)

Use non-production data copy or explicitly approved maintenance window.

1. Select matching pair:
   - `postgres-<TIMESTAMP>.sql.gz`
   - `uploads-<TIMESTAMP>.tar.gz`
   - `manifest-<TIMESTAMP>.sha256`
2. Run restore with explicit confirmation:
   - `ENV_FILE=/home/deploy/secrets/collab-studio.env npm run restore -- postgres-<TIMESTAMP>.sql.gz uploads-<TIMESTAMP>.tar.gz`
3. Validate runtime after manual app start:
   - `docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml up -d app`
   - `curl -fsS https://collabstudio.run/api/health`
   - `curl -fsS https://collabstudio.run/api/ready`
4. Validate business smoke:
   - login works
   - projects/tracks are readable
   - audio/lyrics endpoints respond

## 3. Evidence to store

- Backup/restore command logs.
- Timestamp and artifact names.
- `sha256sum -c` output.
- Health/ready HTTP checks.
- Operator and maintenance window reference.

## 4. Safety constraints

- Never commit backup artifacts.
- Never copy production env into repository.
- Never run restore without explicit approval and window.
