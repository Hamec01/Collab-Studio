# CollabStudio responsive projects preview

Branch: `design/collabstudio-responsive-shell`

## Purpose

This branch contains an isolated, interactive UI prototype for the future `Studio / Projects` experience. It is intentionally separate from the current authenticated workspace and does not read or write production project data.

## Open the prototype

Run the application normally:

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000/design/projects
```

When the branch is deployed to a preview environment, use the same `/design/projects` path on that environment.

## Included in the first slice

- responsive desktop, tablet and mobile shell;
- expandable desktop navigation and compact tablet rail;
- project grid/list modes;
- project search and category filters;
- selectable project cards;
- desktop context panels for online members, activity and tasks;
- responsive audio player with working play/pause state;
- mobile Studio tabs and bottom navigation;
- semantic CSS theme tokens with backwards-compatible aliases;
- existing CollabStudio PNG sprite through `SpriteIcon`.

## Responsive checkpoints

- desktop: `1281px` and wider;
- tablet: `721px–1280px`;
- mobile: `720px` and narrower;
- compact mobile refinement: `390px` and narrower.

## Files

- `src/features/design-preview/ProjectsDesignPreview.tsx`
- `src/features/design-preview/projects-design-preview.css`
- `src/app/AppRouter.tsx`
- `src/index.css`
- `src/shared/ui/Button.tsx`

## Important limitation

The project list currently uses deliberate preview data. The next implementation stage is to replace the preview data with the existing `Project` model and workspace actions while preserving the responsive shell and component structure.

## Review checklist

1. Open the page at widths around `1440`, `1024`, `834`, `430`, `390` and `360` pixels.
2. Test search and the `Все / Мои / Общие / Архив` filters.
3. Switch between grid and list display.
4. Collapse and expand the desktop sidebar.
5. Select several project cards.
6. Toggle play/pause in the bottom player.
7. On mobile, switch between `Проекты`, `Треки` and `Задачи`.
8. Confirm that `/app` and existing production routes still render separately.
