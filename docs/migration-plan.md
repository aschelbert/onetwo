# ONE two · production-to-design feature map and migration plan

As of 2026-11-06. Sources: the production source at this branch (routes, feature pages, services, edge functions) and the design canvas (Direction 3b, version 217). The living copy of this plan, with per-row status dropdowns the team can update, is the Claude doc "ONE two · Production-to-design feature map and migration plan"; this file is the committed snapshot.

## 1. Scope and guarantees

Every capability in production today maps to a named place in the redesign, and the migration ships module by module behind a flag so the old screen stays until the new one proves parity. Three guarantees govern every phase, and each has a test that gates release.

| Guarantee | In practice | Proven by |
| --- | --- | --- |
| No feature lost | Every route, tab, modal, action and edge function in the inventory has a row in the feature map with a destination. A row with no destination blocks the phase. | The parity matrix (section 7) walked end to end on the new screen with the sample building; every row passes. |
| No lesser UX | Anything that took N steps takes N or fewer; anything one screen away stays at most one screen away. Collapsing, hiding or moving work behind a settings icon counts as a regression. | Step counts recorded per flow; a regression is a blocker. |
| No integration broken | Stripe Connect and Checkout, Chargebee, mail and notices, calendar feed, PDF generation, Supabase auth and every edge function keep their contracts. The redesign changes callers, never functions or tables. | Each integration has a smoke test run in staging against live sandboxes before and after the flip. |

The redesign is a presentation and navigation change over the existing stores, services and edge functions. Three things are new and additive: the Runbook engine (obligations and case steps become dated Home cards), the five-dimension stewardship score with leaderboards, and the online-payments setup screen.

## 2. Production inventory

| Module (route) | Tabs and areas today | Flows and actions that must survive | Services, functions, integrations |
| --- | --- | --- | --- |
| Dashboard (/dashboard) | Board layout: welcome with grade chips, attention pills, 4 KPI cards, fiduciary alerts, action items, delinquency aging, budget alerts, upcoming meetings, activity, Reports tab. PM layout. Resident layout: balance banner, pay now, quick actions, my cases, contacts | Ranked action list by role; attention thresholds; report configs | compliance, cases, financial, reports |
| Fiscal Lens (/financial) | Overview, Unit Ledger, Chart of Accounts, General Ledger, WO & Invoices, Budget, Reserves, Spending Decisions, Statements & Tax Forms; header tiles | Stripe Connect; due day; monthly fee; bulk assessment; send invoice; refund; record payment; record expense; transfer; journal entry; reconcile; accounts and GL mapping; work order draft, approve, receive invoice, pay; unit invoices; budget allocation and reserve contribution; reserve items and projection; spending request with funding analysis and three-vote rule; balance sheet, income statement, budget variance, 1120-H, D-20 | financial, invoicing, spending, reports, assets; connect-stripe-account, stripe-webhook, refund-unit-payment, send-unit-invoice |
| Issues (/issues) | Open, Issues (request inbox), Archive; new case wizard (10 categories, ~40 situations, custom steps, approaches); case workspace (chips, progress ring, phases, budget tracker, steps, checklists, actions, documents, decision trail, sidebar); modals (board vote, add document, add approach, link or create meeting, create invoice, close); owner case view | Create, hold, reassign, close, reopen, delete; mark step complete; inline panels (spending decision, bid comparison, reserve impact, budget review and draft, bylaws review, contract renewal, conflict check, three-year outlook); send notice; request submit, upvote, SLA, convert | cases, issues, letterEngine, spending; generate-notice-pdf, send-status-update, send-mail |
| Board Room (/boardroom; absorbs /compliance, /voting, /board-ops) | Duties & Roles, Governance Calendar (filings, mark filed, proof, how-to), Meetings (board, annual, minutes, notices), Votes & Resolutions, Communications (feed, templates, compose, scheduled), Daily Operations; runbook templates | Mark filed with proof; schedule meeting with vote detection; minutes approval; create, open, close, certify votes; paper ballots and proxies; compose and schedule; regulatory refresh | compliance, meetings, elections, communications, complianceRefresh; send-meeting-notice, send-announcement, calendar-feed |
| Elections | Vote Items, Compliance, Timeline, Discussion, Resolution | Ballot items, candidates, thresholds, approve, deny, abstain, certify | elections |
| Building (/building) | Grade and tiles; Building Details; Contacts; Assets (registry, schedules, integration hub); Vendors (directory, reviews, bids, contracts); Legal & Bylaws; Insurance; Fee Schedule; The Units; Units manager; Payments manager (Stripe Connect); Mailing settings; PM Scorecard | Edit details; add asset and schedule; vendor, review, bid, contract; upload documents; add policy; edit fees; manage units; connect Stripe; mailing defaults | building, assets, vendorTracker, scorecard; connect-stripe-account, connect-letterstream, verify-address, check-mail-status |
| Association Team (/association-team) | Property Log, Task Tracking (kanban, logs), PM Scorecard, Intercom (realtime), Payroll & 1099s | Log entry to task; drag tasks; link task to meeting, case, log or request; score the manager; message channels; run payroll; file 1099s | propertyLog, taskTracking, scorecard, communications, payroll; staff-payment |
| Archives (/archives) | Overview, Compliance, Regulatory Refresh, Filings, Meetings, Communications, Fiscal Snapshot, Insurance, Legal Docs, Board; six report types | Three-step report wizard; annual governance archive; type filter | archives, reports |
| Community Room (/community) | Announcements, Requests, Meetings, Votes & Resolutions, Amenities | Owner-facing versions of the board flows | announcements, issues, meetings, elections, amenities store |
| My Unit (/my-unit) | Balance & Payments (Stripe checkout, autopay, assessments, late fees), My Documents, Move History; unit selector; link units | Pay by Checkout; save card; mark assessment paid; upload; report a move | unitManager; connect-stripe-account (checkout) |
| Account (/account) | Profile, linked units, notification preferences, password, 2FA | Edit profile; preferences (inert today); password; 2FA (inert today) | Supabase auth; reset-password |
| Subscription (/subscription) | Status, tier, add-ons, interval, Chargebee portal, cancel | Change plan, add-ons, interval, portal, cancel | chargebee-checkout, chargebee-portal, chargebee-webhook, manage-subscription, trial-reminder |
| Help & Support (/support) | Support Chat (realtime), How This Works; AI advisor (disabled) | Open thread, reply, search guides | platform service, Supabase realtime |
| User Management (/admin/users) | Invite one or bulk, pending invites (resend, revoke), members, roles, remove | Invite end to end | send-invite, notify-signup |
| Auth | Welcome, login, 3-step signup with trial, join by invite, demo lead, reset | Signup provisions a tenant and can load the sample building | provision-tenant, load-sample-building, notify-signup, reset-password |
| Portfolio and Platform Admin | PM portfolio shell and dashboard; admin pages (dashboard, subscriptions, features, matrix, permissions, tenancies, roles, support, feedback, problems, Stripe, Fiscal Lens) | Cross-tenant operations | platform service, webhooks |
| Shell | Top nav with hamburger under 1080 px, bottom nav with More flyout, avatar menu, sync indicator, tenant and role, admin View As, Active Case widget, onboarding setup widget | Navigation, role preview, return to case | TenantProvider, stores |

## 3. Feature map

Status: Kept = same screen and actions in a new skin · Repackaged = same data and actions through a card or new grouping · New home = moved to another module · Gap = not drawn yet; ships as the production screen restyled inside the new shell until it is.

| Production capability | Redesign location | Status | Note |
| --- | --- | --- | --- |
| Top nav, hamburger, bottom nav with More | Home · Building · Community · Funds · Board Room + avatar menu; phone bottom nav of five, resident four | Repackaged | Every old destination one level down a sub-tab row |
| Avatar menu | Me menu: My Account, My Unit, User Management, Subscription, Help & Support, Sign out | Kept | |
| Sync indicator, tenant and role, View As | Top bar; role preview on My Account | Kept | |
| Onboarding setup widget | Home cards from the New building setup runbook (9 steps; Stripe is step 6) | Repackaged | |
| Active Case floating widget | Home card for the current step; Return-to-case bar on phone | Gap | Desktop bar not drawn |
| Dashboard board layout | Home feed cards, KPI rail, Pulse; Building score as shared KPI | Repackaged | Same ranking rules |
| Fiduciary alerts | Home cards (alerts are tasks); Building › Obligations › Duties and roles | Repackaged | Fix: rules read live data |
| Dashboard PM layout | Home engine filtered for the PM role | Gap | |
| Dashboard resident layout | Resident Home (phone); Me › My Unit | Kept | |
| Dashboard Reports tab | Building › Documents › Reports | Kept | |
| Fiscal Lens header tiles | Funds › Overview tiles and next twelve months | Repackaged | Reserve % funded and cash-to-expenses promoted |
| Unit Ledger and its actions | Funds › Income (ledger, behind, invoices); fee and due day under the Funds gear; Stripe row | Kept | Same postings and emails |
| Chart of Accounts, GL mapping | Funds gear › Chart of accounts, Where things post | Kept | |
| General Ledger, reconcile | Funds gear › Ledger | Kept | Open decision: promote to a tab |
| WO & Invoices | Funds › Expenses › Bills and Work orders; unit invoices under Income | Kept | |
| Budget | Funds › Planning › This year; reserve contribution lever on Reserves | Kept | |
| Reserves | Funds › Planning › Reserves | Kept | Funding analysis reused |
| Spending Decisions | Funds › Expenses › Spending decisions deck; vote on the case | Repackaged | Each pending vote is a Home card |
| Statements and tax forms | Funds › Statements & taxes | Kept | |
| Payments manager (Stripe Connect) | Funds › Online payments | Kept | |
| Refund | Funds › Online payments › Refund | Kept | |
| Issues lists | Board Room › Open, Inbox, Archive | Kept | |
| New case wizard | Board Room › New case | Gap | |
| Case workspace | Case board; phone step sheet | Kept | Vote, spending, upload steps to draw |
| Inline step panels | Inside the step card | Kept | Navigate-type actions become inline |
| Send notice, generated letters | Step card; Board Room › Outbox | Kept | |
| Owner case view | Community › Requests; resident Home card | Kept | |
| Request inbox | Board Room › Inbox; Community › Requests | Kept | |
| Duties & Roles | Building › Obligations › Duties and roles | New home | Duty of compliance label |
| Governance Calendar | Building › Obligations; Runbook engine makes Home cards | Repackaged | |
| Runbook templates | Board Room › Runbooks (32) | Kept | |
| Meetings | Community › Meetings with board controls | New home | |
| Votes & Resolutions | Community › Votes for owner votes; board votes on the case; Board decisions card | Repackaged | |
| Elections detail | Community › Votes › Election | Gap | |
| Communications | Board Room › Outbox | Repackaged | SMS removed |
| Daily Operations | Board Room › Open | Repackaged | |
| Regulatory refresh | Building › Obligations sources strip | Kept | Not drawn in detail |
| Building tiles and details | Building › Overview | Kept | |
| Contacts | Building › Directory | Kept | |
| Assets and maintenance | Building › Overview; Funds › Planning › Reserves | Kept | Asset detail not drawn |
| Vendors, bids, contracts | Building › Contracts | Kept | |
| Legal & Bylaws | Building › Documents | Kept | Fix: real upload |
| Insurance | Building › Overview; renewal runbook | Kept | |
| Fee schedule | Funds gear › Fee schedule; read-only on My Unit | New home | |
| Units roster and manager | Building › Directory by unit; balances on Income | Repackaged | |
| Mailing settings | Board Room › Outbox delivery card; LetterStream account under the Funds gear | New home | Not drawn in detail |
| PM Scorecard | Building › Directory | Gap | |
| Property Log | Building › Directory › Property log | Gap | |
| Task Tracking | Home cards; Building › Directory › Tasks | Gap | |
| Intercom | Building › Directory › Intercom | Gap | |
| Payroll & 1099s | Funds › Expenses (payroll); Statements & taxes (1099s) | Gap | |
| Archives, report wizard, annual archive | Building › Documents › Reports and Annual archives; Board Room › Archive | Kept | Wizard not drawn |
| Announcements | Community › Notices; recent five on Overview | Kept | |
| Owner requests | Community › Requests | Kept | |
| Owner meetings and votes | Community › Meetings and Votes | Kept | |
| Amenities | Community › Amenities | Kept | |
| My Unit balance and payments | Me › My Unit; Me › My Unit › Pay | Kept | Fix: autopay persists |
| My Unit documents, moves | Me › My Unit | Kept | |
| Link units, selector | Me › My Account › Units; Me › My Units | Repackaged | |
| Account | Me › My Account | Kept | Fix: preferences, 2FA; SMS and photo removed |
| Subscription | Me › Subscription | Kept | |
| Support chat and guides | Me › Help & Support | Kept | |
| AI advisor | Removed; keyword search | Repackaged | No model calls |
| User management | Me › User Management | Kept | |
| Auth | Unchanged | Kept | |
| Portfolio, Platform Admin | Portfolio gets the Home engine; admin untouched | Gap | Admin out of scope |

## 4. Integrations

No edge function, table or third-party contract changes; only callers move.

| Integration | Functions and client code | Redesign callers | Smoke test before a flip |
| --- | --- | --- | --- |
| Stripe Connect and Checkout | connect-stripe-account, stripe-webhook, refund-unit-payment, send-unit-invoice | Funds › Online payments; Funds › Income; Me › My Unit › Pay | Onboard a sandbox account; pay $1 by card and ACH; refund; webhook posts both ledger entries |
| Stripe staff payouts | staff-payment | Funds › Expenses › Payroll | Staff sandbox account; $1 pay run |
| Chargebee | chargebee-checkout, chargebee-portal, chargebee-webhook, manage-subscription, trial-reminder | Me › Subscription; signup | Change tier, toggle add-on, portal, cancel and reverse |
| Mail and notices | send-mail (LetterStream, the building's own account), connect-letterstream, check-mail-status, verify-address, generate-notice-pdf, send-meeting-notice, send-announcement, send-status-update, letterEngine | Case step card; Board Room › Outbox; Community › Meetings | Generate PDF; verify address; one certified letter to sandbox; status read back |
| Email | send-invite, notify-signup, send-status-update, send-announcement, trial-reminder | Me › User Management; Community › Notices; Board Room › Inbox | Invite end to end; notice and digest |
| Calendar feed | calendar-feed (ICS) | Home › Calendar; Building › Obligations | Subscribe; new obligation appears on refresh |
| Tenant lifecycle | provision-tenant, load-sample-building, reset-password, auth, TenantProvider | Unchanged | Sign up, provision, sample, reset |
| Supabase realtime | Intercom, Support chat channels | Building › Directory › Intercom; Me › Help & Support | Two browsers, under two seconds |
| Supabase data | 22 services over existing tables | Every module through the same services | Row counts and checksums equal before and after each phase |

New backend work, all additive: runbook_instances plus a nightly card job; monthly stewardship scoring with event receipts; online-payments settings on the tenant.

## 5. Gaps the design must close

| Gap | Lands in | Phase | Fix |
| --- | --- | --- | --- |
| New case wizard | Board Room › New case | 5 | Four-step wizard board |
| Case step variants (vote, spending, upload) | Case step card | 5 | Drawn: the roof repair case board (canvas version 220); step actions inline |
| Elections detail (compliance, timeline, discussion, resolution) | Community › Votes › Election | 4 | One election board |
| Dashboard PM layout | Home for PM | 1 | Home feed with PM filter |
| Portfolio | Portfolio home | 1 | Home feed grouped by building |
| Property Log, Tasks, Scorecard, Intercom | Building › Directory | 3 | Four sections; kanban keeps drag and drop |
| Payroll & 1099s | Funds › Expenses | 2 | Fourth tile and board |
| Report wizard and annual archive | Building › Documents › Reports | 3 | Card flow and FY archive card |
| Mailing settings | Board Room › Outbox | 5 | Delivery card with history |
| Asset detail | Building › Overview › Assets | 3 | One board |
| Return-to-case bar (desktop) | Shell | 1 | Draw on Home desktop |

Deliberately not carried: the AI advisor (keyword search instead) and SMS delivery.

## 5b. Net-new features in the design

Thirty-one things on the canvas have no production counterpart. Each belongs to the phase that builds its module and is additive, so none can cause a parity failure. Backend = needs new tables or jobs.

| Feature | Where | Phase | Backend |
| --- | --- | --- | --- |
| Runbook engine and Home cards (nightly job) | Home, every module | 1 | yes |
| Stewardship score, dimensions, bands, radar, Score model page (monthly job, event receipts) | Home, Me, Community | 1 | yes |
| Building score as the shared KPI | Headers, Home rail | 1 | no |
| Pulse feed | Home | 1 | no |
| Calendar view with month carousel; feed and calendar toggle | Home | 1 | no |
| Upcoming obligations container (deadlines as a list, never banners) | Home | 1 | no |
| New building setup runbook (9 steps, Stripe at step 6) | Home, Funds › Online payments | 1 | no |
| Return-to-case bar | Shell | 1 | no |
| Tile switcher: tiles as table of contents, one detail at a time | Funds › Income, Expenses, Planning | 2 | no |
| Invoice register as its own list | Funds › Income | 2 | no |
| Behind view with next runbook step per unit | Funds › Income | 2 | no |
| Spending decisions deck, oldest first | Funds › Expenses | 2 | no |
| Work orders list | Funds › Expenses | 2 | no |
| 2027 draft generated Oct 1 with Computed, Live, needs-you tags; three dues scenarios | Funds › Planning | 2 | yes |
| Reserve contribution lever (today, recommended, custom) | Funds › Planning › Reserves | 2 | no |
| Online payments: payouts, fees, fee pass-through, ACH toggle, what owners may pay, pause, invite check payers, failed-autopay retry | Funds › Online payments | 2 | yes |
| Owner Pay screen: pick items, pay ahead, bank account (ACH), switch autopay to bank | Me › My Unit › Pay | 2 | yes |
| Runs on its own and Done for you chip lines | Funds | 2 | no |
| Payroll board | Funds › Expenses | 2 | no |
| Duties and roles with Member at Large and every-owner expectations | Building › Obligations | 3 | no |
| Contracts tab | Building | 3 | no |
| Resale request runbook and unit certificate (10-business-day clock) | Me › My Unit, Board Room | 3 | yes |
| Unit owner leaderboard with privacy rule (first names and units; below-70 owners see only themselves; per-building switch) | Community › Overview | 4 | no |
| Building stewardship 90-day chart: building, board, owners | Community › Overview | 4 | no |
| Lift it this month; Who moved it | Community › Overview | 4 | no |
| Notices tab; five most recent on Overview | Community | 4 | no |
| Board decisions outcomes card | Community › Votes | 4 | no |
| Board votes cast on the case step and its Home card | Board Room, Home | 5 | no |
| 32 runbooks with on/off, expandable list (26 beyond the 6 production templates) | Board Room › Runbooks | 5 | yes |
| Units on this account; link a unit with deed check; My Units combined view | Me › My Account, My Units | 6 | yes |
| Keyword help search over guides, runbooks, rules and law | Me › Help & Support | 6 | no |

## 5c. Design rules the build must follow

A screen that breaks one of these fails its parity review even if its features are complete.

- Colour carries meaning on tiles: navy = act now; brand red = overdue or money to chase; dark teal = help, good standing, decisions; aqua = worth noticing; grey = reference. One emphasised tile per row; no two boards use the same colour sequence.
- The stewardship radar is one fixed widget: navy background, aqua line for the person, red for the building average. Leaderboards are dark teal.
- Alerts are tasks: anything urgent is a Home card; deadlines live in an Upcoming obligations container; no alert banners.
- Tiles are the table of contents: at most three sections per tab, tiles switch the detail, nothing important below the fold. Settings a person must manage sit on the page they govern, not behind an icon.
- Actions live on the card they affect: no duplicative page-level buttons; one place to manage each thing (vendors under Contracts, billing under Subscription).
- No disclaimers or explanatory footnotes on working screens; explanations belong in Help & Support.
- No AI features, no SMS, no profile photos.
- Honest labels and counts: "All" shows all or offers to; no wording implying inactive items.
- Navigation order Home, Building, Community, Funds, Board Room; avatar menu My Account, My Unit, User Management, Subscription, Help & Support, Sign out, with no sub-details.
- Headers carry the logo only, aligned labels, no search icon.
- Board votes are cast on the case or its Home card; Community shows outcomes.
- Chart lines are solid in brand colours; dashed is reserved for a projected or missing period.
- Phones carry the same colouring, with the stewardship card first on Home.

## 6. Implementation plan by phase

About 20 weeks, two front-end engineers, one back-end engineer, one designer. Each phase behind its own flag; each replaces production screens only when its parity checks pass. Critical path: 0, 1, 2, 5, 7 (about 17 weeks); 3 and 4 run beside it.

| Phase | Ships (flag) | Replaces | Parity checks | Exit gate |
| --- | --- | --- | --- | --- |
| 0 Foundations, wk 1–3 | Tokens and component kit; new shell; route aliases; flags ux2.*; parity harness; sandboxes | Nothing; old shell inside new chrome | Old routes resolve; top bar functions work | Shell live internally |
| 1 Home and Runbook engine, wk 3–8 | runbook_instances and card job; Home feed and calendar; KPI rail; Pulse; scoring job and Score model; Return-to-case bar; PM and portfolio feeds | Dashboard layouts; Active Case widget; setup widget | Every pill, KPI, alert, action item appears as a card or rail value with the same rule, linking into production screens | Board sees Home by default; old dashboard one click away for two weeks |
| 2 Funds, wk 6–11 | Overview; Income; Expenses; Planning; Statements; gear; Online payments; Pay; Payroll | Fiscal Lens; Payments manager; Fee schedule; LetterStream account connected; My Unit balance; Payroll | All Fiscal Lens actions with the same postings; Stripe smoke; invoice emails; payroll run | Treasurer on new Funds; ledger counts equal after a month-close rehearsal |
| 3 Building, wk 9–13 | Overview; Documents with wizard and archive; Obligations with Duties; Contracts; Directory with people, units, property log, tasks, scorecard, intercom | Building page; Association Team (4 tabs); Archives; Board Room Duties and Calendar | Mark filed; real upload; vendor flows; kanban; realtime; six report types | Secretary and manager on new Building |
| 4 Community, wk 11–14 | Overview; Notices; Meetings; Votes with election board and Board decisions; Requests; Amenities | Community Room; Meetings; Elections; Board Room Meetings and Votes | Meeting with notice; minutes approval; vote lifecycle; ballots and proxies; certification; amenity rules; SLA | Owners on new Community; calendar feed intact |
| 5 Board Room, wk 13–17 | Open; Inbox; Runbooks; Outbox with mailing; Archive; case workspace with vote, spending, upload steps; New case wizard | Issues; Board Room Communications and Daily Ops; Mailing settings | 40 situations create the same steps; every modal inline; LetterStream sandbox; board vote posts to Community | Board on new Board Room; old Issues read-only two weeks |
| 6 Me, wk 15–17 | My Account with units; My Unit and My Units; User Management; Subscription; Help & Support | Account; My Unit; User management; Subscription; Support; AI advisor removed | Invite; Chargebee; preferences persist; 2FA; support realtime | Every role on new Me |
| 7 Phones and cleanup, wk 17–20 | Phone boards for every sub-tab; delete old screens; remove flags and aliases | Legacy bundle | Full matrix on phone widths; bundle and Lighthouse not worse | Legacy removed; matrix archived |

Per phase: build components against existing stores; wire the flag so both screens read the same data; run the module's matrix on the sample building and one real tenant copy; flip one role, then all. No phase deletes a production screen; deletion is phase 7.

## 7. Parity matrix and release approach

Twenty flows that touch money, deadlines or an integration run on every phase (production steps → redesign steps; must be equal after): record a check payment 3→3; owner pays by card 4→3; autopay setup 4→3; refund 3→2; approve and pay a bill 3→2; decide a spending request 4→2; change reserve contribution 3→2; statement packet 3→2; mark filed with proof 3→2; schedule meeting with notice 5→4; approve minutes 3→2; owner vote lifecycle 6→5; cast a board vote 3→1; create a case 4→4; send a demand letter 4→3; submit and answer a request 3+2→3+1; post a notice 3→2; invite a user 3→3; change tier 3→2; resale certificate (new) →1.

Release: flags per module, internal first, then one pilot building per role; parallel run for one month close and one meeting cycle per module with nightly checksum comparison; additive data migration only (three tables, two idempotent backfills); rollback is the flag; design canvas and parity map updated with every phase.

## 8. Risks, open decisions, sequencing

Risks: Runbook engine slip (per-module card queries as fallback); store drift between readers (no schema changes, nightly checksums); step regressions in redrawn gaps (matrix blocks the flip); sandbox versus live differences (one live $1 transaction per integration on the pilot); resident paths (My Unit and Pay flip last, /my-unit aliased a month); leaderboard privacy (first names and units only, below-70 owners see only themselves, per-building switch).

Open decisions: Ledger as a tab (recommended yes); owner leaderboard audience (all owners, per-building switch); Association Team tabs under Directory or an Operations tab when a manager seat exists; card-fee pass-through default off; phone boards per phase.

Sequencing: 0 and 1 first; 2, 3, 4 in parallel; 5 after 2 and 4; 6 after 2 and 5; 7 last.
