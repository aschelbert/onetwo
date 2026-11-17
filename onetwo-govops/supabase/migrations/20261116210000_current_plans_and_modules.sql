-- Bring the Admin Console's catalog up to what is sold and shipped today.
--
-- Plans: Self-Managed and Plus Facilities replace Compliance Pro, Community
-- Plus and Management Suite. On Call and the Property Manager Seat are
-- add-ons (kind = 'addon'), so the permissions matrix can show what each one
-- unlocks. Billing is through Chargebee, so each row carries its Chargebee
-- price ids and the old Stripe product links are dropped.
--
-- Modules: the registry is regrouped by the app's modules (Home, Building,
-- Community, Funds, Board Room, Me). Every entry is a leaf submodule.
--
-- The rows this replaces are copied to the backup_20261116 schema first.

-- ── 0. Backup ────────────────────────────────────────────────────────────
create schema if not exists backup_20261116;
create table backup_20261116.subscription_plans as select * from public.subscription_plans;
create table backup_20261116.plan_role_availability as select * from public.plan_role_availability;
create table backup_20261116.entitlements as select * from public.entitlements;
create table backup_20261116.role_permissions as select * from public.role_permissions;
create table backup_20261116.modules as select * from public.modules;
create table backup_20261116.submodules as select * from public.submodules;
create table backup_20261116.features as select * from public.features;
create table backup_20261116.tenancy_plans as select id, subscription_id from public.tenancies;
revoke all on schema backup_20261116 from anon, authenticated;
revoke all on all tables in schema backup_20261116 from anon, authenticated;

-- ── 1. Plans and add-ons ─────────────────────────────────────────────────
alter table public.subscription_plans
  add column if not exists kind text not null default 'plan' check (kind in ('plan', 'addon')),
  add column if not exists chargebee_price_monthly_id text,
  add column if not exists chargebee_price_yearly_id text;

insert into public.subscription_plans
  (id, name, slug, description, price_monthly, price_yearly, status, sort_order, color, kind,
   chargebee_price_monthly_id, chargebee_price_yearly_id, stripe_sync_status)
values
  ('self-managed', 'Self-Managed', 'self-managed',
   'The board runs the building. ONE two keeps it compliant.',
   17900, 179000, 'active', 1, '#c42030', 'plan',
   'Compliance-Pro-USD-Monthly', 'Compliance-Pro-USD-Yearly', 'not_synced'),
  ('plus-facilities', 'Plus Facilities', 'plus-facilities',
   'Everything in Self-Managed, plus inspected equipment and staff.',
   27900, 279000, 'active', 2, '#16a34a', 'plan',
   'Plus-Facilities-USD-Monthly', 'Plus-Facilities-USD-Yearly', 'not_synced'),
  ('on-call', 'On Call', 'on-call',
   'A named advisor who knows your building. $249/mo with Self-Managed, $499/mo with Plus Facilities.',
   24900, 249000, 'active', 3, '#d97706', 'addon',
   'On-Call-USD-Monthly', 'On-Call-USD-Yearly', 'not_synced'),
  ('pm-seat', 'Property Manager Seat', 'pm-seat',
   'A seat for the building''s property manager, so they work inside the building''s records.',
   7900, 79000, 'active', 4, '#7c3aed', 'addon',
   'PM-Seat-USD-Monthly', 'PM-Seat-USD-Yearly', 'not_synced');

update public.tenancies set subscription_id = 'plus-facilities' where subscription_id = 'management-suite';
update public.tenancies set subscription_id = 'self-managed' where subscription_id in ('compliance-pro', 'community-plus');

-- Cascades to the old plans' entitlements and role availability.
delete from public.subscription_plans where id in ('compliance-pro', 'community-plus', 'management-suite');

insert into public.plan_role_availability (plan_id, role_id) values
  ('self-managed', 'BOARD_MEMBER'), ('self-managed', 'RESIDENT'),
  ('plus-facilities', 'BOARD_MEMBER'), ('plus-facilities', 'RESIDENT'), ('plus-facilities', 'STAFF'),
  ('pm-seat', 'PROPERTY_MANAGER');

-- ── 2. Modules ───────────────────────────────────────────────────────────
-- Cascades to the old submodules and features.
delete from public.modules;
delete from public.role_permissions;
delete from public.entitlements;

insert into public.modules (id, name, slug, sort_order) values
  ('home', 'Home', 'home', 1),
  ('building', 'Building', 'building', 2),
  ('community', 'Community', 'community', 3),
  ('funds', 'Funds', 'funds', 4),
  ('board-room', 'Board Room', 'board-room', 5),
  ('me', 'Me', 'me', 6);

-- One row per registry entry: where it lives, who gets it (all plans, Plus
-- Facilities only, or an add-on), and each role's default access
-- (c = contributor, r = reader, n = no access).
create temporary table catalog_seed (
  id text, module_id text, name text, description text, sort_order int,
  availability text, board text, pm text, resident text, staff text
) on commit drop;

insert into catalog_seed values
  ('sm-agenda',         'home', 'Agenda and calendar', 'What needs the board this week, with every deadline on one calendar', 1, 'all', 'c', 'c', 'r', 'r'),
  ('sm-board-health',   'home', 'Board Health score', 'Stewardship score and trend across the building''s obligations', 2, 'all', 'c', 'r', 'n', 'n'),
  ('sm-setup',          'home', 'Setup', 'Guided setup: units, documents, payments, mail', 3, 'all', 'c', 'c', 'n', 'n'),

  ('sm-bldg-overview',  'building', 'Overview', 'Building profile and what needs attention', 1, 'all', 'c', 'c', 'r', 'r'),
  ('sm-documents',      'building', 'Documents', 'Governing documents, policies and records', 2, 'all', 'c', 'c', 'r', 'r'),
  ('sm-obligations',    'building', 'Obligations', 'Runbook of 45 DC obligations with due dates and filings', 3, 'all', 'c', 'c', 'r', 'n'),
  ('sm-contracts',      'building', 'Contracts', 'Vendors, contracts, insurance and lapse tracking', 4, 'all', 'c', 'c', 'r', 'n'),
  ('sm-directory',      'building', 'Directory', 'Units, owners and each unit''s share', 5, 'all', 'c', 'c', 'r', 'r'),
  ('sm-archive',        'building', 'Archive', 'The Archives: closed years and past records', 6, 'all', 'c', 'c', 'n', 'n'),
  ('sm-asset-registry', 'building', 'Asset registry', 'Assets with replacement years and reserve balance', 7, 'all', 'c', 'c', 'r', 'n'),
  ('sm-inspections',    'building', 'Inspection and permit calendar', 'Elevator, pool, fire systems, boiler', 8, 'facilities', 'c', 'c', 'r', 'r'),

  ('sm-notices',        'community', 'Notices', 'Announcements and pinned notices to owners', 1, 'all', 'c', 'c', 'r', 'n'),
  ('sm-meetings',       'community', 'Meetings', 'Meeting notices, agendas, minutes and reports', 2, 'all', 'c', 'c', 'r', 'n'),
  ('sm-votes',          'community', 'Votes', 'Elections and owner votes', 3, 'all', 'c', 'c', 'c', 'n'),
  ('sm-requests',       'community', 'Requests', 'Resident requests with status', 4, 'all', 'c', 'c', 'c', 'n'),
  ('sm-property-log',   'community', 'Property log', 'Running log of what happened at the property', 5, 'all', 'c', 'c', 'n', 'c'),
  ('sm-amenities',      'community', 'Amenities', 'Amenity reservations and rules', 6, 'facilities', 'c', 'c', 'c', 'n'),
  ('sm-pm-scorecard',   'community', 'PM scorecard', 'How the property manager is performing', 7, 'pm-seat', 'c', 'c', 'n', 'r'),

  ('sm-funds-overview', 'funds', 'Overview', 'Cash, reserves and the month at a glance', 1, 'all', 'c', 'c', 'r', 'n'),
  ('sm-income',         'funds', 'Income', 'Dues, collections and owner balances', 2, 'all', 'c', 'c', 'n', 'n'),
  ('sm-expenses',       'funds', 'Expenses', 'Bills, approvals and work order payments', 3, 'all', 'c', 'c', 'n', 'n'),
  ('sm-planning',       'funds', 'Planning', 'Annual budget, drafts and next year''s dues', 4, 'all', 'c', 'c', 'r', 'n'),
  ('sm-statements',     'funds', 'Statements & taxes', 'Monthly close, owner statements, 1099s', 5, 'all', 'c', 'c', 'r', 'n'),
  ('sm-online-payments','funds', 'Online payments', 'Owners pay dues online', 6, 'all', 'c', 'n', 'c', 'n'),
  ('sm-reserve-study',  'funds', 'Reserve study tools', 'Component schedules and funding scenarios', 7, 'facilities', 'c', 'c', 'r', 'n'),

  ('sm-current-actions','board-room', 'Current Actions', 'Open cases and what each one needs next', 1, 'all', 'c', 'c', 'n', 'n'),
  ('sm-inbox',          'board-room', 'Inbox', 'Incoming requests and items to triage', 2, 'all', 'c', 'c', 'n', 'n'),
  ('sm-runbooks',       'board-room', 'Runbooks', '32 playbooks, work orders and vendor onboarding', 3, 'all', 'c', 'c', 'n', 'n'),
  ('sm-outbox',         'board-room', 'Outbox', 'Letters and notices, drafted and mailed', 4, 'all', 'c', 'c', 'n', 'n'),
  ('sm-bids-claims',    'board-room', 'Bids and insurance claims', 'Bids workflow and insurance claims workflow', 5, 'facilities', 'c', 'c', 'n', 'n'),
  ('sm-tasks',          'board-room', 'Tasks', 'Tasks shared with the property manager', 6, 'pm-seat', 'c', 'c', 'n', 'c'),
  ('sm-intercom',       'board-room', 'Intercom', 'Board and manager messages in one place', 7, 'pm-seat', 'c', 'c', 'n', 'n'),

  ('sm-my-account',     'me', 'My Account', 'Profile and sign-in', 1, 'all', 'c', 'c', 'c', 'c'),
  ('sm-my-unit',        'me', 'My Unit', 'Balance, payments and unit details', 2, 'all', 'c', 'n', 'c', 'n'),
  ('sm-user-mgmt',      'me', 'User Management', 'Invite and manage board members and owners', 3, 'all', 'c', 'c', 'n', 'n'),
  ('sm-subscription',   'me', 'Subscription', 'Plan, add-ons and billing through Chargebee', 4, 'all', 'c', 'n', 'n', 'n'),
  ('sm-help',           'me', 'Help & Support', 'Guides and contact', 5, 'all', 'c', 'c', 'c', 'c'),
  ('sm-staff-role',     'me', 'Staff role', 'A seat for the porter, super or concierge', 6, 'facilities', 'c', 'n', 'n', 'c'),
  ('sm-on-call',        'me', 'On Call advisor', 'A named advisor, monthly call, replies within a business day', 7, 'on-call', 'c', 'r', 'n', 'n');

insert into public.submodules (id, module_id, name, slug, is_leaf, impl_status, description, sort_order)
select id, module_id, name, replace(id, 'sm-', ''), true, 'implemented', description, sort_order
from catalog_seed;

-- Plans include everything marked 'all'; Plus Facilities adds its own;
-- an add-on includes only what it unlocks.
insert into public.entitlements (atom_type, atom_id, plan_id, inclusion)
select 'submodule', c.id, p.id,
  (case
     when p.id = 'self-managed' and c.availability = 'all' then 'included'
     when p.id = 'plus-facilities' and c.availability in ('all', 'facilities') then 'included'
     when p.kind = 'addon' and c.availability = p.id then 'included'
     else 'not_included'
   end)::inclusion_level
from catalog_seed c
cross join public.subscription_plans p;

insert into public.role_permissions (atom_type, atom_id, role_id, access_level)
select 'submodule', c.id, r.role_id,
  (case r.code when 'c' then 'contributor' when 'r' then 'reader' else 'no_access' end)::access_level
from catalog_seed c
cross join lateral (values
  ('BOARD_MEMBER', c.board), ('PROPERTY_MANAGER', c.pm), ('RESIDENT', c.resident), ('STAFF', c.staff)
) as r(role_id, code);
