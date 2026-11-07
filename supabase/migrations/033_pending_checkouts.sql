-- 033: pending_checkouts
--
-- The signup flow stores the building the user is paying for here before
-- sending them to Chargebee's hosted checkout. chargebee-checkout writes the
-- row (keyed by the Chargebee customer id it creates for the user) and
-- chargebee-webhook reads it back on subscription_created to call
-- provision_tenant(). The table existed only on staging, created by hand;
-- production never had it, so every production signup lost its building data
-- and no tenant was provisioned. Both functions use the service role, so no
-- policies are needed: RLS on with no policies keeps it closed to clients.

create table if not exists public.pending_checkouts (
  id uuid primary key default gen_random_uuid(),
  chargebee_customer_id text not null,
  user_id uuid not null,
  payload jsonb not null,
  created_at timestamptz default now()
);

create index if not exists idx_pending_checkouts_customer
  on public.pending_checkouts (chargebee_customer_id);

alter table public.pending_checkouts enable row level security;
