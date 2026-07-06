# Stage 5A Slice 7 — Post-Owner-Smoke Verification Queries

**Purpose**: Read-only verification after owner completes browser-based smoke test  
**DO NOT RUN**: Until owner reports completion

---

## 1. DB counts verification

```bash
cd /home/deploy/projects/collab-studio && docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml exec -T postgres psql -U collab_studio -d collab_studio -c "
SELECT 
  (SELECT COUNT(*)::int FROM \"User\") AS users,
  (SELECT COUNT(*)::int FROM \"Project\") AS projects,
  (SELECT COUNT(*)::int FROM \"Track\") AS tracks,
  (SELECT COUNT(*)::int FROM \"AudioVersion\") AS audio_versions,
  (SELECT COUNT(*)::int FROM \"TrackAsset\") AS track_assets;
"
```

**Expected**:
- User=2 (unchanged)
- Project=1 (back to baseline)
- Track=1 (back to baseline)
- AudioVersion=0 (back to baseline)
- TrackAsset=0 (back to baseline)

---

## 2. Check for test project remnants

```bash
cd /home/deploy/projects/collab-studio && docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml exec -T postgres psql -U collab_studio -d collab_studio -c "
SELECT id, title, \"createdAt\"
FROM \"Project\"
WHERE title ILIKE '%stage5a%' OR title ILIKE '%smoke%'
ORDER BY \"createdAt\" DESC
LIMIT 5;
"
```

**Expected**: 0 rows (test project deleted via UI)

---

## 3. Check for test track remnants

```bash
cd /home/deploy/projects/collab-studio && docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml exec -T postgres psql -U collab_studio -d collab_studio -c "
SELECT t.id, t.title, p.title AS project_title, t.\"createdAt\"
FROM \"Track\" t
JOIN \"Project\" p ON t.\"projectId\" = p.id
WHERE t.title ILIKE '%smoke%'
ORDER BY t.\"createdAt\" DESC
LIMIT 5;
"
```

**Expected**: 0 rows (test track deleted with project)

---

## 4. Upload filesystem check

```bash
find /home/deploy/app-data/collab-studio/uploads -type f 2>/dev/null | wc -l && echo "Total upload files"
```

**Expected**: 0 (back to baseline)

---

## 5. Orphan files check

```bash
find /home/deploy/app-data/collab-studio/uploads -type f -o -type l 2>/dev/null | head -20
```

**Expected**: No output (no files or symlinks)

---

## 6. Check for broken foreign key references

```bash
cd /home/deploy/projects/collab-studio && docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml exec -T postgres psql -U collab_studio -d collab_studio << 'EOSQL'
-- Broken AudioVersion -> Track
SELECT COUNT(*) AS broken_av_track
FROM "AudioVersion" av
LEFT JOIN "Track" t ON av."trackId" = t.id
WHERE t.id IS NULL;

-- Broken TrackAsset -> Track
SELECT COUNT(*) AS broken_ta_track
FROM "TrackAsset" ta
LEFT JOIN "Track" t ON ta."trackId" = t.id
WHERE t.id IS NULL;

-- Broken TrackAsset -> Project
SELECT COUNT(*) AS broken_ta_project
FROM "TrackAsset" ta
LEFT JOIN "Project" p ON ta."projectId" = p.id
WHERE p.id IS NULL;

-- Broken legacyAudioVersionId references
SELECT COUNT(*) AS broken_ta_legacy_av
FROM "TrackAsset" ta
WHERE ta."legacyAudioVersionId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AudioVersion" av WHERE av.id = ta."legacyAudioVersionId"
  );
EOSQL
```

**Expected**: All counters = 0

---

## 7. Health endpoints check

```bash
curl -s -o /dev/null -w "root: %{http_code}\n" https://collabstudio.run/ && \
curl -s -o /dev/null -w "health: %{http_code}\n" https://collabstudio.run/api/health && \
curl -s -o /dev/null -w "ready: %{http_code}\n" https://collabstudio.run/api/ready
```

**Expected**: All 200

---

## 8. Docker health check

```bash
cd /home/deploy/projects/collab-studio && docker compose ps --format 'table {{.Name}}\t{{.Status}}'
```

**Expected**:
- collab-studio-app-1: Up X hours (healthy)
- collab-studio-postgres-1: Up X days (healthy)

---

## 9. Logs check for new errors

```bash
docker logs collab-studio-app-1 --tail 500 2>&1 | grep -E 'ERROR|FATAL|WARN' | grep -v 'ERR_ERL_KEY_GEN_IPV6' | tail -20
```

**Expected**: No output (no new errors beyond known ERR_ERL_KEY_GEN_IPV6)

---

## 10. Migration status check

```bash
cd /home/deploy/projects/collab-studio && docker compose --env-file /home/deploy/secrets/collab-studio.env -f compose.yaml exec -T postgres psql -U collab_studio -d collab_studio -c "
SELECT 
  migration_name,
  finished_at IS NOT NULL AS applied
FROM _prisma_migrations
ORDER BY finished_at DESC NULLS LAST;
"
```

**Expected**: All 7 migrations applied, no changes

---

## Verification summary template

After running all queries, fill in:

```
POST-OWNER-SMOKE VERIFICATION RESULTS
======================================

Date: 2026-07-06
Owner completion time: [TIME]

1. DB counts: User=__ Project=__ Track=__ AudioVersion=__ TrackAsset=__ [PASS/FAIL]
2. Test project remnants: __ rows [PASS/FAIL]
3. Test track remnants: __ rows [PASS/FAIL]
4. Upload files: __ files [PASS/FAIL]
5. Orphan files: [list if any] [PASS/FAIL]
6. Broken references: av->track=__ ta->track=__ ta->project=__ ta->av=__ [PASS/FAIL]
7. Health endpoints: root=___ health=___ ready=___ [PASS/FAIL]
8. Docker status: app=_______ postgres=_______ [PASS/FAIL]
9. Logs: [any new errors?] [PASS/FAIL]
10. Migrations: __ applied [PASS/FAIL]

OVERALL VERIFICATION: [PASS/FAIL]

Notes:
- [Any issues or observations]
```

---

## If verification PASSES

Update documentation:

1. **docs/IMPLEMENTATION_STATUS.md**:
   - Change "owner smoke pending" to "official owner smoke PASS"
   - Add verification timestamp
   - Mark slice 7 as COMPLETE

2. **docs/STAGE5A_FRONTEND_CUTOVER.md**:
   - Update smoke status from "PENDING" to "PASS"
   - Add owner confirmation and verification results
   - Document baseline restoration

3. **Commit message**:
   ```
   docs: complete stage 5a slice 7 official owner smoke
   
   - Browser-based owner smoke: PASS
   - Temporary project created and deleted via UI
   - Asset-first URLs verified
   - Dedupe verified
   - External links verified
   - Mobile verified
   - Post-smoke verification: baseline restored
   - No DB-created sessions or manual cleanup used
   ```

4. **Push**: `git push origin main`

---

## If verification FAILS

1. Document exact failure (which query, what values, what's wrong)
2. Investigate orphan data or broken references
3. Provide manual cleanup plan if needed
4. Do NOT mark slice 7 complete until verification passes
