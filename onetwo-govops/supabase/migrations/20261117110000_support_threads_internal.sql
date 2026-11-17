-- Threads ONE two raises for its own team (for example a request to assign an
-- On Call advisor) belong to a building but are not for the building to see.

alter table public.support_threads
  add column if not exists internal boolean not null default false;

comment on column public.support_threads.internal is
  'True for threads raised by ONE two for its own team (for example an On Call advisor request). Never shown to the building.';

update public.support_threads set internal = true where module = 'On Call';
