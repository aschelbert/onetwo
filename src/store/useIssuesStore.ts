import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as issuesSvc from '@/lib/services/issues';
import * as casesSvc from '@/lib/services/cases';
import type { Issue, CaseTrackerCase, CaseStep, CaseComm, CaseAttachment, BoardVote, CaseApproach, CasePriority, AdditionalApproach } from '@/types/issues';

// ─── Situation Templates ───────────────────────────────────
export interface StepAction {
  type: 'navigate' | 'modal' | 'inline';
  target: string;
  label: string;
}

export interface SituationStep {
  s: string; t?: string; d?: string | null; detail?: string | null; w?: string;
  action?: StepAction;
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
          {s:'Review current year financials: actual vs budget variance, reserve balances, collection rate, outstanding receivables',t:'90 days before fiscal year-end',d:'Fiscal Lens: Dashboard & Reports',detail:'Key questions: (1) Which budget categories went over or under? (2) Is the collection rate above 90%? (3) What is the reserve percent funded? (4) Are there any delinquent accounts affecting cash flow? This data drives next year\'s budget decisions.',action:{type:'navigate',target:'financial:dashboard',label:'Open Financial Overview'}},
          {s:'Review reserve study: what capital projects are coming in the next 1-5 years? Is the reserve contribution adequate?',t:'60-90 days out',d:'Reserve study & Fiscal Lens: Reserves',detail:'This is the most important budget decision. If reserve funding is below 70%, you should increase the annual contribution — even if it means a slightly higher assessment. Every dollar NOT contributed to reserves today becomes a dollar in a future special assessment. Check the reserve study\'s recommended annual contribution and compare to your current amount.',action:{type:'navigate',target:'financial:reserves',label:'Open Reserves'}},
          {s:'Build a 3-year financial outlook: what known costs are coming and how will you fund them?',t:'60-90 days out',detail:'Beyond next year\'s budget, think 3 years ahead. Are there: major contracts expiring (management, insurance, elevator)? Capital projects in the reserve study within 3 years? Insurance premium increases expected? A 3-year outlook prevents surprise assessments and gives the board time to plan. Share this outlook with owners — it builds confidence.'},
          {s:'Obtain bids, contract renewals, and cost estimates for all operating expenses',t:'60-90 days out',d:'Vendor contracts',detail:'Review each vendor contract for renewal terms and rate changes. Obtain competitive bids for expiring contracts. Factor in inflation (typically 3-5% for utilities, insurance often higher). Don\'t just roll forward last year\'s numbers — cost assumptions should be justified.'},
          {s:'Draft proposed budget: operating expenses + reserve contribution + contingency = total; calculate per-unit assessment',t:'60 days out',detail:'Budget structure: (1) Operating expenses by category (use Fiscal Lens Budget tab). (2) Reserve contribution (per reserve study recommendation). (3) Contingency (3-5% of operating budget — covers unexpected costs without raiding reserves). (4) Total divided by total percentage interests = per-unit assessment. Show the per-unit impact clearly.',action:{type:'navigate',target:'financial:budget',label:'Open Budget'}},
          {s:'Determine if assessment increase triggers owner vote per bylaws or statute',t:'With budget draft',d:'Bylaws & DC Code § 29-1135.02',detail:'Check bylaws for assessment increase cap (commonly 10-15% without owner vote). If increase exceeds cap, owner vote or ratification is required. If you need a large increase, consider phasing it over 2 years (e.g., 10% this year, 8% next year) to stay within the cap.'},
          {s:'Present proposed budget at open board meeting in plain language; explain the "why" behind every increase',t:'30 days before adoption',d:'DC Code § 29-1135.02',detail:'DC requires 30-day notice before budget adoption. Owners don\'t need to understand every line item — they need to know: (1) What is my assessment? (2) Why is it changing? (3) What am I getting for it? (4) What happens to reserves? Present in these terms, not accounting jargon. Allow written questions from owners who cannot attend.'},
          {s:'Distribute formal budget package and assessment notice to all owners',t:'30 days before effective',d:'DC Code § 29-1135.02 & Bylaws',detail:'Package should include: proposed budget with prior year comparison, reserve funding status, assessment amount and effective date, explanation of changes, and a summary of upcoming capital needs from the reserve study. Send via method required by bylaws.'},
          {s:'Board votes to adopt budget',t:'Before fiscal year start',d:'Bylaws: Voting & DC Code § 29-1135.02',detail:'Record vote in minutes with full budget attached. If the assessment increase exceeds the bylaws cap (see Step 6), present at annual meeting for owner ratification. If owners reject the budget, operate under prior year budget until a revised budget is adopted.',w:'Owner ratification required when assessment increase exceeds bylaws cap — see Bylaws & DC Code § 29-1135.02'}
        ],
        self:[
          {s:'Respond to owner disputes of assessment increase with written justification, reserve study data, and cost comparisons',detail:'Compare per-unit costs to similar buildings in the area. Cite specific bylaw provisions authorizing assessments. Show the cost of NOT increasing (underfunded reserves, deferred maintenance).',w:'Applies when an owner formally disputes the assessment increase'},
          {s:'Operate under prior year budget until new budget is approved per bylaws',w:'Applies when budget is not adopted before fiscal year start',detail:'Continue collecting assessments at the prior year rate. Call a special meeting to adopt a revised budget as soon as possible.'},
          {s:'File any required annual financial reports or disclosures',detail:'DC requires annual financial disclosure to owners per § 29-1135.05.'}
        ],
        legal:[
          {s:'Consult attorney if assessment increase exceeds bylaws threshold requiring owner vote',w:'Increase > 10-15% or per bylaws cap'},
          {s:'Legal review of budget adoption process if challenged by owners',w:'Owner files formal challenge or threatens suit'},
          {s:'Attorney advises on fiduciary duty if board knowingly underfunds reserves',w:'Reserve funding below 50% of recommended level'}
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
          {s:'Identify capital need and obtain 2-3 professional cost estimates',t:'Immediately upon identifying need',d:'Reserve study',detail:'Document why the expense is necessary, why reserves are insufficient, and what alternatives were considered (phased approach, financing, deferred scope).'},
          {s:'BEFORE deciding on a special assessment: evaluate all alternatives to minimize owner impact',t:'1-7 days',d:'Fiscal Lens: Spending Decisions',detail:'Special assessments are the LAST resort, not the first. Evaluate in order: (1) Can reserves cover part or all of it? (2) Can the project be phased to spread cost? (3) Can the HOA take a loan to spread payments over 3-10 years? (4) Can an insurance claim offset part of the cost? (5) Can the operating budget absorb it with a temporary assessment increase? Only after exhausting these options should you proceed with a one-time special assessment.',w:'Jumping straight to a special assessment without exploring alternatives is a common board mistake that frustrates owners.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'}},
          {s:'Review reserve study: is this item in the plan? Why are reserves short?',t:'1-3 days',d:'Fiscal Lens: Reserves tab',detail:'If reserves are short, be transparent about why: Was the reserve study outdated? Was the board underfunding contributions? Did costs rise faster than projected? Owners will ask — have honest answers ready. This transparency builds trust and increases vote success.'},
          {s:'Calculate per-unit cost using Declaration percentage interests (NOT equal split)',t:'With cost estimates',d:'Declaration of Condominium',detail:'Per-unit allocation must follow the percentage interest defined in the Declaration. Example: a 1BR unit at 0.8% interest pays $800 on a $100K assessment, while a 3BR at 1.5% pays $1,500. Show each unit their specific amount in the proposal.'},
          {s:'Design payment options that reduce hardship: installment plans, early-pay discount, hardship provision',t:'1-2 weeks',detail:'For assessments under $1,000/unit: offer lump sum or 3-month installments. For $1,000-5,000/unit: offer 6-12 month installments. For over $5,000/unit: offer 12-24 month installments and consider HOA financing instead. Include a hardship application process for owners who can demonstrate financial difficulty. Consider an early payment discount (e.g., 3% discount if paid in full within 30 days) to improve cash flow.'},
          {s:'Review bylaws and DC Code for voting threshold, notice requirements, and borrowing authority',t:'1-2 weeks',d:'Bylaws & DC Code § 29-1135.03',detail:'DC typically requires 2/3 (66.7%) owner approval for special assessments. Check if your bylaws allow the board to borrow (e.g., HOA loan) as an alternative — borrowing may have different or lower voting thresholds.'},
          {s:'Prepare owner-friendly proposal: plain language, per-unit amounts, payment options, and what happens if we don\'t act',t:'2-3 weeks before meeting',detail:'Your proposal should answer these questions for owners: (1) What is the problem? (2) What happens if we wait? (3) How much will it cost me? (4) What are my payment options? (5) Why can\'t reserves cover this? (6) What is the board doing to prevent this in the future? Include photos/engineering reports showing the issue.'},
          {s:'Send formal notice to all owners with full proposal, proxy form, and meeting date',t:'30-60 days before vote',d:'DC Code § 29-1135.03 & Bylaws: Notice',detail:'Notice must include: purpose, total amount, per-unit amount table, proposed payment schedule options, date/time of owner meeting/vote, proxy form. Send via method required by bylaws.'},
          {s:'Hold owner meeting: present the problem, the options considered, and the proposed solution; conduct vote',t:'Per notice period',d:'Bylaws: Voting requirements',detail:'Typically requires 2/3 owner approval in DC. Present alternatives you considered and explain why this approach was chosen. Allow owner questions. Use secret ballot if bylaws require. Document vote count, quorum, and result in minutes.'},
          {s:'Issue formal assessment notice with payment schedule, due dates, and hardship application',t:'Within 14 days of approval',detail:'Include: total amount, per-unit share, due date(s), payment plan enrollment form, payment methods accepted, late fee policy, hardship application. Owners should know exactly what they owe and their options.'},
          {s:'Create plan to prevent future special assessments: increase reserve contributions to meet study targets',t:'Next budget cycle',d:'Fiscal Lens: Budget & Reserves',detail:'The best special assessment is the one that never happens. After this assessment, review and increase the annual reserve contribution to adequately fund future capital needs per the reserve study. Present this commitment to owners — it shows the board is learning and planning ahead.'}
        ],
        self:[
          {s:'Send formal demand letter to non-paying owners citing CC&Rs, board resolution, and state statute',detail:'Certified mail, return receipt requested. Include copy of vote results and resolution.',w:'Required when owner does not remit payment by due date'},
          {s:'Record lien against non-paying unit per DC lien statute',detail:'DC Code § 42-1903.13: Assessment liens have 6-month super-priority per § 29-1135.08. File with DC Recorder of Deeds.'},
          {s:'Offer hardship payment plan for owners demonstrating financial difficulty — apply uniformly',detail:'Document in writing. Board should adopt a uniform hardship policy to avoid selective enforcement claims. Typical terms: extended payment period (up to 24 months), no late fees during hardship plan, interest may apply.'}
        ],
        legal:[
          {s:'Attorney reviews special assessment process and vote requirements before adoption',w:'Assessment exceeds bylaws threshold or > $5K/unit'},
          {s:'Attorney advises on per-unit allocation methodology if challenged',w:'Owner disputes allocation basis'},
          {s:'Attorney reviews HOA financing terms if considering a loan instead of assessment',w:'Board evaluating HOA loan option'},
          {s:'Attorney files liens and pursues collection for non-payment',w:'Owner is 60+ days delinquent'},
          {s:'Attorney initiates foreclosure on assessment lien if necessary',w:'Severe delinquency, 6-12 months'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.03: Special assessments typically require 2/3 owner vote. DC Code § 42-1903.13: Assessment liens attach automatically. § 29-1135.08: 6-month super-lien priority over first mortgage. REDUCING OWNER IMPACT: (1) Phase the project to spread cost over 2+ years. (2) Use partial reserves + smaller assessment. (3) HOA loan spreads cost across 3-10 years of modest assessment increases instead of one large hit. (4) Offer installment plans with hardship provisions. (5) Early-pay discount improves cash flow. The goal is to get the work done while being fair to owners of all income levels.',
          '_':'MINIMIZING OWNER IMPACT: Always explore alternatives before special assessment. Best to worst for owners: (1) Reserves cover it — no impact. (2) Phase the work — smaller cost per year. (3) HOA financing — spread over years as modest increase. (4) Combination — partial reserves + small assessment. (5) Full special assessment — offer installment plans. Board members who plan ahead with adequate reserve funding avoid putting owners in this position.'
        }
      },
      { id:'delinquent-accounts', title:'Delinquent Accounts', desc:'Late notices, payment plans, lien filings, foreclosure',
        tags:['Late notices','Payment plans','Lien filings','Foreclosure proceedings'],
        pre:[
          {s:'Send first late notice (friendly reminder) after grace period',t:'5-15 days past due',d:'Bylaws: Late fee policy'},
          {s:'Apply late fee per governing docs; send second notice',t:'30 days past due',d:'CC&Rs: Collection policy'},
          {s:'Send formal demand letter via certified mail',t:'60 days past due',d:'Collection policy'},
          {s:'Offer payment plan agreement in writing',t:'60-90 days',d:'Board resolution'},
          {s:'Suspend amenity access/voting rights if permitted',t:'Per governing docs',d:'CC&Rs: Suspension provisions'},
          {s:'Send pre-lien notice (required in many states)',t:'90 days',d:'State condo act: Pre-lien notice'}
        ],
        self:[
          {s:'Record assessment lien at county recorder office',detail:'Filing fees typically $25-75'},
          {s:'File small claims court action for amounts within limits',detail:'Prepare ledger, notices, governing doc provisions'},
          {s:'Document payment plan agreement in writing signed by both parties',w:'Required when a payment plan is offered to a delinquent owner'}
        ],
        legal:[
          {s:'Turn over to attorney for formal collection',w:'Account is 90-120 days delinquent'},
          {s:'Attorney files lien and pursues judgment',w:'Amount justifies legal costs (typically >$2K)'},
          {s:'Attorney initiates judicial foreclosure on lien',w:'Severe cases, 12+ months delinquent'}
        ],
        notes:{'DC':'DC Code § 29-1135.08 — 6 months super-lien priority.','_':'Review your state for pre-lien notice requirements and lien recording procedures.'}
      },
      { id:'financial-review', title:'Financial Review', desc:'Financial audits and reviews',
        tags:['Annual audit','CPA review','Financial statements'],
        pre:[
          {s:'Select auditor or CPA firm',t:'60-90 days before fiscal year-end'},
          {s:'Provide financial records and documentation',t:'After year-end close'},
          {s:'Review draft audit/review report',t:'2-4 weeks after records provided'},
          {s:'Board reviews findings and management letter',t:'Board meeting'},
          {s:'Present results to owners at annual meeting',t:'Annual meeting',d:'Bylaws: Financial reporting'},
          {s:'File report if required by state',t:'Per state requirements'}
        ],
        self:[{s:'Develop remediation plan and timeline for any findings requiring action',w:'Required when audit/review identifies deficiencies'}],
        legal:[{s:'Attorney reviews audit findings with legal implications',w:'Material findings or irregularities discovered'}],
        notes:{'_':'Many states require annual financial reviews or audits above certain thresholds. Check your governing docs and state law.'}
      },
      { id:'reserve-management', title:'Reserve Management', desc:'Reserve studies, tapping reserves, capital planning',
        tags:['Commissioning reserve studies','Tapping reserves','Capital planning','Reserve fund'],
        pre:[
          {s:'Commission or update professional reserve study (required every 3-5 years)',t:'Every 3-5 years',d:'DC Code § 42-1903.13 & Best practice',detail:'Study should cover all common elements with limited useful life. Include: component inventory, condition assessment, estimated replacement cost, remaining useful life, funding recommendations. Use a credentialed reserve specialist (RS) or professional engineer. Cost: typically $3K-8K for a full study, $1K-3K for an update.'},
          {s:'Review reserve study with full board: understand what\'s coming in the next 1, 3, 5, and 10 years',t:'2-4 weeks after study',d:'Fiscal Lens: Reserves tab',detail:'Key metric: percent funded (current balance / fully funded balance). Below 30% = critically underfunded (special assessments very likely). 30-50% = weak (some risk). 50-70% = fair. Above 70% = strong. CRITICAL: identify any major expenses due in the next 3-5 years (roof, elevator, facade, plumbing) and whether current reserves will cover them. If not, you need a plan NOW — not when the expense hits.',action:{type:'navigate',target:'financial:reserves',label:'Open Reserves'}},
          {s:'Adopt funding plan: choose a strategy that avoids future special assessments',t:'Board meeting',d:'Bylaws: Reserve provisions',detail:'Three approaches: (1) FULL FUNDING — contribute enough to reach 100% funded by the time each component needs replacement. Highest annual contribution but zero special assessment risk. (2) THRESHOLD FUNDING — maintain enough reserves that no single year requires a special assessment, even if not fully funded. (3) BASELINE — keep reserves positive. Cheapest short-term but high special assessment risk. Recommendation for most HOAs: target at least threshold funding (60-70% funded).'},
          {s:'Calculate the annual reserve contribution needed and build into next budget',t:'During budget process',d:'Fiscal Lens: Budget tab',detail:'Use the reserve study\'s recommended annual contribution as your target. If current contribution is significantly below target, plan a gradual increase over 2-3 years rather than a sudden jump. Example: if study recommends $24K/year and you\'re at $12K, increase to $16K year 1, $20K year 2, $24K year 3.',action:{type:'navigate',target:'financial:budget',label:'Open Budget'}},
          {s:'Create a 5-year capital plan from the reserve study: what\'s coming, what it costs, and how you\'ll pay',t:'After funding plan adoption',detail:'Map out every major expense in the next 5 years. For each: estimated cost, current reserve allocation, gap, and plan to close the gap. Share this with owners annually — it builds confidence that the board is planning ahead and prevents surprise special assessments.'},
          {s:'Verify reserve expenditure matches a designated reserve component before spending',t:'Before expenditure',d:'Bylaws & DC Code § 42-1903.13',detail:'Reserves should only be spent on the components they were collected for. Using reserves for non-designated purposes (e.g., covering an operating shortfall) is a fiduciary risk and requires owner vote per bylaws.',action:{type:'navigate',target:'financial:reserves',label:'Open Reserves'}},
          {s:'Obtain owner vote before using reserves for any non-designated purpose',t:'Before expenditure',d:'Bylaws: Reserve use restrictions',detail:'Most bylaws restrict reserve use to designated capital items. Document the reason, get owner approval, and create a written repayment plan showing how reserves will be replenished.',w:'Required per bylaws when reserve funds are used outside their designated purpose'},
          {s:'Disclose reserve health to owners annually: balance, percent funded, upcoming needs, and board\'s plan',t:'Annually',d:'DC Code § 42-1903.13 & Bylaws',detail:'Include in annual budget report and present at annual meeting. Owners should know: current balance, percent funded, planned expenditures in next 3-5 years, annual contribution amount, and whether the board is on track. Transparency prevents surprise special assessments and builds trust.'}
        ],
        self:[
          {s:'Respond to owner challenges on reserve funding with reserve study data, 5-year plan, and board resolution documenting the strategy',detail:'Show the board is making informed, documented decisions about reserve funding.',w:'Required when an owner formally challenges the reserve funding level'},
          {s:'Prepare reserve disclosure for resale certificates per DC Code § 42-1904.04(a)',detail:'Buyers have a right to know the reserve health before purchasing. Include: balance, percent funded, any planned special assessments, and upcoming capital projects.'},
          {s:'Develop a reserve catch-up plan immediately when reserves are critically underfunded',detail:'Options to rebuild reserves: (1) Increase annual contribution by 25-50% over 2-3 years. (2) One-time small special assessment earmarked for reserves. (3) Defer non-urgent capital projects. (4) Combine approaches. Present plan to owners with timeline to reach 60%+ funded. The longer you wait, the worse it gets — underfunded reserves compound into larger future special assessments.',w:'Required when reserve funding falls below 30% of recommended level'}
        ],
        legal:[
          {s:'Attorney reviews reserve borrowing or commingling questions',w:'Board wants to use reserves for non-designated purpose'},
          {s:'Attorney advises on fiduciary duty regarding underfunded reserves',w:'Reserve study shows significant shortfall (< 30% funded)'},
          {s:'Attorney advises if reserve expenditure exceeds board authority and requires owner vote',w:'Large unplanned reserve expenditure not in study'}
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
          {s:'Document issue with photos, video, dates, affected areas',t:'Immediately',detail:'Include: location, severity, units affected, date discovered, who reported it. This documentation supports insurance claims and contractor scope.'},
          {s:'Determine if common element or unit owner responsibility per CC&Rs',t:'1-3 days',d:'CC&Rs: Maintenance matrix',detail:'CC&Rs define the boundary between HOA and unit owner responsibility. Typically: structure, roof, exterior walls, common pipes = HOA. Interior finishes, fixtures, appliances = owner. If it is an owner responsibility, notify them in writing with the CC&R section cited.'},
          {s:'Obtain 2-3 qualified contractor bids; verify licenses and insurance',t:'1-2 weeks',detail:'For emergency repairs (active leak, safety hazard), board may authorize immediate work under emergency spending provisions and ratify at next meeting. For non-emergency: always get competitive bids.'},
          {s:'FUNDING DECISION: Determine where the money comes from before approving the repair',t:'Before approval',d:'Fiscal Lens: Spending Decisions',detail:'Use the Spending Decisions tab to analyze: (1) Is this a BUDGETED operating expense? If yes, check if the budget category has room — use operating funds. (2) Is this a RESERVE item (e.g., roof, elevator, plumbing risers)? If yes, use reserves — that\'s what they\'re for. (3) Is this covered by INSURANCE (e.g., storm damage, water intrusion from covered peril)? File a claim. (4) Is this UNEXPECTED and large? Create a spending request to see the per-unit impact and options. Never spend money without knowing where it comes from.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'}},
          {s:'Check bylaws for board spending authority — does this need an owner vote?',t:'Before approval',d:'Bylaws: Spending authority',detail:'Most bylaws authorize the board to spend up to a threshold (e.g., $5K-$25K) without owner vote. If the repair exceeds this threshold and is not an emergency, you need owner approval. If it IS an emergency (health/safety), proceed and ratify at the next meeting.'},
          {s:'Board approves expenditure at meeting; document vote, funding source, and contractor selection in minutes',t:'Next board meeting (emergency exception for health/safety)',d:'Bylaws: Spending authority',detail:'Minutes should record: the repair needed, bids received, selected contractor and rationale, total cost, funding source (operating/reserve/insurance), and board vote.'},
          {s:'Create Work Order in Fiscal Lens; engage contractor; oversee work and document completion',t:'Per scope',d:'Fiscal Lens: Work Orders',detail:'Create a work order to track the full lifecycle: draft → approved → invoiced → paid. This creates GL entries automatically. Inspect completed work and photograph before releasing final payment.',action:{type:'modal',target:'create-wo',label:'Create Work Order'}},
          {s:'Charge repair costs back to the responsible unit owner when caused by owner negligence',t:'After repair',d:'CC&Rs: Damage responsibility',detail:'CC&Rs authorize the HOA to charge back repair costs caused by owner negligence. Include: CC&R section cited, repair invoices, photos, and timeline for reimbursement. This reduces the financial impact on all other owners. If the owner disputes, escalate to formal demand.',w:'Required per CC&Rs when investigation determines owner negligence caused the damage'}
        ],
        self:[
          {s:'Send formal demand for reimbursement to responsible unit owner with documentation',detail:'Include CC&R section, invoices, photos. Certified mail, return receipt.',w:'Required when unit owner is determined to be responsible for damage'},
          {s:'Send demand letter to contractor citing contract terms and deficiency documentation',w:'Required when contractor dispute arises over repair quality or scope'},
          {s:'File insurance claim if applicable; coordinate with unit owner HO-6 insurance'}
        ],
        legal:[
          {s:'Attorney reviews responsibility dispute between HOA and unit owner',w:'Dispute over who pays for repair'},
          {s:'Attorney pursues claim against contractor for defective work',w:'Contractor refuses to remedy'},
          {s:'Attorney advises if repair cost exceeds board spending authority',w:'Cost exceeds bylaws threshold and owner vote may be needed'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.04: Maintenance responsibility follows the Declaration\'s allocation. Board has fiduciary duty to maintain common elements promptly. FUNDING: Routine maintenance = operating budget. Capital replacements (roof, elevator, plumbing) = reserves. Damage from covered perils = insurance. Check bylaws for spending authority limits — repairs above threshold require owner vote unless emergency.',
          '_':'FUNDING DECISION TREE: (1) Routine maintenance → operating budget. (2) Capital replacement → reserves (that\'s what they\'re for). (3) Covered peril damage → insurance claim. (4) Unexpected + large → Spending Decisions tab for funding analysis. Always document the funding source in board minutes.'
        }
      },
      { id:'emergency-situations', title:'Emergency Situations', desc:'Burst pipes, flooding, fire, storm damage, sewer backups',
        tags:['Burst pipes','Flooding','Fire damage','Storm damage','Emergency repair'],
        pre:[
          {s:'Ensure safety: evacuate if necessary, call 911 for fire/gas/structural',t:'Immediately',detail:'Life safety is the absolute first priority. Do not attempt to assess damage until area is safe.'},
          {s:'Engage emergency mitigation contractor (water extraction, board-up, temporary repairs)',t:'Within hours',d:'Bylaws: Emergency spending',detail:'Most bylaws authorize the board president or property manager to approve emergency spending without a full board vote when there is imminent risk to health, safety, or property. Document the emergency justification and take photos before mitigation begins.'},
          {s:'Document everything: photos, video, written timeline of events and actions taken',t:'Ongoing',detail:'This documentation is critical for insurance claims, contractor disputes, and demonstrating the board acted reasonably. Include: who discovered it, when, actions taken, contractors engaged, costs incurred. Create a single timeline document as events unfold.'},
          {s:'Notify insurance carrier and file claim within policy timeframe',t:'Within 24-48 hours',d:'Insurance policy: Notice provisions',detail:'Contact carrier claims department. Provide: policy number, date/time of loss, description, initial photos, estimated damage. Request adjuster visit. Do not dispose of damaged materials until adjuster approves. This is your most important financial step — insurance is the first funding source for emergencies.'},
          {s:'Notify affected unit owners in writing; advise on HO-6 claim filing for interior damage',t:'Within 24 hours',detail:'Owners need to file their own HO-6 claims for unit interior damage (flooring, drywall, personal property). Provide: description of incident, areas affected, HOA carrier claim number, contact for questions.'},
          {s:'Track all emergency expenditures in Fiscal Lens immediately — do not wait',t:'As incurred',d:'Fiscal Lens: Work Orders & Spending Decisions',detail:'Create work orders for each contractor/vendor even during the emergency. This is critical for: (1) insurance reimbursement — carrier will want itemized records, (2) board ratification, (3) determining the funding gap later. Sloppy record-keeping during emergencies is the #1 reason HOAs fail to recover full insurance proceeds.',action:{type:'navigate',target:'financial:workorders',label:'Open Work Orders'}},
          {s:'Board ratifies emergency expenditure at next meeting; document justification and funding source',t:'Next board meeting',d:'Bylaws: Emergency provisions',detail:'Present: description of emergency, actions taken, contractors engaged, total cost, insurance claim status, funding source. Board votes to ratify. Record in minutes. Even though the board president had authority to act, ratification creates a formal record.'},
          {s:'FUNDING THE GAP: After adjuster estimate, determine the shortfall and how to cover it',t:'After adjuster estimate',d:'Fiscal Lens: Spending Decisions',detail:'Calculate: Total repair cost minus insurance proceeds minus HOA deductible = gap. Use the Spending Decisions tab to analyze options: (1) INSURANCE covers most or all — best case, wait for proceeds. (2) OPERATING BUDGET can absorb the deductible + small gap. (3) RESERVES can cover the gap if the item is a designated reserve component. (4) SPECIAL ASSESSMENT needed if gap is large — check bylaws for emergency assessment procedures (often expedited notice/vote). (5) HOA LINE OF CREDIT to bridge until insurance pays.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'}},
          {s:'Appeal and pursue the insurance claim aggressively when denied or underpaid',t:'Within appeal window',detail:'Insurance carriers frequently underpay first estimates. Steps: (1) Get a detailed independent estimate from your own contractor. (2) File a written appeal with supporting documentation. (3) Request the specific policy provision cited for any denial. (4) Consider a public adjuster (works on contingency, typically 10% of recovery). (5) Escalate to state insurance commissioner if necessary.',w:'Required when carrier denies or underpays — carriers frequently underpay first estimates'},
          {s:'Determine who caused the damage and pursue cost recovery if applicable',t:'After emergency stabilized',detail:'If caused by unit owner negligence (e.g., left water running, failed to maintain appliance): the CC&Rs typically allow the HOA to charge the repair cost back to the owner. If caused by a contractor or third party: pursue their insurance. Cost recovery reduces the financial impact on the HOA and all other owners.'}
        ],
        self:[
          {s:'Coordinate insurance between master policy and unit HO-6 policies; determine deductible allocation per CC&Rs',detail:'CC&Rs typically define deductible allocation. Common approaches: (1) HOA bears the master policy deductible. (2) Deductible charged to the unit that caused the loss. (3) Deductible split among affected units. Know your CC&Rs approach BEFORE the emergency.'},
          {s:'Send formal notice of responsibility and demand for reimbursement to negligent unit owner',detail:'Include: CC&R section, documentation of cause, repair invoices. Certified mail.',w:'Required per CC&Rs when owner negligence caused the damage'},
          {s:'After emergency is resolved: review insurance coverage and deductible levels; adjust if needed at next renewal',detail:'If the deductible was a financial strain, consider lowering it at renewal. If coverage was insufficient, increase limits. Review annually.'}
        ],
        legal:[
          {s:'Attorney advises on insurance coverage disputes and deductible allocation',w:'Carrier denies or underpays claim'},
          {s:'Attorney pursues subrogation or third-party claims for cost recovery',w:'Damage caused by negligent third party or unit owner'},
          {s:'Attorney advises on emergency special assessment authority if insurance shortfall',w:'Insurance does not cover full cost and reserves insufficient'},
          {s:'Attorney engages public adjuster or files bad faith claim against carrier',w:'Carrier significantly underpays or denies valid claim'}
        ],
        notes:{
          'DC':'DC Code § 29-1108.01: Board has implied authority for emergency actions to protect health, safety, and property. Ratify at next board meeting. FUNDING EMERGENCIES: (1) Insurance is the primary source — file immediately, document everything, appeal underpayments. (2) Reserves can cover the gap for designated components. (3) Operating budget absorbs smaller gaps (deductibles, uncovered costs). (4) Emergency special assessment if gap is large — some bylaws allow expedited voting procedures. (5) HOA line of credit bridges cash flow until insurance pays. Track every dollar for reimbursement.',
          '_':'EMERGENCY FUNDING PRIORITY: (1) Insurance — file immediately, document thoroughly. (2) Reserves — for designated capital components. (3) Operating budget — for smaller gaps. (4) Special assessment — last resort, check bylaws for expedited procedures. The biggest mistake boards make in emergencies is not tracking expenses carefully enough to get full insurance reimbursement.'
        }
      },
      { id:'vendor-management', title:'Vendor Management', desc:'Hiring contractors, reviewing bids, contracts, disputes',
        tags:['Hiring contractors','Reviewing bids','Performance disputes','Contract management'],
        pre:[
          {s:'Define scope of work and budget; determine funding source and check spending authority',t:'Before soliciting bids',d:'Bylaws: Spending authority & Fiscal Lens',detail:'Before soliciting bids: (1) Check the budget category in Fiscal Lens — is there room in the operating budget? (2) If this is a capital item, check reserves. (3) Check bylaws for contract value thresholds (typically $10K-$25K requires owner vote). For recurring contracts (landscaping, management), compare the ANNUAL value to the threshold, not the monthly amount.',action:{type:'navigate',target:'financial:budget',label:'Open Budget'}},
          {s:'Obtain minimum 3 competitive bids from qualified contractors',t:'2-4 weeks',detail:'Provide identical scope to all bidders for fair comparison. Request: itemized pricing, timeline, references, proof of insurance, license number. A good bid process saves the HOA money and demonstrates fiduciary care.'},
          {s:'Verify contractor licenses, insurance (GL + workers comp), and check references',t:'1-2 weeks',d:'Fiduciary duty of care',detail:'Require: current state/local business license, general liability insurance ($1M+ naming HOA as additional insured), workers compensation if they have employees, completed W-9. Call 2-3 references on similar projects.'},
          {s:'Review contract terms: scope, fixed price, timeline, payment schedule, warranty, indemnification, termination',t:'1 week',detail:'Key terms: payment tied to milestones (not time), 10% retention on large projects, warranty (1-2 years minimum), insurance requirements, hold-harmless/indemnification, termination for cause and convenience, dispute resolution.'},
          {s:'Check for conflicts of interest: does any board member have a relationship with the contractor?',t:'Before approval',d:'Fiduciary duty of loyalty',detail:'Any board member with a relationship to the contractor must disclose and recuse from discussion and vote per conflict of interest policy. Document disclosure in minutes. This is a common source of board liability — take it seriously.'},
          {s:'Submit Spending Decision request if amount exceeds routine threshold; board approves at meeting',t:'Board meeting',d:'Fiscal Lens: Spending Decisions & Bylaws',detail:'For contracts above $5K: create a spending request in Fiscal Lens so the board can see the funding analysis (operating vs reserves, per-unit impact). Board approves with vote documented in minutes. If value exceeds bylaws threshold, schedule owner vote first.'},
          {s:'Execute contract; create Work Order in Fiscal Lens; set up payment milestones',t:'After approval',d:'Fiscal Lens: Work Orders',detail:'The WO tracks the financial lifecycle: draft → approved → invoiced → paid, creating GL entries automatically. Set payment milestones tied to completed work — never pay ahead of work.',action:{type:'modal',target:'create-wo',label:'Create Work Order'}},
          {s:'Monitor performance; document milestones and any deficiencies in writing immediately',t:'Ongoing',detail:'Regular progress check-ins. Photograph completed milestones. Send written notice of any deficiencies immediately — do not wait until project end. Early communication prevents disputes.'},
          {s:'Final inspection, punch list resolution, retention release, and warranty documentation',t:'At completion',detail:'Walk project with contractor and board representative. Create written punch list. Do not release retention until all items resolved and warranty documentation received. Update the reserve study if this was a capital replacement.'}
        ],
        self:[
          {s:'Send written notice citing contract provisions with cure period for performance issues',detail:'Give reasonable cure period (15-30 days). Certified mail.',w:'Required when contractor performance does not meet contract standards'},
          {s:'Send formal demand with documentation of deficiencies and cost of remediation',w:'Required when contractor fails to cure within the notice period'},
          {s:'File complaint with DC DLCP contractor licensing division if applicable'}
        ],
        legal:[
          {s:'Attorney reviews contract before execution for large projects',w:'Contracts exceeding $25K or per bylaws threshold'},
          {s:'Attorney sends demand and pursues breach of contract claim',w:'Contractor defaults or work defective'},
          {s:'Attorney advises if contract requires owner approval per bylaws spending limits',w:'Contract value exceeds board authority'}
        ],
        notes:{
          'DC':'DC DLCP (formerly DCRA) handles contractor licensing. Verify at dlcp.dc.gov. Require GL insurance naming HOA as additional insured. Check bylaws for contract value thresholds. FUNDING: Operating expenses = operating budget. Capital replacements = reserves. Use the Spending Decisions tab for contracts over $5K to see the financial impact before the board votes.',
          '_':'BEFORE YOU HIRE: (1) Know where the money comes from (operating budget vs reserves). (2) Check if the amount exceeds board spending authority. (3) Get 3+ bids. (4) Verify licenses and insurance. (5) Document the selection rationale. The bid process and spending authority check protect the board from liability.'
        }
      },
      { id:'inspection-scheduling', title:'Inspection Scheduling', desc:'Scheduling required inspections',
        tags:['Fire safety inspections','Elevator inspections','Building code inspections'],
        pre:[
          {s:'Identify inspection requirement and regulatory deadline',t:'As needed',d:'Local code requirements'},
          {s:'Research qualified inspectors and obtain quotes',t:'2-4 weeks'},
          {s:'Obtain quotes and select inspector',t:'1-2 weeks'},
          {s:'Schedule inspection date',t:'1-2 weeks out'},
          {s:'Notify residents of inspection date and any access needs',t:'Per notice requirements'},
          {s:'Attend inspection and receive preliminary findings',t:'Inspection day'},
          {s:'Address any findings or deficiencies',t:'Per inspector timeline'},
          {s:'File inspection report in building records',t:'Within 1 week'}
        ],
        self:[{s:'Document remediation plan and timeline for any cited deficiencies',w:'Required when inspection results in deficiency citation'}],
        legal:[{s:'Attorney responds to citations resulting from failed inspection',w:'Formal citation or enforcement action'}],
        notes:{'_':'Many jurisdictions require annual fire, elevator, and boiler inspections. Maintain a calendar of all required inspections.'}
      },
      { id:'preventative-maintenance', title:'Preventative Maintenance', desc:'Annual inspections, fire safety, roof, pest control',
        tags:['Annual inspections','Fire/life safety','Roof inspections'],
        pre:[
          {s:'Create annual maintenance calendar with all recurring items',t:'Start of year'},
          {s:'Schedule all required inspections (fire, elevator, boiler, backflow)',t:'Per code',d:'Local fire code'},
          {s:'Document inspection results and remediation items',t:'After each inspection'},
          {s:'Address deficiencies within required timelines',t:'Per inspector directive'},
          {s:'Maintain records of all inspections and contractor certifications',t:'Ongoing'}
        ],
        self:[{s:'Respond in writing to code violations and document remediation timeline',w:'Required when fire/building department issues a citation'}],
        legal:[{s:'Attorney responds to citations or fines from fire/building department',w:'Formal citation or enforcement action'}],
        notes:{'_':'Most jurisdictions require annual fire safety inspections. Keep logs of all maintenance and inspections.'}
      }
    ]
  },
  { id:'enforcement', num:'3', icon:'⚖️', label:'Rule Enforcement', color:'amber',
    sits: [
      { id:'covenant-violations', title:'Covenant Violations', desc:'Unauthorized construction, short-term rentals, noise, parking',
        tags:['Unauthorized construction','Short-term rentals','Architectural','Parking','Noise'],
        pre:[
          {s:'Document violation with photos, dates, witnesses',t:'Immediately'},
          {s:'Identify specific CC&R or rule section violated',t:'1-3 days',d:'CC&Rs/Rules'},
          {s:'Send first courtesy notice with cure period',t:'Within 1 week',d:'Bylaws: Enforcement section'},
          {s:'Send formal violation notice via certified mail when not cured',t:'After cure period',d:'CC&Rs: Enforcement',w:'Required when owner does not cure violation within the courtesy notice period'},
          {s:'Schedule hearing per governing docs (if required before fines)',t:'10-30 days notice',d:'Bylaws: Hearing procedures'},
          {s:'Impose fine or remedy per board resolution',t:'After hearing',d:'Fine schedule'}
        ],
        self:[
          {s:'Escalate fines per schedule when owner refuses to cure',detail:'Document each notice and response.',w:'Required when owner does not cure after formal violation notice'},
          {s:'Provide written CC&R explanation when owner disputes violation',w:'Required when owner formally disputes the cited violation'},
          {s:'For ongoing violation: file for injunctive relief in court',detail:'Document pattern and impact'}
        ],
        legal:[
          {s:'Attorney sends cease-and-desist letter',w:'Owner ignores multiple notices'},
          {s:'Attorney files for injunctive relief',w:'Ongoing violation causing damage'},
          {s:'Attorney pursues lawsuit for damages and compliance',w:'Serious structural or safety violation'}
        ],
        notes:{'_':'Follow your CC&R enforcement procedures carefully. Document everything. Most courts require exhaustion of internal remedies.'}
      },
      { id:'fine-hearings', title:'Fine Hearings', desc:'Conducting hearings, imposing fines, due process',
        tags:['Conducting hearings','Imposing fines','Due process'],
        pre:[
          {s:'Review governing docs for hearing requirements and notice periods',t:'Before scheduling'},
          {s:'Send hearing notice with specific violation, date/time, and rights',t:'Per bylaws (10-30 days)',d:'Bylaws: Hearing section'},
          {s:'Prepare hearing packet: violation docs, photos, prior notices',t:'Before hearing'},
          {s:'Conduct hearing: present facts, allow owner response, board deliberates',t:'Scheduled date'},
          {s:'Issue written decision with any fines or required actions',t:'Within 5-10 days',d:'Bylaws'},
          {s:'Send formal fine notice with payment deadline',t:'With decision',w:'Required when hearing results in a fine — per bylaws enforcement provisions'}
        ],
        self:[
          {s:'Review appeal process in governing docs and respond to owner appeal',w:'Required when owner files a formal appeal of the fine'},
          {s:'Add unpaid fine to assessment ledger and pursue as delinquency',w:'Required when fine remains unpaid past the deadline'}
        ],
        legal:[
          {s:'Attorney reviews hearing procedures for due process compliance',w:'Before first hearing or if challenged'},
          {s:'Attorney defends against lawsuit challenging fine',w:'Owner files suit'}
        ],
        notes:{'_':'Due process is critical. Provide adequate notice, opportunity to be heard, and impartial decision-makers.'}
      },
      { id:'architectural-review', title:'Architectural Review', desc:'Renovation requests, exterior mods, solar panels, windows',
        tags:['Renovation requests','Exterior modifications','Solar panels'],
        pre:[
          {s:'Receive written application with plans/specs',t:'Upon submission'},
          {s:'Review against architectural guidelines and CC&Rs',t:'1-2 weeks',d:'Architectural guidelines'},
          {s:'Inspect unit/area if needed',t:'Within 2 weeks'},
          {s:'Committee or board votes on application',t:'Next meeting or within 30 days'},
          {s:'Issue written decision with conditions (if approved)',t:'Within 5 days of decision'},
          {s:'Monitor construction for compliance with approved plans',t:'During work'}
        ],
        self:[
          {s:'Issue stop-work notice to owner who proceeds without approval',w:'Required when owner begins work without architectural committee approval'},
          {s:'Provide written explanation citing specific guidelines when owner disputes denial',w:'Required when owner formally disputes an architectural decision'}
        ],
        legal:[
          {s:'Attorney reviews architectural standards for enforceability',w:'Standards being challenged'},
          {s:'Attorney advises on solar panel access laws (many states protect)',w:'Solar panel request denied'}
        ],
        notes:{'_':'Architectural standards must be applied consistently. Many states have solar access laws that limit HOA restrictions.'}
      },
      { id:'pet-issues', title:'Pet & Animal Issues', desc:'Breed restrictions, ESA disputes, nuisance complaints',
        tags:['Breed restrictions','ESA disputes','Nuisance complaints'],
        pre:[
          {s:'Document complaint with specifics: dates, behavior, witnesses',t:'Upon complaint'},
          {s:'Review CC&Rs for pet rules and restrictions',t:'1-3 days',d:'CC&Rs: Pet section'},
          {s:'Send notice to pet owner citing specific rule and required remedy',t:'Within 1 week'},
          {s:'Request proper ESA/service animal documentation per Fair Housing Act',t:'Promptly',d:'Fair Housing Act',w:'Required when owner asserts an ESA or service animal accommodation'},
          {s:'Schedule hearing and escalate per enforcement policy for continuing nuisance',t:'Per bylaws',w:'Required when nuisance behavior continues after initial notice'}
        ],
        self:[
          {s:'Review HUD guidance on assistance animals for ESA disputes',w:'Required when there is an ESA accommodation dispute'},
          {s:'Report dangerous animal to local animal control',w:'Required when an animal poses a direct threat to health or safety'}
        ],
        legal:[
          {s:'Attorney advises on ESA/FHA requirements and reasonable accommodation',w:'ESA request or dispute'},
          {s:'Attorney handles bite incident liability',w:'Animal bite or attack on common area'}
        ],
        notes:{'_':'Fair Housing Act requires reasonable accommodation for assistance animals. Breed restrictions may not apply to ESAs/service animals.'}
      }
    ]
  },
  { id:'legal', num:'4', icon:'🏛️', label:'Legal & Risk', color:'rose',
    sits: [
      { id:'insurance-claims', title:'Insurance Claims', desc:'Water damage, unit vs common element, deductible allocation',
        tags:['Water damage claims','Deductible allocation','Common vs unit damage'],
        pre:[
          {s:'Document damage immediately with photos and written timeline',t:'Immediately'},
          {s:'Notify insurance carrier within policy timeframe',t:'Within 24-48 hours',d:'Insurance policy'},
          {s:'Determine if common element or unit responsibility',t:'1-3 days',d:'CC&Rs'},
          {s:'Coordinate between master policy and unit HO-6 policies',t:'1-2 weeks'},
          {s:'Obtain repair estimates and provide to adjuster',t:'As requested'},
          {s:'Review settlement offer against actual damages',t:'When received'}
        ],
        self:[{s:'Review denial letter and policy provisions for denied claims',w:'Required when carrier denies the claim'},{s:'Document actual costs and request reconsideration for underpaid claims',w:'Required when settlement offer is below actual damages'}],
        legal:[{s:'Attorney reviews claim denial and negotiates with carrier',w:'Carrier denies valid claim'},{s:'Attorney files bad faith claim',w:'Unreasonable claim handling'}],
        notes:{'_':'File claims promptly. Document everything. Review deductible allocation provisions in your CC&Rs.'}
      },
      { id:'litigation', title:'Litigation', desc:'Suing owners, being sued, contractor disputes',
        tags:['Suing owners','Being sued','Contractor disputes'],
        pre:[
          {s:'Document the underlying issue thoroughly',t:'Ongoing'},
          {s:'Attempt resolution through internal processes first',t:'Before litigation'},
          {s:'Review governing docs for dispute resolution requirements (mediation, arbitration)',t:'Before filing',d:'CC&Rs: Dispute resolution'},
          {s:'Notify D&O insurance carrier if board is sued',t:'Immediately upon notice',d:'D&O policy'}
        ],
        self:[{s:'Prepare and file in small claims court for amounts within jurisdictional limits',detail:'Check jurisdictional limits.',w:'Applies when claim amount is within small claims threshold'},{s:'Schedule mediation through approved provider per CC&Rs dispute resolution requirements',w:'Required when governing docs mandate mediation before litigation'}],
        legal:[{s:'Attorney handles all litigation (do not self-represent HOA in court beyond small claims)',w:'Any lawsuit filed or received'},{s:'Attorney evaluates cost-benefit of litigation vs settlement',w:'Before committing to trial'}],
        notes:{'_':'Many CC&Rs require mediation or arbitration before litigation. Check for attorneys fee provisions.'}
      },
      { id:'governing-docs', title:'Governing Document Interpretation', desc:'Interpreting covenants, resolving ambiguities',
        tags:['Interpreting covenants','Resolving ambiguities'],
        pre:[
          {s:'Identify specific provision and gather relevant context',t:'As needed'},
          {s:'Review state condo act for default rules',t:'1-3 days',d:'State condo act'},
          {s:'Check for prior board interpretations or resolutions',t:'1-3 days'},
          {s:'Draft board resolution documenting interpretation',t:'1 week'}
        ],
        self:[{s:'Provide written explanation with citations when owner disputes interpretation',w:'Required when owner formally disputes a board interpretation'}],
        legal:[{s:'Attorney provides formal opinion on ambiguous provisions',w:'Significant financial or legal consequence'},{s:'Attorney drafts amendment if current language is problematic',w:'Recurring interpretation disputes'}],
        notes:{'_':'Document all board interpretations as resolutions. Consistent application is key to enforceability.'}
      },
      { id:'bylaw-amendment', title:'Bylaw / CC&R Amendment', desc:'Full amendment lifecycle: drafting, notice, vote, recording',
        tags:['Amending bylaws','Updating rules','Recording amendments'],
        pre:[
          {s:'Identify need for amendment and draft proposed language',t:'1-2 months'},
          {s:'Legal review of proposed amendment',t:'2-4 weeks',d:'State condo act'},
          {s:'Send notice of proposed amendment to all owners',t:'Per governing docs',d:'Bylaws: Amendment section'},
          {s:'Hold meeting and conduct owner vote',t:'Per notice period'},
          {s:'Record approved amendment with county recorder',t:'Within 30 days'},
          {s:'Distribute updated documents to all owners',t:'After recording'}
        ],
        self:[{s:'Document vote results and prepare revised proposal for failed votes',w:'Required when amendment vote does not reach the approval threshold'}],
        legal:[{s:'Attorney drafts amendment language and reviews process',w:'Any CC&R or bylaw amendment'},{s:'Attorney handles recording and distribution requirements',w:'After approval'}],
        notes:{'_':'Most CC&R amendments require 67% owner approval. Bylaw amendments may require less. Check your specific docs.'}
      }
    ]
  },
  { id:'governance', num:'5', icon:'🗳️', label:'Governance', color:'violet',
    sits: [
      { id:'board-meetings', title:'Board Meetings', desc:'Agendas, executive sessions, member votes',
        tags:['Agendas','Executive sessions','Member votes'],
        pre:[
          {s:'Prepare and distribute agenda per notice requirements',t:'Per bylaws (5-10 days)',d:'Bylaws: Meeting notice'},
          {s:'Ensure quorum before conducting business',t:'At meeting start'},
          {s:'Conduct meeting per Roberts Rules or adopted procedures',t:'During meeting'},
          {s:'Record minutes and distribute to board for review',t:'Within 7 days'},
          {s:'Post approved minutes to community records',t:'After board approval'}
        ],
        self:[{s:'Adjourn and reschedule meeting per bylaws when quorum is not met',w:'Required when attendance does not reach quorum threshold'}],
        legal:[{s:'Attorney advises on executive session requirements',w:'Personnel, litigation, or contract matters'}],
        notes:{'_':'Most states require open meetings with limited executive session exceptions. Post minutes promptly.'}
      },
      { id:'elections', title:'Elections', desc:'Annual elections, candidate disputes, ballot challenges',
        tags:['Annual elections','Candidate disputes','Ballot challenges'],
        pre:[
          {s:'Send election notice with nomination procedures',t:'Per bylaws (30-60 days)',d:'Bylaws: Election section'},
          {s:'Accept nominations and prepare ballot',t:'Per timeline'},
          {s:'Appoint independent election inspector if required',t:'Before election'},
          {s:'Conduct election per governing docs',t:'At annual meeting'},
          {s:'Certify and announce results',t:'At meeting or within 3 days'}
        ],
        self:[{s:'Review procedures and preserve all ballots when election is challenged',detail:'Preserve all election materials.',w:'Required when an owner formally challenges election results'}],
        legal:[{s:'Attorney advises on election disputes or challenges',w:'Contested election or procedural challenge'}],
        notes:{'_':'Follow your bylaws election procedures exactly. Independent inspectors add credibility.'}
      },
      { id:'annual-meeting-planning', title:'Annual Meeting Planning', desc:'End-to-end planning for the annual owners meeting',
        tags:['Annual meeting','Owner meeting','Elections','Budget ratification','Proxy forms'],
        pre:[
          {s:'Set annual meeting date and reserve venue/virtual platform',t:'90 days before meeting',d:'DC Code § 29-1109.02',detail:'DC requires annual meeting within 13 months of prior. Confirm date does not conflict with holidays. Book venue with capacity for quorum attendance.'},
          {s:'Review bylaws for quorum requirements, notice periods, and election procedures',t:'90 days out',d:'Bylaws: Annual meeting section',detail:'DC typical quorum: 33-40% of units. Notice window: 10-60 days per DC Code § 29-1109.02(a). Identify number of board seats up for election.'},
          {s:'Open nominations for board seats; distribute Call for Candidates notice',t:'60-75 days out',d:'Bylaws: Election section',detail:'Use the Election — Call for Candidates letter template. Include: number of open seats, term length, eligibility requirements (owner in good standing), candidacy deadline, candidate statement guidelines.'},
          {s:'Finalize proposed budget for owner ratification; prepare annual financial report',t:'60 days out',d:'DC Code § 29-1135.02',detail:'Budget should be board-adopted before presenting to owners. Include: income projections, operating expenses, reserve contribution, assessment rate changes. Prepare year-end financial summary or audited statements.'},
          {s:'Prepare reserve fund status report for owner presentation',t:'45 days out',d:'DC Code § 42-1903.13',detail:'Include: current reserve balance, funding plan, percent funded, upcoming major expenditures. Reference most recent reserve study.'},
          {s:'Close nominations; verify candidate eligibility; prepare ballot',t:'45 days out',d:'Bylaws: Candidate eligibility',detail:'Verify each candidate is a unit owner in good standing (current on assessments). Prepare secret ballot per DC Code § 29-1135.09. Include candidate statements.'},
          {s:'Send formal Annual Meeting Notice to all owners with agenda, proxy forms, and candidate statements',t:'30-60 days out (per bylaws)',d:'DC Code § 29-1109.02(a)',detail:'Use the Annual Meeting Notice letter template. Must include: date, time, location, full agenda, proxy/ballot form, candidate statements. Send via method required by bylaws (mail, email, or both). Retain proof of delivery.'},
          {s:'Appoint independent election inspector or committee',t:'14-21 days out',d:'Best practice',detail:'Inspector should not be a candidate or current board member. Responsible for credential verification, ballot counting, and result certification.'},
          {s:'Prepare meeting materials: agenda packets, sign-in sheets, proxy collection, reserve report, budget summary',t:'7-14 days out',detail:'Print sufficient copies. Prepare presentation slides if applicable. Test virtual platform if hybrid meeting. Confirm AV equipment at venue.'},
          {s:'Collect and verify proxy forms received before meeting',t:'Before meeting',d:'DC Code § 29-1135.10',detail:'Verify each proxy is signed by a record owner. Confirm proxy holder is authorized. Count proxies toward quorum. Maintain all proxy forms for 1 year minimum.'},
          {s:'Conduct annual meeting: verify quorum, approve prior minutes, present financials, conduct election, ratify budget, owner Q&A',t:'Meeting day',d:'Bylaws & Roberts Rules',detail:'Suggested order: (1) Call to order, (2) Quorum verification, (3) Approve prior annual meeting minutes, (4) President\'s report, (5) Financial report & budget ratification, (6) Reserve fund update, (7) Board election, (8) Committee reports, (9) Old business, (10) New business & owner forum, (11) Adjournment.'},
          {s:'Certify election results; announce new board members',t:'At meeting or within 3 days',d:'Bylaws: Election certification',detail:'Inspector certifies results. Announce winners. Retain all ballots for 1 year per DC Code § 29-1135.13.'},
          {s:'Distribute meeting minutes to all owners; file updated officer information',t:'Within 14 days',d:'DC Code § 29-1108.06',detail:'Minutes should include: attendance/quorum count, election results, budget ratification vote, all motions and votes, owner comments. File any required officer/agent updates with DLCP.'}
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
          {s:'Attorney reviews budget ratification if assessment increase exceeds threshold requiring owner approval',w:'Assessment increase > 10-15% or per bylaws'}
        ],
        notes:{
          'DC':'DC Code § 29-1109.02: Annual meeting required within 13 months of prior. Notice: 10-60 days per § 29-1109.02(a). Quorum per bylaws (typically 33-40%). Secret ballot for elections per § 29-1135.09. Proxy voting per § 29-1135.10. Budget notice 30 days per § 29-1135.02. Retain ballots 1 year per § 29-1135.13. If 20%+ of owners petition and board fails to call meeting, owners may call it themselves per § 29-1108.01.',
          '_':'Annual meeting is the primary owner governance event. Includes board elections, budget ratification, financial reporting, and owner Q&A. Check bylaws for quorum, notice periods, and election procedures. Most states require annual meeting within 13 months of prior.'
        }
      },
      { id:'board-action-item', title:'Board Action Items', desc:'Action items from board meetings',
        tags:['Board meeting follow-ups','Action item tracking','Task assignments'],
        pre:[
          {s:'Document action item with specific deliverable',t:'During meeting'},
          {s:'Assign responsibility to board member or manager',t:'During meeting'},
          {s:'Set timeline and due date',t:'During meeting'},
          {s:'Execute task per assigned scope',t:'Per timeline'},
          {s:'Report completion status at next meeting',t:'Next board meeting'},
          {s:'Record completion in meeting minutes',t:'At meeting'}
        ],
        self:[{s:'Reassign task or adjust timeline at next meeting when assignee is unable to complete',w:'Required when the assigned person cannot meet the deadline'}],
        legal:[{s:'Attorney reviews if action item has legal implications',w:'Action involves contracts, disputes, or regulatory matters'}],
        notes:{'_':'Track all board action items with clear ownership and deadlines. Report status at each meeting.'}
      },
      { id:'policy-update', title:'Policy Updates', desc:'Updating association policies or documents',
        tags:['Policy revisions','Document updates','Rule changes'],
        pre:[
          {s:'Identify need for policy update and gather input',t:'1-2 weeks'},
          {s:'Draft updated policy language',t:'2-4 weeks'},
          {s:'Legal review of proposed changes',t:'1-2 weeks',d:'Attorney review'},
          {s:'Board discussion of draft at meeting',t:'Board meeting'},
          {s:'Provide owner notice period if required',t:'Per governing docs',d:'Bylaws: Notice requirements'},
          {s:'Board votes to adopt updated policy',t:'Board meeting',d:'Bylaws: Voting requirements'},
          {s:'Distribute updated documents to all owners',t:'Within 2 weeks of adoption'}
        ],
        self:[{s:'Provide written explanation citing authority when owner challenges policy',w:'Required when owner formally challenges the updated policy'}],
        legal:[{s:'Attorney reviews policy for legal compliance',w:'Policy affects owner rights or has enforcement implications'}],
        notes:{'_':'Policy changes may require owner notice periods. Check your bylaws for rule-making authority and procedures.'}
      },
      { id:'conflict-interest', title:'Conflict of Interest', desc:'Board member recusal, related-party vendors',
        tags:['Board member recusal','Related-party vendors'],
        pre:[
          {s:'Board member discloses potential conflict before discussion/vote',t:'Before vote'},
          {s:'Recused member leaves room for discussion and vote',t:'During meeting'},
          {s:'Document disclosure and recusal in meeting minutes',t:'During meeting'},
          {s:'Ensure remaining board has quorum',t:'Before voting'}
        ],
        self:[{s:'Board member raises undisclosed conflict of interest for the record',w:'Required when a conflict of interest has not been voluntarily disclosed'}],
        legal:[{s:'Attorney reviews conflict of interest policy',w:'Recurring conflicts or related-party transactions'}],
        notes:{'_':'Board members have a fiduciary duty to act in the best interest of the association, not personal gain.'}
      }
    ]
  },
  { id:'disputes', num:'6', icon:'🤝', label:'Owner Disputes', color:'sky',
    sits: [
      { id:'neighbor-conflicts', title:'Neighbor Conflicts', desc:'Noise, smoking, shared wall conflicts',
        tags:['Noise complaints','Smoking','Shared wall conflicts'],
        pre:[
          {s:'Receive and document complaint with specifics',t:'Upon receipt'},
          {s:'Review CC&Rs for applicable rules',t:'1-3 days',d:'CC&Rs/Rules'},
          {s:'Send notice to offending owner citing specific rule',t:'Within 1 week'},
          {s:'Offer mediation between parties for unresolved disputes',t:'2-4 weeks',w:'Required when initial notice does not resolve the conflict'},
          {s:'Escalate per enforcement policy for continuing violations',t:'Per bylaws',w:'Required when mediation does not resolve the dispute'}
        ],
        self:[{s:'Impose fines per hearing process when mediation fails',w:'Required when mediation does not produce resolution'}],
        legal:[{s:'Attorney sends cease-and-desist if nuisance continues',w:'Ongoing nuisance after multiple notices'}],
        notes:{'_':'Document all complaints and responses. Mediation is often more effective than enforcement for neighbor disputes.'}
      },
      { id:'damage-responsibility', title:'Damage Responsibility', desc:'Leak source disputes, insurance coordination',
        tags:['Leak source disputes','Insurance coordination'],
        pre:[
          {s:'Investigate source of damage (plumber, inspector)',t:'Immediately'},
          {s:'Determine responsibility per CC&Rs maintenance matrix',t:'After investigation',d:'CC&Rs'},
          {s:'Notify responsible party and insurance carriers',t:'Within days'},
          {s:'Coordinate repairs between HOA and unit owner',t:'As needed'}
        ],
        self:[{s:'Obtain independent expert opinion when responsibility is disputed',w:'Required when parties disagree on fault for the damage'}],
        legal:[{s:'Attorney resolves responsibility dispute and coordinates between carriers',w:'Disagreement on fault or insurance coverage'}],
        notes:{'_':'Most CC&Rs define common vs unit boundaries. Get professional assessment of damage source.'}
      }
    ]
  },
  { id:'operations', num:'7', icon:'🏊', label:'Community Ops', color:'teal',
    sits: [
      { id:'amenities', title:'Amenities Management', desc:'Pool closures, gym rules, clubhouse rentals',
        tags:['Pool closures','Gym rules','Clubhouse rentals'],
        pre:[
          {s:'Review current amenity rules and usage policies',t:'Annually'},
          {s:'Inspect facilities and document maintenance needs',t:'Monthly'},
          {s:'Update rules as needed through board resolution',t:'As needed'},
          {s:'Post rules prominently at each amenity',t:'Immediately after changes'},
          {s:'Enforce rules consistently',t:'Ongoing'}
        ],
        self:[{s:'Follow standard enforcement process for amenity rule violations',w:'Required when an amenity rule violation is documented'}],
        legal:[{s:'Attorney reviews liability waivers and rules for adequacy',w:'Annual review or after incident'}],
        notes:{'_':'Consistent enforcement is key. Ensure adequate insurance for amenity areas.'}
      },
      { id:'security', title:'Security Issues', desc:'Theft, access control, camera installations',
        tags:['Theft','Access control','Camera installations'],
        pre:[
          {s:'Document security incident with details and timeline',t:'Immediately'},
          {s:'Report to police if criminal activity involved',t:'Immediately'},
          {s:'Review and update access control measures',t:'After incident'},
          {s:'Notify affected owners',t:'Promptly'},
          {s:'Board reviews security improvements',t:'Next meeting'}
        ],
        self:[{s:'Review local privacy and recording laws before installing cameras',w:'Required before any security camera installation in common areas'}],
        legal:[{s:'Attorney advises on security camera privacy requirements',w:'Camera installation in common areas'}],
        notes:{'_':'Balance security needs with privacy. Check local wiretapping and recording consent laws.'}
      }
    ]
  },
  { id:'strategic', num:'8', icon:'📐', label:'Strategic Decisions', color:'indigo',
    sits: [
      { id:'capital-projects', title:'Major Capital Projects', desc:'Window, siding replacement, elevator modernization',
        tags:['Window replacement','Siding','Elevator modernization','Capital improvement'],
        pre:[
          {s:'Commission engineering study or professional assessment to define scope, urgency, and whether the project can be phased',t:'6-12 months before project',detail:'Engage a licensed engineer or specialist. Report should include: scope, urgency rating (can it wait 1-2 years?), estimated cost range, recommended timeline, and whether the work can be broken into phases (e.g., elevator #1 this year, #2 next year; east facade this year, west next year). Phasing is the #1 way to reduce per-unit financial impact.'},
          {s:'FUNDING DECISION: Determine how to pay for this project using the Spending Decisions tab',t:'After assessment',d:'Fiscal Lens: Spending Decisions',detail:'Open Fiscal Lens → Spending Decisions → create a new spending request with the estimated cost. The system will show you: (1) Can operating budget cover it? (2) Can reserves cover it without dropping below safe levels? (3) What would a special assessment cost per unit? (4) Should you consider HOA financing? This analysis is critical — make the funding decision BEFORE soliciting bids.',w:'Do NOT start bidding before you know how you will pay for this.',action:{type:'inline',target:'funding-analysis',label:'Analyze Funding Options'}},
          {s:'Board approves project from reserves for designated reserve items with sufficient funding',t:'Board meeting',d:'Reserve study & Bylaws',detail:'When the project matches a component in your reserve study AND reserves can cover it while staying above 30% funded, the board can approve without owner vote. This is the simplest path — no special assessment, no owner impact. Check bylaws to confirm.',w:'Applies when the item is in the reserve study and reserve balance is sufficient'},
          {s:'Evaluate alternative funding options in order of owner impact when reserves are insufficient',t:'2-4 weeks',d:'Bylaws & DC Code § 29-1135.03',detail:'Option 1: PHASE THE PROJECT — do the most urgent portion from reserves now, budget for the rest over 1-2 years. Option 2: INCREASE RESERVE CONTRIBUTION — raise monthly assessments to build up reserves, defer project 12-18 months. Option 3: HOA LOAN — borrow against future assessments, spread cost over 3-10 years (adds ~$5-15/unit/month per $50K borrowed). Option 4: SPECIAL ASSESSMENT — one-time charge to owners (highest impact). Option 5: COMBINATION — partial reserves + smaller special assessment + increased future contribution.',w:'Required when reserves cannot fully cover the project cost'},
          {s:'Calculate per-unit special assessment impact and design payment options',t:'With funding decision',detail:'Per-unit allocation must follow the percentage interest in the Declaration (NOT equal split). For assessments over $1,000/unit, always offer an installment plan (3-12 months). For assessments over $5,000/unit, consider 12-24 month payment plans and a hardship provision. Present owners with the total cost, per-unit share, and at least 2 payment options.',w:'Required when funding analysis determines a special assessment is needed'},
          {s:'Send owner notice with project scope, cost, funding options, and per-unit impact',t:'30-60 days before vote',d:'Bylaws: Notice & DC Code § 29-1135.03',detail:'Notice must clearly explain: (1) What work is needed and why, (2) What happens if we delay, (3) Total cost and per-unit cost, (4) How it will be paid for, (5) Payment options available to owners, (6) Meeting date for vote. Present in plain language — not accounting jargon.',w:'Required when project cost exceeds board spending authority per bylaws — DC Code § 29-1135.03'},
          {s:'Develop detailed project scope, specifications, and timeline for bidding',t:'3-6 months out',detail:'Scope should be detailed enough for apples-to-apples bidding. Include performance standards, warranty requirements, and completion timeline. If phasing, clearly define Phase 1 scope.'},
          {s:'Obtain minimum 3 competitive bids from qualified, licensed, and insured contractors',t:'2-3 months out',detail:'Verify: state/local contractor license, general liability insurance ($1M+), workers comp, bonding capacity. Check references on similar projects. Require bids on identical scope.'},
          {s:'Board evaluates bids on qualifications, references, price, and timeline — not lowest price alone',t:'Board meeting',d:'Fiduciary duty of care',detail:'Document evaluation criteria and rationale. Lowest bid is not always best — consider experience, warranty, financial stability, and how they handle change orders. Record decision in minutes.'},
          {s:'Hold owner vote if required; present funding plan with per-unit impact and payment options',t:'At meeting per notice',d:'Bylaws & DC Code § 29-1135.03',detail:'If special assessment needed: typically requires 2/3 owner approval in DC. Present: total cost, per-unit share, payment schedule options, what happens if project is deferred. If using reserves for designated purpose per reserve study: board may approve. Document vote results.'},
          {s:'Execute contract with performance bond and payment/retention schedule',t:'After all approvals',d:'Best practice for projects > $50K',detail:'Contract should include: detailed scope, fixed price or GMP, payment schedule tied to milestones (not time), 10% retention until final completion, performance bond (100% of contract value for large projects), warranty terms, insurance requirements, indemnification.'},
          {s:'Create Work Order in Fiscal Lens and submit Spending Decision request if not already done',t:'Before work begins',d:'Fiscal Lens: Work Orders & Spending Decisions',detail:'Create the WO to track the financial lifecycle: draft → approved → invoiced → paid. This creates the GL entries automatically and gives you a paper trail of the entire project cost.',action:{type:'modal',target:'create-wo',label:'Create Work Order'}},
          {s:'Monitor construction; track budget vs actual; flag change orders before approving',t:'Weekly during project',detail:'Require written change orders approved by board before extra work. If change orders push total cost above the original approved amount, you may need additional owner approval per bylaws. Track cumulative change order percentage (flag at 10% of contract).'},
          {s:'Final inspection, punch list, retention release, and reserve study update',t:'At substantial completion',detail:'Walk the project with contractor and independent inspector. Do not release retention until all punch list items resolved. After completion: update the reserve study to reflect the new component and its useful life — this resets the replacement timeline and affects future reserve contributions.'}
        ],
        self:[
          {s:'Review contract remedies, engage bonding company, and file insurance claim for contractor default',w:'Required when contractor fails to perform or abandons the project'},
          {s:'Document reasons for budget overrun, evaluate change orders, and determine if additional owner approval is needed',w:'Required when cumulative costs exceed the approved project budget'},
          {s:'Post-project: update reserve study to reflect completed improvement and adjusted useful life — this is critical for accurate future planning'}
        ],
        legal:[
          {s:'Attorney reviews contract and bonding for major projects',w:'Projects exceeding $50K or per bylaws threshold'},
          {s:'Attorney advises on owner vote requirements before project commitment',w:'Project cost exceeds board spending authority per bylaws'},
          {s:'Attorney reviews change orders with significant cost impact',w:'Change orders exceed 10% of contract value'},
          {s:'Attorney advises on special assessment structuring and payment plan terms',w:'Special assessment over $5K/unit or installment plan over 12 months'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.03: Expenditures above bylaw thresholds require 2/3 owner vote. Special assessments almost certainly require owner vote. PLANNING AHEAD: Boards that maintain reserves above 70% funded rarely need special assessments. Use the Fiscal Lens Reserves tab and annual budget process to incrementally build reserves toward known capital needs. When a project was not well-planned: (1) phase the work, (2) combine partial reserve draw + small assessment, (3) consider HOA financing to spread cost. Check bylaws for board spending authority limits.',
          '_':'FINANCIAL DECISION FRAMEWORK: (1) Can reserves cover it? Best option — no owner impact. (2) Can you phase it? Second best — spreads cost over years. (3) Can you finance it? Adds modest monthly cost. (4) Special assessment needed? Structure with payment plans. Always calculate per-unit impact before presenting to owners. Boards that plan ahead with adequate reserve contributions avoid emergency special assessments.'
        }
      },
      { id:'developer-transition', title:'Developer Transition', desc:'Turnover audits, construction defect claims',
        tags:['Turnover audits','Construction defect claims'],
        pre:[
          {s:'Engage transition attorney before or at turnover',t:'Before turnover'},
          {s:'Commission independent engineering inspection',t:'At turnover'},
          {s:'Audit financial records and reserve funding',t:'At turnover'},
          {s:'Identify construction defects within warranty period',t:'Within statute period'},
          {s:'Pursue warranty claims and defect remediation',t:'After inspection'}
        ],
        self:[{s:'Document all defects with photos and expert reports'}],
        legal:[{s:'Transition attorney manages entire turnover process',w:'Every developer turnover'},{s:'Attorney pursues construction defect claims',w:'Defects identified'}],
        notes:{'_':'Developer turnovers are critical moments. Engage an experienced transition attorney early.'}
      }
    ]
  },
  { id:'crisis', num:'9', icon:'🚨', label:'Crisis', color:'red',
    sits: [
      { id:'structural-safety', title:'Structural Safety Issues', desc:'Balcony collapses, foundation shifts, unsafe conditions',
        tags:['Balcony collapses','Foundation shifts','Unsafe conditions'],
        pre:[
          {s:'Evacuate affected areas and ensure resident safety',t:'Immediately'},
          {s:'Engage structural engineer for emergency assessment',t:'Within hours'},
          {s:'Notify local building department',t:'Immediately',d:'Building code'},
          {s:'Implement engineer recommendations (shoring, closures)',t:'Immediately'},
          {s:'Notify insurance carrier',t:'Within 24 hours'},
          {s:'Commission full structural investigation',t:'Within 1 week'}
        ],
        self:[{s:'Document everything and maintain restricted access until cleared'}],
        legal:[{s:'Attorney advises on liability and disclosure requirements',w:'Any structural safety concern'},{s:'Attorney pursues claims against responsible parties',w:'Construction defect or negligence'}],
        notes:{'_':'Structural safety is paramount. Always err on the side of caution. Evacuate first, investigate second.'}
      },
      { id:'public-health', title:'Public Health', desc:'Mold, water contamination, pandemic policies',
        tags:['Mold','Water contamination','Pandemic policies'],
        pre:[
          {s:'Assess scope: how many units/areas affected?',t:'Immediately'},
          {s:'Engage appropriate professionals (mold remediation, water testing)',t:'Within 24-48 hours'},
          {s:'Notify affected residents with clear information',t:'Promptly'},
          {s:'Implement remediation per professional recommendations',t:'Per timeline'},
          {s:'Provide clearance testing results to affected parties',t:'After remediation'}
        ],
        self:[{s:'Cooperate fully with health department and document all compliance actions',w:'Required when health department is involved in the investigation or remediation'}],
        legal:[{s:'Attorney advises on disclosure and remediation obligations',w:'Mold, contamination, or health hazard'}],
        notes:{'_':'Public health issues require prompt, transparent communication. Engage qualified professionals immediately.'}
      }
    ]
  },
  { id:'admin', num:'10', icon:'📁', label:'Administrative', color:'slate',
    sits: [
      { id:'compliance-filing', title:'Compliance Filings', desc:'Regulatory filings and compliance deadlines',
        tags:['Regulatory filings','Annual reports','Government submissions'],
        pre:[
          {s:'Identify filing requirement and deadline',t:'As needed',d:'DC Code § 29-102.11',detail:'DC condos must file a Biennial Report with DCRA (now DLCP). Also check for sales tax, personal property tax, and business license renewals.'},
          {s:'Gather required documentation: financial statements, officer/agent updates, registered agent confirmation',t:'2-4 weeks before deadline',detail:'If incorporated, ensure registered agent is current with DC Department of Licensing and Consumer Protection (DLCP).'},
          {s:'Complete forms and prepare submission via online portal',t:'1-2 weeks before deadline',d:'DLCP / MyTax.DC.gov',detail:'DC Biennial Report filed online at DLCP. Tax filings via MyTax.DC.gov. Keep login credentials secure with Treasurer.'},
          {s:'Board review and sign-off if required',t:'Board meeting',d:'Bylaws: Officer duties'},
          {s:'Submit filing to appropriate agency and pay any required fees',t:'Before deadline',detail:'DC Biennial Report fee varies. Late filing can result in administrative dissolution of the entity.'},
          {s:'Confirm receipt and save confirmation number/receipt',t:'Within days of submission'},
          {s:'File copy of submission and confirmation in association records',t:'Immediately',d:'Document retention policy'}
        ],
        self:[{s:'Review deficiencies and resubmit promptly for rejected filings',w:'Required when the agency rejects or returns the submission'},{s:'Set calendar reminders 60 and 30 days before each filing deadline'}],
        legal:[{s:'Attorney assists with complex filings or disputed requirements',w:'Filing involves legal interpretation or dispute'},{s:'Attorney handles reinstatement if entity dissolved for non-filing',w:'Missed deadline resulted in administrative dissolution'}],
        notes:{
          'DC':'DC condos organized as nonprofits must file a Biennial Report with DLCP (formerly DCRA) per DC Code § 29-102.11. Late filing can lead to administrative dissolution per § 29-106.02. Reinstatement requires filing + penalty. Also: Form FR-16 (franchise tax exemption may apply), UCC filings for liens via DC Recorder of Deeds.',
          '_':'Maintain a calendar of all regulatory filing deadlines. Many jurisdictions impose penalties for late filings.'
        }
      },
      { id:'record-requests', title:'Record Requests', desc:'Owner inspection requests, financial transparency',
        tags:['Owner inspection requests','Financial transparency disputes'],
        pre:[
          {s:'Receive written request and log date received',t:'Upon receipt',d:'DC Code § 42-1903.14',detail:'DC owners have statutory right to inspect association records. Log the exact date — this starts the response clock.'},
          {s:'Acknowledge receipt to the requesting owner within 3 business days',t:'3 business days',detail:'Written acknowledgment (email is sufficient). Confirm scope of request and expected timeframe.'},
          {s:'Identify requested records and determine if any exemptions apply',t:'3-5 days',d:'DC Code § 42-1903.14(b)',detail:'Exemptions are narrow: attorney-client privilege, individual owner payment records (of other owners), personnel records. When in doubt, disclose.'},
          {s:'Arrange inspection at reasonable time and place, or prepare copies',t:'Within 5 business days of request',d:'DC Code § 42-1903.14',detail:'DC requires records be available within 5 business days. May charge reasonable copying costs (per page). Electronic delivery preferred for efficiency.'},
          {s:'Provide records and document what was delivered',t:'Within 5 business days',detail:'Retain a log entry: date, owner, records requested, records provided, any items withheld with reason.'},
          {s:'Provide written explanation citing specific statutory exemption for any withheld records',t:'With response',d:'DC Code § 42-1903.14(b)',detail:'Must cite the specific exemption relied upon. Vague denials are not legally defensible.',w:'Required when any requested records are withheld — exemptions are narrow per DC Code'}
        ],
        self:[{s:'Review statute and provide additional explanation when owner disputes records denial',detail:'Consider consulting attorney before refusing. DC courts award attorney fees to prevailing owner.',w:'Required when owner challenges a records access denial'},{s:'Document what was provided and when — maintain inspection log'}],
        legal:[{s:'Attorney advises on privileged documents and access rights',w:'Sensitive records or dispute'},{s:'Attorney defends records access lawsuit — DC allows court petition with attorney fees',w:'Owner files suit per DC Code § 42-1903.14(c)'}],
        notes:{
          'DC':'DC Code § 42-1903.14: Owners may inspect and copy association records within 5 business days of written request. Association may charge reasonable copying fees. Exemptions limited to attorney-client privilege. If association fails to comply, owner may petition court — prevailing owner recovers attorney fees. Broad scope: financials, minutes, contracts, insurance, correspondence.',
          '_':'Most states grant broad access with specific response timelines. Exemptions limited to attorney-client privilege. Document everything provided.'
        }
      },
      { id:'resale-certs', title:'Resale Certificates', desc:'Preparing disclosure documents for unit sales',
        tags:['Preparing disclosure documents','Resale package','Estoppel certificate'],
        pre:[
          {s:'Receive written request from selling owner or their agent; log date received',t:'Upon request',d:'DC Code § 42-1904.11',detail:'Starts the 10 business day clock. Request should specify unit number and settlement date.'},
          {s:'Verify unit account status: current assessments, outstanding balances, late fees, special assessments',t:'1-2 business days',d:'DC Code § 42-1903.13',detail:'Pull unit ledger from Fiscal Lens. Confirm no pending disputes or credits.'},
          {s:'Compile required financial documents: current budget, most recent audited/reviewed financial statement, reserve study summary',t:'2-3 business days',d:'DC Code § 42-1904.04(a)',detail:'Budget must be the currently adopted version. Financial statement per § 42-1903.18. Include reserve funding plan.'},
          {s:'Compile governing documents: Bylaws, CC&Rs/Declaration, Rules & Regulations, Articles of Incorporation',t:'1-2 business days',d:'Bylaws & DC Code § 42-1904.04',detail:'Include all amendments. Verify versions are current per Legal & Bylaws tab.'},
          {s:'Compile compliance documents: insurance certificate (master policy), pending litigation disclosure, planned capital improvements',t:'2-3 business days',d:'DC Code § 42-1904.04(a)',detail:'Insurance cert must name coverage amounts. Litigation disclosure includes all pending or threatened actions.'},
          {s:'Disclose any special assessments (current or planned), right of first refusal, and transfer/move-in fees',t:'With certificate',d:'DC Code § 42-1904.04(a)(9)',detail:'Include board resolutions for any approved special assessments not yet billed.'},
          {s:'Prepare the resale certificate cover letter with unit-specific financial summary',t:'1-2 business days',detail:'Use the Resale / Estoppel Certificate letter template. Include: monthly assessment amount, outstanding balance, prepaid credits, next due date.'},
          {s:'Board officer or property manager reviews and signs the certificate',t:'1 business day',d:'Bylaws: Officer duties',detail:'Authorized signatory per bylaws. Certificate must be signed and dated.'},
          {s:'Issue completed resale package to requestor; charge permitted processing fee',t:'Within 10 business days of request',d:'DC Code § 42-1904.11',detail:'DC statutory deadline: 10 business days. Fee must not exceed statutory maximum. Send via method requested (email/mail). Retain proof of delivery.'},
          {s:'File a copy of the issued certificate and all enclosed documents in association records',t:'Immediately after issuance',d:'Document retention policy',detail:'Retain for minimum 7 years. Note: certificate is valid for 30 days from date of issuance.'}
        ],
        self:[
          {s:'Provide supporting documentation (ledger history, board resolutions) when certificate info is disputed',detail:'Respond within 5 business days to avoid delaying settlement.',w:'Required when buyer or seller disputes information in the certificate'},
          {s:'Prioritize late or urgent requests and apply expedited fee per governing docs',w:'Applies when settlement date is imminent and standard timeline is insufficient'},
          {s:'Maintain a checklist template of all required documents to ensure completeness each time'},
          {s:'Track all issued certificates in a log: unit, request date, issue date, fee charged, recipient'}
        ],
        legal:[
          {s:'Attorney reviews resale certificate template annually for statutory compliance',w:'Annual or after DC Code changes'},
          {s:'Attorney advises on scope of litigation disclosure',w:'Active or threatened litigation involving the association'},
          {s:'Attorney reviews any buyer rescission claims',w:'Buyer alleges incomplete or inaccurate disclosure per § 42-1904.09'}
        ],
        notes:{
          'DC':'DC Code § 42-1904.11: Must deliver within 10 business days. Package must include all items per § 42-1904.04(a): budget, financial statements, reserve study, bylaws, CC&Rs, rules, insurance, pending litigation, special assessments, transfer fees. Buyer has 3-day rescission right after receipt per § 42-1904.09. Fee limits set by statute — check current maximums.',
          '_':'Most states require a resale package/certificate for condo sales. Key items: financial statements, governing documents, insurance, litigation disclosure, unit account status. Check your jurisdiction for required contents, response deadline, fee limits, and buyer rescission rights.'
        }
      },
      { id:'move-disputes', title:'Move-In/Move-Out Disputes', desc:'Deposit disputes, damage claims',
        tags:['Deposit disputes','Damage claims'],
        pre:[
          {s:'Conduct pre-move inspection of common areas; photograph existing conditions',t:'Before move date',d:'Rules: Move policy',detail:'Use a dated checklist. Document hallways, elevators, lobby, and any areas the mover will traverse.'},
          {s:'Collect move-in/move-out deposit per governing documents',t:'Before move date',d:'Bylaws & Rules',detail:'Deposit amount must be authorized by governing docs. Issue a receipt.'},
          {s:'Coordinate move logistics: elevator reservation, loading dock, hours',t:'Before move date',d:'Rules & Regulations'},
          {s:'Conduct post-move inspection; document any damage with dated photos',t:'Within 24 hours',detail:'Compare to pre-move photos. Note any damage to walls, floors, doors, elevator pads.'},
          {s:'Refund deposit with written inspection clearance when no damage is found',t:'Within 30 days',detail:'Written confirmation of inspection clearance. Refund via original payment method.'},
          {s:'Send itemized deduction notice with photos, repair estimates, and remaining balance for any damage',t:'Within 30 days',d:'Rules & Regulations',detail:'Itemize each deduction with cost. Provide repair invoices or contractor estimates. Refund any remaining balance.',w:'Required when post-move inspection identifies damage to common areas'}
        ],
        self:[{s:'Provide pre/post photos, invoices, and repair documentation when owner disputes deductions',w:'Required when owner formally disputes deposit deductions'},{s:'Send written demand for balance citing governing docs when damage exceeds deposit',w:'Required when repair costs exceed the collected deposit amount'}],
        legal:[{s:'Attorney advises on deposit retention procedures and demand collection',w:'Dispute over deductions or amount exceeds deposit significantly'}],
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

// ─── Seed data ─────────────────────────────────────────────
function hydrateSteps(c: CaseTrackerCase): CaseTrackerCase {
  const cat = CATS.find(x => x.id === c.catId);
  const sit = cat?.sits.find(x => x.id === c.sitId);
  if (!sit) return c;
  const src = c.approach === 'legal' ? sit.legal : c.approach === 'self' ? sit.self : sit.pre;
  c.steps = src.map((s, i) => ({
    ...s, id: 's' + i,
    done: c.status === 'closed' ? true : i < 2,
    doneDate: c.status === 'closed' ? c.created : i < 2 ? '2026-02-10' : null,
    userNotes: ''
  }));
  return c;
}

const seedCases: CaseTrackerCase[] = [
  hydrateSteps({
    id: 'c1', catId: 'enforcement', sitId: 'covenant-violations',
    title: 'Unit 502 — Unauthorized Balcony Enclosure', unit: '502', owner: 'Lisa Chen',
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
interface IssuesState {
  issues: Issue[];
  cases: CaseTrackerCase[];
  nextCaseNum: number;
  nextIssueNum: number;
  nextCommNum: number;

  // DB sync
  loadFromDb: (tenantId: string) => Promise<void>;

  // Issue actions
  addIssue: (issue: Omit<Issue, 'id' | 'upvotes' | 'viewCount' | 'comments' | 'reviewNotes' | 'comms'>, tenantId?: string) => void;
  upvoteIssue: (issueId: string, userId: string, userName: string, unitNumber: string) => void;
  updateIssueStatus: (issueId: string, status: Issue['status']) => void;
  addIssueComment: (issueId: string, author: string, text: string) => void;
  addIssueComm: (issueId: string, comm: Omit<CaseComm, 'id'>) => void;

  // Case actions
  createCase: (data: { catId: string; sitId: string; approach: CaseApproach; title: string; unit: string; owner: string; priority: CasePriority; notes: string; assignedTo?: string; assignedRole?: string; dueDate?: string; source?: string; sourceId?: string }, tenantId?: string) => string;
  toggleStep: (caseId: string, stepIdx: number) => void;
  addStepNote: (caseId: string, stepIdx: number, note: string) => void;
  closeCase: (caseId: string) => void;
  reopenCase: (caseId: string) => void;
  deleteCase: (caseId: string) => void;
  updateCaseAssignment: (caseId: string, updates: { assignedTo?: string; assignedRole?: string; dueDate?: string }) => void;

  // Approach
  addApproach: (caseId: string, approach: CaseApproach) => void;
  toggleAdditionalStep: (caseId: string, approachIdx: number, stepIdx: number) => void;
  addAdditionalStepNote: (caseId: string, approachIdx: number, stepIdx: number, note: string) => void;

  // Board vote
  saveBoardVote: (caseId: string, motion: string, date: string, votes: BoardVote['votes']) => void;
  clearBoardVote: (caseId: string) => void;

  // Docs & Comms
  addDocument: (caseId: string, doc: CaseAttachment) => void;
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
}

export const useIssuesStore = create<IssuesState>()(persist((set, get) => ({
  issues: seedIssues,
  cases: seedCases,
  nextCaseNum: 8,
  nextIssueNum: 3,
  nextCommNum: 6,

  loadFromDb: async (tenantId: string) => {
    const [issues, cases] = await Promise.all([
      issuesSvc.fetchIssues(tenantId),
      casesSvc.fetchCases(tenantId),
    ]);
    const updates: Record<string, unknown> = {};
    if (issues) updates.issues = issues;
    if (cases) updates.cases = cases;
    if (Object.keys(updates).length > 0) set(updates);
  },

  addIssue: (issue, tenantId?) => {
    const localId = `iss-${get().nextIssueNum}`;
    set(s => ({
      issues: [{ ...issue, id: localId, upvotes: [], viewCount: 0, comments: [], reviewNotes: [], comms: [] }, ...s.issues],
      nextIssueNum: s.nextIssueNum + 1
    }));
    if (isBackendEnabled && tenantId) {
      issuesSvc.createIssue(tenantId, issue, localId).then(dbId => {
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
      else issuesSvc.addIssueUpvote('', issueId, userId, userName, unitNumber);
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
    if (isBackendEnabled) issuesSvc.addIssueComment('', issueId, localId, author, text, date);
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
    const id = `c${s.nextCaseNum}`;
    const cat = CATS.find(x => x.id === data.catId);
    const sit = cat?.sits.find(x => x.id === data.sitId);
    if (!sit) return id;
    const src = data.approach === 'legal' ? sit.legal : data.approach === 'self' ? sit.self : sit.pre;
    const steps: CaseStep[] = src.map((st, i) => ({
      ...st, id: 's' + i, done: false, doneDate: null, userNotes: ''
    }));
    const newCase: CaseTrackerCase = {
      id, catId: data.catId, sitId: data.sitId, approach: data.approach, title: data.title,
      unit: data.unit, owner: data.owner, priority: data.priority, notes: data.notes,
      status: 'open', created: new Date().toISOString().split('T')[0],
      steps, linkedWOs: [], linkedLetterIds: [], linkedInvoiceIds: [], linkedMeetingIds: [], attachments: [], boardVotes: null, additionalApproaches: [], comms: [],
      ...(data.assignedTo && { assignedTo: data.assignedTo }),
      ...(data.assignedRole && { assignedRole: data.assignedRole }),
      ...(data.dueDate && { dueDate: data.dueDate }),
      ...(data.source && { source: data.source }),
      ...(data.sourceId && { sourceId: data.sourceId }),
    };
    set({ cases: [newCase, ...s.cases], nextCaseNum: s.nextCaseNum + 1 });
    if (isBackendEnabled && tenantId) {
      casesSvc.createCase(tenantId, newCase).then(dbId => {
        if (dbId) set(s => ({ cases: s.cases.map(c => c.id === id ? { ...c, id: dbId } : c) }));
      });
    }
    return id;
  },

  toggleStep: (caseId, stepIdx) => {
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        steps[stepIdx] = {
          ...steps[stepIdx],
          done: !steps[stepIdx].done,
          doneDate: !steps[stepIdx].done ? new Date().toISOString().split('T')[0] : null
        };
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
    set(s => ({
      cases: s.cases.map(c => {
        if (c.id !== caseId || !c.steps) return c;
        const steps = [...c.steps];
        steps[stepIdx] = { ...steps[stepIdx], userNotes: note };
        return { ...c, steps };
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

  updateCaseAssignment: (caseId, updates) => {
    set(s => ({
      cases: s.cases.map(c => c.id === caseId ? { ...c, ...updates } : c)
    }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, updates);
  },

  addApproach: (caseId, approach) => set(s => ({
    cases: s.cases.map(c => {
      if (c.id !== caseId) return c;
      const cat = CATS.find(x => x.id === c.catId);
      const sit = cat?.sits.find(x => x.id === c.sitId);
      if (!sit) return c;
      const src = approach === 'legal' ? sit.legal : approach === 'self' ? sit.self : sit.pre;
      const newApproach = {
        approach,
        addedDate: new Date().toISOString().split('T')[0],
        steps: src.map((st, i) => ({ ...st, id: `a${approach[0]}${i}`, done: false, doneDate: null, userNotes: '' }))
      };
      return { ...c, additionalApproaches: [...(c.additionalApproaches || []), newApproach] };
    })
  })),

  toggleAdditionalStep: (caseId, approachIdx, stepIdx) => set(s => ({
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
  })),

  addAdditionalStepNote: (caseId, approachIdx, stepIdx, note) => set(s => ({
    cases: s.cases.map(c => {
      if (c.id !== caseId || !c.additionalApproaches?.[approachIdx]) return c;
      const aa = [...c.additionalApproaches];
      const steps = [...aa[approachIdx].steps];
      steps[stepIdx] = { ...steps[stepIdx], userNotes: note };
      aa[approachIdx] = { ...aa[approachIdx], steps };
      return { ...c, additionalApproaches: aa };
    })
  })),

  saveBoardVote: (caseId, motion, date, votes) => {
    const boardVotes = { motion, date, votes };
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, boardVotes } : c) }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { boardVotes });
  },

  clearBoardVote: (caseId) => {
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, boardVotes: null } : c) }));
    if (isBackendEnabled) casesSvc.updateCase(caseId, { boardVotes: null });
  },

  addDocument: (caseId, doc) => set(s => ({
    cases: s.cases.map(c => c.id === caseId ? { ...c, attachments: [...c.attachments, doc] } : c)
  })),

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
    return {
      cases: s.cases.map(c => c.id === caseId ? { ...c, comms: [...c.comms, { ...comm, id }] } : c),
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
    set(s => ({ cases: s.cases.map(c => c.id === caseId ? { ...c, linkedWOs: [...c.linkedWOs, woId] } : c) }));
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
  }
}), {
  name: 'onetwo-issues',
  merge: (persisted: any, current: any) => {
    const merged = { ...current, ...(persisted || {}) };
    // Ensure existing localStorage cases get default empty arrays for new fields
    if (merged.cases) {
      merged.cases = merged.cases.map((c: any) => ({
        ...c,
        linkedLetterIds: c.linkedLetterIds || [],
        linkedInvoiceIds: c.linkedInvoiceIds || [],
        linkedMeetingIds: c.linkedMeetingIds || [],
      }));
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
