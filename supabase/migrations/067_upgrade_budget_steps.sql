-- ============================================================================
-- ONE two HOA - Budget actions opened before the guided steps get them
-- ============================================================================
-- Migration 065 gave the Annual budget runbook ten guided steps, but an
-- action is opened with the steps of its day: budget actions opened before
-- it (by the runbook, or by hand from Take Action › Annual Budgeting) still
-- have the earlier nine. This rewrites the steps of every OPEN one that
-- still has them to the guided ten, keeping what was done:
--
--   runbook action (sit_id runbook-annual-budget), earlier step → new step
--     Roll the draft forward           → Start the draft
--     Pick the dues option and reserve → Set the reserve and a cushion; Pick the dues
--     Contracts and insurance          → Check contracts and insurance
--     Board reviews at a meeting       → Put the draft on a meeting's agenda
--     Board votes to adopt             → Board votes to adopt
--     Tell owners                      → Tell owners
--     Set the dues + Enter the lines   → Switch Funds over (both done)
--     File the adopted budget          → File the adopted budget
--   action opened by hand (sit_id annual-budgeting, approach pre)
--     Review current year financials   → Start the draft
--     Review reserve study             → Set the reserve and a cushion
--     Obtain bids, contract renewals   → Check contracts and insurance
--     Draft proposed budget            → Set every line
--     Check whether increase needs vote→ Pick the dues
--     Schedule budget presentation     → Put the draft on a meeting's agenda
--     Distribute and adopt             → Board votes to adopt
--
-- Closed actions keep the steps they were closed with. Runs once: an
-- action already on the guided steps is left alone. The app's own copy of
-- the step texts is src/ux2/boardroom/annualBudget.ts (runbook) and the
-- annual-budgeting situation in src/store/useIssuesStore.ts (by hand).
-- ============================================================================

do $$
declare
  c record;
  v_start date;
  v_end date;
  v_label text;
  v_notice date;
  s_start boolean; s_costs boolean; s_lines boolean; s_reserve boolean; s_dues boolean;
  s_review boolean; s_adopt boolean; s_notify boolean; s_switch boolean; s_file boolean;
  d_start date; d_costs date; d_lines date; d_reserve date; d_dues date;
  d_review date; d_adopt date; d_notify date; d_switch date; d_file date;
  -- done, and when, for the first earlier step matching a pattern
  f_done text := 'select coalesce(bool_or(done), false), max(done_date) from case_steps where case_id = $1 and step_text ~* $2';
begin
  for c in
    select * from cases
     where status <> 'closed'
       and ((sit_id = 'runbook-annual-budget' and source = 'runbook' and source_id like 'annual-budget:%')
         or (sit_id = 'annual-budgeting' and coalesce(approach, 'pre') = 'pre'))
       and exists (select 1 from case_steps s where s.case_id = cases.id
                   and s.step_text ~* '^(roll the .* draft forward|review current year financials)')
  loop
    if c.sit_id = 'runbook-annual-budget' then
      execute f_done into s_start, d_start using c.id, '^roll the .* draft forward';
      execute f_done into s_dues, d_dues using c.id, '^pick the dues option';
      s_reserve := s_dues; d_reserve := d_dues;
      execute f_done into s_costs, d_costs using c.id, 'contracts and insurance';
      s_lines := false; d_lines := null;
      execute f_done into s_review, d_review using c.id, 'reviews the draft';
      execute f_done into s_adopt, d_adopt using c.id, 'votes to adopt';
      execute f_done into s_notify, d_notify using c.id, '^tell owners';
      select coalesce(bool_and(done), false), max(done_date) into s_switch, d_switch from case_steps where case_id = c.id and step_text ~* '(dues on the fee schedule|enter the adopted lines)';
      execute f_done into s_file, d_file using c.id, '^file the adopted budget';
      v_start := substring(c.source_id from 15)::date;
    else
      execute f_done into s_start, d_start using c.id, '^review current year financials';
      execute f_done into s_reserve, d_reserve using c.id, '^review reserve study';
      execute f_done into s_costs, d_costs using c.id, '^obtain bids, contract renewals';
      execute f_done into s_lines, d_lines using c.id, '^draft proposed budget';
      execute f_done into s_dues, d_dues using c.id, 'assessment increase triggers owner vote';
      execute f_done into s_review, d_review using c.id, '^schedule budget presentation';
      execute f_done into s_adopt, d_adopt using c.id, 'and adopt budget';
      s_notify := false; s_switch := false; s_file := false; d_notify := null; d_switch := null; d_file := null;
      v_start := null;
    end if;

    delete from case_steps where case_id = c.id;

    if c.sit_id = 'runbook-annual-budget' then
      v_end := (v_start + interval '1 year')::date - 1;
      v_label := fin_fiscal_label(v_start, v_end);
      v_notice := v_start - 30;
      insert into case_steps (tenant_id, case_id, local_id, step_text, detail, done, done_date, sort_order) values
        (c.tenant_id, c.id, 's0', format('Start the %s draft from this year''s numbers', v_label),
         'The app copies every budget line with what has been spent so far, the vendor contracts, the insurance premiums, the reserve study and today''s dues into a draft for next year. This step ticks itself when the action opens.', s_start, case when s_start then coalesce(d_start, current_date) end, 0),
        (c.tenant_id, c.id, 's1', 'Check next year''s contracts and insurance',
         'Confirm what each vendor contract and insurance policy will cost next year and which line pays for it. Change a price on the contract or the policy and the draft follows.', s_costs, case when s_costs then coalesce(d_costs, current_date) end, 1),
        (c.tenant_id, c.id, 's2', format('Set every line for %s', v_label),
         'Each line has a suggestion from this year''s spending. Accept it or type your own; the step ticks itself when every line has been looked at.', s_lines, case when s_lines then coalesce(d_lines, current_date) end, 2),
        (c.tenant_id, c.id, 's3', 'Set the reserve contribution and a cushion',
         'How much goes into reserves for future repairs, from the reserve study, and a contingency for the unexpected (3 to 5% is usual).', s_reserve, case when s_reserve then coalesce(d_reserve, current_date) end, 3),
        (c.tenant_id, c.id, 's4', format('Pick the %s dues', v_label),
         'The dues that pay for the lines, the cushion and the reserves, split by each unit''s share. The app checks the bylaws'' limit on an increase without an owner vote.', s_dues, case when s_dues then coalesce(d_dues, current_date) end, 4),
        (c.tenant_id, c.id, 's5', 'Put the draft on a board meeting''s agenda',
         'Add it to a board meeting as a decision with a board vote, with the proposed budget attached as it stands.', s_review, case when s_review then coalesce(d_review, current_date) end, 5),
        (c.tenant_id, c.id, 's6', 'Board votes to adopt the budget',
         'The vote happens at the meeting and is recorded there; this step ticks itself when it passes. A vote taken elsewhere can be recorded on this action.', s_adopt, case when s_adopt then coalesce(d_adopt, current_date) end, 6),
        (c.tenant_id, c.id, 's7', format('Tell owners by %s: the adopted budget and the new dues', v_notice::text),
         'The notice is written for you from the adopted budget. This step ticks itself when a notice about the budget is posted after this action opened.', s_notify, case when s_notify then coalesce(d_notify, current_date) end, 7),
        (c.tenant_id, c.id, 's8', format('Switch Funds to the %s budget and dues on %s', v_label, v_start::text),
         'On that day the app puts the adopted lines into Funds › Planning, each unit''s new dues on its account, and the new reserve transfer. It can also be done earlier by hand.', s_switch, case when s_switch then coalesce(d_switch, current_date) end, 8),
        (c.tenant_id, c.id, 's9', 'File the adopted budget under Building › Documents',
         'The app writes the adopted budget as a document and files it under Budgets, where owners can read it.', s_file, case when s_file then coalesce(d_file, current_date) end, 9);
    else
      insert into case_steps (tenant_id, case_id, local_id, step_text, done, done_date, sort_order) values
        (c.tenant_id, c.id, 's0', 'Start next year''s draft from this year''s numbers', s_start, case when s_start then coalesce(d_start, current_date) end, 0),
        (c.tenant_id, c.id, 's1', 'Check next year''s contracts and insurance', s_costs, case when s_costs then coalesce(d_costs, current_date) end, 1),
        (c.tenant_id, c.id, 's2', 'Set every line for next year', s_lines, case when s_lines then coalesce(d_lines, current_date) end, 2),
        (c.tenant_id, c.id, 's3', 'Set the reserve contribution and a cushion', s_reserve, case when s_reserve then coalesce(d_reserve, current_date) end, 3),
        (c.tenant_id, c.id, 's4', 'Pick next year''s dues', s_dues, case when s_dues then coalesce(d_dues, current_date) end, 4),
        (c.tenant_id, c.id, 's5', 'Put the draft on a board meeting''s agenda', s_review, case when s_review then coalesce(d_review, current_date) end, 5),
        (c.tenant_id, c.id, 's6', 'Board votes to adopt the budget', s_adopt, case when s_adopt then coalesce(d_adopt, current_date) end, 6),
        (c.tenant_id, c.id, 's7', 'Tell owners: the adopted budget and the new dues', false, null, 7),
        (c.tenant_id, c.id, 's8', 'Switch Funds to the new budget and dues on the first day of the year', false, null, 8),
        (c.tenant_id, c.id, 's9', 'File the adopted budget under Building › Documents', false, null, 9);
    end if;
  end loop;
end $$;
