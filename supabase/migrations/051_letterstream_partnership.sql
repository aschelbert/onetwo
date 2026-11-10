-- 051_letterstream_partnership.sql
-- Physical mail moves to LetterStream Partnership mode: each building holds its
-- own LetterStream account (opened through our partner link) and pays
-- LetterStream directly. We only push jobs into that account, so the platform
-- never charges a card for postage. The Stripe mailing-billing columns go away.

alter table financial_settings
  drop column if exists mailing_stripe_customer_id,
  drop column if exists mailing_stripe_payment_method,
  drop column if exists mailing_card_last4,
  drop column if exists mailing_card_brand;

-- Non-secret flag the app reads to know whether mail can be sent.
alter table financial_settings
  add column if not exists letterstream_connected boolean not null default false;

-- The building's LetterStream API credentials. Service-role only: RLS is on
-- and there are deliberately no policies, so neither residents nor board
-- members can read the key through the REST API. Edge functions
-- (connect-letterstream, send-mail, check-mail-status) are the only readers.
create table if not exists letterstream_accounts (
  tenant_id        uuid primary key references tenants(id) on delete cascade,
  api_id           text not null,
  api_key          text not null,
  status           text not null default 'unverified',
  -- unverified | verified | invalid
  last_error       text,
  connected_by     uuid references auth.users(id) on delete set null,
  connected_at     timestamptz not null default now(),
  last_verified_at timestamptz,
  updated_at       timestamptz not null default now()
);

alter table letterstream_accounts enable row level security;

create trigger trg_letterstream_accounts_updated before update on letterstream_accounts
  for each row execute function update_updated_at();

-- Keep financial_settings.letterstream_connected in step with the credentials row.
create or replace function sync_letterstream_connected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update financial_settings set letterstream_connected = false where tenant_id = old.tenant_id;
    return old;
  end if;
  insert into financial_settings (tenant_id, letterstream_connected)
    values (new.tenant_id, true)
    on conflict (tenant_id) do update set letterstream_connected = true;
  return new;
end;
$$;

create trigger trg_letterstream_accounts_sync
  after insert or update or delete on letterstream_accounts
  for each row execute function sync_letterstream_connected();
