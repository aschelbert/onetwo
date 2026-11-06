# UX2 phase 8 — the Calendar, the Property Manager Seat, and the log for everyone

Four changes after the phase 7 merge, from the board's walk through staging.

## The Calendar (Home and Community)

The design's Home has two views, Feed and Calendar, one tap apart, and the
same calendar inside Community for owners. Phase 1 had shipped only a
"Next four months" strip of runbook cards; this phase builds the designed
view.

- `src/ux2/home/agenda.ts` (pure, tested) merges everything with a date from
  the module that owns it: scheduled meetings, votes closing, pending
  filings, runbook steps with a date, vendor visits from the maintenance
  schedule, amenity reservations, move-ins, insurance expiries, dues days
  and late-fee days. Nothing is entered twice; sources that the runbook
  engine also turns into cards (meetings, votes, filings, insurance,
  maintenance, payments) are listed once, from the source.
- `CalendarView` shows it month by month with the arrows, with filters
  (Everything, Mine, Meetings, Votes, Deadlines and filings, Vendors and
  maintenance, Amenities), a kind chip and an All/Board chip on each item,
  and an action that opens the owning page. Today is always listed, with
  what comes next when it is empty.
- Home: Feed | Calendar next to the greeting, kept in the URL
  (`/home?view=calendar`), on desktop and phone. The strip at the foot of
  Home is gone.
- Community › Calendar: the same list; owners see only what is for
  everyone, and their own dues lead to Pay.

Not in this phase: the ICS feed link. The `calendar-feed` function needs an
HMAC token minted server-side and no screen mints one today; that is a
small follow-up.

The demo building's seed data is dated early 2026, so on the demo the
calendar shows little beyond dues days until the seeds are moved forward.

## The Property Manager Seat

`subscriptions.pm_addon` now reaches the app as `tenant.pmSeat`
(`TenantProvider`; the demo has it on). It gates:

| With the seat | Where | Without it |
| --- | --- | --- |
| Tasks (the team kanban) | Board Room › Tasks | tab absent; `?tab=tasks` opens Open |
| Intercom (the team channels) | Board Room › Intercom | tab absent |
| PM scorecard | Community › PM scorecard, everyone sees it, the board writes | tab absent |

### PM scorecard, rebuilt

`src/ux2/community/scorecard.ts` (pure, tested) and
`ScorecardTab`: three tiles (this quarter, trailing year, the lowest
category to watch), the five categories with bars and bands, the trend by
quarter, and the reviews for the chosen quarter. The board writes a review
inline (five star rows with a line of notes each, summary, strengths, to
improve) and deletes one; both go through `useScorecardStore` and the same
`pm_scorecard_reviews` table. The old `PMScorecardTab` is deleted; nothing
mounted it.

## The Property log, for everyone

Community › Property log. Anyone in the building logs what they see; the
board, the manager and staff edit, delete and turn findings into tasks.
`PropertyLogPage` hides those controls and the action-item section for
owners. Migration 032 lets every tenant member insert (`created_by`
records who) and leaves edit and delete with the board, the manager and
staff.

## The Intercom

What was wrong on staging, and what changed:

- `team_messages` was not in the realtime publication, and the component
  relied on the realtime INSERT event to show a message after sending, so
  a sent message did not appear until the channel was reopened. The
  component now appends the saved row itself; migration 032 also adds the
  table to the publication so other people see it live.
- The `team-attachments` bucket did not exist, so attachments were dropped
  silently. Migration 032 creates it with upload and read policies for the
  team.
- Without a backend (the demo), the component spun on "Loading channels"
  for ever. It now says the intercom runs on the live backend. A failed
  channel load or a failed send is shown instead of swallowed.
- The rail stacks above the messages on a phone.

## Redirects

| Old | Lands on |
| --- | --- |
| `/property-log`, `/association-team`, `/association-team?tab=property-log`, `/building?tab=property-log` | `/community?tab=log` |
| `/association-team?tab=pm-scorecard`, `/building?tab=pm-scorecard` | `/community?tab=scorecard` |
| `/association-team?tab=task-tracking`, `/building?tab=task-tracking` | `/boardroom?tab=tasks` |
| `/association-team?tab=communications`, `/building?tab=communications` | `/boardroom?tab=intercom` |

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

Tests: `src/__tests__/ux2/agenda.test.ts`, `community-scorecard.test.ts`,
and the updated `home`, `community`, `boardroom`, `building` module tests.
Migration: `supabase/migrations/032_property_log_everyone_intercom.sql`.
