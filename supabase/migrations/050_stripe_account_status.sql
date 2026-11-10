-- ════════════════════════════════════════════════════════════════════════════
-- ONE two HOA - 050: Stripe account verification is noticed without a visit
--
-- A building's Stripe Connect account takes Stripe 1 to 2 days to verify. Until
-- now the app only learned of it when a board member opened the Payments page.
-- Now:
--   * financial_settings remembers who connected the account, when Stripe
--     verified it, and when its status was last checked;
--   * a pg_cron job calls the stripe-account-status edge function every morning
--     for every account still awaiting verification. The function marks the
--     building verified, emails the board and posts the owners' announcement
--     (supabase/functions/_shared/stripeAccount.ts). Stripe's own
--     account.updated webhook does the same the moment it fires; the daily
--     job is the safety net.
--
-- The job reaches the edge function through pg_net, with the project URL and
-- service role key read from Vault. Create those two secrets once per project:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<service role key>', 'service_role_key');
--
-- Where pg_cron or pg_net is not available this migration only raises a
-- notice; schedule the function from outside with the CRON_SECRET header.
-- ════════════════════════════════════════════════════════════════════════════

alter table financial_settings
  add column if not exists stripe_connected_by       uuid references auth.users(id) on delete set null,
  add column if not exists stripe_verified_at        timestamptz,
  add column if not exists stripe_status_checked_at  timestamptz;

comment on column financial_settings.stripe_connected_by is 'The board member who clicked Connect with Stripe; gets the confirmation email.';
comment on column financial_settings.stripe_verified_at is 'When Stripe first reported charges enabled and details submitted.';
comment on column financial_settings.stripe_status_checked_at is 'When the account was last compared with Stripe (board click, webhook or daily job).';

-- Buildings verified before this migration: date them to their last update so the sweep ignores them.
update financial_settings
   set stripe_verified_at = coalesce(stripe_verified_at, updated_at)
 where stripe_onboarding_complete and stripe_connect_id is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- Every morning at 06:45 UTC (after the 06:15 billing cycle), where pg_cron and
-- pg_net are available (both are on Supabase; enable them under Database →
-- Extensions if this block only raises a notice).
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  if exists (select 1 from cron.job where jobname = 'onetwo-stripe-account-status') then
    perform cron.unschedule('onetwo-stripe-account-status');
  end if;
  perform cron.schedule('onetwo-stripe-account-status', '45 6 * * *', $job$
    select net.http_post(
      url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/stripe-account-status',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body    := '{"source":"cron"}'::jsonb
    )
  $job$);
exception when others then
  raise notice 'pg_cron or pg_net is not available here (%). Call the stripe-account-status edge function daily from outside once it is.', sqlerrm;
end $$;
