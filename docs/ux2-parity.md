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
  page.
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
