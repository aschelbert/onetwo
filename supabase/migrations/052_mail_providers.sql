-- 052_mail_providers.sql
-- Printed mail can go through more than one vendor. The building still holds
-- its own account with the vendor and pays it directly; we only keep the
-- credentials and push letters. letterstream_accounts becomes
-- mail_provider_accounts with a provider column, and financial_settings
-- says which provider is connected.
--
-- Providers:
--   docupost     one API token; letters are fetched by URL, so rendered PDFs
--                are kept briefly in a private bucket (mail-letters)
--   letterstream API ID + key issued to accounts opened via our partner link

alter table if exists letterstream_accounts rename to mail_provider_accounts;

alter table mail_provider_accounts
  add column if not exists provider text not null default 'letterstream';

alter table mail_provider_accounts
  drop constraint if exists mail_provider_accounts_provider_check;
alter table mail_provider_accounts
  add constraint mail_provider_accounts_provider_check check (provider in ('docupost', 'letterstream'));

-- DocuPost has no API ID, only a token.
alter table mail_provider_accounts alter column api_id drop not null;

alter table financial_settings rename column letterstream_connected to mail_connected;
alter table financial_settings add column if not exists mail_provider text;

-- Keep financial_settings in step with the credentials row.
create or replace function sync_letterstream_connected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update financial_settings set mail_connected = false, mail_provider = null where tenant_id = old.tenant_id;
    return old;
  end if;
  insert into financial_settings (tenant_id, mail_connected, mail_provider)
    values (new.tenant_id, true, new.provider)
    on conflict (tenant_id) do update set mail_connected = true, mail_provider = excluded.mail_provider;
  return new;
end;
$$;

-- Rendered letters for providers that fetch the PDF by URL (DocuPost). Private:
-- the edge function uploads with the service role and hands the vendor a
-- short-lived signed URL. No policies, so nothing reaches it from the app.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('mail-letters', 'mail-letters', false, 10485760)
  on conflict (id) do nothing;
