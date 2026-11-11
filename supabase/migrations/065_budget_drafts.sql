-- ============================================================================
-- ONE two HOA - Next year's budget draft, and the guided budget runbook
-- ============================================================================
-- 1. budget_drafts: one draft per building per fiscal year, the numbers the
--    Annual budget runbook's steps edit (each line's amount, the contracts
--    and premiums, the reserve contribution and the cushion, the dues, the
--    meeting that reviews it, when it was adopted, switched over and filed).
--    The board and the property manager read and write it; owners see the
--    adopted budget once it is filed under Building › Documents, never the
--    draft.
-- 2. run_annual_budget now opens the budget action with the ten guided
--    steps (src/ux2/boardroom/annualBudget.ts writes the same texts). The
--    first step ticks at once (the app starts the draft from this year's
--    numbers); the notice step ticks once a notice about the budget or dues
--    is posted after the action opened. Steps are found by their text, so
--    actions opened with the earlier nine steps keep ticking the right one.
-- ============================================================================

create table if not exists public.budget_drafts (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fy_start date not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (tenant_id, fy_start)
);
alter table public.budget_drafts enable row level security;

drop policy if exists "Board and manager manage budget drafts" on public.budget_drafts;
create policy "Board and manager manage budget drafts" on public.budget_drafts for all to authenticated
  using (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = budget_drafts.tenant_id and tu.role in ('board_member', 'property_manager')))
  with check (exists (select 1 from public.tenant_users tu where tu.user_id = auth.uid() and tu.tenant_id = budget_drafts.tenant_id and tu.role in ('board_member', 'property_manager')));
drop policy if exists "Admins manage budget drafts" on public.budget_drafts;
create policy "Admins manage budget drafts" on public.budget_drafts for all to authenticated
  using (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid()));

-- ── Annual budget: the guided steps ─────────────────────────────────────────
create or replace function run_annual_budget(p_tenant uuid, p_today date default current_date)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fs financial_settings%rowtype;
  v_fye text;
  v_cur_start date;
  v_start date;
  v_end date;
  v_label text;
  v_source_id text;
  v_notice date;
  v_case_id uuid;
  v_created date;
  v_opened boolean := false;
  v_ticked int := 0;
begin
  select * into fs from financial_settings where tenant_id = p_tenant;
  if not found then return jsonb_build_object('tenant', p_tenant, 'skipped', 'no financial settings'); end if;
  if 'annual-budget' = any(coalesce(fs.runbooks_off, '{}')) then return jsonb_build_object('tenant', p_tenant, 'skipped', 'runbook off'); end if;

  select coalesce(fiscal_year_end, '12-31') into v_fye from building_profiles where tenant_id = p_tenant limit 1;
  v_cur_start := fin_fiscal_year_start(p_today, v_fye);
  v_start := (v_cur_start + interval '1 year')::date;
  v_end := (v_start + interval '1 year')::date - 1;
  v_label := fin_fiscal_label(v_start, v_end);
  v_source_id := 'annual-budget:' || v_start::text;
  v_notice := v_start - 30;

  -- The runbook's own action, or one the board already has on next year's budget.
  select id, created_date into v_case_id, v_created from cases
   where tenant_id = p_tenant and ((source = 'runbook' and source_id = v_source_id)
      or (status <> 'closed' and ((source = 'obligation' and source_id = 'f1') or sit_id = 'annual-budgeting')))
   order by case when source = 'runbook' then 0 else 1 end limit 1;

  if v_case_id is null then
    if p_today < v_start - 90 then return jsonb_build_object('tenant', p_tenant, 'fyStart', v_start, 'skipped', 'not yet'); end if;
    insert into cases (tenant_id, local_id, cat_id, sit_id, title, unit, owner, approach, status, priority, created_date, notes,
                       assigned_role, due_date, source, source_id)
    values (p_tenant, 'annual-budget-' || v_start::text, 'financial', 'runbook-annual-budget', 'Annual budget · ' || v_label, '', 'Treasurer', 'pre', 'open', 'high', p_today,
            format('Opened by the Annual budget runbook on %s: the fiscal year %s starts %s. Each step walks through the draft; owners must hear the adopted budget and the dues by %s.', p_today::text, v_label, v_start::text, v_notice::text),
            'Treasurer', v_notice, 'runbook', v_source_id)
    returning id into v_case_id;
    v_created := p_today;
    insert into case_steps (tenant_id, case_id, local_id, step_text, detail, sort_order) values
      (p_tenant, v_case_id, 's0', format('Start the %s draft from this year''s numbers', v_label),
       'The app copies every budget line with what has been spent so far, the vendor contracts, the insurance premiums, the reserve study and today''s dues into a draft for next year. This step ticks itself when the action opens.', 0),
      (p_tenant, v_case_id, 's1', 'Check next year''s contracts and insurance',
       'Confirm what each vendor contract and insurance policy will cost next year and which line pays for it. Change a price on the contract or the policy and the draft follows.', 1),
      (p_tenant, v_case_id, 's2', format('Set every line for %s', v_label),
       'Each line has a suggestion from this year''s spending. Accept it or type your own; the step ticks itself when every line has been looked at.', 2),
      (p_tenant, v_case_id, 's3', 'Set the reserve contribution and a cushion',
       'How much goes into reserves for future repairs, from the reserve study, and a contingency for the unexpected (3 to 5% is usual).', 3),
      (p_tenant, v_case_id, 's4', format('Pick the %s dues', v_label),
       'The dues that pay for the lines, the cushion and the reserves, split by each unit''s share. The app checks the bylaws'' limit on an increase without an owner vote.', 4),
      (p_tenant, v_case_id, 's5', 'Put the draft on a board meeting''s agenda',
       'Add it to a board meeting as a decision with a board vote, with the proposed budget attached as it stands.', 5),
      (p_tenant, v_case_id, 's6', 'Board votes to adopt the budget',
       'The vote happens at the meeting and is recorded there; this step ticks itself when it passes. A vote taken elsewhere can be recorded on this action.', 6),
      (p_tenant, v_case_id, 's7', format('Tell owners by %s: the adopted budget and the new dues', v_notice::text),
       'The notice is written for you from the adopted budget. This step ticks itself when a notice about the budget is posted after this action opened.', 7),
      (p_tenant, v_case_id, 's8', format('Switch Funds to the %s budget and dues on %s', v_label, v_start::text),
       'On that day the app puts the adopted lines into Funds › Planning, each unit''s new dues on its account, and the new reserve transfer. It can also be done earlier by hand.', 8),
      (p_tenant, v_case_id, 's9', 'File the adopted budget under Building › Documents',
       'The app writes the adopted budget as a document and files it under Budgets, where owners can read it.', 9);
    v_opened := true;
  end if;

  -- Only the runbook's own action carries these steps.
  if exists (select 1 from cases where id = v_case_id and status <> 'closed' and source = 'runbook' and source_id = v_source_id) then
    update case_steps set done = true, done_date = p_today
     where case_id = v_case_id and (step_text ~* '^(start|roll) the .* draft') and not done;
    if found then v_ticked := v_ticked + 1; end if;
    if exists (select 1 from announcements a where a.tenant_id = p_tenant and a.title ~* '(budget|dues)' and a.category in ('financial', 'meeting', 'general') and a.posted_date >= v_created) then
      update case_steps set done = true, done_date = p_today where case_id = v_case_id and step_text ~* '^tell owners' and not done;
      if found then v_ticked := v_ticked + 1; end if;
    end if;
  end if;

  return jsonb_build_object('tenant', p_tenant, 'fyStart', v_start, 'caseId', v_case_id, 'opened', v_opened, 'ticked', v_ticked);
end $$;

revoke all on function run_annual_budget(uuid, date) from public;
grant execute on function run_annual_budget(uuid, date) to service_role;
