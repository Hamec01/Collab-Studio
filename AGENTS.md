# CollabStudio Agent Rules

## Canonical technical source

- Use [docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md](docs/COLLABSTUDIO_MASTER_TECHNICAL_ROADMAP.md) as the primary implementation contract.
- Use [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for current stage and gate tracking.
- Files under `docs/archive/` are historical references and must not override canonical decisions.

## Execution contract

Before each stage:

1. Read canonical roadmap and implementation status.
2. Check git status and current commit.
3. Define scope and explicit non-goals.
4. Implement only one vertical slice.
5. Run stage quality gate before moving forward.

## Hard boundaries

- Do not skip stages.
- Do not rewrite app from scratch.
- Do not introduce schema redesign without stage-approved additive migration.
- Do not implement public/social/pwa/rich-text/audio migration before their stages.

## Stage 0 gate baseline

- `npm ci`
- `npm run prisma:generate`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run e2e`
