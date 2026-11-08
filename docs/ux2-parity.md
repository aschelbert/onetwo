# UX2 · container parity with the design boards

The design canvas (Design › "ONE two UX redesign", `project/*.dc.html`) is the
spec for every container. This pass replaces the production components that
were still mounted inside the redesign with the boards' own containers, backed
by the same stores, so staging shows the designed widgets rather than a
re-skinned legacy screen.

## Primitives (`src/ux2/components/Table.tsx`)

`Table / Th / Td / Cell` (white list block inside a grey card, 12px muted
headers, hairline rows), `RowMenu` (the round ··· with a small menu),
`Bar` (8px bar with the "should be here by now" mark), `KV` (key/value
line), `SearchInput`, `Why` (the small-print explanation under a list),
`Field` + `INPUT` for the inline forms that replace modals. `PillTabs` has a
`surface="white"` variant for in-card filters; `TileSwitcher` has a
`between` slot for content that sits under the tiles and above the detail.

## Funds

- **Income** · Unit ledger table (filters, search, record a payment / add a
  fee / add a special assessment inline), Behind card (table, the three
  runbook-step cards, aging line), Invoices card (filters, new invoice
  inline, status chips). The rules strip and the Stripe card sit between the
  tiles and the selected card, as on the board.
- **Expenses** · Bills table (filters, approve, receive an invoice inline,
  approve all within budget), Spending decisions deck (one request at a time
  with funding-source chips, the limit note and the navy "Know before you
  decide" panel; "Deck is clear" when empty), Work orders table (create
  inline, stage actions), Vendors and contracts row. Payroll opens from that
  row.
- **Planning** · Budget against actual table (biggest / over / all, "where
  the dues go" strip, bars with the expected mark, edit the amount inline),
  Next year draft (three dues options, computed / changes / where it stands
  panels, done-for-you chips), Reserves card (asset table, approaching
  replacement notice, the monthly contribution lever with today /
  recommended / another amount, add an asset, contingency fund).

## Board Room

- **Open** · one pill group (All open, My tasks, Overdue, Funds, Building,
  People, Board) with search, the board's table columns, priority dots.
- **Inbox** · Needs you with Assign (inline: pick a board member, becomes a
  case on the resident-request runbook) / Acknowledge / Reply (inline reply
  posts a comment through the issues store), the requests table with a
  Reply button per row, the five-step "Every request runs the same runbook"
  card. The production Issues page is no longer embedded here.
- **Runbooks** · heading with the With an open case / All 32 pills and the
  legend, one card per runbook with a case open (visibility chip, step
  track, labels), the All runbooks table with On / Off · manual chips.
  No tiles.
- **Outbox** · Needs you (meeting notices and drafts), Alerts card, the
  Drafts / Sent / Scheduled / Templates / Older letters pills, Drafts and
  Sent tables (edit and send inline, view and resend), Templates (edit
  inline) and How a letter goes out. "New letter" in the module header
  composes from a template. The production Communications tab is no longer
  embedded here.

## Building

- **Overview** · heading with Edit details / Add asset (inline forms),
  Needs you, Details and Insurance cards side by side (key/value lists,
  the renewal runbook row), Assets and maintenance table with the next
  vendor visits, Mailing address and contact preferences. No tiles, no
  embedded Building page.
- **Documents** · search and Upload (inline), Needs you, group pills (All,
  Governing, Policies, Insurance, Reserve, Reports, Minutes, Contracts) with
  the Everyone + Board / What owners see switch, one grouped library table
  (Download / Open / Add file inline), Settings card. No embedded Archives
  page. The library follows a catalogue of the documents a building should
  have (`features/building/documentCatalogue.ts`): one row per document,
  matched by name ("1302 R St NW_Bylaws" and "Bylaws (amended 2019)" are
  both Bylaws), extra copies collapsed into the newest one with a file, and
  a Missing row with Add file for each required document not on file
  (declaration, bylaws, rules, plats and plans, collections policy, reserve
  study). This is where documents setup didn't cover show up afterwards.
  Versions: a document's current version is its newest file that isn't
  archived. Upload (and New version / Add file on a row) asks which
  documents the file is (one file can be several: bylaws holding the rules
  and a pets policy are filed once under each), whether it's the current
  version or a past one (history, replaces nothing), and, when it replaces a
  current file, whether to archive the old one (kept under Earlier) or
  delete it. Earlier lists past versions with Make current and Delete. The
  form and the earlier versions open above the table, at full width.
- **Obligations** · This month / By role / By category / Filings / Ongoing /
  Duties and roles pills, four compact counts, the month's table with
  expandable rows (why it matters, if missed, how to; Mark done and Mark
  filed with proof inline), the duties view with the three duty cards, Who
  carries what, one card per officer, the Member at Large and Every unit
  owner cards. No embedded Governance Calendar or Duties page.
- **Contracts** · heading with Request bids / Add a vendor (inline), Needs
  you (Countersign opens the renewal inline; Turn on bids flips the runbook
  switch), vendors table with the bids switch, Bids and Paperwork on file
  cards. No tiles, no embedded Vendors tab.
- **Directory** · heading with Export list (CSV) / Invite (inline), section
  pills with search, Needs you (pending invites, units on paper notices),
  Units and owners table with role chips, Board (add / edit / remove
  inline, stewardship chip), Management and counsel, Staff, Emergency
  contacts, Tasks and property log. No embedded Units tab or contacts page.

## Community

- **Overview** · unchanged layout, plus the Who moved it this month card
  beside Lift it this month, and the leaderboard in two columns.
- **Notices** · Alerts strip, New notice (inline), Pinned card (Open /
  Unpin), category and search pills, three-column notice cards (author,
  audience, read count, comments; Open / Edit / Pin, Delete in the row
  menu), How notices work. No embedded Community page.
- **Meetings** · Schedule a meeting (inline), Next meeting with notice /
  agenda / RSVP / room cells, filter pills, the Schedule table, Agenda
  (add and edit items inline), Approvals and Attendance. No embedded Board
  Room meetings tab.
- **Votes** · Record a proxy / Open a vote (inline), Open owner vote with
  the ballot, Board decisions, Election (nominate inline), Proxies and
  quorum, Ballot preview, Results and certification (certify inline). No
  embedded Elections page.
- **Requests** · Make a request (inline), Your requests with the step track
  and the thread, What happens next, Your past requests, Building-wide
  requests with Open / Resolved pills and Upvote. No embedded Issues page.
- **Amenities** · All amenities / My reservations / Calendar /
  Notifications / Approvals pills, one card per shared space with its rules
  as chips, Settings (board, inline) and Reserve (inline), the Approvals
  card (Approve, Deny with a reason) and the This week strip. No embedded
  Amenities tab.

## Me

- **My Account** · This month, On the board, By dimension and Board
  leaderboard, Profile (inline edits), Preferences, Notifications toggles,
  Units on this account, Switch building, Danger zone. No embedded Account
  Settings page.
- **My Unit** · Balance / Autopay and payment methods / Resale ready tiles
  (packet checklist), the unit card, Dues and fees this year (month boxes),
  Statements and receipts, Unit details, Documents for this unit (Upload),
  Move history (Report a move inline), Requests from this unit, Owner
  responsibilities, Link a unit. No embedded My Unit page.
- **User Management** · People with access / Invites / Roles tiles, Members
  table (role chips, Change role / Reset password / Resend welcome / Remove
  in the row menu), Invite (one person or bulk, inline), Audit log,
  Permissions matrix. Live tenants read `tenant_users` and `invitations`
  and send through `send-invite`; demo tenants use the auth store. No
  embedded User Management page.
- **Subscription** · Plan / Add-ons (toggles) / Billing (interval pills,
  Portal) tiles, Plans (Move up / down), Invoices table, Who can change
  this, Cancel (type the building's name). Live tenants call
  `manage-subscription` and `chargebee-portal`; the tab now also shows for
  board members in the demo. No embedded Subscription page.
- **Help & Support** · Find an answer (search with example chips), Runbooks /
  How ONE two works / Guides row, Contact us (open threads from the admin
  project; Reply mounts the live thread), Guides list, Send feedback or
  start a thread (inline; writes `support_threads` and `support_messages`),
  Legal references, Release notes, Legal. The support thread UI is mounted
  only on Reply.

Primitive fix: `Th` is now `relative` so a visually hidden header label
stays inside the table's scroller instead of widening the page on phones.

## Funds · Statements, Online payments, Accounts and ledger

- **Statements & taxes** · Needs you (the last closed packet, missing
  W-9s), What the building owns and owes (balance sheet, expands to the
  full one), What came in and went out (income statement, expands; Budget
  variance report inline), Monthly statement packets (year pills, Download
  as a file, Send to owners posts a financial notice, Month close runbook),
  Taxes and filings (1120-H draft, the DC return, 1099s, annual report,
  each expanding inline), Accountant access (Manage access, Export the
  ledger). No embedded Reports page.
- **Online payments** · Collected online / Payouts / Fees tiles (pass card
  fees switch), Recent payments table with refund in place, the building's
  Stripe account card (Connect / Finish setup through
  `connect-stripe-account`, dashboard, pause), What owners can pay here
  switches, and before setup the Get paid online runbook with Have ready /
  What it costs / After it is on. No embedded Payments manager.
- **Accounts and ledger** · one page: Needs you (bills invoiced but not
  paid), Ledger (view pills, search, quick entries and custom entry posting
  through the store, row menu), Chart of accounts (add account / section,
  rename in place), Where things post (GL mapping, Save), Fee schedule
  (dues tiers, late fee, every fee with an On switch and inline amount
  edit), Billing rules, Bank and payments, and the Mailing card panel at
  the foot. Section deep links scroll to their card. No embedded Chart of
  accounts, General ledger or Fee schedule pages.

## Board Room · Archive

- Closed in the last 60 days, year pills with search and Export, type
  pills from the case categories (Inbox for requests, Letters otherwise),
  the read-only table with the decision trail (board vote tallies) and a
  per-row export, Show the other N, Export all (CSV index plus one file
  per item) and How long it stays.

## Module header

Every module (Funds, Board Room, Building, Community, Me) uses
`ModuleHeader`: title and subtitle with status chips at the right; then the
section tabs with the calls to action right-justified on the same row, to
the left of any navigation icon (the Funds gear). A tab adds its own buttons
there with `<HeaderActions>`, which portals into the header so the button
keeps its inline form in the tab. Tabs carry no title or description block
of their own. Header buttons are compact (40px, 13px text) to match the
tabs; if a row is ever too narrow, the button group wraps under the tabs,
still right-aligned.

## Page descriptions and the Community overview

- Module and tab descriptions no longer sit under the title or the tabs.
  They live behind a superscript (i) beside the module title, opening on
  hover, focus or tap; the popover anchors to the title block so it never
  widens a phone page. Tab-specific notes (owner versus board views,
  Amenities approvals, Building's per-tab descriptions) are part of it.
- Community › Overview follows the board: Recent notices in the left
  column; Building stewardship as a rolling chart (whole building, board,
  owners; 12 months / 90 days / 30 days, hover for a day's values) with
  Lift it this month, Who moved it up and Who is pulling it down inside the
  same card; the unit owner leaderboard on dark teal with band and score,
  the viewer's row outlined. The trend and movers come from
  `src/ux2/score/trend.ts`: a point is each person's score from the year of
  events before that day, averaged per group; a mover is one event in the
  last 30 days, sized by how much it changed that person's score. Owners
  pulling it down are named only to the board; others see the unit.

## The case dock, Ops and the Archive

- **Case dock** (`src/ux2/shell/CaseDock.tsx`, `caseDock.ts`) replaces the
  "Return to case" bar, which only appeared after a few `/financial` step
  buttons. Opening an open case makes it your active case however you then
  leave. On desktop the dock floats at the bottom at the page's content
  width and expands upward with the current step's checklist (ticks record
  on the case through `toggleCheck`, or "Mark step done" when the step has
  no checklist) and up to two other open cases to switch to. On phones and
  tablets it is a chip above the bottom bar that opens a sheet with the
  same content. It hides on that case's own page, goes away when the case
  closes or its last step is done, and Dismiss hides it until the case is
  opened again. Pages keep extra bottom space while it shows. The dock's
  memory resets when a real building loads.
- **Back returns to where you were**: the dock remembers, per case, the step
  you had open and the checklist item you last used an assist on. Back opens
  the case on that step (full screen on phones), scrolls to the item and
  marks it for a moment. The browser's back button lands there too. The
  dock's checklist shows that step while it is still to do.
- **Board Room › Ops** is the former Open tab (same URL id, `open`).
- **Building › Archive** is the former Board Room Archive, shown to the
  board and manager only. `/boardroom?tab=archive` and `caseTab=archive`
  redirect there; a closed case still opens in the Board Room's case frame.
- **Case workspace on phones and tablets** (below 1080px, `useNarrowScreen`):
  one column with the case summary, the step list and the case's sections;
  tapping a step opens it full screen with the same header, guidance,
  checklist and actions as the desktop right column, plus All steps,
  previous and next. The view is portalled to the page body so the sticky
  top bar cannot cover it. Desktop keeps the two columns.

## Case checklist assists

Every checklist item in a case step carries one or more assists, so an item
is never just a box to tick (`src/features/issues/checkAssist.ts`):

- **Review in place**: a panel opens under the item with the information to
  check. Budget items open the budget drafter (operating lines by category,
  reserve contribution, contingency, per-unit impact); reserve items open the
  reserve study; others show financials, the unit ledger, delinquency, fees,
  the allocation calculator, insurance, vendors, documents, the owner, board
  quorum, counsel, meetings, assets or filings. Each panel links to the module
  where the record lives.
- **Do it here**: the step's tools (send a letter, board or owner vote, attach
  a document, work order, invoice, meeting, note).
- **Go to the module**: a deep link; the case dock follows you back.
- **Official site**: DC agencies and courts, for work done outside the app.

Items are matched by ordered rules on the item's text, then on the step's
title. `src/__tests__/checkAssist.test.ts` fails if any item in any
situation's workflow falls through to the generic note-and-attach fallback.

## Building setup (documents first)

Replaces the amber "Set up your building" widget (`OnboardingSetupWidget`,
`features/setup/setup-steps.ts`, both removed). No AI and no outside service:
everything is read in the browser, so a document costs nothing to read.

- **Home card** (`ux2/setup/SetupCard.tsx`): plum, at the top of Home while
  the tenant is `onboarding` and not live, for everyone but residents. One
  next action, progress, the five steps. "Hide for now" leaves a chip.
- **/setup** (`ux2/setup/SetupPage.tsx`, `?step=documents|review|finish`;
  listed in `vite.config.ts` APP_ROUTES and the `vercel.json` rewrites):
  1. *Documents* (`features/setup/readDocument.ts`):
     - PDFs: text pulled out with pdf.js (`pdfText.ts`), then read with rules
       (`extractText.ts`) for settings (late fee, grace period, due day,
       quorum, notice, annual meeting, board size and terms, fiscal year,
       spending limit, assessment cap, owner vote, fines, pets, rentals,
       units, management company) and lists (unit/ownership tables,
       officers, budget lines, reserve components, an insurance declarations
       page). Lists are read only from documents of the matching kind.
     - Clauses: bylaws, declarations and rules are split into their
       articles and sections ("ARTICLE IV", "Section 4.3 Powers and Duties")
       and each section is sorted by its heading into board duties (powers,
       qualifications, removal, conflicts), an officer's duties (President,
       Vice President, Treasurer, Secretary), owner obligations
       (maintenance, insurance, compliance) or rules for residents (pets,
       leasing, noise, parking, alterations). Procedure sections (number,
       meetings) are left out. Accepted clauses are saved to the
       `governing_clauses` table (migration 034: everyone in the building
       reads them; the board, the manager and the account owner manage
       them), loaded with the building, and shown under Building ›
       Obligations › Duties and roles, each with its section and page.
       Clauses accepted in a browser before the table existed are uploaded
       the next time the building loads.
     - Pasted text: the same rules ("Paste text").
     - Spreadsheets (CSV, Excel via `read-excel-file`): matched by their
       column headings, in many spellings (`importSpreadsheet.ts`): owner
       lists, board rosters, budgets.
     - Word files, photos and scanned PDFs with no text are filed only.
     - Every file is filed in Building › Documents under its catalogue
       name (Bylaws, Public offering statement, Plats and plans); a
       document the building already has gets the file as a version, and
       the same file is never filed twice, so adding again or Start over
       doesn't duplicate it. The type can be changed, which moves the file
       and reads the text again with that kind's rules. Remove takes the
       file back out of Building › Documents and restores what it replaced.
     - Under each document: Filed as (Change opens the same document
       picker as Building › Documents), "Also in it?" suggestions from its
       text (a rules article, pets or rentals clause, late-fee rules, a
       reserve schedule), each confirmed with a tap, never filed on a guess,
       and Past version (history, left out of what's read in). What a file
       replaced is archived, with Delete instead.
     - Optional · vendor contracts: vendor, what for, start and end dates,
       yearly amount, renews itself, file; added to Building › Contracts
       with the vendor.
     - Optional · past documents: past minutes, budgets, financial
       statements and audits, tax returns, earlier reserve studies. Each is
       filed as an earlier version (with its year) and not read in.
  2. *Review what we found* opens with an assessment: for each document,
     which of the requested documents its content covers (bylaws often
     hold the owner list as an ownership exhibit, and the rules as use
     restrictions), with counts, pages, and where each part goes in the
     app (`setupModel.coverage`). Step 1's checklist credits the same
     content ("Found in Bylaws.pdf (p.38): 24 units"). Each section says
     where its accepted items go, and every saved confirmation links there
     (`pathFor`). Governance settings with no field of their own (quorum,
     notice, meeting month, board size and terms, pets, rentals, fines)
     are saved as shared clauses on Duties and roles.
     Readings merge into items by what they
     describe (`setupModel.buildItems`); two documents that disagree are a
     choice, a doubtful reading is flagged. Each item shows the page and the
     sentence (or the row) it came from. Matching items accept in one click.
     Accepting writes through the stores' own actions (`applySetup.applyItem`).
  3–5. *Fill the gaps · Invite people · Go live*. Units can be added by
     hand right here (`UnitsEditor`): one at a time, a range (101–112, 1A–1F),
     or a pasted list in any column order (`unitEntry.ts`), then edited in a
     table or removed, with the ownership total checked against 100%.
     Invite people takes any email with a role (owner, resident or tenant,
     board member with a seat, property manager, staff) and a unit, one at a
     time or pasted (`invites.ts`); the list is kept until sent and marked
     sent, the board roster joins the same send, an owner's email fills an
     empty unit email, and go-live doesn't re-invite anyone.
     Only what is missing,
     answered in place (address, units, monthly assessments, a board member,
     due day and late fee, opening balances, a budget template, owner
     emails). Board invites go through `send-invite`; owners are invited at
     go-live (a visible checkbox). Go live needs four essentials.
- The `read-setup-document` edge function from the first version is retired:
  its source is removed and the deployed copies (staging, production) are a
  stub that returns 410 and calls nothing. Delete it from the Supabase
  dashboard when convenient.
- Setup state (`features/setup/useSetupStore.ts`) is per browser and resets
  when a different building loads.
