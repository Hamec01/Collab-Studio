# Stage 5A Slice 7 — Official Owner Smoke Test Checklist

**Date**: 2026-07-06  
**Production URL**: https://collabstudio.run  
**Deployed commit**: 85be76c  
**Deployed image**: sha256:5f9fc4e65d3b18df3aa9ba2680e4ece7320a3e1282debd2d26dab0e22dfa2974

## Pre-smoke baseline (read-only verified)

- ✅ Git: HEAD=ff9208c, synced with origin/main
- ✅ Docker: app healthy (2+ hours), postgres healthy (5+ days)
- ✅ Health endpoints: 200/200/200
- ✅ DB counts: User=2, Project=1, Track=1, AudioVersion=0, TrackAsset=0
- ✅ Upload files: 0
- ✅ Migrations: 7 applied, all finished
- ✅ Logs: only known ERR_ERL_KEY_GEN_IPV6, no new errors

## Test objectives

Verify that frontend audio player successfully switched to normalized `Track.assets` model while preserving legacy `audioVersions` fallback:

1. Asset-first selection uses native `/api/projects/:projectId/tracks/:trackId/assets/:assetId/stream` URLs
2. Upload dual-write creates linked TrackAsset + AudioVersion rows
3. Dedupe suppresses duplicate version rows when asset exists
4. External links work without local playback attempts
5. Mobile controls remain accessible
6. Cleanup through UI removes both TrackAsset and AudioVersion rows

## IMPORTANT: Browser-only methodology

- ⚠️ Use ONLY browser UI for all operations
- ⚠️ NO shell scripts, SQL commands, or manual file operations
- ⚠️ Authenticate via browser login form (Google OAuth or email)
- ⚠️ Create temporary project via UI
- ⚠️ Upload files via drag-and-drop or file picker
- ⚠️ Delete project via UI settings
- ⚠️ Do NOT touch production DB, sessions, or uploads directory

---

## Test checklist

### A. Create temporary test project

**Desktop browser** (Chrome/Firefox/Safari):

1. Open https://collabstudio.run
2. Log in with verified owner account
3. Click "New Project" or "Create Project"
4. Enter project title: **"Stage5A Owner Smoke"**
5. Enter initial track title: **"Smoke Track"**
6. Create project
7. ✅ **Checkpoint**: Project and track created via UI

### B. Verify empty state

1. Open the newly created track
2. Check audio player area
3. ✅ **Verify**: Player shows empty state (no audio available message or similar)
4. Open browser DevTools → Console tab
5. ✅ **Verify**: No console errors related to audio/player/assets
6. Switch to mobile viewport (DevTools responsive mode or physical device)
7. ✅ **Verify**: Empty state displays correctly on mobile

### C. Upload first WAV file

**Prepare**: Get a small WAV file (< 1 MB recommended for quick test)

1. Drag and drop WAV file onto track upload area, OR use file picker
2. Wait for upload to complete (status should show success)
3. Wait for automatic track refetch (player should update)
4. ✅ **Verify**: Player shows ONE audio version
5. Click Play button
6. ✅ **Verify**: Audio plays without errors
7. Click Pause button
8. ✅ **Verify**: Audio pauses
9. Drag seek slider to middle
10. ✅ **Verify**: Seek works, playback resumes from new position

#### C.1. Inspect network traffic

1. Open DevTools → Network tab
2. Filter by "stream" or "assets"
3. Play the audio again
4. ✅ **Verify**: Audio request URL contains `/assets/<uuid>/stream` (NOT `/audio/<uuid>/stream`)
5. Check response status
6. ✅ **Verify**: Status 200 or 206 (partial content)
7. Try download button (if visible)
8. ✅ **Verify**: Download URL contains `/assets/<uuid>/download`

#### C.2. Inspect API response

1. Open DevTools → Network tab
2. Filter by "tracks"
3. Refresh the track page
4. Find GET request to `/api/projects/<projectId>/tracks/<trackId>`
5. Click request → Preview/Response tab
6. Expand JSON structure
7. ✅ **Verify**: Response contains BOTH `assets` array AND `audioVersions` array
8. ✅ **Verify**: `assets` array has 1 item with `legacyAudioVersionId` field
9. ✅ **Verify**: `audioVersions` array has 1 item
10. ✅ **Verify**: No `storageKey` field exposed in `assets` items (security check)

### D. Upload second WAV file

**Prepare**: Get a different WAV file (or same file renamed)

1. Upload second WAV file via UI
2. Wait for upload and refetch
3. ✅ **Verify**: Player shows TWO logical versions (not FOUR)
4. Check version selector/list
5. ✅ **Verify**: Newer upload is selected as primary/current
6. Switch to the first version using version selector
7. ✅ **Verify**: Player source changes, audio URL updates
8. Play first version
9. ✅ **Verify**: Audio plays correctly
10. Switch back to second version
11. ✅ **Verify**: Player resets (currentTime/duration update to new file)
12. Check API response again
13. ✅ **Verify**: `assets` array has 2 items, `audioVersions` has 2 items
14. ✅ **Verify**: No duplicate version rows visible in UI

### E. Add external audio link

**Prepare**: Get a valid HTTPS audio link (e.g., from SoundCloud, public audio host, or test URL like `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`)

1. Click "Add external link" or similar button
2. Enter external audio URL (must be HTTPS)
3. Optionally enter provider name (e.g., "SoundCloud", "YouTube", "Other")
4. Submit
5. ✅ **Verify**: External link appears in version list
6. Select the external link version
7. ✅ **Verify**: "Open Link" or "Play on [Provider]" button appears
8. ✅ **Verify**: NO local audio player attempt (no broken playback)
9. Check API response
10. ✅ **Verify**: External asset has `externalUrl` field, `streamUrl` is null or absent
11. Right-click "Open Link" button → Inspect
12. ✅ **Verify**: Link has `target="_blank"` and `rel="noopener noreferrer"` (security)

### F. Mobile viewport verification

**Switch to mobile view** (DevTools responsive mode: 375x667 iPhone SE, or real mobile device):

1. Open the track with uploaded audio
2. ✅ **Verify**: Version selector is accessible (not hidden/cut off)
3. ✅ **Verify**: Play/pause controls are accessible
4. ✅ **Verify**: Seek slider is usable
5. ✅ **Verify**: External link button (if external version selected) is accessible
6. Rotate to landscape (if on device)
7. ✅ **Verify**: No horizontal overflow or layout breakage
8. Switch between versions
9. ✅ **Verify**: Version switching works on mobile
10. Play audio on mobile
11. ✅ **Verify**: Audio plays correctly

### G. Legacy fallback verification (optional)

**Note**: This step is optional because production baseline has no legacy-only AudioVersion rows. If you have an older project with legacy audio:

1. Open a track with legacy audio (uploaded before Stage 5A)
2. ✅ **Verify**: Legacy audio still plays via `/audio/<uuid>/stream` URL
3. ✅ **Verify**: No broken playback or missing audio

**If no legacy audio exists**: This is expected and OK. Local tests already covered this scenario.

### H. Cleanup through UI

**CRITICAL**: Do NOT use SQL, shell commands, or manual file deletion

1. Navigate to project settings for "Stage5A Owner Smoke"
2. Find "Delete Project" option
3. Confirm deletion through UI prompts
4. ✅ **Verify**: Project deleted successfully
5. ✅ **Verify**: Project no longer appears in project list
6. Check browser console
7. ✅ **Verify**: No errors during deletion

---

## Post-smoke verification (owner)

After completing all steps above:

1. **Report completion** to shell/agent with summary:
   - All checkpoints passed: YES/NO
   - Any console errors: YES/NO (list them if any)
   - Any unexpected behavior: YES/NO (describe if any)
   - Mobile testing completed: YES/NO
   - Cleanup through UI completed: YES/NO

2. **Do NOT manually verify DB counts or file system** — agent will perform read-only verification after your confirmation

---

## What happens next

After you report completion:

1. Agent performs **read-only verification**:
   - DB counts return to baseline (User=2, Project=1, Track=1, AudioVersion=0, TrackAsset=0)
   - Upload files return to baseline (0 files)
   - No orphan test data remains
   - No broken references
   - App/postgres remain healthy
   - Logs clean

2. If verification passes:
   - Documentation updated to reflect **OFFICIAL OWNER SMOKE PASS**
   - Stage 5A slice 7 marked **COMPLETE**
   - Stage 5B or next slice can proceed

3. If verification fails:
   - Investigation into orphan data or broken references
   - Manual cleanup assistance if needed
   - Re-test if necessary

---

## Emergency rollback (if needed)

If critical issues discovered during smoke:

1. **Stop testing immediately**
2. Report issue to agent
3. Agent can rollback app to previous image: `sha256:760eb36551e085d59c76e9a986468e3c08f7e4cf7ebddee05aa12c0212110dc2`
4. No database migration rollback needed (schema is additive and backward-compatible)

---

## Summary

- ✅ Temporary project created via browser UI
- ✅ Empty state verified
- ✅ First WAV upload and playback verified
- ✅ Asset-first stream/download URLs verified
- ✅ API response contains both `assets` and `audioVersions`
- ✅ No `storageKey` leak verified
- ✅ Second WAV upload and dedupe verified
- ✅ Version switching verified
- ✅ External link verified (no local playback attempt)
- ✅ Mobile controls verified
- ✅ Cleanup via UI verified

**When all checkpoints pass, report to agent for read-only verification and docs update.**
