# UX2 phase 0 · foundations

Phase 0 of the migration plan (see `docs/migration-plan.md`). It adds the redesign's tokens, component kit, the new shell and the parity manifest, all behind flags. With every flag off the app is unchanged.

## What is in this phase

| Piece | Where | Notes |
| --- | --- | --- |
| Feature flags | `src/ux2/flags.ts` | `shell`, `home`, `funds`, `building`, `community`, `boardroom`, `me`. Any module flag implies `shell`. |
| Design tokens | `src/ux2/tokens.css`, `tailwind.config.ts` (`ux2.*` colours) | Scoped under `.ux2`; legacy screens are untouched. |
| Component kit | `src/ux2/components/` | `Chip`, `Button`/`LinkButton`, `Card`/`Inner`/`SectionLabel`, `Tile`/`TileRow`, `PillTabs`, `TileSwitcher`. |
| New shell | `src/ux2/shell/` | Five-module top nav (Home · Building · Community · Funds · Board Room), avatar menu in the fixed order, phone bottom nav with no More flyout. Legacy destinations with no module yet (Association Team, The Archives) stay in the avatar menu. |
| Route aliases | `src/App.tsx`, `vite.config.ts` | `/home` → Dashboard, `/funds` → Fiscal Lens. Old paths keep working. |
| Parity manifest | `src/ux2/parity/flows.ts` | The 20 gating flows with production and redesign step counts; a test fails if any redesign count is higher. |

## Turning it on

Flags resolve in this order:

1. URL: `?ux2=shell` (or `?ux2=shell,funds`, `?ux2=all`). The value is stored for that browser; `?ux2=none` clears it.
2. Browser storage: `localStorage['onetwo.ux2']`.
3. Build: `VITE_UX2_FLAGS=shell` in the staging environment turns it on for everyone there.

For staging validation, deploy with no build flag and use the URL switch, so the same deployment can be checked with the redesign on and off.

## Checks

```bash
npm test
```

```bash
npx tsc --noEmit
```

```bash
npm run build
```

Phase 0 adds no typecheck errors; the five that exist today predate it (`CommunicationsTab.tsx`, `BuildingPage.tsx`, `rolePermissions.ts`, `PMProvider.tsx`, `PlatformAdminPage.tsx`). The build uses Vite's transpile-only pipeline, so they do not block deploys.

## What phase 1 builds on this

The Home module (`ux2.home`): the Runbook engine's cards, the feed and calendar views, the KPI rail and Pulse, replacing the Dashboard behind the `/home` alias.
