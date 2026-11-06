# UX2 phase 2 — Funds

Phase 2 ships the redesigned Funds module behind the `funds` flag. With the
flag off, `/funds` and `/financial` render the production Fiscal Lens and
`/my-unit/pay` falls back to My Unit, unchanged.

Turn it on for one browser with `?ux2=shell,home,funds`, or for a deploy with
`VITE_UX2_FLAGS=shell,home,funds`. `?ux2=none` turns it off again.

## How it keeps parity

Every tab opens with a tile row that is also its table of contents (the tile
switcher). The detail under the selected tile is the **production component
that owns the records**, mounted as is: Unit Ledger, WO & Invoices, Spending
Decisions, Budget, Reserves, Statements & Tax Forms, Chart of Accounts, General
Ledger, Fee Schedule, Mailing settings, Payroll, the Payments manager and the
owner's balance tab. So every posting, invoice email, Stripe Connect call,
Checkout session, refund and payroll run is the code path production uses
today. The redesign adds the numbers on the tiles, the new lists the design
called for, and the deep links between them.

| Funds tab | Tiles (switcher) | Detail under each tile | Production component |
| --- | --- | --- | --- |
| Overview | This month · This year · Ahead | links into the tabs; "Done for you" chip lines; the next twelve months of money events | — |
| Income | Collected · Behind · Invoices | unit ledger · behind list with the next step per unit · invoice register | `TheUnitsTab` (fiscal) |
| Expenses | Bills to approve · Spending decisions · Work orders | WO & Invoices · Spending Decisions · work-order status list; Payroll card opens on demand | `FLWorkOrders`, `FLApprovals`, `PayrollTab` |
| Planning | This year · Next year draft · Reserves | Budget · three computed dues options · reserve contribution lever + Reserves | `FLBudget`, `FLReserves` |
| Statements & taxes | Owns · Net income · Packets | Statements & Tax Forms | `FLReports` |
| Online payments (button) | Collected online · Invoices · Refunds | the Payments manager: Stripe Connect, send invoice, refund, bulk assessment | `PaymentsManager` |
| Accounts and ledger (gear) | Chart of accounts · Ledger · Billing rules · Fee schedule · Mailing card | GL mapping lives inside Chart of accounts | `FLChartOfAccounts`, `FLGeneralLedger`, `FeeScheduleTab`, `MailingSettingsTab` |

Owner side: `/my-unit/pay` (`PayPage`) wraps `MyBalanceTab` with the unit
picker and the balance, dues and open-invoice tiles. Stripe Checkout, autopay
and the billing portal are the same calls.

## What this restores

Two screens existed in the codebase but were not mounted anywhere, so their
features could not be reached in production:

- **Payments manager** (`src/features/building/tabs/PaymentsManager.tsx`): the only refund UI, plus bulk assessment and send-invoice. It is now Funds › Online payments. This is the "refund 3→2" parity flow.
- **Billing rules**: automatic billing toggle and late-fee settings (`setAutoBilling`, `setLateFeeSettings`) had no UI. They are now Funds › gear › Billing rules, with the due day.

The reserve contribution editor lived only on Budget; Planning › Reserves now
has the lever (today / recommended / custom) on the same store action,
`setAnnualReserveContribution`.

## Deep links

`/funds?tab=<tab>&section=<section>`. Legacy Fiscal Lens tab ids are accepted and mapped:

| Legacy | Funds |
| --- | --- |
| `dashboard` | overview |
| `units` | income › ledger |
| `workorders` | expenses › bills |
| `approvals` | expenses › decisions |
| `budget` | planning › budget |
| `reserves` | planning › reserves |
| `reports` | statements |
| `coa`, `ledger` | settings › accounts, ledger |

Home cards set the financial store's tab and navigate to `/funds?tab=…`, so
the link works with either Funds page.

## Numbers on the tiles

`src/ux2/funds/metrics.ts` is pure and tested: the Fiscal Lens health formula
(unchanged), collected this month by method, who is behind with the oldest
unpaid charge and aging buckets, the invoice register, bills with the
over-budget flag (a bill is flagged when its work order's account would push
its budget line past 100%), budget pace against the month of the year, reserve
gap and the next big repair, months of cash, next year's three dues options,
and the "Done for you" lines.

Next year's draft is computed from this year's lines (+3%) and never saved;
the budget runbook turns the chosen option into the real budget.

## Not in this phase

- Payouts, fee totals and card-fee pass-through on Online payments need Stripe data the app does not pull yet; the screen says so.
- Bank account (ACH) at checkout: the Checkout session is card today.
- A month-close rehearsal with ledger checksums is the exit gate for flipping the treasurer; it is a staging exercise, not code.

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

Tests: `src/__tests__/ux2/funds-metrics.test.ts`, `funds.test.tsx`.
