-- Lock down the remaining SECURITY DEFINER functions in public.
--
-- Same root cause as 20261114130000_lock_down_runbook_functions: earlier
-- migrations only ran `revoke ... from public`, but Supabase's default
-- privileges grant EXECUTE on every new public-schema function directly to
-- anon and authenticated. These functions bypass RLS, so anyone holding the
-- publishable key could e.g. POST /rest/v1/rpc/fin_gl_post to write journal
-- entries into any tenant, or record_unit_payment to mark a unit paid.
--
-- Callers, checked 2026-11-14 (src/, supabase/functions/, cron.job, other
-- functions' bodies, triggers, RLS policies):
--
--   Server-only (service role key in edge functions):
--     record_unit_payment, reconcile_unit_payment   stripe-webhook
--     refund_unit_invoice                           stripe-webhook, refund-unit-payment
--                                                   (the app calls the edge function, not the RPC)
--     link_chargebee_subscription, mark_trial_expired, provision_tenant
--                                                   chargebee-webhook, provision-tenant
--   Called only by other definer functions (run as postgres, need no grant):
--     fin_gl_post, fin_settle_invoice, settle_ownership,
--     seed_chart_of_accounts, seed_fee_schedule, seed_letter_templates
--   pg_cron, as postgres: generate_monthly_invoices, process_late_fees
--   Trigger functions (EXECUTE is not checked when a trigger fires):
--     seed_*_for_new_tenant, link_new_member_to_unit, link_unit_owner_member,
--     notify_push_on_support_message, sync_letterstream_connected
--   No caller at all: mark_case_message_read (no auth check, takes any user
--     id), link_demo_lead (lets any signed-in user claim a lead by email)
--
--   Client-called, signed in only (anon dropped):
--     accept_invitation           AuthPage, after signUp/signIn (needs a session)
--     cast_meeting_ballot, meeting_ballot_counts   check membership via auth.uid()
--     mark_channel_messages_read  CommunicationsTab
--     transfer_ownership, accept_ownership_transfer   no UI yet; both check auth.uid()
--   accept_invitation and mark_channel_messages_read had no auth.uid() check;
--   one is added below.
--
--   Left as is:
--     validate_invite_code, submit_demo_lead, get_trial_days  pre-login (anon)
--     can_setup, get_my_membership, get_my_tenant_ids, get_pm_accessible_tenant_ids,
--     get_pm_company_id, is_platform_admin, is_senior_pm      used inside RLS
--       policies, so the querying role must be able to execute them
--     remove_member, set_member_role, set_member_unit         already authenticated-only

-- ── 1. Server-only: service_role (and the postgres owner) only ─────────────
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'fin_gl_post', 'fin_settle_invoice',
        'record_unit_payment', 'reconcile_unit_payment', 'refund_unit_invoice',
        'link_chargebee_subscription', 'mark_trial_expired', 'provision_tenant',
        'generate_monthly_invoices', 'process_late_fees',
        'seed_chart_of_accounts', 'seed_fee_schedule', 'seed_letter_templates',
        'settle_ownership', 'mark_case_message_read', 'link_demo_lead'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

-- ── 2. Trigger functions: nobody needs EXECUTE ────────────────────────────
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- ── 3. Client-called: signed-in users only ────────────────────────────────
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'accept_invitation', 'cast_meeting_ballot', 'meeting_ballot_counts',
        'mark_channel_messages_read', 'transfer_ownership', 'accept_ownership_transfer'
      )
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- accept_invitation took p_user_id on trust: a caller with a valid code could
-- attach any user to the building. Require it to be the caller (service_role,
-- where auth.uid() is null, may still act for a user).
create or replace function public.accept_invitation(p_code text, p_user_id uuid, p_name text default ''::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_inv record;
  v_role_key text;
  v_board_title text;
  v_has_president boolean;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'You can only accept an invitation for yourself');
  end if;

  select * into v_inv from invitations
  where code = upper(p_code) and status = 'pending' and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  end if;

  if exists (select 1 from tenant_users where tenant_id = v_inv.tenant_id and user_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'You already belong to this building');
  end if;

  v_role_key := v_inv.role_key;

  -- A board invite with no seat becomes president if the building has none.
  if v_inv.role = 'board_member' and v_role_key is null then
    select exists (
      select 1 from tenant_users
      where tenant_id = v_inv.tenant_id and role = 'board_member' and role_key = 'president'
    ) into v_has_president;
    if not v_has_president then
      v_role_key := 'president';
    end if;
  end if;

  v_board_title := board_role_label(v_role_key);

  insert into tenant_users (tenant_id, user_id, role, unit, role_key, board_title, joined_at, status)
  values (v_inv.tenant_id, p_user_id, v_inv.role, v_inv.unit, v_role_key, v_board_title, now(), 'active');

  if v_inv.role = 'board_member' then
    insert into board_members (tenant_id, name, role, email, role_key)
    values (v_inv.tenant_id,
      coalesce(nullif(p_name, ''), v_inv.email),
      coalesce(v_board_title, ''),
      v_inv.email,
      v_role_key);
  end if;

  update invitations set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  perform settle_ownership(v_inv.tenant_id);

  insert into audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_inv.tenant_id, p_user_id, coalesce(nullif(p_name, ''), v_inv.email),
    v_inv.role::text, 'invitation.accepted', v_inv.email,
    format('Joined via invite code %s as %s (seat: %s)', v_inv.code, v_inv.role, coalesce(v_role_key, 'none')));

  return jsonb_build_object(
    'success', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'role_key', v_role_key,
    'unit', v_inv.unit
  );
end;
$function$;

-- mark_channel_messages_read let any caller stamp any tenant_users id onto any
-- channel's messages. p_user_id is a tenant_users.id (see CommunicationsTab);
-- require it to be the caller's own row in the channel's building.
create or replace function public.mark_channel_messages_read(p_channel_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not exists (
    select 1
    from team_channels c
    join tenant_users tu on tu.tenant_id = c.tenant_id
    where c.id = p_channel_id
      and tu.id = p_user_id
      and tu.user_id = auth.uid()
  ) then
    raise exception 'not_a_member_of_channel' using errcode = '42501';
  end if;

  update team_messages
  set read_by = array_append(read_by, p_user_id)
  where channel_id = p_channel_id
    and not (read_by @> array[p_user_id]);
end;
$function$;

-- create or replace keeps the existing ACL, but restate it in case either
-- function did not exist before.
revoke execute on function public.accept_invitation(text, uuid, text) from public, anon;
grant execute on function public.accept_invitation(text, uuid, text) to authenticated, service_role;
revoke execute on function public.mark_channel_messages_read(uuid, uuid) from public, anon;
grant execute on function public.mark_channel_messages_read(uuid, uuid) to authenticated, service_role;

-- ── 4. New functions are no longer client-executable by default ───────────
-- From here on a function created by postgres gets EXECUTE for postgres and
-- service_role only. A migration that adds a function the app calls with
-- supabase.rpc(), or one used inside an RLS policy, must grant it explicitly:
--   grant execute on function public.my_fn(args) to authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
-- The built-in default also gives PUBLIC (and so anon) EXECUTE; drop that too.
alter default privileges for role postgres
  revoke execute on functions from public;

-- ── 5. Fail if any definer function is client-reachable beyond the allowlist ──
do $$
declare
  leaked text;
begin
  select string_agg(format('%s (%s)', p.oid::regprocedure,
           concat_ws('+',
             case when has_function_privilege('anon', p.oid, 'execute') then 'anon' end,
             case when has_function_privilege('authenticated', p.oid, 'execute') then 'authenticated' end)), ', ')
    into leaked
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      (has_function_privilege('anon', p.oid, 'execute')
        and p.proname not in (
          'validate_invite_code', 'submit_demo_lead', 'get_trial_days',
          'can_setup', 'get_my_membership', 'get_my_tenant_ids',
          'get_pm_accessible_tenant_ids', 'get_pm_company_id',
          'is_platform_admin', 'is_senior_pm'))
      or
      (has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname not in (
          'validate_invite_code', 'submit_demo_lead', 'get_trial_days',
          'can_setup', 'get_my_membership', 'get_my_tenant_ids',
          'get_pm_accessible_tenant_ids', 'get_pm_company_id',
          'is_platform_admin', 'is_senior_pm',
          'accept_invitation', 'cast_meeting_ballot', 'meeting_ballot_counts',
          'mark_channel_messages_read', 'transfer_ownership', 'accept_ownership_transfer',
          'remove_member', 'set_member_role', 'set_member_unit'))
    );
  if leaked is not null then
    raise exception 'security definer functions still client-executable: %', leaked;
  end if;
end $$;
