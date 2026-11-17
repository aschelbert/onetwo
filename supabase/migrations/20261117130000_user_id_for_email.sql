-- Look up an account by email, for the server only.
--
-- Someone signing up a building with an email that already has an account can
-- choose to sign in after paying instead of before. chargebee-checkout then
-- has no session to tell it whose building this is, so it resolves the email
-- to the account here and the webhook attaches the building to it.
--
-- Service role only: exposed to clients it would let anyone test which emails
-- have accounts, and map them to ids.

create or replace function public.user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  order by u.created_at
  limit 1;
$$;

revoke execute on function public.user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.user_id_for_email(text) to service_role;
