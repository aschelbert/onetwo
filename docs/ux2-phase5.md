# UX2 phase 5 — Board Room

Phase 5 ships the redesigned Board Room behind the `boardroom` flag. With the
flag off, `/boardroom` renders the production Board Room and `/issues` the
production Issues page, unchanged.

Turn it on for one browser with `?ux2=shell,home,funds,building,community,boardroom`,
or for a deploy with `VITE_UX2_FLAGS=…`. `?ux2=none` turns it off.

## What it replaces

The Issues page (open cases, request inbox, archive, the case workspace and
the New Case wizard), the Board Room's Daily Operations and Communications
tabs, and the runbook catalogue, under five sections. Board, manager and
staff only: an owner on `/issues` keeps the production owner case view, and
`/boardroom` sends an owner to Community.

| Board Room section | What is new | Production component mounted underneath |
| --- | --- | --- |
| Open | One row per open case with "Where it is" (step n of m), "Next" (what the step waits on: a vote, a spending decision, bids, a conflict check), driver, due, priority; All / My tasks / Overdue / On hold; category chips; search | — (rows open the case frame) |
| Inbox | Needs-you (acknowledge within 48 hours, reply before the 14-day clock), the request table with the runbook step, Acknowledge in place | `IssuesPage embedded` on the Request Inbox (reply, status, convert to case) |
| Runbooks | The 32 runbooks: with an open case, automated steps, switched on; cards for the running ones with their step chain; the full table with on/off switches and "Open a case" | the New Case wizard, opened on the runbook's situation through the new `prefill` prop |
| Outbox | Needs-you (overdue meeting notices, drafts), Drafts / Sent / Mail-in-transit tiles with postage and the card on file, alerts and delivery cards, the letters table | `CommunicationsTab` (compose, the feed, the templates) |
| Archive | Closed cases, resolved requests and sent letters in one list with year and type filters, search and export | — (a closed case opens its workspace) |
| Case frame (`?view=case:<id>` and `?view=new`) | Breadcrumb and summary line; **the spending decision, bid comparison and conflict check panels for the open steps that need them**, the board vote result and the decision trail | `IssuesPage embedded` (the case workspace with every modal: vote, upload, work order, invoice, meeting, send notice, hold, close) and the wizard |

## What this restores

The codebase has `SpendingDecisionPanel`, `BidComparisonPanel`,
`ConflictCheckPanel` and `DecisionTrail`, but the production case page never
mounted them (they live only in an unused `WorkflowStepCard`). The case frame
mounts them for the case's open steps that are marked as a spending decision,
requiring bids or requiring a conflict check, with "Start collecting bids" on
the same store action. This is the design's spending and bid step variants.

## Production changes

- `IssuesPage({ embedded, prefill })`: a new optional `prefill` opens the New Case wizard on a category and situation. Default rendering is unchanged.
- `/cases?view=case:<id>` (an old link from My Unit's move history that had no route) now redirects to the case.

## Deep links

`/boardroom?tab=open|inbox|runbooks|outbox|archive`, `/boardroom?view=case:<id>`,
`/boardroom?view=new&cat=<catId>&sit=<sitId>`. Legacy ids map: `dailyops` →
open, `communications` → outbox, `caseTab=issues` → inbox, `caseTab=archive`
→ archive. `/issues?view=case:<id>` (Home's case cards) resolves to the case
frame. With the Building and Community modules on, `/boardroom?tab=duties|runbook`
and `?tab=meetings|votes` redirect there; otherwise they still render inside
the production Board Room.

## Numbers

`src/ux2/boardroom/metrics.ts` is pure and tested: case rows (where it is,
next, driver, due, overdue, mine, on hold, from a request), inbox rows (the
14-day reply clock and the 48-hour acknowledgement window, linked case,
assignee), the outbox (drafts, sent, letters in transit and delivered,
postage), archive rows, and the runbook statuses (on/off, open cases, last
ran). `src/ux2/boardroom/runbooks.ts` holds the catalogue; every situation
it names exists in the wizard. Switches persist in `onetwo-ux2-runbooks`.

## Not in this phase

- Runbooks without a situation in the wizard (snow and ice, 1099 filing, year-end close, payroll and the like) are listed and switchable but have no trigger yet; the trigger jobs are backend work the plan already names.
- Comments on a request from the board: production's `addIssueComment` has no caller, so replies go through the inbox's communication flow as today.
- Address verification and mail status polling: the `verify-address` and `check-mail-status` functions exist but nothing in the app calls them yet.

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

Tests: `src/__tests__/ux2/boardroom-metrics.test.ts`, `boardroom.test.tsx`.
