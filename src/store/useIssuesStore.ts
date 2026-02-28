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
        tags:['Setting annual assessments','Forecasting operating costs','Funding reserves'],
        pre:[
          {s:'Review current year financials and reserve balances',t:'90 days before fiscal year-end',d:'Bylaws: Budget provisions'},
          {s:'Obtain bids and cost estimates for upcoming expenses',t:'60-90 days out',d:'CC&Rs: Assessment authority'},
          {s:'Draft proposed budget with line-item detail',t:'60 days out'},
          {s:'Present budget at open board meeting for owner input',t:'30 days before adoption',d:'Bylaws: Notice requirements'},
          {s:'Distribute budget & assessment notice to all owners',t:'Per governing docs',d:'State condo act: Notice timeline'},
          {s:'Board votes to adopt budget and set new assessment rate',t:'Before fiscal year start',d:'Bylaws: Voting requirements'}
        ],
        self:[
          {s:'Research state-mandated budget disclosure requirements',detail:'Review your state condo act for required financial disclosures and timelines'},
          {s:'File any required annual financial reports with the state',detail:'Some jurisdictions require annual filings'},
          {s:'If owner disputes assessment: document ratification, send formal response citing governing docs'},
          {s:'If needed, pursue small claims for unpaid assessments under threshold',detail:'Check local small claims limits'}
        ],
        legal:[
          {s:'Consult attorney if assessment increase exceeds threshold requiring owner vote',w:'Most states cap increases at 10-25% without owner approval'},
          {s:'Legal review of budget adoption process if challenged by owners',w:'Owner files formal challenge or threatens suit'},
          {s:'Attorney drafts special meeting notice if supermajority vote needed',w:'Large increase or special assessment'}
        ],
        notes:{'DC':'DC Code § 29-1135.02 requires 30-day notice before budget adoption.','CA':'Civil Code § 5300 requires annual budget report including reserve funding.','_':'Review your state condo act for required budget notice periods and owner approval thresholds.'}
      },
      { id:'special-assessments', title:'Special Assessments', desc:'Roof replacement, structural repairs, emergency storm damage',
        tags:['Roof replacement','Structural repairs','Emergency storm damage'],
        pre:[
          {s:'Identify capital need and obtain 2-3 professional cost estimates',t:'Immediately upon identifying need',d:'Reserve study'},
          {s:'Review governing docs for special assessment authority and voting requirements',t:'1-2 weeks',d:'Bylaws: Special assessment section'},
          {s:'Determine if owner vote required based on amount threshold',t:'1 week',d:'CC&Rs & State condo act'},
          {s:'Send written notice of proposed special assessment with justification',t:'Per governing docs (10-30 days)',d:'Bylaws: Notice provisions'},
          {s:'Hold meeting/vote if required; board resolution if not',t:'Per notice period'},
          {s:'Issue formal assessment notice with payment schedule',t:'After approval'},
          {s:'Offer payment plan options if amount is substantial',t:'With notice',d:'Best practice'}
        ],
        self:[
          {s:'If owner refuses to pay: send formal demand letter citing CC&Rs and state statute',detail:'Certified mail, return receipt requested'},
          {s:'Record lien against non-paying unit per your state lien statute',detail:'Check county recorder requirements'},
          {s:'File small claims if amount is within jurisdictional limits'}
        ],
        legal:[
          {s:'Attorney reviews special assessment process for legal compliance before adoption',w:'Assessment exceeds $5K/unit or is contested'},
          {s:'Attorney files liens and pursues collection for non-payment',w:'Owner is 60+ days delinquent'},
          {s:'Attorney initiates foreclosure on assessment lien if necessary',w:'Severe delinquency, 6-12 months'}
        ],
        notes:{'DC':'DC Code § 29-1135.03 — Special assessments may require 2/3 owner vote.','_':'Check your state statute for special assessment voting thresholds and notice requirements.'}
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
        tags:['Commissioning reserve studies','Tapping reserves','Capital planning'],
        pre:[
          {s:'Commission or update professional reserve study',t:'Every 3-5 years',d:'State condo act'},
          {s:'Review reserve study findings with full board',t:'2-4 weeks after study'},
          {s:'Adopt funding plan: full, threshold, or baseline',t:'Board vote',d:'Bylaws: Reserve provisions'},
          {s:'If tapping reserves: document board resolution with specific purpose',t:'Before expenditure',d:'Bylaws'},
          {s:'Disclose reserve status in annual budget report',t:'Annually',d:'State disclosure requirements'}
        ],
        self:[
          {s:'If owner challenges reserve funding: prepare written response with reserve study data'},
          {s:'Prepare reserve disclosure for resale certificates per state requirements'}
        ],
        legal:[
          {s:'Attorney reviews reserve borrowing or commingling questions',w:'Board wants to use reserves for non-designated purpose'},
          {s:'Attorney advises on fiduciary duty regarding underfunded reserves',w:'Reserve study shows significant shortfall'}
        ],
        notes:{'_':'Check your state for reserve study requirements, mandatory reserve components, and owner vote provisions.'}
      }
    ]
  },
  { id:'maintenance', num:'2', icon:'🔧', label:'Maintenance & Property', color:'blue',
    sits: [
      { id:'common-area-repairs', title:'Common Area Repairs', desc:'Roof leaks, structural cracks, plumbing, elevator, HVAC',
        tags:['Roof leaks','Structural cracks','Plumbing risers','Elevator failures'],
        pre:[
          {s:'Document issue with photos, video, dates, affected areas',t:'Immediately'},
          {s:'Determine if common element or unit owner responsibility per CC&Rs',t:'1-3 days',d:'CC&Rs: Maintenance matrix'},
          {s:'Obtain 2-3 qualified contractor bids',t:'1-2 weeks'},
          {s:'Board approves expenditure (emergency exception for health/safety)',t:'Next board meeting',d:'Bylaws: Spending authority'},
          {s:'Engage contractor and oversee work; document completion',t:'Per scope'},
          {s:'If caused by unit owner negligence, send cost responsibility notice',t:'After repair',d:'CC&Rs: Damage responsibility'}
        ],
        self:[
          {s:'If unit owner responsible: send formal demand for reimbursement with documentation',detail:'Include CC&R section, invoices, photos'},
          {s:'If contractor dispute: send demand letter citing contract terms'},
          {s:'File insurance claim if applicable; coordinate with unit owner insurance'}
        ],
        legal:[
          {s:'Attorney reviews responsibility dispute between HOA and unit owner',w:'Dispute over who pays for repair'},
          {s:'Attorney pursues claim against contractor for defective work',w:'Contractor refuses to remedy'}
        ],
        notes:{'_':'Review your CC&Rs and state condo act for maintenance responsibility between HOA and individual owners.'}
      },
      { id:'emergency-situations', title:'Emergency Situations', desc:'Burst pipes, flooding, fire, storm damage, sewer backups',
        tags:['Burst pipes','Flooding','Fire damage','Storm damage'],
        pre:[
          {s:'Ensure safety: evacuate if necessary, call 911 for fire/gas/structural',t:'Immediately'},
          {s:'Engage emergency mitigation contractor (water extraction, board-up)',t:'Within hours',d:'Bylaws: Emergency spending'},
          {s:'Document everything: photos, video, written timeline',t:'Ongoing'},
          {s:'Notify insurance carrier and file claim',t:'Within 24-48 hours',d:'Insurance policy'},
          {s:'Notify affected unit owners in writing',t:'Within 24 hours'},
          {s:'Board ratifies emergency expenditure at next meeting',t:'Next meeting',d:'Bylaws: Emergency provisions'}
        ],
        self:[
          {s:'Coordinate insurance between master policy and unit HO-6 policies',detail:'Determine deductible allocation per CC&Rs'},
          {s:'If caused by unit owner: send formal notice of responsibility'},
          {s:'Document all expenses for insurance/legal recovery'}
        ],
        legal:[
          {s:'Attorney advises on insurance coverage disputes and deductible allocation',w:'Carrier denies or underpays'},
          {s:'Attorney pursues third-party claims',w:'Damage caused by third party'},
          {s:'Attorney advises on emergency assessment authority',w:'Insurance does not cover full cost'}
        ],
        notes:{'_':'Most state condo acts grant boards emergency spending authority. Document emergency and ratify at next meeting.'}
      },
      { id:'vendor-management', title:'Vendor Management', desc:'Hiring contractors, reviewing bids, contracts, disputes',
        tags:['Hiring contractors','Reviewing bids','Performance disputes'],
        pre:[
          {s:'Define scope of work and obtain minimum 3 competitive bids',t:'2-4 weeks'},
          {s:'Verify contractor licenses, insurance, and references',t:'1-2 weeks'},
          {s:'Review contract: scope, timeline, payment, warranty, indemnification',t:'1 week'},
          {s:'Board approves contract per spending authority',t:'Board meeting',d:'Bylaws: Contract authority'},
          {s:'Monitor performance; document milestones and deficiencies in writing',t:'Ongoing'},
          {s:'Conduct final inspection and punch list before final payment',t:'At completion'}
        ],
        self:[
          {s:'If performance issue: send written notice citing contract provisions',detail:'Give reasonable cure period (15-30 days)'},
          {s:'If unresolved: send formal demand with documentation of deficiencies'},
          {s:'File complaint with state contractor licensing board'}
        ],
        legal:[
          {s:'Attorney reviews contract before execution for large projects (>$25K)',w:'Best practice for major contracts'},
          {s:'Attorney sends demand and pursues breach of contract claim',w:'Contractor defaults or work defective'}
        ],
        notes:{'_':'Verify contractor licensing in your state. Require insurance certificates and include indemnification in all contracts.'}
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
        tags:['Window replacement','Siding','Elevator modernization'],
        pre:[
          {s:'Commission engineering study or assessment',t:'6-12 months before project'},
          {s:'Develop project scope and timeline',t:'3-6 months out'},
          {s:'Obtain 3+ competitive bids from qualified contractors',t:'2-3 months out'},
          {s:'Board approves project and funding (reserves, special assessment, loan)',t:'Board meeting'},
          {s:'Execute contract with performance bond for large projects',t:'After approval'},
          {s:'Monitor construction with regular progress meetings',t:'During project'}
        ],
        self:[{s:'If contractor default: review contract remedies and bonding'}],
        legal:[{s:'Attorney reviews contract and bonding for major projects',w:'Projects exceeding $50K'}],
        notes:{'_':'For large capital projects, consider hiring an owners representative to manage the contractor.'}
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
          {s:'Identify filing requirement and deadline',t:'As needed',d:'State/local requirements'},
          {s:'Gather required documentation',t:'2-4 weeks before deadline'},
          {s:'Complete forms and prepare submission',t:'1-2 weeks before deadline'},
          {s:'Board review and sign-off if required',t:'Board meeting',d:'Bylaws'},
          {s:'Submit filing to appropriate agency',t:'Before deadline'},
          {s:'Confirm receipt and save confirmation',t:'Within days of submission'},
          {s:'File copy of submission in association records',t:'Immediately'}
        ],
        self:[{s:'If filing rejected: review deficiencies and resubmit promptly'}],
        legal:[{s:'Attorney assists with complex filings or disputed requirements',w:'Filing involves legal interpretation or dispute'}],
        notes:{'_':'Maintain a calendar of all regulatory filing deadlines. Many jurisdictions impose penalties for late filings.'}
      },
      { id:'record-requests', title:'Record Requests', desc:'Owner inspection requests, financial transparency',
        tags:['Owner inspection requests','Financial transparency disputes'],
        pre:[
          {s:'Receive written request and log date received',t:'Upon receipt',d:'Bylaws: Records access'},
          {s:'Review state law for response timeline and scope',t:'1-3 days',d:'State condo act'},
          {s:'Identify requested records; determine exemptions',t:'3-5 days'},
          {s:'Provide records within statutory deadline; charge reasonable copying costs',t:'5-10 business days',d:'State condo act'},
          {s:'If partially denying: written explanation citing specific exemption',t:'With response'}
        ],
        self:[{s:'If owner disputes denial: review statute and provide additional explanation'},{s:'Document what was provided and when'}],
        legal:[{s:'Attorney advises on privileged documents and access rights',w:'Sensitive records or dispute'},{s:'Attorney defends records access lawsuit',w:'Owner files suit'}],
        notes:{'_':'Most states grant broad access with specific response timelines. Exemptions limited to attorney-client privilege.'}
      },
      { id:'resale-certs', title:'Resale Certificates', desc:'Preparing disclosure documents for unit sales',
        tags:['Preparing disclosure documents'],
        pre:[
          {s:'Receive request from selling owner or agent',t:'Upon request'},
          {s:'Compile required info: assessments, violations, specials, reserves, insurance',t:'3-10 days',d:'State condo act'},
          {s:'Include all required documents per state law',t:'With certificate'},
          {s:'Disclose any litigation, special assessments, capital projects',t:'With certificate'},
          {s:'Issue certificate and charge permitted fee',t:'Within statutory deadline',d:'State condo act'}
        ],
        self:[{s:'If info disputed: provide supporting documentation'},{s:'Maintain copy of each certificate in HOA records'}],
        legal:[{s:'Attorney reviews template for state compliance',w:'Annual or after law changes'}],
        notes:{'_':'Most states require resale package. Check for contents, timeline, fee limits, buyer rescission rights.'}
      },
      { id:'move-disputes', title:'Move-In/Move-Out Disputes', desc:'Deposit disputes, damage claims',
        tags:['Deposit disputes','Damage claims'],
        pre:[
          {s:'Conduct pre-move inspection of common areas',t:'Before move date',d:'Rules: Move policy'},
          {s:'Collect move-in deposit per rules',t:'Before move date',d:'Rules & Regulations'},
          {s:'Conduct post-move inspection; document damage with photos',t:'Within 24 hours'},
          {s:'If no damage: refund deposit within specified timeline',t:'Per rules (30 days)'},
          {s:'If damage: itemized deduction notice with photos and costs',t:'Per rules'}
        ],
        self:[{s:'If owner disputes: provide pre/post photos and invoices'},{s:'If damage exceeds deposit: send demand for balance'}],
        legal:[{s:'Attorney advises on deposit retention procedures',w:'Setup or dispute'}],
        notes:{'_':'Move deposits must be authorized by governing docs. Inspect before and after. Refund or itemize promptly.'}
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
    reviewNotes: []
  },
  {
    id: 'iss-2', type: 'BUILDING_PUBLIC', category: 'Safety',
    priority: 'MEDIUM', status: 'SUBMITTED',
    title: 'Garage Door Sensor Broken', description: 'Garage door B does not stop when sensor is tripped. Safety risk.',
    reportedBy: 'u-res-2', reporterName: 'Mark Torres', reporterEmail: 'mtorres@email.com',
    unitNumber: '310', submittedDate: '2026-02-14',
    upvotes: [{ userId: 'u-res-2', userName: 'Mark Torres', unitNumber: '310' }, { userId: 'u-resident', userName: 'Lisa Chen', unitNumber: '502' }],
    viewCount: 8, comments: [], reviewNotes: []
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
  addIssue: (issue: Omit<Issue, 'id' | 'upvotes' | 'viewCount' | 'comments' | 'reviewNotes'>, tenantId?: string) => void;
  upvoteIssue: (issueId: string, userId: string, userName: string, unitNumber: string) => void;
  updateIssueStatus: (issueId: string, status: Issue['status']) => void;
  addIssueComment: (issueId: string, author: string, text: string) => void;

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
      issues: [{ ...issue, id: localId, upvotes: [], viewCount: 0, comments: [], reviewNotes: [] }, ...s.issues],
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
    return merged;
  },
}));
