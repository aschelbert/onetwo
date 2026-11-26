# ONE two HOA — Backend Setup Guide
## Self-Service Signup → Automatic Tenant Provisioning

### Architecture Overview

```
User signs up → Supabase Auth → Chargebee Hosted Page → Chargebee Webhook
                                                             ↓
                                                    provision_tenant()
                                                             ↓
                                          ┌──────────────────┼──────────────────┐
                                          ↓                  ↓                  ↓
                                    tenant row         feature flags      onboarding
                                    + subdomain        (from tier)        checklist
                                          ↓
                                 User redirected to
                            [subdomain].getonetwo.com
```

---

### Step 1: Supabase Setup

```bash
# Install Supabase CLI if not already
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project (get ref from Supabase Dashboard → Settings → General)
cd ~/onetwo
supabase link --project-ref YOUR_PROJECT_REF

# Run the migration to create all tables
supabase db push

# Verify tables were created
supabase db remote commit
```

**What this creates:**
- `tenants` — building records with subdomain + Chargebee subscription IDs
- `subscriptions` — tier, status, billing periods
- `tenant_features` — 10 feature flags per tenant
- `onboarding_checklists` — 7-step onboarding tracker
- `tenant_users` — links auth users to tenants with roles
- `platform_admins` — ONE two staff accounts
- `audit_log` — all actions logged
- `invoices` — synced from Chargebee
- `generate_subdomain()` — SQL function for unique subdomain generation
- `tier_feature_defaults()` — returns feature matrix for a tier
- `provision_tenant()` — atomic function that creates everything in one transaction
- Row Level Security on all tables

### Step 2: Chargebee Setup

**Create Items + Prices in Chargebee Dashboard:**

1. Go to https://onetwo-test.chargebee.com → Product Catalog → Items
2. Create the following plan items and add-on items with their prices:

| Item (Plan / Add-on) | Price ID (Monthly) | Price ID (Annual) |
|---|---|---|
| Self-Managed (plan) | `Self-Managed-USD-Monthly` | `Self-Managed-USD-Annual` |
| Facilities (plan) | `Facilities-USD-Monthly` | `Facilities-USD-Annual` |
| OnCall – Self-Managed (add-on) | `OnCall-SM-USD-Monthly` | `OnCall-SM-USD-Annual` |
| OnCall – Facilities (add-on) | `OnCall-Fac-USD-Monthly` | `OnCall-Fac-USD-Annual` |
| PM Seat (add-on) | `PM-Seat-USD-Monthly` | `PM-Seat-USD-Annual` |
| Setup – Self-Managed (charge) | `Setup-SM-USD` | — |
| Setup – Facilities (charge) | `Setup-Fac-USD` | — |

3. Copy the Price IDs and set them as `VITE_CB_PRICE_*` env vars.

**Set up Webhook:**

1. Go to Settings → Configure Chargebee → Webhooks → Add Webhook
2. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/chargebee-webhook`
3. Protect with basic auth (`CHARGEBEE_WEBHOOK_USER` / `CHARGEBEE_WEBHOOK_PASS`)
4. Events to listen for:
   - `subscription_created`
   - `subscription_activated`
   - `subscription_changed`
   - `subscription_cancelled`
   - `subscription_deleted`
   - `payment_succeeded`
   - `payment_failed`

### Step 3: Deploy Edge Functions

```bash
# Set all secrets
supabase secrets set \
  CHARGEBEE_SITE=onetwo-test \
  CHARGEBEE_API_KEY=test_YOUR_API_KEY \
  CHARGEBEE_WEBHOOK_USER=onetwo \
  CHARGEBEE_WEBHOOK_PASS=YOUR_WEBHOOK_PASSWORD \
  STRIPE_SECRET_KEY=sk_test_YOUR_KEY \
  STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET \
  SITE_URL=https://app.getonetwo.com \
  BREVO_API_KEY=xkeysib-YOUR_KEY \
  GOVOPS_SUPABASE_URL=https://YOUR_GOVOPS_PROJECT_REF.supabase.co \
  GOVOPS_SUPABASE_SERVICE_ROLE_KEY=YOUR_GOVOPS_SERVICE_KEY \
  OPENAI_ADS_API_KEY=YOUR_OPENAI_ADS_CONVERSIONS_API_KEY \
  OPENAI_ADS_PIXEL_ID=YOUR_OPENAI_ADS_PIXEL_ID

# Deploy Edge Functions
supabase functions deploy create-hosted-page
supabase functions deploy chargebee-webhook --no-verify-jwt
supabase functions deploy provision-tenant
supabase functions deploy checkout-intent
supabase functions deploy checkout-complete
```

> Email is sent through Brevo by `supabase/functions/_shared/email.ts`, from
> `noreply@getonetwo.com`. In Brevo, leave "Block unknown IP addresses" off for API
> keys (Security > Authorized IPs): edge functions have no fixed outbound address.
> Redeploy every function that sends email after changing the shared file.

> `chargebee-webhook` and `stripe-webhook` must be deployed **without** JWT
> verification (`supabase/config.toml` sets `verify_jwt = false` for both, and
> the flag above makes it explicit). Chargebee authenticates with Basic auth
> and Stripe with a signature header, not a Supabase JWT; with verification on,
> the gateway returns 401 before the function runs and paid signups are never
> provisioned. Check the function's **Verify JWT** toggle in the dashboard after
> deploying.

### Step 4: Install Frontend Dependencies

```bash
cd ~/onetwo
npm install @supabase/supabase-js @chargebee/chargebee-js
```

### Step 5: Configure Environment Variables

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your values:
# VITE_SUPABASE_URL=https://xxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
# VITE_CB_SITE=onetwo-test
```

**Also set in Vercel:**
Go to Vercel Dashboard → Project → Settings → Environment Variables and add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CB_SITE`
- All `VITE_CB_PRICE_*` variables

### Step 6: Vercel Wildcard Domain

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add: `*.getonetwo.com`
3. Add: `app.getonetwo.com` (for the main login/admin)
4. In your DNS (wherever getonetwo.com is hosted):
   - Add CNAME: `*` → `cname.vercel-dns.com`
   - Add CNAME: `app` → `cname.vercel-dns.com`

### Step 7: Seed Platform Admin

After migration, insert your admin account:

```sql
-- First, create the auth user via Supabase Dashboard → Authentication → Users → Add User
-- Email: alyssa@getonetwo.com
-- Then get the user's UUID and insert:

insert into platform_admins (user_id, role, name, email, status)
values (
  'USER_UUID_FROM_AUTH',  -- replace with actual UUID
  'super_admin',
  'Alyssa Schelbert',
  'alyssa@getonetwo.com',
  'active'
);
```

---

### How the Full Flow Works

**Self-service signup (board member):**

1. User visits `app.getonetwo.com` → clicks "Create Account"
2. Selects "Board Member" → enters invite code OR clicks "Subscribe"
3. **Auth step**: Signs up via Supabase Auth (email + password)
4. **Tier selection**: Chooses Self-Managed or Facilities plan
5. **Building info**: Enters building name, address, units
6. **Profile**: Enters name, phone, board title
7. **Checkout**: Frontend calls `create-hosted-page` Edge Function → gets Chargebee Hosted Page URL → redirects to Chargebee
8. User completes payment on Chargebee's hosted checkout page
9. **Chargebee fires webhook** → `chargebee-webhook` Edge Function runs → calls `provision_tenant()` database function
10. `provision_tenant()` atomically:
    - Generates subdomain: "Sunny Acres Condominium" → `sunnyacres`
    - Creates tenant row with subdomain + Chargebee subscription IDs
    - Creates subscription (trialing, 30 days)
    - Creates feature flags from tier defaults
    - Creates onboarding checklist (2/7 steps done)
    - Links the signing-up user as board_member
    - Writes audit log entry
11. User redirected to `sunnyacres.getonetwo.com/dashboard`
12. `useTenant()` hook resolves subdomain → fetches tenant context → gates features

**"Set up billing" flow (existing tenants):**

For tenants that were onboarded by a ONE two admin (or migrated from another system) and
do not yet have an active Chargebee subscription:

1. Board member navigates to **Settings → Subscription** inside their tenant dashboard
2. The page detects no active Chargebee subscription and shows a "Set up billing" prompt
3. User selects a plan (Self-Managed / Facilities) and billing period (monthly / annual)
4. Frontend calls `create-hosted-page` Edge Function with the tenant ID and chosen price IDs
5. User is redirected to a Chargebee Hosted Page to enter payment details
6. On completion, Chargebee fires `subscription_created` webhook
7. `chargebee-webhook` Edge Function updates the tenant's `chargebee_subscription_id` and
   `subscriptions` row with the new plan, status, and billing period
8. The tenant now has active billing and the Subscription page shows plan details,
   upcoming invoice, and the Chargebee Self-Service Portal link for managing payment methods

**Admin-initiated onboarding:**

1. Admin logs into `app.getonetwo.com/admin/console`
2. Clicks "Onboard Building" → fills form
3. Calls `provision-tenant` Edge Function (or stays in demo mode with Zustand store)
4. Same `provision_tenant()` DB function runs
5. Building appears in Onboarding Pipeline tab
6. The tenant can later set up billing via the flow described above

---

### One-page signup and checkout (Chargebee Payment Components)

`/login?create=1` is a single page (`src/features/auth/signup/`): account, plan,
add-ons, the building's address and the payment method, with a live order
summary. Only the payment fields are Chargebee's, rendered in its iframe by
Chargebee.js Payment Components. Name, email and address are typed once and
passed to Chargebee by the server.

**Prices.** `supabase/functions/_shared/checkoutPricing.ts` is the only price
list. The page reads it through `src/lib/tiers.ts`; the functions charge from
it. A request names a plan, a billing period and add-ons by id, and the server
works every amount out itself. It must agree with the Chargebee catalog:
On Call has one item price per period, and its Plus Facilities price is a
*differential price* on that item price in Chargebee.

**Functions.**

| Function | Caller | What it does |
|---|---|---|
| `checkout-intent` | the page, before an account exists | Creates or updates the `payment_intent` for the amount due today: $0 during a trial (the card is only verified), the first period when the trial is turned off. |
| `checkout-complete` | the page, signed in, after the payment fields authorise | Re-validates the order and address, checks the intent is authorised for the right amount, creates the building's customer (`cb_tenant_<id>`) with the billing address, saves `pending_checkouts`, and creates the subscription with its trial. |
| `chargebee-webhook` | Chargebee | Unchanged in role: `subscription_created` provisions the building from `pending_checkouts`. |

The account itself is created in the browser with Supabase Auth, as before.

**One subscription per checkout.** The same person and building always derive
the same reserved building id, so the same Chargebee customer. The subscription
call carries `chargebee-idempotency-key: checkout-<payment intent id>`, an
intent can be consumed once, and a repeat request first looks for a live
subscription on that customer.

**Setup.**

1. In Chargebee: Settings → Configure Chargebee → API Keys → create a
   **publishable** key. Set `VITE_CB_PUBLISHABLE_KEY` and `VITE_CB_SITE` in
   Vercel (and `.env.local`). Without the key the page says payments are not
   set up, and the button stays off.
2. `CHARGEBEE_SITE` and `CHARGEBEE_API_KEY` are already edge function secrets.
3. Deploy `checkout-intent`, `checkout-complete` and `chargebee-webhook`.
4. Bank debit (ACH) appears in the payment fields only when the site's gateway
   offers it. The test site uses the Chargebee Test Gateway, which is card only.

**Not asked at signup any more.** Unit count (added in Setup) and board seat:
the signer joins with no seat, and My Account shows "Not confirmed yet" until
they pick one. The building URL is generated from the association's name.

### Stripe Connect (Owner Payments)

Stripe is still used for owner-facing payments (assessment collection) via Stripe
Connect. Each tenant connects their own Stripe account so that payments from unit
owners are deposited directly into the association's bank account.

This is separate from the Chargebee subscription billing described above.

**Connecting a building** happens in setup (step 4, *Get paid online*) or under
Funds › Online payments, through `connect-stripe-account`. Stripe takes 1 to 2 days
to verify an association. Three paths notice when it does, all through
`supabase/functions/_shared/stripeAccount.ts`, so the building is marked verified and
the board is told exactly once:

1. **The board clicks Check now** (`connect-stripe-account`, action `check_status`).
2. **Stripe's `account.updated` webhook** on the connected-accounts endpoint
   (`stripe-webhook`). In the Stripe Dashboard → Developers → Webhooks, add
   `account.updated` to the endpoint that *listens to events on Connected accounts*
   (the one signed with `STRIPE_CONNECT_WEBHOOK_SECRET`).
3. **The daily sweep** (`stripe-account-status`), scheduled by migration 053 with
   pg_cron at 06:45 UTC through pg_net. The job authenticates with a random shared
   secret the migration generates into Vault (`stripe_status_cron_secret`), which the
   function reads back through a service-role-only RPC; the service role key never
   enters the database. The one thing to create once per project is the URL the job
   calls:

   ```sql
   select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'project_url');
   ```

   Where pg_cron or pg_net is unavailable, have an outside scheduler POST to
   `/functions/v1/stripe-account-status` once a day with the Vault secret (or a
   `CRON_SECRET` function secret, which overrides it) in an `x-cron-secret` header.

On verification the board member who connected (or every board member, if unknown)
gets a confirmation email through Brevo (`BREVO_API_KEY`),
and a pinned "Pay online or set up autopay" announcement is posted for owners.

```bash
supabase functions deploy connect-stripe-account
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy stripe-account-status
```

### People our email is not reaching

Brevo adds its own Unsubscribe to every email, including notices, invoices and
password resets. One click puts the address on Brevo's blocked list, and Brevo then
accepts our emails for that address and drops them. A dead mailbox or a spam report
does the same. Migration `20261120120000_email_suppressions` keeps our copy of that
list so the app can say so: `sendEmail()` skips those addresses and reports them as
not sent, Users shows the board who is not being reached, and the person (Account) or
the board (Users) can turn email back on.

1. Pick a long random token and save it as the `BREVO_WEBHOOK_TOKEN` function secret.
2. Deploy `brevo-webhook` (without JWT verification) and `email-suppression`, and
   redeploy every function that sends email, since they share `_shared/email.ts`.
3. In Brevo, add a transactional webhook to
   `https://YOUR_PROJECT_REF.supabase.co/functions/v1/brevo-webhook` for the events
   unsubscribed, hard bounce, spam, invalid, blocked and delivered, with bearer
   authentication set to the same token. Through the API:

```bash
curl https://api.brevo.com/v3/webhooks \
  -H "api-key: $BREVO_API_KEY" -H "content-type: application/json" \
  -d '{"type":"transactional","description":"ONE two: addresses email is not reaching",
       "url":"https://YOUR_PROJECT_REF.supabase.co/functions/v1/brevo-webhook",
       "events":["unsubscribed","hardBounce","spam","invalid","blocked","delivered"],
       "auth":{"type":"bearer","token":"THE_SAME_TOKEN"}}'
```

Addresses blocked before the webhook existed are picked up the next time Brevo
refuses a send to them. A password reset to an address that pressed Unsubscribe is
sent by Supabase Auth's own mailer instead, so a locked-out person is not stranded.

### Product email confirmations (double opt-in)

Ticking "Email me ONE two product news" (any form) or turning it on under Account
does not subscribe the address until someone presses Confirm on `/confirm-email`,
linked from a confirmation email (migration `20261118140000_marketing_double_opt_in`).
Opt-outs and the unsubscribe page's Subscribe again take effect at once. At most one
confirmation email per address per day; links last 7 days.

The migration stores a `marketing_confirm_cron_secret` in Vault and schedules
`onetwo-marketing-confirmations` every minute; it calls the edge function only when a
confirmation is waiting. The function sends through Brevo (`BREVO_API_KEY`) and must be deployed without JWT verification:

```bash
supabase functions deploy send-marketing-confirmations --no-verify-jwt
```

Deploy the app (the `/confirm-email` page) before applying the migration in
production, so the first confirmation emails do not link to a missing page.

### Printed Mail (DocuPost or LetterStream)

Printed letters go through a vendor the **building** holds its own account with and pays
directly. The platform never charges a card for postage. Two vendors are wired in:

- **DocuPost** (recommended): the board opens an account at docupost.com, adds funds
  (from $10) and pastes the API token from Account settings → Developer. Public API,
  no approval step. Letters are fetched by URL, so `send-mail` stores the rendered PDF
  in the private `mail-letters` bucket and hands DocuPost a 7-day signed URL. DocuPost
  has no status API; tracking lives in its dashboard. A token can only be confirmed by
  sending, so it is saved as unverified and marked verified after the first accepted
  letter (or invalid if DocuPost answers "Invalid API token").
- **LetterStream** (Partnership mode): the building opens its account through our
  partner link (`LETTERSTREAM_PARTNER_URL`) and pastes the API ID and key from My
  Account → API Information. LetterStream shares its API guide only with approved
  partners; the wire format lives in `supabase/functions/_shared/letterstream.ts`.

Credentials live in `mail_provider_accounts` (RLS on, no policies: service role only);
`financial_settings.mail_connected` / `mail_provider` are the non-secret flags the app
reads. Functions:

- `connect-mail-provider`: status / connect / disconnect / set-balance for the
  building's account.
- `send-mail`: renders the notice to PDF, pushes it into the building's account and
  writes the building's record of the letter to `mail_records`.
- `check-mail-status`: reads the status back (LetterStream) and writes it onto the
  letter's record, or points at the dashboard (DocuPost).

**Letter history, tracking and balance** (migration `20261119120000_mail_records.sql`;
apply it before deploying the three functions, which read its columns):

- `mail_records` holds one row per letter, written by `send-mail` with the service
  role (failed sends too). Board, property manager and account owner read it and may
  update tracking; nothing in the app inserts or deletes rows. The app loads it at
  sign-in, so every board member sees the same history on any device.
- DocuPost has no status API, no webhooks and no balance API. For its letters a board
  member copies the USPS tracking number from Letters → the letter → Letter Details
  and marks the outcome under Mailing History; the app then links to USPS tracking.
  LetterStream letters are refreshed from its status call when the board opens the app.
- Balance: `mail_provider_accounts.funds_low_at` is set when the vendor refuses a
  letter for lack of funds and cleared by the next letter it accepts. `balance_cents` /
  `balance_recorded_at` hold the figure a board member read off the vendor's Funds
  page; the app shows it less the estimated postage of letters sent since, and warns
  before a letter the estimate does not cover.
- DocuPost's return receipt is always USPS's Electronic Return Receipt (requested from
  the USPS tracking page once delivered); it has no mailed-back green card. The app
  offers only the methods the connected vendor has, and a green-card request to
  DocuPost is sent and recorded as the electronic receipt.

Optional secrets: `DOCUPOST_API_URL`, `DOCUPOST_PORTAL_URL`, `DOCUPOST_SIGNUP_URL`,
`LETTERSTREAM_API_URL`, `LETTERSTREAM_PORTAL_URL`, `LETTERSTREAM_PARTNER_URL`.

---

### Demo Mode Compatibility

The app is designed to work in two modes:

- **Backend mode** (Supabase configured): Real auth, real data, real payments
- **Demo mode** (no env vars): Falls back to Zustand stores with seed data

`src/lib/supabase.ts` checks for env vars and exports `isBackendEnabled`.
`src/hooks/useTenant.ts` returns demo data when Supabase isn't configured.
The existing `useAuthStore` / `usePlatformAdminStore` continue to work as-is for demos.

This means the app works on Vercel immediately for demos, and progressively enables
real backend features as you configure Supabase + Chargebee + Stripe Connect.

---

### Files Created

```
supabase/
├── config.toml                              # Supabase project config
├── migrations/
│   └── 001_tenancy.sql                      # All tables, RLS, functions
└── functions/
    ├── create-hosted-page/index.ts          # Creates Chargebee Hosted Page
    ├── chargebee-webhook/index.ts           # Handles all Chargebee events
    └── provision-tenant/index.ts            # Admin manual provisioning

src/
├── lib/
│   └── supabase.ts                          # Supabase client (singleton)
└── hooks/
    └── useTenant.ts                         # Tenant context from subdomain

.env.example                                 # Environment variable template
```
