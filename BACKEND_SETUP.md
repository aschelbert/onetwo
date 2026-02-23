# ONE two HOA — Backend Setup Guide
## Self-Service Signup → Automatic Tenant Provisioning

### Architecture Overview

```
User signs up → Supabase Auth → Stripe Checkout → Stripe Webhook
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
- `tenants` — building records with subdomain + Stripe IDs
- `subscriptions` — tier, status, billing periods
- `tenant_features` — 10 feature flags per tenant
- `onboarding_checklists` — 7-step onboarding tracker
- `tenant_users` — links auth users to tenants with roles
- `platform_admins` — ONE two staff accounts
- `audit_log` — all actions logged
- `invoices` — synced from Stripe
- `generate_subdomain()` — SQL function for unique subdomain generation
- `tier_feature_defaults()` — returns feature matrix for a tier
- `provision_tenant()` — atomic function that creates everything in one transaction
- Row Level Security on all tables

### Step 2: Stripe Setup

**Create Products + Prices in Stripe Dashboard:**

1. Go to https://dashboard.stripe.com → Products
2. Create three products:

| Product | Price | Price ID |
|---------|-------|----------|
| ONE two Essentials | $49/month recurring | `price_essentials_xxx` |
| ONE two Compliance Pro | $179/month recurring | `price_compliance_pro_xxx` |
| ONE two Advanced Governance | $299/month recurring | `price_advanced_gov_xxx` |

3. Copy the Price IDs for each.

**Set up Webhook:**

1. Go to Developers → Webhooks → Add endpoint
2. URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy the Webhook Signing Secret (`whsec_...`)

### Step 3: Deploy Edge Functions

```bash
# Set all secrets
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_YOUR_KEY \
  STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET \
  STRIPE_PRICE_ESSENTIALS=price_xxx \
  STRIPE_PRICE_COMPLIANCE_PRO=price_xxx \
  STRIPE_PRICE_ADVANCED_GOVERNANCE=price_xxx \
  SITE_URL=https://app.getonetwo.com

# Deploy all three Edge Functions
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook
supabase functions deploy provision-tenant
```

### Step 4: Install Frontend Dependencies

```bash
cd ~/onetwo
npm install @supabase/supabase-js @stripe/stripe-js
```

### Step 5: Configure Environment Variables

```bash
# Copy the template
cp .env.example .env.local

# Edit .env.local with your values:
# VITE_SUPABASE_URL=https://xxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...
# VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

**Also set in Vercel:**
Go to Vercel Dashboard → Project → Settings → Environment Variables and add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`

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
4. **Tier selection**: Chooses Essentials / Compliance Pro / Advanced Governance
5. **Building info**: Enters building name, address, units
6. **Profile**: Enters name, phone, board title
7. **Checkout**: Frontend calls `create-checkout` Edge Function → gets Stripe Checkout URL → redirects to Stripe
8. User completes payment on Stripe's hosted checkout page
9. **Stripe fires webhook** → `stripe-webhook` Edge Function runs → calls `provision_tenant()` database function
10. `provision_tenant()` atomically:
    - Generates subdomain: "Sunny Acres Condominium" → `sunnyacres`
    - Creates tenant row with subdomain + Stripe IDs
    - Creates subscription (trialing, 30 days)
    - Creates feature flags from tier defaults
    - Creates onboarding checklist (2/7 steps done)
    - Links the signing-up user as board_member
    - Writes audit log entry
11. User redirected to `sunnyacres.getonetwo.com/dashboard`
12. `useTenant()` hook resolves subdomain → fetches tenant context → gates features

**Admin-initiated onboarding:**

1. Admin logs into `app.getonetwo.com/admin/console`
2. Clicks "Onboard Building" → fills form
3. Calls `provision-tenant` Edge Function (or stays in demo mode with Zustand store)
4. Same `provision_tenant()` DB function runs
5. Building appears in Onboarding Pipeline tab

---

### Demo Mode Compatibility

The app is designed to work in two modes:

- **Backend mode** (Supabase configured): Real auth, real data, real payments
- **Demo mode** (no env vars): Falls back to Zustand stores with seed data

`src/lib/supabase.ts` checks for env vars and exports `isBackendEnabled`.
`src/hooks/useTenant.ts` returns demo data when Supabase isn't configured.
The existing `useAuthStore` / `usePlatformAdminStore` continue to work as-is for demos.

This means the app works on Vercel immediately for demos, and progressively enables
real backend features as you configure Supabase + Stripe.

---

### Files Created

```
supabase/
├── config.toml                              # Supabase project config
├── migrations/
│   └── 001_tenancy.sql                      # All tables, RLS, functions
└── functions/
    ├── create-checkout/index.ts             # Creates Stripe Checkout Session
    ├── stripe-webhook/index.ts              # Handles all Stripe events
    └── provision-tenant/index.ts            # Admin manual provisioning

src/
├── lib/
│   └── supabase.ts                          # Supabase client (singleton)
└── hooks/
    └── useTenant.ts                         # Tenant context from subdomain

.env.example                                 # Environment variable template
```

