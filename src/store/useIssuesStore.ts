import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as issuesSvc from '@/lib/services/issues';
import * as casesSvc from '@/lib/services/cases';
import type { Issue, CaseTrackerCase, CaseStep, CaseComm, CaseAttachment, BoardVote, CaseApproach, CasePriority, AdditionalApproach } from '@/types/issues';

// ─── Situation Templates ───────────────────────────────────
export interface SituationStep {
  s: string; t?: string; d?: string | null; detail?: string | null; w?: string;
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
          {s:'Review current year financials: actual vs budget variance, reserve balances, outstanding receivables',t:'90 days before fiscal year-end',d:'Fiscal Lens: Dashboard & Reports',detail:'Identify line items over/under budget. Review collection rate. Assess reserve funding percentage against reserve study recommendations.'},
          {s:'Review reserve study for upcoming capital needs and required annual contribution',t:'60-90 days out',d:'Reserve study',detail:'Adjust reserve contribution if funding is below recommended level. Factor in any capital projects planned for next year. Document rationale for reserve funding level chosen.'},
          {s:'Obtain bids, contract renewals, and cost estimates for all operating expenses',t:'60-90 days out',d:'Vendor contracts',detail:'Review each vendor contract for renewal terms and rate changes. Obtain competitive bids for expiring contracts. Factor in inflation estimates for utilities, insurance, and maintenance.'},
          {s:'Draft proposed budget with line-item detail and calculate required assessment rate',t:'60 days out',detail:'Include: all operating expenses by category, reserve contribution, contingency (3-5% recommended), debt service if applicable. Calculate per-unit assessment to cover total budget.'},
          {s:'Determine if assessment increase triggers owner vote per bylaws or statute',t:'With budget draft',d:'Bylaws & DC Code § 29-1135.02',detail:'Check bylaws for assessment increase cap (commonly 10-15% without owner vote). If increase exceeds cap, owner vote or ratification is required. Some bylaws require owner ratification of every budget at the annual meeting.'},
          {s:'Present proposed budget at open board meeting; allow owner questions and input',t:'30 days before adoption',d:'DC Code § 29-1135.02',detail:'DC requires 30-day notice before budget adoption. Present budget in clear, non-technical language. Explain reasons for any assessment increase. Allow written questions from owners who cannot attend.'},
          {s:'Distribute formal budget package and assessment notice to all owners',t:'30 days before effective',d:'DC Code § 29-1135.02 & Bylaws',detail:'Package should include: proposed budget, prior year comparison, reserve study summary, assessment amount and effective date, explanation of changes. Send via method required by bylaws.'},
          {s:'Board votes to adopt budget; if owner vote required, conduct at annual meeting',t:'Before fiscal year start',d:'Bylaws: Voting & DC Code § 29-1135.02',detail:'Record vote in minutes with full budget attached. If owner ratification required, present at annual meeting for vote. Document approval or any modifications requested by owners.'}
        ],
        self:[
          {s:'If owner disputes assessment increase: provide written response with budget justification, reserve study data, and bylaw authority',detail:'Cite specific bylaw provisions authorizing assessments. Include cost comparison data.'},
          {s:'If budget not adopted before fiscal year: operate under prior year budget until new budget is approved per bylaws'},
          {s:'File any required annual financial reports or disclosures',detail:'DC may require annual financial disclosure to owners per § 29-1135.05.'}
        ],
        legal:[
          {s:'Consult attorney if assessment increase exceeds bylaws threshold requiring owner vote',w:'Increase > 10-15% or per bylaws cap'},
          {s:'Legal review of budget adoption process if challenged by owners',w:'Owner files formal challenge or threatens suit'},
          {s:'Attorney advises on fiduciary duty if board knowingly underfunds reserves',w:'Reserve funding below 50% of recommended level'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.02: 30-day notice before budget adoption. Check bylaws for assessment increase caps requiring owner vote (commonly 10-15%). § 29-1135.05: Annual financial disclosure to owners required. Board has fiduciary duty to fund reserves per reserve study — chronic underfunding may constitute breach of duty of care.',
          'CA':'Civil Code § 5300 requires annual budget report including reserve funding.',
          '_':'Review your bylaws for assessment increase caps that trigger owner vote (typically 10-25%). Budget should be transparent, justified, and adequately fund reserves per the reserve study. Underfunding reserves creates future special assessment risk and potential fiduciary liability.'
        }
      },
      { id:'special-assessments', title:'Special Assessments', desc:'Roof replacement, structural repairs, emergency storm damage',
        tags:['Roof replacement','Structural repairs','Emergency storm damage','Special assessment'],
        pre:[
          {s:'Identify capital need and obtain 2-3 professional cost estimates',t:'Immediately upon identifying need',d:'Reserve study',detail:'Document why the expense is necessary, why reserves are insufficient, and what alternatives were considered (phased approach, financing, deferred scope).'},
          {s:'Review reserve study: is this item in the plan? Are reserves sufficient?',t:'1-3 days',d:'Fiscal Lens: Reserves tab',detail:'If the item is in the reserve study but underfunded, explain the shortfall. If not in the study, explain why it was unforeseen. This transparency is critical for owner buy-in.'},
          {s:'Review bylaws and DC Code for special assessment authority, voting thresholds, and notice requirements',t:'1-2 weeks',d:'Bylaws & DC Code § 29-1135.03',detail:'DC typically requires 2/3 (66.7%) owner approval for special assessments. Check bylaws — some set a dollar threshold above which owner vote is mandatory (e.g., > $5,000/unit). Below threshold may be board-only, but transparency is still recommended.'},
          {s:'Prepare special assessment proposal: total cost, per-unit allocation, justification, and payment options',t:'1-2 weeks',detail:'Per-unit allocation must follow the percentage interest defined in the Declaration (not equal split unless docs specify). Include: total cost, per-unit share, payment schedule options (lump sum, installments), hardship provisions.'},
          {s:'Send written notice of proposed special assessment to all owners with full justification',t:'30-60 days before vote',d:'DC Code § 29-1135.03 & Bylaws: Notice',detail:'Notice must include: purpose, total amount, per-unit amount, proposed payment schedule, date/time of owner meeting/vote, proxy form. Send via method required by bylaws.'},
          {s:'Hold owner meeting and conduct vote per bylaws; record results',t:'Per notice period',d:'Bylaws: Voting requirements',detail:'Typically requires 2/3 owner approval in DC. Allow owner questions and discussion. Use secret ballot if bylaws require. Document vote count, quorum verification, and result in minutes.'},
          {s:'If approved: issue formal assessment notice with payment schedule and due dates',t:'Within 14 days of approval',detail:'Include: total amount, per-unit share, due date(s), payment methods accepted, late fee policy. Offer installment plan for large assessments (e.g., 3-12 months).'},
          {s:'Record board resolution and owner vote results in official records',t:'Immediately',d:'Document retention',detail:'Resolution should reference: bylaw authority, vote count, effective date, payment terms. This documentation protects the board if the assessment is challenged.'},
          {s:'If assessment requires financing: evaluate HOA loan options and present to owners',t:'If applicable',d:'Bylaws: Borrowing authority',detail:'HOA loans may also require owner vote per bylaws. Compare: lump-sum assessment, installment assessment, HOA line of credit. Factor in interest cost.'}
        ],
        self:[
          {s:'If owner refuses to pay: send formal demand letter citing CC&Rs, board resolution, and state statute',detail:'Certified mail, return receipt requested. Include copy of vote results and resolution.'},
          {s:'Record lien against non-paying unit per DC lien statute',detail:'DC Code § 42-1903.13: Assessment liens have 6-month super-priority per § 29-1135.08. File with DC Recorder of Deeds.'},
          {s:'Offer hardship payment plan for owners demonstrating financial difficulty',detail:'Document in writing. Board should adopt a uniform hardship policy to avoid selective enforcement claims.'}
        ],
        legal:[
          {s:'Attorney reviews special assessment process and vote requirements before adoption',w:'Assessment exceeds bylaws threshold or > $5K/unit'},
          {s:'Attorney advises on per-unit allocation methodology if challenged',w:'Owner disputes allocation basis'},
          {s:'Attorney files liens and pursues collection for non-payment',w:'Owner is 60+ days delinquent'},
          {s:'Attorney initiates foreclosure on assessment lien if necessary',w:'Severe delinquency, 6-12 months'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.03: Special assessments typically require 2/3 owner vote. DC Code § 42-1903.13: Assessment liens attach automatically. § 29-1135.08: 6-month super-lien priority over first mortgage. Per-unit allocation must follow percentage interests in Declaration. Board must document necessity, alternatives considered, and vote results to satisfy fiduciary duty.',
          '_':'Check bylaws for special assessment voting thresholds (typically 2/3 or 67% of owners). Document necessity and alternatives considered. Per-unit allocation must follow governing docs (usually percentage interest, not equal split). Offer payment plans for large assessments.'
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
          {s:'If payment plan agreed, document in writing signed by both parties'}
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
        self:[{s:'If findings require action: develop remediation plan and timeline'}],
        legal:[{s:'Attorney reviews audit findings with legal implications',w:'Material findings or irregularities discovered'}],
        notes:{'_':'Many states require annual financial reviews or audits above certain thresholds. Check your governing docs and state law.'}
      },
      { id:'reserve-management', title:'Reserve Management', desc:'Reserve studies, tapping reserves, capital planning',
        tags:['Commissioning reserve studies','Tapping reserves','Capital planning','Reserve fund'],
        pre:[
          {s:'Commission or update professional reserve study (required every 3-5 years)',t:'Every 3-5 years',d:'DC Code § 42-1903.13 & Best practice',detail:'Study should cover all common elements with limited useful life. Include: component inventory, condition assessment, estimated replacement cost, remaining useful life, funding recommendations. Use a credentialed reserve specialist (RS) or professional engineer.'},
          {s:'Review reserve study findings with full board; assess current funding level',t:'2-4 weeks after study',d:'Fiscal Lens: Reserves tab',detail:'Key metric: percent funded (current balance / fully funded balance). Below 30% = critically underfunded. 30-70% = fair. Above 70% = strong. Compare to prior study.'},
          {s:'Adopt funding plan with board vote: full funding, threshold, or baseline',t:'Board meeting',d:'Bylaws: Reserve provisions',detail:'Full funding targets 100% funded. Threshold targets a minimum balance to avoid special assessments. Baseline targets minimum to keep reserves positive. Board must document rationale — underfunding may constitute breach of fiduciary duty of care.'},
          {s:'Set annual reserve contribution in budget based on adopted funding plan',t:'During budget process',d:'Fiscal Lens: Budget tab',detail:'Reserve contribution should be a separate line item in the budget. Do not comingle operating and reserve funds in the same bank account. Track reserve contributions and expenditures separately.'},
          {s:'If tapping reserves: verify expenditure matches a designated reserve component',t:'Before expenditure',d:'Bylaws & DC Code § 42-1903.13',detail:'Reserves should only be spent on the components they were collected for. Using reserves for non-designated purposes (e.g., operating shortfalls) may require owner vote per bylaws and constitutes a fiduciary risk.'},
          {s:'If using reserves for non-designated purpose: obtain owner vote per bylaws before proceeding',t:'Before expenditure',d:'Bylaws: Reserve use restrictions',detail:'Most bylaws restrict reserve use to designated capital items. Borrowing from reserves for operations requires owner approval and a documented repayment plan. Check bylaws for specific voting threshold.'},
          {s:'Disclose reserve status in annual budget report and at annual meeting',t:'Annually',d:'DC Code § 42-1903.13 & Bylaws',detail:'Disclosure should include: current balance, percent funded, annual contribution, upcoming major expenditures, and any changes from prior year. Include in resale certificate package.'}
        ],
        self:[
          {s:'If owner challenges reserve funding level: provide reserve study data, funding plan rationale, and board resolution',detail:'Explain the funding strategy chosen and the trade-offs.'},
          {s:'Prepare reserve disclosure for resale certificates per DC Code § 42-1904.04(a)'},
          {s:'If reserves are critically underfunded (< 30%): develop a catch-up plan — may require special assessment or significant contribution increase',detail:'Present plan to owners with timeline to reach target funding level.'}
        ],
        legal:[
          {s:'Attorney reviews reserve borrowing or commingling questions',w:'Board wants to use reserves for non-designated purpose'},
          {s:'Attorney advises on fiduciary duty regarding underfunded reserves',w:'Reserve study shows significant shortfall (< 30% funded)'},
          {s:'Attorney advises if reserve expenditure exceeds board authority and requires owner vote',w:'Large unplanned reserve expenditure not in study'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.13: Reserves must be maintained per governing documents. Reserve study best practice: update every 3-5 years. Board has fiduciary duty to adequately fund reserves — chronic underfunding transfers costs to future owners via special assessments. Using reserves for non-designated purposes without owner approval is a fiduciary risk. Disclose reserve status in resale packages per § 42-1904.04(a).',
          '_':'Check your state for reserve study requirements, mandatory reserve components, and owner vote provisions for tapping reserves. Board has fiduciary duty to fund reserves adequately. Underfunding creates special assessment risk and potential personal liability.'
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
          {s:'Determine if common element or unit owner responsibility per CC&Rs',t:'1-3 days',d:'CC&Rs: Maintenance matrix',detail:'CC&Rs define the boundary between HOA and unit owner responsibility. Typically: structure, roof, exterior walls, common pipes = HOA. Interior finishes, fixtures, appliances = owner. Check your specific maintenance responsibility chart.'},
          {s:'Obtain 2-3 qualified contractor bids; verify licenses and insurance',t:'1-2 weeks',detail:'For emergency repairs (active leak, safety hazard), board may authorize immediate work under emergency spending provisions. For non-emergency: always get competitive bids.'},
          {s:'Check bylaws for board spending authority limit before approving',t:'Before approval',d:'Bylaws: Spending authority',detail:'Most bylaws authorize the board to spend up to a threshold (e.g., $5K-$25K) without owner vote. Repairs exceeding this threshold may require owner approval unless it qualifies as an emergency. Check your specific bylaws.'},
          {s:'Determine funding source: operating budget, reserves, or insurance claim',t:'Before approval',d:'Fiscal Lens',detail:'If the repair is a reserve item, use reserves. If it is a routine maintenance item, use operating budget. If caused by a covered peril, file insurance claim. Do not use reserves for operating expenses without owner approval.'},
          {s:'Board approves expenditure at meeting; document vote and funding source in minutes',t:'Next board meeting (emergency exception for health/safety)',d:'Bylaws: Spending authority',detail:'Emergency repairs for health/safety may proceed before board vote — ratify at next meeting per bylaws emergency spending provision. All other repairs require board approval before work begins.'},
          {s:'Engage contractor via work order; oversee work; document completion with photos',t:'Per scope',d:'Fiscal Lens: Work Orders',detail:'Create work order in Fiscal Lens. Track: contractor, amount, GL account, approval status. Inspect completed work before final payment.'},
          {s:'If caused by unit owner negligence: send cost responsibility notice with documentation',t:'After repair',d:'CC&Rs: Damage responsibility',detail:'Include: CC&R section cited, repair invoices, photos, and timeline for reimbursement. If owner disputes, escalate to formal demand.'}
        ],
        self:[
          {s:'If unit owner responsible: send formal demand for reimbursement with documentation',detail:'Include CC&R section, invoices, photos. Certified mail, return receipt.'},
          {s:'If contractor dispute: send demand letter citing contract terms and deficiency documentation'},
          {s:'File insurance claim if applicable; coordinate with unit owner HO-6 insurance'}
        ],
        legal:[
          {s:'Attorney reviews responsibility dispute between HOA and unit owner',w:'Dispute over who pays for repair'},
          {s:'Attorney pursues claim against contractor for defective work',w:'Contractor refuses to remedy'},
          {s:'Attorney advises if repair cost exceeds board spending authority',w:'Cost exceeds bylaws threshold and owner vote may be needed'}
        ],
        notes:{
          'DC':'DC Code § 42-1903.04: Maintenance responsibility follows the Declaration\'s allocation between common elements and units. Board has fiduciary duty to maintain common elements promptly. Check bylaws for spending authority limits — repairs above the threshold require owner vote unless emergency. Emergency spending must be ratified at next board meeting.',
          '_':'Check bylaws for board spending authority limits. Repairs above threshold may require owner vote. Review CC&Rs for maintenance responsibility between HOA and unit owners. Always document with photos and get competitive bids for non-emergency work.'
        }
      },
      { id:'emergency-situations', title:'Emergency Situations', desc:'Burst pipes, flooding, fire, storm damage, sewer backups',
        tags:['Burst pipes','Flooding','Fire damage','Storm damage','Emergency repair'],
        pre:[
          {s:'Ensure safety: evacuate if necessary, call 911 for fire/gas/structural',t:'Immediately',detail:'Life safety is the absolute first priority. Do not attempt to assess damage until area is safe.'},
          {s:'Engage emergency mitigation contractor (water extraction, board-up, temporary repairs)',t:'Within hours',d:'Bylaws: Emergency spending',detail:'Most bylaws authorize the board president or property manager to approve emergency spending without a full board vote when there is imminent risk to health, safety, or property. Document the emergency justification.'},
          {s:'Document everything: photos, video, written timeline of events and actions taken',t:'Ongoing',detail:'This documentation is critical for insurance claims, contractor disputes, and demonstrating the board acted reasonably. Include: who discovered it, when, actions taken, contractors engaged, costs incurred.'},
          {s:'Notify insurance carrier and file claim within policy timeframe',t:'Within 24-48 hours',d:'Insurance policy: Notice provisions',detail:'Contact carrier claims department. Provide: policy number, date/time of loss, description, initial photos, estimated damage. Request adjuster visit. Do not dispose of damaged materials until adjuster approves.'},
          {s:'Notify affected unit owners in writing; advise on HO-6 claim filing',t:'Within 24 hours',detail:'Owners need to file their own HO-6 claims for unit interior damage. Provide: description of incident, areas affected, carrier claim number, contact for questions.'},
          {s:'Track all emergency expenditures; create work orders in Fiscal Lens',t:'As incurred',d:'Fiscal Lens: Work Orders',detail:'Even in emergencies, track every expense. Create work orders for each contractor/vendor. This is critical for insurance reimbursement and board ratification.'},
          {s:'Board ratifies emergency expenditure at next meeting; document justification',t:'Next board meeting',d:'Bylaws: Emergency provisions',detail:'Present: description of emergency, actions taken, contractors engaged, total cost, insurance claim status, funding source (operating, reserves, or insurance proceeds). Board votes to ratify. Record in minutes.'},
          {s:'Determine funding gap: insurance proceeds vs total cost; assess if special assessment is needed',t:'After adjuster estimate',d:'Bylaws & DC Code § 29-1135.03',detail:'If insurance does not cover full cost: determine shortfall. Options: operating budget surplus, reserves (if designated item), special assessment (may require owner vote per bylaws), or HOA line of credit. Emergency special assessments may have expedited procedures in bylaws.'}
        ],
        self:[
          {s:'Coordinate insurance between master policy and unit HO-6 policies; determine deductible allocation per CC&Rs',detail:'CC&Rs typically define deductible allocation. Some: per-unit deductible. Others: HOA bears master policy deductible. Document clearly.'},
          {s:'If caused by unit owner negligence: send formal notice of responsibility and demand for reimbursement',detail:'Include: CC&R section, documentation of cause, repair invoices. Certified mail.'},
          {s:'Document all expenses meticulously for insurance reimbursement and potential legal recovery'}
        ],
        legal:[
          {s:'Attorney advises on insurance coverage disputes and deductible allocation',w:'Carrier denies or underpays claim'},
          {s:'Attorney pursues subrogation or third-party claims',w:'Damage caused by negligent third party or unit owner'},
          {s:'Attorney advises on emergency special assessment authority if insurance shortfall',w:'Insurance does not cover full cost and reserves insufficient'}
        ],
        notes:{
          'DC':'DC Code § 29-1108.01: Board has implied authority for emergency actions to protect health, safety, and property. Ratify at next board meeting. If emergency cost exceeds insurance + reserves, emergency special assessment may be needed — check bylaws for expedited voting procedures. Document the emergency thoroughly to defend spending decisions.',
          '_':'Most state condo acts grant boards emergency spending authority without prior owner vote. Document the emergency, ratify at next meeting, and track all expenses for insurance recovery. If insurance falls short, special assessment may require owner vote.'
        }
      },
      { id:'vendor-management', title:'Vendor Management', desc:'Hiring contractors, reviewing bids, contracts, disputes',
        tags:['Hiring contractors','Reviewing bids','Performance disputes','Contract management'],
        pre:[
          {s:'Define scope of work and budget; check if amount exceeds board spending authority',t:'Before soliciting bids',d:'Bylaws: Spending authority',detail:'Check bylaws for contract value thresholds. Contracts above the threshold (e.g., $10K-$25K) may require owner vote. For recurring contracts (e.g., landscaping, management), consider annual value, not monthly.'},
          {s:'Obtain minimum 3 competitive bids from qualified contractors',t:'2-4 weeks',detail:'Provide identical scope to all bidders for fair comparison. Request: itemized pricing, timeline, references, proof of insurance, license number.'},
          {s:'Verify contractor licenses, insurance (GL + workers comp), and check references',t:'1-2 weeks',d:'Fiduciary duty of care',detail:'Require: current state/local business license, general liability insurance ($1M+ naming HOA as additional insured), workers compensation if they have employees, completed W-9. Call 2-3 references on similar projects.'},
          {s:'Review contract terms: scope, fixed price, timeline, payment schedule, warranty, indemnification, termination',t:'1 week',detail:'Key terms: payment tied to milestones (not time), 10% retention on large projects, warranty (1-2 years minimum), insurance requirements, hold-harmless/indemnification, termination for cause and convenience, dispute resolution.'},
          {s:'Check for conflicts of interest: does any board member have a relationship with the contractor?',t:'Before approval',d:'Fiduciary duty of loyalty',detail:'Any board member with a relationship to the contractor must disclose and recuse from discussion and vote per conflict of interest policy. Document disclosure in minutes.'},
          {s:'Board approves contract at meeting; record vote and rationale in minutes',t:'Board meeting',d:'Bylaws: Contract authority',detail:'If contract value exceeds bylaws threshold for board-only approval, schedule owner vote before executing. For contracts within authority: board approves by majority vote with rationale documented.'},
          {s:'Execute contract; issue work order in Fiscal Lens; set up payment schedule',t:'After approval',d:'Fiscal Lens: Work Orders',detail:'Create work order linked to GL account and budget category. Set payment milestones. Do not make payments ahead of completed work.'},
          {s:'Monitor performance; document milestones and any deficiencies in writing',t:'Ongoing',detail:'Regular progress check-ins. Photograph completed milestones. Send written notice of any deficiencies immediately — do not wait until project end.'},
          {s:'Conduct final inspection and resolve punch list before releasing final payment/retention',t:'At completion',detail:'Walk project with contractor and board representative. Create written punch list. Do not release retention until all items resolved and warranty documentation received.'}
        ],
        self:[
          {s:'If performance issue: send written notice citing contract provisions with cure period',detail:'Give reasonable cure period (15-30 days). Certified mail.'},
          {s:'If unresolved: send formal demand with documentation of deficiencies and cost of remediation'},
          {s:'File complaint with DC DLCP contractor licensing division if applicable'}
        ],
        legal:[
          {s:'Attorney reviews contract before execution for large projects',w:'Contracts exceeding $25K or per bylaws threshold'},
          {s:'Attorney sends demand and pursues breach of contract claim',w:'Contractor defaults or work defective'},
          {s:'Attorney advises if contract requires owner approval per bylaws spending limits',w:'Contract value exceeds board authority'}
        ],
        notes:{
          'DC':'DC DLCP (formerly DCRA) handles contractor licensing. Verify license at dlcp.dc.gov. Require contractors to carry GL insurance naming HOA as additional insured. Check bylaws for contract value thresholds — board may not have authority to sign contracts above a certain amount without owner vote. Document all bid comparisons and selection rationale to satisfy fiduciary duty.',
          '_':'Verify contractor licensing in your state. Require insurance certificates naming HOA as additional insured. Check bylaws for contract approval thresholds. Document bid comparison and selection rationale to demonstrate fiduciary care.'
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
        self:[{s:'If deficiency cited: document remediation plan and timeline'}],
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
        self:[{s:'If code violation cited: respond in writing and document remediation timeline'}],
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
          {s:'If not cured: send formal violation notice via certified mail',t:'After cure period',d:'CC&Rs: Enforcement'},
          {s:'Schedule hearing per governing docs (if required before fines)',t:'10-30 days notice',d:'Bylaws: Hearing procedures'},
          {s:'Impose fine or remedy per board resolution',t:'After hearing',d:'Fine schedule'}
        ],
        self:[
          {s:'If owner refuses to cure: escalate fines per schedule',detail:'Document each notice and response'},
          {s:'If owner disputes violation: review CC&Rs and provide written explanation'},
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
          {s:'If fine imposed: send formal notice with payment deadline',t:'With decision'}
        ],
        self:[
          {s:'If owner appeals: review appeal process in governing docs'},
          {s:'If fine unpaid: add to assessment ledger and pursue as delinquency'}
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
          {s:'If owner proceeds without approval: issue stop-work notice'},
          {s:'If owner disputes denial: provide written explanation citing specific guidelines'}
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
          {s:'If ESA/service animal claim: request proper documentation',t:'Promptly',d:'Fair Housing Act'},
          {s:'If nuisance continues: schedule hearing and escalate per enforcement policy',t:'Per bylaws'}
        ],
        self:[
          {s:'If ESA dispute: review HUD guidance on assistance animals'},
          {s:'If dangerous animal: report to local animal control'}
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
        self:[{s:'If claim denied: review denial letter and policy provisions'},{s:'If underpaid: document actual costs and request reconsideration'}],
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
        self:[{s:'If small claim: prepare and file in small claims court',detail:'Check jurisdictional limits'},{s:'If mediation required: schedule through approved provider'}],
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
        self:[{s:'If owner disputes interpretation: provide written explanation with citations'}],
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
          {s:'If approved: record amendment with county recorder',t:'Within 30 days'},
          {s:'Distribute updated documents to all owners',t:'After recording'}
        ],
        self:[{s:'If vote fails: document results and consider revised proposal'}],
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
        self:[{s:'If quorum not met: adjourn and reschedule per bylaws'}],
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
        self:[{s:'If election challenged: review procedures and ballots',detail:'Preserve all election materials'}],
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
          {s:'If quorum not met: adjourn and reconvene per bylaws',detail:'Many bylaws allow reduced quorum at adjourned meeting. Check your specific provisions.'},
          {s:'If election contested: preserve all ballots and proxy forms; review bylaws dispute procedures'},
          {s:'If budget ratification fails: board may need to re-present revised budget at a special meeting'},
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
        self:[{s:'If assignee unable to complete: reassign or adjust timeline at next meeting'}],
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
        self:[{s:'If owner challenges policy: provide written explanation citing authority'}],
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
        self:[{s:'If conflict not disclosed: another board member raises the issue'}],
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
          {s:'If unresolved: offer mediation between parties',t:'2-4 weeks'},
          {s:'If still unresolved: escalate per enforcement policy',t:'Per bylaws'}
        ],
        self:[{s:'If mediation fails: impose fines per hearing process'}],
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
        self:[{s:'If responsibility disputed: obtain independent expert opinion'}],
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
        self:[{s:'If rule violation: follow standard enforcement process'}],
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
        self:[{s:'If camera installation: review local privacy laws'}],
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
          {s:'Commission engineering study or professional assessment to define scope and urgency',t:'6-12 months before project',detail:'Engage a licensed engineer or specialist. Report should include: scope, urgency rating, estimated cost range, recommended timeline, and alternatives considered.'},
          {s:'Review reserve study and current reserve balance to determine available funding',t:'After assessment',d:'Reserve study & Fiscal Lens',detail:'Check if this project is already in the reserve plan. Determine: can reserves cover it? Is a special assessment needed? Is financing required? Review reserve funding percentage.'},
          {s:'Determine funding source and check bylaws for owner approval requirements',t:'2-4 weeks',d:'Bylaws: Spending authority & DC Code § 29-1135.03',detail:'Check bylaws for board spending limits (e.g., contracts > $X require owner vote). DC may require 2/3 owner approval for expenditures above threshold or special assessments. If tapping reserves for non-designated purpose, owner vote is likely required.'},
          {s:'If owner vote required: send notice of proposed project with cost, funding plan, and meeting date',t:'30-60 days before vote',d:'Bylaws: Notice requirements',detail:'Notice must include: project description, total cost, funding source (reserves/assessment/loan), impact on assessments, payment schedule if special assessment. Allow adequate time for owner questions.'},
          {s:'Develop detailed project scope, specifications, and timeline',t:'3-6 months out',detail:'Scope should be detailed enough for apples-to-apples bidding. Include performance standards, warranty requirements, and completion timeline.'},
          {s:'Obtain minimum 3 competitive bids from qualified, licensed, and insured contractors',t:'2-3 months out',detail:'Verify: state/local contractor license, general liability insurance ($1M+), workers comp, bonding capacity. Check references on similar projects. Require bids on identical scope.'},
          {s:'Board evaluates bids on qualifications, references, price, and timeline — not lowest price alone',t:'Board meeting',d:'Fiduciary duty of care',detail:'Document evaluation criteria and rationale. Lowest bid is not always best — consider experience, warranty, financial stability. Record decision in minutes.'},
          {s:'Hold owner vote if required by bylaws or statute; obtain approval before proceeding',t:'At meeting per notice',d:'Bylaws & DC Code § 29-1135.03',detail:'If special assessment needed: typically requires 2/3 owner approval in DC. If using reserves for designated purpose per reserve study: board may approve. Document vote results in minutes.'},
          {s:'Execute contract with performance bond and payment/retention schedule',t:'After all approvals',d:'Best practice for projects > $50K',detail:'Contract should include: detailed scope, fixed price or GMP, payment schedule tied to milestones (not time), 10% retention until final completion, performance bond (100% of contract value for large projects), warranty terms, insurance requirements, indemnification.'},
          {s:'Notify owners of project start, timeline, and expected impact',t:'Before construction begins',detail:'Communication should include: start date, estimated duration, noise/access impacts, parking changes, contact for questions.'},
          {s:'Monitor construction with regular progress meetings; document milestones and change orders',t:'Weekly during project',detail:'Require written change orders approved by board before extra work. Track budget vs actual spending. Photograph progress at each milestone.'},
          {s:'Conduct final inspection and punch list; hold retention until all items resolved',t:'At substantial completion',detail:'Walk the project with contractor and independent inspector. Create written punch list. Do not release final retention until all punch list items are resolved and warranty documentation received.'}
        ],
        self:[
          {s:'If contractor default: review contract remedies, bonding, and insurance claims'},
          {s:'If project goes over budget: document reasons, evaluate change orders, and determine if additional owner approval is needed for the overage'},
          {s:'Post-project: update reserve study to reflect completed improvement and adjusted useful life'}
        ],
        legal:[
          {s:'Attorney reviews contract and bonding for major projects',w:'Projects exceeding $50K or per bylaws threshold'},
          {s:'Attorney advises on owner vote requirements before project commitment',w:'Project cost exceeds board spending authority per bylaws'},
          {s:'Attorney reviews change orders with significant cost impact',w:'Change orders exceed 10% of contract value'}
        ],
        notes:{
          'DC':'DC Code § 29-1135.03: Expenditures above bylaw thresholds may require 2/3 owner vote. Special assessments to fund capital projects almost certainly require owner vote. Check bylaws for board spending authority limits. Contracts over $25K: consider performance bond and attorney review. Reserve borrowing for non-designated purposes requires owner approval.',
          '_':'Check bylaws for board spending authority limits — most require owner vote above a threshold (e.g., $25K-$100K or % of annual budget). Always obtain multiple bids, require bonding on large projects, and document the decision process to satisfy fiduciary duty.'
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
        self:[{s:'If health department involved: cooperate fully and document compliance'}],
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
        self:[{s:'If filing rejected: review deficiencies and resubmit promptly'},{s:'Set calendar reminders 60 and 30 days before each filing deadline'}],
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
          {s:'If partially denying: written explanation citing specific statutory exemption',t:'With response',d:'DC Code § 42-1903.14(b)',detail:'Must cite the specific exemption relied upon. Vague denials are not legally defensible.'}
        ],
        self:[{s:'If owner disputes denial: review statute and provide additional explanation',detail:'Consider consulting attorney before refusing. DC courts award attorney fees to prevailing owner.'},{s:'Document what was provided and when — maintain inspection log'}],
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
          {s:'If info disputed by buyer/seller: provide supporting documentation (ledger history, board resolutions)',detail:'Respond within 5 business days to avoid delaying settlement.'},
          {s:'If request is late or urgent (settlement imminent): prioritize and consider expedited fee if permitted by governing docs'},
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
          {s:'If no damage: refund deposit within timeline specified in rules',t:'Within 30 days',detail:'Written confirmation of inspection clearance. Refund via original payment method.'},
          {s:'If damage found: send itemized deduction notice with photos, repair estimates, and remaining balance',t:'Within 30 days',d:'Rules & Regulations',detail:'Itemize each deduction with cost. Provide repair invoices or contractor estimates. Refund any remaining balance.'}
        ],
        self:[{s:'If owner disputes deductions: provide pre/post photos, invoices, and repair documentation'},{s:'If damage exceeds deposit: send written demand for balance citing governing docs'}],
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
