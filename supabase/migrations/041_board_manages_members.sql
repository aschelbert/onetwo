-- ─────────────────────────────────────────────────────────────────────────────
-- 041: the board changes members' roles and removes members.
--
-- User Management's Change role and Remove updated tenant_users directly,
-- which board members can't do (only platform admins can), so nothing changed
-- while the page said it had. Remove also only set status = 'inactive', which
-- nothing checks: the sign-in lookup and most policies ignore status, so a
-- "removed" member kept their access. Now:
--
--   set_member_role(member, role): board members of the building (or a
--     platform admin) change another member's role. Leaving the board clears
--     the board seat. The account owner's role changes through ownership
--     transfer, and the building always keeps one board member.
--   remove_member(member): the same people remove another member. The
--     membership is deleted, so the access goes with it. Their unit record,
--     ledger and votes are kept (they belong to the unit). The account owner
--     and the last board member can't be removed.
--
-- Messages and tasks keep their author's name (stored on the row); the link to
-- a removed member's membership is cleared instead of blocking the removal.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.team_messages alter column sender_id drop not null;
alter table public.team_messages drop constraint if exists team_messages_sender_id_fkey;
alter table public.team_messages add constraint team_messages_sender_id_fkey foreign key (sender_id) references public.tenant_users(id) on delete set null;

alter table public.case_messages alter column sender_id drop not null;
alter table public.case_messages drop constraint if exists case_messages_sender_id_fkey;
alter table public.case_messages add constraint case_messages_sender_id_fkey foreign key (sender_id) references public.tenant_users(id) on delete set null;

alter table public.association_tasks alter column created_by drop not null;
alter table public.association_tasks drop constraint if exists association_tasks_created_by_fkey;
alter table public.association_tasks add constraint association_tasks_created_by_fkey foreign key (created_by) references public.tenant_users(id) on delete set null;

alter table public.association_tasks alter column assigned_to drop not null;
alter table public.association_tasks drop constraint if exists association_tasks_assigned_to_fkey;
alter table public.association_tasks add constraint association_tasks_assigned_to_fkey foreign key (assigned_to) references public.tenant_users(id) on delete set null;

-- Shared checks: who may manage this member, and whether this change would leave the building without a board.
create or replace function public.member_change_refused(p_member public.tenant_users, p_leaves_board boolean)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = p_member.tenant_id and tu.role = 'board_member' and tu.status = 'active')
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  ) then
    return 'Only the board can change members';
  end if;
  if p_member.user_id = auth.uid() then
    return 'You can''t change your own access here';
  end if;
  if p_member.is_account_owner then
    return 'The account owner changes through ownership transfer (Subscription)';
  end if;
  if p_leaves_board and p_member.role = 'board_member' and not exists (
    select 1 from public.tenant_users tu
    where tu.tenant_id = p_member.tenant_id and tu.role = 'board_member' and tu.status = 'active' and tu.id <> p_member.id
  ) then
    return 'The building needs at least one board member';
  end if;
  return null;
end;
$$;
revoke all on function public.member_change_refused(public.tenant_users, boolean) from public, anon, authenticated;

create or replace function public.set_member_role(p_member_id uuid, p_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.tenant_users;
  v_role public.tenant_role;
  v_refused text;
begin
  select * into v_member from public.tenant_users where id = p_member_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Member not found'); end if;
  begin
    v_role := lower(trim(p_role))::public.tenant_role;
  exception when others then
    return jsonb_build_object('success', false, 'error', format('%s isn''t a role', p_role));
  end;
  if v_role = v_member.role then return jsonb_build_object('success', true, 'role', v_role); end if;

  v_refused := public.member_change_refused(v_member, v_role <> 'board_member');
  if v_refused is not null then return jsonb_build_object('success', false, 'error', v_refused); end if;

  update public.tenant_users
  set role = v_role,
      role_key = case when v_role = 'board_member' then role_key else null end,
      board_title = case when v_role = 'board_member' then board_title else null end
  where id = p_member_id;

  insert into public.audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_member.tenant_id, auth.uid(),
    coalesce((select nullif(tu.name, '') from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id), 'Board'),
    coalesce((select tu.role::text from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id), 'platform_admin'),
    'member.role_changed', p_member_id::text, format('%s → %s', v_member.role, v_role));

  perform public.settle_ownership(v_member.tenant_id);
  return jsonb_build_object('success', true, 'role', v_role);
end;
$$;
revoke all on function public.set_member_role(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated;

create or replace function public.remove_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.tenant_users;
  v_refused text;
  v_name text;
begin
  select * into v_member from public.tenant_users where id = p_member_id;
  if not found then return jsonb_build_object('success', false, 'error', 'Member not found'); end if;

  v_refused := public.member_change_refused(v_member, true);
  if v_refused is not null then return jsonb_build_object('success', false, 'error', v_refused); end if;

  v_name := coalesce(nullif(v_member.name, ''), (select u.email from auth.users u where u.id = v_member.user_id), 'Member');
  delete from public.tenant_users where id = p_member_id;

  insert into public.audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_member.tenant_id, auth.uid(),
    coalesce((select nullif(tu.name, '') from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id), 'Board'),
    coalesce((select tu.role::text from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = v_member.tenant_id), 'platform_admin'),
    'member.removed', p_member_id::text,
    format('%s (%s%s) removed', v_name, v_member.role, case when v_member.unit is not null then ', unit ' || v_member.unit else '' end));

  perform public.settle_ownership(v_member.tenant_id);
  return jsonb_build_object('success', true);
end;
$$;
revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;
