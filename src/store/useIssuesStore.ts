import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled, getActiveTenantId } from '@/lib/supabase';
import * as issuesSvc from '@/lib/services/issues';
import * as casesSvc from '@/lib/services/cases';
import type { Issue, CaseTrackerCase, CaseStep, CaseComm, CaseAttachment, BoardVote, CaseApproach, CasePriority, AdditionalApproach, CaseCheckItem, SpendingDecision, Bid, ConflictCheck, ConflictDeclaration, DecisionTrailEntry, Action, PersistentAction, BudgetFinancials } from '@/types/issues';
import { ANNUAL_BUDGET_FINANCIALS } from '@/features/issues/components/shell/budgetData';

// ─── Situation Templates ───────────────────────────────────
export interface StepAction {
  type: 'navigate' | 'modal' | 'inline';
  target: string;
  label: string;
}

export interface SituationStep {
  s: string; t?: string; d?: string | null; detail?: string | null; w?: string;
  action?: StepAction;
  ph?: string;
  ck?: string[];
  isSpendingDecision?: boolean;
  requiresBids?: boolean;
  minimumBids?: number;
  requiresConflictCheck?: boolean;
  desc?: string;
  actions?: Omit<Action, 'done' | 'doneDate'>[];
  persistent?: PersistentAction[];
}
export interface Situation {
  id: string; title: string; desc: string;
  tags: string[];
  pre: SituationStep[];
  self: SituationStep[];
  legal: SituationStep[];
  notes: Record<string, string>;
}
export interface Category {
  id: string; num: string; icon: string; label: string; color: string;
  sits: Situation[];
}

export const CATS: Category[] = [
  { id:'financial', num:'1', icon:'💰', label:'Fiscal Lens', color:'emerald',
    sits: [
      { id:'annual-budgeting', title:'Annual Budgeting', desc:'Setting assessments, forecasting costs, funding reserves',
        tags:['Setting annual assessments','Forecasting operating costs','Funding reserves','Budget ratification'],
        pre:[
          {s:'Review current year financials',t:'90 days before fiscal year-end',d:'Bylaws: Budget provisions',
           desc:'Review the association\'s current financial position including reconciliations, budget variance, collections, reserves, and year-end projections to establish a baseline for next year\'s budget.',
           actions:[
             {id:'reconciliations',type:'report',label:'Confirm reconciliations complete (bank + reserves)',reportType:'reconciliation',reportDesc:'Verify all bank and reserve accounts are reconciled to current month-end.'},
             {id:'budget-variance',type:'report',label:'Budget Variance: Identify structural vs one-time variances',reportType:'budgetVariance',reportDesc:'Review each budget category for variances.'},
             {id:'collections',type:'report',label:'Review collection rate, delinquency trend, outstanding receivables',reportType:'collections',reportDesc:'Analyze assessment collection rates and delinquency trends.'},
             {id:'reserves',type:'report',label:'Reserve balances, funding rates — confirm no operating expenses from reserves',reportType:'reserveBalances',reportDesc:'Review reserve fund balances and contribution rates.'},
             {id:'projections',type:'report',label:'Validate year-end projections (not just YTD actuals)',reportType:'yearEndProjections',reportDesc:'Extrapolate current run-rates to fiscal year-end.'}
           ],
           persistent:[
             {type:'link',label:'Open Financial Dashboard',target:'financial'},
             {type:'upload',label:'Upload Document'}
           ],
           ph:'gather'},
          {s:'Review reserve study: what capital projects are coming in the next 1-5 years? Is the reserve contribution adequate?',t:'60-90 days out',d:'Reserve study & Fiscal Lens: Reserves',desc:'Evaluate the reserve study to ensure adequate funding for upcoming capital projects and prevent future special assessments.',detail:'This is the most important budget decision. If reserve funding is below 70%, you should increase the annual contribution — even if it means a slightly higher assessment. Every dollar NOT contributed to reserves today becomes a dollar in a future special assessment. Check the reserve study\'s recommended annual contribution and compare to your current amount.',action:{type:'inline',target:'reserve-study',label:'Review Reserve Study'},ph:'gather',ck:['Review upcoming capital projects (1-5 year horizon)','Check reserve percent funded','Compare current contribution to study recommendation']},
          {s:'Build a 3-year financial outlook',t:'60-90 days out',desc:'Look beyond next year to anticipate expiring contracts, capital projects, insurance changes, and model scenarios for dues increases, insurance inflation, and delinquency impact over a 3-year horizon.',detail:'Beyond next year\'s budget, think 3 years ahead. Are there: major contracts expiring (management, insurance, elevator)? Capital projects in the reserve study within 3 years? Insurance premium increases expected? A 3-year outlook prevents surprise assessments and gives the board time to plan. Model different dues increase scenarios (0%, 5%, 10%), insurance inflation (3.5% standard vs 10% spike), and delinquency impacts (5-10% increase). Identify the year reserves dip below safe threshold and where special assessments may be triggered. Share this outlook with owners — it builds confidence.',
           actions:[
             {id:'outlook-base',type:'report',label:'Review vendor contracts, capital projects & insurance projections',reportType:'outlookBase',reportDesc:'Review expiring contracts, upcoming capital projects, and insurance premium trends over the next 3 years.'},
             {id:'dues-scenarios',type:'report',label:'Model dues under 0%, 5%, 10% increase scenarios',reportType:'duesScenarios',reportDesc:'Compare net surplus or shortfall under different annual dues increase assumptions.'},
             {id:'insurance-scenarios',type:'report',label:'Model insurance inflation (3.5% standard & 10% annualized)',reportType:'insuranceScenarios',reportDesc:'Compare total insurance cost projections under standard vs elevated inflation scenarios.'},
             {id:'delinquency-scenarios',type:'report',label:'Model 5–10% delinquency increase scenario',reportType:'delinquencyScenarios',reportDesc:'Estimate lost revenue impact if delinquency rate increases above current levels.'},
             {id:'reserve-threshold',type:'report',label:'Identify year reserves dip below safe threshold',reportType:'reserveThreshold',reportDesc:'Project reserve balance and percent funded over 5 years to identify when reserves fall below 30% funded.'},
             {id:'assessment-triggers',type:'report',label:'Identify potential special assessment trigger points',reportType:'assessmentTriggers',reportDesc:'Flag conditions across all scenarios that may require a special assessment.'}
           ],
           persistent:[
             {type:'link',label:'Open Financial Dashboard',target:'financial'},
             {type:'upload',label:'Upload Document'}
           ],
           ph:'gather'},
          {s:'Obtain bids, contract renewals, and cost estimates for all operating expenses',t:'60-90 days out',d:'Vendor contracts',desc:'Review vendor contracts for renewal terms and obtain competitive bids for expiring agreements.',detail:'Review each vendor contract for renewal terms and rate changes. Obtain competitive bids for expiring contracts. Factor in inflation (typically 3-5% for utilities, insurance often higher). Don\'t just roll forward last year\'s numbers — cost assumptions should be justified.',action:{type:'inline',target:'contract-renewals',label:'Review Contracts & Renewals'},ph:'gather',ck:['Review vendor contract renewal terms','Obtain competitive bids for expiring contracts','Factor in inflation for utilities and insurance']},
          {s:'Draft proposed budget: operating expenses + reserve contribution + contingency = total; calculate per-unit assessment',t:'60 days out',desc:'Assemble the budget structure with itemized operating expenses, reserve contribution, and contingency to calculate per-unit assessments.',detail:'Budget structure: (1) Operating expenses by category (use Fiscal Lens Budget tab). (2) Reserve contribution (per reserve study recommendation). (3) Contingency (3-5% of operating budget — covers unexpected costs without raiding reserves). (4) Total divided by total percentage interests = per-unit assessment. Show the per-unit impact clearly.',action:{type:'inline',target:'budget-drafter',label:'Draft Budget'},ph:'draft',ck:['Itemize operating expenses by category','Set reserve contribution per study','Add 3-5% contingency','Calculate per-unit assessment']},
          {s:'Check whether assessment increase triggers owner vote per bylaws or statute',t:'With budget draft',d:'Bylaws & DC Code § 29-1135.02',desc:'Determine if the proposed assessment increase exceeds the bylaws cap and requires owner ratification.',detail:'Check bylaws for assessment increase cap (commonly 10-15% without owner vote). If increase exceeds cap, owner vote or ratification is required. If you need a large increase, consider phasing it over 2 years (e.g., 10% this year, 8% next year) to stay within the cap.',action:{type:'inline',target:'bylaws-review',label:'Check Assessment Limits'},ph:'draft'},
          {s:'Schedule budget presentation at open board meeting',t:'30 days before adoption',d:'DC Code § 29-1135.02',desc:'Present the proposed budget in plain language, explaining the rationale behind every increase. Allow written questions from owners who cannot attend.',detail:'DC requires 30-day notice before budget adoption. Owners don\'t need to understand every line item — they need to know: (1) What is my assessment? (2) Why is it changing? (3) What am I getting for it? (4) What happens to reserves? Present in these terms, not accounting jargon. Allow written questions from owners who cannot attend.',ph:'present'},
          {s:'Collect owner feedback and conduct owner vote if required by bylaws',t:'14-21 days after presentation',d:'Bylaws: Owner voting provisions',desc:'Open a formal feedback period, collect written owner questions, and conduct the owner vote if the assessment increase exceeds the bylaws cap.',detail:'After presenting the budget, allow a formal feedback period. Collect written owner questions and respond in writing. If the assessment increase exceeds the bylaws cap (see Step 6), conduct an owner vote — typically requiring 2/3 (66.7%) approval in DC. Record vote results including quorum count.',action:{type:'modal',target:'owner-vote',label:'Record Owner Vote'},ph:'present',ck:['Open feedback period (min 14 days)','Collect written owner questions','Conduct owner vote if required','Record vote results and quorum']},
          {s:'Distribute formal budget package and adopt budget',t:'30 days before effective',d:'DC Code § 29-1135.02 & Bylaws',desc:'Send the final budget package with assessment notice to all owners and conduct the board vote to adopt.',detail:'Package should include: proposed budget with prior year comparison, reserve funding status, assessment amount and effective date, explanation of changes, and a summary of upcoming capital needs from the reserve study. Send via method required by bylaws. Record vote in minutes with full budget attached. If owners reject the budget, operate under prior year budget until a revised budget is adopted.',w:'Owner ratification required when assessment increase exceeds bylaws cap — see Bylaws & DC Code § 29-1135.02',ph:'present',ck:['Prepare budget with prior year comparison','Include reserve funding status','Include assessment amount and effective date','Include explanation of changes','Send via required method','Board vote recorded in minutes']}
        ],
        self:[
          {s:'Respond to owner disputes of assessment increase with written justification citing DC Code § 29-1135.02',t:'Within 14 days of dispute',d:'DC Code § 29-1135.02 & Bylaws',
           desc:'When an owner formally disputes the assessment increase, provide a written response with the factual basis for the increase, bylaws authority, reserve study data, and cost comparisons to comparable DC condominiums.',
           detail:'Your response should include: (1) The specific bylaw provision authorizing assessments and the board\'s fiduciary duty under DC Code § 29-1108.01. (2) Reserve study data showing the recommended contribution level. (3) Cost comparisons to similar buildings in DC (per-unit assessments in comparable condos typically range $300-$800/month depending on size and amenities). (4) The cost of NOT increasing — show what happens to reserves, deferred maintenance, and future special assessment risk. (5) A breakdown of where the money goes (operating expenses, reserve contribution, contingency). Send via certified mail with return receipt.',
           w:'Applies when an owner formally disputes the assessment increase',ph:'present',
           ck:['Cite specific bylaw provision authorizing assessments','Include reserve study recommended contribution','Show cost comparisons to comparable DC condos','Explain consequences of not increasing','Send response via certified mail']},
          {s:'Operate under prior year budget per DC Code § 29-1135.02 when new budget is not adopted',t:'Immediately upon fiscal year start without adopted budget',d:'DC Code § 29-1135.02 & Bylaws',
           desc:'If the budget is not adopted before the fiscal year begins, the association must operate under the prior year budget until a new budget is approved. Continue collecting assessments at the prior year rate.',
           detail:'Under DC Code § 29-1135.02, if the board fails to adopt a budget, the prior year budget remains in effect. Steps: (1) Continue collecting assessments at the prior year rate — do not stop billing. (2) Call a special meeting per DC Code § 29-1109.02 to adopt a revised budget as soon as possible. (3) If owners rejected the budget at the annual meeting, revise the proposal addressing their concerns and re-present. (4) Document the reason for delay in board minutes. (5) Any retroactive assessment increase takes effect from the date of adoption, not retroactively, unless bylaws specifically permit retroactive adjustments.',
           w:'Applies when budget is not adopted before fiscal year start',ph:'present',
           ck:['Continue collecting at prior year rate','Schedule special meeting per DC Code § 29-1109.02','Revise budget proposal addressing owner concerns','Document reason for delay in minutes']},
          {s:'Prepare and distribute annual financial disclosure to all owners per DC Code § 29-1135.05',t:'Within 120 days of fiscal year-end',d:'DC Code § 29-1135.05 & § 42-1903.18',
           desc:'DC requires the association to provide an annual financial disclosure to all unit owners, including a summary of the association\'s financial condition, budget vs actual performance, reserve fund status, and any material changes.',
           detail:'The annual disclosure should include: (1) Income statement (budget vs actual) for the fiscal year. (2) Balance sheet showing assets, liabilities, and fund balances. (3) Reserve fund balance and percent funded. (4) Status of any pending litigation. (5) Insurance coverage summary. (6) Delinquency rate and collection status. Per DC Code § 42-1903.18, owners may also request copies of financial records at any time. Distribute via method required by bylaws. Present highlights at the annual meeting.',
           ph:'present',ck:['Prepare income statement (budget vs actual)','Prepare balance sheet','Report reserve fund balance and percent funded','Disclose pending litigation','Summarize insurance coverage','Distribute to all owners']},
          {s:'File DC Biennial Report and maintain entity standing with DLCP',t:'Per DC filing schedule',d:'DC Code § 29-102.11',
           desc:'DC condominium associations organized as nonprofits must file a Biennial Report with the Department of Licensing and Consumer Protection (DLCP) to maintain active entity status. Failure to file can result in administrative dissolution.',
           detail:'File online at the DLCP business portal. Include current registered agent, principal office address, and officer information. Filing fee varies. Late filing results in penalties and potential administrative dissolution per DC Code § 29-106.02, which would prevent the association from filing lawsuits, recording liens, or entering contracts until reinstated.',
           w:'Late filing can result in administrative dissolution per DC Code § 29-106.02',ph:'present'}
        ],
        legal:[
          {s:'Attorney reviews assessment increase for compliance with bylaws cap and DC Code § 29-1135.02',t:'Before adoption when increase exceeds 10-15%',d:'DC Code § 29-1135.02 & Bylaws',
           desc:'When the proposed assessment increase exceeds the bylaws cap (typically 10-15%), consult an attorney to confirm the owner vote requirement, notice procedures, and voting threshold under both the bylaws and DC Code § 29-1135.02.',
           detail:'The attorney will: (1) Review the bylaws for the specific assessment increase cap and whether it applies to the total assessment or only the operating portion. (2) Confirm the voting threshold — DC typically requires 2/3 (66.7%) owner approval for assessment increases above the cap. (3) Review the notice requirements under DC Code § 29-1135.02 (30-day notice). (4) Draft or review the notice and proxy form. (5) Advise on whether phasing the increase over 2 years would avoid the owner vote requirement.',
           w:'Required when assessment increase exceeds bylaws cap — typically 10-15%',ph:'draft'},
          {s:'Attorney defends budget adoption process against formal owner challenge or lawsuit',t:'Upon receipt of challenge or demand letter',d:'DC Code § 29-1135.02 & Bylaws',
           desc:'When an owner formally challenges the budget adoption process (alleging improper notice, incorrect voting, or procedural deficiency), engage an attorney to review the process and defend the board\'s actions.',
           detail:'The attorney will: (1) Review all notices sent and confirm compliance with DC Code § 29-1135.02 and bylaws notice requirements. (2) Review meeting minutes for proper quorum and voting documentation. (3) Assess whether the challenge has merit — if the board made a procedural error, it may be better to cure the defect (re-notice and re-vote) rather than litigate. (4) If the challenge is meritless, send a written response citing the governing authority and procedural compliance. (5) If litigation is filed, the attorney handles the defense. DC courts may award attorney fees to the prevailing party per DC Code § 42-1903.14(c).',
           w:'Required when owner files formal challenge or threatens suit over budget adoption',ph:'present'},
          {s:'Attorney advises board on fiduciary duty regarding chronically underfunded reserves',t:'When reserve funding falls below 50%',d:'DC Code § 29-1108.01 & Fiduciary duty',
           desc:'Board members have a fiduciary duty under DC Code § 29-1108.01 to act in the best interest of the association. Knowingly underfunding reserves when the reserve study recommends higher contributions may expose individual board members to personal liability.',
           detail:'The attorney will advise on: (1) The board\'s fiduciary duty of care — failing to follow the reserve study\'s recommendation without a documented, rational basis is a potential breach. (2) Personal liability exposure for board members who vote to underfund. (3) Whether D&O insurance covers claims arising from knowing underfunding. (4) A defensible path forward: adopt a written plan to increase reserve contributions over 2-3 years toward the study\'s recommended level, and document the rationale in minutes. (5) Disclosure obligations — DC Code § 42-1904.04(a) requires reserve disclosure in resale certificates; materially underfunded reserves must be disclosed.',
           w:'Required when reserve funding falls below 50% — board members face personal liability risk',ph:'present'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.02: 30-day notice before budget adoption. § 29-1135.05: Annual financial disclosure required. PLANNING AHEAD: The budget is the board\'s most powerful planning tool. A well-funded budget with adequate reserve contributions prevents special assessments. Boards that keep reserves above 70% funded and include a 3-5% contingency rarely face financial crises. If reserves are underfunded, increase contributions gradually over 2-3 years rather than one large jump.',
          'CA':'Civil Code § 5300 requires annual budget report including reserve funding.',
          '_':'THE BUDGET IS YOUR PLAN: A good budget prevents special assessments. Key principles: (1) Fund reserves at the reserve study\'s recommended level — it\'s not optional, it\'s fiduciary duty. (2) Include 3-5% contingency for unexpected costs. (3) Don\'t artificially hold assessments low by underfunding reserves — you\'re just deferring costs to the future. (4) Build a 3-year outlook so owners see you\'re planning ahead. A small annual increase is always better than a large surprise special assessment.'
        }
      },
      { id:'special-assessments', title:'Special Assessments', desc:'Roof replacement, structural repairs, emergency storm damage',
        tags:['Roof replacement','Structural repairs','Emergency storm damage','Special assessment'],
        pre:[
          {s:'Identify capital need and obtain 2-3 professional cost estimates',t:'Immediately upon identifying need',d:'Reserve study',detail:'Document why the expense is necessary, why reserves are insufficient, and what alternatives were considered (phased approach, financing, deferred scope).',ph:'gather',ck:['Document why expense is necessary','Document why reserves are insufficient','Obtain 2-3 professional cost estimates']},
          {s:'BEFORE deciding on a special assessment: evaluate all alternatives to minimize owner impact',t:'1-7 days',d:'Fiscal Lens: Spending Decisions',detail:'Special assessments are the LAST resort, not the first. Evaluate in order: (1) Can reserves cover part or all of it? (2) Can the project be phased to spread cost? (3) Can the HOA take a loan to spread payments over 3-10 years? (4) Can an insurance claim offset part of the cost? (5) Can the operating budget absorb it with a temporary assessment increase? Only after exhausting these options should you proceed with a one-time special assessment.',w:'Jumping straight to a special assessment without exploring alternatives is a common board mistake that frustrates owners.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'},ph:'gather',ck:['Check if reserves can cover part or all','Evaluate phasing the project','Explore HOA loan options','Check insurance claim eligibility','Assess operating budget absorption']},
          {s:'Review reserve study: is this item in the plan? Why are reserves short?',t:'1-3 days',d:'Fiscal Lens: Reserves tab',detail:'If reserves are short, be transparent about why: Was the reserve study outdated? Was the board underfunding contributions? Did costs rise faster than projected? Owners will ask — have honest answers ready. This transparency builds trust and increases vote success.',ph:'gather'},
          {s:'Calculate per-unit cost using Declaration percentage interests (NOT equal split)',t:'With cost estimates',d:'Declaration of Condominium',detail:'Per-unit allocation must follow the percentage interest defined in the Declaration. Example: a 1BR unit at 0.8% interest pays $800 on a $100K assessment, while a 3BR at 1.5% pays $1,500. Show each unit their specific amount in the proposal.',ph:'draft'},
          {s:'Design payment options that reduce hardship: installment plans, early-pay discount, hardship provision',t:'1-2 weeks',detail:'For assessments under $1,000/unit: offer lump sum or 3-month installments. For $1,000-5,000/unit: offer 6-12 month installments. For over $5,000/unit: offer 12-24 month installments and consider HOA financing instead. Include a hardship application process for owners who can demonstrate financial difficulty. Consider an early payment discount (e.g., 3% discount if paid in full within 30 days) to improve cash flow.',ph:'draft',ck:['Design installment plan tiers','Set early-pay discount terms','Create hardship application process']},
          {s:'Review bylaws and DC Code for voting threshold, notice requirements, and borrowing authority',t:'1-2 weeks',d:'Bylaws & DC Code § 29-1135.03',detail:'DC typically requires 2/3 (66.7%) owner approval for special assessments. Check if your bylaws allow the board to borrow (e.g., HOA loan) as an alternative — borrowing may have different or lower voting thresholds.',ph:'draft',ck:['Check voting threshold requirement','Review notice requirements','Check borrowing authority provisions']},
          {s:'Prepare owner-friendly proposal: plain language, per-unit amounts, payment options, and what happens if we don\'t act',t:'2-3 weeks before meeting',detail:'Your proposal should answer these questions for owners: (1) What is the problem? (2) What happens if we wait? (3) How much will it cost me? (4) What are my payment options? (5) Why can\'t reserves cover this? (6) What is the board doing to prevent this in the future? Include photos/engineering reports showing the issue.',ph:'draft',ck:['Explain the problem in plain language','Show per-unit amounts','List payment options','Explain consequences of inaction','Include photos/engineering reports']},
          {s:'Send formal notice to all owners with full proposal, proxy form, and meeting date',t:'30-60 days before vote',d:'DC Code § 29-1135.03 & Bylaws: Notice',detail:'Notice must include: purpose, total amount, per-unit amount table, proposed payment schedule options, date/time of owner meeting/vote, proxy form. Send via method required by bylaws.',ph:'present',ck:['Include purpose and total amount','Attach per-unit amount table','Include payment schedule options','Include meeting date and proxy form']},
          {s:'Hold owner meeting: present the problem, the options considered, and the proposed solution; conduct vote',t:'Per notice period',d:'Bylaws: Voting requirements',detail:'Typically requires 2/3 owner approval in DC. Present alternatives you considered and explain why this approach was chosen. Allow owner questions. Use secret ballot if bylaws require. Document vote count, quorum, and result in minutes.',ph:'present'},
          {s:'Issue formal assessment notice with payment schedule, due dates, and hardship application',t:'Within 14 days of approval',detail:'Include: total amount, per-unit share, due date(s), payment plan enrollment form, payment methods accepted, late fee policy, hardship application. Owners should know exactly what they owe and their options.',ph:'present',ck:['Include total amount and per-unit share','List due dates and payment plan enrollment','Include payment methods and late fee policy','Attach hardship application']},
          {s:'Create plan to prevent future special assessments: increase reserve contributions to meet study targets',t:'Next budget cycle',d:'Fiscal Lens: Budget & Reserves',detail:'The best special assessment is the one that never happens. After this assessment, review and increase the annual reserve contribution to adequately fund future capital needs per the reserve study. Present this commitment to owners — it shows the board is learning and planning ahead.',ph:'present'}
        ],
        self:[
          {s:'Send formal demand letter to non-paying owners via certified mail citing board resolution and DC Code § 42-1903.13',t:'30 days after assessment due date',d:'DC Code § 42-1903.13(a) & Board resolution',
           desc:'When an owner does not remit the special assessment by the due date, send a formal written demand via certified mail citing the board resolution, vote results, and the association\'s lien rights under DC Code § 42-1903.13(a).',
           detail:'The demand letter should include: (1) Copy of the board resolution and owner vote results approving the special assessment. (2) The owner\'s specific amount owed (per percentage interest in the Declaration). (3) Payment options available (lump sum, installment plan). (4) Statement that under DC Code § 42-1903.13(a), the association has a statutory lien on the unit for unpaid assessments. (5) Warning that 6 months of assessments have super-priority over the first mortgage per § 42-1903.13(a)(2). (6) A 30-day cure period before lien recording. Send certified mail with return receipt.',
           w:'Required when owner does not remit payment by due date',ph:'present',
           ck:['Include copy of board resolution and vote results','State owner-specific amount per percentage interest','List available payment options','Cite DC Code § 42-1903.13(a) lien rights','State 30-day cure period','Send certified mail with return receipt']},
          {s:'Record assessment lien with the DC Recorder of Deeds for non-paying owners',t:'After 30-day cure period expires',d:'DC Code § 42-1903.13(a) & (a)(2)',
           desc:'Under DC Code § 42-1903.13(a), the association has a statutory lien on each unit for unpaid assessments. Record a notice of lien at the DC Recorder of Deeds (515 D Street NW) to perfect the lien and provide constructive notice to lenders and future buyers. The 6-month super-priority under § 42-1903.13(a)(2) is the association\'s most powerful collection tool.',
           detail:'The lien notice should include: (1) Legal description of the unit (lot, square, unit designation from the Declaration). (2) Owner name. (3) Association name. (4) Itemized amount (special assessment, late fees, costs). (5) Date assessment became due. (6) Citation to DC Code § 42-1903.13. Recording fee approximately $35. After recording, send a copy to the owner and to the first mortgage holder — the super-lien priority often motivates the lender to pay.',
           ph:'present',ck:['Prepare lien notice with legal description','Itemize all amounts owed','Cite DC Code § 42-1903.13','File at DC Recorder of Deeds (515 D St NW)','Notify owner of recorded lien','Notify first mortgage holder citing super-lien priority']},
          {s:'Offer hardship payment plan for owners demonstrating financial difficulty — apply uniformly',t:'Any time during collection process',d:'Board collection policy & DC Code § 42-1903.12',
           desc:'Before or during collection, offer a written payment plan to owners who demonstrate financial hardship. The plan must be applied uniformly to avoid selective enforcement claims.',
           detail:'Payment plan terms: (1) Owner must stay current on all regular assessments while paying down the special assessment balance. (2) Extended payment period (up to 24 months for large assessments). (3) No late fees during the hardship plan as an incentive. (4) Default clause — one missed payment accelerates the full balance. (5) Lien remains in place until balance is fully paid. (6) Both parties sign. Per DC Code § 42-1903.12, the association may include reasonable collection costs incurred to date. Apply the same terms to all owners requesting hardship plans.',
           w:'Payment plans must be applied uniformly to all owners to avoid selective enforcement liability',ph:'present',
           ck:['Require owner to stay current on regular assessments','Set specific monthly payment amount and duration','Include default/acceleration clause','Lien remains until full payment','Both parties sign','Apply terms uniformly to all requesting owners']},
          {s:'File suit in DC Superior Court for money judgment when owner refuses to pay or enter payment plan',t:'90-120 days after assessment due date',d:'DC Code § 42-1903.13(c) & DC Superior Court',
           desc:'Under DC Code § 42-1903.13(c), the association may bring an action to recover a money judgment for unpaid assessments. File in DC Superior Court Small Claims Branch (up to $10,000) or Civil Division for larger amounts.',
           detail:'Filing location: DC Superior Court, 510 4th Street NW, Washington DC 20001. Small Claims filing fee: $5-$65 depending on amount. Prepare: (1) Assessment ledger. (2) Board resolution and vote results. (3) All notices sent with certified mail receipts. (4) Copy of recorded lien. (5) Per DC Code § 42-1903.12, the association may recover attorney fees and costs of collection. If amount exceeds $10,000 per unit, file in Civil Division — consider engaging an attorney.',
           w:'Small Claims limit is $10,000 — amounts exceeding this require Civil Division filing',ph:'present',
           ck:['Confirm amount is within Small Claims limit or file in Civil Division','Prepare assessment ledger','Gather all notices with certified mail receipts','Include board resolution and vote results','Include copy of recorded lien']},
          {s:'Release lien at DC Recorder of Deeds upon full payment of special assessment',t:'Within 30 days of full payment',d:'DC Code § 42-1903.13',
           desc:'When the special assessment balance is paid in full (including late fees and collection costs), promptly file a lien release with the DC Recorder of Deeds and notify the owner and mortgage holder.',
           detail:'Prepare a lien release document referencing the original recorded lien (instrument number, date). File at the DC Recorder of Deeds. Recording fee approximately $35. Send copies to the owner and mortgage holder. Update the owner\'s ledger. Failure to release a satisfied lien exposes the association to liability.',
           ph:'present',ck:['Prepare lien release referencing original instrument','File at DC Recorder of Deeds','Notify owner','Notify mortgage holder','Update owner ledger']}
        ],
        legal:[
          {s:'Attorney reviews special assessment process, vote requirements, and notice compliance before adoption',t:'Before owner vote',d:'DC Code § 29-1135.03 & Bylaws',
           desc:'Before adopting a special assessment, engage an attorney to review the entire process — the need justification, owner notice, voting threshold, and allocation methodology — to ensure compliance with DC Code § 29-1135.03 and the governing documents.',
           detail:'The attorney will: (1) Confirm the voting threshold (typically 2/3 owner approval in DC). (2) Review the notice for compliance with DC Code § 29-1135.03 and bylaws notice requirements (30-60 days). (3) Verify the per-unit allocation follows the percentage interests in the Declaration. (4) Review the board resolution language. (5) Confirm the board has authority to levy the assessment for this purpose. (6) Advise on whether an HOA loan is available as an alternative with potentially different approval requirements.',
           w:'Required when assessment exceeds bylaws threshold or is greater than $5K/unit',ph:'draft'},
          {s:'Attorney advises on per-unit allocation methodology and payment plan structuring',t:'During assessment design',d:'Declaration of Condominium & DC Code § 42-1903.12',
           desc:'When owners challenge the per-unit allocation or the association needs to structure installment plans, the attorney reviews the Declaration\'s percentage interest schedule and advises on legally defensible allocation and payment terms.',
           detail:'The attorney will: (1) Confirm allocation follows the Declaration\'s percentage interests — NOT equal split, square footage, or any other basis unless the Declaration specifically provides for it. (2) Review proposed installment plan terms for enforceability under DC law. (3) Advise on early-pay discount and hardship provision terms. (4) Confirm that collection costs and late fees are recoverable per DC Code § 42-1903.12. (5) Draft a payment plan agreement template.',
           w:'Required when owner disputes allocation basis or board needs enforceable payment plan template',ph:'draft'},
          {s:'Attorney reviews HOA financing terms for loan-based assessment alternative',t:'During funding strategy evaluation',d:'Bylaws: Borrowing authority & DC Code',
           desc:'The attorney reviews the HOA\'s bylaws borrowing authority and proposed loan terms to determine if an HOA loan is a viable alternative to a lump-sum special assessment.',
           detail:'The attorney will: (1) Confirm the bylaws authorize the board to borrow on behalf of the association. (2) Review the voting threshold for borrowing (may be different from special assessment threshold). (3) Review loan terms — interest rate, term, prepayment penalties, security requirements. (4) Confirm the association can pledge future assessments as repayment without encumbering individual units. (5) Advise on disclosure to owners — the loan becomes an obligation of the association that must be disclosed in resale certificates per DC Code § 42-1904.04(a).',
           w:'Required when board evaluates HOA loan option — borrowing authority varies by bylaws',ph:'draft'},
          {s:'Attorney files liens and pursues collection against non-paying owners',t:'60-90 days after assessment due date',d:'DC Code § 42-1903.13(a) & § 42-1903.12',
           desc:'Turn delinquent accounts over to the attorney for formal collection — lien recording, demand letters on firm letterhead, super-lien notification to mortgage holders, and civil action if necessary.',
           detail:'The attorney will: (1) Send a formal demand letter citing DC Code § 42-1903.13 and the association\'s right to lien and foreclose. (2) Record assessment liens at the DC Recorder of Deeds. (3) Notify first mortgage holders of the super-lien priority under § 42-1903.13(a)(2) — this often prompts the lender to pay. (4) File suit in DC Superior Court per § 42-1903.13(c) for owners who remain delinquent. (5) Pursue post-judgment remedies (garnishment, levy). Attorney fees are recoverable from the delinquent owner per DC Code § 42-1903.12.',
           w:'Required when owner is 60+ days delinquent on special assessment',ph:'present'},
          {s:'Attorney initiates lien foreclosure for severe special assessment delinquency',t:'When delinquency exceeds 6-12 months',d:'DC Code § 42-1903.13(a) & DC foreclosure procedures',
           desc:'For owners with severe, unresponsive delinquency on a special assessment, the attorney may initiate foreclosure on the assessment lien. Under DC Code § 42-1903.13(a), the lien may be foreclosed in the same manner as a deed of trust.',
           detail:'The attorney will: (1) Evaluate whether foreclosure is cost-effective given the amount owed, legal costs, and timeline (typically 6-18 months). (2) Send pre-foreclosure notices per DC law. (3) Comply with DC mediation requirements per § 42-815.02 if applicable. (4) The 6-month super-priority under § 42-1903.13(a)(2) means foreclosure sale proceeds pay the association before the first mortgage holder for that priority amount. (5) Board should adopt a resolution authorizing foreclosure. Foreclosure is a last resort — most effective for investor-owned or abandoned units.',
           w:'Foreclosure is a last resort — evaluate cost-benefit before proceeding',ph:'present'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.03: Special assessments typically require 2/3 owner vote. DC Code § 42-1903.13: Assessment liens attach automatically. § 29-1135.08: 6-month super-lien priority over first mortgage. REDUCING OWNER IMPACT: (1) Phase the project to spread cost over 2+ years. (2) Use partial reserves + smaller assessment. (3) HOA loan spreads cost across 3-10 years of modest assessment increases instead of one large hit. (4) Offer installment plans with hardship provisions. (5) Early-pay discount improves cash flow. The goal is to get the work done while being fair to owners of all income levels.',
          '_':'MINIMIZING OWNER IMPACT: Always explore alternatives before special assessment. Best to worst for owners: (1) Reserves cover it — no impact. (2) Phase the work — smaller cost per year. (3) HOA financing — spread over years as modest increase. (4) Combination — partial reserves + small assessment. (5) Full special assessment — offer installment plans. Board members who plan ahead with adequate reserve funding avoid putting owners in this position.'
        }
      },
      { id:'delinquent-accounts', title:'Delinquent Accounts', desc:'Late notices, payment plans, lien filings, foreclosure under DC Code',
        tags:['Late notices','Payment plans','Lien filings','Foreclosure proceedings','DC super-lien'],
        pre:[
          {s:'Verify delinquency and confirm amount owed from assessment ledger',t:'Immediately upon missed payment',d:'DC Code § 42-1903.12 & Bylaws: Assessment provisions',
           desc:'Before initiating any collection action, confirm the exact amount owed including the delinquent assessment(s), any previously accrued late fees, and interest if authorized by the bylaws. DC Code § 42-1903.12 permits the association to collect assessments, late charges, fines, and reasonable costs of collection including attorney fees — but only when authorized by the declaration or bylaws.',
           detail:'Pull the owner\'s full ledger history. Verify: (1) Assessment amount is correct per the budget resolution. (2) Payments were properly applied (assessment before late fees). (3) Late fee amount matches the schedule in the bylaws. (4) Any prior credits or disputes are resolved. A single ledger error can undermine the entire collection effort.',
           persistent:[{type:'link',label:'Open Financial Dashboard',target:'financial'},{type:'upload',label:'Upload Ledger'}],
           ph:'gather',ck:['Confirm delinquent assessment amount','Verify payment application order','Confirm late fee matches bylaws schedule','Check for prior credits or disputes']},
          {s:'Send first late notice with statement of account after grace period expires',t:'5-15 days past due',d:'Bylaws: Late fee & grace period provisions',
           desc:'Send a courteous first notice reminding the owner of the missed payment and the amount due. Include the full statement of account showing the original assessment, due date, grace period expiration, and any late fee now applied per the bylaws.',
           detail:'Tone matters — this is a reminder, not a threat. Many delinquencies are simple oversights. Include: amount due, late fee applied (cite the bylaw provision), how to pay, and a contact for questions. Under DC Code § 42-1903.12(a), the association may charge a late fee only if authorized by the declaration or bylaws, and only after any grace period has expired.',
           ph:'gather',ck:['Include statement of account','Cite bylaw provision for late fee','Provide payment instructions','Include contact for questions']},
          {s:'Apply late fee per governing docs and send second notice via certified mail',t:'30 days past due',d:'DC Code § 42-1903.12(a) & Bylaws: Collection policy',
           desc:'If payment has not been received after the first notice, apply the late fee per the bylaws schedule and send a second, more formal notice via certified mail with return receipt requested. This creates a documented record of notice.',
           detail:'DC law does not mandate a specific late fee amount — it must be authorized by the declaration or bylaws and must be reasonable. Common ranges: $25-50 flat fee or 1.5% per month on the unpaid balance. Certified mail with return receipt (USPS Form 3811) creates evidence of delivery. Keep the green card in the owner\'s file. If bylaws authorize interest on unpaid assessments, begin accruing interest from this point.',
           ph:'gather',ck:['Apply late fee per bylaws schedule','Send via USPS certified mail with return receipt','Document green card receipt in owner file','Begin interest accrual if authorized']},
          {s:'Send formal demand letter via certified mail stating total amount due, statutory lien rights, and 30-day cure period',t:'60 days past due',d:'DC Code § 42-1903.13(a) & Collection policy',
           desc:'Send a formal written demand that puts the owner on notice of the association\'s lien rights under DC Code § 42-1903.13(a) and provides a final opportunity to pay or enter a payment plan before the board escalates to lien recording.',
           detail:'The demand letter should state: (1) Total amount due (assessments + late fees + interest + any costs). (2) That under DC Code § 42-1903.13(a), the association has a statutory lien on the unit for unpaid assessments. (3) That if not paid within 30 days, the board will record a lien with the DC Recorder of Deeds. (4) That the lien carries 6-month super-priority over the first mortgage under DC Code § 42-1903.13(a)(2). (5) That collection costs and attorney fees will be added to the amount owed per DC Code § 42-1903.12. (6) An offer to discuss a payment plan. Send certified mail, return receipt requested.',
           ph:'draft',ck:['State total amount due with itemization','Cite DC Code § 42-1903.13(a) lien rights','Cite DC Code § 42-1903.13(a)(2) super-lien priority','State 30-day cure period','Offer payment plan option','Send certified mail with return receipt']},
          {s:'Offer formal payment plan agreement in writing',t:'60-90 days past due',d:'Board collection policy resolution',
           desc:'Before escalating to a lien, offer the owner a written payment plan that allows them to cure the delinquency over a reasonable period while keeping current on ongoing assessments.',
           detail:'A good payment plan: (1) Requires the owner to stay current on all future assessments while paying down the arrearage. (2) Sets a specific monthly payment amount and schedule. (3) Includes a default clause — if the owner misses a plan payment, the full balance becomes immediately due and the board proceeds to lien. (4) Waives or reduces late fees during the plan period as an incentive. (5) Is signed by both the owner and an authorized board representative. Apply the plan uniformly — do not offer different terms to different owners, as this creates selective enforcement liability.',
           w:'Payment plans must be applied uniformly to avoid selective enforcement claims',
           ph:'draft',ck:['Owner must stay current on future assessments','Set specific monthly payment amount','Include default/acceleration clause','Consider late fee waiver as incentive','Both parties sign the agreement']},
          {s:'Board resolution to record lien if demand and payment plan are refused or ignored',t:'90 days past due',d:'DC Code § 42-1903.13(a) & Bylaws',
           desc:'If the owner has not paid, not entered a payment plan, or has defaulted on a payment plan, the board should adopt a formal resolution authorizing the recording of an assessment lien with the DC Recorder of Deeds.',
           detail:'The board resolution should: (1) Identify the unit and owner. (2) State the total amount owed. (3) Authorize the recording of a lien per DC Code § 42-1903.13(a). (4) Authorize the addition of recording fees and costs to the owner\'s balance. Record the vote in the board minutes. This resolution is the basis for the lien filing and should be preserved in the owner\'s collection file.',
           ph:'draft'},
          {s:'Suspend amenity access and/or voting rights per governing docs',t:'Per CC&Rs/Bylaws suspension provisions',d:'Bylaws: Suspension of rights provisions',
           desc:'If authorized by the governing documents, suspend the delinquent owner\'s amenity access (pool, gym, parking) and/or voting rights until the account is brought current.',
           detail:'DC law does not prohibit suspension of amenity access or voting rights for delinquent owners, but the authority must come from the declaration or bylaws — the board cannot create this remedy on its own. Before suspending: (1) Confirm the governing docs authorize suspension for nonpayment. (2) Provide written notice to the owner citing the specific provision and effective date. (3) Do not suspend access to the unit itself, mailbox, or essential services. (4) Restore rights promptly when the account is cured.',
           w:'Only permitted when expressly authorized by the declaration or bylaws — board cannot create this remedy unilaterally',
           ph:'present',ck:['Confirm governing docs authorize suspension','Send written notice citing provision','Do not suspend essential services or unit access','Document restoration when account is cured']},
          {s:'Record notice of assessment lien with the DC Recorder of Deeds',t:'90-120 days past due',d:'DC Code § 42-1903.13(a)',
           desc:'Record a notice of lien in the land records of the District of Columbia. Under DC Code § 42-1903.13(a), the association has a statutory lien on each condominium unit for any assessment levied against the unit from the time the assessment becomes due. Recording perfects the lien and provides constructive notice to subsequent purchasers and lenders.',
           detail:'The lien notice filed with the DC Recorder of Deeds should include: (1) Legal description of the unit (lot, square, unit number from the declaration). (2) Name of the unit owner. (3) Name of the condominium association. (4) Amount of the lien (unpaid assessments, late fees, interest, costs). (5) Date the assessments became due. (6) Statement that the lien is claimed pursuant to DC Code § 42-1903.13. Recording fee is approximately $35 at the DC Recorder of Deeds (515 D Street NW). CRITICAL: Under DC Code § 42-1903.13(a)(2), the lien for up to 6 months of unpaid assessments has SUPER-PRIORITY over a first deed of trust or mortgage — this is one of the most powerful collection tools available to DC condominiums.',
           w:'The 6-month super-lien under DC Code § 42-1903.13(a)(2) takes priority over the first mortgage — this is a critical leverage point',
           ph:'present',ck:['Include legal description of unit','Include owner name and association name','Itemize lien amount','Cite DC Code § 42-1903.13','File at DC Recorder of Deeds (515 D Street NW)','Add recording fee to owner balance']},
          {s:'Send post-lien notice to owner and first mortgage holder',t:'Within 10 days of recording',d:'DC Code § 42-1903.13',
           desc:'After recording the lien, send written notice to the unit owner confirming the lien has been recorded and the total amount required to release it. Also notify the first mortgage holder — the super-lien priority gives the lender strong incentive to pay the assessments and add them to the owner\'s mortgage balance.',
           detail:'The notice to the mortgage holder is strategically important. Under DC Code § 42-1903.13(a)(2), the association\'s lien for 6 months of assessments takes priority over the first mortgage. Most lenders will pay the assessments to protect their lien position and then add the amount to the owner\'s mortgage balance. This often resolves the delinquency without further action by the board. Send to: the servicer at the address in the most recent mortgage statement or look up the deed of trust at the DC Recorder of Deeds.',
           ph:'present',ck:['Notify owner of recorded lien and release amount','Identify first mortgage holder/servicer','Send lien notice to mortgage holder','Cite super-lien priority under § 42-1903.13(a)(2)']}
        ],
        self:[
          {s:'Prepare and record notice of assessment lien with the DC Recorder of Deeds',t:'After 90-day demand period expires',d:'DC Code § 42-1903.13(a)',
           desc:'Under DC Code § 42-1903.13(a), the association has a statutory lien on each unit for unpaid assessments from the time they become due. Recording a notice of lien with the DC Recorder of Deeds perfects the lien and provides constructive notice to lenders and future buyers. The lien for up to 6 months of assessments has super-priority over the first mortgage under § 42-1903.13(a)(2).',
           detail:'Prepare a notice of lien including: (1) Legal description of the unit (lot, square, unit designation from the declaration). (2) Unit owner name. (3) Association name and address. (4) Itemized amount owed (assessments, late fees, interest, collection costs). (5) Date assessments became due. (6) Citation to DC Code § 42-1903.13. File at the DC Recorder of Deeds, 515 D Street NW, Washington DC 20001. Recording fee is approximately $35. Add the recording fee to the owner\'s balance. After recording, send a copy to the owner via certified mail and to the first mortgage holder/servicer — the super-lien priority often motivates the lender to pay.',
           ph:'gather',ck:['Draft lien notice with legal description and unit designation','Itemize all amounts owed','Cite DC Code § 42-1903.13','File at DC Recorder of Deeds','Send recorded lien to owner via certified mail','Send copy to first mortgage holder citing super-lien priority']},
          {s:'Notify first mortgage holder of lien and 6-month super-priority under DC Code § 42-1903.13(a)(2)',t:'Within 10 days of recording lien',d:'DC Code § 42-1903.13(a)(2)',
           desc:'Send written notice to the first mortgage holder (servicer) that an assessment lien has been recorded and that 6 months of assessments take super-priority over the first deed of trust. Most lenders will pay the assessments to protect their lien position and add the amount to the borrower\'s mortgage balance.',
           detail:'Identify the mortgage servicer from the most recent deed of trust recorded with the DC Recorder of Deeds, or from public property records at the DC Office of Tax and Revenue (OTR). The notice should include: (1) Copy of the recorded lien. (2) Statement that 6 months of assessments have super-priority over the first mortgage per DC Code § 42-1903.13(a)(2). (3) Itemized balance. (4) Payoff instructions. This is often the most effective self-represented collection strategy — lenders act quickly when their lien priority is threatened.',
           w:'This is the most powerful self-represented collection tool in DC — the lender will typically pay to protect its lien position',
           ph:'gather',ck:['Identify mortgage servicer from recorded deed of trust','Send notice with copy of recorded lien','Cite § 42-1903.13(a)(2) super-priority','Include itemized balance and payoff instructions']},
          {s:'File suit in DC Superior Court — Small Claims Branch for amounts up to $10,000',t:'If lien notification does not produce payment within 30-60 days',d:'DC Code § 42-1903.13(c) & DC Superior Court Small Claims Rules',
           desc:'If the mortgage holder does not pay and the owner remains delinquent, file a civil action in the Small Claims Branch of DC Superior Court for the unpaid amount (up to $10,000 jurisdictional limit). DC Code § 42-1903.13(c) authorizes the association to bring an action to recover a money judgment for unpaid assessments.',
           detail:'Filing location: DC Superior Court, Small Claims Branch, 510 4th Street NW, Washington DC 20001. Filing fee: $5-$65 depending on amount claimed. You do NOT need an attorney for small claims. Prepare: (1) Assessment ledger showing all charges and payments. (2) Copies of all notices sent (with certified mail receipts). (3) Relevant bylaw provisions authorizing assessments and late fees. (4) Copy of the recorded lien. (5) Board resolution authorizing collection. Under DC Code § 42-1903.12, the association may recover reasonable attorney fees and costs of collection even if self-represented (document your time and expenses). If the amount exceeds $10,000, you must file in Civil Division and should consider engaging an attorney.',
           w:'Small Claims limit in DC is $10,000 — amounts exceeding this require Civil Division filing',
           ph:'draft',ck:['Confirm amount is within $10,000 Small Claims limit','Prepare complete assessment ledger','Gather copies of all notices with certified mail receipts','Include governing doc provisions for assessments','Include copy of recorded lien','Include board resolution authorizing collection']},
          {s:'Obtain judgment and record as judgment lien; pursue garnishment or levy if necessary',t:'After court hearing',d:'DC Code § 42-1903.13(c) & DC Code § 15-101',
           desc:'If the court enters judgment in the association\'s favor, record the judgment with the DC Recorder of Deeds to create a judgment lien on the unit (separate from the assessment lien). If the owner still does not pay, pursue post-judgment collection remedies including wage garnishment or bank levy.',
           detail:'After obtaining a judgment: (1) Record a certified copy of the judgment at the DC Recorder of Deeds to create a judgment lien under DC Code § 15-101 et seq. (2) If the owner does not pay within 30 days, file a Writ of Attachment (wage garnishment) or Writ of Fieri Facias (bank levy) with the court. (3) The judgment accrues interest at the DC statutory rate. (4) The judgment is valid for 12 years and can be renewed. The combination of the assessment lien (with super-priority) and a judgment lien gives the association maximum leverage.',
           ph:'draft',ck:['Record certified judgment at DC Recorder of Deeds','Send post-judgment demand to owner','File wage garnishment if owner is employed','File bank levy if garnishment is insufficient']},
          {s:'Negotiate and document payment plan agreement with enforceable default provisions',t:'Any time during collection process',d:'Board collection policy & DC Code § 42-1903.12',
           desc:'At any point during the collection process, the board may enter into a written payment plan with the delinquent owner. The agreement should be a binding contract with specific terms, a default clause that accelerates the full balance, and a provision that the lien remains in place until the balance is paid in full.',
           detail:'Payment plan terms: (1) Owner must stay current on all future assessments while paying down the arrearage. (2) Specific monthly payment amount and due date. (3) Default clause — one missed payment accelerates the full balance and the board proceeds to foreclosure. (4) Lien remains recorded until balance is paid in full and release is filed. (5) Late fees may be waived during the plan as an incentive. (6) Both parties sign. Apply uniformly — do not offer different terms to different owners. Per DC Code § 42-1903.12, the agreement may include reasonable collection costs incurred to date.',
           w:'Apply payment plans uniformly to all delinquent owners to avoid selective enforcement liability',
           ph:'present',ck:['Require owner to stay current on future assessments','Include specific payment amount and schedule','Include default/acceleration clause','Lien remains until full payment and release filed','Both parties sign','Apply terms uniformly to all owners']},
          {s:'Release lien at DC Recorder of Deeds upon full payment',t:'Within 30 days of full payment',d:'DC Code § 42-1903.13',
           desc:'When the delinquent balance is paid in full (including assessments, late fees, interest, and collection costs), promptly file a lien release with the DC Recorder of Deeds. Failure to release a satisfied lien exposes the association to liability.',
           detail:'Prepare a lien release document referencing the original recorded lien (instrument number, date of recording) and stating that the lien has been satisfied in full. File at the DC Recorder of Deeds. Send a copy to the owner and to the mortgage holder. Update the owner\'s ledger to reflect the lien release. Recording fee is approximately $35.',
           ph:'present',ck:['Prepare lien release referencing original instrument number','File at DC Recorder of Deeds','Send copy to owner','Send copy to mortgage holder','Update owner ledger']}
        ],
        legal:[
          {s:'Engage attorney for formal collection — demand letter on firm letterhead citing DC lien and super-priority statutes',t:'90-120 days delinquent or when amount exceeds $2,000',d:'DC Code § 42-1903.12 & § 42-1903.13',
           desc:'Turn the account over to an attorney experienced in DC condominium law for formal collection. The attorney\'s demand letter carries significantly more weight than board correspondence and will cite the association\'s statutory remedies under DC Code § 42-1903.13 including lien recording and the 6-month super-priority over the first mortgage.',
           detail:'When selecting collection counsel: (1) Verify experience with DC condo/HOA law specifically (not just general real estate). (2) Confirm fee structure — many collection attorneys work on contingency or charge fees that are recoverable from the delinquent owner per DC Code § 42-1903.12. (3) Provide the attorney with: complete ledger, all notices sent (with certified mail receipts), governing documents, collection policy resolution, and any prior correspondence with the owner. (4) The attorney\'s demand letter will typically state: amount owed, statutory lien rights, super-lien priority, 30-day demand, and that attorney fees and costs will be added to the balance.',
           w:'Attorney fees and costs of collection are recoverable from the delinquent owner under DC Code § 42-1903.12',
           ph:'gather',ck:['Select attorney with DC condo/HOA collection experience','Confirm fee structure and recoverability','Provide complete ledger and all notices','Provide governing documents and collection policy','Attorney sends demand letter citing DC Code § 42-1903.13']},
          {s:'Attorney records assessment lien and sends super-lien notice to first mortgage holder',t:'If demand is not satisfied within 30 days',d:'DC Code § 42-1903.13(a) & (a)(2)',
           desc:'The attorney records a notice of assessment lien with the DC Recorder of Deeds and notifies the first mortgage holder of the 6-month super-priority under DC Code § 42-1903.13(a)(2). The attorney\'s notice to the lender is typically more effective than a self-represented filing because it demonstrates the association is prepared to foreclose.',
           detail:'The attorney will: (1) Prepare and record the lien notice at the DC Recorder of Deeds. (2) Send a formal super-lien notice to the mortgage servicer citing § 42-1903.13(a)(2) and demanding payment of 6 months of assessments to protect the lender\'s lien position. (3) Add recording fees and attorney fees to the owner\'s balance per § 42-1903.12. (4) In many cases, the lender will pay the assessments within 30-60 days to protect its priority — this is the primary leverage point in DC condo collections.',
           ph:'draft',ck:['Attorney records lien at DC Recorder of Deeds','Super-lien notice sent to mortgage servicer','Recording fees and attorney fees added to balance','Monitor for lender payment response']},
          {s:'Attorney files civil action for money judgment in DC Superior Court',t:'If lender does not pay and owner remains delinquent',d:'DC Code § 42-1903.13(c)',
           desc:'Under DC Code § 42-1903.13(c), the attorney files suit in DC Superior Court to obtain a money judgment for the full amount owed including assessments, late fees, interest, attorney fees, and costs of collection. For amounts under $10,000, Small Claims Branch may be used; for larger amounts, Civil Division.',
           detail:'The attorney will file suit in DC Superior Court (510 4th Street NW). The complaint will seek: (1) Judgment for all unpaid assessments plus late fees, interest, and collection costs. (2) Attorney fees per DC Code § 42-1903.12. (3) Post-judgment interest at the DC statutory rate. (4) After judgment is entered, the attorney can pursue wage garnishment, bank levy, or other post-judgment remedies. The judgment lien (recorded at DC Recorder of Deeds) combined with the assessment lien provides dual security.',
           ph:'draft'},
          {s:'Attorney initiates lien foreclosure proceedings',t:'When delinquency exceeds 6-12 months or amount is substantial',d:'DC Code § 42-1903.13(a) & DC foreclosure procedures',
           desc:'For severe delinquencies, the attorney may initiate foreclosure on the assessment lien. Under DC Code § 42-1903.13(a), the association\'s lien may be foreclosed in the same manner as a deed of trust. The 6-month super-priority under § 42-1903.13(a)(2) means the foreclosure sale proceeds pay the association before the first mortgage holder for that priority amount.',
           detail:'Assessment lien foreclosure in DC follows the same procedures as deed of trust foreclosure. The attorney will: (1) Send required pre-foreclosure notices per DC law. (2) Engage a trustee if the governing documents provide for a power of sale, or file a judicial foreclosure action. (3) The foreclosure must comply with DC mediation requirements (DC Code § 42-815.02) if applicable. (4) IMPORTANT: Foreclosure is an extreme remedy. The board should weigh the cost, timeline (6-18 months), and public relations impact against the amount owed. It is most appropriate when: the amount is substantial (typically >$10K), the owner is unresponsive to all other efforts, or the unit is abandoned/investor-owned.',
           w:'Foreclosure is a last resort — weigh cost, timeline, and community impact before proceeding',
           ph:'present',ck:['Attorney sends pre-foreclosure notices per DC law','Comply with DC mediation requirements if applicable','Board resolution authorizing foreclosure','Evaluate cost-benefit of foreclosure vs. other remedies']},
          {s:'Attorney advises on special situations: bankruptcy filing, estate/probate, or FHA/VA-backed mortgage',t:'As needed',d:'DC Code § 42-1903.13 & Federal bankruptcy law',
           desc:'When an owner files for bankruptcy, dies, or has a federally-backed mortgage, the collection strategy requires specialized legal guidance. Bankruptcy triggers an automatic stay prohibiting collection. Probate requires claims against the estate. FHA/VA loans have specific restrictions on foreclosure.',
           detail:'(1) BANKRUPTCY: The automatic stay (11 USC § 362) prohibits all collection activity. The attorney must file a proof of claim in bankruptcy court. Post-petition assessments (those accruing after the bankruptcy filing) may be collected outside the stay. (2) ESTATE/PROBATE: File a creditor\'s claim with the DC probate court within the claims period (typically 6 months from the first publication of notice). The lien survives the owner\'s death and attaches to the unit. (3) FHA/VA LOANS: Federal regulations restrict super-lien enforcement against FHA-insured and VA-guaranteed loans. The attorney must navigate both DC and federal requirements.',
           w:'Bankruptcy triggers an automatic stay — all collection activity must cease immediately until the attorney advises',
           ph:'present'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.13(a): The association has a lien on each unit for unpaid assessments from the time they become due. § 42-1903.13(a)(2): 6 months of unpaid assessments have SUPER-PRIORITY over the first deed of trust — this is the board\'s most powerful collection tool. § 42-1903.12: The association may recover late fees, interest, attorney fees, and costs of collection when authorized by the declaration or bylaws. § 42-1903.13(c): The association may bring an action to recover a money judgment for unpaid assessments. File liens at the DC Recorder of Deeds, 515 D Street NW. Small claims actions (up to $10,000) in DC Superior Court, Small Claims Branch, 510 4th Street NW. STRATEGY: The super-lien is your leverage. Most first mortgage holders will pay 6 months of assessments to protect their priority — notify the lender early.',
          '_':'COLLECTION BEST PRACTICES: (1) Adopt a written collection policy by board resolution and apply it uniformly. (2) Never single out individual owners for harsher treatment. (3) Document every notice with certified mail receipts. (4) Offer payment plans — a paying owner is better than a litigating owner. (5) Know your super-lien rights and use them. (6) Factor in the cost of collection when deciding whether to engage an attorney. (7) The goal is to collect the money, not to punish the owner.'
        }
      },
      { id:'financial-review', title:'Financial Review', desc:'Financial audits, CPA reviews, and annual financial disclosures under DC law',
        tags:['Annual audit','CPA review','Financial statements','Financial disclosure'],
        pre:[
          {s:'Determine audit vs review requirement per bylaws and DC Code § 29-1135.05',t:'90-120 days before fiscal year-end',d:'DC Code § 29-1135.05 & Bylaws',
           desc:'Determine whether the association requires a full audit, a CPA review, or a compilation based on the bylaws, number of units, and annual revenue. DC Code § 29-1135.05 requires annual financial disclosure to owners.',
           detail:'Check bylaws for the specific financial reporting requirement. General guidance: (1) Associations with 50+ units or annual revenue above $250K: full audit recommended. (2) 20-50 units or $100K-$250K revenue: CPA review engagement. (3) Under 20 units: compilation or review may suffice. Some bylaws mandate audits regardless of size. The board should adopt a resolution specifying the engagement type each year. If the association has never been audited, start with a review and upgrade to an audit if material issues are found.',
           ph:'gather',ck:['Check bylaws for financial reporting requirements','Determine audit vs review vs compilation','Board resolution specifying engagement type']},
          {s:'Select independent CPA firm with HOA/condo experience; verify DC license',t:'60-90 days before fiscal year-end',d:'DC Board of Accountancy',
           desc:'Select a CPA firm with experience in condominium and HOA financial reporting. The firm must be independent (no financial relationship with the association or board members) and licensed in the District of Columbia.',
           detail:'Selection criteria: (1) Experience with DC condominium associations (ask for client references). (2) Licensed with the DC Board of Accountancy. (3) No financial relationship with any board member or the management company. (4) Obtain proposals from 2-3 firms with fixed-fee quotes. (5) Typical cost: $3K-$8K for a full audit, $2K-$5K for a review. (6) Engagement letter should specify: scope, timeline, deliverables (audited/reviewed financial statements + management letter), and fees.',
           ph:'gather',ck:['Obtain proposals from 2-3 CPA firms','Verify DC licensure','Confirm independence from board and management','Review engagement letter terms']},
          {s:'Provide complete financial records and documentation to the CPA after year-end close',t:'Within 30 days of fiscal year-end',d:'DC Code § 42-1903.18',
           desc:'Provide the CPA with all financial records needed for the engagement, including bank statements, invoices, contracts, assessment ledger, reserve statements, and prior year reports.',
           detail:'Records to provide: (1) All bank statements (operating and reserve accounts) for the fiscal year. (2) General ledger and chart of accounts. (3) Assessment ledger with collections and delinquencies. (4) All invoices and receipts over $500. (5) Vendor contracts. (6) Insurance policies. (7) Prior year audit/review report. (8) Board meeting minutes (for expenditure approvals). (9) Reserve study. (10) Loan documents if applicable. Organize in folders and provide promptly — delays increase CPA costs.',
           ph:'gather',ck:['Provide bank statements (operating and reserve)','Provide general ledger','Provide assessment ledger','Provide invoices over $500','Provide vendor contracts','Provide prior year report']},
          {s:'Review draft audit/review report and management letter with CPA',t:'2-4 weeks after records provided',d:'GAAP & AICPA standards',
           desc:'Review the draft report for accuracy and discuss any findings or concerns in the management letter. The management letter identifies internal control weaknesses, accounting errors, or compliance issues that require board attention.',
           detail:'Key items to review: (1) Are financial statements consistent with your records? (2) Any material adjustments proposed by the CPA? (3) Management letter findings — these identify weaknesses in internal controls, segregation of duties, or accounting practices. Each finding should have a remediation recommendation. (4) Going concern issues — does the CPA express doubt about the association\'s financial viability? (5) Reserve fund presentation — is the reserve balance properly segregated from operating funds? Ask the CPA to explain any findings in plain language.',
           ph:'draft'},
          {s:'Board reviews findings, adopts management letter remediation plan, and accepts report',t:'Board meeting',d:'Bylaws: Board duties',
           desc:'The full board reviews the audit/review report and management letter findings, adopts a remediation plan for any identified issues, and formally accepts the report by board resolution.',
           detail:'Board action: (1) CPA presents report at board meeting or provides written summary. (2) Board discusses management letter findings and assigns remediation responsibility with deadlines. (3) Board votes to accept the report — this is a formal action recorded in minutes. (4) If the audit reveals material issues (missing funds, unauthorized expenditures, significant errors), the board should consider: reporting to D&O insurance, engaging an attorney, and notifying owners. (5) Document the remediation plan in minutes with specific action items and deadlines.',
           ph:'draft',ck:['CPA presents report to board','Discuss management letter findings','Assign remediation responsibility with deadlines','Board votes to accept report','Document remediation plan in minutes']},
          {s:'Present financial report highlights to owners at annual meeting per DC Code § 29-1135.05',t:'Annual meeting',d:'DC Code § 29-1135.05 & § 42-1903.18',
           desc:'Present the key findings of the audit/review to owners at the annual meeting. DC Code § 29-1135.05 requires annual financial disclosure. Owners should understand the association\'s financial health, reserve status, and any significant findings.',
           detail:'Presentation should cover: (1) Total revenue and expenses vs budget. (2) Reserve fund balance and percent funded. (3) Delinquency rate. (4) Any material findings from the management letter and what the board is doing about them. (5) Key financial metrics year-over-year. Present in plain language — owners don\'t need to be accountants. Make the full report available for inspection per DC Code § 42-1903.14 (owners may request copies).',
           ph:'present',ck:['Summarize revenue and expenses vs budget','Report reserve balance and percent funded','Report delinquency rate','Explain any material findings','Make full report available for inspection']},
          {s:'File Biennial Report with DLCP and maintain entity standing',t:'Per DC filing schedule',d:'DC Code § 29-102.11',
           desc:'Ensure the association\'s Biennial Report is filed with DLCP (formerly DCRA) and all entity filings are current. The audit/review may identify filing gaps.',
           detail:'File online at the DLCP business portal per DC Code § 29-102.11. Late filing can result in administrative dissolution per § 29-106.02. Also check: franchise tax exemption status (Form FR-16 with DC OTR), personal property tax returns if applicable, and any UCC filings related to assessment liens.',
           w:'Late filing can result in administrative dissolution per DC Code § 29-106.02',ph:'present'}
        ],
        self:[
          {s:'Develop remediation plan for management letter findings with specific action items and deadlines',t:'Within 30 days of accepting report',d:'Management letter',
           desc:'When the audit or review identifies deficiencies in internal controls, accounting practices, or compliance, the board must adopt a written remediation plan with specific action items, responsible parties, and deadlines.',
           detail:'For each finding: (1) Describe the deficiency. (2) Assign a responsible board member or manager. (3) Set a specific deadline. (4) Document the remediation action taken. (5) Follow up at the next board meeting. Common findings in HOA audits: inadequate segregation of duties (one person handles receipts and disbursements), missing documentation for expenditures, commingling of operating and reserve funds, failure to reconcile bank statements monthly. Address these promptly — they represent both financial risk and fiduciary liability.',
           w:'Required when audit/review identifies deficiencies in internal controls or compliance',ph:'draft',
           ck:['Document each finding with remediation action','Assign responsible party for each item','Set specific deadlines','Follow up at next board meeting']},
          {s:'Request owner financial records per DC Code § 42-1903.14 when questions arise about audit findings',t:'As needed',d:'DC Code § 42-1903.14',
           desc:'Owners have a statutory right to inspect financial records under DC Code § 42-1903.14. If questions arise about audit findings, the board should proactively make relevant records available.',
           detail:'Under DC Code § 42-1903.14, the association must make records available within 5 business days of written request. Proactively making the full audit report available prevents suspicion and builds trust. If an owner requests records related to a finding, provide them promptly with an explanation.',
           ph:'present'},
          {s:'Engage a forensic accountant if audit reveals possible fraud, embezzlement, or material misstatement',t:'Immediately upon discovery',d:'DC Code § 29-1108.01 & D&O insurance policy',
           desc:'If the audit reveals signs of financial irregularity — missing funds, unauthorized transactions, or material misstatements — engage a forensic accountant to investigate and notify D&O insurance.',
           detail:'Steps: (1) Notify D&O insurance carrier immediately. (2) Engage a forensic CPA (different firm from the auditor) to investigate. (3) Preserve all financial records — do not allow anyone to destroy or alter documents. (4) Restrict access to bank accounts as appropriate. (5) Depending on findings, report to law enforcement (DC Metropolitan Police financial crimes unit) and consider civil action. (6) The board has a fiduciary duty under DC Code § 29-1108.01 to act in the association\'s best interest — failure to investigate is itself a breach.',
           w:'Board has fiduciary duty to investigate — failure to act exposes board members personally',ph:'present',
           ck:['Notify D&O insurance carrier','Engage forensic CPA (separate from auditor)','Preserve all financial records','Restrict bank account access','Report to law enforcement if warranted']}
        ],
        legal:[
          {s:'Attorney reviews audit findings with legal implications — contracts, compliance, or fiduciary issues',t:'Within 14 days of receiving report',d:'DC Code § 29-1108.01',
           desc:'When the audit identifies findings with legal significance — contract violations, regulatory non-compliance, commingling of funds, or potential fiduciary breaches — engage an attorney to assess the legal exposure and recommend corrective action.',
           detail:'The attorney will: (1) Assess whether any findings constitute a breach of fiduciary duty by current or former board members. (2) Review whether the association has contractual claims against the management company for accounting failures. (3) Advise on reporting obligations — some findings may need to be reported to owners, insurance carriers, or regulators. (4) Assess D&O insurance coverage for identified issues. (5) If the finding involves a former board member or manager, advise on recovery options.',
           w:'Required when audit reveals material findings or irregularities with legal implications',ph:'draft'},
          {s:'Attorney advises on owner notification and disclosure obligations for material audit findings',t:'Before annual meeting',d:'DC Code § 29-1135.05 & § 42-1904.04(a)',
           desc:'Material audit findings — significant shortfalls, fraud, compliance failures — may need to be disclosed to owners beyond the standard annual report. The attorney advises on the scope and timing of disclosure.',
           detail:'The attorney will: (1) Determine what must be disclosed vs what is protected by attorney-client privilege. (2) Draft appropriate owner communication that is transparent without creating unnecessary legal exposure. (3) Advise on disclosure in resale certificates per DC Code § 42-1904.04(a) — material financial issues must be disclosed to prospective buyers. (4) If the association is involved in litigation related to the findings, advise on what can be disclosed publicly.',
           w:'Required when material findings may need to be disclosed beyond standard annual report',ph:'present'},
          {s:'Attorney pursues claims against management company or former board members for financial mismanagement',t:'After forensic investigation',d:'DC Code § 29-1108.01 & Management agreement',
           desc:'When the audit or forensic investigation reveals financial mismanagement by the management company or former board members, the attorney evaluates and pursues recovery claims.',
           detail:'The attorney will: (1) Review the management agreement for performance standards and indemnification provisions. (2) Assess claims against former board members for breach of fiduciary duty under DC Code § 29-1108.01 — the duty of care requires board members to act as a reasonably prudent person would. (3) File suit in DC Superior Court (510 4th St NW) for recovery of mismanaged funds. (4) Report to the DC Metropolitan Police if criminal conduct is suspected. (5) Pursue D&O insurance claims for covered losses.',
           w:'Required when investigation confirms financial mismanagement or embezzlement',ph:'present'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.05: Annual financial disclosure required to all owners. § 42-1903.18: Owners may inspect financial records at any time. § 42-1903.14: Records must be available within 5 business days of written request — prevailing owner recovers attorney fees. § 29-1108.01: Board members have a fiduciary duty of care. § 29-102.11: Biennial Report required with DLCP. BEST PRACTICE: Even if bylaws don\'t require an audit, associations with 20+ units or $100K+ annual revenue should have at least a CPA review. Address management letter findings promptly — they identify risk.',
          '_':'FINANCIAL OVERSIGHT: The audit/review is the board\'s most important accountability tool. Key principles: (1) Use an independent CPA with HOA experience. (2) Take management letter findings seriously — they identify real risks. (3) Present results to owners transparently. (4) Address deficiencies promptly with a written plan. (5) If the audit reveals fraud, act immediately — engage forensic CPA, notify D&O insurance, preserve records.'
        }
      },
      { id:'reserve-management', title:'Reserve Management', desc:'Reserve studies, tapping reserves, capital planning',
        tags:['Commissioning reserve studies','Tapping reserves','Capital planning','Reserve fund'],
        pre:[
          {s:'Commission or update professional reserve study (required every 3-5 years)',t:'Every 3-5 years',d:'DC Code § 42-1903.13 & Best practice',detail:'Study should cover all common elements with limited useful life. Include: component inventory, condition assessment, estimated replacement cost, remaining useful life, funding recommendations. Use a credentialed reserve specialist (RS) or professional engineer. Cost: typically $3K-8K for a full study, $1K-3K for an update.',ph:'gather'},
          {s:'Review reserve study with full board: understand what\'s coming in the next 1, 3, 5, and 10 years',t:'2-4 weeks after study',d:'Fiscal Lens: Reserves tab',detail:'Key metric: percent funded (current balance / fully funded balance). Below 30% = critically underfunded (special assessments very likely). 30-50% = weak (some risk). 50-70% = fair. Above 70% = strong. CRITICAL: identify any major expenses due in the next 3-5 years (roof, elevator, facade, plumbing) and whether current reserves will cover them. If not, you need a plan NOW — not when the expense hits.',action:{type:'navigate',target:'financial:reserves',label:'Open Reserves'},ph:'gather',ck:['Check percent funded level','Identify major expenses due in 1-3 years','Identify major expenses due in 3-5 years','Assess if current reserves will cover upcoming needs']},
          {s:'Adopt funding plan: choose a strategy that avoids future special assessments',t:'Board meeting',d:'Bylaws: Reserve provisions',detail:'Three approaches: (1) FULL FUNDING — contribute enough to reach 100% funded by the time each component needs replacement. Highest annual contribution but zero special assessment risk. (2) THRESHOLD FUNDING — maintain enough reserves that no single year requires a special assessment, even if not fully funded. (3) BASELINE — keep reserves positive. Cheapest short-term but high special assessment risk. Recommendation for most HOAs: target at least threshold funding (60-70% funded).',ph:'draft'},
          {s:'Calculate the annual reserve contribution needed and build into next budget',t:'During budget process',d:'Fiscal Lens: Budget tab',detail:'Use the reserve study\'s recommended annual contribution as your target. If current contribution is significantly below target, plan a gradual increase over 2-3 years rather than a sudden jump. Example: if study recommends $24K/year and you\'re at $12K, increase to $16K year 1, $20K year 2, $24K year 3.',action:{type:'navigate',target:'financial:budget',label:'Open Budget'},ph:'draft'},
          {s:'Create a 5-year capital plan from the reserve study: what\'s coming, what it costs, and how you\'ll pay',t:'After funding plan adoption',detail:'Map out every major expense in the next 5 years. For each: estimated cost, current reserve allocation, gap, and plan to close the gap. Share this with owners annually — it builds confidence that the board is planning ahead and prevents surprise special assessments.',ph:'draft',ck:['List every major expense in next 5 years','Estimate cost for each item','Determine current reserve allocation per item','Identify funding gaps','Document plan to close each gap']},
          {s:'Verify reserve expenditure matches a designated reserve component before spending',t:'Before expenditure',d:'Bylaws & DC Code § 42-1903.13',detail:'Reserves should only be spent on the components they were collected for. Using reserves for non-designated purposes (e.g., covering an operating shortfall) is a fiduciary risk and requires owner vote per bylaws.',action:{type:'navigate',target:'financial:reserves',label:'Open Reserves'},ph:'present'},
          {s:'Obtain owner vote before using reserves for any non-designated purpose',t:'Before expenditure',d:'Bylaws: Reserve use restrictions',detail:'Most bylaws restrict reserve use to designated capital items. Document the reason, get owner approval, and create a written repayment plan showing how reserves will be replenished.',w:'Required per bylaws when reserve funds are used outside their designated purpose',ph:'present'},
          {s:'Disclose reserve health to owners annually: balance, percent funded, upcoming needs, and board\'s plan',t:'Annually',d:'DC Code § 42-1903.13 & Bylaws',detail:'Include in annual budget report and present at annual meeting. Owners should know: current balance, percent funded, planned expenditures in next 3-5 years, annual contribution amount, and whether the board is on track. Transparency prevents surprise special assessments and builds trust.',ph:'present',ck:['Report current balance','Report percent funded','List planned expenditures for next 3-5 years','State annual contribution amount','Confirm whether board is on track']}
        ],
        self:[
          {s:'Respond to owner challenges on reserve funding with reserve study data, 5-year capital plan, and board resolution',t:'Within 14 days of challenge',d:'DC Code § 29-1108.01 & Reserve study',
           desc:'When an owner formally challenges the reserve funding level, provide a written response citing the reserve study\'s recommendations, the board\'s adopted funding plan, and the fiduciary duty under DC Code § 29-1108.01 to maintain the association\'s assets.',
           detail:'Your response should include: (1) Current reserve balance and percent funded. (2) Reserve study\'s recommended annual contribution and the board\'s actual contribution. (3) 5-year capital plan showing planned expenditures and funding. (4) Board resolution documenting the adopted funding strategy. (5) Comparison to industry standards (70%+ funded is considered strong). (6) If reserves are below 70%, explain the board\'s catch-up plan with timeline. Send via certified mail.',
           w:'Required when an owner formally challenges the reserve funding level',ph:'present',
           ck:['Report current balance and percent funded','Cite reserve study recommendation','Include 5-year capital plan','Attach board resolution','Explain catch-up plan if below 70%','Send via certified mail']},
          {s:'Prepare reserve disclosure for resale certificates per DC Code § 42-1904.04(a)',t:'Within 10 business days of request',d:'DC Code § 42-1904.04(a) & § 42-1903.13',
           desc:'DC Code § 42-1904.04(a) requires disclosure of reserve fund status in resale certificates. Buyers have a statutory right to know the reserve health before purchasing.',
           detail:'The reserve disclosure for the resale certificate must include: (1) Current reserve fund balance. (2) Percent funded (current balance / fully funded balance per reserve study). (3) Annual reserve contribution amount. (4) Any planned or approved special assessments. (5) Major capital projects planned in the next 3-5 years with estimated costs. (6) Date of most recent reserve study. (7) Whether the board is funding at or above the study\'s recommended level. This is a material disclosure — inaccurate or incomplete information exposes the association to buyer rescission claims per DC Code § 42-1904.09.',
           w:'Inaccurate reserve disclosure exposes the association to buyer rescission claims',ph:'present',
           ck:['Report current reserve balance','Calculate and report percent funded','State annual contribution amount','Disclose planned special assessments','List major capital projects for next 3-5 years','Note date of most recent reserve study']},
          {s:'Develop reserve catch-up plan when reserves fall below 50% funded',t:'Immediately upon identifying shortfall',d:'DC Code § 29-1108.01 & Reserve study',
           desc:'When reserves fall below 50% of the recommended level, the board must develop a written catch-up plan to rebuild reserves and avoid future special assessments. Present the plan to owners with a timeline to reach 60%+ funded.',
           detail:'Catch-up options (often combined): (1) Increase annual reserve contribution by 25-50% over 2-3 years — gradual increases are more palatable than one large jump. (2) One-time small special assessment earmarked specifically for reserves. (3) Defer non-urgent capital projects to reduce near-term draws on reserves. (4) HOA loan to fund an immediate capital need while rebuilding reserves. (5) Renegotiate vendor contracts to free operating budget dollars for reserves. Present the plan at the annual meeting and include it in the budget package. The longer you wait, the worse it gets — underfunded reserves compound into larger future special assessments.',
           w:'Required when reserve funding falls below 50% — board faces fiduciary liability for inaction',ph:'present',
           ck:['Calculate current percent funded','Model catch-up scenarios','Adopt written catch-up plan by board resolution','Present plan to owners at annual meeting','Include in budget package']},
          {s:'Commission updated reserve study when existing study is more than 5 years old or after major capital work',t:'Every 3-5 years or after capital project',d:'Best practice & DC Code § 42-1903.13',
           desc:'Reserve studies should be updated every 3-5 years, after completing major capital work, or when actual costs significantly deviate from study projections. An outdated study leads to inaccurate funding and unexpected shortfalls.',
           detail:'A full reserve study update includes: (1) On-site condition assessment of all common elements. (2) Updated cost estimates reflecting current construction costs. (3) Revised useful life estimates based on actual condition. (4) New funding plan recommendation. Cost: typically $3K-$8K for a full study, $1K-$3K for an update without on-site visit. Use a credentialed Reserve Specialist (RS) or licensed engineer. After completing major capital work (e.g., new roof), update the study to reset the replacement timeline for that component.',
           ph:'gather',ck:['Check age of current reserve study','Engage credentialed Reserve Specialist or engineer','Review updated recommendations','Adopt new funding plan']}
        ],
        legal:[
          {s:'Attorney reviews reserve borrowing or commingling — using reserves for non-designated purposes',t:'Before expenditure',d:'Bylaws: Reserve use restrictions & DC Code § 29-1108.01',
           desc:'When the board considers using reserve funds for a purpose not designated in the reserve study or borrowing from reserves to cover an operating shortfall, consult an attorney to review the bylaws restrictions, owner vote requirements, and fiduciary implications.',
           detail:'The attorney will: (1) Review bylaws for reserve use restrictions — most governing documents prohibit using reserves for operating expenses without owner approval. (2) Determine whether owner vote is required and at what threshold. (3) Advise on creating a written repayment plan showing how reserves will be replenished. (4) Assess fiduciary liability — using reserves for non-designated purposes without proper authorization is a breach of duty under DC Code § 29-1108.01. (5) Draft a board resolution with appropriate safeguards if the expenditure is approved.',
           w:'Required when board wants to use reserves for a non-designated purpose — most bylaws require owner vote',ph:'draft'},
          {s:'Attorney advises on fiduciary duty and personal liability when reserves are critically underfunded',t:'When reserves fall below 30% funded',d:'DC Code § 29-1108.01 & Fiduciary duty',
           desc:'Board members who knowingly allow reserves to remain critically underfunded face potential personal liability for breach of fiduciary duty. The attorney assesses exposure and recommends a defensible path forward.',
           detail:'The attorney will: (1) Assess whether the board\'s current funding level constitutes a breach of the duty of care under DC Code § 29-1108.01 — failing to follow the reserve study without a documented, rational basis is a risk. (2) Evaluate D&O insurance coverage for underfunding claims. (3) Recommend a catch-up plan that is both financially realistic and legally defensible. (4) Draft a board resolution adopting the catch-up plan — this creates a documented record that the board is acting prudently. (5) Advise on disclosure obligations in resale certificates per DC Code § 42-1904.04(a) — critically underfunded reserves must be disclosed to prospective buyers.',
           w:'Required when reserves fall below 30% — individual board members may face personal liability',ph:'present'},
          {s:'Attorney advises on unplanned reserve expenditure exceeding board authority',t:'When unplanned reserve expense arises',d:'Bylaws: Spending authority & DC Code § 29-1135.03',
           desc:'When a large unplanned reserve expenditure arises that is not in the reserve study (e.g., unexpected structural issue), the attorney reviews whether the board can approve the expenditure or whether owner vote is required under the bylaws and DC Code § 29-1135.03.',
           detail:'The attorney will: (1) Review bylaws for board spending authority limits — many limit unilateral board spending to $10K-$25K. (2) Determine whether the emergency spending provision applies (health/safety exception). (3) If owner vote is needed, advise on the voting threshold and notice requirements per DC Code § 29-1135.03. (4) If the expenditure depletes reserves below safe levels, advise on companion special assessment or increased contributions. (5) Draft the owner notice and resolution.',
           w:'Required when large unplanned reserve expenditure is not in the study and may exceed board authority',ph:'draft'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.13: Reserves must be maintained per governing documents. PLANNING AHEAD: The single best thing a board can do is maintain reserves above 70% funded. This virtually eliminates special assessments for planned capital work. Boards that chronically underfund reserves are transferring costs to future owners via special assessments — this is a fiduciary risk. Disclose reserve status in resale packages per § 42-1904.04(a). Update study every 3-5 years.',
          '_':'THE RESERVE PLANNING RULE: Every dollar you don\'t contribute to reserves today becomes $1+ in a future special assessment — plus the loss of owner trust. Boards that fund reserves at the reserve study\'s recommended level virtually eliminate surprise special assessments. Create a 5-year capital plan, share it with owners annually, and treat reserve contributions as non-negotiable in the budget.'
        }
      }
    ]
  },
  { id:'maintenance', num:'2', icon:'🔧', label:'Maintenance & Property', color:'blue',
    sits: [
      { id:'common-area-repairs', title:'Common Area Repairs', desc:'Roof leaks, structural cracks, plumbing, elevator, HVAC',
        tags:['Roof leaks','Structural cracks','Plumbing risers','Elevator failures'],
        pre:[
          {s:'Document issue with photos, video, dates, affected areas',t:'Immediately',detail:'Include: location, severity, units affected, date discovered, who reported it. This documentation supports insurance claims and contractor scope.',ph:'document',ck:['Take photos of damage','Record video if applicable','Note dates and affected areas','Identify who reported the issue']},
          {s:'Determine whether common element or unit owner responsibility per CC&Rs',t:'1-3 days',d:'CC&Rs: Maintenance matrix',detail:'CC&Rs define the boundary between HOA and unit owner responsibility. Typically: structure, roof, exterior walls, common pipes = HOA. Interior finishes, fixtures, appliances = owner. If it is an owner responsibility, notify them in writing with the CC&R section cited.',ph:'evaluate'},
          {s:'Obtain 2-3 qualified contractor bids; verify licenses and insurance',t:'1-2 weeks',detail:'For emergency repairs (active leak, safety hazard), board may authorize immediate work under emergency spending provisions and ratify at next meeting. For non-emergency: always get competitive bids.',ph:'evaluate',ck:['Obtain bid 1','Obtain bid 2','Obtain bid 3','Verify licenses for each bidder','Verify insurance for each bidder'],requiresBids:true,minimumBids:3},
          {s:'FUNDING DECISION: Determine where the money comes from before approving the repair',t:'Before approval',d:'Fiscal Lens: Spending Decisions',detail:'Use the Spending Decisions tab to analyze: (1) Is this a BUDGETED operating expense? If yes, check if the budget category has room — use operating funds. (2) Is this a RESERVE item (e.g., roof, elevator, plumbing risers)? If yes, use reserves — that\'s what they\'re for. (3) Is this covered by INSURANCE (e.g., storm damage, water intrusion from covered peril)? File a claim. (4) Is this UNEXPECTED and large? Create a spending request to see the per-unit impact and options. Never spend money without knowing where it comes from.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'},ph:'approve',ck:['Check if budgeted operating expense','Check if reserve item','Check if covered by insurance','Create spending request if unexpected and large'],isSpendingDecision:true},
          {s:'Check bylaws for board spending authority — does this need an owner vote?',t:'Before approval',d:'Bylaws: Spending authority',detail:'Most bylaws authorize the board to spend up to a threshold (e.g., $5K-$25K) without owner vote. If the repair exceeds this threshold and is not an emergency, you need owner approval. If it IS an emergency (health/safety), proceed and ratify at the next meeting.',ph:'approve'},
          {s:'Board approves expenditure at meeting; document vote, funding source, and contractor selection in minutes',t:'Next board meeting (emergency exception for health/safety)',d:'Bylaws: Spending authority',detail:'Minutes should record: the repair needed, bids received, selected contractor and rationale, total cost, funding source (operating/reserve/insurance), and board vote.',ph:'approve',requiresConflictCheck:true},
          {s:'Create Work Order in Fiscal Lens; engage contractor; oversee work and document completion',t:'Per scope',d:'Fiscal Lens: Work Orders',detail:'Create a work order to track the full lifecycle: draft → approved → invoiced → paid. This creates GL entries automatically. Inspect completed work and photograph before releasing final payment.',action:{type:'modal',target:'create-wo',label:'Create Work Order'},ph:'execute'},
          {s:'Charge repair costs back to the responsible unit owner when caused by owner negligence',t:'After repair',d:'CC&Rs: Damage responsibility',detail:'CC&Rs authorize the HOA to charge back repair costs caused by owner negligence. Include: CC&R section cited, repair invoices, photos, and timeline for reimbursement. This reduces the financial impact on all other owners. If the owner disputes, escalate to formal demand.',w:'Required per CC&Rs when investigation determines owner negligence caused the damage',ph:'close'}
        ],
        self:[
          {s:'Send formal demand for reimbursement to responsible unit owner via certified mail',t:'Within 30 days of repair completion',d:'Declaration: Maintenance responsibility & DC Code § 42-1903.04',
           desc:'When investigation determines the damage was caused by unit owner negligence, send a formal written demand for reimbursement citing the specific Declaration provision, repair invoices, and photographic evidence.',
           detail:'The demand should include: (1) The specific Declaration/CC&R section that assigns responsibility for the damage to the unit owner (e.g., failure to maintain unit plumbing). (2) Before and after photos. (3) Copies of repair invoices. (4) A 30-day payment deadline. (5) Statement that failure to pay will result in the amount being added to the owner\'s assessment ledger per the governing documents, and the association may record a lien under DC Code § 42-1903.13. Send via certified mail with return receipt (USPS Form 3811).',
           w:'Required when unit owner is determined to be responsible for damage',ph:'close',
           ck:['Cite specific Declaration provision','Include before/after photos','Attach repair invoices','Set 30-day payment deadline','Send certified mail with return receipt']},
          {s:'Send written notice to contractor citing contract terms, deficiency documentation, and cure period',t:'Immediately upon identifying deficiency',d:'Contractor agreement',
           desc:'When a contractor\'s work does not meet contract standards, send a written notice citing the specific contract provisions, documenting the deficiency with photos, and providing a reasonable cure period (15-30 days).',
           detail:'The notice should: (1) Cite the specific contract provision violated. (2) Describe the deficiency with supporting photos and measurements. (3) Provide a cure period of 15-30 days. (4) State that failure to cure will result in withholding payment, drawing on the retention, or engaging a replacement contractor at the original contractor\'s expense. (5) If the contractor is licensed in DC, note that complaints can be filed with DLCP (formerly DCRA) contractor licensing division. Send certified mail.',
           w:'Required when contractor performance does not meet contract standards',ph:'close',
           ck:['Cite specific contract provision violated','Document deficiency with photos','Set 15-30 day cure period','Warn of consequences for failure to cure','Send certified mail']},
          {s:'File insurance claim under master policy and coordinate with unit owner HO-6 for interior damage',t:'Within 24-48 hours of damage discovery',d:'Insurance policy: Notice provisions & CC&Rs',
           desc:'When damage is covered under the HOA master policy (common elements) or a unit owner\'s HO-6 policy (unit interiors), file promptly and coordinate between policies to ensure full coverage.',
           detail:'(1) File master policy claim with the HOA carrier for common element damage. (2) Notify affected unit owners to file HO-6 claims for interior damage (flooring, drywall, personal property). (3) Review the CC&Rs for deductible allocation — common approaches: HOA bears the master policy deductible, deductible charged to the unit that caused the loss, or deductible split among affected units. (4) Do not dispose of damaged materials until the adjuster inspects. (5) If the carrier underpays, see insurance-claims workflow for appeal procedures.',
           w:'File promptly — most policies require notice within 24-48 hours',ph:'close',
           ck:['File master policy claim for common elements','Notify affected owners to file HO-6 claims','Determine deductible allocation per CC&Rs','Preserve damaged materials for adjuster']},
          {s:'Add unreimbursed repair costs to unit owner assessment ledger and pursue as delinquency if unpaid',t:'After 30-day demand period expires',d:'Declaration & DC Code § 42-1903.13',
           desc:'If the responsible unit owner does not pay the reimbursement demand, add the amount to their assessment ledger per the Declaration and pursue collection using the delinquent-accounts workflow.',
           detail:'Most Declarations authorize the association to add repair costs caused by owner negligence to the owner\'s assessment balance. Once added to the ledger, the amount is treated as an assessment and is subject to the same lien rights under DC Code § 42-1903.13, including the 6-month super-priority. Follow the standard collection process: late fee, second notice, formal demand, lien recording.',
           w:'Applies when responsible owner does not pay reimbursement within demand period',ph:'close'}
        ],
        legal:[
          {s:'Attorney reviews responsibility dispute between HOA and unit owner under the Declaration',t:'When responsibility is unclear or disputed',d:'Declaration: Maintenance matrix & DC Code § 42-1903.04',
           desc:'When there is a dispute over whether damage is a common element responsibility (HOA) or unit owner responsibility, engage an attorney to review the Declaration\'s maintenance allocation matrix and DC Code § 42-1903.04.',
           detail:'The attorney will: (1) Review the Declaration\'s maintenance matrix — this defines the boundary between common elements and unit owner responsibility. (2) Apply DC Code § 42-1903.04, which defines limited common elements and their maintenance allocation. (3) If the Declaration is ambiguous, review industry standards and DC case law. (4) Issue a written opinion that the board can rely on for its decision. (5) If the dispute involves multiple units (e.g., leak between floors), advise on allocation among responsible parties.',
           w:'Required when there is a genuine dispute over who pays for the repair',ph:'close'},
          {s:'Attorney pursues breach of contract claim against contractor for defective work',t:'After cure period expires without remedy',d:'Contractor agreement & DC Code',
           desc:'When a contractor fails to cure defective work within the notice period, the attorney sends a formal demand and pursues breach of contract claims, including engaging a replacement contractor at the original contractor\'s expense.',
           detail:'The attorney will: (1) Send a formal demand on firm letterhead with specific contract provisions violated. (2) If the contractor is bonded, make a claim against the performance bond. (3) File suit in DC Superior Court (510 4th St NW) — Small Claims for amounts up to $10,000, Civil Division for larger amounts. (4) Seek recovery of: cost to complete or repair the work, any additional damages caused by the defective work, and attorney fees if the contract provides for fee-shifting. (5) Report unlicensed contractors to DLCP.',
           w:'Required when contractor refuses to remedy defective work',ph:'close'},
          {s:'Attorney advises on repair cost exceeding board spending authority per bylaws',t:'Before committing to repair',d:'Bylaws: Spending authority & DC Code § 29-1135.03',
           desc:'When a non-emergency repair cost exceeds the board\'s spending authority under the bylaws, consult the attorney to determine whether owner vote is required and what approval process applies.',
           detail:'The attorney will: (1) Review bylaws for the board\'s unilateral spending limit (commonly $5K-$25K). (2) Determine whether the emergency exception applies (imminent threat to health, safety, or property). (3) If owner vote is needed, advise on the threshold (typically majority or 2/3 per DC Code § 29-1135.03) and notice requirements. (4) If the repair is from reserves for a designated component, board may have authority to approve without owner vote — attorney confirms. (5) Draft the owner notice if a vote is required.',
           w:'Required when non-emergency repair cost exceeds bylaws spending threshold',ph:'close'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.04: Maintenance responsibility follows the Declaration\'s allocation. Board has fiduciary duty to maintain common elements promptly. FUNDING: Routine maintenance = operating budget. Capital replacements (roof, elevator, plumbing) = reserves. Damage from covered perils = insurance. Check bylaws for spending authority limits — repairs above threshold require owner vote unless emergency.',
          '_':'FUNDING DECISION TREE: (1) Routine maintenance → operating budget. (2) Capital replacement → reserves (that\'s what they\'re for). (3) Covered peril damage → insurance claim. (4) Unexpected + large → Spending Decisions tab for funding analysis. Always document the funding source in board minutes.'
        }
      },
      { id:'emergency-situations', title:'Emergency Situations', desc:'Burst pipes, flooding, fire, storm damage, sewer backups',
        tags:['Burst pipes','Flooding','Fire damage','Storm damage','Emergency repair'],
        pre:[
          {s:'Ensure safety: evacuate if necessary, call 911 for fire/gas/structural',t:'Immediately',detail:'Life safety is the absolute first priority. Do not attempt to assess damage until area is safe.',ph:'document'},
          {s:'Engage emergency mitigation contractor (water extraction, board-up, temporary repairs)',t:'Within hours',d:'Bylaws: Emergency spending',detail:'Most bylaws authorize the board president or property manager to approve emergency spending without a full board vote when there is imminent risk to health, safety, or property. Document the emergency justification and take photos before mitigation begins.',ph:'document'},
          {s:'Document everything: photos, video, written timeline of events and actions taken',t:'Ongoing',detail:'This documentation is critical for insurance claims, contractor disputes, and demonstrating the board acted reasonably. Include: who discovered it, when, actions taken, contractors engaged, costs incurred. Create a single timeline document as events unfold.',ph:'document',ck:['Take photos of all damage','Record video','Create written timeline of events','Log all contractors engaged','Track all costs incurred']},
          {s:'Notify insurance carrier and file claim within policy timeframe',t:'Within 24-48 hours',d:'Insurance policy: Notice provisions',detail:'Contact carrier claims department. Provide: policy number, date/time of loss, description, initial photos, estimated damage. Request adjuster visit. Do not dispose of damaged materials until adjuster approves. This is your most important financial step — insurance is the first funding source for emergencies.',ph:'evaluate',ck:['Contact carrier claims department','Provide policy number and loss details','Submit initial photos','Request adjuster visit']},
          {s:'Notify affected unit owners in writing; advise on HO-6 claim filing for interior damage',t:'Within 24 hours',detail:'Owners need to file their own HO-6 claims for unit interior damage (flooring, drywall, personal property). Provide: description of incident, areas affected, HOA carrier claim number, contact for questions.',ph:'evaluate'},
          {s:'Track all emergency expenditures in Fiscal Lens immediately — do not wait',t:'As incurred',d:'Fiscal Lens: Work Orders & Spending Decisions',detail:'Create work orders for each contractor/vendor even during the emergency. This is critical for: (1) insurance reimbursement — carrier will want itemized records, (2) board ratification, (3) determining the funding gap later. Sloppy record-keeping during emergencies is the #1 reason HOAs fail to recover full insurance proceeds.',action:{type:'navigate',target:'financial:workorders',label:'Open Work Orders'},ph:'execute'},
          {s:'Board ratifies emergency expenditure at next meeting; document justification and funding source',t:'Next board meeting',d:'Bylaws: Emergency provisions',detail:'Present: description of emergency, actions taken, contractors engaged, total cost, insurance claim status, funding source. Board votes to ratify. Record in minutes. Even though the board president had authority to act, ratification creates a formal record.',ph:'approve',isSpendingDecision:true,requiresConflictCheck:true},
          {s:'FUNDING THE GAP: After adjuster estimate, determine the shortfall and how to cover it',t:'After adjuster estimate',d:'Fiscal Lens: Spending Decisions',detail:'Calculate: Total repair cost minus insurance proceeds minus HOA deductible = gap. Use the Spending Decisions tab to analyze options: (1) INSURANCE covers most or all — best case, wait for proceeds. (2) OPERATING BUDGET can absorb the deductible + small gap. (3) RESERVES can cover the gap if the item is a designated reserve component. (4) SPECIAL ASSESSMENT needed if gap is large — check bylaws for emergency assessment procedures (often expedited notice/vote). (5) HOA LINE OF CREDIT to bridge until insurance pays.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'},ph:'execute',ck:['Calculate total repair cost','Subtract insurance proceeds','Subtract HOA deductible','Analyze funding options for the gap'],isSpendingDecision:true},
          {s:'Appeal and pursue the insurance claim aggressively when denied or underpaid',t:'Within appeal window',detail:'Insurance carriers frequently underpay first estimates. Steps: (1) Get a detailed independent estimate from your own contractor. (2) File a written appeal with supporting documentation. (3) Request the specific policy provision cited for any denial. (4) Consider a public adjuster (works on contingency, typically 10% of recovery). (5) Escalate to state insurance commissioner if necessary.',w:'Required when carrier denies or underpays — carriers frequently underpay first estimates',ph:'close',ck:['Get independent contractor estimate','File written appeal with documentation','Request policy provision cited for denial','Consider public adjuster','Escalate to state insurance commissioner if needed']},
          {s:'Determine who caused the damage and pursue cost recovery',t:'After emergency stabilized',detail:'If caused by unit owner negligence (e.g., left water running, failed to maintain appliance): the CC&Rs typically allow the HOA to charge the repair cost back to the owner. If caused by a contractor or third party: pursue their insurance. Cost recovery reduces the financial impact on the HOA and all other owners.',w:'Applicable when damage was caused by identifiable negligence',ph:'close'}
        ],
        self:[
          {s:'Coordinate insurance between master policy and unit HO-6 policies; determine deductible allocation per CC&Rs',t:'Within 48 hours of incident',d:'CC&Rs: Insurance provisions & Master insurance policy',
           desc:'Coordinate the claims process between the association\'s master policy (for common element damage) and individual unit owners\' HO-6 policies (for unit interior damage). Review the CC&Rs for deductible allocation responsibility.',
           detail:'CC&Rs typically define deductible allocation using one of these approaches: (1) HOA bears the master policy deductible from operating budget or reserves. (2) Deductible charged to the unit that caused the loss (e.g., owner whose pipe burst). (3) Deductible split among affected units proportionally. Know your CC&Rs approach BEFORE the emergency. Notify affected owners in writing to file HO-6 claims for interior damage — they have separate notice deadlines. Provide the HOA carrier claim number for cross-reference.',
           ph:'close',ck:['File master policy claim for common elements','Notify affected owners to file HO-6 claims','Review CC&Rs for deductible allocation','Provide carrier claim number to affected owners']},
          {s:'Send formal notice of responsibility and demand for reimbursement to negligent unit owner',t:'After cause determination',d:'Declaration: Damage responsibility & DC Code § 42-1903.04',
           desc:'When investigation determines that a unit owner\'s negligence caused the emergency (e.g., failed appliance, unattended water), send a formal written demand for reimbursement of the HOA\'s repair costs plus deductible.',
           detail:'The demand should include: (1) Investigation report identifying the cause and responsible unit. (2) Specific CC&R/Declaration provision assigning responsibility. (3) Itemized repair costs with invoices. (4) HOA deductible amount if applicable per CC&Rs deductible allocation provision. (5) Before and after photos. (6) 30-day payment deadline. (7) Statement that unpaid amounts will be added to the owner\'s assessment ledger and are subject to lien under DC Code § 42-1903.13. Send via certified mail with return receipt.',
           w:'Required per CC&Rs when owner negligence caused the damage',ph:'close',
           ck:['Include investigation report','Cite Declaration responsibility provision','Itemize repair costs with invoices','Include HOA deductible per CC&Rs','Set 30-day payment deadline','Send certified mail with return receipt']},
          {s:'After emergency is resolved: review insurance coverage, deductible levels, and emergency spending procedures',t:'Within 60 days of resolution',d:'Insurance policy & Bylaws',
           desc:'After every emergency, conduct a post-incident review of insurance coverage adequacy, deductible levels, and the board\'s emergency response procedures. Adjust coverage at the next renewal and update emergency protocols.',
           detail:'Review: (1) Was coverage adequate? If not, increase limits at renewal. (2) Was the deductible manageable? If it strained finances, consider lowering it — the premium increase is usually modest compared to the deductible reduction. (3) Were there gaps (e.g., flood not covered, mold excluded)? Consider endorsements. (4) Did the emergency spending procedures work? Update the bylaws or board resolution if needed. (5) Update the association\'s emergency contact list and procedures manual. (6) Present the review findings at the next board meeting and adopt improvements by resolution.',
           ph:'close',ck:['Review coverage adequacy','Evaluate deductible level','Identify coverage gaps','Update emergency procedures','Present findings at board meeting']},
          {s:'Pursue carrier appeal or public adjuster when insurance claim is denied or underpaid',t:'Within appeal window per policy',d:'Insurance policy & DC insurance regulations',
           desc:'Insurance carriers frequently deny or underpay first estimates. Document actual costs with independent contractor estimates and pursue formal appeal. Consider engaging a public adjuster who works on contingency.',
           detail:'Steps: (1) Get a detailed independent estimate from your own contractor — not the carrier\'s preferred vendor. (2) File a written appeal with supporting documentation (photos, estimates, expert reports). (3) Request the specific policy provision cited for any denial. (4) Consider a public adjuster — they work on contingency (typically 10% of recovery) and specialize in maximizing claims. (5) File a complaint with the DC Department of Insurance, Securities, and Banking (DISB) if the carrier is acting in bad faith. (6) As a last resort, engage an attorney for a bad faith claim.',
           w:'Carriers frequently underpay — document actual costs and appeal aggressively',ph:'close',
           ck:['Obtain independent contractor estimate','File written appeal with documentation','Request policy provision cited for denial','Consider public adjuster','File DISB complaint if warranted']}
        ],
        legal:[
          {s:'Attorney advises on insurance coverage disputes, deductible allocation, and carrier negotiations',t:'When carrier denies or significantly underpays',d:'Insurance policy & DC insurance regulations',
           desc:'When the insurance carrier denies a valid claim, significantly underpays, or there is a dispute over deductible allocation among unit owners, engage an attorney experienced in DC insurance law.',
           detail:'The attorney will: (1) Review the policy language and the carrier\'s basis for denial or reduced payment. (2) Send a formal demand citing specific policy provisions. (3) Negotiate with the carrier\'s claims department. (4) Advise on filing a complaint with DC DISB (Department of Insurance, Securities, and Banking). (5) If deductible allocation among unit owners is disputed, interpret the CC&Rs and issue a recommendation. (6) File a bad faith claim if the carrier is unreasonably denying or delaying a valid claim.',
           w:'Required when carrier denies or significantly underpays a valid claim',ph:'close'},
          {s:'Attorney pursues subrogation or third-party claims for cost recovery against negligent parties',t:'After emergency stabilized',d:'DC Code § 42-1903.04 & Declaration',
           desc:'When the emergency was caused by a negligent third party (contractor, adjacent property, utility company) or unit owner, the attorney pursues cost recovery through subrogation or direct claims.',
           detail:'The attorney will: (1) Identify all potentially responsible parties. (2) Send preservation of evidence notices. (3) File claims against the responsible party\'s insurance. (4) If the responsible party is a unit owner, the attorney can add the amount to the owner\'s ledger per the Declaration and record a lien under DC Code § 42-1903.13 if unpaid. (5) If the responsible party is a contractor, pursue claims against their GL insurance and any applicable bonds. (6) File suit in DC Superior Court (510 4th St NW) if claims are not resolved.',
           w:'Required when damage was caused by identifiable negligence — delay weakens recovery claims',ph:'close'},
          {s:'Attorney advises on emergency special assessment authority when insurance is insufficient and reserves cannot cover the gap',t:'After adjuster estimate confirms shortfall',d:'Bylaws: Emergency provisions & DC Code § 29-1135.03',
           desc:'When insurance proceeds and reserves cannot cover the full emergency repair cost, the attorney advises on the board\'s authority to levy an emergency special assessment and whether expedited voting procedures are available.',
           detail:'The attorney will: (1) Review bylaws for emergency spending and emergency assessment provisions — some bylaws allow expedited notice (10-15 days instead of 30-60) for emergencies. (2) Determine the voting threshold for an emergency special assessment per DC Code § 29-1135.03 (typically 2/3 owner approval). (3) Advise on whether an HOA line of credit can bridge the gap until insurance pays. (4) Draft the emergency assessment notice. (5) Advise on per-unit allocation per the Declaration\'s percentage interests.',
           w:'Required when insurance and reserves are insufficient to cover emergency repair costs',ph:'close'},
          {s:'Attorney files bad faith claim against carrier or engages litigation counsel for coverage dispute',t:'After appeal is exhausted',d:'DC insurance regulations & DC Superior Court',
           desc:'When the carrier unreasonably denies or underpays a valid claim and internal appeals are exhausted, the attorney files a bad faith claim or coverage litigation in DC Superior Court.',
           detail:'The attorney will: (1) Evaluate the strength of the bad faith claim — did the carrier fail to investigate, delay unreasonably, or misrepresent policy provisions? (2) File a complaint with DC DISB. (3) File suit in DC Superior Court seeking: the full policy amount, consequential damages, and attorney fees. (4) DC law allows recovery of attorney fees in insurance bad faith cases. (5) Engage a public adjuster to support the damages calculation.',
           w:'Required when carrier significantly underpays or unreasonably denies a valid claim',ph:'close'}
        ],
        notes:{
          'DC':'DC Code § 29-1108.01: Board has implied authority for emergency actions to protect health, safety, and property. Ratify at next board meeting. FUNDING EMERGENCIES: (1) Insurance is the primary source — file immediately, document everything, appeal underpayments. (2) Reserves can cover the gap for designated components. (3) Operating budget absorbs smaller gaps (deductibles, uncovered costs). (4) Emergency special assessment if gap is large — some bylaws allow expedited voting procedures. (5) HOA line of credit bridges cash flow until insurance pays. Track every dollar for reimbursement.',
          '_':'EMERGENCY FUNDING PRIORITY: (1) Insurance — file immediately, document thoroughly. (2) Reserves — for designated capital components. (3) Operating budget — for smaller gaps. (4) Special assessment — last resort, check bylaws for expedited procedures. The biggest mistake boards make in emergencies is not tracking expenses carefully enough to get full insurance reimbursement.'
        }
      },
      { id:'vendor-management', title:'Vendor Management', desc:'Hiring contractors, reviewing bids, contracts, disputes',
        tags:['Hiring contractors','Reviewing bids','Performance disputes','Contract management'],
        pre:[
          {s:'Define scope of work and budget; determine funding source and check spending authority',t:'Before soliciting bids',d:'Bylaws: Spending authority & Fiscal Lens',detail:'Before soliciting bids: (1) Check the budget category in Fiscal Lens — is there room in the operating budget? (2) If this is a capital item, check reserves. (3) Check bylaws for contract value thresholds (typically $10K-$25K requires owner vote). For recurring contracts (landscaping, management), compare the ANNUAL value to the threshold, not the monthly amount.',action:{type:'navigate',target:'financial:budget',label:'Open Budget'},ph:'document',ck:['Define scope of work','Determine budget amount','Identify funding source','Check spending authority threshold']},
          {s:'Obtain minimum 3 competitive bids from qualified contractors',t:'2-4 weeks',detail:'Provide identical scope to all bidders for fair comparison. Request: itemized pricing, timeline, references, proof of insurance, license number. A good bid process saves the HOA money and demonstrates fiduciary care.',ph:'evaluate',requiresBids:true,minimumBids:3},
          {s:'Verify contractor licenses, insurance (GL + workers comp), and check references',t:'1-2 weeks',d:'Fiduciary duty of care',detail:'Require: current state/local business license, general liability insurance ($1M+ naming HOA as additional insured), workers compensation if they have employees, completed W-9. Call 2-3 references on similar projects.',ph:'evaluate',ck:['Verify business license','Verify GL insurance with HOA as additional insured','Verify workers compensation','Collect W-9','Check 2-3 references']},
          {s:'Review contract terms: scope, fixed price, timeline, payment schedule, warranty, indemnification, termination',t:'1 week',detail:'Key terms: payment tied to milestones (not time), 10% retention on large projects, warranty (1-2 years minimum), insurance requirements, hold-harmless/indemnification, termination for cause and convenience, dispute resolution.',ph:'evaluate',ck:['Review scope and fixed price','Review timeline and payment schedule','Review warranty terms','Review indemnification clause','Review termination provisions']},
          {s:'Check for conflicts of interest: does any board member have a relationship with the contractor?',t:'Before approval',d:'Fiduciary duty of loyalty',detail:'Any board member with a relationship to the contractor must disclose and recuse from discussion and vote per conflict of interest policy. Document disclosure in minutes. This is a common source of board liability — take it seriously.',ph:'approve',requiresConflictCheck:true},
          {s:'Submit Spending Decision request and obtain board approval at meeting',t:'Board meeting',d:'Fiscal Lens: Spending Decisions & Bylaws',detail:'For contracts above $5K: create a spending request in Fiscal Lens so the board can see the funding analysis (operating vs reserves, per-unit impact). Board approves with vote documented in minutes. If value exceeds bylaws threshold, schedule owner vote first.',w:'Required when amount exceeds routine spending threshold',ph:'approve',isSpendingDecision:true},
          {s:'Execute contract; create Work Order in Fiscal Lens; set up payment milestones',t:'After approval',d:'Fiscal Lens: Work Orders',detail:'The WO tracks the financial lifecycle: draft → approved → invoiced → paid, creating GL entries automatically. Set payment milestones tied to completed work — never pay ahead of work.',action:{type:'modal',target:'create-wo',label:'Create Work Order'},ph:'execute'},
          {s:'Monitor performance; document milestones and any deficiencies in writing immediately',t:'Ongoing',detail:'Regular progress check-ins. Photograph completed milestones. Send written notice of any deficiencies immediately — do not wait until project end. Early communication prevents disputes.',ph:'execute'},
          {s:'Final inspection, punch list resolution, retention release, and warranty documentation',t:'At completion',detail:'Walk project with contractor and board representative. Create written punch list. Do not release retention until all items resolved and warranty documentation received. Update the reserve study if this was a capital replacement.',ph:'close',ck:['Conduct final inspection','Create written punch list','Resolve all punch list items','Release retention','Collect warranty documentation']}
        ],
        self:[
          {s:'Send written notice citing contract provisions with 15-30 day cure period for performance deficiencies',t:'Immediately upon identifying deficiency',d:'Contractor agreement',
           desc:'When contractor performance does not meet contract standards, send a written notice citing the specific contract provisions violated, documenting the deficiency with photos and measurements, and providing a reasonable cure period.',
           detail:'The notice should: (1) Cite the specific contract provision or scope item not met. (2) Describe the deficiency with before/after photos and measurements. (3) Set a cure period of 15-30 days (reasonable based on the scope of the deficiency). (4) State that failure to cure will result in: withholding remaining payments, engaging a replacement contractor at the original contractor\'s expense, or terminating the contract for cause per the termination clause. (5) Reference any applicable warranty provisions. Send certified mail with return receipt.',
           w:'Required when contractor performance does not meet contract standards',ph:'close',
           ck:['Cite specific contract provision violated','Document deficiency with photos','Set 15-30 day cure period','State consequences of failure to cure','Send certified mail with return receipt']},
          {s:'Send formal demand for cost of remediation when contractor fails to cure deficiency',t:'After cure period expires',d:'Contractor agreement & DC DLCP',
           desc:'When the contractor does not cure the deficiency within the notice period, send a formal demand for the cost of remediation — either by the contractor or by a replacement contractor at the original contractor\'s expense.',
           detail:'The demand should include: (1) Summary of the original notice and cure period. (2) Documentation that the deficiency was not cured. (3) Cost estimate or invoice from a replacement contractor to complete the work properly. (4) Demand for payment within 30 days. (5) Statement that the association will pursue legal action if not resolved. (6) If the contractor posted a performance bond, make a claim against the bond. (7) Withhold any remaining contract payments as offset.',
           w:'Required when contractor fails to cure within the notice period',ph:'close',
           ck:['Document failure to cure','Obtain replacement contractor estimate','Demand payment within 30 days','File bond claim if applicable','Withhold remaining contract payments']},
          {s:'File complaint with DC DLCP for unlicensed contractor, fraud, or abandoned work',t:'When warranted',d:'DC DLCP contractor licensing regulations',
           desc:'File a complaint with the DC Department of Licensing and Consumer Protection (DLCP, formerly DCRA) when a contractor is discovered to be unlicensed, engages in fraudulent practices, or abandons the project.',
           detail:'File online at dlcp.dc.gov or in person. Include: (1) Contractor name and business information. (2) Contract and scope of work. (3) Description of the complaint — unlicensed work, fraud, abandonment, etc. (4) Supporting documentation (contract, payments, photos). (5) DLCP can revoke or suspend licenses, impose fines, and refer for criminal prosecution. (6) Also consider filing a complaint with the Better Business Bureau and posting on public review sites.',
           w:'Applicable when contractor is unlicensed, fraudulent, or abandons the project',ph:'close',
           ck:['Gather contract and payment records','Document complaint with supporting evidence','File at dlcp.dc.gov','File BBB complaint if warranted']},
          {s:'Engage replacement contractor to complete or correct work; pursue original contractor for cost recovery',t:'After termination for cause',d:'Contractor agreement & DC Code',
           desc:'After terminating the original contractor for cause, engage a replacement contractor to complete or correct the work. Document all additional costs incurred as damages for recovery from the original contractor.',
           detail:'Steps: (1) Follow original solicitation process — obtain 2-3 bids for the remaining or corrective scope. (2) Document the exact scope needed versus what the original contractor completed. (3) Track all additional costs (difference between replacement cost and original contract price for the same scope). (4) These additional costs are recoverable from the original contractor as breach of contract damages. (5) If the original contractor was bonded, pursue the surety bond first. (6) File suit in DC Superior Court if needed — Small Claims up to $10,000, Civil Division for larger amounts.',
           ph:'close',ck:['Obtain 2-3 bids for remaining scope','Document additional costs','Pursue original contractor for cost recovery','File bond claim if applicable']}
        ],
        legal:[
          {s:'Attorney reviews contract before execution for projects exceeding $25K or per bylaws threshold',t:'Before signing',d:'Bylaws: Spending authority',
           desc:'For large projects, have an attorney review the contract terms before execution — scope, fixed price vs GMP, payment schedule, retention, warranty, indemnification, insurance requirements, and termination provisions.',
           detail:'The attorney will: (1) Ensure the scope is sufficiently detailed for enforceability. (2) Review payment terms — milestones tied to completed work, not time; 10% retention on large projects. (3) Confirm warranty period (1-2 years minimum). (4) Review indemnification and hold-harmless provisions — the contractor should indemnify the HOA. (5) Confirm insurance requirements (GL, workers comp, auto, naming HOA as additional insured). (6) Review the termination clause — ensure termination for cause and convenience. (7) For projects over $50K, recommend a performance bond. (8) Ensure the contract complies with DC DLCP licensing requirements.',
           w:'Required for contracts exceeding $25K or per bylaws spending threshold',ph:'execute'},
          {s:'Attorney sends demand and pursues breach of contract claim for contractor default or defective work',t:'After cure period expires',d:'Contractor agreement & DC Superior Court',
           desc:'When a contractor defaults on the contract or delivers defective work that is not cured within the notice period, the attorney sends a formal demand and pursues breach of contract litigation.',
           detail:'The attorney will: (1) Send a formal demand on firm letterhead with specific contract provisions violated and damages calculated. (2) If the contractor is bonded, file a performance bond claim with the surety. (3) File suit in DC Superior Court (510 4th St NW) — Small Claims up to $10,000, Civil Division for larger amounts. (4) Seek recovery of: cost to complete or repair, consequential damages (e.g., water damage from defective roofing), and attorney fees if the contract provides for fee-shifting. (5) Report unlicensed contractors to DLCP.',
           w:'Required when contractor defaults or delivers defective work and refuses to remedy',ph:'close'},
          {s:'Attorney advises on owner approval requirements when contract value exceeds board spending authority',t:'Before committing to the contract',d:'Bylaws: Spending authority & DC Code § 29-1135.03',
           desc:'When a vendor contract value exceeds the board\'s spending authority under the bylaws, the attorney advises on whether owner vote is required, the voting threshold, and the notice process.',
           detail:'The attorney will: (1) Review bylaws for the board\'s unilateral spending limit — compare the total contract value (not monthly amount) to the threshold. (2) Determine whether an emergency exception applies. (3) If owner vote is needed, advise on the threshold (typically majority or 2/3 per DC Code § 29-1135.03) and notice requirements. (4) Advise on structuring the contract to comply — e.g., a multi-year contract that exceeds the threshold over its full term may require owner approval even if each year is below threshold. (5) Draft the owner notice and resolution.',
           w:'Required when contract value exceeds board spending authority per bylaws',ph:'close'}
        ],
        notes:{
          'DC':'DC DLCP (formerly DCRA) handles contractor licensing. Verify at dlcp.dc.gov. Require GL insurance naming HOA as additional insured. Check bylaws for contract value thresholds. FUNDING: Operating expenses = operating budget. Capital replacements = reserves. Use the Spending Decisions tab for contracts over $5K to see the financial impact before the board votes.',
          '_':'BEFORE YOU HIRE: (1) Know where the money comes from (operating budget vs reserves). (2) Check if the amount exceeds board spending authority. (3) Get 3+ bids. (4) Verify licenses and insurance. (5) Document the selection rationale. The bid process and spending authority check protect the board from liability.'
        }
      },
      { id:'inspection-scheduling', title:'Inspection Scheduling', desc:'Required inspections: fire safety, elevator, boiler, backflow, structural under DC codes',
        tags:['Fire safety inspections','Elevator inspections','Boiler inspections','Building code inspections','Backflow prevention'],
        pre:[
          {s:'Identify all required inspections and regulatory deadlines per DC codes',t:'Start of each calendar year',d:'DC Fire Prevention Code (12-A DCMR) & DC Construction Codes',
           desc:'DC requires regular inspections for fire safety systems, elevators, boilers, backflow preventers, and building facades. Maintain a master inspection calendar with all deadlines, responsible agencies, and contractor requirements.',
           detail:'Required DC inspections include: (1) FIRE SAFETY — Annual inspection of fire alarm, sprinkler, standpipe, and fire extinguisher systems per 12-A DCMR. Coordinated through DC Fire and EMS (FEMS). (2) ELEVATORS — Annual inspection by DC DLCP Elevator Division per 12-H DCMR. Operating permit must be current and posted in each elevator. (3) BOILERS — Annual inspection by DC DLCP Boiler Division per 12-K DCMR. (4) BACKFLOW PREVENTERS — Annual testing required by DC Water per 21 DCMR § 5401. (5) STRUCTURAL — Periodic facade and balcony inspections may be required for buildings over 5 stories under DC building code amendments. Create a master calendar with all deadlines.',
           ph:'document',ck:['Schedule fire system annual inspection','Schedule elevator annual inspection','Schedule boiler annual inspection','Schedule backflow preventer testing','Check facade/balcony inspection requirements','Create master inspection calendar']},
          {s:'Engage qualified, DC-licensed inspectors for each required inspection type',t:'60-90 days before deadline',d:'DLCP licensing requirements',
           desc:'Each inspection type requires a specifically licensed or certified professional. Engage inspectors with current DC credentials and obtain cost proposals.',
           detail:'(1) Fire systems: Licensed fire protection contractor per DCMR. (2) Elevators: Inspection performed by DLCP inspectors — the association schedules and pays the permit fee. (3) Boilers: Inspection performed by DLCP boiler inspectors or authorized insurance company inspectors. (4) Backflow: Certified backflow tester registered with DC Water. (5) Structural: Licensed professional engineer (PE) registered in DC. Obtain 2-3 quotes for contractor-performed inspections. Verify all licenses at dlcp.dc.gov.',
           ph:'document',ck:['Verify inspector DC licenses','Obtain 2-3 quotes','Confirm inspector availability before deadline']},
          {s:'Schedule inspection date and coordinate building access with management and residents',t:'30-45 days before inspection',d:'DC notice requirements',
           desc:'Schedule the inspection and provide adequate notice to residents, especially when inspectors need access to individual units (fire alarms, sprinklers, boilers in mechanical rooms).',
           detail:'(1) Confirm the inspection date with the inspector/agency. (2) Notify all residents of the date, time, and any access requirements. (3) For unit access (fire alarm testing, sprinkler inspections), provide at least 48-72 hours written notice per DC law. (4) Coordinate with the management company to have staff present. (5) Ensure all mechanical rooms and utility areas are accessible. (6) Post notices in common areas and elevators.',
           ph:'evaluate',ck:['Confirm inspection date','Notify residents 48-72 hours in advance','Ensure mechanical room access','Post notices in common areas','Arrange management staff to be present']},
          {s:'Attend inspection; receive preliminary findings and certificate of inspection',t:'Inspection day',d:'Applicable DC code section',
           desc:'A board member or management representative should attend every inspection to understand findings firsthand, ask questions, and receive the preliminary report or certificate.',
           detail:'During the inspection: (1) Accompany the inspector throughout. (2) Take notes on any observations or concerns raised. (3) Ask about the severity of any findings — critical (immediate safety hazard) vs non-critical (corrective action within a timeframe). (4) Obtain the inspection report or certificate. (5) For elevator and boiler inspections, ensure the updated operating permit is posted. (6) If the inspection fails, get specific details on required corrections and reinspection timeline.',
           ph:'execute'},
          {s:'Address deficiencies within the timeline specified by the inspector or regulatory agency',t:'Per inspector directive',d:'DC enforcement code',
           desc:'When an inspection identifies deficiencies, create a remediation plan with specific action items, engage contractors for repairs, and schedule reinspection within the required timeline.',
           detail:'For critical findings (safety hazards): address immediately — the inspector may issue a stop-use order for equipment or areas until corrected. For non-critical findings: address within the timeline specified (typically 30-90 days). Steps: (1) Create a written remediation plan. (2) Engage licensed contractors for repairs. (3) Obtain repair invoices and documentation. (4) Schedule reinspection with the inspector or agency. (5) Failure to address findings can result in fines, equipment shutdown orders, or building code violations. Track all remediation costs and include in the maintenance budget.',
           w:'Critical findings may require immediate action — inspector can issue stop-use orders',ph:'execute',
           ck:['Create written remediation plan','Engage licensed contractors','Schedule reinspection','Track remediation costs']},
          {s:'File inspection reports, certificates, and remediation records in building records; update master calendar',t:'Within 1 week of inspection',d:'Document retention policy',
           desc:'File all inspection reports, certificates, operating permits, and remediation documentation in the association\'s permanent building records. Update the master inspection calendar for the next cycle.',
           detail:'Maintain organized records for: (1) Current and historical inspection reports. (2) Certificates of inspection and operating permits. (3) Remediation work orders and invoices. (4) Contractor certifications. These records are needed for: insurance claims, resale certificates per DC Code § 42-1904.04(a), regulatory compliance, and due diligence by prospective buyers. Update the master calendar with next inspection due dates.',
           ph:'close',ck:['File inspection report','Update operating permits','File remediation documentation','Update master inspection calendar']}
        ],
        self:[
          {s:'Create written remediation plan with contractor engagement for any cited deficiencies',t:'Within 7 days of failed inspection',d:'DC enforcement code',
           desc:'When an inspection results in a deficiency citation, create a detailed remediation plan documenting the deficiency, the corrective action, the contractor engaged, the timeline, and the reinspection date.',
           detail:'The plan should include: (1) Description of each deficiency as cited by the inspector. (2) Corrective action required. (3) Contractor engaged (licensed in DC per DLCP). (4) Estimated cost and funding source. (5) Completion deadline per inspector directive. (6) Reinspection date. Send the plan to the inspector or agency if they request it. Track completion status and report at the next board meeting.',
           w:'Required when inspection results in deficiency citation',ph:'execute',
           ck:['Document each cited deficiency','Identify corrective action','Engage licensed contractor','Set completion deadline per inspector','Schedule reinspection']},
          {s:'Respond to DLCP enforcement notice or fine for expired operating permits',t:'Within response period stated in notice',d:'DLCP enforcement regulations',
           desc:'When DLCP issues an enforcement notice or fine for expired elevator, boiler, or other operating permits, respond promptly to avoid escalating penalties.',
           detail:'Steps: (1) Review the notice for the specific violation and response deadline. (2) Schedule the overdue inspection immediately. (3) Pay any required fees or fines. (4) Respond in writing to DLCP documenting the corrective action taken and the scheduled inspection date. (5) Prevent recurrence by updating the master inspection calendar with automatic reminders 90 and 60 days before each deadline.',
           w:'Expired operating permits can result in equipment shutdown orders and significant fines',ph:'close',
           ck:['Review notice for violation details','Schedule overdue inspection','Pay required fees or fines','Respond in writing to DLCP','Update master calendar with reminders']},
          {s:'Maintain insurance certificate documentation for all inspection contractors',t:'Before each inspection',d:'Fiduciary duty',
           desc:'Verify that every contractor performing inspection or remediation work has current insurance and DC licensing before they enter the building.',
           detail:'Require: (1) Current DC business license. (2) General liability insurance ($1M+ minimum with HOA named as additional insured). (3) Workers compensation if contractor has employees. (4) Applicable specialty certifications (fire protection, backflow testing, elevator maintenance). Keep certificates on file.',
           ph:'document'}
        ],
        legal:[
          {s:'Attorney responds to formal citations, enforcement actions, or stop-use orders from DC agencies',t:'Within response period per citation',d:'DC enforcement code & DLCP regulations',
           desc:'When DC agencies (DLCP, FEMS, DC Water) issue formal citations, enforcement actions, fines, or stop-use orders resulting from failed inspections, engage an attorney to respond, negotiate, and protect the association.',
           detail:'The attorney will: (1) Review the citation for accuracy — are the cited violations correct and within the agency\'s jurisdiction? (2) Determine whether an appeal or hearing is available. (3) Negotiate reduced fines if the association can demonstrate prompt remediation. (4) If a stop-use order is issued (e.g., elevator shutdown), advise on emergency remediation and interim measures. (5) Represent the association at administrative hearings. (6) Assess whether the association has claims against the management company or maintenance contractor for failing to schedule required inspections.',
           w:'Required when formal citation or enforcement action is issued by a DC agency',ph:'close'},
          {s:'Attorney advises on liability exposure for inspection failures affecting resident safety',t:'When safety-related inspection fails',d:'DC Code § 29-1108.01 & Building code',
           desc:'When a safety-related inspection failure (fire system, elevator, structural) creates potential liability for resident injuries, the attorney assesses the association\'s exposure and recommends immediate action.',
           detail:'The attorney will: (1) Assess the association\'s liability for injuries that could result from the identified deficiency. (2) Notify D&O and general liability insurance carriers. (3) Advise on interim safety measures (e.g., posting the elevator out of service, restricting access to affected areas). (4) Review whether the failure constitutes a breach of the board\'s fiduciary duty under DC Code § 29-1108.01. (5) Assess potential claims against the maintenance contractor or management company.',
           w:'Required when safety inspection failure creates potential resident injury liability',ph:'close'}
        ],
        notes:{
          'DC':'DC requires: (1) Annual fire system inspection per 12-A DCMR — coordinated through FEMS. (2) Annual elevator inspection by DLCP Elevator Division per 12-H DCMR — operating permit must be posted. (3) Annual boiler inspection by DLCP Boiler Division per 12-K DCMR. (4) Annual backflow preventer testing per DC Water (21 DCMR § 5401). (5) Facade inspections may be required for buildings over 5 stories. File all records. Expired permits can result in equipment shutdown and significant fines.',
          '_':'INSPECTION CALENDAR: Maintain a master calendar of all required inspections with 90-day and 60-day reminders. Assign responsibility (board member or management company). Most DC inspections are annual. Failure to maintain current inspections creates liability exposure, insurance issues, and can result in equipment shutdown orders.'
        }
      },
      { id:'preventative-maintenance', title:'Preventative Maintenance', desc:'Scheduled maintenance programs: HVAC, roof, pest control, plumbing, fire/life safety',
        tags:['Annual inspections','Fire/life safety','Roof inspections','HVAC maintenance','Pest control','Plumbing'],
        pre:[
          {s:'Create comprehensive annual maintenance calendar covering all building systems',t:'Start of each calendar year',d:'Reserve study & DC building codes',
           desc:'Build a month-by-month maintenance calendar covering every building system — HVAC, roofing, plumbing, electrical, fire/life safety, elevators, exterior envelope, pest control, and common area upkeep.',
           detail:'Key maintenance items by season: SPRING: roof inspection, exterior caulking/sealant check, HVAC cooling startup, gutter cleaning, landscape spring prep, pest control. SUMMER: cooling system monitoring, exterior painting/touch-up, parking lot maintenance. FALL: HVAC heating startup, boiler pre-season inspection, gutter cleaning, weatherization, landscape winterization. WINTER: snow/ice plan, pipe freeze prevention, heating system monitoring. YEAR-ROUND: fire extinguisher monthly visual checks, common area cleaning, lighting, elevator maintenance per contract. Reference the reserve study component list to ensure all items with limited useful life are tracked.',
           ph:'document',ck:['List all building systems','Assign maintenance frequency for each','Map items to calendar months','Cross-reference with reserve study components']},
          {s:'Schedule all required inspections and contractor maintenance visits per DC codes',t:'90 days before each deadline',d:'DC Fire Prevention Code (12-A DCMR) & DC building codes',
           desc:'Schedule all regulatory inspections (fire, elevator, boiler, backflow) and recurring maintenance visits (HVAC, pest control, roofing) well in advance of deadlines.',
           detail:'Use the inspection-scheduling workflow for regulatory inspections. For contractor maintenance visits: (1) Review existing maintenance contracts for scheduling provisions. (2) Confirm contractor availability for seasonal work (HVAC companies are busiest in spring and fall — schedule early). (3) Budget for maintenance costs in the operating budget — preventative maintenance is ALWAYS cheaper than emergency repair. (4) Coordinate access to mechanical rooms, rooftops, and units requiring service.',
           ph:'evaluate',ck:['Schedule fire system inspection','Schedule elevator inspection','Schedule boiler inspection','Schedule backflow testing','Schedule HVAC seasonal service','Schedule roof inspection','Schedule pest control visits']},
          {s:'Document all maintenance activities, inspection results, and deficiency remediation',t:'After each activity',d:'Document retention policy',
           desc:'Maintain detailed records of every maintenance activity — date, contractor, scope, findings, and any follow-up needed. These records support insurance claims, warranty claims, and demonstrate fiduciary diligence.',
           detail:'For each maintenance activity, record: (1) Date and time. (2) Contractor name and credentials. (3) Work performed. (4) Findings or deficiencies noted. (5) Photos if applicable. (6) Follow-up items with assigned responsibility and deadline. (7) Cost. Organize by building system. These records are invaluable for: insurance claims (proving maintenance history), warranty claims (proving proper maintenance per manufacturer requirements), reserve study updates (actual condition vs projected), and resale certificates per DC Code § 42-1904.04(a).',
           ph:'approve',ck:['Record date, contractor, and scope','Document findings or deficiencies','Assign follow-up items with deadlines','File in building maintenance records']},
          {s:'Address all deficiencies and deferred maintenance items within required timelines',t:'Per maintenance plan or inspector directive',d:'DC enforcement code',
           desc:'Prioritize and address all deficiencies identified during inspections and maintenance activities. Critical safety items first, then items that prevent further deterioration, then cosmetic items.',
           detail:'Priority framework: (1) CRITICAL — immediate safety hazard, life safety system failure, active water intrusion, structural concern. Address within 24-48 hours. (2) URGENT — system degradation that will worsen without attention (roof leak not yet causing interior damage, failing caulk, HVAC inefficiency). Address within 30 days. (3) ROUTINE — items that should be corrected but pose no immediate risk (cosmetic damage, minor landscaping, non-critical lighting). Address within 90 days or next budget cycle. (4) DEFERRED — items intentionally postponed to a future budget cycle or reserve-funded project. Document the decision to defer with rationale.',
           ph:'execute',ck:['Categorize by priority (critical, urgent, routine, deferred)','Address critical items within 24-48 hours','Address urgent items within 30 days','Schedule routine items within 90 days','Document deferred items with rationale']},
          {s:'Maintain comprehensive records of all maintenance contracts, inspections, and contractor certifications',t:'Ongoing',d:'DC Code § 42-1904.04(a) & Document retention policy',
           desc:'Maintain organized, accessible records of all maintenance contracts, inspection reports, certificates, warranties, and contractor credentials. These are required for resale certificates and demonstrate board diligence.',
           detail:'Maintain files for: (1) All current maintenance contracts with renewal dates. (2) Historical and current inspection reports and certificates. (3) Operating permits (elevator, boiler). (4) Contractor insurance certificates and license verifications. (5) Warranty documentation for all major systems. (6) Maintenance activity logs. Include a summary in the annual report to owners per DC Code § 29-1135.05 and in resale certificates per § 42-1904.04(a).',
           ph:'close',ck:['File current maintenance contracts','File inspection reports and certificates','File operating permits','File contractor insurance certificates','File warranty documentation','Update maintenance logs']}
        ],
        self:[
          {s:'Respond in writing to DC agency citations with documented remediation plan and timeline',t:'Within response period per citation',d:'DC enforcement code & DLCP',
           desc:'When DC Fire and EMS (FEMS), DLCP, or another agency issues a citation for a maintenance deficiency, respond in writing with a detailed remediation plan, contractor engagement, and completion timeline.',
           detail:'Your response should include: (1) Acknowledgment of the citation. (2) Description of the corrective action being taken. (3) Name of the licensed contractor engaged. (4) Timeline for completion. (5) Request for reinspection after correction. (6) Pay any required fines promptly to avoid escalation. Failure to respond can result in escalating fines, equipment shutdown orders, or referral to the DC Office of the Attorney General.',
           w:'Required when DC fire/building department issues a citation',ph:'execute',
           ck:['Acknowledge citation in writing','Describe corrective action','Identify licensed contractor','Set completion timeline','Request reinspection','Pay required fines']},
          {s:'Present annual maintenance report to board and owners showing completed work, upcoming needs, and deferred items',t:'Annually at annual meeting',d:'DC Code § 29-1135.05',
           desc:'Prepare an annual maintenance summary for the board and owners showing all maintenance completed during the year, upcoming needs, deferred maintenance items, and cost trends.',
           detail:'The report should cover: (1) Summary of all maintenance completed during the year by system. (2) Inspection results and remediation status. (3) Deferred maintenance items with rationale and planned resolution. (4) Cost comparison year-over-year. (5) Upcoming maintenance needs for the next 12 months. (6) Recommendations for improvements or contract changes. This demonstrates proactive management and supports budget planning.',
           ph:'close'},
          {s:'Develop deferred maintenance catch-up plan when items are postponed across multiple budget cycles',t:'When deferred items accumulate',d:'Reserve study & Fiduciary duty',
           desc:'When maintenance items are repeatedly deferred due to budget constraints, develop a written catch-up plan to address the backlog before it becomes an emergency or causes secondary damage.',
           detail:'Steps: (1) List all deferred items with the year originally identified. (2) Prioritize by risk — what gets worse fastest? (3) Estimate costs. (4) Identify funding source (operating budget, reserves, or one-time assessment). (5) Present to the board with a recommended timeline. Chronically deferred maintenance accelerates deterioration, increases repair costs, and is a fiduciary risk under DC Code § 29-1108.01.',
           w:'Required when deferred maintenance items span multiple budget cycles — deterioration accelerates',ph:'close',
           ck:['List all deferred items with year identified','Prioritize by risk','Estimate costs','Identify funding source','Present catch-up plan to board']}
        ],
        legal:[
          {s:'Attorney responds to formal citations, fines, or enforcement actions from DC agencies for maintenance deficiencies',t:'Within response period per citation',d:'DC enforcement code & DLCP',
           desc:'When a DC agency issues formal citations, fines, or enforcement actions for maintenance deficiencies (expired permits, fire code violations, building code violations), engage an attorney to respond, negotiate, and represent the association.',
           detail:'The attorney will: (1) Review the citation for accuracy and jurisdiction. (2) Determine whether an appeal or hearing is available. (3) Negotiate reduced fines if the association demonstrates prompt remediation. (4) If a stop-use order is issued (e.g., elevator shutdown), advise on emergency remediation. (5) Represent the association at administrative hearings. (6) Assess whether the management company or maintenance contractor failed in their contractual duties — potential cross-claims.',
           w:'Required when formal citation or enforcement action is issued by a DC agency',ph:'close'},
          {s:'Attorney advises on liability for deferred maintenance that results in injury or property damage',t:'After incident',d:'DC Code § 29-1108.01 & Insurance policy',
           desc:'When deferred maintenance results in a resident injury or property damage (e.g., trip hazard on neglected sidewalk, failure of unmaintained system), the attorney assesses the board\'s liability and coordinates the insurance response.',
           detail:'The attorney will: (1) Assess whether the deferred maintenance constitutes negligence or breach of fiduciary duty. (2) Notify D&O and general liability insurance carriers. (3) Determine if the management company shares liability under the management agreement. (4) Advise on immediate corrective action to prevent further incidents. (5) If a lawsuit is filed, coordinate the defense with insurance defense counsel.',
           w:'Required when deferred maintenance leads to injury or damage claim',ph:'close'}
        ],
        notes:{
          'DC':'DC requires annual inspections for fire systems (12-A DCMR via FEMS), elevators (DLCP per 12-H DCMR), boilers (DLCP per 12-K DCMR), and backflow preventers (DC Water per 21 DCMR § 5401). Expired operating permits can result in equipment shutdown and fines. The board has a fiduciary duty under DC Code § 29-1108.01 to maintain common elements. Include maintenance history in resale certificates per § 42-1904.04(a).',
          '_':'PREVENTATIVE MAINTENANCE SAVES MONEY: Every $1 spent on preventative maintenance prevents $5-$10 in emergency repairs. Key principles: (1) Create a comprehensive calendar covering every building system. (2) Never skip or defer safety inspections. (3) Budget adequately for maintenance — it\'s not optional. (4) Document everything — records support insurance claims, warranty claims, and fiduciary defense. (5) Address deficiencies promptly — deferred maintenance compounds.'
        }
      }
    ]
  },
  { id:'enforcement', num:'3', icon:'⚖️', label:'Rule Enforcement', color:'amber',
    sits: [
      { id:'covenant-violations', title:'Covenant Violations', desc:'Unauthorized construction, short-term rentals, noise, parking under DC condo law',
        tags:['Unauthorized construction','Short-term rentals','Architectural','Parking','Noise'],
        pre:[
          {s:'Document violation with photos, dates, witnesses, and specific impact on other owners',t:'Immediately upon discovery or complaint',d:'CC&Rs/Rules & DC Code § 42-1903.08',
           desc:'Thoroughly document the violation with dated photos, witness statements, and a description of how it impacts other owners or the association. DC Code § 42-1903.08 requires that restrictions in the Declaration are enforceable.',
           detail:'Documentation should include: (1) Dated photos or video of the violation. (2) Written description of what rule is being violated. (3) Witness statements if applicable (noise, behavior). (4) Impact on other owners or common elements. (5) How the violation was discovered (complaint, inspection, observation). (6) Prior instances if this is a recurring issue. This documentation is critical if the matter escalates to court — DC courts require the association to show consistent enforcement and adequate documentation.',
           ph:'evidence',ck:['Take dated photos or video','Write description of violation','Collect witness statements','Document impact on other owners','Note how violation was discovered','Check for prior instances']},
          {s:'Identify specific CC&R, Declaration, or rule section violated and confirm it is enforceable',t:'1-3 days',d:'CC&Rs/Rules & DC Code § 42-1903.08',
           desc:'Identify the exact provision being violated and confirm it is enforceable under DC law. DC Code § 42-1903.08 provides that restrictions in the Declaration are enforceable as equitable servitudes.',
           detail:'Steps: (1) Locate the specific CC&R, Declaration, or board-adopted rule section. (2) Confirm the restriction was properly adopted — Declaration restrictions are enforceable per DC Code § 42-1903.08; board rules must be adopted per the authority granted in the bylaws. (3) Check for any exemptions or grandfather clauses. (4) For short-term rental restrictions: DC\'s short-term rental law (DC Code § 30-201 et seq.) allows limited short-term rentals in an owner\'s primary residence — CC&R restrictions may be limited by this law. (5) For pet restrictions: Fair Housing Act may override breed or weight restrictions for ESAs/service animals.',
           ph:'evidence'},
          {s:'Send first courtesy notice citing specific rule, describing the violation, and providing a 14-day cure period',t:'Within 1 week of documenting violation',d:'Bylaws: Enforcement section',
           desc:'Send a courteous first notice informing the owner of the specific rule violation, providing a reasonable cure period (typically 14 days), and explaining the consequences if not cured.',
           detail:'The notice should include: (1) Specific CC&R or rule section cited. (2) Description of the violation. (3) What the owner needs to do to cure. (4) Cure period (14 days is typical for non-emergency violations). (5) Statement that failure to cure will result in a formal violation notice and potential fines per the enforcement policy. (6) Contact information for questions. Tone should be informative, not adversarial — many violations are unintentional.',
           ph:'notice',ck:['Cite specific CC&R or rule section','Describe the violation clearly','State what owner must do to cure','Set 14-day cure period','Explain consequences of non-compliance']},
          {s:'Send formal violation notice via certified mail citing bylaws enforcement provisions and fine schedule',t:'After cure period expires without cure',d:'CC&Rs: Enforcement & Bylaws: Fine schedule',
           desc:'If the owner does not cure within the courtesy notice period, send a formal violation notice via certified mail citing the bylaws enforcement provisions, the applicable fine schedule, and the owner\'s right to a hearing before fines are imposed.',
           detail:'The formal notice must include: (1) Reference to the courtesy notice and expiration of cure period. (2) The specific violation with updated documentation. (3) The applicable fine amount per the board-adopted fine schedule. (4) The owner\'s right to a hearing before fines are imposed (required for due process under DC condo law). (5) How to request a hearing and the timeline. (6) Statement that continued violation will result in escalating fines and potential legal action. Send certified mail with return receipt.',
           w:'Required when owner does not cure violation within the courtesy notice period',ph:'notice',
           ck:['Reference courtesy notice and cure period expiration','Cite applicable fine amount','State owner\'s right to a hearing','Explain how to request a hearing','Send certified mail with return receipt']},
          {s:'Schedule and conduct hearing per governing docs — provide owner opportunity to be heard before imposing fines',t:'10-30 days notice per bylaws',d:'Bylaws: Hearing procedures & DC Code § 42-1903.08',
           desc:'Before imposing fines, the board must provide the owner with notice and an opportunity to be heard at a hearing. This is a due process requirement under both the bylaws and DC condo law.',
           detail:'Hearing procedures: (1) Send hearing notice at least 10-30 days in advance (per bylaws). (2) Notice must include: date, time, location, specific violation cited, potential penalties, and owner\'s right to present evidence and witnesses. (3) At the hearing: present the evidence, allow the owner to respond, and board deliberates. (4) Board members with a personal interest must recuse. (5) Document the hearing proceedings in minutes. (6) Issue a written decision within 5-10 days. DC courts will scrutinize whether the hearing was fair — err on the side of more process, not less.',
           w:'Due process requires notice and hearing before fines — courts will invalidate fines imposed without hearing',ph:'hearing',
           ck:['Send hearing notice 10-30 days in advance','Include violation details and potential penalties','Allow owner to present evidence','Document hearing in minutes','Issue written decision within 5-10 days']},
          {s:'Impose fine per board-adopted fine schedule; issue written decision with appeal rights',t:'After hearing',d:'Fine schedule & Bylaws',
           desc:'After the hearing, if the board determines the violation occurred and was not cured, impose the fine per the board-adopted fine schedule and issue a written decision explaining the finding, the fine amount, and any appeal rights.',
           detail:'The written decision should include: (1) Summary of the evidence presented. (2) Finding that the violation occurred. (3) Fine amount per the adopted schedule. (4) Payment deadline (typically 30 days). (5) Whether the fine is recurring (daily or weekly for ongoing violations). (6) Appeal rights per bylaws. (7) Statement that unpaid fines will be added to the owner\'s assessment ledger and are subject to collection per DC Code § 42-1903.12. (8) Requirement that the violation be cured immediately.',
           ph:'enforce',ck:['Document finding that violation occurred','State fine amount per schedule','Set payment deadline','Note appeal rights','State that unpaid fines become assessment delinquency']}
        ],
        self:[
          {s:'Escalate fines per schedule when owner refuses to cure — impose daily or weekly recurring fines',t:'Per fine schedule escalation timeline',d:'Fine schedule & Bylaws',
           desc:'When the owner does not cure the violation after the hearing and fine, escalate fines per the board-adopted fine schedule. Many schedules provide for daily or weekly recurring fines for ongoing violations.',
           detail:'Escalation process: (1) Document the ongoing violation with updated photos and dates. (2) Apply escalating fines per the adopted schedule (e.g., $25/day for ongoing noise, $100/week for unauthorized construction). (3) Send written notice of each fine increment. (4) Add unpaid fines to the owner\'s assessment ledger per DC Code § 42-1903.12. (5) Once accumulated fines reach a significant amount, the delinquent balance can be pursued through the standard collection process including lien under DC Code § 42-1903.13.',
           w:'Required when owner does not cure after formal violation notice and hearing',ph:'enforce',
           ck:['Document ongoing violation with updated photos','Apply escalating fines per schedule','Send written notice of each fine','Add unpaid fines to assessment ledger']},
          {s:'Provide detailed written explanation citing CC&R provisions and DC Code § 42-1903.08 when owner disputes violation',t:'Within 14 days of dispute',d:'CC&Rs & DC Code § 42-1903.08',
           desc:'When an owner formally disputes a cited violation, provide a detailed written response explaining the specific CC&R provision, the factual basis for the finding, and the legal enforceability under DC Code § 42-1903.08.',
           detail:'Your response should: (1) Quote the exact CC&R or rule provision violated. (2) Cite DC Code § 42-1903.08 — restrictions in the Declaration are enforceable as equitable servitudes. (3) Address each of the owner\'s specific objections. (4) Provide the documentation (photos, witness statements, inspection notes). (5) Offer a path to resolution — what does the owner need to do to cure? (6) If the owner claims selective enforcement, document that the rule has been consistently applied to all owners.',
           w:'Required when owner formally disputes the cited violation',ph:'enforce',
           ck:['Quote exact CC&R provision','Cite DC Code § 42-1903.08','Address each owner objection','Provide supporting documentation','Offer cure path']},
          {s:'File for injunctive relief in DC Superior Court for ongoing violations causing damage or safety concerns',t:'When fines and demands fail to produce compliance',d:'DC Code § 42-1903.08 & DC Superior Court',
           desc:'For ongoing violations that cause damage to common elements, diminish property values, or create safety concerns, file for injunctive relief in DC Superior Court to compel compliance.',
           detail:'File in DC Superior Court (510 4th St NW). The complaint should seek: (1) Temporary restraining order (TRO) if the violation poses immediate harm. (2) Preliminary and permanent injunction ordering the owner to cure. (3) Recovery of fines, attorney fees, and costs per DC Code § 42-1903.12 if governing documents provide for fee-shifting. (4) Damages for any harm to common elements. Prepare: a detailed history of all notices, hearings, and fines; documentation of the violation; evidence of impact on other owners. DC courts generally enforce CC&R restrictions under § 42-1903.08 when the association follows proper procedures.',
           w:'Exhaust internal remedies (notice, hearing, fines) before filing — courts require it',ph:'enforce',
           ck:['Document complete enforcement history','Prepare complaint for injunctive relief','File in DC Superior Court','Seek TRO if immediate harm','Include fee-shifting request per governing docs']},
          {s:'Add unpaid fines to owner assessment ledger and pursue collection per delinquent-accounts workflow',t:'After 30-day payment deadline expires',d:'DC Code § 42-1903.12 & § 42-1903.13',
           desc:'Under DC Code § 42-1903.12, fines authorized by the Declaration or bylaws may be added to the owner\'s assessment ledger. Once on the ledger, the unpaid amount is subject to the same lien and collection rights as unpaid assessments under § 42-1903.13.',
           detail:'Steps: (1) Add unpaid fines to the owner\'s assessment ledger with a clear description. (2) Send a statement of account showing the fine balance. (3) Follow the standard delinquent-accounts collection workflow — late notice, formal demand, payment plan offer, lien recording. (4) The lien for fines has the same super-priority as assessment liens under § 42-1903.13(a)(2) for amounts within the 6-month lookback period.',
           ph:'enforce'}
        ],
        legal:[
          {s:'Attorney sends cease-and-desist letter on firm letterhead citing CC&Rs and DC Code § 42-1903.08',t:'After owner ignores multiple notices',d:'CC&Rs & DC Code § 42-1903.08',
           desc:'When an owner ignores courtesy and formal notices, an attorney\'s cease-and-desist letter carries significantly more weight and demonstrates the board\'s willingness to pursue legal remedies.',
           detail:'The attorney\'s letter will: (1) Cite the specific CC&R provision and DC Code § 42-1903.08 (equitable servitude enforceability). (2) Summarize the enforcement history (notices sent, hearing held, fines imposed). (3) Demand immediate cure within a specific timeframe (typically 10-14 days). (4) State that failure to cure will result in legal action seeking injunctive relief, damages, and attorney fees. (5) Attorney fees in enforcement actions are often recoverable under the CC&Rs or bylaws.',
           w:'Required when owner ignores multiple notices — attorney letter is the last step before litigation',ph:'enforce'},
          {s:'Attorney files for injunctive relief in DC Superior Court to compel compliance',t:'When cease-and-desist does not produce compliance',d:'DC Code § 42-1903.08 & DC Superior Court',
           desc:'The attorney files suit in DC Superior Court seeking injunctive relief to compel the owner to cure the violation, plus recovery of fines, damages, and attorney fees.',
           detail:'The attorney will: (1) File complaint in DC Superior Court (510 4th St NW). (2) Seek preliminary injunction and permanent injunction. (3) Request TRO if the violation poses immediate harm (e.g., unauthorized construction, safety hazard). (4) Pursue recovery of: accumulated fines, repair costs for any damage to common elements, and attorney fees per the governing documents. (5) DC courts generally enforce Declaration restrictions under § 42-1903.08 when proper procedures were followed. (6) The association must show it exhausted internal remedies (notice, hearing, fines) before seeking court intervention.',
           w:'Required when ongoing violation causes damage and internal remedies are exhausted',ph:'enforce'},
          {s:'Attorney pursues damages and compliance for serious structural or safety violations',t:'Immediately for safety violations',d:'DC Code § 42-1903.08 & DC building code',
           desc:'For violations involving structural modifications, safety hazards, or unauthorized construction that affects common elements, the attorney pursues immediate injunctive relief and damages.',
           detail:'The attorney will: (1) Seek emergency TRO if the violation creates an immediate safety hazard. (2) Notify DC DLCP building inspection division if unauthorized construction violates building codes. (3) Pursue full restoration of common elements to their original condition at the owner\'s expense. (4) Seek damages for any diminution in property values. (5) If the violation involves unauthorized structural changes, engage a structural engineer to assess impact. (6) Consider criminal referral if the unauthorized construction violates DC building codes.',
           w:'Required for serious structural or safety violations — immediate action needed',ph:'enforce'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.08: Restrictions in the Declaration are enforceable as equitable servitudes. § 42-1903.12: Fines authorized by the Declaration or bylaws may be collected in the same manner as assessments. § 42-1903.13: Lien rights apply to fines added to the assessment ledger. SHORT-TERM RENTALS: DC Code § 30-201 et seq. allows limited short-term rentals in primary residences — CC&R restrictions may be partially preempted. ENFORCEMENT PROCESS: courtesy notice → formal notice → hearing → fine → escalation → legal action. Document every step — DC courts require exhaustion of internal remedies and consistent enforcement.',
          '_':'ENFORCEMENT BEST PRACTICES: (1) Follow the bylaw enforcement procedure exactly — courts scrutinize process. (2) Document everything with dated photos and certified mail. (3) Apply rules consistently to all owners — selective enforcement is the #1 defense in violation cases. (4) Always provide a hearing before fines. (5) Offer a cure path — the goal is compliance, not punishment. (6) Escalate to legal action only after exhausting internal remedies.'
        }
      },
      { id:'fine-hearings', title:'Fine Hearings', desc:'Due process hearings, fine imposition, appeals under DC condo law',
        tags:['Conducting hearings','Imposing fines','Due process','Appeals'],
        pre:[
          {s:'Review governing docs for hearing requirements, notice periods, and due process standards',t:'Before scheduling any hearing',d:'Bylaws: Hearing section & DC Code § 42-1903.08',
           desc:'Before scheduling a hearing, review the bylaws for specific procedural requirements — notice period, hearing format, quorum, voting, and appeal rights. DC courts will invalidate fines imposed without proper due process.',
           detail:'Key requirements to verify: (1) Notice period — typically 10-30 days per bylaws. (2) Notice content — must include specific violation cited, date/time of hearing, owner\'s right to attend, present evidence, and bring witnesses. (3) Who presides — typically the board, but members with personal interest must recuse. (4) Quorum requirements for the hearing. (5) Appeal rights — does the owner have a right to appeal the decision? (6) Fine schedule — fines must be per a board-adopted schedule, not arbitrary amounts. If your bylaws are silent on hearing procedures, adopt procedures by board resolution before the first hearing.',
           ph:'evidence',ck:['Verify notice period requirement','Verify notice content requirements','Check recusal requirements','Confirm quorum requirements','Check appeal rights','Confirm fine schedule exists']},
          {s:'Send hearing notice via certified mail with specific violation, date/time, hearing rights, and potential penalties',t:'Per bylaws (typically 10-30 days before hearing)',d:'Bylaws: Hearing section',
           desc:'Send a formal hearing notice that clearly states the violation, the hearing date and time, the owner\'s rights at the hearing, and the range of potential penalties.',
           detail:'The notice must include: (1) Specific CC&R or rule section cited. (2) Description of the violation with dates. (3) Hearing date, time, and location (or virtual access). (4) Owner\'s rights: attend in person, present evidence, bring witnesses, submit written statement if unable to attend. (5) Range of potential penalties per the fine schedule. (6) Statement that failure to attend does not prevent the board from proceeding. Send certified mail with return receipt — this creates a documented record that notice was provided.',
           ph:'notice',ck:['Cite specific violation','State hearing date, time, location','List owner rights at hearing','State potential penalty range','Note that board may proceed in absence','Send certified mail with return receipt']},
          {s:'Prepare hearing packet with complete violation documentation, photos, prior notices, and fine schedule',t:'5-7 days before hearing',d:'Bylaws: Enforcement section',
           desc:'Compile a complete hearing packet for the board containing all documentation supporting the violation charge — this is the association\'s evidence presentation.',
           detail:'Packet should include: (1) Original complaint or report. (2) All dated photos and documentation. (3) Copies of all prior notices sent (courtesy, formal) with certified mail receipts. (4) Witness statements if applicable. (5) The specific CC&R or rule provision violated. (6) The applicable fine schedule. (7) Any prior violation history for this owner. (8) The hearing notice sent to the owner with proof of delivery. Provide copies to all board members before the hearing so they can review.',
           ph:'notice',ck:['Compile original complaint','Gather all dated photos','Collect copies of prior notices','Include certified mail receipts','Include applicable fine schedule','Distribute packet to board members']},
          {s:'Conduct hearing: present evidence, allow owner to respond, board deliberates in executive session',t:'Scheduled hearing date',d:'Bylaws: Hearing procedures',
           desc:'Conduct the hearing with proper procedures: present the association\'s evidence, give the owner a full opportunity to respond, and have the board deliberate and vote.',
           detail:'Hearing format: (1) Call to order and verify quorum. (2) Read the violation charge. (3) Present the association\'s evidence (photos, documents, witness testimony). (4) Owner responds — allow the owner to present their case, evidence, and witnesses without interruption. (5) Board members may ask questions of both sides. (6) Owner and any non-board attendees leave. (7) Board deliberates in executive session. (8) Board votes on: whether violation occurred, and if so, the penalty. (9) Record the proceedings in minutes. IMPORTANT: board members with a personal interest (e.g., neighbor dispute with the owner) must recuse from the hearing and vote.',
           ph:'hearing',ck:['Verify quorum','Read violation charge','Present association evidence','Allow owner full response','Board deliberates in executive session','Record vote in minutes','Confirm no conflicts of interest']},
          {s:'Issue written decision within 5-10 days with findings, penalty, cure requirement, and appeal rights',t:'Within 5-10 business days of hearing',d:'Bylaws: Enforcement section',
           desc:'After the hearing, issue a formal written decision to the owner explaining the board\'s findings, any fine or penalty imposed, what the owner must do to cure, and any appeal rights.',
           detail:'The decision letter should include: (1) Date of hearing and attendees. (2) Summary of evidence presented by both sides. (3) Board\'s finding: violation occurred / did not occur. (4) If violation found: fine amount per the adopted schedule, payment deadline (typically 30 days), requirement to cure the violation, and timeline. (5) Whether the fine is recurring for ongoing violations. (6) Appeal rights per bylaws. (7) Statement that unpaid fines will be added to the assessment ledger per DC Code § 42-1903.12. Send certified mail.',
           ph:'hearing',ck:['Summarize evidence from both sides','State finding (violation or no violation)','State fine amount per schedule','Set payment deadline','Require cure with timeline','Note appeal rights','Send certified mail']},
          {s:'Add fine to assessment ledger when payment deadline passes; pursue collection per delinquent-accounts workflow',t:'After payment deadline expires',d:'DC Code § 42-1903.12 & § 42-1903.13',
           desc:'Under DC Code § 42-1903.12, fines authorized by the Declaration or bylaws are collectible as assessments. Add unpaid fines to the owner\'s assessment ledger and pursue through the standard collection process.',
           detail:'Once on the assessment ledger: (1) The unpaid fine is treated like an unpaid assessment. (2) It accrues late fees and interest per the collection policy. (3) It is subject to lien under DC Code § 42-1903.13. (4) Follow the standard collection workflow: late notice, formal demand, payment plan offer, lien recording. (5) The lien for fines has the same super-priority as assessment liens under § 42-1903.13(a)(2).',
           w:'Required when fine remains unpaid past the deadline — fines are collectible as assessments per DC Code',ph:'enforce'}
        ],
        self:[
          {s:'Process owner appeal per bylaws — review procedures, schedule appeal hearing, and issue final decision',t:'Per bylaws appeal timeline',d:'Bylaws: Appeal section',
           desc:'When an owner files a formal appeal of a fine, review the bylaws appeal procedures, schedule an appeal hearing if required, and issue a final written decision.',
           detail:'Appeal process: (1) Verify the appeal was filed within the bylaws timeframe (typically 10-30 days). (2) Review whether the appeal is heard by the same board or a different body (some bylaws require an appeal committee). (3) If a new hearing is required, follow the same notice and hearing procedures. (4) The appeal should review whether: proper procedures were followed, the evidence supports the finding, and the penalty is proportionate. (5) Issue a final written decision. (6) Document everything — if the owner sues, the court will review the entire record.',
           w:'Required when owner files a formal appeal of the fine',ph:'enforce',
           ck:['Verify appeal was filed within deadline','Determine appeal body per bylaws','Schedule appeal hearing if required','Review procedural compliance and evidence','Issue final written decision']},
          {s:'Document consistent enforcement across all owners to defeat selective enforcement claims',t:'Ongoing',d:'CC&Rs & DC Code § 42-1903.08',
           desc:'Maintain records showing the same violation has been enforced consistently against all owners. Selective enforcement is the most common defense owners raise in violation cases.',
           detail:'Steps: (1) Maintain a violation log showing all violations cited, by unit, with dates and outcomes. (2) When citing a violation, check whether the same violation exists at other units and cite those as well. (3) If an owner claims selective enforcement, provide the log showing consistent treatment. (4) If the board discovers it has been inconsistently enforcing a rule, consider: sending a community-wide notice re-establishing the rule before citing any individual owner. (5) Document the board\'s enforcement decisions in minutes.',
           ph:'enforce',ck:['Maintain violation log by unit','Check for same violation at other units','Document enforcement decisions in minutes']},
          {s:'Suspend amenity access per governing docs for unpaid fines (if authorized by bylaws)',t:'Per bylaws suspension provisions',d:'Bylaws: Suspension of rights',
           desc:'If the bylaws authorize suspension of amenity access for unpaid fines, send written notice to the owner citing the provision and effective date. Only suspend if expressly authorized.',
           detail:'(1) Confirm bylaws authorize suspension for unpaid fines — not all do. (2) Send written notice citing the specific provision and effective date. (3) Do not suspend access to the unit itself, mailbox, or essential services. (4) Restore access promptly when the fine is paid. (5) Apply uniformly — suspend for all owners with unpaid fines above the threshold, not selectively.',
           w:'Only permitted when expressly authorized by bylaws — board cannot create this remedy unilaterally',ph:'enforce'}
        ],
        legal:[
          {s:'Attorney reviews hearing procedures for due process compliance before first hearing or when challenged',t:'Before first hearing or upon challenge',d:'Bylaws & DC Code § 42-1903.08',
           desc:'Have an attorney review the association\'s hearing procedures to ensure they meet due process requirements under DC condo law. Courts will invalidate fines imposed without proper process.',
           detail:'The attorney will: (1) Review the bylaws hearing provisions for adequacy. (2) If bylaws are silent, draft hearing procedures by board resolution. (3) Review the fine schedule for reasonableness and proper adoption. (4) Ensure notice requirements meet minimum due process standards: specific charges, adequate time to prepare, right to be heard, right to present evidence, impartial decision-maker. (5) Review the decision letter template for completeness. (6) Advise on appeal procedures. (7) If an owner has challenged a specific hearing, review the record for procedural defects.',
           w:'Required before the first hearing or whenever hearing procedures are challenged',ph:'enforce'},
          {s:'Attorney defends against lawsuit challenging fine imposition or hearing procedure',t:'Upon receipt of lawsuit',d:'DC Code § 42-1903.08 & DC Superior Court',
           desc:'When an owner files suit challenging a fine — alleging procedural defects, selective enforcement, or unreasonable penalties — the attorney defends the board\'s actions in DC Superior Court.',
           detail:'The attorney will: (1) Review the complete enforcement record — all notices, hearing minutes, decision letter, and appeal. (2) Assess whether any procedural defects exist that should be cured rather than litigated. (3) Defend the fine based on DC Code § 42-1903.08 (Declaration restrictions enforceable as equitable servitudes) and the bylaws enforcement provisions. (4) If selective enforcement is alleged, present the violation log showing consistent treatment. (5) Seek recovery of attorney fees per the governing documents. (6) If the case has merit, advise on settlement to avoid setting adverse precedent.',
           w:'Required when owner files suit challenging fine — maintain complete enforcement record',ph:'enforce'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.08: Declaration restrictions enforceable as equitable servitudes. § 42-1903.12: Fines authorized by Declaration or bylaws are collectible as assessments — includes late fees and lien rights. DUE PROCESS: DC courts require adequate notice, specific charges, opportunity to be heard, and impartial decision-makers. The most common reason fines are overturned: inadequate hearing procedures. Adopt a written fine schedule by board resolution. Maintain consistent enforcement across all owners.',
          '_':'DUE PROCESS CHECKLIST: (1) Written notice 10-30 days before hearing. (2) Notice states specific violation, date/time, and owner rights. (3) Owner may attend, present evidence, bring witnesses. (4) Conflicted board members recuse. (5) Board deliberates in executive session. (6) Written decision within 5-10 days. (7) Fine per adopted schedule (not arbitrary). (8) Appeal rights noted. Cutting corners on process is the fastest way to lose in court.'
        }
      },
      { id:'architectural-review', title:'Architectural Review', desc:'Renovation requests, exterior mods, solar panels, windows under DC condo law',
        tags:['Renovation requests','Exterior modifications','Solar panels','Windows','Unit alterations'],
        pre:[
          {s:'Receive written application with detailed plans, specifications, contractor info, and insurance',t:'Upon submission',d:'Architectural guidelines & CC&Rs',
           desc:'Require a complete written application including architectural drawings or plans, material specifications, contractor information (license and insurance), estimated timeline, and the owner\'s acknowledgment of the review process.',
           detail:'The application should include: (1) Completed architectural review form. (2) Detailed plans or drawings showing the proposed modification. (3) Material specifications and samples if applicable (exterior paint colors, flooring, window type). (4) Contractor name, DC license number, and insurance certificate. (5) Estimated start and completion dates. (6) Owner\'s acknowledgment of the review timeline and conditions process. (7) If the modification affects common elements (e.g., exterior walls, windows, plumbing risers), note this for special review.',
           ph:'evidence',ck:['Receive completed application form','Collect plans or drawings','Obtain material specifications','Verify contractor DC license','Collect contractor insurance certificate','Confirm estimated timeline']},
          {s:'Review application against architectural guidelines, CC&Rs, and DC building code requirements',t:'1-2 weeks',d:'Architectural guidelines & DC Code § 42-1903.08',
           desc:'Review the proposed modification against the association\'s architectural guidelines, CC&R restrictions, and DC building code requirements. Determine if the modification requires a DC building permit.',
           detail:'Review checklist: (1) Does the modification comply with the architectural guidelines (materials, colors, style)? (2) Does it affect common elements? Under DC Code § 42-1903.04, modifications to common elements require board approval and may require owner vote. (3) Does it require a DC building permit? Most interior renovations involving structural, electrical, plumbing, or HVAC work require a permit from DLCP. (4) Does it affect the building envelope (windows, doors, exterior walls)? (5) Will it produce noise, dust, or disruption to other units? (6) Is it consistent with how similar requests have been decided in the past? Consistency is critical for enforceability.',
           ph:'evidence',ck:['Check compliance with architectural guidelines','Determine if common elements are affected','Check if DC building permit is required','Review impact on building envelope','Assess disruption to other units','Check consistency with prior decisions']},
          {s:'Inspect unit/area to verify scope, feasibility, and impact on common elements and adjacent units',t:'Within 2 weeks of application',d:'CC&Rs: Common element provisions',
           desc:'Conduct an on-site inspection to verify the proposed scope, confirm feasibility, and assess potential impact on common elements, structural integrity, and adjacent units.',
           detail:'The inspection should assess: (1) Whether the proposed work area matches the plans. (2) Potential impact on common elements (plumbing risers, electrical risers, structural walls, fire-rated assemblies). (3) Impact on adjacent units (noise, vibration, potential damage). (4) Access requirements for contractors (elevator use, loading dock, working hours). (5) If structural modifications are proposed, require a letter from a DC-licensed professional engineer (PE) confirming the modification is safe.',
           w:'Recommended when modification involves structural or common elements',ph:'notice'},
          {s:'Committee or board votes on application; document rationale for approval, conditions, or denial',t:'Next meeting or within 30 days of complete application',d:'Bylaws: Committee authority',
           desc:'The architectural committee (if one exists per bylaws) or the full board reviews the application and votes to approve, approve with conditions, or deny. Document the rationale in writing.',
           detail:'Decision options: (1) APPROVE — work may proceed per submitted plans. (2) APPROVE WITH CONDITIONS — specify conditions (materials, colors, working hours, contractor insurance requirements, completion deadline, restoration bond). (3) DENY — must cite specific architectural guideline or CC&R provision. (4) REQUEST MORE INFORMATION — specify what is needed. Important: apply standards consistently — approving similar modifications for one owner but denying for another creates selective enforcement liability. Document the rationale regardless of the decision.',
           ph:'hearing',ck:['Review complete application','Discuss committee/board findings','Vote on application','Document rationale in minutes','Apply standards consistently']},
          {s:'Issue written decision to owner with any conditions, required permits, and working hour restrictions',t:'Within 5 business days of decision',d:'Bylaws & Architectural guidelines',
           desc:'Send the owner a formal written decision specifying approval conditions, required DC building permits, working hour restrictions, insurance requirements, and completion deadline.',
           detail:'The approval letter should include: (1) Scope approved (reference the submitted plans). (2) Conditions: materials, colors, contractor requirements. (3) Requirement to obtain DC building permit from DLCP if applicable. (4) Working hours (typically 8am-5pm weekdays in DC condos). (5) Elevator reservation and loading dock procedures. (6) Requirement to maintain contractor insurance naming HOA as additional insured. (7) Completion deadline. (8) Restoration bond if the work affects common elements (typically 100-150% of estimated cost). (9) Statement that work must comply with approved plans — any changes require a new application.',
           ph:'hearing',ck:['Specify approved scope','List all conditions','Require DC building permit if applicable','Set working hours','Require contractor insurance','Set completion deadline']},
          {s:'Monitor construction for compliance with approved plans; issue stop-work notice for deviations',t:'During construction',d:'Architectural guidelines & CC&Rs',
           desc:'Periodically inspect the work to confirm it complies with the approved plans and conditions. If deviations are discovered, issue an immediate stop-work notice.',
           detail:'Monitoring steps: (1) Conduct periodic inspections (at minimum: before start, mid-project, and at completion). (2) Compare work to approved plans. (3) If deviations are found, issue a written stop-work notice requiring the owner to submit a modification to the original application before continuing. (4) At completion: conduct a final inspection. (5) If work affects common elements, have a licensed professional verify completion. (6) Release any restoration bond after final inspection. (7) Require the owner to provide a copy of the DC certificate of occupancy or final inspection approval if a building permit was required.',
           ph:'enforce',ck:['Conduct pre-start inspection','Conduct mid-project inspection','Conduct final inspection','Compare work to approved plans','Release restoration bond after final inspection']}
        ],
        self:[
          {s:'Issue immediate stop-work notice to owner who proceeds without approval or deviates from approved plans',t:'Immediately upon discovery',d:'CC&Rs & DC Code § 42-1903.08',
           desc:'When an owner begins construction without architectural approval or deviates from approved plans, issue an immediate written stop-work notice requiring all work to cease until proper approval is obtained.',
           detail:'The stop-work notice should: (1) State that work must cease immediately. (2) Cite the CC&R or rule provision requiring architectural approval. (3) Specify what is unauthorized (work without application, or deviation from approved plans). (4) Require the owner to submit an application (or amendment) before work may resume. (5) State that continued unauthorized work will result in fines per the enforcement policy and potential legal action. (6) If the unauthorized work violates DC building codes (no permit), report to DLCP building inspection. Send certified mail and deliver a copy to the unit.',
           w:'Required when owner begins work without approval or deviates from approved plans',ph:'enforce',
           ck:['Issue written stop-work notice','Cite CC&R provision','Require application or amendment','Warn of fines and legal action','Report to DLCP if building code violation']},
          {s:'Provide detailed written explanation citing specific guidelines and prior decisions when owner disputes denial',t:'Within 14 days of dispute',d:'Architectural guidelines & CC&Rs',
           desc:'When an owner formally disputes an architectural decision, provide a written explanation citing the specific guideline or CC&R provision, the factual basis for the decision, and examples of consistent application.',
           detail:'Your response should: (1) Quote the exact architectural guideline or CC&R provision relied upon. (2) Explain how the proposed modification violates the standard. (3) Cite prior decisions on similar applications (demonstrate consistency). (4) If the denial is discretionary (aesthetic judgment), explain the committee\'s rationale clearly. (5) Offer alternatives — can the owner modify the proposal to comply? (6) Note the owner\'s right to appeal to the full board if the decision was made by a committee.',
           w:'Required when owner formally disputes an architectural decision',ph:'enforce',
           ck:['Cite specific guideline or CC&R provision','Explain how proposal violates standard','Cite prior consistent decisions','Offer alternative approaches','Note appeal rights']},
          {s:'Require owner to restore common elements to original condition when unauthorized modification is completed',t:'After stop-work notice',d:'CC&Rs & DC Code § 42-1903.04',
           desc:'If the owner completed unauthorized work affecting common elements, require restoration to the original condition at the owner\'s expense. If the owner refuses, the board may restore and charge the cost to the owner.',
           detail:'Steps: (1) Send written demand requiring restoration within 30-60 days. (2) If the owner does not restore, the board may engage a contractor and charge the cost to the owner\'s assessment ledger per the CC&Rs. (3) Unpaid restoration costs are subject to lien under DC Code § 42-1903.13. (4) If the unauthorized modification is structural or affects fire-rated assemblies, require a DC-licensed PE to inspect and certify the work — even if the owner obtains after-the-fact approval.',
           w:'Required when unauthorized modification affects common elements',ph:'enforce'}
        ],
        legal:[
          {s:'Attorney reviews architectural standards for enforceability and consistency of application',t:'When standards are challenged or upon first denial dispute',d:'CC&Rs & DC Code § 42-1903.08',
           desc:'When architectural standards are challenged as unreasonable, arbitrary, or inconsistently applied, engage an attorney to review the standards and the decision record.',
           detail:'The attorney will: (1) Review the architectural guidelines for enforceability — standards must be adopted per the authority granted in the CC&Rs or bylaws. (2) Assess whether the standards are reasonable and not discriminatory. (3) Review the decision history for consistency — inconsistent application undermines enforceability. (4) If standards are outdated or incomplete, draft updated guidelines for board adoption. (5) Advise on the association\'s defensibility if the owner sues under DC Code § 42-1903.08.',
           w:'Required when architectural standards are challenged as unreasonable or inconsistent',ph:'enforce'},
          {s:'Attorney advises on DC solar access and renewable energy laws for solar panel requests',t:'Upon solar panel application or denial dispute',d:'DC Code § 8-1774 et seq. & CC&Rs',
           desc:'DC has enacted clean energy and solar access legislation that may limit an HOA\'s ability to deny solar panel installations. The attorney reviews the interplay between DC law and the association\'s CC&Rs.',
           detail:'The attorney will: (1) Review DC\'s Clean Energy DC Omnibus Act and related solar access provisions. (2) Determine whether DC law preempts the CC&R restriction on solar panels. (3) Advise on reasonable conditions the association may impose (placement, angle, color, insurance) without effectively prohibiting installation. (4) Review the specific application — is the proposed installation on a common element (roof) or limited common element (balcony)? (5) Advise on how to balance the owner\'s renewable energy rights with the association\'s aesthetic standards.',
           w:'DC solar access laws may limit the association\'s ability to deny solar installations',ph:'enforce'},
          {s:'Attorney pursues injunctive relief for unauthorized construction that affects structural integrity or common elements',t:'When stop-work notice is ignored',d:'DC Code § 42-1903.08 & DC Superior Court',
           desc:'When an owner ignores a stop-work notice and continues unauthorized construction, particularly work affecting structural elements, fire safety, or common elements, the attorney files for emergency injunctive relief.',
           detail:'The attorney will: (1) File for a TRO in DC Superior Court (510 4th St NW) to stop construction immediately. (2) Seek a preliminary injunction requiring the owner to restore common elements to original condition. (3) Report unpermitted construction to DLCP building inspection division. (4) Seek recovery of the association\'s costs, including attorney fees per the governing documents. (5) If the unauthorized work affects structural integrity, engage a PE to assess and require the owner to provide a structural certification.',
           w:'Required when unauthorized construction affects structural integrity or owner ignores stop-work notice',ph:'enforce'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.04: Common element modifications require association approval. § 42-1903.08: Declaration restrictions enforceable as equitable servitudes. DC building permits required for most structural, electrical, plumbing, or HVAC work — apply through DLCP. Solar access: DC Clean Energy DC Omnibus Act may limit HOA restrictions on solar installations. ENFORCEMENT: Standards must be applied consistently. Document all decisions and rationale.',
          '_':'ARCHITECTURAL REVIEW BEST PRACTICES: (1) Maintain written guidelines covering common modifications (flooring, windows, HVAC, bathrooms, kitchens). (2) Require complete applications with plans and contractor info. (3) Apply standards consistently — the #1 defense in disputes is selective enforcement. (4) Issue decisions in writing with rationale. (5) Monitor work for compliance. (6) For common element modifications, require restoration bonds.'
        }
      },
      { id:'pet-issues', title:'Pet & Animal Issues', desc:'Breed restrictions, ESA/service animal accommodations, nuisance complaints under FHA and DC law',
        tags:['Breed restrictions','ESA disputes','Service animals','Nuisance complaints','Animal bites'],
        pre:[
          {s:'Document complaint with specific dates, behavior, photos, witnesses, and impact on other residents',t:'Upon complaint',d:'CC&Rs: Pet section',
           desc:'Thoroughly document the pet-related complaint with specific dates, descriptions of the behavior, photos or video if available, witness statements, and a description of how it affects other residents.',
           detail:'Documentation should include: (1) Specific dates and times of incidents. (2) Description of the behavior (excessive barking, aggression, off-leash in common areas, unsanitary conditions). (3) Photos or video evidence. (4) Witness statements from affected residents. (5) Impact on common areas or other units (damage, odor, noise). (6) Whether the animal is a documented ESA or service animal — this affects enforcement options significantly.',
           ph:'evidence',ck:['Record specific dates and times','Describe behavior in detail','Collect photos or video','Gather witness statements','Document impact on other residents','Determine if animal is ESA or service animal']},
          {s:'Review CC&Rs for pet rules, weight/breed restrictions, and number limits',t:'1-3 days',d:'CC&Rs: Pet section & Fair Housing Act',
           desc:'Review the CC&Rs and board-adopted rules for pet provisions — restrictions on breeds, weight limits, number of animals, common area usage, and leash requirements. Important: Fair Housing Act overrides most restrictions for ESAs and service animals.',
           detail:'Key considerations: (1) What specific rules apply? (breed, weight, species, number, leash, common area). (2) Are the rules in the Declaration (harder to change) or board-adopted rules (easier to modify)? (3) CRITICAL: Fair Housing Act (42 USC § 3604) and DC Human Rights Act (DC Code § 2-1402.21) require reasonable accommodation for assistance animals (ESAs and service animals). Breed, weight, and number restrictions generally DO NOT apply to ESAs and service animals. (4) DC also has its own animal control laws (DC Code § 8-1801 et seq.) covering dangerous animals, leash requirements, and waste cleanup.',
           ph:'evidence'},
          {s:'Send notice to pet owner citing specific CC&R rule, describing the violation, and providing cure period',t:'Within 1 week of complaint',d:'CC&Rs: Pet section & Bylaws: Enforcement',
           desc:'Send a written notice to the pet owner identifying the specific rule violated, describing the reported behavior, and providing a reasonable cure period (14-30 days depending on the violation).',
           detail:'The notice should: (1) Cite the specific CC&R or rule provision. (2) Describe the reported behavior with dates. (3) Specify what the owner must do to cure (leash in common areas, reduce noise, clean up, etc.). (4) Provide a cure period. (5) State consequences of non-compliance (fines, hearing). (6) NOTE: If the animal is an ESA or service animal, the notice must NOT demand removal — it can only address specific behavior that creates a direct threat to health or safety, or causes substantial property damage.',
           ph:'notice',ck:['Cite specific CC&R provision','Describe reported behavior with dates','Specify required cure action','Set cure period','State consequences of non-compliance','Confirm ESA/service animal status before sending']},
          {s:'Process ESA/service animal accommodation request per Fair Housing Act and DC Human Rights Act',t:'Within 10 days of request',d:'Fair Housing Act (42 USC § 3604) & DC Code § 2-1402.21',
           desc:'When an owner asserts that their animal is an ESA or service animal, follow the HUD/FHA process: accept documentation, evaluate for reasonableness, and approve or deny with specific justification.',
           detail:'FHA/HUD process: (1) SERVICE ANIMALS (trained to perform specific tasks for a person with a disability): no documentation required beyond the animal performing the trained task. (2) EMOTIONAL SUPPORT ANIMALS: may request documentation from a licensed healthcare provider establishing the disability-related need. (3) CANNOT require: specific animal certifications, registration, or breed/weight compliance for ESAs/service animals. (4) CAN deny ONLY if: the specific animal poses a direct threat to health or safety that cannot be reduced by reasonable accommodation, or would cause substantial physical damage to the property. (5) Breed, weight, and number restrictions generally do not apply. (6) The HUD 2020 guidance (FHEO-2020-01) is the current standard. (7) Under DC Human Rights Act § 2-1402.21, the same protections apply.',
           w:'Improperly denying an ESA/service animal request can result in Fair Housing Act complaints and significant liability',ph:'hearing',
           ck:['Determine if service animal or ESA','For ESA: request healthcare provider documentation','Do NOT require certifications or registrations','Evaluate only for direct threat or substantial damage','Document decision with specific justification','Follow HUD 2020 guidance (FHEO-2020-01)']},
          {s:'Schedule hearing and escalate per enforcement policy for continuing nuisance behavior',t:'Per bylaws hearing procedures',d:'Bylaws: Hearing section & CC&Rs',
           desc:'When the pet-related nuisance continues after the initial notice, schedule a hearing per the bylaws enforcement process. For ESAs/service animals, the hearing can address specific behavior but cannot result in animal removal unless the animal poses a direct threat.',
           detail:'Hearing considerations: (1) Follow standard hearing procedures (see fine-hearings workflow). (2) Present documented evidence of the nuisance. (3) Allow the owner to respond. (4) For NON-ESA/non-service animals: the board may impose fines and ultimately require removal per the CC&Rs. (5) For ESA/service animals: fines for specific behavior violations are permissible (e.g., failure to leash, failure to clean up), but removal can only be ordered if the animal poses a direct threat to health or safety AND no reasonable accommodation can eliminate the threat. Document the analysis. (6) DC animal control (DC Code § 8-1801 et seq.) can be contacted for dangerous animal complaints regardless of ESA status.',
           w:'ESA/service animals may not be removed except for direct threat to health or safety — consult attorney if unsure',ph:'enforce'}
        ],
        self:[
          {s:'Review HUD 2020 guidance (FHEO-2020-01) on assistance animals for ESA accommodation requests',t:'Before responding to any ESA request',d:'HUD FHEO-2020-01 & Fair Housing Act',
           desc:'Before responding to any ESA accommodation request, review the current HUD guidance to ensure the association\'s process complies with Fair Housing Act requirements. Improper denials can result in significant liability.',
           detail:'Key HUD guidance points: (1) A person with a disability may request a reasonable accommodation for an assistance animal regardless of pet restrictions. (2) For ESAs: the association may request documentation from a healthcare provider but cannot require specific certifications or registrations. (3) Online-only ESA letters may be given less weight per HUD guidance — but the association cannot categorically reject them. (4) The association bears the burden of showing a direct threat or substantial damage to deny. (5) Breed, weight, and species restrictions generally do not apply. (6) Multiple ESAs may be reasonable depending on the disability. (7) DC Human Rights Act (§ 2-1402.21) provides additional local protections.',
           w:'Required when there is an ESA accommodation dispute — improper denial carries significant liability',ph:'hearing',
           ck:['Review HUD FHEO-2020-01 guidance','Evaluate healthcare provider documentation','Do not require certifications or registrations','Assess direct threat or substantial damage','Document analysis and decision']},
          {s:'Report dangerous animal to DC Animal Care and Control for immediate safety threats',t:'Immediately when animal poses danger',d:'DC Code § 8-1801 et seq.',
           desc:'When an animal poses an immediate threat to health or safety — bite, attack, aggressive behavior — report to DC Animal Care and Control (formerly DC Animal Control) and document the incident.',
           detail:'(1) For emergencies (active attack): call 911. (2) For non-emergency dangerous animal reports: contact DC Animal Care and Control at (202) 576-6664. (3) Under DC Code § 8-1808, dangerous dog determinations are made by the Mayor\'s office. (4) Document the incident with photos, medical records (if bite occurred), and witness statements. (5) The dangerous animal reporting process applies regardless of ESA/service animal status — a direct threat to safety overrides FHA protections. (6) Notify the building\'s insurance carrier if a bite occurred on common areas.',
           w:'Required when an animal poses a direct threat — applies regardless of ESA/service animal status',ph:'enforce',
           ck:['Call 911 for active attacks','Report to DC Animal Care and Control','Document incident with photos','Collect medical records if bite occurred','Notify insurance carrier']},
          {s:'Enforce leash, cleanup, and common area rules consistently for all animals (including ESAs/service animals)',t:'Ongoing',d:'CC&Rs: Pet rules & DC Code § 8-1805',
           desc:'While breed and weight restrictions may not apply to ESAs/service animals, behavioral rules (leash requirements, waste cleanup, noise) can be enforced for all animals. DC Code § 8-1805 requires all dogs to be on leash in public areas.',
           detail:'Enforceable for ALL animals (including ESAs): (1) Leash requirements in common areas — DC Code § 8-1805 requires all dogs on leash. (2) Waste cleanup — both CC&Rs and DC Code § 8-1808.01 require pet waste cleanup. (3) Noise ordinance compliance. (4) Property damage liability. NOT enforceable for ESAs/service animals: breed restrictions, weight limits, number limits, pet deposits or fees. Document all enforcement actions consistently.',
           ph:'enforce',ck:['Enforce leash requirements per DC Code § 8-1805','Enforce waste cleanup per DC Code § 8-1808.01','Enforce noise requirements','Apply rules uniformly to all animals']}
        ],
        legal:[
          {s:'Attorney advises on ESA/FHA requirements, reasonable accommodation process, and denial justification',t:'Upon ESA request or dispute',d:'Fair Housing Act & DC Code § 2-1402.21',
           desc:'Engage an attorney experienced in Fair Housing Act requirements whenever an ESA accommodation request is disputed, denied, or when the association is unsure how to proceed.',
           detail:'The attorney will: (1) Review the accommodation request and supporting documentation. (2) Advise on whether the request meets FHA requirements per HUD 2020 guidance. (3) If denying: draft a written denial citing the specific justification (direct threat to health/safety, or substantial property damage) with supporting evidence. (4) Advise on interactive process with the owner — FHA requires a good-faith interactive process to identify reasonable accommodations. (5) If a Fair Housing complaint is filed (with HUD or DC Office of Human Rights), defend the association. (6) Fair Housing violations can result in significant damages, attorney fees, and injunctive relief.',
           w:'Required for any ESA dispute — Fair Housing violations carry significant liability',ph:'enforce'},
          {s:'Attorney handles bite incident liability, insurance claim, and dangerous animal determination',t:'After animal bite on common area',d:'DC Code § 8-1801 et seq. & Insurance policy',
           desc:'When an animal bite occurs on association common areas, the attorney coordinates the insurance response, liability assessment, and any dangerous animal determination under DC law.',
           detail:'The attorney will: (1) Notify the association\'s general liability insurance carrier. (2) Advise on the association\'s potential liability for common area safety. (3) Assess whether the owner\'s HO-6 policy covers the bite (animal liability endorsement). (4) If the animal is determined to be dangerous under DC Code § 8-1808, advise on removal regardless of ESA status — a determined dangerous animal is a direct threat per FHA. (5) Coordinate with DC Animal Care and Control. (6) If the injured person files a lawsuit, coordinate the defense with insurance defense counsel.',
           w:'Required after any animal bite on common area — involves both liability and insurance',ph:'enforce'}
        ],
        notes:{
          'DC':'Fair Housing Act (42 USC § 3604) and DC Human Rights Act (DC Code § 2-1402.21): Reasonable accommodation required for ESAs and service animals. HUD 2020 Guidance (FHEO-2020-01) is the current standard. Breed, weight, and number restrictions generally DO NOT apply to assistance animals. DC animal control: DC Code § 8-1801 et seq. — dogs must be leashed per § 8-1805, waste cleanup per § 8-1808.01, dangerous dog determination per § 8-1808. Report to DC Animal Care and Control: (202) 576-6664. ESA/service animal disputes are the highest-risk pet issue — consult attorney before denying any accommodation request.',
          '_':'PET ENFORCEMENT HIERARCHY: (1) Behavioral rules (leash, cleanup, noise) are enforceable for ALL animals including ESAs. (2) Breed, weight, and number restrictions apply ONLY to non-ESA/non-service animals. (3) ESA removal requires a showing of direct threat to health/safety — an extremely high bar. (4) Consult an attorney before denying any ESA/service animal request. (5) DC Animal Care and Control handles dangerous animal determinations regardless of ESA status.'
        }
      }
    ]
  },
  { id:'legal', num:'4', icon:'🏛️', label:'Legal & Risk', color:'rose',
    sits: [
      { id:'insurance-claims', title:'Insurance Claims', desc:'Water damage, fire, liability claims, deductible allocation under DC law',
        tags:['Water damage claims','Deductible allocation','Common vs unit damage','Fire damage','Liability claims'],
        pre:[
          {s:'Document damage immediately with dated photos, video, and written timeline of events',t:'Immediately upon discovery',d:'Insurance policy: Notice provisions',
           desc:'Begin documentation the moment damage is discovered — dated photos, video, and a written timeline of events. This documentation is the foundation of the insurance claim and any subsequent legal action.',
           detail:'Documentation checklist: (1) Dated photos of all damage — common areas and affected units. (2) Video walkthrough of affected areas. (3) Written timeline: who discovered the damage, when, what actions were taken, who was notified. (4) List of all affected units and common areas. (5) Estimated scope (number of units, square footage, systems affected). (6) Preserve damaged materials — do not dispose of anything until the adjuster inspects. (7) If applicable, preserve evidence of the cause (failed pipe, appliance, entry point).',
           ph:'investigate',ck:['Take dated photos of all damage','Record video walkthrough','Create written timeline of events','List all affected units and areas','Preserve damaged materials for adjuster']},
          {s:'Notify insurance carrier within policy timeframe — most policies require 24-48 hour notice',t:'Within 24-48 hours of discovery',d:'Insurance policy: Notice provisions & DC insurance regulations',
           desc:'Contact the insurance carrier\'s claims department promptly — most policies require notice within 24-48 hours. Failure to provide timely notice can jeopardize the claim.',
           detail:'When calling the carrier: (1) Have the policy number ready. (2) Describe the incident: date, cause (if known), scope, areas affected. (3) Request an adjuster visit. (4) Ask about emergency mitigation requirements (most policies require reasonable steps to prevent further damage). (5) Get a claim number and adjuster contact info. (6) Follow up in writing with a summary of the call and initial photos. (7) If damage is extensive, request an emergency adjuster visit (some carriers will send one within 24 hours for large losses).',
           ph:'investigate',ck:['Contact carrier claims department','Provide policy number and loss details','Submit initial photos','Request adjuster visit','Get claim number','Follow up in writing']},
          {s:'Determine whether damage is common element or unit responsibility per Declaration maintenance matrix',t:'1-3 days',d:'Declaration: Maintenance matrix & DC Code § 42-1903.04',
           desc:'Review the Declaration\'s maintenance matrix to determine whether the damage is a common element responsibility (HOA master policy) or unit owner responsibility (HO-6 policy). This determines which insurance applies.',
           detail:'DC Code § 42-1903.04 defines common elements and limited common elements. Typical allocation: (1) Structure, roof, exterior walls, common pipes/wiring = common element (HOA responsibility, master policy). (2) Interior finishes, fixtures, appliances, unit plumbing/electrical = unit owner (HO-6 policy). (3) LIMITED common elements (balconies, windows, HVAC serving one unit) = check Declaration specifically. (4) If the damage crosses boundaries (e.g., pipe in common wall leaks into unit), both policies may apply. (5) The CAUSE of damage matters too — if a unit owner\'s negligence caused common element damage, the HOA repairs but can charge back per CC&Rs.',
           ph:'investigate'},
          {s:'Coordinate between master policy and unit HO-6 policies; determine deductible allocation per CC&Rs',t:'1-2 weeks',d:'CC&Rs: Insurance provisions & DC Code § 42-1903.04',
           desc:'Coordinate claims between the HOA master policy (common elements) and affected unit owners\' HO-6 policies (unit interiors). Review CC&Rs for deductible allocation methodology.',
           detail:'Coordination steps: (1) Notify affected unit owners to file HO-6 claims for interior damage. (2) Provide the HOA claim number for cross-reference. (3) Determine deductible allocation per CC&Rs — common approaches: HOA bears the full deductible, deductible charged to the unit that caused the loss, or deductible split proportionally among affected units. (4) If multiple units are affected, the HOA may need to manage the coordination to prevent gaps and duplicate payments. (5) Document all communications with both carriers.',
           ph:'act',ck:['Notify affected owners to file HO-6 claims','Provide HOA claim number','Review CC&Rs for deductible allocation','Coordinate between master and HO-6 adjusters','Document all carrier communications']},
          {s:'Obtain independent repair estimates and provide to adjuster with all supporting documentation',t:'Within 1-2 weeks or as requested by adjuster',d:'Insurance policy',
           desc:'Obtain your own independent repair estimates — do not rely solely on the carrier\'s preferred vendor estimate. Provide the adjuster with complete documentation: estimates, photos, engineering reports if applicable.',
           detail:'Steps: (1) Get 2-3 independent repair estimates from licensed contractors. (2) If the carrier\'s estimate is significantly lower than independent estimates, the independent estimates become critical evidence for negotiation. (3) For complex damage (structural, mold, mechanical systems), engage a specialist or engineer for a formal assessment. (4) Provide the adjuster with: all photos, timeline, estimates, invoices for emergency mitigation already performed, and any expert reports. (5) Keep copies of everything provided to the carrier.',
           ph:'act',ck:['Obtain 2-3 independent repair estimates','Compare to carrier estimate','Engage specialist if complex damage','Provide complete documentation to adjuster','Retain copies of everything']},
          {s:'Review settlement offer against actual damages; negotiate or appeal if underpaid',t:'When settlement offer is received',d:'Insurance policy & DC insurance regulations',
           desc:'Carefully review the carrier\'s settlement offer against your independent estimates and actual repair costs. If the offer is below actual damages, negotiate or file a formal appeal.',
           detail:'Review checklist: (1) Does the settlement cover the full scope of damage? Compare line-by-line to your independent estimates. (2) Is depreciation properly applied (actual cash value vs replacement cost)? Most HOA master policies are replacement cost — you may receive a second payment after repairs are completed. (3) Are all damaged components included? Carriers sometimes miss hidden damage (inside walls, under flooring). (4) If underpaid: send a written demand with independent estimates and documentation. (5) If denied: request the specific policy provision cited for denial. (6) Consider a public adjuster (contingency fee, typically 10% of recovery) for complex claims.',
           ph:'resolve',ck:['Compare settlement to independent estimates line-by-line','Check depreciation methodology','Verify all damage components are included','Send written demand if underpaid','Request policy provision if denied']}
        ],
        self:[
          {s:'Review denial letter and policy provisions; prepare written appeal with supporting documentation',t:'Within 30 days of denial or per policy appeal window',d:'Insurance policy & DC DISB regulations',
           desc:'When the carrier denies a claim, carefully review the denial letter and the specific policy provisions cited. Prepare a detailed written appeal with supporting documentation.',
           detail:'Appeal steps: (1) Read the denial letter carefully — identify the specific policy provision and exclusion cited. (2) Review the policy language yourself — carriers sometimes misapply exclusions. (3) Prepare a written appeal: restate the claim, address each basis for denial, provide additional documentation. (4) Include independent estimates, expert reports, and photos supporting your position. (5) If the carrier is acting unreasonably, file a complaint with DC DISB (Department of Insurance, Securities, and Banking). (6) Maintain a record of all communications with the carrier. (7) Note appeal deadlines — most policies have a window.',
           w:'Required when carrier denies the claim — many denials can be successfully appealed',ph:'resolve',
           ck:['Review denial letter and cited policy provisions','Review actual policy language','Prepare written appeal','Include independent estimates and documentation','File DISB complaint if warranted','Track appeal deadline']},
          {s:'Document actual repair costs and request reconsideration for underpaid claims with independent estimates',t:'Within 30 days of receiving settlement offer',d:'Insurance policy',
           desc:'When the settlement offer is below actual damages, document the shortfall with independent contractor estimates and request formal reconsideration.',
           detail:'Steps: (1) Obtain 2-3 independent estimates from licensed contractors. (2) Create a line-by-line comparison showing the carrier\'s estimate vs your estimates for each damaged component. (3) If hidden damage was discovered during repair, document it with photos and updated estimates. (4) Submit a formal request for reconsideration with all supporting documentation. (5) If the carrier does not increase the offer, consider engaging a public adjuster (contingency fee, typically 10% of recovery). (6) If the shortfall is significant, consult an attorney about bad faith claims.',
           w:'Required when settlement offer is below actual damages',ph:'resolve',
           ck:['Obtain independent repair estimates','Create line-by-line comparison','Document hidden damage if discovered','Submit formal reconsideration request','Consider public adjuster if shortfall is significant']},
          {s:'Charge deductible amount to responsible unit owner per CC&Rs deductible allocation provision',t:'After deductible allocation determination',d:'CC&Rs: Insurance provisions & DC Code § 42-1903.04',
           desc:'When the CC&Rs allocate the deductible to the unit that caused the loss, send a written demand to the responsible owner for the deductible amount with supporting documentation.',
           detail:'Steps: (1) Cite the specific CC&R provision for deductible allocation. (2) Include documentation showing the cause of loss was attributable to the owner\'s unit or negligence. (3) State the deductible amount and payment deadline. (4) If unpaid, add to the owner\'s assessment ledger and pursue through the standard collection process per DC Code § 42-1903.13.',
           ph:'resolve'}
        ],
        legal:[
          {s:'Attorney reviews claim denial and negotiates with carrier for adequate settlement',t:'When carrier denies or significantly underpays a valid claim',d:'Insurance policy & DC insurance regulations',
           desc:'When the carrier denies or significantly underpays a valid claim and internal appeals are unsuccessful, engage an attorney experienced in DC insurance law to negotiate with the carrier.',
           detail:'The attorney will: (1) Review the policy language and the carrier\'s basis for denial or reduced payment. (2) Send a formal demand citing specific policy provisions requiring coverage. (3) Negotiate with the carrier\'s claims department and management. (4) If negotiation fails, advise on filing a complaint with DC DISB. (5) Assess whether a bad faith claim is warranted. (6) For complex claims, engage an independent insurance appraiser for an appraisal under the policy\'s appraisal provision.',
           w:'Required when carrier denies a valid claim or significantly underpays',ph:'resolve'},
          {s:'Attorney files bad faith claim against carrier for unreasonable claim handling',t:'After exhausting negotiation and administrative remedies',d:'DC insurance regulations & DC Superior Court',
           desc:'When the carrier unreasonably denies, delays, or underpays a valid claim, the attorney files a bad faith claim in DC Superior Court seeking the full policy amount plus consequential damages and attorney fees.',
           detail:'The attorney will: (1) Evaluate the bad faith claim — did the carrier fail to investigate, delay unreasonably, misrepresent policy provisions, or refuse to pay without reasonable basis? (2) File a complaint with DC DISB as an administrative remedy. (3) File suit in DC Superior Court (510 4th St NW) seeking: full policy amount, consequential damages (additional repair costs, temporary relocation costs for displaced owners), and attorney fees. (4) DC permits recovery of attorney fees in insurance bad faith cases. (5) Consider whether the appraisal provision in the policy should be invoked first.',
           w:'Required when carrier unreasonably denies or delays a valid claim',ph:'resolve'},
          {s:'Attorney advises on deductible allocation disputes between the association and unit owners',t:'When deductible allocation is disputed',d:'CC&Rs: Insurance provisions & DC Code § 42-1903.04',
           desc:'When unit owners dispute the deductible allocation — either the methodology or the amount charged to their unit — the attorney reviews the CC&Rs and advises on the legally correct allocation.',
           detail:'The attorney will: (1) Review the CC&Rs deductible allocation provision. (2) If the CC&Rs are silent, advise on default allocation under DC condo law. (3) Issue a written opinion on the proper allocation. (4) If the charged owner refuses to pay, advise on adding the amount to the assessment ledger per DC Code § 42-1903.12 and pursuing collection per § 42-1903.13. (5) If the CC&R provision is ambiguous, recommend an amendment to clarify.',
           w:'Required when deductible allocation is disputed by a unit owner',ph:'resolve'}
        ],
        notes:{
          'DC':'DC DISB (Department of Insurance, Securities, and Banking) handles insurance regulation complaints. File at disb.dc.gov. DC Code § 42-1903.04 defines common element vs unit boundaries — this drives insurance allocation. CC&Rs define deductible allocation methodology. Most HOA master policies are replacement cost — submit invoices after repair for the second payment. KEY: Document everything immediately, file promptly, get independent estimates, and appeal underpayments aggressively.',
          '_':'INSURANCE CLAIMS BEST PRACTICES: (1) File within 24-48 hours — late notice jeopardizes claims. (2) Document everything with dated photos and written timelines. (3) Get independent estimates — do not rely solely on the carrier\'s preferred vendor. (4) Review settlements line-by-line against actual damage. (5) Appeal denials and underpayments — many can be successfully challenged. (6) Consider a public adjuster for complex claims (10% contingency fee). (7) Know your CC&Rs deductible allocation before a claim occurs.'
        }
      },
      { id:'litigation', title:'Litigation', desc:'Suing owners, defending lawsuits, contractor disputes, mediation under DC law',
        tags:['Suing owners','Being sued','Contractor disputes','Mediation','Arbitration'],
        pre:[
          {s:'Document the underlying dispute thoroughly with a complete chronological record',t:'Ongoing from first notice',d:'Document retention policy',
           desc:'Build a complete chronological file of the dispute — all correspondence, notices, photos, financial records, meeting minutes, and witness statements. This documentation is the foundation of any legal action.',
           detail:'Documentation should include: (1) Complete chronological timeline of events. (2) All correspondence (letters, emails, texts) between the parties. (3) All formal notices sent (with certified mail receipts). (4) Photos and video evidence. (5) Board meeting minutes where the issue was discussed. (6) Financial records (ledgers, invoices, estimates). (7) Governing document provisions relevant to the dispute. (8) Witness statements. (9) Any expert reports (engineering, financial). Organize chronologically and keep originals in a secure location.',
           ph:'investigate',ck:['Create chronological timeline','Gather all correspondence','Collect all formal notices with receipts','Compile photos and evidence','Gather relevant meeting minutes','Organize financial records']},
          {s:'Exhaust internal dispute resolution processes before pursuing litigation',t:'Before any court filing',d:'CC&Rs: Dispute resolution & DC Code § 42-1903.08',
           desc:'Most CC&Rs require the association to exhaust internal dispute resolution (notice, hearing, mediation) before filing suit. DC courts generally require this as well — failure to exhaust internal remedies can result in dismissal.',
           detail:'Internal resolution steps: (1) Verify you\'ve followed all notice and hearing procedures per the CC&Rs. (2) Check the CC&Rs for mandatory alternative dispute resolution (ADR) — many require mediation or arbitration before litigation. (3) If mediation is required, schedule it through an approved provider. (4) Document all resolution attempts — courts will ask what steps the association took before filing. (5) Consider whether the dispute can be resolved through the fine or enforcement process rather than litigation. (6) Calculate the cost-benefit: litigation in DC Superior Court typically costs $15K-$50K+ for the association, even if the association prevails.',
           ph:'investigate',ck:['Complete all notice and hearing procedures','Check CC&Rs for mandatory ADR','Schedule mediation if required','Document all resolution attempts','Calculate litigation cost-benefit']},
          {s:'Review governing docs for dispute resolution requirements — mediation, arbitration, attorney fee provisions',t:'Before any filing',d:'CC&Rs: Dispute resolution & Bylaws',
           desc:'Review the CC&Rs and bylaws for mandatory dispute resolution procedures (mediation, arbitration), attorney fee provisions, and any limitations on the association\'s right to sue or be sued.',
           detail:'Key provisions to check: (1) Is mediation mandatory before litigation? If so, with whom and under what rules? (2) Is arbitration mandatory (binding or non-binding)? (3) Attorney fee provision — does the prevailing party recover attorney fees? This is critical for cost-benefit analysis. (4) Venue — do the CC&Rs specify where litigation must be filed (typically DC Superior Court)? (5) Limitations — any caps on association liability or required insurance coverage for litigation costs? (6) Board authority — do the bylaws require owner vote before the board can initiate litigation? Some do for lawsuits against owners.',
           ph:'act',ck:['Check for mandatory mediation requirement','Check for mandatory arbitration','Review attorney fee provision','Check venue requirement','Review board authority to initiate litigation']},
          {s:'Notify D&O insurance carrier immediately upon receipt of any lawsuit, demand letter, or threat of litigation',t:'Immediately upon notice of claim',d:'D&O insurance policy & GL policy',
           desc:'Notify both the D&O and general liability insurance carriers immediately upon receiving any lawsuit, demand letter, or written threat of litigation. Late notice can void coverage.',
           detail:'Steps: (1) Notify D&O carrier — covers claims against the board and individual board members for decisions made in their board capacity. (2) Notify general liability carrier — covers bodily injury and property damage claims on common areas. (3) Provide: copy of the lawsuit or demand, description of the underlying dispute, timeline of events, names of parties. (4) Ask about reservation of rights and whether the carrier will provide defense counsel. (5) IMPORTANT: most policies require notice within a specific timeframe (often 30-60 days) — late notice can void coverage. (6) Do not admit liability or make statements to the opposing party without consulting with the carrier and attorney first.',
           w:'Late notice can void D&O and GL coverage — notify immediately',ph:'resolve',
           ck:['Notify D&O carrier with copy of lawsuit/demand','Notify GL carrier if applicable','Ask about defense counsel assignment','Do not admit liability','Provide complete documentation to carrier']}
        ],
        self:[
          {s:'File suit in DC Superior Court Small Claims Branch for amounts up to $10,000',t:'After exhausting internal remedies',d:'DC Superior Court Small Claims Rules',
           desc:'For claims up to $10,000, the association can file in DC Superior Court Small Claims Branch without an attorney. This is appropriate for assessment collection, small contractor disputes, or damage recovery within the limit.',
           detail:'Filing details: DC Superior Court, Small Claims Branch, 510 4th Street NW, Washington DC 20001. Filing fee: $5-$65 depending on amount claimed. Prepare: (1) Complete statement of claim describing the dispute. (2) All supporting documentation (contracts, invoices, photos, notices). (3) Governing document provisions authorizing the claim. (4) Board resolution authorizing the lawsuit. The HOA does not need an attorney for Small Claims, but consider: if the other side has an attorney, you may be at a disadvantage. If the amount exceeds $10,000, file in Civil Division — you should engage an attorney for Civil Division cases.',
           w:'Small Claims limit is $10,000 — amounts above this require Civil Division and likely an attorney',ph:'act',
           ck:['Confirm amount is within $10,000 limit','Prepare statement of claim','Gather all supporting documentation','Obtain board resolution authorizing lawsuit','File at DC Superior Court Small Claims']},
          {s:'Schedule mediation through DC-approved provider per CC&Rs dispute resolution requirements',t:'Before filing or per CC&Rs requirement',d:'CC&Rs: Dispute resolution',
           desc:'If the CC&Rs require mediation before litigation (or if mediation is likely to resolve the dispute without the cost of a lawsuit), schedule mediation through a DC-approved provider.',
           detail:'Mediation resources in DC: (1) DC Superior Court Multi-Door Dispute Resolution Division — provides free or low-cost mediation for many civil disputes. (2) Private mediators — typical cost $300-$500/hour split between parties. (3) The mediation process: each side presents their position, the mediator facilitates negotiation, and any agreement is documented in a written settlement. (4) Mediation is typically non-binding unless both parties sign a settlement agreement. (5) Advantages: faster, cheaper, preserves community relationships, and confidential. (6) Prepare a mediation statement summarizing the dispute, the association\'s position, and the desired outcome.',
           w:'Required when governing docs mandate mediation before litigation',ph:'act',
           ck:['Check CC&Rs for mandatory mediation requirement','Contact DC Multi-Door Dispute Resolution or private mediator','Prepare mediation statement','Prepare supporting documentation','Obtain board authorization to settle within parameters']},
          {s:'If the association is sued: preserve all documents, notify insurance, and do not communicate with the opposing party',t:'Immediately upon being served',d:'D&O policy & GL policy',
           desc:'When the association is served with a lawsuit, immediately preserve all relevant documents, notify insurance carriers, and stop all direct communication with the opposing party.',
           detail:'Steps: (1) PRESERVE ALL DOCUMENTS — issue a litigation hold notice to all board members and the management company. Do not delete, alter, or destroy any documents related to the dispute. (2) Notify D&O and GL carriers immediately. (3) Do not communicate with the opposing party or their attorney — all communication goes through your attorney. (4) Do not discuss the lawsuit at open board meetings — this is an executive session matter. (5) Note the deadline to respond to the complaint (typically 20-30 days in DC Superior Court). (6) Engage an attorney immediately if insurance does not provide defense counsel.',
           w:'Failure to preserve documents can result in sanctions — issue litigation hold immediately',ph:'resolve',
           ck:['Issue litigation hold notice','Notify D&O carrier','Notify GL carrier','Stop direct communication with opposing party','Note response deadline','Engage attorney']}
        ],
        legal:[
          {s:'Attorney handles all litigation beyond Small Claims — do not self-represent the HOA in DC Superior Court Civil Division',t:'Upon filing or being served',d:'DC Superior Court & DC Code § 42-1903.08',
           desc:'For any litigation in DC Superior Court Civil Division (amounts over $10,000, injunctive relief, complex disputes), the association must be represented by an attorney. HOAs cannot self-represent in Civil Division.',
           detail:'The attorney will: (1) File or respond to the complaint in DC Superior Court (510 4th St NW). (2) Conduct discovery (document requests, depositions, interrogatories). (3) File motions and attend hearings. (4) Negotiate settlement on the board\'s behalf within authorized parameters. (5) Try the case if settlement is not reached. (6) If the CC&Rs provide for attorney fee shifting, seek recovery of fees from the losing party. (7) Coordinate with D&O and GL insurance defense counsel if coverage is triggered. (8) Provide regular status updates to the board in executive session.',
           w:'HOAs generally cannot self-represent in DC Superior Court Civil Division — attorney required',ph:'resolve'},
          {s:'Attorney evaluates cost-benefit of continued litigation vs settlement and advises the board',t:'Before committing to trial or at any stage',d:'Fiduciary duty & CC&Rs',
           desc:'Before committing to trial, the attorney should provide a written cost-benefit analysis: likelihood of success, estimated total legal costs through trial, potential recovery or exposure, and settlement options.',
           detail:'The attorney\'s analysis should cover: (1) Likelihood of success on the merits. (2) Estimated legal costs through trial ($15K-$50K+ for routine cases, $50K-$200K+ for complex construction or insurance disputes). (3) Potential recovery (if suing) or exposure (if defending). (4) Whether the CC&Rs provide for attorney fee recovery — if not, even a "win" can be costly. (5) Settlement value — what is a reasonable settlement range? (6) Non-monetary factors: community relationships, precedent, board member time investment. (7) The board\'s fiduciary duty requires it to make a business judgment — sometimes settling a case you could win is the right financial decision.',
           w:'Required before committing to trial — litigation costs can exceed the amount in dispute',ph:'resolve'},
          {s:'Attorney advises on indemnification and insurance coverage for board members in their individual capacity',t:'When board members are personally named in a lawsuit',d:'D&O policy & Bylaws: Indemnification',
           desc:'When board members are named personally in a lawsuit (not just the association), the attorney advises on D&O coverage, bylaws indemnification provisions, and defense strategy.',
           detail:'The attorney will: (1) Review the D&O policy to confirm individual board members are covered. (2) Review bylaws indemnification provisions — most bylaws indemnify board members for actions taken in good faith in their board capacity. (3) Determine if the claim falls within the policy\'s coverage (some D&O policies exclude certain claims like criminal conduct, fraud, or personal benefit). (4) Coordinate defense with the D&O carrier\'s appointed counsel. (5) Advise individual board members on their rights and protections. (6) Under DC Code § 29-1108.01, board members who act in good faith and with the care of a reasonably prudent person are generally protected from personal liability.',
           w:'Required when board members are named personally — D&O coverage and bylaws indemnification apply',ph:'resolve'}
        ],
        notes:{
          'DC':'DC Superior Court: 510 4th Street NW, Washington DC 20001. Small Claims Branch: amounts up to $10,000, no attorney required. Civil Division: amounts over $10,000, attorney required. Multi-Door Dispute Resolution Division: free/low-cost mediation. DC Code § 42-1903.08: Declaration restrictions enforceable as equitable servitudes. DC Code § 29-1108.01: Board members protected when acting in good faith. D&O and GL insurance: notify immediately upon any claim — late notice can void coverage. Many CC&Rs require mediation before litigation and provide for attorney fee shifting.',
          '_':'LITIGATION DECISION FRAMEWORK: (1) Exhaust internal remedies first. (2) Check CC&Rs for mandatory mediation/arbitration. (3) Notify insurance immediately. (4) Calculate cost-benefit before filing. (5) Consider mediation — it\'s faster, cheaper, and preserves relationships. (6) For Small Claims ($10K or less), the board can self-represent. (7) For Civil Division, attorney required. (8) Settlement is often the right business decision even when you could win. (9) Document everything — the quality of your record determines the outcome.'
        }
      },
      { id:'governing-docs', title:'Governing Document Interpretation', desc:'Interpreting Declaration, bylaws, and rules under DC Condominium Act',
        tags:['Interpreting covenants','Resolving ambiguities','Declaration','Bylaws','Rules'],
        pre:[
          {s:'Identify specific provision and gather all relevant governing document context',t:'As issue arises',d:'Declaration, Bylaws, Rules & DC Code § 42-1901 et seq.',
           desc:'Identify the exact provision in question and gather the full context — the Declaration, bylaws, rules, any amendments, and prior board resolutions interpreting the same or similar provisions.',
           detail:'Steps: (1) Locate the exact provision (Declaration, bylaws, or rules). (2) Check for amendments — the provision may have been modified. (3) Review surrounding provisions for context. (4) Identify the hierarchy of governing documents in DC: (a) DC Condominium Act (DC Code § 42-1901 through § 42-1904) prevails over all governing documents. (b) Declaration prevails over bylaws. (c) Bylaws prevail over rules and resolutions. (5) Gather any prior board resolutions interpreting this provision. (6) Note the specific issue or dispute triggering the interpretation.',
           ph:'investigate',ck:['Locate exact provision','Check for amendments','Review surrounding provisions','Identify governing document hierarchy','Gather prior board resolutions']},
          {s:'Review DC Condominium Act for default rules and statutory requirements that may apply',t:'1-3 days',d:'DC Code § 42-1901 through § 42-1904',
           desc:'Review the DC Condominium Act (DC Code § 42-1901 through § 42-1904) for default rules and mandatory provisions that may govern the issue. DC law supersedes conflicting governing document provisions.',
           detail:'Key DC Condominium Act sections: (1) § 42-1903.02: Creation of condominium, Declaration requirements. (2) § 42-1903.04: Common elements and limited common elements. (3) § 42-1903.08: Declaration restrictions enforceable as equitable servitudes. (4) § 42-1903.12: Assessment collection, late fees, attorney fees. (5) § 42-1903.13: Assessment liens and super-priority. (6) § 42-1903.14: Owner access to records. (7) § 42-1904.04: Resale disclosure requirements. (8) § 42-1904.09: Buyer rescission rights. Also review DC Uniform Common Interest Ownership Act (DC Code § 42-2001 et seq.) which may apply to certain condominiums.',
           ph:'investigate'},
          {s:'Check for prior board interpretations, resolutions, and consistent application history',t:'1-3 days',d:'Board minutes & Resolution records',
           desc:'Before adopting a new interpretation, check whether the board has previously interpreted the same provision — and how it was applied. Consistency is critical for enforceability.',
           detail:'Steps: (1) Search board minutes for prior discussions of this provision. (2) Check the resolution register for prior interpretations. (3) Ask long-serving board members and the property manager about historical application. (4) If a prior interpretation exists: either follow it for consistency, or formally adopt a new interpretation by resolution with a written explanation for the change. (5) If no prior interpretation exists: document this as a matter of first impression. (6) Inconsistent application is the primary reason courts invalidate governing document enforcement — if you\'re changing course, document why.',
           ph:'act',ck:['Search board minutes for prior discussions','Check resolution register','Consult long-serving board members/manager','Document prior application history']},
          {s:'Draft board resolution documenting the interpretation with legal citations and rationale',t:'1-2 weeks',d:'DC Code § 42-1903.08 & Governing documents',
           desc:'Adopt a formal board resolution documenting the interpretation — cite the specific provision, the issue, the board\'s interpretation, the legal basis, and how it will be applied going forward.',
           detail:'The resolution should include: (1) The specific governing document provision being interpreted (quote the exact language). (2) The issue or question presented. (3) The board\'s interpretation. (4) Legal basis — cite DC Code provisions, industry standards, or legal opinions supporting the interpretation. (5) How the interpretation will be applied going forward. (6) Whether the interpretation changes prior practice (and if so, explain why). (7) Date adopted and vote. Distribute a summary to all owners if the interpretation affects owner rights or obligations. File the resolution in the permanent records.',
           ph:'resolve',ck:['Quote exact governing document language','State the issue or question','State the board\'s interpretation','Cite legal basis','Explain how it will be applied','Note any change from prior practice','Record vote in minutes']}
        ],
        self:[
          {s:'Provide detailed written explanation with legal citations when owner disputes a board interpretation',t:'Within 14 days of dispute',d:'Governing documents & DC Code § 42-1903.08',
           desc:'When an owner formally disputes a board interpretation, provide a written response citing the specific governing document language, the DC Code provisions supporting the interpretation, prior consistent application, and the board\'s rationale.',
           detail:'Your response should: (1) Quote the exact governing document language. (2) Cite DC Code provisions — § 42-1903.08 (Declaration restrictions enforceable as equitable servitudes), plus any other applicable sections. (3) Reference the governing document hierarchy (DC Code > Declaration > Bylaws > Rules). (4) Show prior consistent application if available. (5) Explain the board\'s rationale in plain language. (6) Offer to discuss at a board meeting if the owner wants to present their interpretation. (7) If the owner\'s interpretation has merit, consider whether an amendment would resolve the ambiguity.',
           w:'Required when owner formally disputes a board interpretation',ph:'resolve',
           ck:['Quote exact governing document language','Cite DC Code provisions','Reference prior consistent application','Explain rationale in plain language','Offer to discuss at board meeting']},
          {s:'Compile and distribute updated consolidated governing documents when amendments accumulate',t:'After every 3rd amendment or every 5 years',d:'DC Code § 42-1903.14 & Best practice',
           desc:'When amendments to the Declaration, bylaws, or rules accumulate, compile and distribute consolidated versions to all owners. Owners should always have access to the current governing documents per DC Code § 42-1903.14.',
           detail:'Steps: (1) Compile all amendments in chronological order. (2) Produce a "restated" version showing current language (marked as restated, not a new document). (3) Distribute to all owners electronically and/or in print. (4) Post to the association\'s website or portal if available. (5) Include in all resale certificate packages per DC Code § 42-1904.04. (6) A restated document is not a new amendment — it\'s a convenience compilation. Have the attorney review the restated version for accuracy.',
           ph:'resolve'},
          {s:'Research DC case law and industry guidance when the governing documents are genuinely ambiguous',t:'1-2 weeks',d:'DC Condominium Act & DC case law',
           desc:'When a provision is genuinely ambiguous (reasonable people could interpret it differently), research DC case law, industry guidance (Community Associations Institute), and the DC Condominium Act for interpretive guidance before adopting the board\'s interpretation.',
           detail:'Research sources: (1) DC Code § 42-1901 through § 42-1904 for statutory guidance. (2) DC Superior Court and DC Court of Appeals case law interpreting condo associations. (3) Community Associations Institute (CAI) best practice guides. (4) Similar provisions in comparable DC condo Declarations. (5) If the ambiguity has significant financial or legal consequences, engage an attorney for a formal opinion before the board adopts its interpretation.',
           ph:'investigate'}
        ],
        legal:[
          {s:'Attorney provides formal written opinion on ambiguous provisions with significant financial or legal impact',t:'Before board adopts interpretation',d:'DC Code § 42-1901 et seq. & Governing documents',
           desc:'For ambiguous governing document provisions with significant financial or legal consequences (assessment methodology, use restrictions, voting thresholds), obtain a formal written opinion from an attorney experienced in DC condo law before the board adopts its interpretation.',
           detail:'The attorney will: (1) Review the specific provision in context of the full Declaration and bylaws. (2) Research DC case law interpreting similar provisions. (3) Apply DC Condominium Act default rules where applicable. (4) Consider the parties\' reasonable expectations at the time the Declaration was recorded. (5) Issue a formal written opinion the board can rely on. (6) If the provision is hopelessly ambiguous, recommend an amendment. (7) The attorney\'s opinion provides the board with a defensible basis for its interpretation — document it in the board resolution.',
           w:'Required when ambiguous provision has significant financial or legal consequence',ph:'resolve'},
          {s:'Attorney drafts amendment to address ambiguous or problematic language creating recurring disputes',t:'When disputes recur or ambiguity cannot be resolved by interpretation',d:'DC Code § 42-1903.08 & Declaration amendment procedures',
           desc:'When a governing document provision creates recurring interpretation disputes that cannot be resolved by interpretation alone, the attorney drafts an amendment to clarify or replace the problematic language.',
           detail:'The attorney will: (1) Draft the amendment language resolving the ambiguity. (2) Review the amendment process required by the Declaration and DC Code — typically 2/3 owner approval for Declaration amendments, possibly lower for bylaw amendments. (3) Prepare the notice to owners explaining the need for the amendment and proposed language. (4) After approval, record the amendment with the DC Recorder of Deeds (515 D St NW) for Declaration amendments. (5) Distribute the updated document to all owners. (6) Update resale certificate packages per DC Code § 42-1904.04.',
           w:'Required when recurring disputes stem from problematic governing document language',ph:'resolve'}
        ],
        notes:{
          'DC':'GOVERNING DOCUMENT HIERARCHY IN DC: (1) DC Condominium Act (DC Code § 42-1901 through § 42-1904) — supersedes conflicting provisions. (2) Declaration — filed with DC Recorder of Deeds, enforceable as equitable servitudes per § 42-1903.08. (3) Bylaws. (4) Board-adopted rules and resolutions. KEY SECTIONS: § 42-1903.04 (common elements), § 42-1903.08 (enforceability), § 42-1903.12 (collections), § 42-1903.13 (liens), § 42-1903.14 (records access), § 42-1904.04 (resale disclosures). Declaration amendments require recording with DC Recorder of Deeds (515 D St NW).',
          '_':'INTERPRETATION BEST PRACTICES: (1) Always check the document hierarchy — DC Code supersedes all. (2) Read provisions in context, not isolation. (3) Check for prior board interpretations and apply consistently. (4) Document interpretations as formal board resolutions. (5) When genuinely ambiguous, get an attorney opinion before adopting. (6) If a provision causes recurring disputes, amend it. (7) Inconsistent application is the #1 reason courts invalidate enforcement.'
        }
      },
      { id:'bylaw-amendment', title:'Bylaw / CC&R Amendment', desc:'Full amendment lifecycle under DC Condominium Act: drafting, notice, vote, recording',
        tags:['Amending bylaws','Amending Declaration','Updating rules','Recording amendments'],
        pre:[
          {s:'Identify need for amendment and determine which document to amend (Declaration, bylaws, or rules)',t:'1-2 months before target vote date',d:'DC Code § 42-1903.08 & Governing documents',
           desc:'Determine which document needs amending and what approval threshold applies. In DC, Declaration amendments require recording with the Recorder of Deeds; bylaw amendments may have a different (often lower) approval threshold.',
           detail:'Document hierarchy and amendment requirements: (1) DECLARATION amendments: typically require 2/3 (67%) owner approval per DC Code § 42-1903.10 and recording with the DC Recorder of Deeds (515 D St NW). These are the hardest to change. (2) BYLAW amendments: check bylaws for the specific threshold — some require 2/3 owner approval, others allow board adoption for certain provisions. (3) RULES AND REGULATIONS: typically adopted by board resolution under authority granted by the bylaws — no owner vote required unless bylaws specify otherwise. Choose the simplest document that achieves the goal — if a rule change will suffice, don\'t amend the Declaration.',
           ph:'investigate',ck:['Identify which document to amend','Determine approval threshold','Determine if recording is required','Consider if a rule change would suffice']},
          {s:'Draft proposed amendment language and review against DC Condominium Act requirements',t:'2-4 weeks',d:'DC Code § 42-1903.10 & Governing documents',
           desc:'Draft the amendment language and review it against the DC Condominium Act to ensure the proposed change does not conflict with statutory requirements. Engage an attorney for Declaration amendments.',
           detail:'Drafting considerations: (1) Draft clear, unambiguous language — the amendment should stand alone without needing interpretation. (2) Include a "purpose" statement explaining why the amendment is needed. (3) Review the DC Condominium Act (§ 42-1901 through § 42-1904) to ensure the amendment doesn\'t conflict with statutory requirements — conflicting provisions are unenforceable. (4) For Declaration amendments: the attorney should draft or at minimum review. (5) Consider how the amendment interacts with other provisions — does changing one section create conflicts elsewhere? (6) Include transitional provisions if needed (e.g., grandfather clauses for existing conditions).',
           ph:'investigate',ck:['Draft clear amendment language','Include purpose statement','Verify no conflict with DC Condominium Act','Check interaction with other provisions','Consider transitional provisions']},
          {s:'Attorney reviews amendment for legal sufficiency, statutory compliance, and recording requirements',t:'2-4 weeks',d:'DC Code § 42-1903.10 & DC Recorder of Deeds',
           desc:'Have an attorney review the proposed amendment for legal sufficiency, compliance with the DC Condominium Act, proper form for recording (if a Declaration amendment), and enforceability.',
           detail:'The attorney will: (1) Confirm the amendment does not conflict with DC Code § 42-1901 et seq. (2) Verify the amendment form meets DC Recorder of Deeds recording requirements (if a Declaration amendment). (3) Review the approval threshold and notice requirements in the current governing documents. (4) Confirm the amendment does not violate Fair Housing Act, DC Human Rights Act, or other federal/local laws. (5) Prepare the final document for owner review and vote. (6) For Declaration amendments, prepare the recording cover page and notary requirements.',
           ph:'investigate'},
          {s:'Send proposed amendment to all owners with explanation, redline comparison, and meeting/vote details',t:'30-60 days before vote per bylaws',d:'Bylaws: Amendment notice requirements & DC Code § 42-1903.10',
           desc:'Provide all owners with the proposed amendment, a plain-language explanation of the change, a redline comparison to current language, and the meeting date for the vote.',
           detail:'The notice package should include: (1) Cover letter explaining why the amendment is needed and what it changes. (2) Full text of the proposed amendment. (3) Redline comparison showing current language vs proposed language. (4) Date, time, and location of the meeting/vote. (5) Proxy/ballot form. (6) Voting threshold required for approval (typically 2/3 for Declaration amendments). (7) Deadline for returning proxies. Send via method required by bylaws (mail, email, or both) per the notice period specified.',
           ph:'act',ck:['Prepare cover letter with explanation','Include full text of amendment','Include redline comparison','Include meeting date and proxy form','State voting threshold','Send per bylaws notice requirements']},
          {s:'Hold meeting and conduct owner vote per bylaws and DC Code § 42-1903.10',t:'Per notice period',d:'DC Code § 42-1903.10 & Bylaws: Amendment section',
           desc:'Conduct the owner vote at a properly noticed meeting. Verify quorum, count proxies, conduct the vote, and certify results. For Declaration amendments, DC Code § 42-1903.10 applies.',
           detail:'Voting procedures: (1) Verify quorum (including proxies). (2) Present the proposed amendment and allow owner questions. (3) Conduct the vote — secret ballot recommended. (4) Count votes including proxies. (5) Announce results: amendment passes or fails. (6) Record detailed vote results in minutes: total votes for, against, abstaining, and total quorum. (7) If the amendment fails, consider: revising the proposal to address owner concerns and scheduling another vote. (8) Retain all ballots and proxies for 1 year per DC Code § 29-1135.13.',
           ph:'act',ck:['Verify quorum including proxies','Present amendment and allow questions','Conduct vote (secret ballot)','Count votes including proxies','Record detailed results in minutes','Retain ballots and proxies for 1 year']},
          {s:'Record approved Declaration amendment with the DC Recorder of Deeds',t:'Within 30 days of approval',d:'DC Code § 42-1903.10 & DC Recorder of Deeds',
           desc:'For Declaration amendments, record the approved amendment with the DC Recorder of Deeds (515 D Street NW). The amendment is not effective until recorded. Bylaw amendments do not require recording.',
           detail:'Recording requirements: (1) The amendment must be signed by the association\'s authorized officer per the bylaws. (2) Signature must be notarized. (3) Include a recording cover page per DC Recorder of Deeds requirements. (4) Recording fee varies — check current fee schedule. (5) After recording, obtain the recorded copy with the instrument number. (6) The amendment is effective upon recording (unless a later effective date is specified). (7) Bylaw amendments: do not require recording, but should be filed in association records and distributed to all owners.',
           ph:'resolve',ck:['Obtain authorized officer signature','Notarize signature','Prepare recording cover page','File at DC Recorder of Deeds (515 D St NW)','Obtain recorded copy with instrument number']},
          {s:'Distribute updated governing documents to all owners and update resale certificate packages',t:'Within 30 days of recording/adoption',d:'DC Code § 42-1903.14 & § 42-1904.04',
           desc:'Distribute the updated governing documents to all owners and update the resale certificate package to include the amendment. Owners have a right to current documents per DC Code § 42-1903.14.',
           detail:'Distribution: (1) Send the amendment to all owners via mail or email. (2) If producing a restated document (consolidated version with amendment incorporated), distribute that as well. (3) Update the resale certificate package per DC Code § 42-1904.04 — all current governing documents must be included. (4) Post to the association\'s website or portal if available. (5) File the original recorded amendment in the association\'s permanent records. (6) Notify the management company and any relevant vendors of changes that affect their services.',
           ph:'resolve',ck:['Send amendment to all owners','Update resale certificate package','Post to association website/portal','File original in permanent records','Notify management company of changes']}
        ],
        self:[
          {s:'Document vote results and analyze owner concerns when amendment fails to reach approval threshold',t:'Within 14 days of failed vote',d:'Bylaws: Amendment section',
           desc:'When an amendment vote fails, document the detailed vote results, analyze why owners voted against it, and prepare a revised proposal addressing their concerns.',
           detail:'Steps: (1) Record detailed vote results (for, against, abstaining, not voting). (2) Collect written feedback from owners who voted against. (3) Identify the primary objections — was it the substance of the amendment, the process, or lack of understanding? (4) Prepare a revised proposal addressing the concerns. (5) Schedule another vote with adequate notice. (6) Consider whether a town hall or information session before the next vote would increase support. (7) If the amendment is critical (e.g., needed for legal compliance), explain the consequences of not adopting.',
           w:'Required when amendment vote does not reach the approval threshold',ph:'resolve',
           ck:['Record detailed vote results','Collect owner feedback','Identify primary objections','Prepare revised proposal','Schedule follow-up vote']},
          {s:'Research DC Condominium Act requirements when considering amendments that affect owner rights or assessment methodology',t:'Before drafting',d:'DC Code § 42-1901 through § 42-1904',
           desc:'Before drafting amendments that affect owner rights (voting, access, use restrictions) or assessment methodology, research DC Condominium Act requirements to ensure compliance.',
           detail:'Key DC Code sections affecting amendments: (1) § 42-1903.04: Common element allocation cannot be changed without unanimous consent of affected owners. (2) § 42-1903.08: Declaration restrictions must be reasonable and not discriminatory. (3) § 42-1903.10: Amendment procedures and requirements. (4) § 42-1903.12: Assessment and fee authority. (5) Fair Housing Act and DC Human Rights Act: amendments cannot discriminate based on protected classes. (6) Some Declaration provisions may be "unamendable" without specific consent (e.g., percentage interest allocation).',
           ph:'investigate'},
          {s:'Adopt rule changes by board resolution when the bylaws grant the board rulemaking authority',t:'Per board meeting',d:'Bylaws: Rulemaking authority',
           desc:'When the needed change can be accomplished through a rule or regulation (rather than a Declaration or bylaw amendment), the board can adopt it by resolution under the rulemaking authority granted by the bylaws — no owner vote required.',
           detail:'(1) Confirm the bylaws grant the board authority to adopt rules on this subject. (2) Draft the rule in clear language. (3) Provide owner notice per bylaws (some require 30 days before a new rule takes effect). (4) Adopt by board vote at a meeting. (5) Distribute to all owners. (6) Rules cannot conflict with the Declaration, bylaws, or DC Condominium Act — they are subordinate to all three. (7) If the change truly requires a Declaration or bylaw amendment, a rule will not suffice and may be challenged.',
           ph:'act',ck:['Confirm bylaws grant rulemaking authority','Draft rule in clear language','Provide owner notice per bylaws','Adopt by board vote','Distribute to all owners']}
        ],
        legal:[
          {s:'Attorney drafts amendment language, reviews voting process, and prepares recording documents',t:'For any Declaration or significant bylaw amendment',d:'DC Code § 42-1903.10 & DC Recorder of Deeds',
           desc:'Engage an attorney for all Declaration amendments and significant bylaw amendments. The attorney drafts the amendment language, reviews the approval process, and prepares documents for recording.',
           detail:'The attorney will: (1) Draft amendment language that is clear, enforceable, and compliant with DC law. (2) Verify the amendment does not conflict with the DC Condominium Act, Fair Housing Act, or DC Human Rights Act. (3) Confirm the approval threshold per the current governing documents. (4) Review the notice to owners for adequacy. (5) Prepare the recording documents for Declaration amendments — proper form, notarization, recording cover page. (6) After approval, file the amendment with the DC Recorder of Deeds (515 D St NW). (7) Provide a legal opinion letter confirming the amendment was properly adopted.',
           w:'Attorney review recommended for any Declaration amendment and required for complex amendments',ph:'resolve'},
          {s:'Attorney advises on supermajority requirements, quorum challenges, and proxy solicitation for difficult amendments',t:'When approval is uncertain',d:'DC Code § 42-1903.10 & Bylaws',
           desc:'When achieving the required approval threshold is challenging (typically 2/3 for Declaration amendments), the attorney advises on proxy solicitation strategy, quorum requirements, and legal options.',
           detail:'The attorney will: (1) Review the specific approval threshold and whether proxies count toward quorum and voting. (2) Advise on proxy solicitation strategy — how to reach non-responsive owners. (3) Review whether the bylaws permit cumulative voting, electronic voting, or written ballot without meeting. (4) Some DC condos have obtained court orders reducing the amendment threshold when the current threshold is unreachable (e.g., developer-era provisions requiring 80-90% approval). (5) Advise on alternative approaches — can the goal be achieved through a bylaw amendment (lower threshold) or rule change (no owner vote)?',
           w:'Required when the approval threshold is difficult to reach — court petition may reduce threshold in some cases',ph:'resolve'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.10: Declaration amendments require recording with the DC Recorder of Deeds (515 D St NW). Typical approval threshold: 2/3 (67%) of all unit owners. Some provisions may require higher approval or unanimity (e.g., changing percentage interests). Bylaw amendments may have a lower threshold — check your specific bylaws. Recording fee varies. The amendment is not effective until recorded. § 42-1903.08: Declaration restrictions are enforceable as equitable servitudes. Fair Housing Act and DC Human Rights Act apply — amendments cannot discriminate.',
          '_':'AMENDMENT STRATEGY: (1) Choose the simplest document — rule change > bylaw amendment > Declaration amendment. (2) Attorney review recommended for all Declaration amendments. (3) Provide clear explanation to owners — people vote against what they don\'t understand. (4) Redline comparisons help owners see exactly what\'s changing. (5) If the first vote fails, revise the proposal and try again. (6) For unreachable thresholds, consult attorney about court petition. (7) Record Declaration amendments promptly — they\'re not effective until recorded.'
        }
      }
    ]
  },
  { id:'governance', num:'5', icon:'🗳️', label:'Governance', color:'violet',
    sits: [
      { id:'board-meetings', title:'Board Meetings', desc:'Agendas, executive sessions, member votes under DC open meeting requirements',
        tags:['Agendas','Executive sessions','Member votes','Open meetings','Minutes'],
        pre:[
          {s:'Prepare agenda and distribute meeting notice to all board members and owners per bylaws and DC Code § 29-1109.02',t:'5-10 days before meeting per bylaws',d:'Bylaws: Meeting notice & DC Code § 29-1109.02',
           desc:'Prepare the meeting agenda and distribute notice to all board members and unit owners per the bylaws notice requirements and DC Code § 29-1109.02. DC condominiums must generally allow owners to attend board meetings.',
           detail:'Notice requirements: (1) Check bylaws for the specific notice period (typically 5-10 days for regular meetings, 2-3 days for special meetings). (2) Notice should include: date, time, location, and agenda. (3) DC Code § 29-1109.02 governs meeting notice — meetings may be conducted in person, virtually, or hybrid if bylaws permit. (4) Under most DC bylaws, owners have the right to attend open sessions of board meetings. (5) Post notice in common areas and send via email/mail per bylaws. (6) The agenda should include: call to order, approval of prior minutes, financial report, old business, new business, owner comments, executive session (if needed), adjournment.',
           ph:'prepare',ck:['Check bylaws notice period','Include date, time, location, agenda','Post notice in common areas','Send notice to all owners','Include financial report on agenda']},
          {s:'Verify quorum before conducting any business',t:'At meeting start',d:'Bylaws: Quorum requirements',
           desc:'Before conducting any business, verify that a quorum of board members is present (typically a majority of the board). No valid actions can be taken without quorum.',
           detail:'(1) Check bylaws for the specific quorum requirement (typically majority of board members — e.g., 3 of 5, or 4 of 7). (2) Count board members present in person and via video/phone if bylaws permit remote participation. (3) If quorum is not met, the meeting cannot transact any business — the presiding officer should adjourn and reschedule. (4) Record the quorum count in the minutes. (5) If a board member leaves mid-meeting and quorum is lost, immediately stop business and either wait for the member to return or adjourn.',
           ph:'execute'},
          {s:'Conduct meeting per adopted procedures; allow owner comment period',t:'During meeting',d:'Bylaws & Roberts Rules of Order (if adopted)',
           desc:'Conduct the meeting following the bylaws\' prescribed procedures (typically Robert\'s Rules of Order). Include an owner comment period where owners may address the board on agenda or other items.',
           detail:'Meeting conduct: (1) Follow the agenda in order. (2) All motions require a second before discussion. (3) Board members vote by voice or show of hands — record each vote in minutes. (4) Allow an owner comment period (typically 2-3 minutes per person). (5) For executive session: announce the reason per bylaws (typically: personnel, litigation, contract negotiation, or delinquent owner accounts), ask non-board members to leave, and return to open session to announce any actions taken. (6) No official actions should be taken in executive session except to return to open session.',
           ph:'execute',ck:['Follow agenda in order','All motions require a second','Record each vote in minutes','Allow owner comment period','Announce reason before entering executive session']},
          {s:'Record detailed minutes and distribute to board for review within 7 days',t:'Within 7 days of meeting',d:'Bylaws: Secretary duties',
           desc:'The secretary (or designee) records detailed minutes of all actions taken, motions, votes, and key discussion points. Distribute draft minutes to all board members for review before the next meeting.',
           detail:'Minutes should include: (1) Date, time, location. (2) Board members present and absent. (3) Quorum verified. (4) Approval of prior meeting minutes. (5) Every motion: who made it, who seconded, vote result (for/against/abstain by name). (6) Financial report summary. (7) Key discussion points on each agenda item. (8) Action items assigned with responsible party and deadline. (9) Executive session: state only that the board entered executive session and the general topic — details are confidential. (10) Time of adjournment. Do NOT include personal opinions, extended debate details, or owner names for delinquent account discussions.',
           ph:'followup',ck:['Record date, time, attendees','Document every motion with vote result','Summarize financial report','List action items with deadlines','Note executive session topic only','Distribute to board within 7 days']},
          {s:'Approve minutes at next meeting and post to community records per DC Code § 42-1903.14',t:'After board approval at next meeting',d:'DC Code § 42-1903.14',
           desc:'Board approves minutes at the next meeting (with any corrections). Post approved minutes to the community portal or make available to owners per DC Code § 42-1903.14 — owners have a right to inspect association records.',
           detail:'Steps: (1) Board reviews draft minutes at the next meeting and approves with any corrections. (2) Secretary signs the approved minutes. (3) Post to the community portal or website. (4) File in the association\'s permanent records. (5) Under DC Code § 42-1903.14, owners may request copies of minutes — the association must provide within 5 business days of written request. (6) Retain meeting minutes indefinitely — they are the official record of board actions.',
           ph:'followup'}
        ],
        self:[
          {s:'Adjourn and reschedule meeting per bylaws when quorum is not met',t:'Immediately',d:'Bylaws: Quorum requirements',
           desc:'When quorum is not met, the presiding officer adjourns the meeting and reschedules per the bylaws. No business can be conducted without quorum.',
           detail:'Steps: (1) Announce that quorum is not met and the meeting is adjourned. (2) Some bylaws allow the members present to fix a new date without further notice. (3) If the bylaws do not address adjourned meetings, re-notice per the standard meeting notice period. (4) Record the adjournment and lack of quorum in a brief minute entry. (5) If quorum is chronically difficult to achieve, consider: allowing remote participation (amend bylaws if needed), scheduling at more convenient times, or reducing the board size.',
           w:'Required when attendance does not reach quorum threshold',ph:'execute'},
          {s:'Respond to owner requests to inspect meeting minutes per DC Code § 42-1903.14',t:'Within 5 business days of written request',d:'DC Code § 42-1903.14',
           desc:'Owners have a statutory right to inspect meeting minutes under DC Code § 42-1903.14. Respond to written requests within 5 business days.',
           detail:'(1) Provide copies of all approved meeting minutes requested. (2) May charge reasonable copying costs. (3) Executive session minutes (if any are kept) are generally confidential — consult attorney before releasing. (4) If minutes are routinely posted to a community portal, point the owner to the portal. (5) Failure to provide records within 5 business days allows the owner to petition DC Superior Court, and the prevailing owner recovers attorney fees per § 42-1903.14(c).',
           ph:'followup'},
          {s:'Maintain a register of all board resolutions for consistent reference',t:'Ongoing',d:'Best practice',
           desc:'Maintain a separate resolution register (in addition to minutes) cataloging every board resolution with its date, topic, and outcome. This prevents inconsistent decisions and facilitates governing document interpretation.',
           detail:'Resolution register should include: (1) Resolution number or date. (2) Topic. (3) Summary of the resolution. (4) Vote result. (5) Cross-reference to meeting minutes. This is invaluable when interpreting governing documents (see governing-docs workflow) and ensuring consistent enforcement.',
           ph:'followup'}
        ],
        legal:[
          {s:'Attorney advises on executive session requirements and what topics qualify under DC law and bylaws',t:'Before entering executive session or when challenged',d:'Bylaws: Executive session & DC Code § 29-1109.02',
           desc:'Executive sessions are limited to specific topics. The attorney advises on which matters qualify for executive session and how to properly enter and exit.',
           detail:'Generally permissible executive session topics: (1) Personnel matters (hiring, firing, performance evaluation of employees or management company). (2) Pending or anticipated litigation. (3) Contract negotiation. (4) Delinquent owner accounts (to protect owner privacy). (5) Attorney-client communications. NOT permissible: (6) General budget discussion. (7) Architectural review decisions. (8) Rule adoption. (9) Any topic that doesn\'t fall in the permitted categories. Procedure: announce the topic, ask non-board members to leave, conduct discussion, return to open session, announce any action taken in open session. Board votes should generally occur in open session.',
           w:'Required for personnel, litigation, or contract matters — executive session is limited to specific topics',ph:'execute'},
          {s:'Attorney advises on board member removal, resignation, and vacancy-filling procedures',t:'When vacancy occurs or removal is sought',d:'Bylaws: Vacancy/removal provisions & DC Code § 29-1108.08',
           desc:'When a board member resigns, is removed, or a vacancy otherwise occurs, the attorney advises on proper procedures under the bylaws and DC Code § 29-1108.08.',
           detail:'The attorney will: (1) Review bylaws for vacancy-filling procedures — most allow the remaining board to appoint until the next election. (2) If removal is sought: review bylaws for removal procedures and voting threshold (typically 2/3 of owners). (3) DC Code § 29-1108.08 governs removal of directors. (4) Confirm that the reduced board still has quorum to conduct business. (5) Advise on special election requirements if the bylaws require one.',
           w:'Required when board vacancy or removal situation arises',ph:'followup'}
        ],
        notes:{
          'DC':'DC Code § 29-1109.02: Meeting notice requirements. Owners generally have the right to attend open sessions of board meetings. Executive sessions limited to: personnel, litigation, contracts, delinquent accounts. § 29-1108.08: Director removal. § 42-1903.14: Owners may inspect minutes within 5 business days — prevailing owner recovers attorney fees if association fails to comply. Minutes are permanent records — retain indefinitely.',
          '_':'BOARD MEETING BEST PRACTICES: (1) Always distribute agenda with notice. (2) Verify quorum before any business. (3) Record every motion and vote by name. (4) Allow an owner comment period. (5) Use executive session only for permitted topics. (6) Post approved minutes promptly. (7) Maintain a resolution register. (8) Minutes are the official record — accuracy matters.'
        }
      },
      { id:'elections', title:'Elections', desc:'Board elections, nominations, voting, challenges under DC Code',
        tags:['Annual elections','Candidate disputes','Ballot challenges','Nominations','Proxy voting'],
        pre:[
          {s:'Send election notice with nomination procedures, eligibility requirements, and candidate statement guidelines',t:'60-75 days before election per bylaws',d:'Bylaws: Election section & DC Code § 29-1109.02',
           desc:'Distribute a Call for Candidates notice to all owners with the nomination process, eligibility requirements (typically owner in good standing — current on assessments), number of open seats, term length, and deadline for candidacy.',
           detail:'The notice should include: (1) Number of open seats and term length. (2) Eligibility requirements — most bylaws require the candidate to be a unit owner in good standing (current on assessments). (3) Nomination deadline. (4) How to submit candidacy (written application or nomination form). (5) Candidate statement guidelines (length, format). (6) Election date, time, and method (in-person, mail-in, electronic if bylaws permit). Send per bylaws notice method. DC Code § 29-1109.02(a) governs meeting notice — typically 10-60 days.',
           ph:'prepare',ck:['State number of open seats and term length','List eligibility requirements','Set nomination deadline','Include candidate statement guidelines','State election date and method']},
          {s:'Close nominations, verify candidate eligibility, and prepare ballot per DC Code § 29-1135.09',t:'45 days before election',d:'Bylaws: Candidate eligibility & DC Code § 29-1135.09',
           desc:'After the nomination deadline, verify each candidate is a unit owner in good standing, prepare the secret ballot per DC Code § 29-1135.09, and distribute candidate statements.',
           detail:'Steps: (1) Verify each candidate is a record owner (check Declaration/deed). (2) Verify each candidate is in good standing — no delinquent assessments. (3) Prepare secret ballot per DC Code § 29-1135.09 — list candidates in random or alphabetical order. (4) Include candidate statements with the ballot. (5) If the number of candidates equals the number of seats, some bylaws allow election by acclamation without a ballot. (6) If no candidates are nominated, the board may need to recruit or serve holdover per bylaws.',
           ph:'prepare',ck:['Verify each candidate is a record owner','Verify each candidate is current on assessments','Prepare secret ballot','Include candidate statements','Distribute ballots per bylaws']},
          {s:'Appoint independent election inspector or committee per bylaws',t:'14-21 days before election',d:'Bylaws: Election section',
           desc:'Appoint an independent election inspector who is not a candidate, current board member, or immediate family member of a candidate. The inspector is responsible for credential verification, ballot counting, and result certification.',
           detail:'Inspector responsibilities: (1) Verify voter credentials (only record owners may vote). (2) Verify proxy forms are signed by record owners. (3) Count proxies toward quorum. (4) Distribute and collect ballots. (5) Count ballots (two independent counts recommended). (6) Certify results. The inspector adds credibility to the process and is particularly important when elections are expected to be close or contested. Consider using the association\'s accountant, attorney, or a professional inspector.',
           w:'Required when bylaws mandate an independent inspector — recommended for all elections',ph:'prepare'},
          {s:'Conduct election per governing docs: verify quorum, distribute ballots, count votes, announce results',t:'At annual meeting',d:'Bylaws: Election section & DC Code § 29-1135.09',
           desc:'Conduct the election per the bylaws and DC Code § 29-1135.09 (secret ballot). Verify quorum, distribute ballots, allow voting, count votes (two independent counts), and announce results.',
           detail:'Election procedure: (1) Verify quorum (including proxies). (2) Inspector or secretary distributes ballots to eligible voters. (3) Allow adequate time for voting. (4) Inspector collects and counts ballots — two independent counts recommended. (5) Inspector certifies results. (6) Presiding officer announces results. (7) If a tie exists, follow bylaws tie-breaking procedure (often a runoff). (8) Record results in meeting minutes including total votes cast, votes per candidate, and quorum count.',
           ph:'execute',ck:['Verify quorum including proxies','Distribute ballots to eligible voters','Allow adequate voting time','Conduct two independent ballot counts','Inspector certifies results','Announce results','Record in minutes']},
          {s:'Certify election results, announce new board members, and retain ballots for 1 year per DC Code § 29-1135.13',t:'At meeting or within 3 days',d:'DC Code § 29-1135.13 & Bylaws',
           desc:'Inspector certifies results. Announce new board members. Retain all ballots and proxy forms for 1 year per DC Code § 29-1135.13. The new board holds an organizational meeting to elect officers.',
           detail:'Post-election: (1) Inspector signs certification of results. (2) Announce winners and thank all candidates. (3) Retain all ballots, proxies, and election materials for 1 year per DC Code § 29-1135.13. (4) New board holds organizational meeting to elect officers (President, VP, Secretary, Treasurer) — typically immediately after the annual meeting or within 10 days. (5) File updated officer information with DLCP if required. (6) Provide new board members with a governance packet (governing documents, financial reports, prior minutes, pending issues).',
           ph:'followup',ck:['Inspector signs certification','Retain ballots for 1 year per DC Code § 29-1135.13','Hold organizational meeting to elect officers','File updated officer info with DLCP','Provide governance packet to new members']}
        ],
        self:[
          {s:'Preserve all ballots, proxies, and election materials when results are challenged',t:'Immediately upon challenge',d:'DC Code § 29-1135.13',
           desc:'When an owner formally challenges the election results, immediately preserve all ballots, proxies, voter sign-in sheets, and election materials. These are the evidence for any review or court proceeding.',
           detail:'Steps: (1) Seal all ballots and proxies in a secure container. (2) Document the chain of custody (who has the materials and where they are stored). (3) Review the bylaws dispute/challenge procedures — some provide for a recount or internal review. (4) If the challenge has merit (procedural error, miscounted votes), consider: voluntary recount with the challenger present, or new election if the error affected the outcome. (5) If the challenge is meritless, respond in writing citing the procedures followed and the certified results. (6) Retain all materials for 1 year per DC Code § 29-1135.13.',
           w:'Required when an owner formally challenges election results — preserve all materials immediately',ph:'followup',
           ck:['Seal all ballots and proxies','Document chain of custody','Review bylaws challenge procedures','Offer recount if challenge has merit','Retain all materials for 1 year']},
          {s:'Recruit board candidates when insufficient nominations are received',t:'Before nomination deadline',d:'Bylaws: Board composition',
           desc:'When insufficient nominations are received to fill open seats, actively recruit candidates from the ownership. If seats remain unfilled after the election, the board may have holdover authority per the bylaws.',
           detail:'Recruitment strategies: (1) Send a targeted appeal to owners explaining the importance of board service. (2) Reach out personally to engaged owners who attend meetings or committee events. (3) Describe the time commitment realistically (typically 5-10 hours/month). (4) If seats remain unfilled after the election: check bylaws for holdover provisions (current members may serve until a successor is elected) or appointment authority (board may appoint to fill vacancies). (5) Consider forming committees as a stepping stone — committee participation helps owners understand governance before joining the board.',
           ph:'prepare'},
          {s:'Conduct organizational meeting after election: elect officers (President, VP, Secretary, Treasurer)',t:'Within 10 days of election',d:'Bylaws: Officer election',
           desc:'After the annual election, the new board holds an organizational meeting to elect officers from among the board members. This is typically the first action of the new board.',
           detail:'Organizational meeting: (1) Outgoing president calls the meeting to order. (2) New board elects officers by vote among board members. (3) Typical officers: President (presides at meetings), Vice President (acts in president\'s absence), Secretary (minutes, records), Treasurer (financial oversight). (4) Some bylaws permit one person to hold multiple offices. (5) Record the officer election results in minutes. (6) Update bank signature cards, insurance contacts, and DLCP officer records.',
           ph:'followup',ck:['Elect President','Elect Vice President','Elect Secretary','Elect Treasurer','Update bank signature cards','Update DLCP officer records']}
        ],
        legal:[
          {s:'Attorney advises on election disputes, procedural challenges, or candidate eligibility questions',t:'Upon dispute or challenge',d:'Bylaws: Election section & DC Code § 29-1135.09',
           desc:'When an election is disputed — contested results, procedural challenges, or candidate eligibility questions — engage an attorney to review the process and advise on resolution.',
           detail:'The attorney will: (1) Review the election procedures followed against the bylaws requirements. (2) Assess whether any procedural error affected the outcome. (3) If the error is curable (e.g., miscounted votes), advise on a recount or cure procedure. (4) If the error is fundamental (e.g., improper notice, eligible voters excluded), advise on whether a new election is required. (5) If an owner files suit challenging the election, defend the board\'s actions in DC Superior Court. (6) Advise on the cost-benefit of contesting vs conducting a new election — sometimes a new election is cheaper and faster than litigation.',
           w:'Required when an election is contested or procedural challenge is filed',ph:'followup'},
          {s:'Attorney reviews proxy forms and voting procedures for compliance with DC Code § 29-1135.10',t:'Before election or upon challenge',d:'DC Code § 29-1135.10 & Bylaws',
           desc:'The attorney reviews the association\'s proxy forms and voting procedures to ensure compliance with DC Code § 29-1135.10, which governs proxy voting in condominiums.',
           detail:'The attorney will: (1) Review the proxy form for compliance with § 29-1135.10 — proxies must be in writing, signed by the record owner, and designate the proxy holder. (2) Determine whether the proxy is general (grants authority on all matters) or limited (specific to certain votes). (3) Review the bylaws for proxy limitations (some limit duration, require proxies to be filed in advance, or limit the number of proxies one person can hold). (4) Confirm that proxies are properly counted toward quorum and voting. (5) Advise on electronic voting and mail-in ballot procedures if the bylaws permit.',
           w:'Required for election proxy review — improper proxies can invalidate election results',ph:'prepare'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.09: Secret ballot required for board elections. § 29-1135.10: Proxy voting requirements. § 29-1135.13: Retain ballots for 1 year. § 29-1109.02(a): Meeting notice requirements (10-60 days). § 29-1108.08: Director removal. ELECTIONS BEST PRACTICE: Follow bylaws exactly. Appoint an independent inspector. Use secret ballots. Retain all materials for 1 year. When in doubt, err on the side of more process — contested elections are expensive.',
          '_':'ELECTION BEST PRACTICES: (1) Follow bylaws procedures exactly — procedural errors are the #1 basis for challenges. (2) Use secret ballots per DC Code. (3) Appoint an independent inspector. (4) Verify candidate eligibility before the ballot. (5) Conduct two independent ballot counts. (6) Retain all materials for 1 year. (7) Hold organizational meeting promptly after election.'
        }
      },
      { id:'annual-meeting-planning', title:'Annual Meeting Planning', desc:'End-to-end planning for the annual owners meeting',
        tags:['Annual meeting','Owner meeting','Elections','Budget ratification','Proxy forms'],
        pre:[
          {s:'Set annual meeting date and reserve venue/virtual platform',t:'90 days before meeting',d:'DC Code § 29-1109.02',detail:'DC requires annual meeting within 13 months of prior. Confirm date does not conflict with holidays. Book venue with capacity for quorum attendance.',ph:'prepare'},
          {s:'Review bylaws for quorum requirements, notice periods, and election procedures',t:'90 days out',d:'Bylaws: Annual meeting section',detail:'DC typical quorum: 33-40% of units. Notice window: 10-60 days per DC Code § 29-1109.02(a). Identify number of board seats up for election.',ph:'prepare',ck:['Check quorum threshold','Confirm notice period window','Identify number of board seats up for election']},
          {s:'Open nominations for board seats; distribute Call for Candidates notice',t:'60-75 days out',d:'Bylaws: Election section',detail:'Use the Election — Call for Candidates letter template. Include: number of open seats, term length, eligibility requirements (owner in good standing), candidacy deadline, candidate statement guidelines.',ph:'prepare'},
          {s:'Finalize proposed budget for owner ratification; prepare annual financial report',t:'60 days out',d:'DC Code § 29-1135.02',detail:'Budget should be board-adopted before presenting to owners. Include: income projections, operating expenses, reserve contribution, assessment rate changes. Prepare year-end financial summary or audited statements.',ph:'prepare',ck:['Finalize proposed budget','Prepare income projections','Prepare year-end financial summary']},
          {s:'Prepare reserve fund status report for owner presentation',t:'45 days out',d:'DC Code § 42-1903.13',detail:'Include: current reserve balance, funding plan, percent funded, upcoming major expenditures. Reference most recent reserve study.',ph:'prepare',ck:['Report current reserve balance','Summarize funding plan','Calculate percent funded','List upcoming major expenditures']},
          {s:'Close nominations; verify candidate eligibility; prepare ballot',t:'45 days out',d:'Bylaws: Candidate eligibility',detail:'Verify each candidate is a unit owner in good standing (current on assessments). Prepare secret ballot per DC Code § 29-1135.09. Include candidate statements.',ph:'prepare',ck:['Close nominations','Verify each candidate is owner in good standing','Prepare secret ballot','Collect candidate statements']},
          {s:'Send formal Annual Meeting Notice to all owners with agenda, proxy forms, and candidate statements',t:'30-60 days out (per bylaws)',d:'DC Code § 29-1109.02(a)',detail:'Use the Annual Meeting Notice letter template. Must include: date, time, location, full agenda, proxy/ballot form, candidate statements. Send via method required by bylaws (mail, email, or both). Retain proof of delivery.',ph:'prepare',ck:['Prepare meeting notice with date, time, location','Attach full agenda','Include proxy/ballot form','Include candidate statements','Send via required method','Retain proof of delivery']},
          {s:'Appoint independent election inspector or committee',t:'14-21 days out',d:'Best practice',detail:'Inspector should not be a candidate or current board member. Responsible for credential verification, ballot counting, and result certification.',ph:'prepare'},
          {s:'Prepare meeting materials: agenda packets, sign-in sheets, proxy collection, reserve report, budget summary',t:'7-14 days out',detail:'Print sufficient copies. Prepare presentation slides if applicable. Test virtual platform if hybrid meeting. Confirm AV equipment at venue.',ph:'prepare',ck:['Print agenda packets','Prepare sign-in sheets','Organize proxy collection materials','Print reserve report','Print budget summary','Test virtual platform if hybrid']},
          {s:'Collect and verify proxy forms received before meeting',t:'Before meeting',d:'DC Code § 29-1135.10',detail:'Verify each proxy is signed by a record owner. Confirm proxy holder is authorized. Count proxies toward quorum. Maintain all proxy forms for 1 year minimum.',ph:'execute',ck:['Verify each proxy is signed by record owner','Confirm proxy holder is authorized','Count proxies toward quorum']},
          {s:'Conduct annual meeting: verify quorum, approve prior minutes, present financials, conduct election, ratify budget, owner Q&A',t:'Meeting day',d:'Bylaws & Roberts Rules',detail:'Suggested order: (1) Call to order, (2) Quorum verification, (3) Approve prior annual meeting minutes, (4) President\'s report, (5) Financial report & budget ratification, (6) Reserve fund update, (7) Board election, (8) Committee reports, (9) Old business, (10) New business & owner forum, (11) Adjournment.',ph:'execute',ck:['Verify quorum','Approve prior meeting minutes','Present financial report','Conduct board election','Ratify budget','Conduct owner Q&A']},
          {s:'Certify election results; announce new board members',t:'At meeting or within 3 days',d:'Bylaws: Election certification',detail:'Inspector certifies results. Announce winners. Retain all ballots for 1 year per DC Code § 29-1135.13.',ph:'followup'},
          {s:'Distribute meeting minutes to all owners; file updated officer information',t:'Within 14 days',d:'DC Code § 29-1108.06',detail:'Minutes should include: attendance/quorum count, election results, budget ratification vote, all motions and votes, owner comments. File any required officer/agent updates with DLCP.',ph:'followup',ck:['Draft meeting minutes','Include attendance and quorum count','Include election results','Include all motions and votes','Distribute to all owners','File officer/agent updates with DLCP']}
        ],
        self:[
          {s:'Adjourn and reconvene per bylaws when quorum is not met',detail:'Many bylaws allow reduced quorum at adjourned meeting. Check your specific provisions.',w:'Required when attendance does not reach quorum threshold'},
          {s:'Preserve all ballots and proxy forms; review bylaws dispute procedures for contested elections',w:'Required when an owner formally contests election results'},
          {s:'Re-present revised budget at a special meeting when owner ratification fails',w:'Required when owners reject the proposed budget at annual meeting'},
          {s:'Post-meeting: new board holds organizational meeting to elect officers (President, VP, Secretary, Treasurer)',detail:'Typically held immediately after annual meeting or within 10 days.'}
        ],
        legal:[
          {s:'Attorney reviews annual meeting notice and proxy forms for statutory compliance',w:'Annual review or first meeting after bylaw changes'},
          {s:'Attorney advises on quorum challenges or contested elections',w:'Quorum dispute or candidate challenge'},
          {s:'Attorney reviews budget ratification for assessment increase exceeding owner approval threshold',w:'Assessment increase > 10-15% or per bylaws'}
        ],
        notes:{
          'DC':'DC Code § 29-1109.02: Annual meeting required within 13 months of prior. Notice: 10-60 days per § 29-1109.02(a). Quorum per bylaws (typically 33-40%). Secret ballot for elections per § 29-1135.09. Proxy voting per § 29-1135.10. Budget notice 30 days per § 29-1135.02. Retain ballots 1 year per § 29-1135.13. If 20%+ of owners petition and board fails to call meeting, owners may call it themselves per § 29-1108.01.',
          '_':'Annual meeting is the primary owner governance event. Includes board elections, budget ratification, financial reporting, and owner Q&A. Check bylaws for quorum, notice periods, and election procedures. Most states require annual meeting within 13 months of prior.'
        }
      },
      { id:'board-action-item', title:'Board Action Items', desc:'Tracking board meeting actions, assignments, and fiduciary follow-through',
        tags:['Board meeting follow-ups','Action item tracking','Task assignments','Fiduciary duty'],
        pre:[
          {s:'Document action item with specific deliverable, context, and success criteria during the meeting',t:'During board meeting',d:'Bylaws: Board duties & DC Code § 29-1108.01',
           desc:'During the board meeting, clearly document each action item with a specific deliverable, the context for why it\'s needed, and what constitutes completion. Vague action items don\'t get completed.',
           detail:'Each action item should include: (1) A specific, measurable deliverable (not "look into X" but "obtain 3 bids for roof repair"). (2) Context: why was this action item created? What board discussion led to it? (3) Success criteria: what does "done" look like? (4) Reference to the motion or discussion that generated it. (5) Record the action item in the meeting minutes. Under DC Code § 29-1108.01, board members have a fiduciary duty of care — failing to follow through on action items is a governance risk.',
           ph:'prepare',ck:['State specific deliverable','Include context for the action','Define success criteria','Record in meeting minutes']},
          {s:'Assign responsibility to a specific board member or manager with clear accountability',t:'During meeting',d:'Bylaws: Officer duties',
           desc:'Assign each action item to a specific individual (not "the board" or "someone"). The assignee is accountable for completing the item or reporting obstacles at the next meeting.',
           detail:'Assignment best practices: (1) Assign to one person — shared ownership is no ownership. (2) Choose the appropriate person: operational items → property manager; financial items → treasurer; legal items → president or attorney; maintenance items → maintenance committee chair. (3) The assignee can delegate execution but retains accountability for reporting status. (4) Record the assignee\'s name in the minutes.',
           ph:'prepare'},
          {s:'Set specific due date and milestone checkpoints for complex items',t:'During meeting',d:'Fiduciary duty of care',
           desc:'Set a specific due date for each action item. For complex items, set intermediate milestone dates to ensure progress and early identification of obstacles.',
           detail:'Timeline guidelines: (1) Simple tasks (obtain a document, make a call): 1-2 weeks. (2) Moderate tasks (obtain bids, draft a policy): 2-4 weeks. (3) Complex tasks (vendor selection, budget analysis, legal review): 4-8 weeks with milestones. (4) Do not set unrealistic deadlines — it\'s better to set a reasonable date and meet it. (5) For items tied to external deadlines (regulatory filings, insurance renewals, annual meeting), work backward from the fixed date.',
           ph:'prepare'},
          {s:'Execute the assigned task per scope and timeline',t:'Per assigned timeline',d:'Board resolution or meeting minutes',
           desc:'The assignee executes the task per the agreed scope and timeline. If obstacles arise, communicate to the board immediately rather than waiting for the next meeting.',
           detail:'Execution tips: (1) Start early — don\'t wait until the deadline approaches. (2) If you encounter obstacles (need more information, vendor unresponsive, legal question), communicate to the board president or secretary immediately. (3) If the scope changes or the timeline needs adjustment, bring it to the board for discussion rather than unilaterally changing. (4) Keep a file of all documents, correspondence, and work product related to the action item. (5) For items involving expenditures, follow the spending authority process per bylaws.',
           ph:'execute'},
          {s:'Report completion status at next board meeting with deliverables or explanation of obstacles',t:'Next board meeting',d:'Fiduciary duty & Meeting minutes',
           desc:'At each board meeting, every open action item is reviewed. The assignee reports: completed (with deliverables), in progress (with update), or delayed (with explanation and revised timeline).',
           detail:'Status report format: (1) COMPLETED: describe what was done, present deliverables, and request board acceptance or next steps. (2) IN PROGRESS: describe progress to date, anticipated completion, any obstacles. (3) DELAYED: explain why, present obstacles, propose revised timeline or reassignment. (4) The board should discuss and decide on each delayed item — reassign, adjust scope, or adjust timeline. (5) Chronically delayed items should be escalated — they represent unresolved governance obligations.',
           ph:'followup',ck:['Report status of each open action item','Present deliverables for completed items','Explain delays with revised timelines','Board discusses and decides on delayed items']},
          {s:'Record completion or status update in meeting minutes and close completed items',t:'At board meeting',d:'Meeting minutes',
           desc:'Record the status of each action item in the meeting minutes. Close completed items and carry forward open items to the next meeting\'s agenda.',
           detail:'(1) Minutes should reflect the status reported for each item. (2) Completed items are closed with a note of the outcome. (3) Open items carry forward to the next meeting\'s action item review. (4) Maintain a running action item log (spreadsheet or task tracker) separate from minutes for easy reference between meetings. (5) The action item log should be distributed with each meeting agenda so board members can prepare status updates.',
           ph:'followup'}
        ],
        self:[
          {s:'Reassign or adjust timeline at next meeting when assignee cannot complete the action item',t:'Next board meeting',d:'Board meeting procedures',
           desc:'When the assigned person cannot meet the deadline due to obstacles, workload, or changed circumstances, bring the item back to the board for reassignment or timeline adjustment.',
           detail:'Steps: (1) Assignee notifies the board president or secretary as soon as it\'s clear the deadline won\'t be met. (2) At the next meeting, the board discusses and decides: reassign to another person, extend the deadline with a new date, adjust the scope, or escalate. (3) Record the reassignment or adjustment in minutes. (4) Chronically delayed items should trigger a discussion about whether the item is still a priority and whether additional resources (attorney, consultant, management company) are needed.',
           w:'Required when the assigned person cannot meet the deadline',ph:'followup',
           ck:['Notify board of inability to complete','Discuss at next meeting','Reassign or set new deadline','Record decision in minutes']},
          {s:'Escalate unresolved action items that impact fiduciary obligations or regulatory deadlines',t:'Immediately when deadline risk is identified',d:'DC Code § 29-1108.01 & Regulatory requirements',
           desc:'When an unresolved action item threatens a fiduciary obligation or regulatory deadline (insurance renewal, filing deadline, safety inspection), escalate immediately rather than waiting for the next meeting.',
           detail:'Fiduciary-critical action items include: (1) Insurance renewal deadlines. (2) Regulatory filings (DLCP Biennial Report, tax filings). (3) Safety inspections (fire, elevator, boiler). (4) Legal response deadlines (lawsuit responses, FOIA requests). (5) Collection actions (demand letters, lien recordings). If these are at risk of being missed, the board president should call a special meeting or authorize emergency action per bylaws.',
           w:'Required when unresolved items threaten fiduciary obligations or regulatory deadlines',ph:'followup'}
        ],
        legal:[
          {s:'Attorney reviews action items with legal implications before execution',t:'Before execution',d:'DC Code § 29-1108.01',
           desc:'When an action item involves contracts, disputes, regulatory compliance, or other legal matters, have the attorney review the approach before the assignee executes.',
           detail:'The attorney should review action items involving: (1) Contract execution or termination. (2) Demand letters or collection actions. (3) Regulatory filings or compliance responses. (4) Insurance claims or coverage decisions. (5) Governing document interpretations. (6) Owner disputes or violation enforcement. (7) Any action that could create legal liability for the association or individual board members.',
           w:'Required when action item involves contracts, disputes, or regulatory matters',ph:'execute'}
        ],
        notes:{
          'DC':'DC Code § 29-1108.01: Board members have a fiduciary duty of care — failing to follow through on action items, especially those involving safety, compliance, or financial obligations, is a governance risk. Track all items with clear ownership and deadlines. Report status at every meeting.',
          '_':'ACTION ITEM BEST PRACTICES: (1) Be specific — "obtain 3 bids" not "look into options." (2) Assign to one person. (3) Set a real deadline. (4) Review every open item at every meeting. (5) Escalate chronic delays. (6) Maintain a running log separate from minutes. (7) Items involving legal, financial, or safety matters are fiduciary obligations — treat them with urgency.'
        }
      },
      { id:'policy-update', title:'Policy Updates', desc:'Adopting and updating association policies, rules, and procedures under DC law',
        tags:['Policy revisions','Document updates','Rule changes','Board resolutions'],
        pre:[
          {s:'Identify need for policy update; confirm board has rulemaking authority per bylaws',t:'1-2 weeks',d:'Bylaws: Rulemaking authority & DC Code § 42-1903.08',
           desc:'Identify the specific need for the policy change and confirm the bylaws grant the board authority to adopt rules on this subject. Rules must be consistent with the Declaration, bylaws, and DC Condominium Act.',
           detail:'Steps: (1) Identify the problem the policy addresses. (2) Review bylaws for rulemaking authority — the board can typically adopt rules on: common area use, parking, pets, noise, move-in/out procedures, amenities, architectural standards, and collection procedures. (3) Confirm the rule doesn\'t conflict with the Declaration or DC Condominium Act. (4) If the needed change requires a Declaration or bylaw amendment, the board cannot accomplish it through a rule. (5) Gather input from owners, management, and committees who will be affected.',
           ph:'prepare',ck:['Identify need for change','Confirm bylaws grant rulemaking authority','Check for conflicts with Declaration and DC Code','Gather input from affected parties']},
          {s:'Draft updated policy language — clear, enforceable, and consistent with governing documents',t:'2-4 weeks',d:'Bylaws & DC Code § 42-1903.08',
           desc:'Draft the policy in clear, enforceable language. The policy should state: what is required or prohibited, who it applies to, how it will be enforced, and the effective date.',
           detail:'Drafting checklist: (1) State the rule clearly — avoid ambiguity. (2) State who it applies to (owners, residents, guests, tenants). (3) State enforcement mechanism and penalties (reference the fine schedule). (4) Include an effective date — give owners time to comply. (5) Consider grandfather provisions for existing conditions. (6) Review comparable policies from similar DC condominiums. (7) Ensure the policy does not discriminate based on protected classes under Fair Housing Act or DC Human Rights Act.',
           ph:'prepare',ck:['State rule clearly','Define who it applies to','State enforcement and penalties','Set effective date','Consider grandfather provisions','Check for discrimination issues']},
          {s:'Attorney reviews proposed policy for legal compliance with DC Code and Fair Housing Act',t:'1-2 weeks',d:'DC Code § 42-1903.08 & Fair Housing Act',
           desc:'Have an attorney review any policy that affects owner rights, restricts use, or has enforcement implications. The review should confirm compliance with DC Condominium Act, Fair Housing Act, and DC Human Rights Act.',
           detail:'The attorney will: (1) Confirm the policy is within the board\'s rulemaking authority per bylaws. (2) Check for conflicts with the Declaration and DC Condominium Act. (3) Review for Fair Housing Act compliance — rules cannot have a disparate impact on protected classes. (4) Review for DC Human Rights Act compliance (DC Code § 2-1402.21). (5) Confirm the enforcement mechanism is lawful. (6) Advise on whether owner notice or approval is required before adoption.',
           ph:'prepare'},
          {s:'Board discusses draft policy at meeting; allow owner input during comment period',t:'Board meeting',d:'Bylaws: Board meeting procedures',
           desc:'Present the draft policy at a board meeting for discussion. Allow owners to comment during the owner comment period. Board members should consider owner feedback before voting.',
           detail:'Discussion tips: (1) Present the draft policy with the rationale for the change. (2) Explain how it will be enforced. (3) Allow owner questions and comments. (4) Consider legitimate owner concerns — be willing to modify the draft. (5) If the policy is controversial, consider tabling the vote to allow additional owner input. (6) If the policy requires owner notice before adoption (per bylaws), do not vote at this meeting — table to the next meeting after notice.',
           ph:'execute'},
          {s:'Provide owner notice period per bylaws before policy takes effect',t:'Per bylaws (typically 30 days)',d:'Bylaws: Notice requirements',
           desc:'Many bylaws require notice to owners before a new rule takes effect — typically 30 days. Send the adopted policy to all owners with the effective date and an explanation of what changed.',
           detail:'Notice should include: (1) Full text of the new or updated policy. (2) Summary of what changed (redline if modifying an existing policy). (3) Effective date. (4) How it will be enforced. (5) Contact for questions. (6) Send via method required by bylaws. (7) Post in common areas. (8) Some bylaws allow owners to petition for a vote on board-adopted rules — check your specific provisions.',
           w:'Required when bylaws mandate owner notice before policy adoption',ph:'execute',
           ck:['Send policy text to all owners','Include summary of changes','State effective date','Explain enforcement','Post in common areas']},
          {s:'Board votes to adopt updated policy by resolution; record in minutes',t:'Board meeting (after notice period if required)',d:'Bylaws: Voting requirements',
           desc:'The board votes to adopt the updated policy by formal resolution. Record the vote and full text of the adopted policy in the meeting minutes.',
           detail:'(1) Motion to adopt the policy as presented (or as amended). (2) Second. (3) Discussion. (4) Vote — record by name. (5) Attach the full text of the adopted policy to the minutes. (6) Assign responsibility for enforcement to the management company or designated board member. (7) Set a review date (annually is recommended to ensure policies remain current).',
           ph:'execute'},
          {s:'Distribute adopted policy to all owners and update the community rules handbook',t:'Within 2 weeks of adoption',d:'DC Code § 42-1903.14',
           desc:'Distribute the final adopted policy to all owners. Update the association\'s community rules handbook and resale certificate package. Owners may request copies per DC Code § 42-1903.14.',
           detail:'Distribution: (1) Send to all owners via mail or email. (2) Post to community portal or website. (3) Update the rules handbook — maintain a consolidated, current version. (4) Update the resale certificate package per DC Code § 42-1904.04. (5) Provide copies to the management company for enforcement. (6) Include in new owner welcome packages.',
           ph:'followup',ck:['Send to all owners','Post to community portal','Update rules handbook','Update resale certificate package','Provide to management company']}
        ],
        self:[
          {s:'Provide written explanation citing bylaws rulemaking authority and DC Code when owner challenges policy',t:'Within 14 days of challenge',d:'Bylaws: Rulemaking authority & DC Code § 42-1903.08',
           desc:'When an owner formally challenges a board-adopted policy, provide a written response citing the bylaws provision granting rulemaking authority, the DC Condominium Act provisions supporting the rule, and the rationale for the policy.',
           detail:'Your response should: (1) Cite the specific bylaws provision granting the board rulemaking authority. (2) Cite DC Code § 42-1903.08 — restrictions adopted per the Declaration are enforceable. (3) Explain the rationale for the policy. (4) Confirm the policy was properly adopted (notice, vote, distribution). (5) If the owner\'s concern has merit, consider whether a modification is appropriate. (6) Note that owners may petition for a vote on board-adopted rules if bylaws permit.',
           w:'Required when owner formally challenges the updated policy',ph:'followup',
           ck:['Cite bylaws rulemaking authority','Cite DC Code § 42-1903.08','Explain rationale for policy','Confirm proper adoption process','Address owner\'s specific concerns']},
          {s:'Review and update all association policies annually for continued relevance and legal compliance',t:'Annually',d:'Best practice',
           desc:'Review all association policies annually to ensure they remain relevant, enforceable, and compliant with current DC law. Update or repeal outdated policies.',
           detail:'Annual review: (1) List all current policies with adoption dates. (2) Review each for continued relevance. (3) Check against any changes in DC Code or Fair Housing Act. (4) Identify gaps — are there situations where a policy is needed but doesn\'t exist? (5) Update, repeal, or adopt as needed. (6) Distribute updated handbook to owners.',
           ph:'followup'}
        ],
        legal:[
          {s:'Attorney reviews policy affecting owner rights or with enforcement implications for legal compliance',t:'Before adoption',d:'DC Code § 42-1903.08 & Fair Housing Act & DC Human Rights Act',
           desc:'Any policy that restricts owner rights, imposes obligations, or has enforcement consequences should be reviewed by an attorney before adoption.',
           detail:'The attorney will: (1) Confirm the board has authority to adopt the rule. (2) Check for conflicts with governing documents and DC law. (3) Review for Fair Housing Act and DC Human Rights Act compliance — rules cannot discriminate or have disparate impact on protected classes. (4) Review the enforcement mechanism for due process compliance. (5) Advise on owner notice requirements. (6) Common high-risk policy areas: rental restrictions, pet rules, parking allocation, short-term rental restrictions (DC short-term rental law may preempt), and amenity access policies.',
           w:'Required when policy affects owner rights or has enforcement implications',ph:'prepare'},
          {s:'Attorney defends board-adopted policy in court when challenged by owner as ultra vires or discriminatory',t:'Upon filing of lawsuit',d:'DC Code § 42-1903.08 & DC Superior Court',
           desc:'When an owner sues challenging a board-adopted policy as beyond the board\'s authority (ultra vires) or discriminatory, the attorney defends the board in DC Superior Court.',
           detail:'The attorney will: (1) Review the policy adoption record (bylaws authority, notice, vote, distribution). (2) Defend the policy as within the board\'s rulemaking authority per bylaws and DC Code § 42-1903.08. (3) If discrimination is alleged, demonstrate the policy serves a legitimate purpose and does not have a disparate impact on protected classes. (4) Seek recovery of attorney fees per the governing documents. (5) If the court finds the policy invalid, advise on a revised version that addresses the deficiency.',
           w:'Required when owner files suit challenging a board-adopted policy',ph:'followup'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.08: Declaration restrictions enforceable as equitable servitudes. Board rules must be consistent with Declaration, bylaws, and DC Condominium Act. Fair Housing Act (42 USC § 3604) and DC Human Rights Act (DC Code § 2-1402.21): Rules cannot discriminate based on protected classes. DC short-term rental law (DC Code § 30-201 et seq.) may preempt certain rental restrictions. Board rulemaking authority derives from the bylaws — check your specific provisions.',
          '_':'POLICY BEST PRACTICES: (1) Confirm bylaws grant authority before adopting. (2) Draft clear, enforceable language. (3) Attorney review for anything affecting owner rights. (4) Provide owner notice before effective date. (5) Enforce consistently. (6) Review annually. (7) Cannot conflict with Declaration, bylaws, DC Code, or Fair Housing Act.'
        }
      },
      { id:'conflict-interest', title:'Conflict of Interest', desc:'Board member recusal, related-party transactions, fiduciary duty under DC Code',
        tags:['Board member recusal','Related-party vendors','Fiduciary duty','Self-dealing'],
        pre:[
          {s:'Board member discloses potential conflict of interest before any discussion or vote on the matter',t:'Before discussion begins',d:'DC Code § 29-1108.01 & Conflict of interest policy',
           desc:'Under DC Code § 29-1108.01, board members have a fiduciary duty of loyalty to act in the association\'s best interest. Any board member with a financial interest, family relationship, or other connection to a matter must disclose before discussion begins.',
           detail:'Conflicts include: (1) Financial interest in a vendor being considered (ownership, employment, investment). (2) Family or close personal relationship with a vendor, contractor, or party to a dispute. (3) Personal benefit from a board decision (e.g., board member owns the unit adjacent to a proposed project). (4) Employment relationship with a company providing services to the HOA. (5) ANY situation where the board member\'s personal interest could differ from the association\'s interest. When in doubt, disclose — it\'s always better to over-disclose. The disclosure should state: the nature of the conflict, the relationship, and any financial interest.',
           ph:'prepare',ck:['Board member states the conflict','Describes the nature of the relationship','Discloses any financial interest','Disclosure is made before discussion']},
          {s:'Conflicted board member leaves the room during discussion and vote — no participation',t:'During meeting',d:'DC Code § 29-1108.01 & Fiduciary duty of loyalty',
           desc:'The conflicted board member must leave the room (or disconnect from virtual meeting) for the entire discussion and vote on the matter. They may not participate in discussion, advocacy, or voting.',
           detail:'Recusal procedure: (1) After disclosure, the conflicted member leaves the room. (2) The remaining board discusses the matter without the conflicted member present. (3) The conflicted member may not advocate for or against the decision to other board members outside the meeting. (4) The conflicted member returns only after the vote is complete. (5) If multiple board members have conflicts on the same matter, ensure enough unconflicted members remain for a quorum. (6) If the conflict involves the property management company, the manager should also leave for the discussion.',
           ph:'execute'},
          {s:'Document the disclosure, recusal, and vote in meeting minutes with specificity',t:'During meeting',d:'Meeting minutes & Board records',
           desc:'Record the conflict disclosure, the board member\'s departure from the room, the discussion and vote that occurred in their absence, and the result in the meeting minutes.',
           detail:'Minutes should state: (1) "[Board member name] disclosed a [describe conflict] and recused from discussion and vote." (2) "[Board member name] left the room at [time]." (3) Summary of discussion that occurred. (4) Motion, second, and vote result (by name for remaining members). (5) "[Board member name] returned at [time]." (6) This documentation protects the board from claims of self-dealing and demonstrates proper governance. Keep the conflict disclosure records permanently.',
           ph:'execute',ck:['Record disclosure description','Record departure time','Record discussion summary','Record vote by name','Record return time']},
          {s:'Verify remaining board members constitute a quorum before proceeding with vote',t:'After recusal, before voting',d:'Bylaws: Quorum requirements',
           desc:'After the conflicted member leaves, verify that the remaining board members constitute a quorum. If quorum is lost, the vote cannot proceed — table to a meeting where a quorum of unconflicted members is present.',
           detail:'(1) Count remaining board members present. (2) Compare to bylaws quorum requirement (typically majority of board). (3) If quorum is lost: table the matter to a future meeting. (4) If quorum is chronically difficult with recusals, consider whether the board size should be increased or whether the conflict of interest policy needs revision. (5) In extreme cases where no unconflicted quorum can be achieved, consult an attorney — the matter may need to be decided by the membership.',
           ph:'followup'}
        ],
        self:[
          {s:'Raise undisclosed conflict of interest for the record when a board member fails to voluntarily disclose',t:'Immediately upon awareness',d:'DC Code § 29-1108.01 & Fiduciary duty',
           desc:'When a board member becomes aware that another board member has an undisclosed conflict of interest on a pending matter, they have a fiduciary obligation to raise it for the record.',
           detail:'Steps: (1) State the concern at the meeting: "For the record, I believe [board member] may have a conflict on this matter because [describe]." (2) Allow the identified member to respond. (3) If the member agrees they have a conflict, follow the standard recusal procedure. (4) If the member disagrees, the board should discuss and vote on whether to require recusal. (5) Record the entire exchange in the minutes. (6) If the undisclosed conflict has already affected a prior vote, consult attorney about whether the prior action should be revisited.',
           w:'Required when a board member is aware of an undisclosed conflict — fiduciary duty to disclose',ph:'execute',
           ck:['State the concern at the meeting','Allow member to respond','Board discusses and votes on recusal if disputed','Record exchange in minutes']},
          {s:'Adopt a written conflict of interest policy by board resolution if one does not exist',t:'Next board meeting',d:'DC Code § 29-1108.01 & Best practice',
           desc:'Every association should have a written conflict of interest policy adopted by board resolution. The policy should define conflicts, require disclosure, mandate recusal, and establish consequences for violations.',
           detail:'Policy should include: (1) Definition of conflicts of interest (financial, family, employment). (2) Requirement to disclose before discussion and vote. (3) Recusal procedure (leave the room, no participation). (4) Disclosure form (annual and per-occurrence). (5) Consequences for failure to disclose (removal from board per bylaws, personal liability). (6) Annual disclosure requirement — each board member signs an annual conflict disclosure form listing relationships with vendors and contractors. (7) Related-party transaction review — any transaction with a board member\'s related entity requires unconflicted board approval and documentation that the terms are fair.',
           ph:'prepare',ck:['Define conflicts of interest','Require disclosure before discussion','Mandate recusal procedure','Establish consequences','Require annual disclosure form','Address related-party transactions']},
          {s:'Require annual conflict of interest disclosure forms from all board members',t:'At organizational meeting or annually',d:'DC Code § 29-1108.01 & Best practice',
           desc:'At the annual organizational meeting, require each board member to complete a conflict of interest disclosure form listing any relationships with vendors, contractors, or parties who do business with the association.',
           detail:'The annual form should request: (1) Employment, ownership, or investment interests in any company that provides services to the association. (2) Family relationships with any vendor, contractor, or management company employee. (3) Any other financial interest that could create a conflict. (4) File the completed forms in the board records. (5) Update mid-year if circumstances change. (6) This creates a proactive record that helps identify conflicts before they arise.',
           ph:'followup'}
        ],
        legal:[
          {s:'Attorney reviews conflict of interest policy and related-party transaction procedures',t:'Upon adoption or when recurring conflicts arise',d:'DC Code § 29-1108.01 & Fiduciary duty',
           desc:'Engage an attorney to review or draft the association\'s conflict of interest policy, especially when recurring conflicts or related-party transactions arise.',
           detail:'The attorney will: (1) Review or draft the conflict of interest policy for legal sufficiency. (2) Advise on the fiduciary duty of loyalty under DC Code § 29-1108.01. (3) Review any related-party transactions for fairness — did the board obtain competitive bids? Were the terms at or below market rate? (4) Advise on consequences for violations — in DC, a board member who self-deals (benefits personally from a board decision without proper disclosure and recusal) may be personally liable for damages to the association. (5) Assess whether D&O insurance covers self-dealing claims (most policies exclude intentional self-dealing).',
           w:'Required for recurring conflicts, related-party transactions, or allegations of self-dealing',ph:'followup'},
          {s:'Attorney advises on personal liability when a board member engages in undisclosed self-dealing',t:'Upon discovery of undisclosed conflict',d:'DC Code § 29-1108.01 & D&O policy',
           desc:'When a board member is discovered to have engaged in undisclosed self-dealing (voted on a matter in which they had a personal financial interest), the attorney assesses the association\'s options for recovery and the member\'s personal liability.',
           detail:'The attorney will: (1) Investigate the extent of the self-dealing — what decisions were affected and what was the financial impact? (2) Assess personal liability under DC Code § 29-1108.01 — board members who breach the duty of loyalty may be personally liable for damages. (3) Determine whether D&O insurance covers the claim — most policies exclude intentional self-dealing. (4) Advise on remedies: demand repayment, rescind the tainted transaction, pursue civil claims in DC Superior Court. (5) Advise on removal of the board member per bylaws and DC Code § 29-1108.08.',
           w:'Required when undisclosed self-dealing is discovered — board member may face personal liability',ph:'followup'}
        ],
        notes:{
          'DC':'DC Code § 29-1108.01: Board members owe a fiduciary duty of loyalty and care to the association. Duty of loyalty requires acting in the association\'s interest, not personal gain. Self-dealing without proper disclosure and recusal may result in personal liability. § 29-1108.08: Board member removal procedures. D&O insurance typically excludes intentional self-dealing. BEST PRACTICE: Adopt a written conflict of interest policy, require annual disclosure forms, and enforce consistently.',
          '_':'CONFLICT OF INTEREST BEST PRACTICES: (1) Adopt a written policy. (2) Require disclosure BEFORE discussion and vote. (3) Conflicted member LEAVES the room. (4) Document in minutes. (5) Require annual disclosure forms. (6) For related-party transactions, get competitive bids to demonstrate fairness. (7) Self-dealing is the fastest way to personal liability — D&O insurance usually won\'t cover it.'
        }
      }
    ]
  },
  { id:'disputes', num:'6', icon:'🤝', label:'Owner Disputes', color:'sky',
    sits: [
      { id:'neighbor-conflicts', title:'Neighbor Conflicts', desc:'Noise, smoking, shared wall conflicts — mediation and enforcement under DC law',
        tags:['Noise complaints','Smoking','Shared wall conflicts','Harassment','Odors'],
        pre:[
          {s:'Receive and document complaint with specific dates, times, description, and impact on the complaining owner',t:'Upon receipt',d:'CC&Rs/Rules',
           desc:'Document the complaint with specific details — dates, times, description of the behavior, how it impacts the complaining owner, and any witnesses. Generic complaints without specifics are difficult to enforce.',
           detail:'Documentation checklist: (1) Date and time of each incident. (2) Description of the behavior (type of noise, smell, activity). (3) Duration and frequency. (4) Which unit is affected and how. (5) Witnesses. (6) Has the complaining owner attempted to resolve directly with the neighbor? (7) Is this a one-time incident or a pattern? (8) Photos or audio/video if available. (9) Note: the board should not take sides — its role is to enforce the rules, not adjudicate neighbor disputes.',
           ph:'document',ck:['Record specific dates and times','Describe behavior in detail','Note duration and frequency','Identify affected unit and impact','List witnesses','Determine if pattern or one-time']},
          {s:'Review CC&Rs and rules for applicable provisions — noise, nuisance, quiet enjoyment, smoking, odors',t:'1-3 days',d:'CC&Rs/Rules & DC Code § 42-1903.08',
           desc:'Identify the specific CC&R, Declaration, or rule provision that applies to the complaint. Common provisions: quiet enjoyment, noise restrictions, nuisance prohibition, smoking restrictions, odor provisions.',
           detail:'Key provisions to check: (1) Quiet enjoyment / nuisance clause — most Declarations include a provision prohibiting activities that unreasonably interfere with other owners\' use and enjoyment. (2) Noise restrictions — specific hours (typically 10pm-8am), or general "unreasonable noise" standard. (3) Smoking — DC Clean Indoor Air Amendment Act (DC Code § 7-741 et seq.) restricts smoking in certain common areas; CC&Rs may add unit restrictions. (4) Odors — marijuana, cooking, pets — check CC&Rs for specific provisions. (5) DC noise ordinance: DCMR Title 20, Chapter 27 sets decibel limits — can be enforced by DC police.',
           ph:'document'},
          {s:'Send notice to offending owner citing specific rule, describing reported behavior, and requesting voluntary compliance',t:'Within 1 week of complaint',d:'CC&Rs: Nuisance/quiet enjoyment provisions',
           desc:'Send a written notice to the owner whose behavior was reported, citing the specific rule, describing the complaint (without identifying the complainant if possible), and requesting voluntary compliance.',
           detail:'The notice should: (1) Cite the specific CC&R or rule provision. (2) Describe the reported behavior and dates (without identifying the complainant by name if possible — this reduces retaliation risk). (3) Request voluntary compliance. (4) Note that continued violations may result in formal enforcement including fines. (5) Suggest the owners attempt to resolve directly if they have not already. (6) Tone should be neutral and informative — the board is not taking sides, it is enforcing rules. (7) Do NOT threaten immediate fines on the first notice for neighbor disputes — mediation is usually more effective.',
           ph:'mediate',ck:['Cite specific rule provision','Describe reported behavior without identifying complainant','Request voluntary compliance','Note potential consequences','Suggest direct resolution between owners']},
          {s:'Offer mediation between the parties through DC Multi-Door Dispute Resolution or private mediator',t:'If not resolved within 2-4 weeks',d:'CC&Rs: Dispute resolution & DC Multi-Door',
           desc:'If the initial notice does not resolve the conflict, offer mediation between the parties. DC Superior Court\'s Multi-Door Dispute Resolution Division provides free or low-cost mediation services.',
           detail:'Mediation options: (1) DC Superior Court Multi-Door Dispute Resolution Division — free or low-cost mediation for DC residents. Contact (202) 879-1549. (2) Private mediators — typical cost $200-$400/hour split between parties. (3) Board-facilitated discussion — a neutral board member can facilitate a conversation between the parties (less formal, sometimes effective). Benefits of mediation: faster than enforcement, preserves community relationships, confidential, and parties often comply more willingly with an agreement they helped negotiate. The board should encourage but cannot require mediation.',
           w:'Recommended when initial notice does not resolve the conflict — mediation is often more effective than enforcement',ph:'mediate',
           ck:['Offer mediation to both parties','Suggest DC Multi-Door Dispute Resolution','Offer private mediator as alternative','Document mediation offer in writing']},
          {s:'Escalate per enforcement policy — formal violation notice, hearing, and fines for continuing violations',t:'Per bylaws enforcement procedures',d:'Bylaws: Enforcement section & Fine schedule',
           desc:'If mediation is refused or unsuccessful and the violation continues, escalate through the standard enforcement process: formal violation notice, hearing, and fines per the covenant-violations workflow.',
           detail:'Escalation steps: (1) Send formal violation notice via certified mail citing specific rule and cure period. (2) Schedule hearing per bylaws. (3) Impose fines per the adopted fine schedule. (4) For noise violations, consider: escalating fines for repeated incidents, suspending amenity access if authorized by bylaws, and ultimately legal action for chronic nuisance. (5) Concurrently, the complaining owner may also file a noise complaint with DC police under DCMR Title 20, Chapter 27 (noise ordinance) — the board should not discourage this.',
           w:'Required when mediation does not resolve the dispute — follow covenant-violations workflow',ph:'resolve',
           ck:['Send formal violation notice via certified mail','Schedule hearing per bylaws','Impose fines per schedule','Inform complaining owner of DC noise ordinance option']}
        ],
        self:[
          {s:'Impose escalating fines per hearing process when mediation fails and violation continues',t:'After hearing per bylaws',d:'Fine schedule & Bylaws',
           desc:'When mediation is refused or fails and the violation continues, follow the fine-hearings workflow to impose escalating fines. The fine should be sufficient to incentivize compliance.',
           detail:'Steps: (1) Conduct hearing per fine-hearings workflow (notice, hearing, written decision). (2) Impose fine per the adopted schedule. (3) For ongoing violations: apply daily or weekly recurring fines. (4) Add unpaid fines to the owner\'s assessment ledger per DC Code § 42-1903.12. (5) Pursue collection per delinquent-accounts workflow if fines remain unpaid. (6) Consider whether the violation rises to the level of legal action (chronic noise, smoking affecting health, harassment).',
           w:'Required when mediation does not produce resolution',ph:'resolve',
           ck:['Conduct hearing per fine-hearings workflow','Impose fine per schedule','Apply recurring fines for ongoing violation','Add unpaid fines to assessment ledger']},
          {s:'Advise complaining owner of independent remedies: DC noise ordinance, police non-emergency, or civil action',t:'When board enforcement is insufficient',d:'DC noise ordinance (DCMR Title 20 Ch 27) & DC Code',
           desc:'If board enforcement (notices, fines) is insufficient to resolve the conflict, advise the complaining owner of their independent remedies: DC noise ordinance complaint, police non-emergency line, or civil nuisance action.',
           detail:'Independent remedies available to the complaining owner: (1) DC NOISE ORDINANCE — file a complaint with DC police non-emergency (311) under DCMR Title 20, Chapter 27. DC police can issue citations for excessive noise. (2) DC METROPOLITAN POLICE — for ongoing harassment, threats, or criminal activity, call non-emergency (311) or 911. (3) CIVIL NUISANCE ACTION — the owner can file a private nuisance lawsuit in DC Superior Court seeking injunctive relief and damages. (4) RESTRAINING ORDER — if the neighbor\'s behavior constitutes harassment, the complaining owner may seek a civil protection order. The board should document that it has taken enforcement action but cannot guarantee resolution of every neighbor dispute.',
           ph:'resolve',
           ck:['Advise of DC noise ordinance complaint option','Advise of police non-emergency line','Advise of civil nuisance action option','Document board enforcement actions taken']},
          {s:'Document consistent enforcement and board neutrality to protect against claims from either party',t:'Ongoing',d:'DC Code § 42-1903.08 & Fiduciary duty',
           desc:'In neighbor disputes, document that the board enforced rules consistently and remained neutral. Both the complaining owner and the accused owner may claim the board acted improperly.',
           detail:'Protection measures: (1) Apply the same rules to all owners — if noise restrictions apply to Unit A, they apply to Unit B too. (2) Document every action taken in response to the complaint. (3) Do not share one owner\'s personal information with the other. (4) Do not take sides — the board enforces rules, it does not mediate personal disputes. (5) If either party threatens to sue the board, notify D&O insurance. (6) Consistent, documented enforcement is the board\'s best defense.',
           ph:'resolve'}
        ],
        legal:[
          {s:'Attorney sends cease-and-desist for chronic nuisance causing significant interference with other owners\' enjoyment',t:'After internal enforcement is exhausted',d:'CC&Rs & DC Code § 42-1903.08',
           desc:'When internal enforcement (notices, mediation, fines) fails to resolve a chronic nuisance, an attorney\'s cease-and-desist letter demonstrates the board\'s willingness to pursue legal remedies.',
           detail:'The attorney will: (1) Review the enforcement record to confirm internal remedies are exhausted. (2) Send a formal cease-and-desist citing the CC&R nuisance provisions and DC Code § 42-1903.08. (3) Demand immediate cessation and cure. (4) State that failure to comply will result in legal action seeking injunctive relief, damages, and attorney fees. (5) If the nuisance continues after the cease-and-desist, file for injunctive relief in DC Superior Court (510 4th St NW).',
           w:'Required for ongoing nuisance after multiple notices and mediation attempts have failed',ph:'resolve'},
          {s:'Attorney files for injunctive relief in DC Superior Court for chronic nuisance or harassment',t:'When cease-and-desist fails',d:'DC Code § 42-1903.08 & DC Superior Court',
           desc:'For chronic, severe nuisances that significantly interfere with other owners\' use and enjoyment, the attorney files suit in DC Superior Court seeking injunctive relief, damages, and attorney fees.',
           detail:'The attorney will: (1) File complaint in DC Superior Court (510 4th St NW). (2) Seek preliminary and permanent injunction requiring the nuisance to cease. (3) If the nuisance is severe and ongoing, seek a TRO for immediate relief. (4) Seek recovery of: accumulated fines, damages to other owners, and attorney fees per the governing documents. (5) If the nuisance involves criminal behavior (harassment, threats, assault), coordinate with DC Metropolitan Police.',
           w:'Required for severe, chronic nuisance — particularly where harassment or health impacts are involved',ph:'resolve'}
        ],
        notes:{
          'DC':'DC noise ordinance: DCMR Title 20, Chapter 27 — sets decibel limits, enforceable by DC police via 311. DC Clean Indoor Air Amendment Act (DC Code § 7-741 et seq.) — restricts smoking in certain areas. DC Code § 42-1903.08: Declaration restrictions enforceable as equitable servitudes. DC Multi-Door Dispute Resolution Division: free/low-cost mediation at DC Superior Court, (202) 879-1549. ENFORCEMENT: The board enforces rules — it does not adjudicate personal disputes. Mediation first, enforcement second, legal action as last resort.',
          '_':'NEIGHBOR CONFLICT APPROACH: (1) Document with specifics. (2) Send neutral notice citing the rule. (3) Offer mediation — it works better than fines for neighbor disputes. (4) If mediation fails, escalate per enforcement process. (5) Board stays neutral — enforce the rules consistently. (6) Advise complainant of independent remedies if board enforcement is insufficient.'
        }
      },
      { id:'damage-responsibility', title:'Damage Responsibility', desc:'Leak source disputes, insurance coordination',
        tags:['Leak source disputes','Insurance coordination'],
        pre:[
          {s:'Investigate source of damage — engage licensed plumber or inspector to determine origin',t:'Immediately',d:'DC Code § 42-1903.09',desc:'Identify whether the damage originates from a common element, limited common element, or within a unit boundary.',detail:'Engage a licensed DC plumber or building inspector. The CC&Rs/Declaration define boundaries per DC Code § 42-1903.09 — typically the unfinished interior surfaces inward belong to the unit owner; everything outward (pipes in walls/ceilings, structural elements, roof) is common element. Document findings with photos, video, and a written report from the professional.',ph:'document',ck:['Engage licensed plumber or inspector','Photograph and video all damage','Obtain written report identifying source','Map source to CC&R boundary definitions']},
          {s:'Determine responsibility per Declaration maintenance matrix and DC boundary definitions',t:'After investigation',d:'CC&Rs / DC Code § 42-1903.09',desc:'Apply the Declaration boundary definitions to assign maintenance and repair responsibility.',detail:'Review the Declaration maintenance responsibility matrix (required per DC Code § 42-1903.09). Common elements = association responsibility. Unit interior = owner responsibility. Limited common elements = check Declaration (often owner maintains, association insures). When a common element leak causes unit damage, the association repairs the source and the owner repairs their unit interior — but check your Declaration for variations.',w:'Boundary definitions vary by Declaration — do not assume standard boundaries without checking',ph:'document',ck:['Review Declaration boundary definitions','Identify responsible party','Document responsibility determination','Cross-reference with maintenance matrix']},
          {s:'Notify responsible party and all applicable insurance carriers',t:'Within 48 hours of determination',d:'Insurance policy & DC Code § 42-1903.10',desc:'Notify the responsible party and file insurance claims with all applicable policies.',detail:'File claims with: (1) Association master policy if common element is the source or for common area damage, (2) Unit owner HO-6 policy for interior unit damage, (3) Responsible owner HO-6 if their negligence caused the damage. DC Code § 42-1903.10 requires the association to maintain property insurance on common elements. Provide the inspection report to all carriers. Send written notice to the responsible party with a copy of the professional report.',ph:'mediate',ck:['Notify responsible party in writing with report','File claim with association master policy if applicable','Advise affected owner to file HO-6 claim','Provide inspection report to all carriers']},
          {s:'Coordinate repairs — association repairs common elements, owner repairs unit interior',t:'As soon as insurance adjusters complete assessment',d:'CC&Rs & Insurance policies',desc:'Coordinate concurrent repairs to minimize disruption and secondary damage.',detail:'Sequence: (1) Stop the source of damage first (emergency repair if needed), (2) Dry out and remediate mold risk (within 48 hours for water damage), (3) Association repairs common element source, (4) Owner repairs unit interior. For water damage, engage a licensed mold remediation company if drying exceeds 48 hours. Track all costs by responsible party. Association should not pay for unit interior repairs unless Declaration specifically requires it.',w:'Water damage must be dried within 48 hours to prevent mold — engage remediation immediately if needed',ph:'resolve',ck:['Stop source of damage','Engage remediation if water not dried in 48 hours','Association repairs common element source','Owner repairs unit interior','Track all costs by responsible party']}
        ],
        self:[
          {s:'Obtain independent expert opinion (licensed plumber or engineer) when responsibility is disputed',t:'Within 1 week of dispute',d:'DC Code § 42-1903.09',desc:'When the parties disagree on whether the source is a common element or unit owner responsibility, an independent expert report is essential.',detail:'Engage a licensed, insured professional not previously involved. Request a written report addressing: (1) Source and cause of damage, (2) Which building component failed, (3) Whether that component is a common element, limited common element, or unit element per the Declaration. This report is critical if the dispute proceeds to mediation or court.',w:'Do not delay repairs while disputing responsibility — stop active damage first, then resolve who pays',ph:'document',ck:['Engage independent licensed expert','Obtain written report with source identification','Map source to Declaration boundary definitions','Preserve all evidence and photos']},
          {s:'Send written demand to responsible party with expert report and itemized repair costs',t:'After expert report received',d:'DC Code § 42-1903.09',desc:'Formally notify the responsible party with supporting documentation and demand reimbursement.',detail:'Include: (1) Copy of expert report, (2) Relevant Declaration sections defining boundaries, (3) Itemized repair costs with invoices or estimates, (4) Demand for reimbursement within 30 days. Send via certified mail or email with delivery confirmation. This creates the record needed for small claims court if unresolved.',ph:'mediate',ck:['Draft demand letter with expert report','Cite relevant Declaration boundary provisions','Itemize all repair costs','Send via certified mail or confirmed delivery']},
          {s:'File in DC Superior Court Small Claims if demand is not satisfied within 30 days',t:'After 30-day demand period',d:'DC Superior Court Small Claims (limit $10,000)',desc:'DC Small Claims Branch handles disputes up to $10,000 without requiring an attorney.',detail:'File at DC Superior Court, 510 4th St NW. Filing fee approximately $15-$65 depending on amount. Bring: expert report, photos, demand letter with proof of delivery, repair invoices, Declaration boundary provisions. No attorney required. For amounts exceeding $10,000, file in Civil Division (attorney recommended).',w:'Small claims limit in DC is $10,000 — claims exceeding this amount require Civil Division filing',ph:'resolve',ck:['Prepare filing with all documentation','File at DC Superior Court Small Claims','Serve defendant per court rules','Attend hearing with expert report and evidence']}
        ],
        legal:[
          {s:'Attorney reviews Declaration boundary definitions and determines liability allocation',t:'When responsibility is disputed',d:'DC Code § 42-1903.09',desc:'Attorney analyzes the Declaration, DC boundary statutes, and expert reports to determine which party bears repair responsibility.',detail:'Attorney reviews: (1) Declaration maintenance matrix and boundary definitions, (2) DC Code § 42-1903.09 default boundaries, (3) Expert inspection report, (4) Insurance policy coverage. Provides written opinion on liability allocation between association, unit owner, and/or negligent third party.',ph:'document'},
          {s:'Attorney coordinates between insurance carriers and pursues subrogation if applicable',t:'Concurrent with liability analysis',d:'Insurance policies & DC Code § 42-1903.10',desc:'When multiple insurance policies are involved, attorney ensures proper claims and prevents gaps in coverage.',detail:'Attorney coordinates between association master policy and owner HO-6 policies. Pursues subrogation claims against negligent parties. Ensures association is not paying for unit interior damage unless Declaration requires it. Challenges claim denials.',ph:'mediate'},
          {s:'Attorney pursues collection or litigation for unresolved damage disputes',t:'After demand period expires',d:'DC Superior Court',desc:'When the responsible party refuses to pay after demand, attorney files suit for cost recovery.',detail:'Attorney files in DC Superior Court (Civil Division for amounts over $10,000, Small Claims for under). Seeks recovery of repair costs, expert fees, attorney fees if Declaration provides, and consequential damages. May pursue contribution claims against negligent contractors or third parties.',w:'Attorney fees recoverable only if Declaration or statute provides — check Declaration indemnification clause',ph:'resolve'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.09 defines default common element boundaries — unfinished interior surfaces inward are unit, outward are common. Declaration may modify defaults. § 42-1903.10 requires association property insurance on common elements. Small claims limit is $10,000 at DC Superior Court (510 4th St NW). Water damage: engage mold remediation if not dried within 48 hours.',
          '_':'The Declaration maintenance matrix is the primary authority for responsibility. Get a professional assessment to identify source before assigning blame. Stop active damage immediately regardless of who is responsible — sort out costs afterward.'
        }
      }
    ]
  },
  { id:'operations', num:'7', icon:'🏊', label:'Community Ops', color:'teal',
    sits: [
      { id:'amenities', title:'Amenities Management', desc:'Pool closures, gym rules, clubhouse rentals',
        tags:['Pool closures','Gym rules','Clubhouse rentals'],
        pre:[
          {s:'Review current amenity rules, usage policies, and posted hours annually',t:'Annually',d:'Bylaws & Rules',desc:'Ensure amenity rules are current, clearly written, and consistently enforceable.',detail:'Review each amenity area: pool, gym, clubhouse/party room, rooftop, courtyard. Confirm rules address: hours of operation, guest policies, reservation procedures, capacity limits, prohibited conduct, liability waivers. Compare against insurance carrier recommendations — many carriers require specific pool and fitness center rules.',ph:'document',ck:['Review pool rules and hours','Review gym/fitness center rules','Review clubhouse/party room rental rules','Review guest and capacity policies','Compare rules against insurance requirements']},
          {s:'Inspect facilities monthly and document maintenance needs with photos',t:'Monthly',d:'Fiduciary duty of care',desc:'Regular inspections protect the association from liability and ensure safe conditions.',detail:'Monthly walk-through of all amenity areas. Check: safety equipment (AED, first aid, pool rescue equipment), signage condition, lighting, cleanliness, equipment function, ADA compliance. Document deficiencies with dated photos. Create work orders for any issues.',ph:'document',ck:['Check safety equipment and expiration dates','Verify signage is posted and legible','Inspect lighting and cleanliness','Test equipment function','Document deficiencies with dated photos']},
          {s:'Update rules as needed through board resolution — distribute notice to all owners',t:'As needed',d:'DC Code § 42-1903.08',desc:'Rule changes must follow the process in your bylaws and be properly noticed.',detail:'Per DC Code § 42-1903.08, rules adopted by the board are enforceable as equitable servitudes if properly adopted and noticed. Process: (1) Board discusses at open meeting, (2) Adopts via resolution, (3) Distributes written notice to all owners, (4) Posts at affected amenity, (5) Allows reasonable effective date (typically 30 days). Rules must be reasonable and uniformly enforced.',w:'Rules must be reasonable, uniformly enforced, and properly noticed per DC Code § 42-1903.08',ph:'act'},
          {s:'Post rules prominently at each amenity area with effective date',t:'Immediately after adoption',desc:'Physical posting at the amenity is essential for enforcement.',detail:'Post at eye level near the entrance to each amenity. Include: effective date, key rules, emergency contact, management contact. Consider laminated signs for pool/outdoor areas. Supplement with email distribution to all owners.',ph:'act'},
          {s:'Enforce rules consistently — document violations using standard violation process',t:'Ongoing',d:'DC Code § 42-1903.08',desc:'Selective enforcement undermines the association legal position. Apply rules uniformly.',detail:'Use the same violation notice process as covenant enforcement: (1) Verbal/email warning for first offense, (2) Written violation notice, (3) Hearing opportunity per bylaws, (4) Fine per schedule. Document every violation and response. Selective enforcement is the #1 defense raised by violators — consistency is critical.',w:'Selective enforcement can waive the right to enforce — document and apply rules uniformly',ph:'close'}
        ],
        self:[
          {s:'Issue written violation notice with hearing opportunity for repeat amenity rule violations',t:'After documented violation',d:'Bylaws & DC Code § 42-1903.08',desc:'Formal violation notice is required before imposing fines for amenity rule violations.',detail:'Send written notice: (1) Specific rule violated, (2) Date and description of violation, (3) Corrective action required, (4) Right to hearing before board, (5) Fine schedule if violation continues. Follow the same process as covenant violations — amenity rules are enforceable under DC Code § 42-1903.08.',ph:'act',ck:['Identify specific rule violated','Document date and description','Send written notice with hearing opportunity','Include fine schedule']},
          {s:'Suspend amenity privileges for chronic violators after hearing and board resolution',t:'After hearing',d:'Bylaws',desc:'Suspension of amenity access is a permissible enforcement tool if authorized by governing documents.',detail:'After providing hearing opportunity: board may suspend amenity privileges for a defined period. Must be authorized by bylaws or rules. Document the hearing, decision, and duration of suspension. Notify owner in writing. Cannot restrict access to the unit itself — only common amenities.',w:'Cannot restrict access to the owner unit — only to common amenity areas',ph:'act'},
          {s:'Address liability exposure by ensuring waivers, insurance, and safety equipment are current',t:'After any injury or incident',desc:'After any injury incident, review liability protections immediately.',detail:'Review: (1) Liability waiver adequacy (have attorney review after any incident), (2) Insurance coverage for amenity areas — confirm general liability and umbrella cover amenity operations, (3) Safety equipment current (AED pads, first aid kits, pool rescue equipment). Report incidents to insurance carrier within 24 hours.',ph:'close',ck:['Review liability waiver adequacy','Confirm insurance covers amenity operations','Check safety equipment currency','Report incident to insurance carrier']}
        ],
        legal:[
          {s:'Attorney reviews liability waivers, rental agreements, and amenity rules annually',t:'Annually or after incident',d:'DC Code § 42-1903.08',desc:'Annual legal review ensures amenity rules and waivers are legally sound and current.',detail:'Attorney reviews: (1) Liability waivers for enforceability, (2) Clubhouse/party room rental agreements, (3) Pool rules compliance with DC health regulations, (4) Fitness center equipment liability, (5) ADA compliance. Provides recommendations for updates.',ph:'document'},
          {s:'Attorney advises on ADA compliance and reasonable accommodations for amenity access',t:'When accommodation requested or issue identified',d:'Fair Housing Act & ADA',desc:'Amenity rules must comply with disability accommodation requirements.',detail:'Attorney evaluates: service animal policies, physical accessibility, reasonable modifications to rules for disabled owners. DC Human Rights Act provides additional protections beyond federal ADA.',ph:'act'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.08: Board-adopted rules enforceable as equitable servitudes. Pool facilities must comply with DC Health regulations (DCMR Title 25-C). Liability waivers enforceable in DC if properly drafted. DC Human Rights Act (§ 2-1402.21) prohibits discrimination in amenity access. Report injuries to insurance carrier within 24 hours.',
          '_':'Consistent enforcement is essential — selective enforcement is the #1 defense raised by violators. Ensure adequate insurance coverage for all amenity areas. Safety equipment must be current and inspected regularly.'
        }
      },
      { id:'security', title:'Security Issues', desc:'Theft, access control, camera installations',
        tags:['Theft','Access control','Camera installations'],
        pre:[
          {s:'Document security incident with detailed timeline, photos, and witness statements',t:'Immediately',desc:'Thorough documentation is essential for police reports, insurance claims, and board decisions.',detail:'Record: (1) Date, time, and location, (2) Description of incident, (3) Witnesses and their statements, (4) Photos/video of any damage or evidence, (5) How the incident was discovered. Preserve any security camera footage immediately — many systems overwrite within 7-30 days.',ph:'document',ck:['Record date, time, and location','Describe incident in detail','Collect witness statements','Photograph damage or evidence','Preserve security camera footage']},
          {s:'Report to Metropolitan Police Department (MPD) for any criminal activity',t:'Immediately',d:'DC Code § 5-113.01',desc:'File a police report for theft, vandalism, assault, trespassing, or any criminal activity.',detail:'Call MPD non-emergency (311) or emergency (911). File report online at mpdc.dc.gov for property crimes. Obtain the CCN (Crime Complaint Number) for insurance claims. Request increased patrols if pattern of incidents. DC Code § 22-3312 covers vandalism; § 22-3571 covers theft. Keep copy of police report for association records.',w:'Always report criminal activity — the police report is required for insurance claims',ph:'document',ck:['Call MPD (911 emergency or 311 non-emergency)','File formal police report','Obtain CCN (Crime Complaint Number)','Request increased patrols if pattern']},
          {s:'Review and update access control measures — fobs, keys, codes, entry systems',t:'After incident or annually',d:'Bylaws & Rules',desc:'Assess whether current access control is adequate and whether changes are needed.',detail:'Review: (1) Key/fob inventory — deactivate lost or unreturned fobs, (2) Entry codes — change if compromised, (3) Visitor/delivery access procedures, (4) Package delivery protocols, (5) Contractor access procedures. Consider upgrades: video intercom, mobile access, package lockers. Track all access credentials issued and returned.',ph:'act',ck:['Audit key/fob inventory','Deactivate unreturned or lost credentials','Change entry codes if compromised','Review visitor and delivery access procedures','Evaluate system upgrade needs']},
          {s:'Notify affected owners of security incident and any immediate precautions',t:'Within 24 hours',d:'Bylaws',desc:'Transparent communication about security incidents builds trust and helps prevent repeat incidents.',detail:'Send written notice (email + posted notice if needed): (1) Brief factual description (without identifying victims without consent), (2) What actions the board has taken, (3) What owners should do (lock doors, report suspicious activity, etc.), (4) How to report information. Do not speculate on suspects or share victim personal information.',ph:'act'},
          {s:'Board reviews security improvements and allocates budget at next meeting',t:'Next board meeting',d:'Fiduciary duty of care',desc:'Board evaluates whether security infrastructure needs upgrading based on incident patterns.',detail:'Board considers: (1) Camera system installation or upgrade, (2) Access control system upgrade, (3) Lighting improvements, (4) Security patrol or concierge, (5) Package security. Get bids for recommended improvements. Budget from operating or reserves as appropriate. Consider hiring a security consultant for comprehensive assessment.',ph:'close',ck:['Review camera system adequacy','Evaluate access control upgrade','Assess lighting improvements','Consider security patrol options','Get bids for recommended improvements']}
        ],
        self:[
          {s:'Review DC privacy and recording laws before installing security cameras in common areas',t:'Before camera installation',d:'DC Code § 23-542',desc:'DC has specific laws governing video and audio recording that apply to condo common areas.',detail:'DC is a one-party consent jurisdiction for audio recording (DC Code § 23-542), but video-only recording in common areas is generally permissible as there is no reasonable expectation of privacy in common hallways, lobbies, and parking areas. Key rules: (1) No cameras in areas with privacy expectation (bathrooms, inside units), (2) Audio recording requires one-party consent — consider video-only cameras, (3) Post signage notifying of camera surveillance, (4) Adopt a camera/surveillance policy via board resolution. Check condominium docs for any restrictions.',ph:'document',ck:['Review DC Code § 23-542 recording laws','Confirm no cameras in privacy areas','Post surveillance signage in camera areas','Adopt camera/surveillance policy via board resolution']},
          {s:'Pursue small claims action against identified perpetrator for property damage to common areas',t:'After police investigation and demand',d:'DC Superior Court Small Claims (limit $10,000)',desc:'When the perpetrator is identified and refuses to pay for damage, file in small claims court.',detail:'File at DC Superior Court, 510 4th St NW. Bring: police report (CCN), photos of damage, repair invoices, demand letter. Filing fee approximately $15-$65. No attorney required for claims up to $10,000.',ph:'act'},
          {s:'File insurance claim for theft or vandalism damage to common elements',t:'Within policy reporting period',d:'Insurance policy',desc:'Association master policy typically covers vandalism and theft damage to common elements.',detail:'File claim with association property/casualty insurer. Provide: police report with CCN, photos, repair estimates, inventory of damaged/stolen property. Check deductible — may not be worth filing for minor damage. Individual unit theft is the owner HO-6 policy responsibility.',w:'Common element damage = association policy. Unit interior theft = owner HO-6 policy.',ph:'close'}
        ],
        legal:[
          {s:'Attorney advises on security camera privacy requirements and drafts surveillance policy',t:'Before camera installation',d:'DC Code § 23-542 & Fair Housing Act',desc:'Attorney ensures camera placement and policies comply with DC privacy law and fair housing requirements.',detail:'Attorney reviews: (1) Camera placement plan for privacy compliance, (2) Audio vs. video-only implications under DC Code § 23-542, (3) Data retention and access policies, (4) Fair housing implications (cameras must not target specific groups), (5) Drafts board resolution adopting surveillance policy.',ph:'document'},
          {s:'Attorney pursues claims against perpetrators or negligent security vendors',t:'When perpetrator identified or vendor negligent',d:'DC Superior Court',desc:'Attorney files civil action for property damage recovery or vendor breach of contract.',detail:'Attorney evaluates: (1) Civil claims against identified perpetrators, (2) Breach of contract claims against security companies, (3) Negligence claims for inadequate security if vendor contracted, (4) Insurance subrogation coordination.',ph:'act'}
        ],
        notes:{
          'DC':'DC Code § 23-542: DC is one-party consent for audio recording. Video-only surveillance of common areas is generally permissible — no reasonable expectation of privacy in lobbies, hallways, parking. Must post signage. MPD non-emergency: 311. File police reports online at mpdc.dc.gov. Small claims limit $10,000 at DC Superior Court (510 4th St NW).',
          '_':'Balance security needs with privacy rights. Post camera signage. Adopt a written surveillance policy. Preserve footage promptly — many systems auto-overwrite. Report criminal activity to police immediately.'
        }
      }
    ]
  },
  { id:'strategic', num:'8', icon:'📐', label:'Strategic Decisions', color:'indigo',
    sits: [
      { id:'capital-projects', title:'Major Capital Projects', desc:'Window, siding replacement, elevator modernization',
        tags:['Window replacement','Siding','Elevator modernization','Capital improvement'],
        pre:[
          {s:'Commission engineering study or professional assessment to define scope, urgency, and whether the project can be phased',t:'6-12 months before project',detail:'Engage a licensed engineer or specialist. Report should include: scope, urgency rating (can it wait 1-2 years?), estimated cost range, recommended timeline, and whether the work can be broken into phases (e.g., elevator #1 this year, #2 next year; east facade this year, west next year). Phasing is the #1 way to reduce per-unit financial impact.',ph:'assess'},
          {s:'Develop detailed project scope, specifications, and timeline for bidding',t:'3-6 months out',detail:'Scope should be detailed enough for apples-to-apples bidding. Include performance standards, warranty requirements, and completion timeline. If phasing, clearly define Phase 1 scope.',ph:'assess',ck:['Define detailed scope','Set performance standards','Define warranty requirements','Set completion timeline']},
          {s:'Obtain minimum 3 competitive bids from qualified, licensed, and insured contractors',t:'2-3 months out',detail:'Verify: state/local contractor license, general liability insurance ($1M+), workers comp, bonding capacity. Check references on similar projects. Require bids on identical scope.',ph:'assess',ck:['Obtain bid 1','Obtain bid 2','Obtain bid 3','Verify licenses and insurance for each','Check references for each'],requiresBids:true,minimumBids:3},
          {s:'Board evaluates bids on qualifications, references, price, and timeline — not lowest price alone',t:'Board meeting',d:'Fiduciary duty of care',detail:'Document evaluation criteria and rationale. Lowest bid is not always best — consider experience, warranty, financial stability, and how they handle change orders. Record decision in minutes.',ph:'fund'},
          {s:'FUNDING STRATEGY: Now that you have actual bids, choose the funding strategy that balances cost, timeline, and owner impact',t:'After bid evaluation',d:'Fiscal Lens: Spending Decisions',detail:'Open Fiscal Lens → Spending Decisions or use the inline analysis below. Enter the actual bid amount to see strategy options: reserves direct, phasing, increased contributions, HOA loan, special assessment, or a combination. Each strategy shows pros/cons, approval requirements, and downstream steps.',w:'Use actual bid amounts — not estimates — for accurate strategy analysis',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Strategies'},ph:'fund',ck:['Evaluate reserves-only option','Evaluate phasing option','Evaluate HOA loan option','Evaluate special assessment option','Select optimal strategy'],isSpendingDecision:true},
          {s:'Board approves project from reserves for designated reserve items with sufficient funding',t:'Board meeting',d:'Reserve study & Bylaws',detail:'When the project matches a component in your reserve study AND reserves can cover it while staying above 30% funded, the board can approve without owner vote. This is the simplest path — no special assessment, no owner impact. Check bylaws to confirm.',w:'Applies when funding strategy is reserves-only and reserves are sufficient',ph:'fund',requiresConflictCheck:true},
          {s:'Calculate per-unit special assessment impact and design payment options',t:'With funding decision',detail:'Per-unit allocation must follow the percentage interest in the Declaration (NOT equal split). For assessments over $1,000/unit, always offer an installment plan (3-12 months). For assessments over $5,000/unit, consider 12-24 month payment plans and a hardship provision. Present owners with the total cost, per-unit share, and at least 2 payment options.',w:'Required when selected strategy includes a special assessment component',ph:'fund'},
          {s:'Send owner notice with project scope, cost, funding options, and per-unit impact',t:'30-60 days before vote',d:'Bylaws: Notice & DC Code § 29-1135.03',detail:'Notice must clearly explain: (1) What work is needed and why, (2) What happens if we delay, (3) Total cost and per-unit cost, (4) How it will be paid for, (5) Payment options available to owners, (6) Meeting date for vote. Present in plain language — not accounting jargon.',w:'Required when project cost exceeds board spending authority per bylaws — DC Code § 29-1135.03',ph:'fund',ck:['Explain what work is needed and why','Describe consequences of delay','State total cost and per-unit cost','Explain funding plan','List payment options','Include meeting date for vote']},
          {s:'Hold owner vote; present funding plan with per-unit impact and payment options',t:'At meeting per notice',d:'Bylaws & DC Code § 29-1135.03',detail:'If special assessment needed: typically requires 2/3 owner approval in DC. Present: total cost, per-unit share, payment schedule options, what happens if project is deferred. If using reserves for designated purpose per reserve study: board may approve. Document vote results.',w:'Required when project cost exceeds board spending authority per bylaws',ph:'fund'},
          {s:'Execute contract with performance bond and payment/retention schedule',t:'After all approvals',d:'Best practice for projects > $50K',detail:'Contract should include: detailed scope, fixed price or GMP, payment schedule tied to milestones (not time), 10% retention until final completion, performance bond (100% of contract value for large projects), warranty terms, insurance requirements, indemnification.',ph:'execute',ck:['Finalize contract scope and price','Set milestone payment schedule','Set 10% retention terms','Obtain performance bond','Confirm warranty and insurance terms']},
          {s:'Create Work Order in Fiscal Lens and submit Spending Decision request',t:'Before work begins',d:'Fiscal Lens: Work Orders & Spending Decisions',detail:'Create the WO to track the financial lifecycle: draft → approved → invoiced → paid. This creates the GL entries automatically and gives you a paper trail of the entire project cost.',action:{type:'modal',target:'create-wo',label:'Create Work Order'},ph:'execute',isSpendingDecision:true},
          {s:'Monitor construction; track budget vs actual; flag change orders before approving',t:'Weekly during project',detail:'Require written change orders approved by board before extra work. If change orders push total cost above the original approved amount, you may need additional owner approval per bylaws. Track cumulative change order percentage (flag at 10% of contract).',ph:'execute'},
          {s:'Final inspection, punch list, retention release, and reserve study update',t:'At substantial completion',detail:'Walk the project with contractor and independent inspector. Do not release retention until all punch list items resolved. After completion: update the reserve study to reflect the new component and its useful life — this resets the replacement timeline and affects future reserve contributions.',ph:'close',ck:['Conduct final inspection','Create and resolve punch list','Release retention','Update reserve study with new component life']}
        ],
        self:[
          {s:'Review contract remedies, engage bonding company, and file insurance claim for contractor default',t:'Immediately upon default',d:'Contract terms & DC Code § 28-3901',desc:'When a contractor fails to perform or abandons the project, the association must act quickly to protect its interests.',detail:'Steps: (1) Send written notice of default per contract terms (typically 10-day cure period), (2) If bonded, notify bonding company and file claim — the bond company must arrange completion or pay damages, (3) File insurance claim for any damage from abandoned work, (4) Document all costs incurred due to default (emergency stabilization, re-bidding, delays), (5) File complaint with DC DLCP if contractor is licensed — may result in license action. For DC-licensed contractors, verify license at dcra.dc.gov. Consider DC Consumer Protection Act (§ 28-3901) claim for unfair trade practices.',w:'Required when contractor fails to perform or abandons the project',ph:'execute',ck:['Send written notice of default per contract','Notify bonding company and file bond claim','File insurance claim','Document all costs from default','File complaint with DC DLCP if licensed contractor']},
          {s:'Document reasons for budget overrun, evaluate change orders, and seek additional owner approval if cumulative costs exceed approved amount',t:'When costs exceed budget',d:'Bylaws & DC Code § 29-1135.03',desc:'Budget overruns may require additional owner approval if they push total cost above the original authorized amount.',detail:'Steps: (1) Analyze each change order — was it necessary? was it priced fairly? (2) Determine cumulative overrun as percentage of original contract, (3) If total cost now exceeds the amount owners approved, you likely need additional owner approval per bylaws, (4) Present owners with: original budget, change orders, total revised cost, per-unit impact, (5) Get owner vote per bylaws (typically 2/3 for expenditures above threshold per DC Code § 29-1135.03). Flag at 10% cumulative change orders.',w:'Required when cumulative costs exceed the approved project budget',ph:'fund',ck:['Analyze each change order','Calculate cumulative overrun percentage','Determine if additional owner approval needed','Present revised budget to owners','Obtain additional vote if required']},
          {s:'Post-project: update reserve study to reflect completed improvement and adjusted useful life',t:'Within 60 days of project completion',d:'Reserve study & Fiscal Lens',desc:'Updating the reserve study after a capital project resets the replacement timeline and adjusts future contributions.',detail:'After project completion: (1) Update the reserve study component with actual cost (not estimate), (2) Set new useful life based on manufacturer warranty and engineer recommendation, (3) Recalculate annual reserve contribution for this component, (4) Update Fiscal Lens Reserves tab, (5) Adjust next year budget for revised contribution amounts. This is the most commonly missed step — failing to update the reserve study means future budgets will be inaccurate.',w:'This is critical for accurate future planning — commonly missed step',ph:'close',ck:['Update reserve study with actual cost','Set new useful life for completed component','Recalculate annual reserve contribution','Update Fiscal Lens Reserves tab','Adjust next year budget accordingly']}
        ],
        legal:[
          {s:'Attorney reviews construction contract, bonding requirements, and insurance provisions before execution',t:'Before contract signing',d:'DC Construction Codes & best practice',desc:'Legal review of major contracts protects the association from unfavorable terms and ensures adequate bonding.',detail:'Attorney reviews: (1) Scope of work completeness, (2) Payment terms and retention schedule, (3) Performance bond and payment bond adequacy, (4) Insurance requirements (general liability, workers comp, auto), (5) Indemnification provisions, (6) Change order procedures and limits, (7) Warranty terms, (8) Dispute resolution clause, (9) Lien waiver requirements. For DC: verify contractor is licensed with DLCP and in good standing.',w:'Projects exceeding $50K or per bylaws threshold',ph:'execute'},
          {s:'Attorney advises on owner vote requirements and notice procedures before project commitment',t:'Before committing to project',d:'DC Code § 29-1135.03 & Bylaws',desc:'DC law and bylaws establish spending thresholds above which owner approval is required.',detail:'Attorney evaluates: (1) Board spending authority per bylaws, (2) Whether project cost triggers owner vote requirement, (3) DC Code § 29-1135.03 requirements for expenditures above bylaw thresholds (typically 2/3 vote), (4) Proper notice format and timeline for owner meeting, (5) Quorum requirements, (6) Proxy rules for vote. Attorney may draft the owner notice and resolution.',w:'Project cost exceeds board spending authority per bylaws',ph:'fund'},
          {s:'Attorney reviews change orders with significant cost impact and advises on additional approval requirements',t:'When change orders arise',d:'Contract terms & Bylaws',desc:'Significant change orders may require additional owner approval and always need careful legal review.',detail:'Attorney reviews: (1) Whether change order is within original scope, (2) Pricing reasonableness, (3) Whether cumulative change orders trigger additional owner approval per bylaws, (4) Impact on bonding and insurance, (5) Timeline implications, (6) Whether change order creates grounds for claims against design professional.',w:'Change orders exceed 10% of contract value',ph:'execute'},
          {s:'Attorney advises on special assessment structuring, payment plan terms, and compliance with DC voting requirements',t:'When special assessment is part of funding strategy',d:'DC Code § 29-1135.03 & Bylaws',desc:'Special assessments require careful structuring to comply with DC law and ensure collectability.',detail:'Attorney advises on: (1) Owner vote requirements (typically 2/3 per DC Code § 29-1135.03), (2) Per-unit allocation per Declaration percentage interest, (3) Installment plan terms and interest provisions, (4) Hardship provisions, (5) Collection remedies for non-payment (DC Code § 42-1903.13 lien rights), (6) Recording of assessment lien at DC Recorder of Deeds if needed.',w:'Special assessment over $5K/unit or installment plan over 12 months',ph:'fund'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.03: Expenditures above bylaw thresholds require 2/3 owner vote. Special assessments almost certainly require owner vote. PLANNING AHEAD: Boards that maintain reserves above 70% funded rarely need special assessments. Use the Fiscal Lens Reserves tab and annual budget process to incrementally build reserves toward known capital needs. Check bylaws for board spending authority and borrowing limits.',
          '_':'STRATEGY-FIRST FRAMEWORK: Get bids first, then choose a funding strategy with real numbers. The inline funding analysis shows up to 6 strategies — reserves direct, phasing, increased contributions, HOA loan, special assessment, or a combination — each with pros/cons, approval requirements (board-only vs. owner vote), and per-unit impact. Boards that plan ahead with adequate reserve contributions avoid emergency special assessments.'
        }
      },
      { id:'developer-transition', title:'Developer Transition', desc:'Turnover audits, construction defect claims',
        tags:['Turnover audits','Construction defect claims'],
        pre:[
          {s:'Engage a DC transition attorney experienced in condominium turnover before the developer relinquishes control',t:'6-12 months before turnover or as soon as transition is anticipated',d:'DC Code § 42-1903.02',desc:'Developer must transfer control when required percentage of units are sold. Board must be prepared.',detail:'DC Code § 42-1903.02 requires the developer to transfer control of the association when 75% of units are conveyed (or earlier if bylaws specify). The transition attorney should be engaged well before this milestone. Attorney will: (1) Review Declaration, bylaws, and all amendments for compliance, (2) Advise on board election procedures, (3) Prepare for document and financial turnover, (4) Begin identifying potential construction defect claims before statutes of limitation run.',w:'Do not wait until turnover occurs — engage counsel early to preserve claims and prepare the incoming board',ph:'assess'},
          {s:'Commission independent engineering inspection of all common elements, building systems, and structural components',t:'At or immediately before turnover',d:'DC Code § 42-1903.02(a)(4)',desc:'Independent inspection identifies construction defects, deferred maintenance, and warranty issues before the developer departs.',detail:'Engage a licensed DC structural engineer and building systems consultant (not one previously used by the developer). Inspect: (1) Structural elements — foundation, framing, balconies, parking structure, (2) Building envelope — roof, windows, siding, waterproofing, (3) Mechanical systems — HVAC, plumbing, electrical, fire suppression, (4) Elevators, (5) Common area finishes. Report should identify defects, code violations, and items needing immediate vs. deferred repair. This report is the basis for warranty and defect claims.',ph:'assess',ck:['Engage independent structural engineer','Inspect structural elements','Inspect building envelope','Inspect mechanical systems','Inspect elevators','Review for code compliance','Obtain written report with prioritized findings']},
          {s:'Audit all financial records: operating accounts, reserve accounts, assessments collected, developer subsidies, and outstanding obligations',t:'At turnover',d:'DC Code § 42-1903.02(a)(5)',desc:'Financial audit reveals whether the developer properly funded reserves and collected assessments.',detail:'Review: (1) All bank statements and reconciliations, (2) Reserve fund balance vs. reserve study projections — developers often underfund reserves, (3) Developer subsidies — were assessments artificially low? What is the true operating cost? (4) Accounts receivable — uncollected assessments from developer-owned units, (5) Outstanding contracts and obligations being assumed, (6) Tax filings and insurance policies. Engage a CPA experienced in condo associations for this audit.',w:'Developers frequently underfund reserves and subsidize operating costs — the real assessment level may be significantly higher than what owners have been paying',ph:'fund',ck:['Audit all bank accounts and reconciliations','Compare reserve balance to reserve study','Identify developer subsidies to operating budget','Review accounts receivable including developer-owned units','Inventory all outstanding contracts and obligations','Review tax filings and insurance policies']},
          {s:'Inventory all required turnover documents per DC Code § 42-1903.02(a)',t:'At turnover',d:'DC Code § 42-1903.02(a)',desc:'DC law specifies documents the developer must deliver to the association at transition.',detail:'Required documents per DC Code § 42-1903.02(a): (1) Original Declaration, bylaws, and all amendments, (2) Minute books and resolutions, (3) Financial records and tax returns, (4) Insurance policies, (5) All contracts and warranties, (6) Plans, specifications, and as-built drawings, (7) Association seal and records, (8) List of all owners and contact information, (9) Building permits and certificates of occupancy, (10) Reserve study, (11) Inventory of association personal property. Create a checklist and document receipt of each item.',ph:'fund',ck:['Receive Declaration, bylaws, and amendments','Receive minute books and resolutions','Receive financial records and tax returns','Receive insurance policies','Receive all contracts and warranties','Receive plans, specs, and as-built drawings','Receive building permits and certificates of occupancy','Receive reserve study','Receive inventory of association property']},
          {s:'Identify construction defects and pursue warranty claims within DC statute of limitations',t:'Within 3 years of discovery (DC statute of limitations)',d:'DC Code § 12-301(8) & § 42-1903.17',desc:'DC provides specific time limits for construction defect claims — act promptly to preserve rights.',detail:'DC statute of limitations for construction defects: 3 years from discovery of the defect (DC Code § 12-301(8)). However, DC Code § 42-1903.17 tolls the statute of limitations for claims the association could bring until the period of developer control ends — this is a critical protection. Claims may include: (1) Design defects, (2) Construction defects, (3) Material defects, (4) Code violations, (5) Misrepresentation in offering documents. Pursue warranty claims first (typically 1-2 year warranty from developer). For latent defects, the statute may not begin running until the defect is discovered or should have been discovered.',w:'Statute of limitations is tolled during developer control per DC Code § 42-1903.17 — but begins running at turnover for known defects',ph:'execute',ck:['Catalog all defects from engineering report','Identify warranty coverage periods','Submit warranty claims to developer','Document defects discovered post-turnover','Track statute of limitations deadlines']},
          {s:'Pursue defect remediation: negotiate with developer, invoke warranty, or prepare for litigation',t:'After inspection and defect identification',d:'DC Code § 42-1903.17',desc:'Work with transition attorney to resolve construction defects through negotiation, warranty, or legal action.',detail:'Priority order: (1) Negotiate directly with developer for voluntary remediation — often the fastest path, (2) Invoke warranty provisions (manufacturer warranties may extend beyond developer warranty), (3) Mediation — less expensive than litigation, (4) File suit in DC Superior Court if developer refuses to remediate. For large defect claims ($100K+), consider hiring a construction defect litigation firm on contingency. Common DC condo defects: water infiltration, HVAC undersizing, parking garage waterproofing, elevator deficiencies, fire suppression issues.',ph:'close',ck:['Present defect report to developer with remediation demand','Negotiate voluntary remediation','Invoke manufacturer warranties where applicable','Evaluate mediation vs. litigation','File suit if developer refuses remediation']}
        ],
        self:[
          {s:'Document all defects with photos, expert reports, and timeline — preserve evidence systematically',t:'Ongoing from turnover',d:'DC Code § 42-1903.17',desc:'Thorough documentation is the foundation of any warranty or defect claim against the developer.',detail:'Create a master defect log: (1) Each defect with photos, (2) Date discovered, (3) Location (common element, limited common element, unit), (4) Expert opinion on cause, (5) Estimated repair cost, (6) Warranty status. Preserve all communications with the developer. Do not allow the developer to destroy evidence or remove records. Keep originals of all turnover documents.',ph:'assess',ck:['Create master defect log with photos','Record discovery date for each defect','Obtain expert opinion on cause','Estimate repair costs','Preserve all developer communications']},
          {s:'Send formal written warranty claim to developer with defect report and demand for remediation',t:'Within warranty period',d:'Warranty provisions & DC Code § 42-1903.17',desc:'Formal warranty claim preserves rights and starts the negotiation process.',detail:'Send via certified mail to developer registered agent. Include: (1) Defect report from independent engineer, (2) Photos and documentation, (3) Specific warranty provisions invoked, (4) Demand for remediation within 30 days, (5) Notice that association reserves all rights under DC Code § 42-1903.17. Keep proof of delivery.',ph:'execute',ck:['Draft warranty claim letter','Attach independent engineer report','Cite specific warranty provisions','Demand remediation within 30 days','Send via certified mail to registered agent']},
          {s:'If developer fails to remediate, file complaint with DC Attorney General Consumer Protection and consider DC Superior Court action',t:'After warranty demand period expires',d:'DC Code § 28-3901 (Consumer Protection)',desc:'DC Consumer Protection Procedures Act provides additional remedies for condo purchasers against developers.',detail:'File complaint with DC Office of the Attorney General, Consumer Protection Division. DC Code § 28-3901 et seq. provides treble damages for unfair trade practices — construction defect claims against developers may qualify. For court action, file in DC Superior Court (510 4th St NW). For claims under $10,000, small claims is available. For larger claims, Civil Division with attorney recommended.',w:'DC Consumer Protection Act allows treble damages — this creates significant leverage against developers',ph:'close'}
        ],
        legal:[
          {s:'Transition attorney manages entire turnover process: document review, financial audit, defect identification, and claim preservation',t:'From engagement through turnover completion',d:'DC Code § 42-1903.02',desc:'Transition attorney ensures the board receives everything required by DC law and preserves all claims against the developer.',detail:'Attorney manages: (1) Pre-turnover preparation and board training, (2) Document inventory per § 42-1903.02(a), (3) Coordination with independent engineer and CPA, (4) Evaluation of potential claims, (5) Statute of limitations tracking, (6) Negotiation with developer on defect remediation. This is the single most important legal engagement for a new condo association.',w:'Every developer turnover should involve an experienced transition attorney — this is not optional',ph:'assess'},
          {s:'Attorney pursues construction defect claims through negotiation, mediation, or litigation in DC Superior Court',t:'After defects identified',d:'DC Code § 42-1903.17 & § 12-301(8)',desc:'Attorney prosecutes warranty and defect claims against the developer, design professionals, and contractors.',detail:'Attorney evaluates: (1) Warranty claims against developer, (2) Negligence claims against architect/engineer, (3) Claims against general contractor and subcontractors, (4) Consumer protection claims under DC Code § 28-3901 (treble damages), (5) Insurance coverage for defect repairs. May pursue claims in DC Superior Court or through binding arbitration if required by purchase agreements. For large claims, may engage on contingency basis.',ph:'execute'},
          {s:'Attorney reviews ongoing developer obligations: warranties, unsold unit assessments, and common element completion',t:'Post-turnover ongoing',d:'DC Code § 42-1903.02 & Declaration',desc:'Developer obligations do not end at turnover — attorney ensures ongoing compliance.',detail:'Post-turnover developer obligations: (1) Assessment payments on unsold units, (2) Completion of common elements promised in offering documents, (3) Warranty obligations per Declaration, (4) Correction of code violations, (5) Compliance with any settlement agreements. Attorney monitors compliance and enforces through demand letters or court action.',ph:'close'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.02: Developer must transfer control at 75% sold. § 42-1903.02(a) lists required turnover documents. § 42-1903.17 tolls statute of limitations during developer control — claims preserved until turnover. § 12-301(8): 3-year statute of limitations for construction defects from discovery. § 28-3901: Consumer Protection Act allows treble damages against developers. File complaints with DC Attorney General Consumer Protection Division.',
          '_':'Developer turnovers are the most critical moment in a condo association life. Engage an experienced transition attorney early. Commission independent inspections. Audit all financials. Document everything. Do not rely on developer representations — verify independently.'
        }
      }
    ]
  },
  { id:'crisis', num:'9', icon:'🚨', label:'Crisis', color:'red',
    sits: [
      { id:'structural-safety', title:'Structural Safety Issues', desc:'Balcony collapses, foundation shifts, unsafe conditions',
        tags:['Balcony collapses','Foundation shifts','Unsafe conditions'],
        pre:[
          {s:'Evacuate affected areas immediately — ensure all residents are safe and restrict access',t:'Immediately',desc:'Life safety is the absolute priority. Evacuate first, investigate second.',detail:'(1) Call 911 if anyone is injured or in danger, (2) Activate building emergency plan if one exists, (3) Evacuate affected units and common areas, (4) Restrict access with physical barriers and signage, (5) Account for all residents if possible, (6) Do not allow re-entry until cleared by structural engineer. For building-wide emergencies, DC FEMS (Fire and Emergency Medical Services) will establish an incident command.',w:'Do not allow anyone to re-enter affected areas until a licensed structural engineer clears them',ph:'respond',ck:['Call 911 if injuries or imminent danger','Evacuate affected areas','Restrict access with barriers and signage','Account for all residents','Activate building emergency plan']},
          {s:'Engage a licensed DC structural engineer for emergency assessment within hours',t:'Within hours',d:'DC Construction Codes (12-A DCMR)',desc:'Emergency structural assessment determines whether the building is safe to occupy.',detail:'Contact a licensed DC structural engineer (PE) for emergency response. Many firms offer 24/7 emergency service. Engineer will: (1) Assess immediate structural integrity, (2) Determine if building is safe to occupy, (3) Recommend immediate stabilization measures (shoring, bracing), (4) Identify areas that must remain restricted, (5) Provide written preliminary report. If no engineer available immediately, DC FEMS structural collapse team can provide initial assessment.',ph:'respond',ck:['Contact licensed DC structural engineer','Request emergency assessment','Obtain preliminary safety determination','Get written preliminary report']},
          {s:'Notify DC Department of Buildings (DOB) and comply with all directives',t:'Immediately — concurrent with engineer engagement',d:'DC Construction Codes (12-A DCMR)',desc:'DC DOB has authority to issue vacate orders, stop work orders, and require emergency repairs.',detail:'Contact DC DOB at (202) 442-4400 or online. DOB may: (1) Dispatch an inspector, (2) Issue a vacate order for unsafe conditions, (3) Require emergency stabilization, (4) Issue violations for code non-compliance. Cooperate fully — DOB orders are legally binding. Failure to comply can result in fines and criminal liability. If DOB issues a vacate order, assist displaced residents with temporary housing information.',w:'DOB vacate orders are legally binding — failure to comply subjects the board to personal liability',ph:'stabilize',ck:['Contact DC DOB at (202) 442-4400','Provide incident details and location','Cooperate with DOB inspection','Comply with all DOB directives','Document all communications with DOB']},
          {s:'Implement structural engineer emergency recommendations — shoring, closures, temporary repairs',t:'Immediately per engineer direction',desc:'Stabilization prevents further damage and protects residents.',detail:'Implement all emergency recommendations from the structural engineer: (1) Install shoring or bracing as specified, (2) Maintain area closures and access restrictions, (3) Monitor for changes (cracks widening, new movement), (4) Install monitoring devices if engineer recommends (crack gauges, tilt sensors). Only use licensed contractors for structural work. Document all stabilization measures with photos and dates.',ph:'stabilize',ck:['Install shoring/bracing per engineer specs','Maintain access restrictions','Install monitoring devices if recommended','Document all stabilization measures','Use only licensed contractors']},
          {s:'Notify insurance carrier and file claim within 24 hours',t:'Within 24 hours',d:'Insurance policy',desc:'Prompt notice to the insurance carrier is critical — late notice can jeopardize coverage.',detail:'Contact association property/casualty insurer immediately. Provide: (1) Description of structural issue, (2) Engineer preliminary report, (3) Photos and documentation, (4) Estimated repair costs if known, (5) Any DOB orders or directives. Request emergency advance if residents are displaced. Review policy for coverage of temporary relocation costs (Loss of Use / Additional Living Expense). Individual unit owners should also notify their HO-6 carriers.',w:'Late notice to insurer can result in claim denial — notify within 24 hours even if full scope is unknown',ph:'resolve',ck:['Notify association insurer','Provide engineer report and photos','Request emergency advance if needed','Review policy for relocation coverage','Advise unit owners to notify HO-6 carriers']},
          {s:'Commission full structural investigation and obtain detailed repair specifications',t:'Within 1 week',d:'DC Construction Codes (12-A DCMR)',desc:'Full investigation determines root cause, full extent of damage, and required repairs.',detail:'Engineer conducts comprehensive investigation: (1) Root cause analysis, (2) Full extent of structural damage, (3) Detailed repair specifications and drawings, (4) Cost estimate for repairs, (5) Timeline for completion, (6) Whether the issue indicates broader building-wide concerns. Report should be sufficient for: DOB compliance, insurance claim support, contractor bidding, and potential legal claims against responsible parties (developer, prior contractor, design professional).',ph:'resolve',ck:['Commission full structural investigation','Obtain root cause analysis','Get detailed repair specifications','Obtain cost estimate and timeline','Assess building-wide implications']}
        ],
        self:[
          {s:'Document everything with timestamped photos, videos, and written records — maintain restricted access until engineer clearance',t:'Ongoing from discovery',desc:'Documentation is essential for insurance claims, DOB compliance, and potential legal action.',detail:'Maintain a contemporaneous log: (1) Timeline of events, (2) All communications with DOB, engineers, contractors, (3) Dated photos and videos of conditions, (4) Records of all expenditures, (5) Resident communications, (6) Engineer reports and recommendations. Do not allow access to restricted areas without engineer clearance — personal liability risk for board members who ignore safety restrictions.',w:'Board members face personal liability for allowing access to areas an engineer has restricted',ph:'respond',ck:['Maintain timestamped event log','Photograph conditions daily','Record all communications','Track all expenditures','Preserve engineer reports']},
          {s:'Assist displaced residents with temporary housing resources and track relocation costs',t:'If residents displaced',desc:'Board has a duty to communicate clearly and assist displaced owners with available resources.',detail:'Provide residents: (1) DC Office of Tenant Advocate resources (for renters in units), (2) American Red Cross emergency housing assistance, (3) Insurance claim information (HO-6 loss of use coverage), (4) Timeline for expected return. Track all association-paid relocation costs for insurance reimbursement. Communicate regularly with displaced residents — weekly minimum.',ph:'stabilize'},
          {s:'Obtain minimum 3 bids for structural repairs and present to board with engineer recommendation',t:'After full investigation complete',d:'Fiduciary duty of care',desc:'Competitive bidding ensures reasonable cost for major structural repairs.',detail:'Structural repairs require licensed DC contractors. Verify: (1) DC contractor license, (2) General liability and workers comp insurance, (3) Bonding capacity, (4) Experience with similar structural repairs, (5) References. Have engineer review all bids for scope compliance. Board selects based on qualifications, not lowest price alone. For emergency repairs already underway, document rationale for sole-source.',ph:'resolve',ck:['Obtain minimum 3 bids','Verify contractor licenses and insurance','Have engineer review bids for scope compliance','Present bids to board with recommendation','Document selection rationale']}
        ],
        legal:[
          {s:'Attorney advises on liability, disclosure requirements, and board member protections',t:'Immediately upon discovery of structural concern',d:'DC Code § 29-1108.01 & DC Construction Codes',desc:'Attorney ensures board fulfills fiduciary duty while managing personal liability exposure.',detail:'Attorney advises on: (1) Board fiduciary duty to act promptly on known safety hazards (DC Code § 29-1108.01), (2) Disclosure obligations to unit owners and prospective buyers, (3) D&O insurance coverage for board members, (4) Compliance with DOB orders, (5) Communication strategy for residents, (6) Document preservation for potential litigation.',w:'Board members have personal fiduciary liability for failing to act on known structural safety hazards',ph:'respond'},
          {s:'Attorney pursues claims against responsible parties — developer, contractor, design professional, or negligent owner',t:'After investigation identifies cause',d:'DC Code § 42-1903.17 & § 12-301(8)',desc:'Attorney evaluates and prosecutes claims against parties responsible for the structural deficiency.',detail:'Attorney evaluates claims against: (1) Developer for construction defects (DC Code § 42-1903.17 tolls statute during developer control), (2) General contractor and subcontractors, (3) Architect or structural engineer who designed the building, (4) Unit owner whose unauthorized modifications caused the issue, (5) Prior repair contractor whose work failed. Statute of limitations: 3 years from discovery (DC Code § 12-301(8)). File in DC Superior Court.',ph:'resolve'},
          {s:'Attorney negotiates with insurance carrier for maximum claim recovery including relocation costs',t:'Concurrent with claim process',d:'Insurance policy',desc:'Attorney ensures full recovery under the policy including disputed items and temporary relocation.',detail:'Attorney handles: (1) Claim presentation and documentation, (2) Dispute resolution with adjuster, (3) Appraisal process if disagreement on value, (4) Recovery of temporary relocation costs, (5) Bad faith claim if carrier unreasonably delays or denies. Coordinates between association master policy and individual HO-6 claims.',ph:'resolve'}
        ],
        notes:{
          'DC':'DC DOB: (202) 442-4400 for structural emergencies. DC FEMS provides emergency response for structural collapse. DC Construction Codes (12-A DCMR) govern structural requirements. DC Code § 29-1108.01: Board fiduciary duty to act on known hazards. § 42-1903.17: Statute tolled during developer control. § 12-301(8): 3-year statute of limitations from discovery for construction defects. DOB vacate orders are legally binding.',
          '_':'Structural safety is paramount — evacuate first, investigate second. Never allow re-entry until a licensed structural engineer clears the area. Board members face personal liability for ignoring known structural hazards. Document everything. Notify insurance within 24 hours.'
        }
      },
      { id:'public-health', title:'Public Health', desc:'Mold, water contamination, pandemic policies',
        tags:['Mold','Water contamination','Pandemic policies'],
        pre:[
          {s:'Assess scope immediately: how many units and common areas are affected? Is anyone symptomatic?',t:'Immediately',desc:'Rapid scope assessment determines the urgency of response and resources needed.',detail:'Determine: (1) Number of units and common areas affected, (2) Nature of the hazard (mold, water contamination, asbestos, lead, pest infestation), (3) Whether residents are reporting health symptoms, (4) Whether the hazard is spreading or contained. For mold: visible mold over 10 sq ft requires professional remediation per EPA guidelines. For water contamination: stop use immediately. For asbestos: do not disturb — seal area and engage abatement professional.',w:'If residents report health symptoms, advise them to seek medical attention and document their complaints',ph:'respond',ck:['Identify all affected areas','Count affected units','Determine if residents are symptomatic','Assess whether hazard is spreading','Classify hazard type']},
          {s:'Engage appropriate licensed professionals: mold remediation, water testing lab, industrial hygienist, or environmental consultant',t:'Within 24 hours',d:'DC DCRA/DLCP licensing requirements',desc:'Only licensed, qualified professionals should assess and remediate health hazards.',detail:'Engage based on hazard type: (1) Mold — licensed mold remediation company + independent mold testing company (testing and remediation must be separate companies), (2) Water contamination — DC-certified water testing lab + DC Water for supply issues, (3) Asbestos — licensed DC asbestos abatement contractor (DLCP license required per DC Asbestos Abatement regulations), (4) Lead paint — EPA RRP-certified contractor, (5) Pest infestation — licensed DC pest control. Get credentials and references before engaging.',ph:'respond',ck:['Identify required professional type','Verify DC licensing and certifications','Engage testing/assessment professional','Ensure testing and remediation are separate companies for mold','Obtain written scope and timeline']},
          {s:'Notify affected residents promptly with clear, factual information and health precautions',t:'Within 24 hours of discovery',d:'Fiduciary duty & DC Code § 42-1903.08',desc:'Transparent communication is both a legal duty and practical necessity for resident safety.',detail:'Written notice to affected residents: (1) Nature of the hazard identified, (2) Areas affected, (3) Health precautions to take (ventilation, avoid area, etc.), (4) What professionals have been engaged, (5) Expected timeline for assessment and remediation, (6) Point of contact for questions. Do not minimize the hazard, but do not speculate beyond what is known. If DC Department of Health (DC Health) is involved, coordinate messaging.',ph:'stabilize',ck:['Draft clear factual notice','Identify areas affected','Include health precautions','Provide expected timeline','Include point of contact']},
          {s:'Implement remediation per professional recommendations — follow EPA and DC Health guidelines',t:'Per professional timeline',d:'EPA guidelines & DC regulations',desc:'Remediation must follow professional protocols and applicable regulations.',detail:'Remediation protocol: (1) Contain the hazard area to prevent spread, (2) Protect workers and residents (HVAC isolation, negative air pressure for mold/asbestos), (3) Remove contaminated materials per protocol, (4) Clean and treat affected areas, (5) Address root cause (water intrusion for mold, pipe replacement for contamination), (6) Allow proper drying time. For mold: EPA recommends containment for areas over 10 sq ft. For asbestos: follow DC Asbestos Abatement regulations (DCMR Title 20, Chapter 8). For lead: follow EPA RRP Rule.',w:'Addressing symptoms without fixing the root cause guarantees recurrence — always identify and fix the source',ph:'stabilize',ck:['Contain hazard area','Protect workers and residents','Remove contaminated materials per protocol','Address root cause','Allow proper drying/clearance time']},
          {s:'Obtain clearance testing from independent laboratory and provide results to all affected parties',t:'After remediation complete',desc:'Independent clearance testing confirms the hazard has been successfully remediated.',detail:'Clearance testing must be performed by a company independent of the remediation contractor. For mold: air and surface sampling confirming spore counts at or below outdoor ambient levels. For water: lab testing confirming contaminant levels below EPA standards. For asbestos: air monitoring confirming fiber counts below 0.01 f/cc. Provide written clearance report to: (1) All affected unit owners, (2) Board, (3) Insurance carrier, (4) DC Health if they were involved. Retain reports permanently.',ph:'resolve',ck:['Engage independent testing company','Obtain clearance test results','Confirm levels meet EPA/DC standards','Distribute clearance report to affected owners','File reports in association records permanently']}
        ],
        self:[
          {s:'Cooperate fully with DC Department of Health and document all compliance actions',t:'Throughout process',d:'DC Health regulations',desc:'DC Health has authority to investigate health hazards and order remediation in condominiums.',detail:'DC Health (formerly DC DOH) may become involved through: resident complaint, mandatory reporting, or association request. Cooperate fully: (1) Provide access for inspections, (2) Share test results and professional reports, (3) Follow all orders and directives, (4) Document compliance with each directive. DC Health orders are legally binding. Contact DC Health at (202) 442-5955 or online for guidance on specific hazards.',w:'DC Health orders are legally binding — failure to comply can result in fines and legal action',ph:'respond',ck:['Provide access for all inspections','Share test results and reports','Follow all DC Health directives','Document compliance with each order','Maintain communication log with DC Health']},
          {s:'File insurance claim for remediation costs and coordinate with unit owner HO-6 policies',t:'Within policy reporting period',d:'Insurance policy',desc:'Association master policy may cover common element remediation; unit owner HO-6 covers unit interiors.',detail:'File claim with association property/casualty insurer for common element remediation. Provide: (1) Professional assessment report, (2) Scope of remediation, (3) Cost estimates or invoices, (4) Clearance testing results. Advise affected unit owners to file HO-6 claims for their unit interiors. Note: many policies exclude mold unless it results from a covered peril (e.g., burst pipe). Review policy carefully.',ph:'stabilize'},
          {s:'Address root cause to prevent recurrence — repair water intrusion, replace pipes, upgrade ventilation',t:'Concurrent with or after remediation',desc:'Remediation without addressing root cause is wasted money — the problem will return.',detail:'Root cause by hazard type: (1) Mold — almost always water intrusion (roof leak, pipe leak, condensation, poor ventilation), (2) Water contamination — aging pipes (lead, copper), cross-connections, backflow, (3) Pest infestation — entry points, sanitation, structural gaps. Budget for root cause repairs as capital expense. Update reserve study to reflect any major system repairs.',ph:'resolve',ck:['Identify root cause','Budget for root cause repairs','Complete root cause remediation','Verify fix with follow-up testing','Update reserve study if applicable']}
        ],
        legal:[
          {s:'Attorney advises on disclosure obligations, remediation standards, and liability exposure',t:'When health hazard identified',d:'DC Code § 42-1903.09 & DC Health regulations',desc:'Attorney ensures the board meets its legal obligations and minimizes liability.',detail:'Attorney advises on: (1) Duty to disclose known health hazards to all owners (not just affected units), (2) Remediation standards applicable under DC and federal law, (3) Board fiduciary liability for delayed action, (4) Insurance coverage and claim strategy, (5) Disclosure requirements for resale certificates per DC Code § 42-1904.04, (6) Communication strategy to avoid admissions of liability while maintaining transparency.',ph:'respond'},
          {s:'Attorney pursues claims against responsible parties if hazard resulted from negligence or defective construction',t:'After root cause identified',d:'DC Code § 42-1903.17 & § 12-301(8)',desc:'If the hazard was caused by construction defects, contractor negligence, or another party, attorney pursues recovery.',detail:'Attorney evaluates: (1) Construction defect claims against developer (if within statute period — § 42-1903.17 tolls during developer control), (2) Negligence claims against contractors whose work caused the hazard, (3) Claims against unit owners whose negligence caused common area contamination, (4) Manufacturer liability for defective materials (e.g., defective plumbing). File in DC Superior Court (510 4th St NW).',ph:'resolve'}
        ],
        notes:{
          'DC':'DC Health: (202) 442-5955 for health hazard reporting and guidance. DC Water: (202) 354-3600 for water quality concerns. DC Asbestos Abatement: DCMR Title 20, Chapter 8 — licensed abatement contractors required. Lead paint: EPA RRP Rule applies; DC also has lead-safe housing requirements. Mold: no DC-specific mold statute, but EPA guidelines and fiduciary duty apply. DC Code § 42-1904.04: Known health hazards must be disclosed in resale certificates.',
          '_':'Public health issues require prompt, transparent communication and qualified professionals. Always address the root cause, not just the symptoms. Independent clearance testing (separate from remediation contractor) is essential. Document everything for insurance and legal purposes.'
        }
      }
    ]
  },
  { id:'admin', num:'10', icon:'📁', label:'Administrative', color:'slate',
    sits: [
      { id:'compliance-filing', title:'Compliance Filings', desc:'Regulatory filings and compliance deadlines',
        tags:['Regulatory filings','Annual reports','Government submissions'],
        pre:[
          {s:'Identify filing requirement and deadline',t:'As needed',d:'DC Code § 29-102.11',detail:'DC condos must file a Biennial Report with DCRA (now DLCP). Also check for sales tax, personal property tax, and business license renewals.',ph:'receive'},
          {s:'Gather required documentation: financial statements, officer/agent updates, registered agent confirmation',t:'2-4 weeks before deadline',detail:'If incorporated, ensure registered agent is current with DC Department of Licensing and Consumer Protection (DLCP).',ph:'receive',ck:['Gather financial statements','Confirm officer/agent information','Verify registered agent']},
          {s:'Complete forms and prepare submission via online portal',t:'1-2 weeks before deadline',d:'DLCP / MyTax.DC.gov',detail:'DC Biennial Report filed online at DLCP. Tax filings via MyTax.DC.gov. Keep login credentials secure with Treasurer.',ph:'process'},
          {s:'Board review and sign-off on filing',t:'Board meeting',d:'Bylaws: Officer duties',w:'Required when bylaws mandate board approval for official filings',ph:'process'},
          {s:'Submit filing to appropriate agency and pay any required fees',t:'Before deadline',detail:'DC Biennial Report fee varies. Late filing can result in administrative dissolution of the entity.',ph:'deliver'},
          {s:'Confirm receipt and save confirmation number/receipt',t:'Within days of submission',ph:'deliver'},
          {s:'File copy of submission and confirmation in association records',t:'Immediately',d:'Document retention policy',ph:'deliver'}
        ],
        self:[
          {s:'Review deficiency notice, correct errors, and resubmit promptly for rejected filings',t:'Within 10 business days of rejection',d:'DC Code § 29-102.11',desc:'Agencies may reject filings for errors, missing information, or incorrect fees — prompt correction avoids penalties.',detail:'Review the rejection notice carefully: (1) Identify specific deficiencies cited, (2) Correct all errors, (3) Gather any missing documentation, (4) Resubmit with corrected information and any additional fees. For DLCP Biennial Report rejections, contact DLCP at (202) 442-4400. For tax filing issues, contact MyTax.DC.gov support.',w:'Required when the agency rejects or returns the submission',ph:'process',ck:['Review rejection notice','Identify specific deficiencies','Correct all errors','Resubmit with corrected information']},
          {s:'Maintain a master compliance calendar with reminders 60 and 30 days before each filing deadline',t:'Set up annually',d:'Best practice',desc:'Proactive calendar management prevents missed deadlines and administrative dissolution.',detail:'Track all recurring filings: (1) DLCP Biennial Report, (2) DC franchise tax / Form FR-16, (3) Federal tax return (Form 1120-H or 990), (4) Personal property tax return, (5) Business license renewals, (6) Insurance policy renewals, (7) Registered agent annual fee. Set calendar reminders at 60 days and 30 days before each deadline. Assign responsibility to a specific board officer.',ph:'deliver',ck:['List all recurring filing deadlines','Set 60-day reminders','Set 30-day reminders','Assign responsibility to board officer']}
        ],
        legal:[
          {s:'Attorney assists with complex filings, disputed requirements, or appeals of agency determinations',t:'As needed',d:'DC Code § 29-102.11',desc:'Some filings require legal interpretation or involve disputes with the regulatory agency.',detail:'Attorney assists when: (1) Filing requirements are unclear or disputed, (2) Agency imposes unexpected requirements, (3) Association needs to appeal an agency determination, (4) Filing involves legal representations about litigation or compliance status. Attorney can also handle annual registered agent filing and entity maintenance.',w:'Filing involves legal interpretation or dispute',ph:'process'},
          {s:'Attorney handles reinstatement of entity administratively dissolved for non-filing',t:'Immediately upon discovery',d:'DC Code § 29-106.02',desc:'DC can administratively dissolve a condo association for failure to file — reinstatement requires legal process.',detail:'Per DC Code § 29-106.02, an entity dissolved for non-filing can be reinstated by: (1) Filing all delinquent reports, (2) Paying all fees and penalties, (3) Filing an application for reinstatement with DLCP. During dissolution, the association cannot sue, enter contracts, or enforce assessments — this is an emergency. Attorney files reinstatement application and advises on actions taken during dissolution period.',w:'Missed deadline resulted in administrative dissolution — association cannot enforce assessments or contracts until reinstated',ph:'deliver'}
        ],
        notes:{
          'DC':'DC condos organized as nonprofits must file a Biennial Report with DLCP (formerly DCRA) per DC Code § 29-102.11. Late filing can lead to administrative dissolution per § 29-106.02. Reinstatement requires filing + penalty. Also: Form FR-16 (franchise tax exemption may apply), UCC filings for liens via DC Recorder of Deeds.',
          '_':'Maintain a calendar of all regulatory filing deadlines. Many jurisdictions impose penalties for late filings.'
        }
      },
      { id:'record-requests', title:'Record Requests', desc:'Owner inspection requests, financial transparency',
        tags:['Owner inspection requests','Financial transparency disputes'],
        pre:[
          {s:'Receive written request and log date received',t:'Upon receipt',d:'DC Code § 42-1903.14',detail:'DC owners have statutory right to inspect association records. Log the exact date — this starts the response clock.',ph:'receive'},
          {s:'Acknowledge receipt to the requesting owner within 3 business days',t:'3 business days',detail:'Written acknowledgment (email is sufficient). Confirm scope of request and expected timeframe.',ph:'receive'},
          {s:'Identify requested records and review for applicable exemptions',t:'3-5 days',d:'DC Code § 42-1903.14(b)',detail:'Exemptions are narrow: attorney-client privilege, individual owner payment records (of other owners), personnel records. When in doubt, disclose.',ph:'process',ck:['Identify all requested records','Review for attorney-client privilege','Review for individual owner payment records','Review for personnel records']},
          {s:'Arrange inspection at reasonable time and place, or prepare copies',t:'Within 5 business days of request',d:'DC Code § 42-1903.14',detail:'DC requires records be available within 5 business days. May charge reasonable copying costs (per page). Electronic delivery preferred for efficiency.',ph:'process'},
          {s:'Provide records and document what was delivered',t:'Within 5 business days',detail:'Retain a log entry: date, owner, records requested, records provided, any items withheld with reason.',ph:'deliver'},
          {s:'Provide written explanation citing specific statutory exemption for any withheld records',t:'With response',d:'DC Code § 42-1903.14(b)',detail:'Must cite the specific exemption relied upon. Vague denials are not legally defensible.',w:'Required when any requested records are withheld — exemptions are narrow per DC Code',ph:'deliver'}
        ],
        self:[
          {s:'Review DC Code § 42-1903.14 and provide additional explanation when owner disputes a records denial',t:'Within 5 business days of dispute',d:'DC Code § 42-1903.14',desc:'DC courts strongly favor owner access to records — denials must be narrowly justified.',detail:'If an owner challenges a denial: (1) Re-review the specific exemption relied upon — exemptions are limited to attorney-client privilege and individual owner payment records, (2) Consult attorney before maintaining the denial, (3) Provide written explanation with specific statutory citation, (4) Consider providing the records rather than risking a court petition — DC Code § 42-1903.14(c) allows the prevailing owner to recover attorney fees.',w:'Required when owner challenges a records access denial — DC courts award attorney fees to prevailing owner',ph:'process',ck:['Re-review exemption claimed','Consult attorney before maintaining denial','Provide written explanation with statutory citation','Consider providing records to avoid litigation']},
          {s:'Maintain an inspection log documenting all records requests, responses, and dates',t:'Ongoing',d:'Best practice',desc:'A records access log protects the association by documenting compliance with DC statutory timelines.',detail:'Log each request: (1) Date received, (2) Owner name and unit, (3) Records requested, (4) Date acknowledged, (5) Date provided, (6) Records provided (list), (7) Any items withheld with reason, (8) Method of delivery. Retain log permanently. This log is the association primary defense if an owner claims records were not provided.',ph:'deliver',ck:['Log date received','Log owner name and unit','Log records requested','Log date provided','Note any items withheld with reason']}
        ],
        legal:[
          {s:'Attorney advises on privileged documents, access rights, and scope of disclosure obligations',t:'When denial is contemplated or dispute arises',d:'DC Code § 42-1903.14(b)',desc:'Attorney evaluates whether the claimed exemption is legally defensible before the association denies access.',detail:'Attorney reviews: (1) Whether requested records are within the scope of § 42-1903.14, (2) Whether attorney-client privilege applies (narrow — must be actual legal advice, not business communications), (3) Whether individual owner payment records of other owners may be redacted, (4) Whether redaction (rather than denial) can address privacy concerns while providing access. Attorney advises that overbroad denials create litigation risk.',w:'Sensitive records or dispute — overbroad denial creates significant litigation risk',ph:'process'},
          {s:'Attorney defends or negotiates resolution of records access lawsuit filed by owner per DC Code § 42-1903.14(c)',t:'Upon receipt of suit',d:'DC Code § 42-1903.14(c)',desc:'DC allows owners to petition the court for records access — prevailing owner recovers attorney fees.',detail:'If owner files suit: (1) Attorney evaluates whether to provide records immediately to limit attorney fee exposure, (2) If denial was justified, attorney defends, (3) DC Code § 42-1903.14(c) awards attorney fees to the prevailing party — if the owner prevails, the association pays their attorney fees, (4) Attorney negotiates settlement including scope of access and fee payment. Prevention is far less expensive than litigation — when in doubt, provide access.',w:'Owner files suit per DC Code § 42-1903.14(c) — prevailing owner recovers attorney fees from association',ph:'deliver'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.14: Owners may inspect and copy association records within 5 business days of written request. Association may charge reasonable copying fees. Exemptions limited to attorney-client privilege. If association fails to comply, owner may petition court — prevailing owner recovers attorney fees. Broad scope: financials, minutes, contracts, insurance, correspondence.',
          '_':'Most states grant broad access with specific response timelines. Exemptions limited to attorney-client privilege. Document everything provided.'
        }
      },
      { id:'resale-certs', title:'Resale Certificates', desc:'Preparing disclosure documents for unit sales',
        tags:['Preparing disclosure documents','Resale package','Estoppel certificate'],
        pre:[
          {s:'Receive written request from selling owner or their agent; log date received and collect permitted processing fee',t:'Upon request',d:'DC Code § 42-1904.11',detail:'Starts the 10 business day clock. Request should specify unit number and settlement date. Collect the processing fee at time of request so the charge is reflected on the unit ledger before the financial summary is compiled. Fee must not exceed statutory maximum.',ph:'receive',ck:['Log date received','Verify unit number and settlement date','Collect processing fee','Confirm fee does not exceed statutory maximum']},
          {s:'Verify unit account status: current assessments, outstanding balances, late fees, special assessments',t:'1-2 business days',d:'DC Code § 42-1903.13',detail:'Pull unit ledger from Fiscal Lens. Confirm no pending disputes or credits. Processing fee from step 1 should already be reflected.',ph:'receive',ck:['Check current assessments','Review outstanding balances','Check late fees','Check special assessments','Confirm no pending disputes or credits']},
          {s:'Compile required financial documents: current budget, most recent audited/reviewed financial statement, reserve study summary',t:'2-3 business days',d:'DC Code § 42-1904.04(a)',detail:'Budget must be the currently adopted version. Financial statement per § 42-1903.18. Include reserve funding plan. Generate each document from Fiscal Lens or upload an externally sourced copy.',ph:'process',ck:['Include current adopted budget — generate or upload','Include most recent financial statement — generate or upload','Include reserve study summary — generate or upload']},
          {s:'Compile governing documents: Bylaws, CC&Rs/Declaration, Rules & Regulations, Articles of Incorporation',t:'1-2 business days',d:'Bylaws & DC Code § 42-1904.04',detail:'Include all amendments. Verify versions are current per Legal & Bylaws tab. Generate each document from the system or upload the current version.',ph:'process',ck:['Include Bylaws with amendments — generate or upload','Include CC&Rs/Declaration — generate or upload','Include Rules & Regulations — generate or upload','Include Articles of Incorporation — generate or upload']},
          {s:'Compile compliance documents: insurance certificate (master policy), pending litigation disclosure, planned capital improvements',t:'2-3 business days',d:'DC Code § 42-1904.04(a)',detail:'Insurance cert must name coverage amounts. Litigation disclosure includes all pending or threatened actions. Generate each document from the system or upload externally sourced copies.',ph:'process',ck:['Obtain insurance certificate with coverage amounts — generate or upload','Prepare pending litigation disclosure — generate or upload','List planned capital improvements — generate or upload']},
          {s:'Disclose any special assessments (current or planned), right of first refusal, and transfer/move-in fees',t:'With certificate',d:'DC Code § 42-1904.04(a)(9)',detail:'Include board resolutions for any approved special assessments not yet billed. Generate disclosure documents from the system or upload externally sourced copies.',ph:'process',ck:['Disclose current special assessments — generate or upload','Disclose planned special assessments — generate or upload','Note right of first refusal — generate or upload','List transfer/move-in fees — generate or upload']},
          {s:'Prepare the resale certificate cover letter with unit-specific financial summary',t:'1-2 business days',detail:'Use the Resale / Estoppel Certificate letter template. Include: monthly assessment amount, outstanding balance, prepaid credits, next due date.',ph:'process',ck:['Include monthly assessment amount','Include outstanding balance','Include prepaid credits','Include next due date']},
          {s:'Obtain Certificate of Resale from DC mytax.dc.gov',t:'2-3 business days',d:'DC Code § 42-1904.11',detail:'Log in to the association\'s mytax.dc.gov account. Navigate to Sales & Use Tax, select "View Other Options…", then "Certificate of Resale." Complete the required fields and submit. Download the issued certificate and upload it here for inclusion in the resale package.',ph:'process',ck:['Log in to mytax.dc.gov','Navigate to Sales & Use Tax → View Other Options → Certificate of Resale','Complete and submit the certificate request','Upload the issued Certificate of Resale']},
          {s:'Board officer or property manager reviews and signs the certificate',t:'1 business day',d:'Bylaws: Officer duties',detail:'Authorized signatory per bylaws. Certificate must be signed and dated.',ph:'deliver'},
          {s:'Assemble and deliver completed resale package to requestor with all compiled documents attached',t:'Within 10 business days of request',d:'DC Code § 42-1904.11',detail:'DC statutory deadline: 10 business days from date of request. Assemble all generated and uploaded documents from prior steps — financial documents, governing documents, compliance documents, disclosures, cover letter, signed certificate, and DC Certificate of Resale. Send the complete package via the method requested (email with attachments or mail). Retain proof of delivery.',ph:'deliver',ck:['Attach compiled financial documents','Attach compiled governing documents','Attach compiled compliance documents','Attach disclosure documents','Attach signed resale certificate cover letter','Attach DC Certificate of Resale','Send via requested method (email/mail)','Retain proof of delivery']},
          {s:'File a copy of the issued certificate and all enclosed documents in association records; record processing fee for audit',t:'Immediately after issuance',d:'Document retention policy',detail:'Retain for minimum 7 years. Note: certificate is valid for 30 days from date of issuance. Record the processing fee collected in step 1 against the unit ledger for audit trail purposes. Confirm fee payment has been received and reconciled.',ph:'deliver',ck:['File copy of complete resale package','Record processing fee amount and payment status','Confirm fee reconciled on unit ledger','Note certificate expiration date (30 days from issuance)']}
        ],
        self:[
          {s:'Provide supporting documentation (ledger history, board resolutions) when certificate info is disputed',t:'Within 5 business days of dispute',d:'DC Code § 42-1904.11',desc:'Disputes over certificate content can delay settlement — respond promptly with documentation.',detail:'Respond within 5 business days: (1) Provide unit ledger history showing assessment payments, (2) Attach board resolutions for any disputed assessments, (3) If the dispute is about the assessment amount, provide the current budget resolution, (4) If the dispute is about special assessments, provide the owner vote results and resolution. Coordinate with the settlement company. Delayed response may cause the buyer to exercise rescission rights.',w:'Required when buyer or seller disputes information in the certificate',ph:'deliver',ck:['Provide unit ledger history','Attach relevant board resolutions','Coordinate with settlement company','Respond within 5 business days']},
          {s:'Prioritize late or urgent requests — apply expedited processing fee per governing docs if authorized',t:'Within 3 business days for expedited',d:'DC Code § 42-1904.11 & Rules',desc:'When settlement is imminent, expedited processing avoids delays but the fee must be authorized.',detail:'Standard deadline is 10 business days. For urgent requests: (1) Verify expedited fee is authorized by governing docs, (2) Collect fee before beginning, (3) Prioritize document compilation, (4) Target 3-5 business day delivery. Failure to deliver on time can delay closings and create liability for the association.',w:'Applies when settlement date is imminent and standard timeline is insufficient',ph:'process'},
          {s:'Maintain a checklist template of all required documents per DC Code § 42-1904.04(a) to ensure completeness',t:'Maintain annually',d:'DC Code § 42-1904.04(a)',desc:'A standardized checklist prevents omissions that could trigger buyer rescission rights.',detail:'Checklist template should include all items required per § 42-1904.04(a): current budget, most recent financial statement, reserve study summary, bylaws with amendments, Declaration, rules, articles of incorporation, insurance certificate, pending litigation disclosure, special assessments, transfer fees, right of first refusal, unit account status. Update template annually or when DC Code changes.',ph:'process',ck:['Include all § 42-1904.04(a) items','Update template annually','Review after any DC Code changes']},
          {s:'Track all issued certificates in a log: unit, request date, issue date, fee charged, recipient',t:'Ongoing',d:'Best practice',desc:'A certificate log documents compliance with statutory timelines and provides an audit trail.',detail:'Log fields: (1) Unit number, (2) Requesting party, (3) Date received, (4) Date issued, (5) Fee charged, (6) Recipient name and delivery method, (7) Expiration date (30 days from issuance), (8) Notes (expedited, amended, etc.). Retain log permanently.',ph:'deliver'}
        ],
        legal:[
          {s:'Attorney reviews resale certificate template annually for DC statutory compliance',t:'Annually or after DC Code changes',d:'DC Code § 42-1904.04 & § 42-1904.11',desc:'Annual legal review ensures the certificate template includes all items required by current DC law.',detail:'Attorney reviews: (1) Template includes all items per § 42-1904.04(a), (2) Fee amount does not exceed statutory maximum, (3) Cover letter includes required disclosures, (4) Template reflects any recent DC Code amendments, (5) Litigation disclosure language is adequate.',w:'Annual or after DC Code changes',ph:'process'},
          {s:'Attorney advises on scope and wording of pending litigation disclosure',t:'When active or threatened litigation exists',d:'DC Code § 42-1904.04(a)',desc:'Litigation disclosure must be accurate and complete without making prejudicial admissions.',detail:'Attorney drafts or reviews litigation disclosure: (1) Description of all pending suits, (2) Status and next steps, (3) Potential financial impact, (4) Any threatened actions, (5) Insurance coverage status. Balance between full disclosure (required) and avoiding prejudicial admissions in ongoing litigation.',w:'Active or threatened litigation involving the association',ph:'process'},
          {s:'Attorney reviews buyer rescission claims alleging incomplete or inaccurate disclosure',t:'Upon receipt of rescission notice',d:'DC Code § 42-1904.09',desc:'Buyers have a 3-day rescission right after receiving the resale package — claims of incomplete disclosure can extend this.',detail:'Attorney evaluates: (1) Whether the resale package was complete per § 42-1904.04(a), (2) Whether the 3-day rescission period has expired, (3) Whether any omission or inaccuracy is material, (4) Association potential liability for incomplete disclosure, (5) Whether to negotiate or defend. Inaccurate resale certificates can create liability for the association and potentially the signing officer personally.',w:'Buyer alleges incomplete or inaccurate disclosure per § 42-1904.09',ph:'deliver'}
        ],
        notes:{
          'DC':'DC Code § 42-1904.11: Must deliver within 10 business days. Package must include all items per § 42-1904.04(a): budget, financial statements, reserve study, bylaws, CC&Rs, rules, insurance, pending litigation, special assessments, transfer fees. Buyer has 3-day rescission right after receipt per § 42-1904.09. Fee limits set by statute — check current maximums.',
          '_':'Most states require a resale package/certificate for condo sales. Key items: financial statements, governing documents, insurance, litigation disclosure, unit account status. Check your jurisdiction for required contents, response deadline, fee limits, and buyer rescission rights.'
        }
      },
      { id:'move-disputes', title:'Move-In/Move-Out Disputes', desc:'Deposit disputes, damage claims',
        tags:['Deposit disputes','Damage claims'],
        pre:[
          {s:'Conduct pre-move inspection of common areas; photograph existing conditions',t:'Before move date',d:'Rules: Move policy',detail:'Use a dated checklist. Document hallways, elevators, lobby, and any areas the mover will traverse.',ph:'receive',ck:['Photograph hallways','Photograph elevators','Photograph lobby','Document all areas the mover will traverse']},
          {s:'Collect move-in/move-out deposit per governing documents',t:'Before move date',d:'Bylaws & Rules',detail:'Deposit amount must be authorized by governing docs. Issue a receipt.',ph:'receive'},
          {s:'Coordinate move logistics: elevator reservation, loading dock, hours',t:'Before move date',d:'Rules & Regulations',ph:'process',ck:['Reserve elevator','Reserve loading dock','Confirm permitted hours']},
          {s:'Conduct post-move inspection; document any damage with dated photos',t:'Within 24 hours',detail:'Compare to pre-move photos. Note any damage to walls, floors, doors, elevator pads.',ph:'process'},
          {s:'Refund deposit with written inspection clearance when no damage is found',t:'Within 30 days',detail:'Written confirmation of inspection clearance. Refund via original payment method.',ph:'deliver'},
          {s:'Send itemized deduction notice with photos, repair estimates, and remaining balance for any damage',t:'Within 30 days',d:'Rules & Regulations',detail:'Itemize each deduction with cost. Provide repair invoices or contractor estimates. Refund any remaining balance.',w:'Required when post-move inspection identifies damage to common areas',ph:'deliver',ck:['Itemize each deduction with cost','Include photos of damage','Include repair invoices or estimates','Calculate and refund remaining balance']}
        ],
        self:[
          {s:'Provide pre/post photos, invoices, and detailed repair documentation when owner disputes deposit deductions',t:'Within 10 business days of dispute',d:'Rules & Regulations',desc:'Thorough documentation is the best defense when an owner disputes deductions from their move deposit.',detail:'Respond in writing with: (1) Pre-move inspection photos (dated), (2) Post-move inspection photos (dated), (3) Side-by-side comparison of the same areas, (4) Repair invoices or contractor estimates for each deduction, (5) Reference to the governing document provision authorizing the deposit and deductions. Offer to discuss in person. If the owner remains unsatisfied, advise them of their right to pursue in small claims court.',w:'Required when owner formally disputes deposit deductions',ph:'deliver',ck:['Provide pre-move photos','Provide post-move photos','Include repair invoices for each deduction','Cite governing document authority','Offer to discuss in person']},
          {s:'Send written demand for balance owed when repair costs exceed the collected deposit amount',t:'Within 30 days of repair completion',d:'Rules & Regulations',desc:'When damage to common areas exceeds the deposit held, the association must pursue the balance from the owner.',detail:'Send written demand: (1) Itemized repair costs with invoices, (2) Deposit amount applied, (3) Balance owed, (4) Demand for payment within 30 days, (5) Notice that association will pursue collection including small claims court if not paid. DC small claims limit is $10,000 — file at DC Superior Court (510 4th St NW) if the owner does not pay. Filing fee approximately $15-$65.',w:'Required when repair costs exceed the collected deposit amount',ph:'deliver',ck:['Itemize all repair costs with invoices','Calculate balance after deposit applied','Send written demand with 30-day deadline','File in DC Small Claims if not paid']}
        ],
        legal:[
          {s:'Attorney advises on deposit retention procedures, demand collection, and small claims filing',t:'When dispute arises or amount exceeds deposit',d:'DC Superior Court Small Claims',desc:'Attorney ensures proper procedures and pursues collection when owner refuses to pay for common area damage.',detail:'Attorney assists with: (1) Reviewing deposit retention authority in governing documents, (2) Drafting demand letter, (3) Filing small claims action at DC Superior Court (510 4th St NW) for amounts up to $10,000, (4) Representing association at hearing (or advising board member who appears). For amounts over $10,000, file in Civil Division. Attorney reviews whether governing documents allow recovery of attorney fees and collection costs.',w:'Dispute over deductions or amount exceeds deposit significantly',ph:'deliver'}
        ],
        notes:{
          'DC':'DC does not have a specific condo move deposit statute — authority derives from bylaws and rules. Ensure move deposit and fee amounts are authorized in governing documents. DC small claims limit is $10,000 for damage recovery.',
          '_':'Move deposits must be authorized by governing docs. Inspect before and after. Refund or itemize promptly.'
        }
      }
    ]
  }
];

export const APPR_LABELS: Record<string, string> = {
  pre: 'Pre-Legal', self: 'Self-Represented', legal: 'Legal Counsel'
};
export const APPR_COLORS: Record<string, string> = {
  pre: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  self: 'border-amber-300 bg-amber-50 text-amber-700',
  legal: 'border-rose-300 bg-rose-50 text-rose-700'
};
export const PRIO_COLORS: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600'
};

export const PHASE_COLORS = ['#929daa', '#454f5a', '#8b3a3a', '#d12626', '#1a1f25'];

export const SITUATION_PHASES: Record<string, { id: string; label: string }[]> = {
  // Financial
  'annual-budgeting': [
    { id: 'gather', label: 'Gather & Analyze' },
    { id: 'draft', label: 'Draft & Review' },
    { id: 'present', label: 'Present & Adopt' },
  ],
  'special-assessments': [
    { id: 'gather', label: 'Gather & Analyze' },
    { id: 'draft', label: 'Draft & Review' },
    { id: 'present', label: 'Present & Adopt' },
  ],
  'delinquent-accounts': [
    { id: 'gather', label: 'Notice & Demand' },
    { id: 'draft', label: 'Escalation' },
    { id: 'present', label: 'Enforcement' },
  ],
  'financial-review': [
    { id: 'gather', label: 'Gather & Analyze' },
    { id: 'draft', label: 'Draft & Review' },
    { id: 'present', label: 'Present & Adopt' },
  ],
  'reserve-management': [
    { id: 'gather', label: 'Gather & Analyze' },
    { id: 'draft', label: 'Draft & Review' },
    { id: 'present', label: 'Present & Adopt' },
  ],
  // Maintenance
  'common-area-repairs': [
    { id: 'document', label: 'Document' },
    { id: 'evaluate', label: 'Evaluate' },
    { id: 'approve', label: 'Approve' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  'emergency-situations': [
    { id: 'document', label: 'Document' },
    { id: 'evaluate', label: 'Evaluate' },
    { id: 'approve', label: 'Approve' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  'vendor-management': [
    { id: 'document', label: 'Document' },
    { id: 'evaluate', label: 'Evaluate' },
    { id: 'approve', label: 'Approve' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  'inspection-scheduling': [
    { id: 'document', label: 'Document' },
    { id: 'evaluate', label: 'Evaluate' },
    { id: 'approve', label: 'Approve' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  'preventative-maintenance': [
    { id: 'document', label: 'Document' },
    { id: 'evaluate', label: 'Evaluate' },
    { id: 'approve', label: 'Approve' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  // Enforcement
  'covenant-violations': [
    { id: 'evidence', label: 'Document & Evidence' },
    { id: 'notice', label: 'Notice & Cure' },
    { id: 'hearing', label: 'Hearing' },
    { id: 'enforce', label: 'Enforce' },
  ],
  'fine-hearings': [
    { id: 'evidence', label: 'Document & Evidence' },
    { id: 'notice', label: 'Notice & Cure' },
    { id: 'hearing', label: 'Hearing' },
    { id: 'enforce', label: 'Enforce' },
  ],
  'architectural-review': [
    { id: 'evidence', label: 'Document & Evidence' },
    { id: 'notice', label: 'Notice & Cure' },
    { id: 'hearing', label: 'Hearing' },
    { id: 'enforce', label: 'Enforce' },
  ],
  'pet-issues': [
    { id: 'evidence', label: 'Document & Evidence' },
    { id: 'notice', label: 'Notice & Cure' },
    { id: 'hearing', label: 'Hearing' },
    { id: 'enforce', label: 'Enforce' },
  ],
  // Legal & Risk
  'insurance-claims': [
    { id: 'investigate', label: 'Investigate' },
    { id: 'act', label: 'Act' },
    { id: 'resolve', label: 'Resolve' },
  ],
  'litigation': [
    { id: 'investigate', label: 'Investigate' },
    { id: 'act', label: 'Act' },
    { id: 'resolve', label: 'Resolve' },
  ],
  'governing-docs': [
    { id: 'investigate', label: 'Investigate' },
    { id: 'act', label: 'Act' },
    { id: 'resolve', label: 'Resolve' },
  ],
  'bylaw-amendment': [
    { id: 'investigate', label: 'Investigate' },
    { id: 'act', label: 'Act' },
    { id: 'resolve', label: 'Resolve' },
  ],
  // Governance
  'board-meetings': [
    { id: 'prepare', label: 'Prepare' },
    { id: 'execute', label: 'Execute' },
    { id: 'followup', label: 'Follow-Up' },
  ],
  'elections': [
    { id: 'prepare', label: 'Prepare' },
    { id: 'execute', label: 'Execute' },
    { id: 'followup', label: 'Follow-Up' },
  ],
  'annual-meeting-planning': [
    { id: 'prepare', label: 'Prepare' },
    { id: 'execute', label: 'Execute' },
    { id: 'followup', label: 'Follow-Up' },
  ],
  'board-action-item': [
    { id: 'prepare', label: 'Prepare' },
    { id: 'execute', label: 'Execute' },
    { id: 'followup', label: 'Follow-Up' },
  ],
  'policy-update': [
    { id: 'prepare', label: 'Prepare' },
    { id: 'execute', label: 'Execute' },
    { id: 'followup', label: 'Follow-Up' },
  ],
  'conflict-interest': [
    { id: 'prepare', label: 'Prepare' },
    { id: 'execute', label: 'Execute' },
    { id: 'followup', label: 'Follow-Up' },
  ],
  // Disputes
  'neighbor-conflicts': [
    { id: 'document', label: 'Document' },
    { id: 'mediate', label: 'Mediate' },
    { id: 'resolve', label: 'Resolve' },
  ],
  'damage-responsibility': [
    { id: 'document', label: 'Document' },
    { id: 'mediate', label: 'Mediate' },
    { id: 'resolve', label: 'Resolve' },
  ],
  // Operations
  'amenities': [
    { id: 'document', label: 'Document' },
    { id: 'act', label: 'Act' },
    { id: 'close', label: 'Close' },
  ],
  'security': [
    { id: 'document', label: 'Document' },
    { id: 'act', label: 'Act' },
    { id: 'close', label: 'Close' },
  ],
  // Strategic
  'capital-projects': [
    { id: 'assess', label: 'Assess' },
    { id: 'fund', label: 'Fund' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  'developer-transition': [
    { id: 'assess', label: 'Assess' },
    { id: 'fund', label: 'Fund' },
    { id: 'execute', label: 'Execute' },
    { id: 'close', label: 'Close' },
  ],
  // Crisis
  'structural-safety': [
    { id: 'respond', label: 'Respond' },
    { id: 'stabilize', label: 'Stabilize' },
    { id: 'resolve', label: 'Resolve' },
  ],
  'public-health': [
    { id: 'respond', label: 'Respond' },
    { id: 'stabilize', label: 'Stabilize' },
    { id: 'resolve', label: 'Resolve' },
  ],
  // Admin
  'compliance-filing': [
    { id: 'receive', label: 'Receive' },
    { id: 'process', label: 'Process' },
    { id: 'deliver', label: 'Deliver' },
  ],
  'record-requests': [
    { id: 'receive', label: 'Receive' },
    { id: 'process', label: 'Process' },
    { id: 'deliver', label: 'Deliver' },
  ],
  'resale-certs': [
    { id: 'receive', label: 'Receive' },
    { id: 'process', label: 'Process' },
    { id: 'deliver', label: 'Deliver' },
  ],
  'move-disputes': [
    { id: 'receive', label: 'Receive' },
    { id: 'process', label: 'Process' },
    { id: 'deliver', label: 'Deliver' },
  ],
};

// ─── Seed data ─────────────────────────────────────────────
/** Persist additional approaches to a separate localStorage key so they survive
 *  resetStoresForRealTenant() + loadFromDb() cycles (not yet in DB schema). */
const AA_STORAGE_KEY = 'onetwo-additional-approaches';
function syncAdditionalApproachesToStorage(cases: CaseTrackerCase[]) {
  const map: Record<string, any> = {};
  for (const c of cases) {
    if (c.additionalApproaches?.length > 0) map[c.id] = c.additionalApproaches;
  }
  try { localStorage.setItem(AA_STORAGE_KEY, JSON.stringify(map)); } catch {}
}
function loadAdditionalApproachesFromStorage(): Record<string, any[]> {
  try {
    const raw = localStorage.getItem(AA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function hydrateChecks(ck?: string[]): CaseCheckItem[] | undefined {
  if (!ck || ck.length === 0) return undefined;
  return ck.map((label, i) => ({ id: `ck${i}`, label, checked: false, checkedDate: null }));
}

function hydrateSteps(c: CaseTrackerCase): CaseTrackerCase {
  const cat = CATS.find(x => x.id === c.catId);
  const sit = cat?.sits.find(x => x.id === c.sitId);
  if (!sit) return c;
  const src = c.approach === 'legal' ? sit.legal : c.approach === 'self' ? sit.self : sit.pre;
  c.steps = src.map((s, i) => {
    const hasActions = s.actions && s.actions.length > 0;
    // Steps with actions: done is driven by actions, not by seed index
    const seedDone = c.status === 'closed' ? true : (!hasActions && i < 2);
    const seedDate = c.status === 'closed' ? c.created : (!hasActions && i < 2) ? '2026-02-10' : null;
    return {
      ...s, id: 's' + i,
      done: seedDone,
      doneDate: seedDate,
      userNotes: '',
      ...(s.ph && { phaseId: s.ph }),
      ...(s.ck && s.ck.length > 0 && { checks: hydrateChecks(s.ck)?.map(ck => ({
        ...ck,
        checked: c.status === 'closed' ? true : i < 2,
        checkedDate: c.status === 'closed' ? c.created : i < 2 ? '2026-02-10' : null,
      })) }),
      ...(s.actions && { actions: s.actions.map((a: any) => ({
        ...a,
        done: c.status === 'closed' ? true : false,
        doneDate: c.status === 'closed' ? c.created : null
      })) }),
      ...(s.persistent && { persistent: s.persistent }),
      ...(s.desc && { desc: s.desc }),
      ...(s.isSpendingDecision && { isSpendingDecision: true }),
      ...(s.requiresBids && { requiresBids: true, minimumBids: s.minimumBids || 3, bidCollection: { minimumBids: s.minimumBids || 3, bids: [], selectedBidId: null, selectionRationale: '', completedDate: null } }),
      ...(s.requiresConflictCheck && { requiresConflictCheck: true }),
    };
  });
  return c;
}

/** Re-hydrate a case from DB or localStorage: merge saved progress onto full template steps.
 *  Ensures steps always reflect the correct approach-specific template (self/legal/pre). */
function rehydrateCase(c: CaseTrackerCase): CaseTrackerCase {
  const cat = CATS.find(x => x.id === c.catId);
  const sit = cat?.sits.find(x => x.id === c.sitId);
  if (!sit) return c;
  const src = c.approach === 'legal' ? sit.legal : c.approach === 'self' ? sit.self : sit.pre;

  // Map saved steps by id for merging user progress
  const savedSteps = new Map<string, CaseStep>();
  (c.steps || []).forEach(s => savedSteps.set(s.id, s));

  c.steps = src.map((st, i) => {
    const stepId = 's' + i;
    const saved = savedSteps.get(stepId);
    return {
      ...st, id: stepId,
      done: saved?.done ?? false,
      doneDate: saved?.doneDate ?? null,
      userNotes: saved?.userNotes ?? '',
      ...(st.ph && { phaseId: st.ph }),
      ...(st.ck && st.ck.length > 0 && {
        checks: (saved?.checks && saved.checks.length > 0)
          ? saved.checks  // preserve user check progress
          : hydrateChecks(st.ck)
      }),
      ...(st.actions && { actions: st.actions.map((a: any) => {
        // Preserve action done/doneDate from saved data
        const savedAction = saved?.actions?.find((sa: any) => sa.id === a.id);
        return { ...a, done: savedAction?.done ?? false, doneDate: savedAction?.doneDate ?? null };
      }) }),
      ...(st.persistent && { persistent: st.persistent }),
      ...(st.desc && { desc: st.desc }),
      ...(st.isSpendingDecision && { isSpendingDecision: true }),
      ...(st.requiresBids && {
        requiresBids: true,
        minimumBids: st.minimumBids || 3,
        bidCollection: saved?.bidCollection || { minimumBids: st.minimumBids || 3, bids: [], selectedBidId: null, selectionRationale: '', completedDate: null },
      }),
      ...(st.requiresConflictCheck && { requiresConflictCheck: true }),
    };
  });

  // Re-hydrate additional approaches too
  if (c.additionalApproaches) {
    c.additionalApproaches = c.additionalApproaches.map(aa => {
      const aaSrc = aa.approach === 'legal' ? sit.legal : aa.approach === 'self' ? sit.self : sit.pre;
      const savedAaSteps = new Map<string, CaseStep>();
      (aa.steps || []).forEach(s => savedAaSteps.set(s.id, s));
      return {
        ...aa,
        steps: aaSrc.map((st, i) => {
          const aaStepId = `a${aa.approach[0]}${i}`;
          const saved = savedAaSteps.get(aaStepId);
          return {
            ...st, id: aaStepId,
            done: saved?.done ?? false,
            doneDate: saved?.doneDate ?? null,
            userNotes: saved?.userNotes ?? '',
            ...(st.ph && { phaseId: st.ph }),
            ...(st.ck && st.ck.length > 0 && {
              checks: (saved?.checks && saved.checks.length > 0) ? saved.checks : hydrateChecks(st.ck)
            }),
            ...(st.actions && { actions: st.actions.map((a: any) => {
              const savedAction = saved?.actions?.find((sa: any) => sa.id === a.id);
              return { ...a, done: savedAction?.done ?? false, doneDate: savedAction?.doneDate ?? null };
            }) }),
            ...(st.persistent && { persistent: st.persistent }),
            ...(st.desc && { desc: st.desc }),
          };
        }),
      };
    });
  }

  return c;
}

const seedCases: CaseTrackerCase[] = [
  hydrateSteps({
    id: 'c1', catId: 'enforcement', sitId: 'covenant-violations',
    title: 'Unit 502 — Unauthorized Balcony Enclosure', unit: '502', owner: 'Lisa Chen',
    assignedTo: 'Robert Mitchell', assignedRole: 'President',
    approach: 'pre', status: 'open', priority: 'high', created: '2026-01-28',
    notes: 'Owner enclosed balcony without architectural review. Structural concerns.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [],
    comms: [{
      id: 'cm1', type: 'notice', subject: 'First Notice — Unauthorized Balcony Enclosure',
      date: '2026-01-30', method: 'certified mail', recipient: 'Unit 502 — Lisa Chen',
      sentBy: 'VP', notes: '30-day cure period. Certified mail tracking: 9407 1234 5678.', status: 'sent'
    }]
  }),
  hydrateSteps({
    id: 'c2', catId: 'financial', sitId: 'delinquent-accounts',
    title: 'Unit 310 — 90-Day Delinquent Assessment', unit: '310', owner: 'Mark Torres',
    assignedTo: 'David Chen', assignedRole: 'Treasurer',
    approach: 'self', status: 'open', priority: 'medium', created: '2026-02-01',
    notes: 'Owner $2,700 behind. Payment plan offered but not signed.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [{ name: 'Delinquency-Notice-Unit310.pdf', type: 'notice', date: '2026-02-01', size: '45 KB' }],
    boardVotes: null, additionalApproaches: [],
    comms: [
      { id: 'cm2', type: 'notice', subject: '90-Day Delinquency Notice', date: '2026-02-03', method: 'certified mail', recipient: 'Unit 310 — Mark Torres', sentBy: 'Treasurer', notes: 'Amount owed: $2,700. Lien warning per DC Code § 42-1903.13.', status: 'sent' },
      { id: 'cm3', type: 'response', subject: 'Payment Plan Proposal Sent', date: '2026-02-05', method: 'email', recipient: 'Unit 310 — Mark Torres', sentBy: 'Treasurer', notes: 'Proposed 6-month installment plan. Awaiting response.', status: 'sent' }
    ]
  }),
  hydrateSteps({
    id: 'c3', catId: 'maintenance', sitId: 'emergency-situations',
    title: 'Burst Pipe — 3rd Floor Riser', unit: 'Common', owner: 'N/A',
    assignedTo: 'Jennifer Adams', assignedRole: 'Vice President',
    approach: 'pre', status: 'closed', priority: 'urgent', created: '2026-01-15',
    notes: 'Emergency repair completed. Insurance claim filed. Two units affected.',
    steps: null, linkedWOs: ['WO-101'], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [
      { name: 'Burst-Pipe-Photos.zip', type: 'evidence', date: '2026-01-15', size: '12.3 MB' },
      { name: 'Insurance-Claim-Form.pdf', type: 'claim', date: '2026-01-18', size: '320 KB' }
    ],
    boardVotes: {
      motion: 'Approve emergency repair expenditure up to $5,000', date: '2026-01-15',
      votes: [
        { name: 'Robert Mitchell', role: 'President', vote: 'approve' },
        { name: 'Jennifer Adams', role: 'Vice President', vote: 'approve' },
        { name: 'David Chen', role: 'Treasurer', vote: 'approve' },
        { name: 'Maria Rodriguez', role: 'Secretary', vote: 'approve' },
        { name: 'Thomas Baker', role: 'Member at Large', vote: 'abstain' }
      ]
    },
    additionalApproaches: [],
    comms: [
      { id: 'cm4', type: 'notice', subject: 'Emergency Water Shutoff Notice', date: '2026-01-15', method: 'posted', recipient: 'All residents', sentBy: 'President', notes: 'Immediate notice posted in lobby and each floor.', status: 'sent' },
      { id: 'cm5', type: 'response', subject: 'Insurance Claim Confirmation', date: '2026-01-20', method: 'email', recipient: 'Claims adjuster — Travelers Insurance', sentBy: 'Treasurer', notes: 'Claim #TRV-2026-00892 filed.', status: 'sent' }
    ]
  }),
  // Migrated board tasks → cases with assignment fields
  hydrateSteps({
    id: 'c4', catId: 'maintenance', sitId: 'vendor-management',
    title: 'Review elevator modernization bids', unit: 'Common', owner: 'N/A',
    approach: 'pre', status: 'open', priority: 'high', created: '2026-01-20',
    notes: 'Compare 3 vendor proposals for elevator upgrade project. Budget approved up to $85,000.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
    assignedTo: 'Jennifer Adams', assignedRole: 'Vice President', dueDate: '2026-03-10',
    source: 'Board Meeting Jan 2026',
  }),
  hydrateSteps({
    id: 'c5', catId: 'admin', sitId: 'compliance-filing',
    title: 'File DC Biennial Report', unit: 'Common', owner: 'N/A',
    approach: 'pre', status: 'open', priority: 'medium', created: '2026-01-20',
    notes: 'File with DCRA. $80 filing fee.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
    assignedTo: 'Robert Mitchell', assignedRole: 'President', dueDate: '2026-04-01',
    source: 'Runbook item', sourceId: 'rf1',
  }),
  hydrateSteps({
    id: 'c6', catId: 'maintenance', sitId: 'inspection-scheduling',
    title: 'Schedule annual fire safety inspection', unit: 'Common', owner: 'N/A',
    approach: 'pre', status: 'open', priority: 'medium', created: '2026-01-20',
    notes: 'Coordinate with DC Fire and EMS for annual inspection.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
    assignedTo: 'Jennifer Adams', assignedRole: 'Vice President', dueDate: '2026-06-30',
    source: 'Runbook item', sourceId: 'rf4',
  }),
  hydrateSteps({
    id: 'c7', catId: 'governance', sitId: 'policy-update',
    title: 'Update collection policy document', unit: 'Common', owner: 'N/A',
    approach: 'pre', status: 'open', priority: 'low', created: '2026-01-20',
    notes: 'Review and update collection policy. Current version is outdated. Legal counsel review needed before finalizing.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
    assignedTo: 'David Chen', assignedRole: 'Treasurer', dueDate: '2026-05-01',
  }),
  hydrateSteps({
    id: 'c8', catId: 'financial', sitId: 'annual-budgeting',
    title: 'FY 2027 Annual Budget', unit: 'Common', owner: 'N/A',
    approach: 'pre', status: 'open', priority: 'high', created: '2026-02-15',
    notes: 'Prepare and adopt the FY 2027 operating budget and reserve funding plan.',
    steps: null, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
    assignedTo: 'David Chen', assignedRole: 'Treasurer', dueDate: '2026-06-01',
    financials: ANNUAL_BUDGET_FINANCIALS,
  }),
];

// ─── Issues seed ───────────────────────────────────────────
const seedIssues: Issue[] = [
  {
    id: 'iss-1', type: 'BUILDING_PUBLIC', category: 'Maintenance',
    priority: 'HIGH', status: 'IN_PROGRESS',
    title: 'Lobby Ceiling Water Stain', description: 'Water stain appeared on main lobby ceiling near mail area. Getting larger after rain.',
    reportedBy: 'u-resident', reporterName: 'Lisa Chen', reporterEmail: 'lchen@email.com',
    unitNumber: '502', submittedDate: '2026-02-10',
    upvotes: [{ userId: 'u-resident', userName: 'Lisa Chen', unitNumber: '502' }],
    viewCount: 14,
    comments: [{ id: 'cmt-1', author: 'Board', text: 'Plumber inspecting next week.', date: '2026-02-12' }],
    reviewNotes: [],
    comms: []
  },
  {
    id: 'iss-2', type: 'BUILDING_PUBLIC', category: 'Safety',
    priority: 'MEDIUM', status: 'SUBMITTED',
    title: 'Garage Door Sensor Broken', description: 'Garage door B does not stop when sensor is tripped. Safety risk.',
    reportedBy: 'u-res-2', reporterName: 'Mark Torres', reporterEmail: 'mtorres@email.com',
    unitNumber: '310', submittedDate: '2026-02-14',
    upvotes: [{ userId: 'u-res-2', userName: 'Mark Torres', unitNumber: '310' }, { userId: 'u-resident', userName: 'Lisa Chen', unitNumber: '502' }],
    viewCount: 8, comments: [], reviewNotes: [],
    comms: []
  }
];

// ─── Store ─────────────────────────────────────────────────
export interface ActiveCaseContext {
  caseId: string;
  caseTitle: string;
  stepTitle: string;
  stepIdx: number;
  stepTiming?: string;
  returnPath: string;
  phaseLabel?: string;
  phaseColor?: string;
  progress?: { done: number; total: number };
  stepProgress?: { done: number; total: number };
  minimized?: boolean;
}

interface IssuesState {
  issues: Issue[];
  cases: CaseTrackerCase[];
  nextCaseNum: number;
  nextIssueNum: number;
  nextCommNum: number;
  activeCaseContext: ActiveCaseContext | null;

  // DB sync
  loadFromDb: (tenantId: string) => Promise<void>;

  // Issue actions
  addIssue: (issue: Omit<Issue, 'id' | 'upvotes' | 'viewCount' | 'comments' | 'reviewNotes' | 'comms'>, tenantId?: string) => void;
  upvoteIssue: (issueId: string, userId: string, userName: string, unitNumber: string) => void;
  updateIssueStatus: (issueId: string, status: Issue['status']) => void;
  addIssueComment: (issueId: string, author: string, text: string) => void;
  addIssueComm: (issueId: string, comm: Omit<CaseComm, 'id'>) => void;

  // Case actions
  createCase: (data: { catId: string; sitId: string; approach: CaseApproach; title: string; unit: string; owner: string; priority: CasePriority; notes: string; assignedTo?: string; assignedRole?: string; dueDate?: string; source?: string; sourceId?: string; customSteps?: { s: string; t?: string; d?: string; detail?: string }[] }, tenantId?: string) => string;
  toggleStep: (caseId: string, stepIdx: number) => void;
  addStepNote: (caseId: string, stepIdx: number, note: string) => void;
  closeCase: (caseId: string) => void;
  reopenCase: (caseId: string) => void;
  deleteCase: (caseId: string) => void;
  updateCaseAssignment: (caseId: string, updates: { assignedTo?: string; assignedRole?: string; dueDate?: string }) => void;

  // Phase/check/action actions
  toggleCheck: (caseId: string, stepIdx: number, checkId: string) => void;
  toggleAction: (caseId: string, stepIdx: number, actionId: string) => void;
  completeAllChecks: (caseId: string, stepIdx: number) => void;
  putOnHold: (caseId: string, reason: string) => void;
  resumeCase: (caseId: string) => void;
  closeCaseWithReason: (caseId: string, reason: string, notes: string) => void;

  // Approach
  addApproach: (caseId: string, approach: CaseApproach, customSteps?: { s: string; t?: string; detail?: string }[]) => void;
  toggleAdditionalStep: (caseId: string, approachIdx: number, stepIdx: number) => void;
  addAdditionalStepNote: (caseId: string, approachIdx: number, stepIdx: number, note: string) => void;
  toggleAdditionalCheck: (caseId: string, approachIdx: number, stepIdx: number, checkId: string) => void;
  toggleAdditionalAction: (caseId: string, approachIdx: number, stepIdx: number, actionId: string) => void;

  // Board vote
  saveBoardVote: (caseId: string, motion: string, date: string, votes: BoardVote['votes']) => void;
  clearBoardVote: (caseId: string) => void;

  // Docs & Comms
  addDocument: (caseId: string, doc: CaseAttachment) => void;
  addStepDocument: (caseId: string, stepIdx: number, doc: CaseAttachment) => void;
  removeDocument: (caseId: string, idx: number) => void;
  addComm: (caseId: string, comm: Omit<CaseComm, 'id'>) => void;
  removeComm: (caseId: string, idx: number) => void;

  // WO linking
  linkWO: (caseId: string, woId: string) => void;
  unlinkWO: (caseId: string, woId: string) => void;

  // Letter linking
  linkLetter: (caseId: string, letterId: string) => void;
  unlinkLetter: (caseId: string, letterId: string) => void;

  // Invoice linking
  linkInvoice: (caseId: string, invoiceId: string) => void;
  unlinkInvoice: (caseId: string, invoiceId: string) => void;

  // Meeting linking
  linkMeeting: (caseId: string, meetingId: string) => void;
  unlinkMeeting: (caseId: string, meetingId: string) => void;

  // Fiduciary: spending decisions
  setSpendingDecision: (caseId: string, stepIdx: number, decision: SpendingDecision) => void;

  // Fiduciary: bid collection
  initBidCollection: (caseId: string, stepIdx: number, minimumBids: number) => void;
  addBid: (caseId: string, stepIdx: number, bid: Omit<Bid, 'id'>) => void;
  removeBid: (caseId: string, stepIdx: number, bidId: string) => void;
  selectBid: (caseId: string, stepIdx: number, bidId: string, rationale: string) => void;

  // Fiduciary: conflict checks
  addConflictCheck: (caseId: string, check: Omit<ConflictCheck, 'id'>) => void;
  updateConflictDeclaration: (caseId: string, checkId: string, memberId: string, declaration: Partial<ConflictDeclaration>) => void;

  // Decision trail
  addTrailEntry: (caseId: string, entry: Omit<DecisionTrailEntry, 'id'>) => void;

  // Active case context (floating widget)
  setActiveCaseContext: (ctx: ActiveCaseContext) => void;
  clearActiveCaseContext: () => void;

  // Budget drafting
  saveBudgetDraft: (caseId: string, stepIdx: number, draft: NonNullable<import('@/types/issues').CaseStep['budgetDraft']>) => void;

  // Shell refactor: active step in two-column layout
  shellActiveStep: number;
  shellActiveStepCaseId: string | null;
  setShellActiveStep: (caseId: string, stepIdx: number) => void;
}

export const useIssuesStore = create<IssuesState>()(persist((set, get) => ({
  issues: seedIssues,
  cases: seedCases,
  nextCaseNum: 9,
  nextIssueNum: 3,
  nextCommNum: 6,
  activeCaseContext: null,
  shellActiveStep: 0,
  shellActiveStepCaseId: null,

  loadFromDb: async (tenantId: string) => {
    const [issues, cases] = await Promise.all([
      issuesSvc.fetchIssues(tenantId),
      casesSvc.fetchCases(tenantId),
    ]);
    const updates: Record<string, unknown> = {};
    if (issues) updates.issues = issues;
    if (cases) {
      // Restore additionalApproaches from separate localStorage key (not yet in DB schema)
      const savedAA = loadAdditionalApproachesFromStorage();
      updates.cases = cases.map(c => {
        if (savedAA[c.id]) c = { ...c, additionalApproaches: savedAA[c.id] };
        return rehydrateCase(c);
      });
    }
    if (Object.keys(updates).length > 0) set(updates);
  },

  addIssue: (issue, tenantId?) => {
    const localId = `iss-${get().nextIssueNum}`;
    set(s => ({
      issues: [{ ...issue, id: localId, upvotes: [], viewCount: 0, comments: [], reviewNotes: [], comms: [] }, ...s.issues],
      nextIssueNum: s.nextIssueNum + 1
    }));
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      issuesSvc.createIssue(tid, issue, localId).then(dbId => {
        if (dbId) set(s => ({ issues: s.issues.map(i => i.id === localId ? { ...i, id: dbId } : i) }));
      });
    }
  },

  upvoteIssue: (issueId, userId, userName, unitNumber) => {
    const issue = get().issues.find(i => i.id === issueId);
    const already = issue?.upvotes.find(u => u.userId === userId);
    set(s => ({
      issues: s.issues.map(i => {
        if (i.id !== issueId) return i;
        const alreadyUp = i.upvotes.find(u => u.userId === userId);
        return {
          ...i,
          upvotes: alreadyUp ? i.upvotes.filter(u => u.userId !== userId) : [...i.upvotes, { userId, userName, unitNumber }]
        };
      })
    }));
    if (isBackendEnabled) {
      if (already) issuesSvc.removeIssueUpvote(issueId, userId);
      else issuesSvc.addIssueUpvote(getActiveTenantId() || '', issueId, userId, userName, unitNumber);
    }
  },

  updateIssueStatus: (issueId, status) => {
    const issue = get().issues.find(i => i.id === issueId);
    set(s => ({
      issues: s.issues.map(i => i.id === issueId ? { ...i, status } : i)
    }));
    if (isBackendEnabled) {
      issuesSvc.updateIssueStatus(issueId, status);
      // Send email notification to reporter for meaningful status changes
      if (issue?.reporterEmail && ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(status)) {
        const latestComment = issue.comments[issue.comments.length - 1]?.text || '';
        import('@/lib/supabase').then(async ({ supabase }) => {
          if (!supabase) return;
          const sbUrl = import.meta.env.VITE_SUPABASE_URL as string;
          const sbKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
          if (!sbUrl || !sbKey) return;
          const session = (await supabase.auth.getSession()).data.session;
          fetch(`${sbUrl}/functions/v1/send-status-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${sbKey}`, 'apikey': sbKey },
            body: JSON.stringify({ recipientEmail: issue.reporterEmail, recipientName: issue.reporterName, issueTitle: issue.title, newStatus: status, boardComment: latestComment }),
          }).catch(err => console.error('Status email error:', err));
        });
      }
    }
  },

  addIssueComment: (issueId, author, text) => {
    const localId = 'cmt-' + Date.now();
    const date = new Date().toISOString().split('T')[0];
    set(s => ({
      issues: s.issues.map(i => i.id === issueId ? {
        ...i, comments: [...i.comments, { id: localId, author, text, date }]
      } : i)
    }));
    if (isBackendEnabled) issuesSvc.addIssueComment(getActiveTenantId() || '', issueId, localId, author, text, date);
  },

  addIssueComm: (issueId, comm) => set(s => {
    const id = `cm${s.nextCommNum}`;
    const newComm = { ...comm, id };
    const newIssues = s.issues.map(i => i.id === issueId ? { ...i, comms: [...i.comms, newComm] } : i);
    // Bidirectional: also add to linked case if one exists
    const linkedCase = s.cases.find(c => c.source === 'issue' && c.sourceId === issueId);
    const newCases = linkedCase
      ? s.cases.map(c => c.id === linkedCase.id ? { ...c, comms: [...c.comms, newComm] } : c)
      : s.cases;
    return { issues: newIssues, cases: newCases, nextCommNum: s.nextCommNum + 1 };
  }),

  createCase: (data, tenantId?) => {
    const s = get();
    const id = crypto.randomUUID();
    const caseNum = s.nextCaseNum;

    let steps: CaseStep[];
    if (data.customSteps && data.customSteps.length > 0) {
      steps = data.customSteps.map((st, i) => ({
        id: 's' + i, s: st.s, done: false, doneDate: null, userNotes: '',
        ...(st.t && { t: st.t }),
        ...(st.detail && { detail: st.detail }),
      }));
    } else {
      const cat = CATS.find(x => x.id === data.catId);
      const sit = cat?.sits.find(x => x.id === data.sitId);
      if (!sit) return id;
      const src = data.approach === 'legal' ? sit.legal : data.approach === 'self' ? sit.self : sit.pre;
      steps = src.map((st, i) => ({
        ...st, id: 's' + i, done: false, doneDate: null, userNotes: '',
        ...(st.ph && { phaseId: st.ph }),
        ...(st.ck && st.ck.length > 0 && { checks: hydrateChecks(st.ck) }),
        ...(st.actions && { actions: st.actions.map((a: any) => ({
          ...a, done: false, doneDate: null
        })) }),
        ...(st.persistent && { persistent: st.persistent }),
        ...(st.desc && { desc: st.desc }),
        ...(st.isSpendingDecision && { isSpendingDecision: true }),
        ...(st.requiresBids && { requiresBids: true, minimumBids: st.minimumBids || 3, bidCollection: { minimumBids: st.minimumBids || 3, bids: [], selectedBidId: null, selectionRationale: '', completedDate: null } }),
        ...(st.requiresConflictCheck && { requiresConflictCheck: true }),
      }));
    }
    const today = new Date().toISOString().split('T')[0];
    const newCase: CaseTrackerCase = {
      id, catId: data.catId, sitId: data.sitId, approach: data.approach, title: data.title,
      unit: data.unit, owner: data.owner, priority: data.priority, notes: data.notes,
      status: 'open', created: today,
      steps, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
      conflictChecks: [], decisionTrail: [{ id: 'te' + Date.now(), type: 'case_created', date: today, actor: 'Board', summary: `Case created: ${data.title}` }],
      ...(data.assignedTo && { assignedTo: data.assignedTo }),
      ...(data.assignedRole && { assignedRole: data.assignedRole }),
      ...(data.dueDate && { dueDate: data.dueDate }),
      ...(data.source && { source: data.source }),
      ...(data.sourceId && { sourceId: data.sourceId }),
    };
    set({ cases: [newCase, ...s.cases], nextCaseNum: caseNum + 1 });
    const tid = tenantId || getActiveTenantId();
    if (isBackendEnabled && tid) {
      casesSvc.createCase(tid, newCase, `c${caseNum}`);
    }
    return id;
  },

  toggleStep: (caseId, stepIdx) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        // Don't allow manual toggle if step has actions (auto-managed)
        if (c.steps[stepIdx].actions && c.steps[stepIdx].actions!.length > 0) return c;
        const steps = [...c.steps];
        const wasDone = steps[stepIdx].done;
        steps[stepIdx] = {
          ...steps[stepIdx],
          done: !wasDone,
          doneDate: !wasDone ? today : null
        };
        if (!wasDone) {
          const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'step_completed', date: today, actor: 'Board', summary: `Step completed: ${steps[stepIdx].s}` };
          return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
        }
        return { ...c, steps };
      })
    }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      const step = c?.steps?.[stepIdx];
      if (step) casesSvc.updateCaseStep(caseId, step.id, step.done, step.doneDate);
    }
  },

  addStepNote: (caseId, stepIdx, note) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        steps[stepIdx] = { ...steps[stepIdx], userNotes: note };
        const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'note_added', date: today, actor: 'Board', summary: `Note added to step: ${steps[stepIdx].s}` };
        return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      const step = c?.steps?.[stepIdx];
      if (step) casesSvc.updateCaseStepNote(caseId, step.id, note);
    }
  },

  closeCase: (caseId) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId) return c;
        return {
          ...c, status: 'closed' as const, completedAt: today,
          steps: c.steps?.map(st => ({ ...st, done: true, doneDate: st.doneDate || today })) || null
        };
      })
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { status: 'closed', completedAt: today });
  },

  reopenCase: (caseId) => {
    set(s => ({
      cases: s.cases.map(c => c.id === caseId ? { ...c, status: 'open' as const, completedAt: undefined } : c)
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { status: 'open', completedAt: undefined });
  },

  deleteCase: (caseId) => {
    set(s => ({
      cases: s.cases.filter(c => c.id !== caseId)
    }));
    if (isBackendEnabled) casesSvc.deleteCase(caseId);
  },

  toggleCheck: (caseId, stepIdx, checkId) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const step = { ...steps[stepIdx] };
        if (!step.checks) return c;
        step.checks = step.checks.map(ck =>
          ck.id === checkId ? { ...ck, checked: !ck.checked, checkedDate: !ck.checked ? today : null } : ck
        );
        const allChecked = step.checks.every(ck => ck.checked);
        step.done = allChecked;
        step.doneDate = allChecked ? today : null;
        steps[stepIdx] = step;
        return { ...c, steps };
      })
    }));
  },

  toggleAction: (caseId, stepIdx, actionId) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const step = { ...steps[stepIdx] };
        if (!step.actions) return c;
        step.actions = step.actions.map(a =>
          a.id === actionId ? { ...a, done: !a.done, doneDate: !a.done ? today : null } : a
        );
        const allDone = step.actions.every(a => a.done);
        step.done = allDone;
        step.doneDate = allDone ? today : null;
        steps[stepIdx] = step;
        if (!allDone) return { ...c, steps };
        const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'step_completed' as const, date: today, actor: 'Board', summary: `Step completed: ${step.s}` };
        return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
  },

  completeAllChecks: (caseId, stepIdx) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const step = { ...steps[stepIdx] };
        if (step.checks) {
          step.checks = step.checks.map(ck => ({ ...ck, checked: true, checkedDate: ck.checkedDate || today }));
        }
        step.done = true;
        step.doneDate = today;
        steps[stepIdx] = step;
        return { ...c, steps };
      })
    }));
  },

  putOnHold: (caseId, reason) => {
    const today = new Date().toISOString().split('T')[0];
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'case_held', date: today, actor: 'Board', summary: `Case put on hold: ${reason}` };
    set(s => ({
      cases: s.cases.map(c => c.id === caseId ? { ...c, status: 'on-hold' as const, holdReason: reason, decisionTrail: [...(c.decisionTrail || []), trail] } : c)
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { status: 'on-hold', holdReason: reason });
  },

  resumeCase: (caseId) => {
    const today = new Date().toISOString().split('T')[0];
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'case_resumed', date: today, actor: 'Board', summary: 'Case resumed from hold' };
    set(s => ({
      cases: s.cases.map(c => c.id === caseId ? { ...c, status: 'open' as const, holdReason: undefined, decisionTrail: [...(c.decisionTrail || []), trail] } : c)
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { status: 'open', holdReason: undefined });
  },

  closeCaseWithReason: (caseId, reason, notes) => {
    const today = new Date().toISOString().split('T')[0];
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'case_closed', date: today, actor: 'Board', summary: `Case closed: ${reason}`, details: notes };
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId) return c;
        return {
          ...c, status: 'closed' as const, completedAt: today,
          closeReason: reason, closeNotes: notes, holdReason: undefined,
          steps: c.steps?.map(st => ({ ...st, done: true, doneDate: st.doneDate || today })) || null,
          decisionTrail: [...(c.decisionTrail || []), trail],
        };
      })
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { status: 'closed', completedAt: today, closeReason: reason, closeNotes: notes });
  },

  updateCaseAssignment: (caseId, updates) => {
    set(s => ({
      cases: s.cases.map(c => c.id === caseId ? { ...c, ...updates } : c)
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, updates);
  },

  addApproach: (caseId, approach, customSteps?) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId) return c;
        const today = new Date().toISOString().split('T')[0];
        let steps: CaseStep[];
        if (customSteps && customSteps.length > 0) {
          steps = customSteps.map((st, i) => ({
            id: `a${approach[0]}${i}`, s: st.s, done: false, doneDate: null, userNotes: '',
            ...(st.t && { t: st.t }),
            ...(st.detail && { detail: st.detail }),
          }));
        } else {
          const cat = CATS.find(x => x.id === c.catId);
          const sit = cat?.sits.find(x => x.id === c.sitId);
          if (!sit) return c;
          const src = approach === 'legal' ? sit.legal : approach === 'self' ? sit.self : sit.pre;
          steps = src.map((st, i) => ({
            ...st, id: `a${approach[0]}${i}`, done: false, doneDate: null, userNotes: '',
            ...(st.ph && { phaseId: st.ph }),
            ...(st.ck && st.ck.length > 0 && { checks: hydrateChecks(st.ck) }),
            ...(st.actions && { actions: st.actions.map((a: any) => ({
              ...a, done: false, doneDate: null
            })) }),
            ...(st.persistent && { persistent: st.persistent }),
            ...(st.desc && { desc: st.desc }),
          }));
        }
        const newApproach = { approach, addedDate: today, steps };
        const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'approach_added', date: today, actor: 'Board', summary: `${approach === 'legal' ? 'Legal Counsel' : approach === 'self' ? 'Self-Represented' : 'Pre-Legal'} approach added` };
        return { ...c, additionalApproaches: [...(c.additionalApproaches || []), newApproach], decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
    syncAdditionalApproachesToStorage(get().cases);
  },

  toggleAdditionalStep: (caseId, approachIdx, stepIdx) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.additionalApproaches?.[approachIdx]) return c;
        const aa = [...c.additionalApproaches];
        const steps = [...aa[approachIdx].steps];
        steps[stepIdx] = {
          ...steps[stepIdx],
          done: !steps[stepIdx].done,
          doneDate: !steps[stepIdx].done ? new Date().toISOString().split('T')[0] : null
        };
        aa[approachIdx] = { ...aa[approachIdx], steps };
        return { ...c, additionalApproaches: aa };
      })
    }));
    syncAdditionalApproachesToStorage(get().cases);
  },

  addAdditionalStepNote: (caseId, approachIdx, stepIdx, note) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.additionalApproaches?.[approachIdx]) return c;
        const aa = [...c.additionalApproaches];
        const steps = [...aa[approachIdx].steps];
        steps[stepIdx] = { ...steps[stepIdx], userNotes: note };
        aa[approachIdx] = { ...aa[approachIdx], steps };
        return { ...c, additionalApproaches: aa };
      })
    }));
    syncAdditionalApproachesToStorage(get().cases);
  },

  toggleAdditionalCheck: (caseId, approachIdx, stepIdx, checkId) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.additionalApproaches?.[approachIdx]) return c;
        const aa = [...c.additionalApproaches];
        const steps = [...aa[approachIdx].steps];
        const step = { ...steps[stepIdx] };
        if (!step.checks) return c;
        step.checks = step.checks.map(ck =>
          ck.id === checkId ? { ...ck, checked: !ck.checked, checkedDate: !ck.checked ? today : null } : ck
        );
        const allChecked = step.checks.every(ck => ck.checked);
        step.done = allChecked;
        step.doneDate = allChecked ? today : null;
        steps[stepIdx] = step;
        aa[approachIdx] = { ...aa[approachIdx], steps };
        return { ...c, additionalApproaches: aa };
      })
    }));
    syncAdditionalApproachesToStorage(get().cases);
  },

  toggleAdditionalAction: (caseId, approachIdx, stepIdx, actionId) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.additionalApproaches?.[approachIdx]) return c;
        const aa = [...c.additionalApproaches];
        const steps = [...aa[approachIdx].steps];
        const step = { ...steps[stepIdx] };
        if (!step.actions) return c;
        step.actions = step.actions.map(a =>
          a.id === actionId ? { ...a, done: !a.done, doneDate: !a.done ? today : null } : a
        );
        const allDone = step.actions.every(a => a.done);
        step.done = allDone;
        step.doneDate = allDone ? today : null;
        steps[stepIdx] = step;
        aa[approachIdx] = { ...aa[approachIdx], steps };
        return { ...c, additionalApproaches: aa };
      })
    }));
    syncAdditionalApproachesToStorage(get().cases);
  },

  saveBoardVote: (caseId, motion, date, votes) => {
    const boardVotes = { motion, date, votes };
    const approves = votes.filter(v => v.vote === 'approve').length;
    const denies = votes.filter(v => v.vote === 'deny').length;
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'board_vote', date, actor: 'Board', summary: `Board vote: ${approves} approve, ${denies} deny — "${motion}"` };
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, boardVotes, decisionTrail: [...(c.decisionTrail || []), trail] } : c) }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { boardVotes });
  },

  clearBoardVote: (caseId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, boardVotes: null } : c) }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { boardVotes: null });
  },

  addDocument: (caseId, doc) => {
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'document_attached', date: new Date().toISOString().split('T')[0], actor: 'Board', summary: `Document attached: ${doc.name}` };
    set(s => ({
      cases: s.cases.map(c => c.id === caseId ? { ...c, attachments: [...c.attachments, doc], decisionTrail: [...(c.decisionTrail || []), trail] } : c)
    }));
  },

  addStepDocument: (caseId, stepIdx, doc) => {
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'document_attached', date: new Date().toISOString().split('T')[0], actor: 'Board', summary: `Step document attached: ${doc.name}` };
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const existing = steps[stepIdx].stepAttachments || [];
        steps[stepIdx] = { ...steps[stepIdx], stepAttachments: [...existing, doc] };
        return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
  },

  removeDocument: (caseId, idx) => set(s => ({
    cases: s.cases.map(c => {
      if (c.id !== caseId) return c;
      const attachments = [...c.attachments];
      attachments.splice(idx, 1);
      return { ...c, attachments };
    })
  })),

  addComm: (caseId, comm) => set(s => {
    const id = `cm${s.nextCommNum}`;
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'communication_sent', date: comm.date || new Date().toISOString().split('T')[0], actor: comm.sentBy || 'Board', summary: `Communication sent: ${comm.subject}` };
    return {
      cases: s.cases.map(c => c.id === caseId ? { ...c, comms: [...c.comms, { ...comm, id }], decisionTrail: [...(c.decisionTrail || []), trail] } : c),
      nextCommNum: s.nextCommNum + 1
    };
  }),

  removeComm: (caseId, idx) => set(s => ({
    cases: s.cases.map(c => {
      if (c.id !== caseId) return c;
      const comms = [...c.comms];
      comms.splice(idx, 1);
      return { ...c, comms };
    })
  })),

  linkWO: (caseId, woId) => {
    const trail: DecisionTrailEntry = { id: 'te' + Date.now(), type: 'work_order_linked', date: new Date().toISOString().split('T')[0], actor: 'Board', summary: `Work order linked: ${woId}`, linkedEntityType: 'work_order', linkedEntityId: woId };
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedWOs: [...c.linkedWOs, woId], decisionTrail: [...(c.decisionTrail || []), trail] } : c) }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedWOs: c.linkedWOs });
    }
  },

  unlinkWO: (caseId, woId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedWOs: c.linkedWOs.filter(id => id !== woId) } : c) }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedWOs: c.linkedWOs });
    }
  },

  linkLetter: (caseId, letterId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedLetterIds: [...(c.linkedLetterIds || []), letterId] } : c) }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedLetterIds: c.linkedLetterIds });
    }
  },

  unlinkLetter: (caseId, letterId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedLetterIds: (c.linkedLetterIds || []).filter(id => id !== letterId) } : c) }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedLetterIds: c.linkedLetterIds });
    }
  },

  linkInvoice: (caseId, invoiceId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedInvoiceIds: [...(c.linkedInvoiceIds || []), invoiceId] } : c) }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedInvoiceIds: c.linkedInvoiceIds });
    }
  },

  unlinkInvoice: (caseId, invoiceId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedInvoiceIds: (c.linkedInvoiceIds || []).filter(id => id !== invoiceId) } : c) }));
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedInvoiceIds: c.linkedInvoiceIds });
    }
  },

  linkMeeting: (caseId, meetingId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedMeetingIds: [...(c.linkedMeetingIds || []), meetingId] } : c) }));
    // Bidirectional sync: also link case on the meeting side
    import('@/store/useMeetingsStore').then(({ useMeetingsStore }) => {
      useMeetingsStore.getState().linkCase(meetingId, caseId);
    });
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedMeetingIds: c.linkedMeetingIds });
    }
  },

  unlinkMeeting: (caseId, meetingId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedMeetingIds: (c.linkedMeetingIds || []).filter(id => id !== meetingId) } : c) }));
    // Bidirectional sync: also unlink case on the meeting side
    import('@/store/useMeetingsStore').then(({ useMeetingsStore }) => {
      useMeetingsStore.getState().unlinkCase(meetingId, caseId);
    });
    if (isBackendEnabled) {
      const c = get().cases.find(x => x.id === caseId);
      if (c) casesSvc.updateCase(caseId, { linkedMeetingIds: c.linkedMeetingIds });
    }
  },

  // ─── Fiduciary: Spending Decisions ──────────────────────
  setSpendingDecision: (caseId, stepIdx, decision) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        steps[stepIdx] = { ...steps[stepIdx], spendingDecision: decision };
        const trail: DecisionTrailEntry = {
          id: 'te' + Date.now(), type: 'spending_decision', date: today,
          actor: decision.recordedBy, summary: `Spending decision: $${decision.amount.toLocaleString()} from ${decision.fundingSource}`,
          details: decision.rationale,
        };
        return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
  },

  // ─── Fiduciary: Bid Collection ──────────────────────────
  initBidCollection: (caseId, stepIdx, minimumBids) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        steps[stepIdx] = { ...steps[stepIdx], bidCollection: { minimumBids, bids: [], selectedBidId: null, selectionRationale: '', completedDate: null } };
        return { ...c, steps };
      })
    }));
  },

  addBid: (caseId, stepIdx, bid) => {
    const today = new Date().toISOString().split('T')[0];
    const bidId = 'bid' + Date.now();
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const bc = steps[stepIdx].bidCollection;
        if (!bc) return c;
        steps[stepIdx] = { ...steps[stepIdx], bidCollection: { ...bc, bids: [...bc.bids, { ...bid, id: bidId }] } };
        const trail: DecisionTrailEntry = {
          id: 'te' + Date.now(), type: 'bid_uploaded', date: today,
          actor: 'Board', summary: `Bid received from ${bid.vendorName}: $${bid.amount.toLocaleString()}`,
          linkedEntityType: 'bid', linkedEntityId: bidId,
        };
        return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
  },

  removeBid: (caseId, stepIdx, bidId) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const bc = steps[stepIdx].bidCollection;
        if (!bc) return c;
        steps[stepIdx] = { ...steps[stepIdx], bidCollection: { ...bc, bids: bc.bids.filter(b => b.id !== bidId), selectedBidId: bc.selectedBidId === bidId ? null : bc.selectedBidId } };
        return { ...c, steps };
      })
    }));
  },

  selectBid: (caseId, stepIdx, bidId, rationale) => {
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        const bc = steps[stepIdx].bidCollection;
        if (!bc) return c;
        const selectedBid = bc.bids.find(b => b.id === bidId);
        steps[stepIdx] = { ...steps[stepIdx], bidCollection: { ...bc, selectedBidId: bidId, selectionRationale: rationale, completedDate: today } };
        const trail: DecisionTrailEntry = {
          id: 'te' + Date.now(), type: 'bid_selected', date: today,
          actor: 'Board', summary: `Bid selected: ${selectedBid?.vendorName || 'Unknown'} ($${selectedBid?.amount.toLocaleString() || '0'})`,
          details: rationale, linkedEntityType: 'bid', linkedEntityId: bidId,
        };
        return { ...c, steps, decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
  },

  // ─── Fiduciary: Conflict Checks ─────────────────────────
  addConflictCheck: (caseId, check) => {
    const checkId = 'cc' + Date.now();
    const today = new Date().toISOString().split('T')[0];
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId) return c;
        const newCheck = { ...check, id: checkId };
        const trail: DecisionTrailEntry = {
          id: 'te' + Date.now(), type: 'conflict_check', date: today,
          actor: 'Board', summary: 'Conflict of interest check initiated',
          linkedEntityType: 'conflict_check', linkedEntityId: checkId,
        };
        return { ...c, conflictChecks: [...(c.conflictChecks || []), newCheck], decisionTrail: [...(c.decisionTrail || []), trail] };
      })
    }));
  },

  updateConflictDeclaration: (caseId, checkId, memberId, declaration) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId) return c;
        const checks = (c.conflictChecks || []).map(ck => {
          if (ck.id !== checkId) return ck;
          const declarations = ck.declarations.map(d =>
            d.memberId === memberId ? { ...d, ...declaration } : d
          );
          const allDeclared = declarations.every(d => d.hasConflict !== null);
          const recusedCount = declarations.filter(d => d.recused).length;
          const quorumMet = (declarations.length - recusedCount) >= ck.quorumRequired;
          return { ...ck, declarations, quorumMet, completedDate: allDeclared ? new Date().toISOString().split('T')[0] : null };
        });
        return { ...c, conflictChecks: checks };
      })
    }));
  },

  // ─── Decision Trail ─────────────────────────────────────
  addTrailEntry: (caseId, entry) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId) return c;
        return { ...c, decisionTrail: [...(c.decisionTrail || []), { ...entry, id: 'te' + Date.now() }] };
      })
    }));
  },

  // ─── Active Case Context (floating widget) ────────────
  setActiveCaseContext: (ctx) => set({ activeCaseContext: ctx }),
  clearActiveCaseContext: () => set({ activeCaseContext: null }),

  // ─── Shell Refactor: Active Step ─────────────────────
  setShellActiveStep: (caseId, stepIdx) => {
    const s = get();
    const c = s.cases.find(x => x.id === caseId);
    const maxIdx = c?.steps ? c.steps.length - 1 : 0;
    const clamped = Math.max(0, Math.min(stepIdx, maxIdx));
    set({ shellActiveStep: clamped, shellActiveStepCaseId: caseId });
  },

  // ─── Budget Drafting ──────────────────────────────────
  saveBudgetDraft: (caseId, stepIdx, draft) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        steps[stepIdx] = { ...steps[stepIdx], budgetDraft: draft };
        return { ...c, steps };
      })
    }));
  },
}), {
  name: 'onetwo-issues',
  partialize: (state: IssuesState) => ({
    issues: state.issues,
    cases: state.cases,
    nextCaseNum: state.nextCaseNum,
    nextIssueNum: state.nextIssueNum,
    nextCommNum: state.nextCommNum,
    activeCaseContext: state.activeCaseContext,
  }),
  merge: (persisted: any, current: any) => {
    const merged = { ...current, ...(persisted || {}) };
    // Restore additional approaches from separate storage key (survives reset cycles)
    const savedAA = loadAdditionalApproachesFromStorage();
    // Re-hydrate localStorage cases: rebuild steps from templates (preserving user progress)
    // to ensure correct approach-specific steps (self/legal/pre) are always applied
    if (merged.cases) {
      merged.cases = merged.cases.map((c: any) => {
        const patched = {
          ...c,
          linkedLetterIds: c.linkedLetterIds || [],
          linkedInvoiceIds: c.linkedInvoiceIds || [],
          linkedMeetingIds: c.linkedMeetingIds || [],
          conflictChecks: c.conflictChecks || [],
          decisionTrail: c.decisionTrail || [],
          additionalApproaches: c.additionalApproaches?.length > 0
            ? c.additionalApproaches
            : (savedAA[c.id] || []),
        };
        return rehydrateCase(patched);
      });
    }
    if (merged.issues) {
      merged.issues = merged.issues.map((i: any) => ({
        ...i,
        comms: i.comms || [],
      }));
    }
    return merged;
  },
}));
