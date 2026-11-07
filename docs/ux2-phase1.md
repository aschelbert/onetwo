# UX2 phase 1 — Home and the Runbook engine

Phase 1 ships the redesigned Home behind the `home` flag. With the flag off,
`/home` and `/dashboard` render the production `DashboardPage` unchanged.

Turn it on for one browser with `?ux2=shell,home`, or for a deploy with
`VITE_UX2_FLAGS=shell,home`. `?ux2=none` turns it off again.

## What landed

| Piece | Where | Notes |
| --- | --- | --- |
| Runbook card engine | `src/ux2/runbook/model.ts` | Pure: `generateCards(input, ctx)` ranks cards the way the Dashboard ranked "Your Action Items" (overdue filings, urgent cases, votes, meetings inside 14 days, replies due, insurance, delinquencies, budget, owner payment). `attentionCounts` feeds the chips. |
| Store adapters | `src/ux2/runbook/adapters.ts` | `buildCardInput(snapshot)` maps compliance (filings + dated obligations via `refreshComplianceRequirements`), cases (first open step), spending decisions and elections (votes), meetings (notice status from the communications log, RSVP from attendees), owner requests (14-day reply window), insurance, aging buckets (`getDelinquencyAging`), budget variance and the owner's next payment. Read-only. |
| Card state | `src/ux2/runbook/store.ts` | Hide, snooze, mark done per person. Persisted as `onetwo-ux2-runbook`; mirrored to `runbook_instances` when the backend is on. Hiding never changes the underlying record. |
| Stewardship score | `src/ux2/score/stewardship.ts`, `src/ux2/score/events.ts` | Five dimensions (Timeliness 35 · Compliance 35 · Oversight 10 · Reach 10 · Impact 10), scored on the trailing twelve months with a receipt per event. Board members are compared with the board, owners with the owners. Credit rule: on time full, a week late half, a month late a quarter, later none. |
| Radar widget | `src/ux2/components/StewardshipRadar.tsx` | The one fixed stewardship card: navy, aqua "you", red building average. Same everywhere it appears. |
| Home | `src/ux2/home/HomePage.tsx`, `calendar.ts`, `HomeSwitch.tsx` | Up next · Waiting on others · Upcoming, stewardship card (first on phones), KPI tiles (board: reserves, collected, open cases; owner: balance + Pay), four-month calendar, Pulse. Every card action is a deep link into the production page that owns the record. |
| Return to case | `src/ux2/shell/ReturnToCaseBar.tsx` | Slim bar under the top nav from `activeCaseContext`, shown only while the floating case widget is minimised and the person is off `/issues`. |
| Persistence | `supabase/migrations/031_runbook_instances_stewardship.sql`, `src/lib/services/runbook.ts` | Additive tables `runbook_instances` and `stewardship_scores` with tenant RLS, following `022_period_closes.sql`. Nothing in production reads them. |

## Deep links the cards use

| Card | Opens |
| --- | --- |
| Filing, obligation | `/boardroom?tab=runbook` |
| Case step, board vote, delinquency with a case | `/issues?view=case:<id>` |
| Owner vote | `/community?tab=votes` |
| Meeting, notice | `/community?tab=meetings` |
| Owner request (board) | `/issues` · (owner) `/community?tab=requests` |
| Insurance | `/building?tab=insurance` |
| Budget, reserves, unit ledger | `/funds` with the Funds tab set in the financial store (`setActiveTab`) |
| Owner payment | `/my-unit?tab=balance` |

## Parity with the production Dashboard

- Attention pills → attention chips (same counts, same destinations).
- "Your Action Items" → Up next (same priority order, no cap of five; "Show all").
- Next meeting, fiduciary alerts, budget alerts → cards in the feed with the same deep links.
- Reserve %, collection rate, open cases → KPI tiles.
- Recent activity → Pulse.
- Resident balance banner → Balance tile with Pay; "Cases involving your unit" stays reachable from Board Room.
- Onboarding setup widget still renders in the shell for tenants in `onboarding`.

## Scoring notes

Scoring is client-side today from the data already in the stores. The
`stewardship_scores` table holds a monthly snapshot so history survives data
changes; a scheduled job can take over the compute later without changing
the contract. There are no scheduled jobs in the repo yet (the trial reminder
is called by the Chargebee webhook), so the first job would need pg_cron or a
dashboard schedule calling an edge function.

The seed board member is not on any meeting attendance list and has no
closed cases, so the demo score is low. That is the data, not the engine.

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

Tests: `src/__tests__/ux2/{runbook,stewardship,calendar,adapters}.test.ts`, `home.test.tsx`.
