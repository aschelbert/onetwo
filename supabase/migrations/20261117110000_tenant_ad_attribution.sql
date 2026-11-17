-- Ad attribution: which ad sent the signup that created this building.
-- Filled in by the chargebee-webhook function right after provision_tenant,
-- from the UTM tags the visitor's first landing URL carried.

alter table tenants
  add column if not exists utm_source        text,
  add column if not exists utm_medium        text,
  add column if not exists utm_campaign      text,
  add column if not exists utm_term          text,
  add column if not exists utm_content       text,
  add column if not exists first_landing_url text;

comment on column tenants.utm_source is 'Ad platform that sent the signup, e.g. google, reddit, nextdoor, chatgpt';
comment on column tenants.first_landing_url is 'First URL the signing-up visitor landed on, query string included';

create index if not exists idx_tenants_utm_source on tenants(utm_source) where utm_source is not null;
