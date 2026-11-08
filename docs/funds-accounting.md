# Funds: how money is posted

How the Funds module keeps the books, written for a board member first and
an accountant second. The code it describes: `src/lib/ledger.ts` (the
engine), `src/lib/billingCycle.ts` (what runs on its own),
`src/store/useFinancialStore.ts` (every posting), and migrations
`043_funds_accounting.sql` and `044_stripe_reconciliation.sql`.

## The rules in one place

- **Two funds.** Every account belongs to the operating fund (day-to-day
  money) or the reserve fund (money set aside for major repairs). This is the
  presentation ASC 972 and the AICPA common interest realty guide call for.
  Each account carries a `fund` tag; untagged accounts default by code (1020,
  1120, 3020, 4020, 4040 and the 6000s are reserve). An entry whose two
  accounts sit in different funds is a transfer, so each fund's owns − owes
  equals its fund balance for any set of entries, and the balance sheet ties
  without a year-end close.
- **One invoice per charge.** Dues, late fees, special assessments, amenity
  and repair charges are each one row in the invoice register. Creating one
  posts Dr receivable / Cr income and raises the unit's balance. The unit's
  balance is everything charged less everything paid; it is negative when
  the owner has paid ahead.
- **Payments apply in order.** Dues, then special assessments, then fees,
  oldest due first; part payments are allowed. Any balance with no invoice
  behind it (brought over from before the register) comes next. Whatever is
  left is a prepaid credit (Cr 2020), which the next charge uses first.
- **Fees and waivers.** A late fee is an invoice (Dr 1130 / Cr 4030). Waiving
  it voids the invoice and reverses income and receivable. A fee from before
  the register (no invoice) is reversed in the ledger and marked waived.
- **Refunds mean the charge was wrong.** The money goes back (Dr income /
  Cr bank), anything still open is cancelled, the invoice is void, and the
  owner does not owe it again. Returning money an owner paid ahead comes out
  of prepaid (Dr 2020 / Cr bank), not income.
- **Bills on accrual.** Receiving a vendor invoice posts Dr expense line /
  Cr 2010 accounts payable on the invoice date. Paying it posts Dr 2010 /
  Cr bank (the reserve bank for a reserve expense). A bill invoiced before
  this change still posts expense and bank together when paid.
- **Closed months are locked.** Posting dated on or before the close is
  refused. A correction is a reversing entry: on its own date in an open
  month, dated today otherwise. Voided entries never count.
- **Opening balances** post as of one cutover date against the fund balance
  accounts (cash, each owner's balance or credit, unpaid bills) and close
  the books through that date. Re-entering replaces the earlier lines.

## What runs on its own

When a board member or manager opens the app (there is no scheduled job in
this stack yet; `useBillingCycle` runs once a day per browser):

1. If automatic billing is on and this month is not billed yet, every unit
   with a monthly amount gets its dues invoice, dated the 1st, due on the
   building's due day; a unit's prepaid credit pays it first. The monthly
   reserve transfer (annual contribution ÷ 12) posts Dr 1020 / Cr 1010 once
   per month unless turned off.
2. If late fees are on, every dues invoice past its due date plus the grace
   period with no fee yet gets one. The fee names the dues invoice, so it is
   charged once.

Each step is idempotent: one dues invoice per unit and month, one fee per
dues invoice, one transfer per month. "Run billing now" under Billing rules
does the same by hand.

## Online payments (Stripe)

The database posts every online payment, once, through functions in
`044_stripe_reconciliation.sql`:

| Stripe event | Function | What it does |
| --- | --- | --- |
| `checkout.session.completed` with `invoice_id` metadata (a payment link) | `reconcile_unit_payment(session, intent)` | Settles that invoice |
| `checkout.session.completed` with `unit_number` + `tenant_id` (the Pay page) | `record_unit_payment(...)` | Applies the amount in order, idempotent on the session id |
| `invoice.paid` (autopay) | `record_unit_payment(...)` | Same, idempotent on the Stripe invoice id |
| `charge.refunded` (made in Stripe) | `refund_unit_invoice(...)` | Posts the refund the way the app does |

The refund made from the app goes through the `refund-unit-payment` edge
function: Stripe refund first, then `refund_unit_invoice`; the app reloads
the ledger rather than posting a second copy.

Deploy notes:

- Apply migrations 043 and 044. 044 is `create or replace`, so a database
  that already had `reconcile_unit_payment` by hand keeps working.
- Subscribe the Stripe webhook endpoint to `invoice.paid` as well as
  `checkout.session.completed` and `charge.refunded`. Payments land on the
  building's connected account, so the endpoint must receive connected
  account events (Stripe Dashboard → Webhooks → "Listen to events on
  Connected accounts").
- Apply migration 045 as well: it saves the building's "Where things post"
  mapping on `financial_settings` and makes the server functions read it,
  with the app's defaults as the fallback, so a building that remaps an
  account gets the same accounts from the app and from Stripe. The mapping
  is saved the next time any Funds setting is changed (or "Save mapping" is
  pressed); until then the server uses the defaults.

## Reading the statements

- *Owns − owes = fund balances* is checked on the Statements screen; a red
  chip means an account is missing from the chart.
- The reserve "funded" figure on Planning is the reserve bank account's
  ledger balance. The per-item "set aside" is a planning split of that cash;
  the card says how much is not yet split, or when the split claims more
  than the account holds.
- Budget against actual counts this fiscal year only, following the fiscal
  year end on the building profile.
