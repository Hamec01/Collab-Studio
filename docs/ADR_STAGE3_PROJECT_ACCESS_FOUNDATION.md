# ADR: Stage 3 Project Access Foundation

Date: 2026-07-02
Status: accepted
Stage: 3

## Context

Stage 3 requires project/track scope isolation, invitation lifecycle, guest links, ownership transfer, capability enforcement, registration hardening, and audited break-glass admin access while preserving backward compatibility with existing frontend/backend flows.

Current model supports only project-level membership roles and has no explicit invitation lifecycle, guest tokens, capability matrix, or verification gates for write operations.

## Decision

Implement additive, backward-compatible access foundation:

1. Add user hardening fields and token models:
- `User.emailVerifiedAt`
- `User.ageAcknowledgedAt`
- `EmailVerificationToken`
- `PasswordResetToken`

2. Add project access/control foundations:
- `Project.entitlements` (JSON skeleton)
- `Project.quotaTier` (string tier marker)
- `ProjectMember.capabilityPreset`
- `ProjectMember.customCapabilities`
- `ProjectInvite` with revocation/expiry/track scope
- `TrackAccessGrant` for track-level scope
- `GuestLink` with listen/download policy
- `OwnershipTransferAudit`
- `BreakGlassAccessAudit`
- `ActivityEvent`

3. Keep compatibility:
- Existing project members continue to work unchanged.
- Existing endpoints keep response shape where practical.
- New checks are additive and only tighten protected write/download paths.

4. Enforce backend capability checks:
- Reads/writes/downloads resolved via centralized access service.
- Admin has no implicit private project access.
- Admin access requires explicit break-glass session + audited reason.

## Migration plan

1. Additive schema migration only (no destructive changes).
2. Backfill defaults:
- `Project.quotaTier = "free"`
- `Project.entitlements = {}`
- `ProjectMember.capabilityPreset = "legacy"`
- `ProjectMember.customCapabilities = {}`
3. Leave existing role semantics intact for compatibility.
4. Add indices for expiry/revocation/access lookup.

## Rollback plan

1. App rollback: deploy previous app version (compat guards keep old flow behavior where possible).
2. DB rollback: avoid destructive down migration; if urgent rollback needed, keep additive columns/tables and disable new endpoints by app version.
3. Data safety:
- Before production migration run backup (`scripts/backup.sh`).
- Validate restore drill on isolated DB before production rollout.

## Consequences

- Introduces Stage 3 foundation without Stage 4+ scope.
- Enables invite expiry/revoke, track scoping, guest policy, and break-glass audit.
- Keeps frontend compatibility while allowing incremental UI adoption.
