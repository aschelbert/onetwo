# UX2 phase 7 — the redesign is the app

Phase 7 removes the flags and the switches: every route now renders the
redesigned module directly, the production screens the modules replaced are
deleted, and every old path redirects into the module that absorbed it. The
production components the modules mount underneath (the tab components,
the case workspace, the balance tab, the profile pages) are untouched; all
mutations and integrations still run through the same code.

There is no `?ux2=` escape hatch any more. To go back to the old screens,
revert this one commit.

## What was removed

| Deleted | Replaced by |
| --- | --- |
| `src/ux2/flags.ts`, `src/__tests__/ux2/flags.test.ts` | nothing; the flags are gone |
| `ShellSwitch`, `HomeSwitch`, `FundsSwitch`, `BuildingSwitch`, `CommunitySwitch`, `BoardRoomSwitch`, `MeSwitch` | the modules mount directly; `src/ux2/shell/routes.tsx` holds the redirects and the two role-sensitive routes |
| `features/dashboard/DashboardPage.tsx`, `FiduciaryAlerts.tsx` | Home (`/home`); the alert logic lives on in `lib/fiduciaryAlerts.ts` |
| `features/financial/FinancialPage.tsx` (Fiscal Lens) | Funds |
| `features/association-team/AssociationTeamPage.tsx` | Building › Directory |
| `features/support/HelpSupportPage.tsx` | Me › Help |
| `components/ActiveCaseWidget.tsx` | the Return-to-case bar under the top nav, which now shows whenever a case context exists off the case page |
| `components/layout/AppShell.tsx`, `TopNav.tsx`, `BottomNav.tsx`, `Sidebar.tsx` | `Ux2Shell`, `Ux2TopNav`, `Ux2BottomNav` |

`PortfolioShell` (the management company's portfolio) and the admin console
are not part of the redesign and keep their own shells.

## Redirects

Nothing a bookmark, an email or a runbook letter ever linked to goes dead.

| Old path | Lands on |
| --- | --- |
| `/dashboard` | `/home` (query kept) |
| `/financial?tab=…` | `/funds?tab=…` (query kept; the old Fiscal Lens tab ids resolve inside Funds) |
| `/archives`, `/archives?tab=reports` | `/building?tab=documents&section=archives` / `…&section=reports` |
| `/association-team?tab=…` | Community › Property log / PM scorecard, Board Room › Tasks / Intercom (see `docs/ux2-phase8.md`) |
| `/property-log` | `/community?tab=log` |
| `/compliance` | `/building?tab=obligations` |
| `/voting` | `/community?tab=votes` |
| `/board-ops` | `/boardroom` |
| `/boardroom?tab=runbook`, `?tab=duties` | `/building?tab=obligations&section=calendar` / `…&section=duties` |
| `/boardroom?tab=meetings`, `?tab=votes` | `/community?tab=meetings` / `…?tab=votes` |
| `/cases?…` | `/issues?…` (query kept) |
| `/boardroom`, `/issues` as an owner | `/community`; owners keep the production case view on `/issues` |

Signing in lands on `/home` (management companies on `/portfolio`, platform
admins on the console, as before). Unknown paths go to `/home`.

## Phone

Every module and sub-tab was audited at 390px for both roles (48 screens):
no page scrolls sideways. Fixes made for that:

- UX2 grids declare `grid-cols-1` so a wide child cannot stretch the column on a phone (Home, Community overview and 18 other grids).
- The "Done for you" chips on Funds wrap; the Board Room inbox's request column keeps a minimum width so the table scrolls instead of squashing.
- Production rows embedded in the modules wrap on narrow screens: the unit filter chips (`TheUnitsTab`), the reserve "Link to" row (`FLReserves`), the vendor sub-tabs and header (`VendorsTab`), the embedded Issues header (`IssuesPage`) and the Communications header (`CommunicationsTab`). Nothing changes above 640px.

## Numbers

| | Before phase 7 | After |
| --- | --- | --- |
| JS bundle (`dist/assets/*.js`, bytes) | 3,058,425 | 2,973,362 |
| Tests | 207 in 27 files | 194 in 26 files (the 13 dropped tests covered the flags and the "flag off" branches) |
| `tsc --noEmit` | 5 pre-existing errors | 5, the same ones |

## Verify

```bash
npx vitest run
```

```bash
npx tsc --noEmit   # 5 pre-existing errors, none in src/ux2
```

```bash
npm run build
```

Redirect and module tests: `src/__tests__/ux2/{shell,home,funds,building,community,boardroom,me}.test.tsx`.
