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
  GOVOPS_SUPABASE_URL=https://kodfghtwmvadpeyimuvk.supabase.co \
  GOVOPS_SUPABASE_SERVICE_ROLE_KEY=YOUR_GOVOPS_SERVICE_KEY

# Deploy Edge Functions
supabase functions deploy create-hosted-page
supabase functions deploy chargebee-webhook
supabase functions deploy provision-tenant
```

### Step 4: Install Frontend Dependencies

```bash
cd ~/onetwo
npm install @supabase/supabase-js @stripe/stripe-js @chargebee/chargebee-js
```

### Step 5: Configure Environment Variables

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your values:
# VITE_SUPABASE_URL=https://xxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
# VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
# VITE_CB_SITE=onetwo-test
```

**Also set in Vercel:**
Go to Vercel Dashboard → Project → Settings → Environment Variables and add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
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

### Stripe Connect (Owner Payments)

Stripe is still used for owner-facing payments (assessment collection, postage fees, etc.)
via Stripe Connect. Each tenant connects their own Stripe account so that payments from
unit owners are deposited directly into the association's bank account.

This is separate from the Chargebee subscription billing described above.

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
