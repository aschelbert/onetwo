# UX2 phase 6 — Me

Phase 6 ships the redesigned Me area behind the `me` flag: My Account, My
Unit (and My Units), User Management, Subscription, Help & Support. With the
flag off, `/account`, `/my-unit`, `/admin/users`, `/subscription` and
`/support` render the production pages unchanged. With it on, each route
shows the same module with its tab selected, so the avatar menu and every
old link keep working.

Turn it on for one browser with `?ux2=all`, or for a deploy with
`VITE_UX2_FLAGS=all`. `?ux2=none` turns it off.

## What it replaces

| Me tab | What is new | Production component mounted underneath |
| --- | --- | --- |
| My Account | The stewardship radar, the last scored events with receipts, by-dimension lines with the building average and how each is scored, "On the board" (rank, who is ahead) or "Among the owners", the board leaderboard (board only), Sign out | `AccountSettingsPage embedded` (profile, linked units, notification preferences, change password) |
| My Unit / My Units | Balance, this year on time, receipts tiles; a card per unit with the 12-month dues strip; resale readiness (the seven packet items judged from the documents on file, "Start a resale request"); statements and receipts across units with year filter; Both / per-unit pills when more than one unit; Pay | `MyUnitPage embedded` (balance and payments with Stripe Checkout, autopay and the billing portal, documents with upload, move history, link a unit) |
| User Management (board, manager) | People with access, invites and roles tiles, who sees what | `UserManagementPage embedded` (members, pending invites, invite, bulk invite, resend, revoke, remove; `send-invite`) |
| Subscription (board, not demo) | Plan, billing and move-up tiles from the shared tier config, what the plan includes | `SubscriptionPage embedded` (plan, add-ons, interval, cancel; `manage-subscription`, `chargebee-portal`) |
| Help & Support | "Find an answer": keyword search across the 8 guides, 32 runbooks, this building's obligations and its fee schedule, each hit linking to the page that holds the answer; three entry cards; Support / Guides toggle | `SupportPage` (realtime support threads, attachments) and `HowItWorksPage` (the guides) |

## Production changes

- `embedded` prop on `AccountSettingsPage`, `MyUnitPage` (the Link Unit button moves to a slim row), `UserManagementPage` and `SubscriptionPage`. Default rendering unchanged.
- `HowItWorksPage` exports its `GUIDES` so Help can search them.
- `vercel.json`: rewrites for `/home`, `/funds`, `/my-unit/:path*` and `/cases` were missing, so a direct load or a reload of those pages on any Vercel deploy served the marketing page. Added. The dev server's app-route list gets `/support`, `/subscription`, `/association-team` and `/cases` for the same reason.

## Numbers

`src/ux2/me/metrics.ts` is pure and tested: unit summaries (owed, fees,
assessments, open invoices, next dues, months paid this year and how many
on time), the resale packet, statements and receipts, dimension lines and
recent receipts. `src/ux2/me/help.ts` holds the search.

## Not in this phase

- Two-factor authentication and persisted notification preferences: production's buttons for both do nothing today, so the embedded profile section inherits that.
- Autopay status on the unit cards: production keeps autopay in local state on the balance tab, so nothing stores it per unit yet.
- Downloading a monthly statement as a file: the receipts list is the ledger; statement PDFs are the Funds › Statements packets.
- "Switch building" for people on more than one building: no tenant picker exists in the app yet.

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

Tests: `src/__tests__/ux2/me-metrics.test.ts`, `me.test.tsx`.
