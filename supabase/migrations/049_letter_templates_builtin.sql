-- ============================================================================
-- 049: every building gets the built-in letter templates as its own rows
--
-- The 26 built-in templates lived only in the app's code. A building's first
-- saved template replaced the whole list on load, hiding every built-in; an
-- edit or deletion of a built-in sent its code id ("lt1") to a uuid column and
-- was rejected, so it lasted until the next reload. Each building now owns a
-- copy: real ids, so edits and deletions stick, and builtin_key recording
-- which built-in a row came from. seed_letter_templates writes the copies
-- (rows a building already has are left alone), the backfill runs it for
-- every building, a trigger runs it for each building created from now on,
-- and the app does the same on first load as a fallback.
-- ============================================================================

alter table letter_templates add column if not exists builtin_key text;
create unique index if not exists uq_letter_templates_builtin
  on letter_templates(tenant_id, builtin_key) where builtin_key is not null;

create or replace function seed_letter_templates(p_tenant_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into letter_templates (tenant_id, builtin_key, name, category, subject, body, variables)
  select p_tenant_id, d.builtin_key, d.name, d.category, d.subject, d.body, d.variables
    from (values
    ('lt1', 'Violation Notice — First Warning', 'violation', 'Notice of Violation — {{violation_type}}', 'Dear {{owner_name}},

This letter is to notify you that your unit ({{unit_number}}) is in violation of the association''s rules and regulations regarding {{violation_type}}.

Specifically: {{violation_details}}

You have {{cure_period}} days from the date of this notice to correct the violation. Failure to do so may result in fines of {{fee}} as outlined in the governing documents.

Please respond or correct the issue by {{due_date}}.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "violation_type", "label": "Violation Type", "defaultValue": ""}, {"name": "violation_details", "label": "Violation Details", "defaultValue": ""}, {"name": "cure_period", "label": "Cure Period (days)", "defaultValue": "30"}, {"name": "fee", "label": "Potential Fine Amount", "defaultValue": "$100"}, {"name": "due_date", "label": "Compliance Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt1b', 'Violation Notice — Second Warning', 'violation', 'Second Notice of Violation — {{violation_type}}', 'Dear {{owner_name}},

This is your second notice regarding a continuing violation at unit {{unit_number}} concerning {{violation_type}}.

Our records show that a first notice was sent on {{first_notice_date}}. The violation has not been corrected.

Pursuant to the governing documents, a fine of {{fee}} will be imposed if the violation is not corrected by {{due_date}}. Continued non-compliance may result in additional fines and/or legal action.

Please contact the management office immediately to discuss resolution.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "violation_type", "label": "Violation Type", "defaultValue": ""}, {"name": "first_notice_date", "label": "First Notice Date", "defaultValue": ""}, {"name": "fee", "label": "Fine Amount", "defaultValue": "$100"}, {"name": "due_date", "label": "Final Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt1c', 'Fine Imposition Notice', 'violation', 'Notice of Fine — Unit {{unit_number}}', 'Dear {{owner_name}},

Despite previous notices dated {{previous_notice_dates}}, the violation at unit {{unit_number}} regarding {{violation_type}} has not been corrected.

Pursuant to the association''s governing documents, a fine of {{fee}} has been imposed on your account effective {{effective_date}}. This amount is due by {{due_date}}.

You have the right to request a hearing before the Board within 14 days of this notice. To request a hearing, please submit a written request to the management office.

If the violation continues, additional fines of {{recurring_fee}} per {{fine_interval}} will be assessed.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "violation_type", "label": "Violation Type", "defaultValue": ""}, {"name": "previous_notice_dates", "label": "Previous Notice Dates", "defaultValue": ""}, {"name": "fee", "label": "Fine Amount", "defaultValue": "$100"}, {"name": "effective_date", "label": "Effective Date", "defaultValue": ""}, {"name": "due_date", "label": "Payment Due Date", "defaultValue": ""}, {"name": "recurring_fee", "label": "Recurring Fine", "defaultValue": "$50"}, {"name": "fine_interval", "label": "Fine Interval", "defaultValue": "month"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt1d', 'Hearing Notice — Violation', 'violation', 'Notice of Hearing — Unit {{unit_number}}', 'Dear {{owner_name}},

You are hereby notified that a hearing has been scheduled regarding the violation(s) at unit {{unit_number}}.

Hearing Details:
- Date: {{due_date}}
- Time: {{hearing_time}}
- Location: {{hearing_location}}
- Subject: {{violation_type}}

You have the right to attend, present evidence, and be heard. You may also submit a written statement in lieu of attending.

If the Board determines the violation exists, fines of up to {{fee}} may be imposed.

Please confirm your attendance by contacting the management office.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "violation_type", "label": "Violation Type", "defaultValue": ""}, {"name": "due_date", "label": "Hearing Date", "defaultValue": ""}, {"name": "hearing_time", "label": "Hearing Time", "defaultValue": "7:00 PM"}, {"name": "hearing_location", "label": "Location", "defaultValue": "Community Room"}, {"name": "fee", "label": "Maximum Fine", "defaultValue": "$500"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt2', 'Collection — Past Due Notice', 'collection', 'Past Due Assessment Notice — Unit {{unit_number}}', 'Dear {{owner_name}},

Our records indicate that your unit ({{unit_number}}) has an outstanding balance of {{fee}}. This amount was due on {{due_date}}.

Per the association''s collection policy, late fees of {{late_fee}} per month will be assessed on unpaid balances. Please remit payment within {{days_to_pay}} days to avoid further action.

Payment can be made via the resident portal or by check to the management office.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "fee", "label": "Amount Due", "defaultValue": ""}, {"name": "due_date", "label": "Original Due Date", "defaultValue": ""}, {"name": "late_fee", "label": "Late Fee", "defaultValue": "$25"}, {"name": "days_to_pay", "label": "Days to Pay", "defaultValue": "15"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt2b', 'Collection — Intent to Lien', 'collection', 'Notice of Intent to File Lien — Unit {{unit_number}}', 'Dear {{owner_name}},

Despite previous notices, your account for unit {{unit_number}} remains delinquent in the amount of {{fee}}, which includes assessments, late fees, and interest through {{through_date}}.

Unless full payment is received by {{due_date}}, the association intends to file a lien against your property pursuant to the governing documents and applicable law.

Once a lien is filed, you will also be responsible for all recording fees, legal costs, and attorney''s fees incurred in the collection process.

To arrange payment or discuss a payment plan, please contact the management office immediately.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "fee", "label": "Total Amount Owed", "defaultValue": ""}, {"name": "through_date", "label": "Balance Through Date", "defaultValue": ""}, {"name": "due_date", "label": "Payment Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt2c', 'Collection — Payment Plan Offer', 'collection', 'Payment Plan Agreement — Unit {{unit_number}}', 'Dear {{owner_name}},

In response to your request, the Board has approved a payment plan for the outstanding balance on unit {{unit_number}}.

Total amount owed: {{fee}}
Payment plan terms:
- Monthly payment: {{monthly_payment}}
- Number of payments: {{num_payments}}
- First payment due: {{due_date}}
- Payments due on the 1st of each month thereafter

This plan is in addition to your regular monthly assessment of {{regular_assessment}}. All current assessments must remain current during the plan period.

If any payment is missed or more than 10 days late, the full remaining balance becomes immediately due.

Please sign and return a copy of this letter to the management office by {{due_date}} to confirm acceptance.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "fee", "label": "Total Amount Owed", "defaultValue": ""}, {"name": "monthly_payment", "label": "Monthly Payment", "defaultValue": ""}, {"name": "num_payments", "label": "Number of Payments", "defaultValue": "6"}, {"name": "due_date", "label": "First Payment Due", "defaultValue": ""}, {"name": "regular_assessment", "label": "Regular Monthly Assessment", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt5', 'Annual Assessment Notice', 'notice', 'Annual Assessment Notice — {{fiscal_year}}', 'Dear {{owner_name}},

The Board of Directors has approved the annual budget for {{fiscal_year}}. Your monthly assessment for unit {{unit_number}} is {{fee}}, effective {{effective_date}}.

Assessments are due on the 1st of each month. Late payments will incur a fee of {{late_fee}} after the {{grace_period}}-day grace period.

Key budget highlights:
{{budget_highlights}}

The full budget is available for review at the management office or on the resident portal. If you have questions, please contact the Treasurer.

Payment due date for first new assessment: {{due_date}}

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "fiscal_year", "label": "Fiscal Year", "defaultValue": "2026"}, {"name": "fee", "label": "Monthly Assessment", "defaultValue": ""}, {"name": "effective_date", "label": "Effective Date", "defaultValue": ""}, {"name": "late_fee", "label": "Late Fee", "defaultValue": "$25"}, {"name": "grace_period", "label": "Grace Period (days)", "defaultValue": "15"}, {"name": "budget_highlights", "label": "Budget Highlights", "defaultValue": ""}, {"name": "due_date", "label": "First New Payment Due", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt6', 'Special Assessment Notice', 'notice', 'Notice of Special Assessment', 'Dear {{owner_name}},

At the {{meeting_type}} meeting held on {{meeting_date}}, the Board of Directors approved a special assessment for {{purpose}}.

Your share for unit {{unit_number}}: {{fee}}
Due date: {{due_date}}
Payment options: {{payment_options}}

Reason for the special assessment:
{{reason_details}}

The total project cost is {{total_cost}}, allocated based on {{allocation_method}}.

If you have questions or need to discuss payment arrangements, please contact the management office.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "fee", "label": "Your Assessment Amount", "defaultValue": ""}, {"name": "due_date", "label": "Due Date", "defaultValue": ""}, {"name": "purpose", "label": "Purpose", "defaultValue": ""}, {"name": "meeting_type", "label": "Meeting Type", "defaultValue": "Board"}, {"name": "meeting_date", "label": "Meeting Date", "defaultValue": ""}, {"name": "payment_options", "label": "Payment Options", "defaultValue": "Lump sum or 3 monthly installments"}, {"name": "reason_details", "label": "Detailed Reason", "defaultValue": ""}, {"name": "total_cost", "label": "Total Project Cost", "defaultValue": ""}, {"name": "allocation_method", "label": "Allocation Method", "defaultValue": "percentage of ownership interest"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt7', 'Assessment Increase Notice', 'notice', 'Notice of Assessment Increase — Effective {{effective_date}}', 'Dear {{owner_name}},

Pursuant to the approved {{fiscal_year}} budget, this letter serves as notice that your monthly assessment for unit {{unit_number}} will increase from {{current_fee}} to {{fee}}, effective {{effective_date}}.

The increase of {{increase_amount}} ({{increase_percent}}%) reflects rising costs in the following areas:
{{increase_reasons}}

The first payment at the new rate is due {{due_date}}. If you are enrolled in automatic payments, your payment will be updated automatically.

The approved budget is available for review on the resident portal.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "fiscal_year", "label": "Fiscal Year", "defaultValue": "2026"}, {"name": "current_fee", "label": "Current Monthly Fee", "defaultValue": ""}, {"name": "fee", "label": "New Monthly Fee", "defaultValue": ""}, {"name": "increase_amount", "label": "Increase Amount", "defaultValue": ""}, {"name": "increase_percent", "label": "Increase Percentage", "defaultValue": ""}, {"name": "effective_date", "label": "Effective Date", "defaultValue": ""}, {"name": "due_date", "label": "First New Payment Due", "defaultValue": ""}, {"name": "increase_reasons", "label": "Reasons for Increase", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt8', 'Annual Meeting Notice', 'notice', 'Notice of Annual Meeting — {{meeting_date}}', 'Dear {{owner_name}},

You are hereby notified that the Annual Meeting of the {{building_name}} will be held as follows:

Date: {{meeting_date}}
Time: {{meeting_time}}
Location: {{meeting_location}}

Agenda:
1. Call to order and verification of quorum
2. Approval of prior meeting minutes
3. Board of Directors election
4. Presentation of {{fiscal_year}} budget (assessment: {{fee}}/month)
5. Committee reports
6. Old business
7. New business
8. Owner forum
9. Adjournment

Proxy forms are enclosed for owners unable to attend. Proxies must be received by {{due_date}}.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "meeting_date", "label": "Meeting Date", "defaultValue": ""}, {"name": "meeting_time", "label": "Meeting Time", "defaultValue": "7:00 PM"}, {"name": "meeting_location", "label": "Location", "defaultValue": "Community Room"}, {"name": "fiscal_year", "label": "Budget Year", "defaultValue": "2026"}, {"name": "fee", "label": "Monthly Assessment", "defaultValue": ""}, {"name": "due_date", "label": "Proxy Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Secretary"}]'::jsonb),
    ('lt9', 'Special Meeting Notice', 'notice', 'Notice of Special Meeting — {{meeting_date}}', 'Dear {{owner_name}},

A Special Meeting of the {{building_name}} has been called and will be held as follows:

Date: {{meeting_date}}
Time: {{meeting_time}}
Location: {{meeting_location}}

Purpose: {{meeting_purpose}}

This meeting requires owner vote. The estimated financial impact is {{fee}} per unit.

Proxy forms are enclosed for owners unable to attend. Proxies must be received by {{due_date}}.

Your participation is important — a quorum is required to conduct business.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "meeting_date", "label": "Meeting Date", "defaultValue": ""}, {"name": "meeting_time", "label": "Meeting Time", "defaultValue": "7:00 PM"}, {"name": "meeting_location", "label": "Location", "defaultValue": "Community Room"}, {"name": "meeting_purpose", "label": "Purpose", "defaultValue": ""}, {"name": "fee", "label": "Estimated Cost Per Unit", "defaultValue": ""}, {"name": "due_date", "label": "Proxy Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Secretary"}]'::jsonb),
    ('lt10', 'Board Meeting Notice', 'notice', 'Notice of Board Meeting — {{meeting_date}}', 'Dear {{owner_name}},

The next regular meeting of the Board of Directors of {{building_name}} will be held:

Date: {{meeting_date}}
Time: {{meeting_time}}
Location: {{meeting_location}}

Owners are welcome to attend. An owner forum period will be provided for comments and questions.

Agenda items include review of financials (current assessment: {{fee}}/month), maintenance updates, and any new business.

If you have items you would like the Board to consider, please submit them in writing to the management office by {{due_date}}.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "meeting_date", "label": "Meeting Date", "defaultValue": ""}, {"name": "meeting_time", "label": "Meeting Time", "defaultValue": "7:00 PM"}, {"name": "meeting_location", "label": "Location", "defaultValue": "Community Room"}, {"name": "fee", "label": "Current Monthly Assessment", "defaultValue": ""}, {"name": "due_date", "label": "Agenda Submission Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Secretary"}]'::jsonb),
    ('lt11', 'Election — Call for Candidates', 'notice', 'Call for Board Candidates — {{election_year}} Election', 'Dear {{owner_name}},

The Board of Directors of {{building_name}} is seeking candidates for {{num_seats}} open board seat(s) for the {{election_year}} term.

Eligibility: All owners in good standing (current on assessments of {{fee}}/month) are eligible to serve.

To submit your candidacy:
- Complete the enclosed candidate form
- Submit a brief biography (250 words or less)
- Return to the management office by {{due_date}}

The election will be held at the Annual Meeting on {{election_date}}. Board service is a volunteer position with a term of {{term_length}}.

We encourage all interested owners to consider serving their community.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "election_year", "label": "Election Year", "defaultValue": "2026"}, {"name": "num_seats", "label": "Open Seats", "defaultValue": "2"}, {"name": "fee", "label": "Current Monthly Assessment", "defaultValue": ""}, {"name": "due_date", "label": "Candidacy Deadline", "defaultValue": ""}, {"name": "election_date", "label": "Election Date", "defaultValue": ""}, {"name": "term_length", "label": "Term Length", "defaultValue": "2 years"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Secretary"}]'::jsonb),
    ('lt12', 'Proxy / Ballot — Election', 'notice', 'Official Ballot & Proxy Form — {{election_year}} Board Election', 'Dear {{owner_name}},

Enclosed is your official ballot for the {{election_year}} Board of Directors election for {{building_name}}.

Unit: {{unit_number}}
Voting weight: {{voting_weight}}
Assessment status: {{fee}} (must be current to vote)

Candidates for {{num_seats}} open seat(s):
{{candidate_list}}

Voting instructions:
1. Mark your selections on the enclosed ballot
2. Place ballot in the inner sealed envelope
3. Sign the outer envelope
4. Return by {{due_date}} via mail or in person to the management office

If you cannot attend the Annual Meeting, you may designate a proxy using the enclosed proxy form.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "election_year", "label": "Election Year", "defaultValue": "2026"}, {"name": "num_seats", "label": "Open Seats", "defaultValue": "2"}, {"name": "fee", "label": "Current Assessment", "defaultValue": ""}, {"name": "voting_weight", "label": "Voting Weight", "defaultValue": "1 vote"}, {"name": "candidate_list", "label": "Candidate List", "defaultValue": ""}, {"name": "due_date", "label": "Ballot Return Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Secretary"}]'::jsonb),
    ('lt13', 'Insurance Certificate Request', 'general', 'Certificate of Insurance Required — Unit {{unit_number}}', 'Dear {{owner_name}},

As part of the association''s insurance compliance requirements, we need a current certificate of insurance for your unit ({{unit_number}}).

Required coverage:
- HO-6 / unit owner policy
- Minimum liability: {{min_liability}}
- Loss assessment coverage recommended: {{fee}}
- Association named as additional interested party

Please have your insurance agent send the certificate to the management office by {{due_date}}.

If your policy has recently renewed, please ensure an updated certificate is on file.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "min_liability", "label": "Minimum Liability", "defaultValue": "$300,000"}, {"name": "fee", "label": "Recommended Loss Assessment Coverage", "defaultValue": "$50,000"}, {"name": "due_date", "label": "Certificate Deadline", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt14', 'Architectural Review — Approval', 'general', 'Modification Request Approved — Unit {{unit_number}}', 'Dear {{owner_name}},

The Architectural Review Committee has reviewed your modification request for unit {{unit_number}} dated {{request_date}}.

Project: {{project_description}}
Status: APPROVED
Approval Date: {{approval_date}}

Conditions of approval:
{{conditions}}

Permit/deposit requirements:
- Refundable deposit: {{fee}} (due by {{due_date}})
- All work must be completed within {{completion_period}}
- Contractor must provide certificate of insurance
- Work hours: {{work_hours}}

Please schedule a pre-work inspection with the management office before beginning.

Sincerely,
{{sender_name}}
Architectural Review Committee', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "request_date", "label": "Request Date", "defaultValue": ""}, {"name": "project_description", "label": "Project Description", "defaultValue": ""}, {"name": "approval_date", "label": "Approval Date", "defaultValue": ""}, {"name": "conditions", "label": "Conditions", "defaultValue": "- Work must comply with all building codes\n- No structural modifications"}, {"name": "fee", "label": "Refundable Deposit", "defaultValue": "$500"}, {"name": "due_date", "label": "Deposit Due Date", "defaultValue": ""}, {"name": "completion_period", "label": "Completion Period", "defaultValue": "90 days"}, {"name": "work_hours", "label": "Permitted Work Hours", "defaultValue": "Mon-Fri 9AM-5PM"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt14b', 'Architectural Review — Denial', 'general', 'Modification Request Denied — Unit {{unit_number}}', 'Dear {{owner_name}},

The Architectural Review Committee has reviewed your modification request for unit {{unit_number}} dated {{request_date}}.

Project: {{project_description}}
Status: DENIED

Reason(s) for denial:
{{denial_reasons}}

You may resubmit a modified request addressing the concerns noted above. There is no additional fee for resubmission.

If you wish to appeal this decision, you may do so in writing to the Board of Directors within {{appeal_period}} days. The Board meets on {{due_date}}.

Sincerely,
{{sender_name}}
Architectural Review Committee', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "request_date", "label": "Request Date", "defaultValue": ""}, {"name": "project_description", "label": "Project Description", "defaultValue": ""}, {"name": "denial_reasons", "label": "Reasons for Denial", "defaultValue": ""}, {"name": "fee", "label": "Original Application Fee", "defaultValue": "$0"}, {"name": "appeal_period", "label": "Appeal Period (days)", "defaultValue": "30"}, {"name": "due_date", "label": "Next Board Meeting", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt3', 'Welcome Letter — New Owner', 'welcome', 'Welcome to {{building_name}}!', 'Dear {{owner_name}},

On behalf of the Board of Directors, welcome to {{building_name}}! We are pleased to have you as a member of our community.

Here is some important information:

- Monthly assessment: {{fee}} due on the 1st of each month
- First assessment due: {{due_date}}
- Resident portal: Access at {{portal_url}}
- Emergency maintenance line: {{emergency_phone}}
- Move-in coordinator: Contact the management office to schedule

Please review the attached house rules and resident handbook. If you have any questions, don''t hesitate to reach out.

Welcome home!

{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "fee", "label": "Monthly Assessment", "defaultValue": ""}, {"name": "due_date", "label": "First Assessment Due", "defaultValue": ""}, {"name": "portal_url", "label": "Portal URL", "defaultValue": ""}, {"name": "emergency_phone", "label": "Emergency Phone", "defaultValue": "202-555-9111"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt15', 'Move-In / Move-Out Instructions', 'general', 'Move-In/Move-Out Instructions — Unit {{unit_number}}', 'Dear {{owner_name}},

Thank you for notifying the association about your upcoming move at unit {{unit_number}}.

Move date: {{move_date}}
Move-in/out deposit: {{fee}} (refundable)
Deposit due by: {{due_date}}

Required steps:
1. Reserve the elevator: Contact management at least 7 days in advance
2. Pay the refundable move deposit of {{fee}}
3. Provide proof of insurance from your moving company
4. Moving hours: {{move_hours}}
5. Use designated entrance: {{designated_entrance}}
6. Protect all common area floors and walls during move

The deposit will be refunded within 14 days after inspection confirms no damage to common areas.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "move_date", "label": "Move Date", "defaultValue": ""}, {"name": "fee", "label": "Move Deposit", "defaultValue": "$250"}, {"name": "due_date", "label": "Deposit Due Date", "defaultValue": ""}, {"name": "move_hours", "label": "Permitted Move Hours", "defaultValue": "Mon-Fri 9AM-5PM, Sat 10AM-4PM"}, {"name": "designated_entrance", "label": "Designated Entrance", "defaultValue": "Service entrance / loading dock"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Property Manager"}]'::jsonb),
    ('lt16', 'Resale / Estoppel Certificate', 'general', 'Resale Certificate — Unit {{unit_number}}', 'Dear {{owner_name}},

Per your request, the following resale/estoppel information is provided for unit {{unit_number}} as of {{effective_date}}:

Assessment Information:
- Monthly assessment: {{fee}}
- Assessment due date: 1st of each month
- Next due date: {{due_date}}
- Outstanding balance: {{outstanding_balance}}
- Special assessments pending: {{special_assessments}}

Association Information:
- Reserve fund balance: {{reserve_balance}}
- Pending litigation: {{pending_litigation}}
- Planned capital improvements: {{capital_improvements}}

This certificate is valid for 30 days from the date of issuance. Processing fee: {{processing_fee}}.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "unit_number", "label": "Unit Number", "defaultValue": ""}, {"name": "effective_date", "label": "Effective Date", "defaultValue": ""}, {"name": "fee", "label": "Monthly Assessment", "defaultValue": ""}, {"name": "due_date", "label": "Next Assessment Due", "defaultValue": ""}, {"name": "outstanding_balance", "label": "Outstanding Balance", "defaultValue": "$0.00"}, {"name": "special_assessments", "label": "Special Assessments Pending", "defaultValue": "None"}, {"name": "reserve_balance", "label": "Reserve Fund Balance", "defaultValue": ""}, {"name": "pending_litigation", "label": "Pending Litigation", "defaultValue": "None"}, {"name": "capital_improvements", "label": "Capital Improvements", "defaultValue": "None planned"}, {"name": "processing_fee", "label": "Processing Fee", "defaultValue": "$100"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt4', 'Maintenance Notice — Scheduled Work', 'maintenance', 'Scheduled Maintenance — {{work_type}}', 'Dear {{owner_name}},

Please be advised that {{work_type}} has been scheduled for {{work_date}}.

Details:
- Scope: {{work_scope}}
- Duration: {{duration}}
- Areas affected: {{affected_areas}}
- Contractor: {{contractor_name}}
- Estimated cost: {{fee}} (included in regular assessments)

Action required by: {{due_date}}
{{additional_notes}}

We apologize for any inconvenience. Please contact the management office with questions.

{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": "Residents"}, {"name": "work_type", "label": "Work Type", "defaultValue": ""}, {"name": "work_date", "label": "Work Date", "defaultValue": ""}, {"name": "work_scope", "label": "Scope", "defaultValue": ""}, {"name": "duration", "label": "Duration", "defaultValue": ""}, {"name": "affected_areas", "label": "Affected Areas", "defaultValue": ""}, {"name": "contractor_name", "label": "Contractor", "defaultValue": ""}, {"name": "fee", "label": "Estimated Cost", "defaultValue": ""}, {"name": "due_date", "label": "Action Required By", "defaultValue": ""}, {"name": "additional_notes", "label": "Additional Notes", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Vice President"}]'::jsonb),
    ('lt17', 'Emergency Maintenance Alert', 'maintenance', 'URGENT: Emergency Maintenance — {{work_type}}', 'Dear {{owner_name}},

This is an urgent notice regarding emergency maintenance at {{building_name}}.

Issue: {{work_type}}
Discovered: {{discovered_date}}
Areas affected: {{affected_areas}}

Immediate actions:
{{immediate_actions}}

Estimated repair cost: {{fee}}
Expected completion: {{due_date}}
Contractor: {{contractor_name}}

If you experience any related issues in your unit, please contact the emergency line immediately at {{emergency_phone}}.

We will provide updates as the situation develops.

{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": "Residents"}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "work_type", "label": "Emergency Type", "defaultValue": ""}, {"name": "discovered_date", "label": "Date Discovered", "defaultValue": ""}, {"name": "affected_areas", "label": "Areas Affected", "defaultValue": ""}, {"name": "immediate_actions", "label": "Immediate Actions Required", "defaultValue": ""}, {"name": "fee", "label": "Estimated Repair Cost", "defaultValue": ""}, {"name": "due_date", "label": "Expected Completion", "defaultValue": ""}, {"name": "contractor_name", "label": "Contractor", "defaultValue": ""}, {"name": "emergency_phone", "label": "Emergency Phone", "defaultValue": "202-555-9111"}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt18', 'Policy Change Notice', 'notice', 'Notice of Policy Change — {{policy_name}}', 'Dear {{owner_name}},

The Board of Directors has approved changes to the association''s {{policy_name}}, effective {{effective_date}}.

Key changes:
{{change_summary}}

Financial impact: {{fee}} (if applicable)
Compliance required by: {{due_date}}

A copy of the updated policy is available on the resident portal and at the management office.

If you have questions or concerns, please submit them in writing to the Board or attend the next Board meeting on {{next_meeting_date}}.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "policy_name", "label": "Policy Name", "defaultValue": ""}, {"name": "effective_date", "label": "Effective Date", "defaultValue": ""}, {"name": "change_summary", "label": "Summary of Changes", "defaultValue": ""}, {"name": "fee", "label": "Financial Impact", "defaultValue": "N/A"}, {"name": "due_date", "label": "Compliance Date", "defaultValue": ""}, {"name": "next_meeting_date", "label": "Next Board Meeting", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb),
    ('lt19', 'Annual Disclosure / Financial Statement', 'notice', '{{fiscal_year}} Annual Financial Disclosure', 'Dear {{owner_name}},

Pursuant to the governing documents and applicable law, enclosed is the annual financial disclosure for {{building_name}} for fiscal year {{fiscal_year}}.

Financial Summary:
- Total revenue: {{total_revenue}}
- Total expenses: {{total_expenses}}
- Reserve fund balance: {{reserve_balance}}
- Current monthly assessment: {{fee}}
- Next assessment due: {{due_date}}

Key items:
{{financial_highlights}}

The complete audited financial statements are available for inspection at the management office during business hours. Owners may request a copy by contacting the management office.

Sincerely,
{{sender_name}}
Treasurer', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "fiscal_year", "label": "Fiscal Year", "defaultValue": "2025"}, {"name": "total_revenue", "label": "Total Revenue", "defaultValue": ""}, {"name": "total_expenses", "label": "Total Expenses", "defaultValue": ""}, {"name": "reserve_balance", "label": "Reserve Balance", "defaultValue": ""}, {"name": "fee", "label": "Current Monthly Assessment", "defaultValue": ""}, {"name": "due_date", "label": "Next Assessment Due", "defaultValue": ""}, {"name": "financial_highlights", "label": "Key Highlights", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}]'::jsonb),
    ('lt20', 'Board Resignation / Appointment Notice', 'notice', 'Board of Directors Update', 'Dear {{owner_name}},

The Board of Directors of {{building_name}} wishes to inform you of the following change:

{{change_type}}: {{member_name}} has {{change_details}} the position of {{position}}, effective {{effective_date}}.

{{replacement_info}}

The Board continues to serve the association and its {{total_units}} unit owners. Your current monthly assessment of {{fee}} remains unchanged. The next Board meeting is scheduled for {{due_date}}.

If you have questions, please contact the management office.

Sincerely,
{{sender_name}}
{{sender_title}}', '[{"name": "owner_name", "label": "Owner Name", "defaultValue": ""}, {"name": "building_name", "label": "Building Name", "defaultValue": "Sunny Acres Condominium"}, {"name": "change_type", "label": "Change Type", "defaultValue": "Resignation"}, {"name": "member_name", "label": "Member Name", "defaultValue": ""}, {"name": "change_details", "label": "Details", "defaultValue": "resigned from"}, {"name": "position", "label": "Position", "defaultValue": ""}, {"name": "effective_date", "label": "Effective Date", "defaultValue": ""}, {"name": "replacement_info", "label": "Replacement Info", "defaultValue": ""}, {"name": "total_units", "label": "Total Units", "defaultValue": "50"}, {"name": "fee", "label": "Current Assessment", "defaultValue": ""}, {"name": "due_date", "label": "Next Board Meeting", "defaultValue": ""}, {"name": "sender_name", "label": "Sender Name", "defaultValue": ""}, {"name": "sender_title", "label": "Sender Title", "defaultValue": "Board President"}]'::jsonb)
  ) as d(builtin_key, name, category, subject, body, variables)
  on conflict (tenant_id, builtin_key) where builtin_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function seed_letter_templates(uuid) from public;
grant execute on function seed_letter_templates(uuid) to service_role;

-- Each new building starts with the built-ins.
create or replace function seed_letter_templates_for_new_tenant()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform seed_letter_templates(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_letter_templates on tenants;
create trigger trg_seed_letter_templates
  after insert on tenants
  for each row execute function seed_letter_templates_for_new_tenant();

-- Every existing building that has no built-ins yet gets them; templates a board
-- wrote itself are left alone. A building that already holds built-ins is not
-- touched, so a built-in a board deleted does not come back on a re-run.
do $$
declare
  t record;
begin
  for t in
    select id from tenants tn
     where not exists (select 1 from letter_templates l where l.tenant_id = tn.id and l.builtin_key is not null)
  loop
    perform seed_letter_templates(t.id);
  end loop;
end;
$$;
