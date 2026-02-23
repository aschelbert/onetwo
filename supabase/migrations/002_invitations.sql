-- Invitations table for tenant-scoped invite system
-- Run in Supabase SQL Editor

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  email text not null,
  role tenant_role not null default 'resident',
  unit text,
  code text not null unique,
  invited_by uuid references auth.users(id),
  invited_by_name text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz
);

create index idx_invitations_code on invitations(code);
create index idx_invitations_tenant on invitations(tenant_id);
create index idx_invitations_email on invitations(email);

-- RLS
alter table invitations enable row level security;

create policy "Users see own tenant invitations" on invitations for select
  using (tenant_id in (select tenant_id from tenant_users where user_id = auth.uid()));

create policy "Board members manage invitations" on invitations for all
  using (tenant_id in (
    select tenant_id from tenant_users
    where user_id = auth.uid() and role = 'board_member'
  ));

create policy "Admins manage all invitations" on invitations for all
  using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Anyone can read an invitation by code (for validation during signup)
-- This uses a security definer function instead of a public policy
create or replace function validate_invite_code(p_code text)
returns jsonb as $$
declare
  v_inv record;
begin
  select i.id, i.tenant_id, i.email, i.role, i.unit, i.status, i.expires_at,
         t.name as building_name, t.subdomain
  into v_inv
  from invitations i
  join tenants t on t.id = i.tenant_id
  where i.code = upper(p_code)
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'error', 'Invalid invitation code');
  end if;

  if v_inv.status != 'pending' then
    return jsonb_build_object('valid', false, 'error', 'This invitation has already been ' || v_inv.status);
  end if;

  if v_inv.expires_at < now() then
    return jsonb_build_object('valid', false, 'error', 'This invitation has expired');
  end if;

  return jsonb_build_object(
    'valid', true,
    'invitation_id', v_inv.id,
    'tenant_id', v_inv.tenant_id,
    'email', v_inv.email,
    'role', v_inv.role,
    'unit', v_inv.unit,
    'building_name', v_inv.building_name,
    'subdomain', v_inv.subdomain
  );
end;
$$ language plpgsql security definer;

-- Accept an invitation: links user to tenant
create or replace function accept_invitation(p_code text, p_user_id uuid, p_name text default '')
returns jsonb as $$
declare
  v_inv record;
begin
  select * into v_inv from invitations
  where code = upper(p_code) and status = 'pending' and expires_at > now()
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  end if;

  -- Check if user already belongs to this tenant
  if exists (select 1 from tenant_users where tenant_id = v_inv.tenant_id and user_id = p_user_id) then
    return jsonb_build_object('success', false, 'error', 'You already belong to this building');
  end if;

  -- Link user to tenant
  insert into tenant_users (tenant_id, user_id, role, unit, status)
  values (v_inv.tenant_id, p_user_id, v_inv.role, v_inv.unit, 'active');

  -- Mark invitation as accepted
  update invitations set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  -- Audit log
  insert into audit_log (tenant_id, actor_id, actor_name, actor_role, action, target, details)
  values (v_inv.tenant_id, p_user_id, coalesce(nullif(p_name, ''), v_inv.email),
    v_inv.role::text, 'invitation.accepted', v_inv.email,
    format('Joined via invite code %s as %s', v_inv.code, v_inv.role));

  return jsonb_build_object(
    'success', true,
    'tenant_id', v_inv.tenant_id,
    'role', v_inv.role,
    'unit', v_inv.unit
  );
end;
$$ language plpgsql security definer;

