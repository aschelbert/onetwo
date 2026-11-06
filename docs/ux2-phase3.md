# UX2 phase 3 — Building

Phase 3 ships the redesigned Building module behind the `building` flag. With
the flag off, `/building`, `/association-team` and `/archives` render the
production pages unchanged.

Turn it on for one browser with `?ux2=shell,home,funds,building`, or for a
deploy with `VITE_UX2_FLAGS=shell,home,funds,building`. `?ux2=none` turns it off.

## What it replaces

The Building page (8 tabs), the Association Team page (5 tabs), The Archives,
and the Board Room's Duties & Roles and Governance Calendar tabs, under five
sections. The Board Room keeps its tabs; with the flag on, Home's obligation
cards open Building › Obligations instead.

| Building section | Views | Production component mounted underneath |
| --- | --- | --- |
| Overview | Needs you · Details · Insurance · Assets and maintenance · next vendor visits · mailing | `BuildingPage embedded tab="details" / "insurance" / "assets"` |
| Documents | Needs you · Governing and policies · Insurance certificates · Reports and annual archives · minutes link | `BuildingPage embedded tab="legal"`, `ArchivesPage embedded tab="reports" / "archives"` |
| Obligations | Met / Auto-verified / Board checklist tiles · The list (this month, open, filings, ongoing, by role) · Governance Calendar · Duties and roles | `BoardRoomPage embedded tab="runbook" / "duties"` |
| Contracts | Needs you · vendors / bids / paperwork tiles · one row per vendor · vendor directory, bids and contracts | `VendorsTab` |
| Directory | Units & owners · Board, management & staff · Property log · Tasks · PM scorecard · Intercom | `TheUnitsTab variant="building"`, `BuildingPage embedded tab="contacts"`, `PropertyLogPage`, `TaskTrackingTab`, `PMScorecardTab`, Association Team `CommunicationsTab` |

## The `embedded` prop

Three production pages host their own modals and inline tab bodies, so the
module mounts them with a new optional prop rather than copying them:

- `BuildingPage({ embedded, tab })`
- `BoardRoomPage({ embedded, tab })`
- `ArchivesPage({ embedded, tab })` (the create actions move to a slim row)

`embedded` hides the gradient header and tab bar and pins the tab; default
rendering is unchanged. Issues already used the same pattern.

## One production fix

The Governance Calendar kept "done" in local React state, so step progress
was lost on reload and Home's cards (which read `completions` in the
compliance store) never saw it. Board Room now also treats a persisted
completion as done, writes one on "Complete all", and clears it on "Reset".
Building › Obligations › The list offers "Mark done" / "Reopen" on the same
store action, and "Mark filed" opens the Governance Calendar where the proof
flow lives.

## Deep links

`/building?tab=<section>&section=<view>`. Legacy ids are accepted:

| Legacy | Building |
| --- | --- |
| Building `details`, `insurance`, `assets` | overview › details, insurance, assets |
| Building `legal` | documents › governing |
| Building `contacts`, `units` | directory › people, units |
| Building `fees`, `mailing` | Funds › gear (fee schedule, mailing card) |
| Board Room `duties`, `runbook` | obligations › duties, calendar |
| Archives (`/archives`) | documents › archives |
| Association Team `property-log`, `task-tracking`, `pm-scorecard`, `communications` | directory › log, tasks, scorecard, intercom |
| Association Team `payroll` | Funds › Expenses › Payroll |

`/association-team` and `/archives` redirect into the module when the flag is on.

## Numbers

`src/ux2/building/metrics.ts` is pure and tested: the Dashboard's building
health (documents 35, insurance 35, governance 30, unchanged), insurance
status with the 60-day warning, documents summary, one contract row per vendor
(lapsed, ending in 90 days, paid this year from paid work orders, 1099 at $600,
W-9 on file), every obligation and filing judged the way the Governance
Calendar judges it, who carries what per officer, and the three fiduciary
duties.

## Not in this phase

- Real file upload for documents and certificates: attachments are metadata today in every page; the storage upload is a backend task listed in the plan.
- Certificates of insurance per vendor: the vendor record has no COI field.
- Resale request runbook and unit certificate (listed for phase 3 in the plan) wait for the Board Room case engine in phase 5.

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

Tests: `src/__tests__/ux2/building-metrics.test.ts`, `building.test.tsx`.
