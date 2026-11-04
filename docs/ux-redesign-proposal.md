# ONE two UX Redesign Proposal: Guided Governance

Visual mocks (phone and desktop artboards, parity map): https://claude.ai/artifact/Gf5uXf815aYh6Q8hs9K9oo

## Thesis

A volunteer board member opens the app and sees one next step. The system does the property management. Nothing in production is removed; every module, tab, action and automation is kept, but it is reached through the thing people actually do: a card in the Home feed that the Runbook generated, that the existing module records, and that the behavior engine scores.

Three mechanisms carry this:

1. **Runbook, the invisible guide.** Obligations, filings, playbook steps, fiduciary alerts, approvals, votes, notice windows and request SLAs already exist in Board Room, Cases and Fiscal Lens. The Runbook runs them as one scheduler, assigns each step to the right role (obligation role field plus the DACI matrix), and emits one card per step.
2. **Home feed, the single pane.** Replaces the KPI dashboard. One critical banner only when something is critical, then cards in priority order (same ranking rules as today's "Your Action Items"). Tap a card, do the step in a focused sheet, get points. Full modules are one tap away.
3. **Scoring, training in disguise.** Each card says what it scores: Timeliness, Compliance, Oversight, Reach or Impact (the stewardship score, per `ONE_two_score_behavior_mapping.xlsx` and handoff 20). Points land only when a module records the action, never on a bare checkbox, and every event carries a receipt the user can read and contest. The building score (collection rate, document completion, quorum, building oversight, engagement) is a separate KPI and stays on the Building header.

### Where the Runbook lives

The Runbook is one scheduler seen from three places:

1. **Home, as cards.** Each obligation, step or approval that needs a person is a card in that person's "Up next". This is where most board members meet it.
2. **Home, the "Runbook · this month" strip** under the Stewardship card: obligations this month, how many done, the board checklist score. Tapping it opens the full Runbook.
3. **Building › Governance › Runbook.** The whole calendar: this month, by role, by category, filings, ongoing, all 42. Add a filing, mark filed, attach proof, sources, auto-verified items. This is today's Governance Calendar tab plus the orphaned Compliance page, kept whole.

### The Stewardship card on Home

A navy callout card (board and resident Home, phone and desktop): kicker "STEWARDSHIP" with the band under it, "Good Standing" top right, a radar with a hairline pentagon, the owner's shape in brand cyan over the building mean in brand crimson, the composite as a 60px number in the center, five axis labels with numbers (Timeliness, Impact, Compliance, Oversight, Reach, clockwise from 12), footer "Building avg 84 · +2 this month". Radial scale starts at 60. No percent signs, no vertex dots, no legend. Reference values: owner 94 / 91 / 90 / 90 / 80, composite 91 Excellent; building 87 / 86 / 80 / 80 / 75, mean 84.

## Information architecture

| Today (board member) | Proposed |
|---|---|
| Dashboard | **Home**: feed of Runbook cards, approvals, votes, meetings, alerts, the Stewardship card, the "Runbook · this month" strip, Pulse, setup checklist, advisor |
| Board Room › Daily Ops, Issues | **Cases**: all open cases and playbooks, step chains, decision trail, notices, bids, budgets |
| Fiscal Lens, Fee Schedule, Payroll & 1099s, Mailing card | **Money**: three plain numbers up top, every Fiscal Lens table under "Details" |
| The Building, Board Room, Association Team, The Archives | **Building**: Overview · People · Governance (Runbook, duties, meetings, votes) · Documents · Units · Comms |
| Avatar menu, Account, Subscription, Support | **Me** (avatar, top right): stewardship radar, leaderboard, account, notifications, subscription, help, role preview |

Residents: Home · Pay (My Unit) · Community · Building.

Mobile: four bottom tabs, no "More" overflow. Desktop: the same pages with a top bar and a right rail; layouts are flex-wrap so a single page serves both.

## Design language

Keeps the brand: DM Serif Display for headings, DM Sans for body, teal `#155E75` and red `#D62839` from the mark, navy `#0D1B2E` for the bar. Red is reserved for "needs you now". White cards on a warm grey ground `#F5F6F4`, 1px lines `#E3E6E2`, 16px radius, no shadows, gradients, left-border stripes or emoji. Dimension chip colors: Timeliness teal `#155E75`, Compliance sage `#3A663A`, Oversight plum `#4F46A8`, Reach amber `#9A5B00`, Impact navy `#0D1B2E`. On the navy Stewardship card the owner's shape is brand cyan `#A5F3FC` and the building's is brand crimson `#D62839`, by explicit decision. Touch targets 44px or more.

## The engine

1. **Triggers**: obligations calendar and filings (42 DC items), case step becomes current (32 playbooks), fiduciary alerts, work-order and unit invoices, spending requests (3-vote rule), minutes approval (majority), meeting notice windows (48h, 10 to 60 days), resident requests (14-day rule), elections, insurance and contract expiry, maintenance calendar and reserve thresholds, setup checklist.
2. **Assignment**: obligation role and DACI driver. Others see "Waiting on others" with a nudge.
3. **One card, one sheet**: only that step's checklist, documents and primary action. "Full case" and "Details" always available.
4. **The module records**: invoice approval posts to the ledger, notices go through the mail service, votes write to the election.
5. **The engine scores**: a stewardship event is logged with a receipt; toast, Pulse line and leaderboard update.

| Dimension | Owner / board max | What counts |
|---|---|---|
| Timeliness | 35 / 30 | Dues and assessments paid by the due date (full, half for 1 to 7 days late, quarter for 8 to 30, none after); case and communication replies by their date; payment plans count as on time |
| Compliance | 35 / 30 | Snapshot: required documents current (25 of 40), required actions done (10 of 40), no open violation (5 of 40; half credit at cure, full after 90 days) |
| Oversight | 10 / 20 | Owners: acknowledged budget, statements, reserve study, audit requests; attended the annual meeting; voted on money ballots. Board: 70% board checklist (filings on time, insurance renewed, month closed in 15 days, minutes in 30, elections certified in 14, reserve study current, budget adopted by its date, governance items) plus 30% own acknowledgments |
| Reach | 10 / 10 | Replied to response-required announcements and surveys inside their SLA; boards may publish at most 8 a month |
| Impact | 10 / 10 | Ballots cast over eligible elections (6) and meetings attended over up to 4 held (4) |

Composite = Timeliness + Compliance + Oversight + min(20, Reach + Impact). Bands: Excellent 90, Good 75, Watch 60, below that Needs attention. Good Standing is separate and bylaw-defined. Rolling 365-day window. The crimson line on the Stewardship card is the mean of every owner's dimension percent, not the building score.

## Feature parity map

Kept = same screen and actions, restyled. Repackaged = same capability reached from a new place. Card = also surfaced in Home when it needs someone. Fix = production gap closed.

### Shell
- Top nav, hamburger, bottom nav with More flyout → Home · Cases · Money · Building, plus Me. Repackaged.
- Avatar menu (My Account, My Unit, User Management, Subscription, Help & Support, Sign Out) → Me; User Management to Building › People. Kept.
- Sync indicator, tenant and role, admin View-As, demo banner → top bar, Me › Preview as role. Kept.
- Onboarding setup widget (6 steps) → Home cards. Card.
- Active Case widget → "Return to case" bar. Repackaged.
- AI Advisor (disabled today) → "Ask the advisor" card, via edge function. Fix.
- Help & Support chat, How This Works → Me › Help. Kept, chat gets a phone layout.
- Account settings → Me. Fix: notification prefs persist, 2FA wired.
- Subscription management → Me › Subscription. Kept.
- Auth flows (welcome, login, 3-step signup, invite, demo lead, reset) → unchanged. Kept.
- Portfolio shell, Admin console → unchanged; portfolio gains the Home feed grouped by building.

### Dashboard
- Header grades → Home greeting, Board Health chip in Building. Repackaged.
- Attention pills → Home banner and cards; tab counts. Card.
- KPI cards → desktop rail "Building at a glance", Money numbers. Repackaged.
- Fiduciary alerts → critical banner; list under Building › Governance › Alerts. Fix: three rules that never fire read live data.
- Your Action Items → Home "Up next" with the same ranking. Card.
- Delinquency aging, budget alerts → Money; cards on threshold. Card.
- Upcoming meetings, recent activity → Home cards and Pulse. Repackaged.
- PM layout → same engine for the PM role. Card.
- Resident layout → Resident Home. Repackaged.
- Auto-reports (unmounted) → Building › Documents › Reports. Kept.

### Board Room
- Header tiles → Building › Governance counts. Repackaged.
- Duties & Roles → Building › Governance › Duties and roles. Kept.
- Governance Calendar / Runbook (sort, role filter, filings, add filing, mark filed, proof, workflow steps, ⋮ actions) → Building › Governance › Runbook, also opened from the Home strip; items due become cards. Fix: step completion persists; Dashboard and Board Room scores unify.
- Auto-verified items, satisfying-action chips, Runbook sources, meeting compliance score (orphaned page) → restored. Fix.
- Meetings (schedule/edit with vote detection and scope, send notice, attendees, minutes, documents, link/create case, linked votes, minutes approval) → Building › Governance › Meetings; notices and approvals as cards. Fix: "+ Case" links the meeting; per-meeting Record vote restored.
- Votes & Resolutions (full lifecycle, ballots, proxies, compliance checks, timeline, discussion, resolution) → Building › Governance › Votes; Community › Votes for owners; "your vote is needed" cards. Fix: cases from votes get real steps.
- Communications (feed, templates, compose panel, log, quick announcement) → Building › Comms as one outbox (see communications-module-proposal.md). Repackaged.
- Daily Operations → Cases. Repackaged.

### Cases
- Lists, filters, search → Cases tab. Kept.
- New case wizard (10 categories, ~40 situations, custom, approach choice, DACI, move fields) → Cases › New case; categories grouped Money/Building/People/Board; all situations kept; every case starts step by step, legal paths added via Add approach. Repackaged.
- Case shell and step content (all panels, checklists, quick actions, inline tools, annual budgeting steps) → case workspace and phone step sheet. Kept.
- All modals (vote, document, approach, meeting, invoice, close, delete, work order, send notice, comm) → step actions and More menu. Kept.
- Hold, reassign, link letter/invoice, add bid, decision trail, spending and conflict panels (unreachable today) → surfaced. Fix.
- Request inbox → Cases › Requests; Community › Requests; reply-due cards. Card.
- Owner case view → Resident Home card, Community › My requests. Kept.

### Money (Fiscal Lens)
- Header KPIs and Overview → three numbers plus health chip; rest under Details. Repackaged.
- Unit Ledger (Stripe bar, all actions, filters, unit detail) → Who owes what. Kept.
- Chart of accounts, GL mapping, General ledger → Ledger and accounts. Kept.
- Work orders and unit invoices → Work orders and invoices; monthly "Approve invoices" card. Card.
- Budget, Reserves → Budget, Reserves. Kept.
- Spending decisions → Spending decisions; each pending vote is a card. Card.
- Statements and tax forms → Statements and tax forms. Kept.
- Fee schedule, Payroll and 1099s → Money. Repackaged (residents keep the read-only fee schedule under Building).
- Mailing settings → Money › Online payments and mailing card; Building › Comms › Delivery. Repackaged.

### Building (The Building, Association Team, Archives)
- Details, Contacts → Overview, People. Kept.
- Assets, maintenance calendar, capital planning → Overview › Assets and maintenance; due items as cards. Card.
- Vendors, bids, contracts → Overview › Vendors, bids and contracts; bid comparison also inside case steps. Fix: broken vendor deep links.
- Legal & Bylaws → Documents › Legal and bylaws. Fix: real file upload.
- Insurance → Overview › Insurance; renewals as a Runbook case. Card.
- Units roster → Units. Kept.
- Property log, Task tracking, PM scorecard, Intercom, User management → People. Cards for assigned tasks and quarterly reviews. Fix: Remove member works.
- Mocks: Home (phone and desktop), Runbook task sheet, delinquency case, Money, Building hub, Me, Runbook calendar, resident Home, scoring explainer and the parity map are on the canvas linked at the top.
- Archives reports and annual archives → Documents; "Create the FY archive" card. Card. The 26-type report catalog in code is mounted.

### Community and My Unit
- Announcements, Requests, Meetings, Votes, Amenities → Community; Resident Home cards. Kept, Card.
- My Unit (link units, balance, Stripe checkout, autopay, assessments, fees, invoices, documents, move history) → Pay tab; Me › Linked units for board. Fix: autopay state persists.

## Production gaps found during the audit

- Runbook step completion is React state, lost on reload, and separate from the persisted compliance completions the Dashboard scores.
- Three fiduciary alert rules are wired to constants and never fire.
- Two communications stores; the legacy log is only listed on an orphaned page.
- Orphaned pages hold features missing from the live app: meeting-level vote recording, link vote, auto-verified runbook UI, Runbook sources, meeting compliance score.
- "+ Case" from a Board Room meeting does not link the case; cases created from an election get no steps; the runbook "draft a communication" prompt opens blank.
- Several built case modals are unreachable (hold, reassign, link letter, link invoice, add bid); the decision trail is recorded but never shown.
- Notification preferences and 2FA on Account Settings are inert; autopay enrolment state resets on load; Remove member has no handler in live tenants.
- Vendor deep links, Assets "Go to Reserves/Budget" and the Payroll "GL Posted" link navigate to the wrong place.
