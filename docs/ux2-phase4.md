# UX2 phase 4 — Community

Phase 4 ships the redesigned Community module behind the `community` flag.
With the flag off, `/community` renders the production Community Room and
`/voting` redirects to the Board Room, unchanged.

Turn it on for one browser with `?ux2=shell,home,funds,building,community`,
or for a deploy with `VITE_UX2_FLAGS=…`. `?ux2=none` turns it off.

## What it replaces

The Community Room (announcements, requests, meetings, votes, amenities) and
the Board Room's meetings and votes tabs, under six sections. Owners and the
board see the same screen; the board also sees the manage controls. The Board
Room keeps its tabs until phase 5.

| Community section | What is new | Production component mounted underneath |
| --- | --- | --- |
| Overview | Recent notices, building stewardship (board and owner averages), "Lift it this month", the owner leaderboard | — |
| Notices | Alerts strip (safety and maintenance posts in the last 7 days), pinned posts, every post with category filter; board: New notice, pin, unpin, delete | — (same store actions and the same `send-announcement` call the Board Room makes) |
| Meetings | Next meeting card with notice status and RSVP, all meetings table (notice, agenda, attendance, minutes state) | `BoardRoomPage embedded tab="meetings"` for the board (schedule, notice, attendees, minutes, approvals, documents, linked cases and votes); `CommunityRoomPage embedded tab="meetings"` for owners |
| Votes | Open owner vote card with quorum and a Vote button, board decisions from cases, minutes and spending, election and proxies and quorum | `VotingPage embedded initialSelectedId=…` (create, open, ballots, proxies, close, certify, resolution) |
| Requests | Make a request, your requests with the 3-step state and the 14-day reply window, building-wide requests with upvotes | — (same `addIssue` and `upvoteIssue` the Community Room calls); board link to Board Room › Inbox |
| Amenities (management suite) | Shared spaces, my reservations, approvals tiles | `AmenitiesTab` (reserve, approve, deny, rules, notifications) |

## The `embedded` props

- `CommunityRoomPage({ embedded, tab })`: hides the gradient header and tab bar and pins the tab.
- `VotingPage({ embedded, initialSelectedId })`: drops the list header (the Create button moves into the list) and opens one election straight away, which is what the `?vote=` deep link from Home needs. The detail header with the board's Open, Close, Certify and case actions stays.

Default rendering of both is unchanged.

## What this adds that production did not have

- **RSVP** for meetings, through `updateAttendees` (production had no owner RSVP; attendance was recorded by the board).
- **Pin, unpin and delete** for notices: the store actions existed with no UI.
- **New notice** from Community: production could post only from the minutes-approval flow or the Board Room's Communications tab.
- **Board decisions** on one card for every owner, from case votes, meeting motions and spending decisions.
- **Leaderboard** with the design's privacy rule: first names and units only; owners below 70 appear only to themselves and the board.

## Deep links

`/community?tab=<section>`, plus `&vote=<electionId>`, `&meeting=<meetingId>`,
`&request=<issueId>` (highlighted or opened). Legacy `announcements` maps to
notices. `/voting` goes to Community › Votes when the flag is on.

## Numbers

`src/ux2/community/metrics.ts` is pure and tested: notices (pinned, by
category, recent, alerts), meeting rows (a SCHEDULED meeting is upcoming
whatever its date, as production treats it; notice status from the
communications log with the 10-day lead; RSVP counts; minutes none/draft/
approved), vote rows (quorum from the eligible units, whether the viewer's
unit voted, proxies), board decisions, request rows (step, reply window,
upvotes) and the leaderboard visibility rule.

## Not in this phase

- Read counts, comments on notices and the daily digest email: nothing in production records reads or sends a digest.
- Owner comments on their own request: the store has `addIssueComment` but production has no caller either; replies come from the board in Board Room › Inbox.
- Calendar feed links: the `calendar-feed` function exists but no screen links to it yet.

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

Tests: `src/__tests__/ux2/community-metrics.test.ts`, `community.test.tsx`.
