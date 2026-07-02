# Deploy and Rollback Checklist

Stage 0 operational checklist for additive releases.

## Deploy

1. Repository preflight:
   - `git status --short --branch`
   - `git log -1 --oneline`
2. Local quality gate:
   - `npm ci`
   - `npm run prisma:generate`
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run e2e`
3. Backup before deploy:
   - `ENV_FILE=/home/deploy/secrets/collab-studio.env npm run backup`
4. Build/restart app service:
   - `docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml up -d --build app`
5. Health verification:
   - `docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml ps`
   - `curl -sS -o /dev/null -w 'root=%{http_code}\n' https://collabstudio.run/`
   - `curl -sS -o /dev/null -w 'health=%{http_code}\n' https://collabstudio.run/api/health`
   - `curl -sS -o /dev/null -w 'ready=%{http_code}\n' https://collabstudio.run/api/ready`
6. Product smoke:
   - auth/session check
   - project/track open
   - lyrics edit/autosave
   - audio stream/playback

## Rollback

1. Identify previous working image:
   - `docker images | head`
2. Re-run app with previous image/tag (or previous known-good deployment method).
3. Re-check health endpoints and product smoke.
4. If data issue is confirmed and approved, execute controlled restore using runbook:
   - [docs/BACKUP_RESTORE_VERIFICATION.md](docs/BACKUP_RESTORE_VERIFICATION.md)
5. Record incident timeline, root cause, and follow-up tasks.

## Constraints

- Do not run destructive schema down migrations in rollback.
- Use additive migration policy.
- Keep production env only in `/home/deploy/secrets/collab-studio.env`.
