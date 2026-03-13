import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import {
  LayoutDashboard, Gavel, Building2, DollarSign, ClipboardList,
  MessageCircle, Archive, Home, ChevronDown, ChevronRight, Search,
} from 'lucide-react';

interface Tab {
  name: string;
  description: string;
}

interface HowTo {
  title: string;
  steps: string[];
}

interface GuideSection {
  id: string;
  title: string;
  icon: React.ElementType;
  route: string;
  summary: string;
  tabs: Tab[];
  howTos: HowTo[];
  tips: string[];
  access: string[];
}

const GUIDES: GuideSection[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    icon: LayoutDashboard,
    route: '/dashboard',
    summary: 'Your personalized home screen with key metrics, action items, and activity feed — tailored to your role so you see exactly what needs your attention.',
    tabs: [
      {
        name: 'Board Member View',
        description: 'See your Building Health Grade (A-F), Compliance Score, Collection Rate, Reserve Funding percentage, and open case count. Attention alert pills at the top highlight overdue filings, urgent cases, new resident requests, expiring insurance, past-due units (90+ days), and low reserves — click any pill to jump directly to that area.',
      },
      {
        name: 'Property Manager View',
        description: 'Operations-focused layout showing open Work Orders with total dollar amount pending, new resident Requests, Collection Rate, and delinquent unit count. Action items surface open requests, work orders, urgent cases, and expiring vendor contracts.',
      },
      {
        name: 'Resident View',
        description: 'Simplified view showing your Monthly Fee and due date, Account Status (Current or Past Due), unit balance, and open requests. Quick-action buttons let you make a payment, submit a request, view building info, or browse archives. Also shows upcoming meetings, building announcements, and management company contact info.',
      },
    ],
    howTos: [
      {
        title: 'Use attention alerts to prioritize your day',
        steps: [
          'Look at the colored alert pills below the header — each one flags something that needs action.',
          'Click an alert pill (e.g. "Overdue Filings" or "Insurance Expiring") to navigate directly to the relevant module.',
          'Resolve the item there, then return to the dashboard — the alert will clear automatically.',
        ],
      },
      {
        title: 'Work through your action items',
        steps: [
          'Scroll to the Action Items panel on the right side of the dashboard.',
          'Items are filtered to your role — board presidents see governance tasks, treasurers see financial items.',
          'Click any action item to jump directly to the relevant module and record.',
          'Complete the task in that module. The dashboard updates in real time.',
        ],
      },
      {
        title: 'Review financial health (Board Members)',
        steps: [
          'Check the Delinquency Aging table to see how many units are 0-30, 30-60, 60-90, or 90+ days past due.',
          'Review Budget Alerts to spot expense categories that are over or under budget.',
          'Click any metric or alert to open the full Fiscal Lens module for deeper analysis.',
        ],
      },
    ],
    tips: [
      'The dashboard refreshes automatically — check it at the start of each day to stay on top of your responsibilities.',
      'Every attention alert and action item is clickable and links directly to the source, so you can resolve issues without hunting through modules.',
      'The Building Health Grade combines Legal & Bylaws (35%), Insurance (35%), and Governance (30%) scores. Improving any of these areas raises your overall grade.',
    ],
    access: ['Board Member', 'Resident', 'Staff', 'Property Manager'],
  },
  {
    id: 'boardroom',
    title: 'Board Room',
    icon: Gavel,
    route: '/boardroom',
    summary: 'The central governance hub where board members and property managers manage compliance tasks, schedule meetings, conduct votes, send communications, and run daily operations.',
    tabs: [
      {
        name: 'Duties',
        description: 'Displays fiduciary duty checklists organized by category (Duty of Care, Duty of Loyalty, Duty of Obedience). Use the role filter dropdown to see duties assigned to a specific board position (President, Treasurer, Secretary, etc.). Expand each duty to see its workflow steps — check them off as you complete them. When all steps are checked, the duty is marked complete and your Health Score updates.',
      },
      {
        name: 'Runbook',
        description: 'Your compliance task tracker showing every governance requirement with its frequency (Annual, Quarterly, Monthly, As-needed), due date, responsible role, and completion status. The Runbook Health Index grades your overall compliance A through F. Filter by role to focus on your assigned items, and sort by date or category. Expand any item to see step-by-step instructions, attach documents, send related communications, create cases, or schedule meetings using the action menu.',
      },
      {
        name: 'Meetings',
        description: 'Schedule and manage board meetings of all types — Board, Annual, Quarterly, Special, and Emergency. Each meeting tracks its title, date, time, location, virtual link, agenda items, attendees, minutes, and attached documents. The system auto-sets voting requirements based on meeting type (Annual and Special meetings require owner votes by default). After a meeting, record minutes and track board approval.',
      },
      {
        name: 'Votes',
        description: 'Conduct board elections and vote on motions. Depending on the meeting type, votes may be scoped to board members only or to all owners. View active and past votes with results.',
      },
      {
        name: 'Communications',
        description: 'Send notices to your community through multiple channels. The Feed view shows all communications sent with subject, recipients, date, delivery channel status (Announcement, Email, Mail), and case linkage. The Templates view lets you create and manage reusable letter templates with merge variables like owner name, unit number, and balance due.',
      },
      {
        name: 'Daily Ops',
        description: 'Manage operational cases and workflows. Track ongoing issues, assign tasks to team members, and monitor resolution progress.',
      },
    ],
    howTos: [
      {
        title: 'Complete a Runbook compliance item',
        steps: [
          'Go to the Runbook tab and use the role filter to see items assigned to your position.',
          'Find the item you need to complete and click to expand it.',
          'Read through the workflow steps listed under the item description.',
          'Check off each step as you complete it — progress saves automatically.',
          'When all steps are checked, the item is marked complete and the Runbook Health Index updates.',
          'Use the action menu (right side) to attach supporting documents, send a related communication, create a case, or schedule a follow-up meeting.',
        ],
      },
      {
        title: 'Schedule a board meeting',
        steps: [
          'Go to the Meetings tab and click "+ Add Meeting."',
          'Enter a meeting title and select the type (Board, Annual, Quarterly, Special, or Emergency).',
          'Set the date, time (defaults to 7:00 PM), and location (defaults to "Community Room").',
          'Add a virtual meeting link if applicable.',
          'Enter agenda items — type each item on a new line.',
          'The system automatically sets whether a vote is required based on meeting type. Annual and Special meetings default to requiring an owner vote; you can toggle this if needed.',
          'Check "Send Notice" to email all building members about the meeting.',
          'Click Save. The meeting appears in the Upcoming list and on the Community Room meetings tab.',
        ],
      },
      {
        title: 'Record meeting minutes and get approval',
        steps: [
          'After the meeting, go to the Meetings tab and find the meeting in the list.',
          'Click the meeting to expand it, then click "Add Minutes."',
          'Type or paste the meeting minutes into the text area.',
          'Save the minutes. Board members will see an approval prompt.',
          'Once a majority of board members approve, the minutes show a green "Minutes approved" badge.',
          'Approved minutes are visible to all residents in the Community Room.',
        ],
      },
      {
        title: 'Send a communication to owners',
        steps: [
          'Go to the Communications tab and click "+ New Communication" to open the Compose Panel.',
          'Choose your scope: "Community" sends to all owners, "Unit" targets a specific owner.',
          'Select a pre-built template or choose to write a custom message.',
          'If you chose Unit scope, select the recipient unit from the dropdown — the owner\'s name, email, and address auto-populate.',
          'Choose your delivery channels: In-App Announcement (always on for community scope), Email, and/or Physical Mail.',
          'For physical mail, select the delivery method: First Class ($0.75/letter), Certified ($4.50), or Certified with Return Receipt ($7.50).',
          'Fill in the subject and body. If using a template, edit any merge variables (e.g. owner name, unit number, balance due) in the variables panel.',
          'Review the cost summary at the bottom, then click Send.',
        ],
      },
      {
        title: 'Create and use a communication template',
        steps: [
          'Go to Communications tab and switch to the Templates view.',
          'Click "Create Template" and enter a name.',
          'Select a category: Violation, Collection, Notice, Welcome, Maintenance, or General.',
          'Write your subject line and body text. Insert variables using double curly braces — e.g. {{owner_name}}, {{unit_number}}, {{balance_due}}.',
          'In the Variables section, click "Add Variable" for each placeholder. Set its name, display label, and default value.',
          'Save the template. It will now appear in the template picker when composing new communications.',
          'To use it, click "Use Template" — the Compose Panel opens with all fields pre-filled.',
        ],
      },
    ],
    tips: [
      'The Runbook refreshes compliance requirements based on your state annually — review it at the start of each fiscal year to see new or updated tasks.',
      'Use the action menu on Runbook items to keep everything connected — attach proof documents, send related notices, and link to cases all from the same task.',
      'For Annual and Special meetings, the system defaults to requiring an owner vote because most state laws require it. You can override this if your bylaws differ.',
      'Communication templates with merge variables save significant time for recurring notices like collection letters or violation warnings.',
      'Physical mail is sent through USPS via the platform — you can track delivery status in the Communications Feed.',
    ],
    access: ['Board Member', 'Property Manager'],
  },
  {
    id: 'building',
    title: 'The Building',
    icon: Building2,
    route: '/building',
    summary: 'Your building\'s master record — store property details, manage contacts, track legal documents and insurance policies, maintain your vendor directory, and monitor building health.',
    tabs: [
      {
        name: 'Details',
        description: 'Property specifications including address, building name, unit count, year built, total square footage, and management company info. The Building Health Grade (A-F) is displayed prominently with a breakdown of the three scoring components: Legal & Bylaws (35%), Insurance (35%), and Governance (30%).',
      },
      {
        name: 'Contacts',
        description: 'Directory of your board of directors (with positions and contact info), property management company representatives, and legal counsel. Keeps everyone\'s contact information in one accessible place.',
      },
      {
        name: 'The Units',
        description: 'Full inventory of residential units showing unit numbers, owner names, occupancy status, and key details. Board members and property managers can view all units; residents see only their own.',
      },
      {
        name: 'Legal & Bylaws',
        description: 'Store all governing documents (Master Deed, Bylaws, Rules & Regulations, CC&Rs, amendments) with version control. Each document has a status — Current, Outdated, or Missing — that feeds directly into your Building Health Score. Upload PDFs and track adoption dates.',
      },
      {
        name: 'Insurance',
        description: 'Track all insurance policies by type (General Liability, Property, Directors & Officers, etc.) with policy numbers, provider names, coverage amounts, and expiration dates. The system automatically alerts you when a policy is within 90 days of expiring. Active vs. expired status feeds into your Building Health Score.',
      },
      {
        name: 'Vendors',
        description: 'Service provider directory listing vendor names, service types (HVAC, Plumbing, Security, Landscaping, etc.), contact person, email, phone, contract dates, annual cost, and active/inactive status. Alerts when contracts are nearing expiration.',
      },
      {
        name: 'PM Scorecard',
        description: 'Board members rate and review property manager performance across key metrics. Only visible to board members.',
      },
      {
        name: 'Mailing',
        description: 'Configure email distribution settings for building-wide communications. Board members only.',
      },
    ],
    howTos: [
      {
        title: 'Add or update a legal document',
        steps: [
          'Go to the Legal & Bylaws tab and click "Add Document."',
          'Enter the document name (e.g. "Bylaws," "Master Deed," "Rules & Regulations").',
          'Set the status to Current, Outdated, or Missing.',
          'Enter the adoption or last-review date.',
          'Upload the PDF or image file of the document.',
          'Add any notes (e.g. "Amended in 2024 to update pet policy").',
          'Click Save. The document appears in the list and your Legal & Bylaws health score updates.',
          'To update later, click the document card and choose Edit to change the status or upload a new version.',
        ],
      },
      {
        title: 'Track an insurance policy',
        steps: [
          'Go to the Insurance tab and click "Add Policy."',
          'Select the policy type from the dropdown (General Liability, Property, Directors & Officers, etc.).',
          'Enter the policy number, provider/carrier name, and coverage amount.',
          'Set the expiration date — the system will alert you automatically when it\'s within 90 days.',
          'Upload the certificate of insurance or declarations page.',
          'Click Save. The policy appears in your list with an Active or Expired badge.',
          'When a policy renews, edit the existing entry to update the expiration date and upload the new certificate.',
        ],
      },
      {
        title: 'Manage your vendor directory',
        steps: [
          'Go to the Vendors tab and click "Add Vendor."',
          'Enter the vendor name, service type, contact person, email, and phone number.',
          'Set the status to Active or Inactive.',
          'Enter contract start and end dates (MM-DD-YYYY format) and annual cost.',
          'Add any notes about the scope of work or contract terms.',
          'Click Save. The vendor appears in your directory.',
          'The system flags vendors whose contracts are expiring within 90 days so you can plan renewals.',
        ],
      },
      {
        title: 'Improve your Building Health Grade',
        steps: [
          'Check your current grade and score breakdown on the Details tab.',
          'For Legal & Bylaws (35% of score): make sure all governing documents are uploaded and marked "Current" — every document marked "Missing" or "Outdated" lowers the score.',
          'For Insurance (35% of score): ensure all policies are active and not expired. Upload current certificates for every required policy type.',
          'For Governance (30% of score): the system checks that you have at least 3 board members, a management company on file, legal counsel listed, and 3 or more active vendors.',
          'Address the lowest-scoring category first for the biggest grade improvement.',
        ],
      },
    ],
    tips: [
      'The Building Health Grade is visible on your dashboard — keeping it high demonstrates strong governance to residents and auditors.',
      'Set a calendar reminder to review Insurance and Vendor tabs quarterly so nothing lapses.',
      'Upload the full document (not just a summary) to Legal & Bylaws — residents and property managers reference these for governance questions.',
      'When a vendor contract expires, update the status to Inactive rather than deleting it. This preserves your vendor history.',
    ],
    access: ['Board Member', 'Property Manager', 'Staff'],
  },
  {
    id: 'fiscal-lens',
    title: 'Fiscal Lens',
    icon: DollarSign,
    route: '/financial',
    summary: 'Full-featured financial management with double-entry accounting, budget planning, reserve fund tracking, work order management, and board-ready reporting.',
    tabs: [
      {
        name: 'Dashboard',
        description: 'At-a-glance financial health showing Operating Cash, Collection Rate, Budget Used percentage, Reserve Funded percentage, and total Receivables. Includes income metrics (monthly expected vs. collected), budget variance highlights, reserve schedule overview, and balance sheet and income statement summaries.',
      },
      {
        name: 'Chart of Accounts',
        description: 'Your GL account structure listing every account with its type, number, and current balance. This is the foundation of your financial records — accounts are organized by type (Assets, Liabilities, Equity, Revenue, Expenses).',
      },
      {
        name: 'General Ledger',
        description: 'Chronological journal of every financial transaction with date, description, debit and credit entries, account affected, category, and reconciliation status. Filter by date range, account, or category. Supports manual journal entries that must balance (debits equal credits).',
      },
      {
        name: 'WO & Invoices',
        description: 'Create and track work orders for maintenance and capital projects. Each work order links to a vendor and tracks the title, description, amount, invoice number, and status (Open, Paid, Disputed, Paid-Pending).',
      },
      {
        name: 'Budget',
        description: 'Plan annual budgets by expense category and monitor actual spending against the plan throughout the year. Each category shows the budgeted amount, YTD actual, percentage used, and variance — color-coded green (under 75%), yellow (75-100%), or red (over budget).',
      },
      {
        name: 'Reserves',
        description: 'Track reserve fund components (Roof, HVAC, Windows, Elevator, etc.) with each item\'s estimated remaining life, estimated replacement cost, current funding, funded percentage, and status (On Track, Underfunded, or Overfunded). Record annual contributions and monitor reserve study compliance.',
      },
      {
        name: 'Spending Decisions',
        description: 'Approval workflow for purchases that exceed defined spending thresholds. Submit spending requests, review pending approvals, and track decision history.',
      },
      {
        name: 'Reports',
        description: 'Generate six types of board-ready reports: Board Packets, Financial Statements, Delinquency Reports, Compliance Summaries, Meeting Minutes, and Annual Reports. Reports pull live data from across the platform.',
      },
    ],
    howTos: [
      {
        title: 'Record a manual journal entry',
        steps: [
          'Go to the General Ledger tab.',
          'Click "Add Transaction" to open the journal entry form.',
          'Enter the date and a description of the transaction.',
          'Add debit entries — select the account and enter the amount for each line.',
          'Add credit entries — select the account and enter the amount for each line.',
          'Verify the total debits equal total credits (the system enforces this before saving).',
          'Click Save. The entry appears in the ledger and account balances update immediately.',
        ],
      },
      {
        title: 'Create and track a work order',
        steps: [
          'Go to the WO & Invoices tab and click "New Work Order."',
          'Enter a title describing the work (e.g. "Lobby tile replacement").',
          'Select the vendor from the dropdown (vendors must be added in The Building module first).',
          'Add a description of the scope of work and the total amount.',
          'Click Save. The work order is created with an Open status.',
          'When the vendor completes the work and submits an invoice, edit the work order to add the invoice number.',
          'Update the status: mark as Paid when payment is made, Paid-Pending if awaiting board approval, or Disputed if there\'s a billing issue.',
        ],
      },
      {
        title: 'Set up and monitor your annual budget',
        steps: [
          'Go to the Budget tab.',
          'For each expense category, enter the budgeted amount for the year.',
          'Save your budget.',
          'Throughout the year, return to the Budget tab to see actual spending vs. plan.',
          'Watch the variance column: green means under 75% spent, yellow means 75-100%, red means over budget.',
          'Click any category to see the individual transactions driving that category\'s spending.',
        ],
      },
      {
        title: 'Track reserve fund components',
        steps: [
          'Go to the Reserves tab.',
          'Click "Add Reserve Item" for each capital component (e.g. Roof, HVAC, Elevator, Parking Lot).',
          'Enter the component name, description, estimated replacement cost, useful life in years, and the date it was last replaced.',
          'The system calculates the annual contribution needed and shows funded percentage.',
          'Record annual contributions as they\'re made to update the funded amount.',
          'Review the status column: On Track means adequately funded, Underfunded needs attention, Overfunded means you can reallocate.',
        ],
      },
      {
        title: 'Generate a board packet',
        steps: [
          'Go to the Reports tab.',
          'Select "Board Packets" from the report type list.',
          'Choose the reporting period (month, quarter, or custom date range).',
          'The report compiles financial statements, budget variance, delinquency data, compliance status, and recent meeting minutes into one document.',
          'Review the generated report, then download or share it with board members before the next meeting.',
        ],
      },
    ],
    tips: [
      'The General Ledger enforces double-entry accounting — every transaction must balance. This ensures your books are always accurate.',
      'Review the Budget tab monthly so you catch overspending before it becomes a problem.',
      'Reserve fund tracking helps you plan for major capital expenses years in advance. Underfunded reserves are a common audit finding — use the Reserves tab to stay ahead.',
      'The Reports tab saves hours of manual preparation. Generate Board Packets before each meeting so every board member has the latest financial picture.',
      'Link work orders to vendors in your Building module directory. This creates a complete audit trail from vendor selection through payment.',
    ],
    access: ['Board Member', 'Property Manager'],
  },
  {
    id: 'property-log',
    title: 'Property Log',
    icon: ClipboardList,
    route: '/property-log',
    summary: 'Document building inspections, walkthroughs, incidents, and maintenance checks. Record findings with condition ratings, assign action items with due dates, and track resolution.',
    tabs: [
      {
        name: 'Log List',
        description: 'All log entries displayed as expandable cards. Filter by type (Walkthrough, Inspection, Incident, Maintenance Check) and status (Open, Resolved, Monitoring). Header stats show total logs, open items, pending action items, and last walkthrough date.',
      },
    ],
    howTos: [
      {
        title: 'Record a building inspection or walkthrough',
        steps: [
          'Click "+ New Log" at the top of the page.',
          'Enter a title (e.g. "March Monthly Walkthrough" or "Fire Safety Inspection").',
          'Select the type: Walkthrough, Inspection, Incident, or Maintenance Check.',
          'Set the date the inspection was conducted and who conducted it.',
          'Enter the location or areas inspected.',
          'Under Findings, click "Add Finding" to add rows. For each finding, enter the area (e.g. "Lobby," "Stairwell B," "Unit 301"), select a condition (Good, Fair, or Poor), describe what you observed, and set a severity (None, Low, Medium, or High).',
          'Under Action Items, click "Add Action Item" for anything that needs follow-up. Enter what needs to be done, who it\'s assigned to, the due date, and set the status to Open.',
          'Add any overall notes at the bottom.',
          'Click Save. The log entry appears in the list.',
        ],
      },
      {
        title: 'Track and resolve action items',
        steps: [
          'Find the log entry in the list and click to expand it.',
          'Scroll to the Action Items table — each item shows a checkbox, description, assigned person, due date, and status.',
          'Click the checkbox next to an action item to toggle it between Open and Done. This updates inline without opening an edit form.',
          'Overdue items (past due date and still Open) display a red "OVERDUE" badge so they\'re easy to spot.',
          'Completed items turn green with a strikethrough to visually separate them from open work.',
          'When all action items are Done, consider editing the log to change its status from Open to Resolved.',
        ],
      },
      {
        title: 'Edit or update an existing log',
        steps: [
          'Expand the log entry and click "Edit."',
          'You can update any field — add new findings, change conditions, add or remove action items, and update the overall status.',
          'The Status field (Open, Monitoring, Resolved) is available in edit mode. Set it to Monitoring for ongoing issues or Resolved when everything is addressed.',
          'Click Save to apply changes.',
        ],
      },
    ],
    tips: [
      'Perform walkthroughs on a regular schedule (monthly is ideal) and always create a log entry. Consistent documentation protects the board and provides evidence for insurance claims.',
      'Use severity levels meaningfully: "High" for safety hazards or code violations, "Medium" for issues that need attention within weeks, "Low" for cosmetic or minor items.',
      'The header stats show "Action Items Pending" — check this number regularly to make sure nothing is falling through the cracks.',
      'When you conduct a follow-up inspection on a previous finding, reference the original log in your notes to maintain a clear paper trail.',
    ],
    access: ['Board Member', 'Property Manager', 'Staff'],
  },
  {
    id: 'community',
    title: 'Community Room',
    icon: MessageCircle,
    route: '/community',
    summary: 'The resident-facing portal where everyone stays informed and connected. Read announcements, submit and upvote requests, view meeting schedules and minutes, vote on elections, and reserve amenities.',
    tabs: [
      {
        name: 'Announcements',
        description: 'Building-wide notices sorted by date with pinned announcements at the top. Each post shows a category badge (General, Maintenance, Financial, Safety, Rules & Policies, or Meeting), the title and full text, who posted it, and the date. Board members can post new announcements and optionally send them via email to all residents.',
      },
      {
        name: 'Requests',
        description: 'Submit requests and track their progress. Your own requests appear in "My Requests" with status tracking (Submitted, In Progress, Resolved, Closed) and SLA indicators showing when a response is due. Community Requests shows other residents\' open submissions, which you can upvote to help prioritize issues. Board members and property managers see and respond to all requests.',
      },
      {
        name: 'Meetings',
        description: 'View upcoming and past meetings with type badges (Board, Annual, Quarterly, Special, Emergency), status, date, time, location, and virtual links. Expand any meeting to see the agenda, recorded minutes (with approval status), and attached documents.',
      },
      {
        name: 'Votes & Resolutions',
        description: 'Participate in active elections and vote on community motions. View past voting results.',
      },
      {
        name: 'Amenities',
        description: 'Reserve shared building amenities (Conference Room, Party Room, Gym, etc.). View the reservation calendar, submit booking requests, and track approval status. Board members approve or deny pending reservations. Available when your building\'s subscription includes amenity management.',
      },
    ],
    howTos: [
      {
        title: 'Submit a request (Residents)',
        steps: [
          'Go to the Requests tab and click "+ New Request."',
          'Select a category that best describes your issue: Maintenance Request, Noise Complaint, Common Area Issue, Parking Issue, Safety Concern, Resale Certificate Request, Records Inspection Request, Architectural Modification Request, General Question, or Other.',
          'Enter a clear title summarizing the issue.',
          'Write a detailed description — the more detail you provide, the faster the board or management can address it.',
          'Select a priority: High (urgent, needs immediate attention), Medium (normal request), or Low (when convenient).',
          'Click Submit. Your request appears in "My Requests" with a Submitted status.',
          'The system tracks an SLA timer — you\'ll see when a response is due, and a warning if the deadline is approaching.',
          'Check back for responses in the expandable detail view. You\'ll see replies from the board or management team.',
        ],
      },
      {
        title: 'Upvote a community request (Residents)',
        steps: [
          'Scroll to the "Community Requests" section to see requests submitted by other residents.',
          'Click the upvote button (chevron up icon) on any request you want to support.',
          'Your upvote is highlighted and the count increases. Higher-voted requests help the board prioritize common issues.',
          'You can remove your upvote by clicking the button again.',
        ],
      },
      {
        title: 'Post an announcement (Board Members)',
        steps: [
          'Go to the Announcements tab and click "+ New Announcement."',
          'Enter a title and select a category (General, Maintenance, Financial, Safety, Rules & Policies, or Meeting).',
          'Write the announcement message.',
          'Check "Pin" to keep it at the top of the announcements list.',
          'Check "Also send via email" to email the announcement to all active building members.',
          'Click Save. The announcement is immediately visible in the Community Room.',
        ],
      },
      {
        title: 'View meeting details and minutes',
        steps: [
          'Go to the Meetings tab to see upcoming and past meetings.',
          'Click any meeting to expand its details.',
          'View the Agenda section to see numbered discussion items.',
          'If minutes have been recorded, they appear in the Minutes section. A green badge means minutes are board-approved; yellow means approval is pending.',
          'Check the Documents section for any attached files (handouts, presentations, reports).',
        ],
      },
    ],
    tips: [
      'Choose the most specific request category you can — "Maintenance Request" gets routed differently than "Safety Concern," and using the right category speeds up response time.',
      'The SLA timer on requests reflects your building\'s response commitment. If a request shows "OVERDUE," it means a response is past due.',
      'Upvoting community requests is a powerful way to surface shared concerns to the board without submitting duplicate requests.',
      'Check the Announcements tab regularly — pinned posts at the top contain the most important current information.',
      'Meeting minutes marked as "approved" are the official record. Reference them if you have questions about board decisions.',
    ],
    access: ['Board Member', 'Resident', 'Staff', 'Property Manager'],
  },
  {
    id: 'archives',
    title: 'The Archives',
    icon: Archive,
    route: '/archives',
    summary: 'A read-only historical repository organized by fiscal year. Preserves point-in-time snapshots of your building\'s compliance, filings, meetings, communications, finances, insurance, legal documents, and board composition.',
    tabs: [
      {
        name: 'Overview',
        description: 'Summary snapshot of the selected fiscal year showing key metrics and highlights across all archive sections.',
      },
      {
        name: 'Compliance',
        description: 'Runbook completion status as it stood at the end of the fiscal year. Shows which compliance tasks were completed and which were outstanding.',
      },
      {
        name: 'Regulatory Refresh',
        description: 'State-specific regulatory requirements that were in effect during the fiscal year.',
      },
      {
        name: 'Filings',
        description: 'All filings completed during the period — annual reports, tax returns, state registrations, and other regulatory submissions.',
      },
      {
        name: 'Meetings',
        description: 'Index of all meetings held during the fiscal year with dates, types, agendas, and approved minutes.',
      },
      {
        name: 'Communications',
        description: 'Log of all communications sent during the period with subjects, recipients, channels, and delivery status.',
      },
      {
        name: 'Fiscal Snapshot',
        description: 'Financial summary for the fiscal year including balance sheet, income statement, budget variance, reserve fund status, and collection rates.',
      },
      {
        name: 'Insurance',
        description: 'Insurance policies that were in effect during the period with carrier, coverage, and expiration details.',
      },
      {
        name: 'Legal Docs',
        description: 'Governing documents as they existed during the fiscal year, including any amendments adopted.',
      },
      {
        name: 'Board',
        description: 'Board composition during the fiscal year — who served, their positions, and term dates.',
      },
    ],
    howTos: [
      {
        title: 'Browse archived records',
        steps: [
          'Use the fiscal year dropdown at the top to select the period you want to review.',
          'You can also use the preset shortcuts: This Month, Last Month, Current FY, or Last FY.',
          'Click any section in the left navigation (Overview, Compliance, Meetings, etc.) to view that category\'s snapshot.',
          'All data is read-only — Archives preserve the historical record exactly as it was.',
        ],
      },
      {
        title: 'Prepare for an audit or annual report',
        steps: [
          'Select the fiscal year being audited from the dropdown.',
          'Start with the Overview section for a high-level summary.',
          'Check Compliance for the runbook completion record.',
          'Review Fiscal Snapshot for the financial summary — this is typically what auditors request first.',
          'Check Filings to confirm all required submissions were completed.',
          'Review Insurance for proof of coverage during the period.',
          'Use Meetings to provide minutes as supporting documentation.',
        ],
      },
    ],
    tips: [
      'Archives automatically preserve records at fiscal year end — you don\'t need to manually create snapshots.',
      'Reference prior years when preparing annual reports, responding to audits, or resolving disputes about past decisions.',
      'The Fiscal Snapshot is especially useful for year-over-year financial comparisons.',
      'If a resident or owner requests historical records, you can direct them to the relevant archive period and section.',
    ],
    access: ['Board Member', 'Property Manager'],
  },
  {
    id: 'my-unit',
    title: 'My Unit',
    icon: Home,
    route: '/my-unit',
    summary: 'Your personal unit portal for viewing your balance, making payments, setting up autopay, tracking payment history, and managing your unit profile. If you own multiple units, switch between them from one screen.',
    tabs: [
      {
        name: 'Unit Overview',
        description: 'Shows your unit number, owner name, status (Active, Delinquent, For Sale, Under Contract, Transfer Pending), and contact info. A prominent balance display shows your total amount owed — green if current, red if past due. The metrics grid breaks down your monthly fee, YTD payments, current balance, late fees, and any special assessments.',
      },
      {
        name: 'Payments',
        description: 'View your current balance breakdown (monthly assessment, past due balance, late fees, special assessments) with a Pay Now button for one-time payments. Set up AutoPay for recurring monthly payments through Stripe. Track special assessments and late fees individually with per-item payment buttons. View your complete payment history showing date, amount, method (Stripe, Manual, Check), and notes.',
      },
    ],
    howTos: [
      {
        title: 'Link your unit (first time setup)',
        steps: [
          'When you first visit My Unit, you\'ll see a prompt to link your unit.',
          'Click "+ Link Unit" to see a list of available units in your building.',
          'Find your unit and click "Link as Primary" — this sets you as the primary owner and auto-populates your name, email, and phone from your account.',
          'If you co-own a unit, click "Link as Co-owner" instead — this links the unit without changing the primary contact.',
          'If you own multiple units, repeat the process for each one. You can switch between them using the unit selector buttons.',
        ],
      },
      {
        title: 'Make a one-time payment',
        steps: [
          'View your current balance breakdown in the Payments section.',
          'Click the "Pay Now" button next to the balance summary.',
          'You\'ll be redirected to a secure Stripe Checkout page.',
          'Enter your payment details (card number, expiration, CVC).',
          'Complete the payment. You\'re redirected back to My Unit and the balance updates.',
          'The payment appears in your Payment History with the date, amount, and "Stripe" as the method.',
        ],
      },
      {
        title: 'Set up AutoPay for monthly assessments',
        steps: [
          'In the Payments section, find the Recurring Monthly Payment area.',
          'Click "Set Up AutoPay."',
          'Review the confirmation modal showing your monthly amount and billing date.',
          'Click "Continue to Stripe" — you\'ll be taken to Stripe to enter your payment method.',
          'Once enrolled, you\'ll see an "AutoPay Enrolled" badge with your monthly amount and billing date.',
          'Your card is automatically charged each month on the due date. No further action is needed.',
        ],
      },
      {
        title: 'Manage or cancel AutoPay',
        steps: [
          'If you\'re enrolled in AutoPay, you\'ll see a "Manage Billing" link — click it to open the Stripe Customer Portal where you can update your card or billing details.',
          'To cancel, click the "Cancel" button next to your AutoPay enrollment.',
          'Confirm the cancellation in the dialog. Your card will no longer be charged automatically.',
          'You can re-enroll at any time by clicking "Set Up AutoPay" again.',
        ],
      },
      {
        title: 'Pay a special assessment or late fee',
        steps: [
          'If you have outstanding special assessments or late fees, they appear in their own sections below the main balance.',
          'Each item shows the reason (e.g. "Roof Replacement" or "Late Payment Fee"), the date, and the amount.',
          'Click the "Pay" button next to the specific item to pay it individually through Stripe.',
          'Completed assessments move to a "Completed" section with a checkmark, paid amount, and paid date.',
        ],
      },
    ],
    tips: [
      'Setting up AutoPay is the easiest way to avoid late fees — your payment is automatically processed on the due date each month.',
      'All payments are processed securely through Stripe. The platform never stores your card details directly.',
      'If you own multiple units, link all of them so you can manage payments and view balances in one place using the unit selector.',
      'Keep your contact information (email and phone) up to date so you receive all building communications and payment confirmations.',
      'Your payment history shows the last 8 transactions. If you need older records, check The Archives for historical fiscal snapshots.',
    ],
    access: ['Resident', 'Board Member'],
  },
];

export default function HowItWorksPage() {
  const navigate = useNavigate();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = GUIDES.filter(g => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      g.title.toLowerCase().includes(q) ||
      g.summary.toLowerCase().includes(q) ||
      g.tabs.some(t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) ||
      g.howTos.some(h => h.title.toLowerCase().includes(q) || h.steps.some(s => s.toLowerCase().includes(q))) ||
      g.tips.some(t => t.toLowerCase().includes(q))
    );
  });

  const toggle = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold text-ink-900 mb-1">How This Works</h2>
        <p className="text-sm text-ink-500">
          Learn how to use each module in ONE two HOA GovOps. Click any section below to see what each tab does, step-by-step walkthroughs, and tips.
        </p>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
        <input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search guides... (e.g. &quot;autopay&quot;, &quot;insurance&quot;, &quot;meeting minutes&quot;)"
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-ink-200 rounded-lg text-sm text-ink-800 outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20"
        />
      </div>

      {/* Guide cards */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-sm text-ink-400">
            No guides match your search. Try a different term.
          </div>
        ) : (
          filtered.map(guide => {
            const Icon = guide.icon;
            const isOpen = expandedId === guide.id;
            return (
              <div
                key={guide.id}
                className="bg-white border border-ink-200 rounded-xl overflow-hidden"
              >
                {/* Header */}
                <button
                  onClick={() => toggle(guide.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-mist-25 transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-mist-50 border border-ink-100 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-ink-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink-900">{guide.title}</div>
                    <div className="text-xs text-ink-500 line-clamp-1">{guide.summary}</div>
                  </div>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-ink-400 flex-shrink-0" />
                  )}
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-4 pb-4 border-t border-ink-100">
                    <ModuleIllustration moduleId={guide.id} />
                    <p className="text-sm text-ink-600 mt-3 mb-4">{guide.summary}</p>

                    {/* Tabs / Sections */}
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                        What You'll Find
                      </h4>
                      <div className="space-y-2">
                        {guide.tabs.map((tab, i) => (
                          <div key={i} className="bg-mist-25 border border-ink-100 rounded-lg px-3 py-2.5">
                            <div className="text-[13px] font-semibold text-ink-800 mb-0.5">{tab.name}</div>
                            <div className="text-[12.5px] text-ink-500 leading-relaxed">{tab.description}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* How-To walkthroughs */}
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">
                        Step-by-Step Walkthroughs
                      </h4>
                      <div className="space-y-3">
                        {guide.howTos.map((howTo, i) => (
                          <HowToCard key={i} howTo={howTo} />
                        ))}
                      </div>
                    </div>

                    {/* Tips */}
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-ink-700 uppercase tracking-wider mb-2">Tips</h4>
                      <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                        <ul className="space-y-1.5">
                          {guide.tips.map((tip, i) => (
                            <li key={i} className="text-[13px] text-amber-800 leading-relaxed flex gap-2">
                              <span className="text-amber-400 mt-0.5 flex-shrink-0">*</span>
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Access + navigate */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] text-ink-400 font-medium">Access:</span>
                        {guide.access.map(role => (
                          <span
                            key={role}
                            className="text-[11px] px-1.5 py-0.5 bg-mist-50 border border-ink-100 rounded text-ink-500"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => navigate(guide.route)}
                        className="text-xs font-medium text-accent-600 hover:text-accent-700 hover:underline transition-colors"
                      >
                        Go to {guide.title} &rarr;
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* Module illustration — stylized SVG diagram for each module */
function ModuleIllustration({ moduleId }: { moduleId: string }) {
  const svgs: Record<string, React.ReactNode> = {
    /* ── Dashboard ── KPI cards, grade circle, bar chart */
    dashboard: (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Grade circle */}
        <circle cx="60" cy="75" r="38" fill="#dceef6" stroke="#3b8dba" strokeWidth="3" />
        <circle cx="60" cy="75" r="28" fill="white" stroke="#b9dcee" strokeWidth="2" />
        <text x="60" y="82" textAnchor="middle" fill="#1a1f25" fontSize="22" fontWeight="700" fontFamily="system-ui">A</text>
        <text x="60" y="122" textAnchor="middle" fill="#929daa" fontSize="9" fontFamily="system-ui">Health Grade</text>
        {/* KPI cards */}
        {[
          { x: 125, label: 'Collection', value: '94%', color: '#659a65' },
          { x: 230, label: 'Budget Used', value: '67%', color: '#3b8dba' },
          { x: 335, label: 'Reserves', value: '82%', color: '#3b8dba' },
          { x: 440, label: 'Open Cases', value: '3', color: '#e53e3e' },
        ].map((kpi) => (
          <g key={kpi.x}>
            <rect x={kpi.x} y="30" width="90" height="60" rx="8" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
            <text x={kpi.x + 45} y="58" textAnchor="middle" fill={kpi.color} fontSize="18" fontWeight="700" fontFamily="system-ui">{kpi.value}</text>
            <text x={kpi.x + 45} y="76" textAnchor="middle" fill="#929daa" fontSize="8.5" fontFamily="system-ui">{kpi.label}</text>
          </g>
        ))}
        {/* Activity feed lines */}
        <rect x="125" y="104" width="180" height="6" rx="3" fill="#eef0f2" />
        <rect x="125" y="116" width="140" height="6" rx="3" fill="#eef0f2" />
        <rect x="125" y="128" width="160" height="6" rx="3" fill="#eef0f2" />
        <text x="125" y="100" fill="#929daa" fontSize="8" fontFamily="system-ui">Recent Activity</text>
        {/* Alert pills */}
        <rect x="335" y="100" width="70" height="18" rx="9" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1" />
        <text x="370" y="112.5" textAnchor="middle" fill="#92400e" fontSize="7.5" fontWeight="600" fontFamily="system-ui">2 Overdue</text>
        <rect x="415" y="100" width="80" height="18" rx="9" fill="#fde3e3" stroke="#e53e3e" strokeWidth="1" />
        <text x="455" y="112.5" textAnchor="middle" fill="#b91c1c" fontSize="7.5" fontWeight="600" fontFamily="system-ui">1 Urgent Case</text>
        <rect x="335" y="124" width="86" height="18" rx="9" fill="#dceef6" stroke="#3b8dba" strokeWidth="1" />
        <text x="378" y="136.5" textAnchor="middle" fill="#255d7e" fontSize="7.5" fontWeight="600" fontFamily="system-ui">Ins. Expiring</text>
      </svg>
    ),

    /* ── Board Room ── Runbook checklist, calendar, send icon */
    boardroom: (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Runbook checklist */}
        <rect x="20" y="15" width="170" height="120" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="36" y="36" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Compliance Runbook</text>
        <rect x="36" y="42" width="60" height="12" rx="6" fill="#d1fae5" />
        <text x="66" y="51" textAnchor="middle" fill="#065f46" fontSize="7" fontWeight="600" fontFamily="system-ui">A — 92%</text>
        {/* Checked items */}
        {[
          { y: 64, text: 'File annual report', done: true },
          { y: 82, text: 'Review insurance', done: true },
          { y: 100, text: 'Update bylaws', done: false },
          { y: 118, text: 'Schedule election', done: false },
        ].map((item) => (
          <g key={item.y}>
            <rect x="36" y={item.y} width="12" height="12" rx="3" fill={item.done ? '#659a65' : 'white'} stroke={item.done ? '#659a65' : '#d8dce1'} strokeWidth="1.5" />
            {item.done && <path d={`M${39} ${item.y + 6.5}l2.5 2.5 4-4.5`} stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            <text x="54" y={item.y + 9.5} fill={item.done ? '#659a65' : '#566370'} fontSize="9" fontFamily="system-ui" textDecoration={item.done ? 'line-through' : 'none'}>{item.text}</text>
          </g>
        ))}
        {/* Calendar block */}
        <rect x="215" y="20" width="130" height="110" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <rect x="215" y="20" width="130" height="28" rx="10" fill="#3b8dba" />
        <rect x="215" y="38" width="130" height="10" fill="#3b8dba" />
        <text x="280" y="40" textAnchor="middle" fill="white" fontSize="10" fontWeight="700" fontFamily="system-ui">March 2026</text>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <text key={d+i} x={228 + i * 16.5} y="62" textAnchor="middle" fill="#929daa" fontSize="7.5" fontWeight="600" fontFamily="system-ui">{d}</text>
        ))}
        {/* Calendar grid — simplified */}
        {[0,1,2,3].map(row => (
          <g key={row}>
            {[0,1,2,3,4,5,6].map(col => {
              const day = row * 7 + col + 1;
              if (day > 31) return null;
              const isHighlight = day === 15;
              return (
                <g key={col}>
                  {isHighlight && <circle cx={228 + col * 16.5} cy={76 + row * 14} r="7" fill="#dceef6" />}
                  <text x={228 + col * 16.5} y={79 + row * 14} textAnchor="middle" fill={isHighlight ? '#1a1f25' : '#6e7b8a'} fontSize="7.5" fontWeight={isHighlight ? '700' : '400'} fontFamily="system-ui">
                    {day}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
        {/* Communication / Send panel */}
        <rect x="370" y="20" width="170" height="110" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="386" y="40" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Communications</text>
        {/* Channel badges */}
        <rect x="386" y="50" width="54" height="16" rx="8" fill="#dceef6" />
        <text x="413" y="61" textAnchor="middle" fill="#255d7e" fontSize="7.5" fontWeight="600" fontFamily="system-ui">Email</text>
        <rect x="446" y="50" width="54" height="16" rx="8" fill="#f0f5f0" />
        <text x="473" y="61" textAnchor="middle" fill="#3a663a" fontSize="7.5" fontWeight="600" fontFamily="system-ui">In-App</text>
        <rect x="386" y="72" width="54" height="16" rx="8" fill="#fef3c7" />
        <text x="413" y="83" textAnchor="middle" fill="#92400e" fontSize="7.5" fontWeight="600" fontFamily="system-ui">Mail</text>
        {/* Template lines */}
        <rect x="386" y="98" width="140" height="6" rx="3" fill="#eef0f2" />
        <rect x="386" y="108" width="110" height="6" rx="3" fill="#eef0f2" />
        <rect x="386" y="118" width="125" height="6" rx="3" fill="#eef0f2" />
      </svg>
    ),

    /* ── The Building ── Building facade, health bar, documents */
    building: (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Building silhouette */}
        <rect x="30" y="25" width="100" height="100" rx="6" fill="#eef0f2" stroke="#d8dce1" strokeWidth="1.5" />
        <rect x="30" y="25" width="100" height="22" rx="6" fill="#454f5a" />
        <rect x="30" y="41" width="100" height="6" fill="#454f5a" />
        <text x="80" y="40" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="system-ui">THE BUILDING</text>
        {/* Windows grid */}
        {[0,1,2].map(row => (
          <g key={row}>
            {[0,1,2,3].map(col => (
              <rect key={col} x={40 + col * 22} y={56 + row * 22} width="14" height="14" rx="2" fill="white" stroke="#b8bfc8" strokeWidth="1" />
            ))}
          </g>
        ))}
        {/* Health Score bar */}
        <g>
          <text x="160" y="38" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Building Health</text>
          <rect x="160" y="44" width="180" height="12" rx="6" fill="#eef0f2" />
          <rect x="160" y="44" width="144" height="12" rx="6" fill="#659a65" />
          <text x="350" y="53.5" fill="#659a65" fontSize="9" fontWeight="700" fontFamily="system-ui">B+ 80%</text>
          {/* Score breakdown */}
          {[
            { y: 68, label: 'Legal & Bylaws', pct: 85, w: 35 },
            { y: 86, label: 'Insurance', pct: 90, w: 35 },
            { y: 104, label: 'Governance', pct: 60, w: 30 },
          ].map((item) => (
            <g key={item.y}>
              <text x="160" y={item.y + 8} fill="#566370" fontSize="8.5" fontFamily="system-ui">{item.label} ({item.w}%)</text>
              <rect x="275" y={item.y} width="100" height="10" rx="5" fill="#eef0f2" />
              <rect x="275" y={item.y} width={item.pct} height="10" rx="5" fill={item.pct >= 80 ? '#659a65' : item.pct >= 60 ? '#d97706' : '#e53e3e'} />
              <text x="382" y={item.y + 8} fill="#6e7b8a" fontSize="8" fontFamily="system-ui">{item.pct}%</text>
            </g>
          ))}
        </g>
        {/* Document cards */}
        <rect x="420" y="25" width="120" height="100" rx="8" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="436" y="42" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Key Records</text>
        {[
          { y: 52, label: 'Bylaws', status: 'Current', color: '#659a65' },
          { y: 68, label: 'Insurance', status: 'Active', color: '#659a65' },
          { y: 84, label: 'Master Deed', status: 'Current', color: '#659a65' },
          { y: 100, label: 'Rules', status: 'Outdated', color: '#d97706' },
        ].map((doc) => (
          <g key={doc.y}>
            <rect x="436" y={doc.y} width="7" height="10" rx="1.5" fill="#dceef6" stroke="#3b8dba" strokeWidth="0.8" />
            <text x="448" y={doc.y + 8} fill="#454f5a" fontSize="8" fontFamily="system-ui">{doc.label}</text>
            <text x="524" y={doc.y + 8} textAnchor="end" fill={doc.color} fontSize="7" fontWeight="600" fontFamily="system-ui">{doc.status}</text>
          </g>
        ))}
      </svg>
    ),

    /* ── Fiscal Lens ── Bar chart, ledger rows, pie chart */
    'fiscal-lens': (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Bar chart */}
        <text x="30" y="22" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Budget vs Actual</text>
        <line x1="30" y1="125" x2="195" y2="125" stroke="#d8dce1" strokeWidth="1" />
        {[
          { x: 42, h1: 70, h2: 55, label: 'Q1' },
          { x: 82, h1: 65, h2: 72, label: 'Q2' },
          { x: 122, h1: 80, h2: 60, label: 'Q3' },
          { x: 162, h1: 75, h2: 50, label: 'Q4' },
        ].map((bar) => (
          <g key={bar.x}>
            <rect x={bar.x} y={125 - bar.h1} width="14" height={bar.h1} rx="3" fill="#b9dcee" />
            <rect x={bar.x + 16} y={125 - bar.h2} width="14" height={bar.h2} rx="3" fill={bar.h2 > bar.h1 ? '#e53e3e' : '#659a65'} />
            <text x={bar.x + 15} y="137" textAnchor="middle" fill="#929daa" fontSize="8" fontFamily="system-ui">{bar.label}</text>
          </g>
        ))}
        {/* Legend */}
        <rect x="30" y="30" width="8" height="8" rx="2" fill="#b9dcee" />
        <text x="42" y="37.5" fill="#6e7b8a" fontSize="7.5" fontFamily="system-ui">Budget</text>
        <rect x="80" y="30" width="8" height="8" rx="2" fill="#659a65" />
        <text x="92" y="37.5" fill="#6e7b8a" fontSize="7.5" fontFamily="system-ui">Actual</text>
        {/* Ledger rows */}
        <rect x="220" y="15" width="170" height="120" rx="8" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="236" y="34" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">General Ledger</text>
        <line x1="230" y1="40" x2="380" y2="40" stroke="#eef0f2" strokeWidth="1" />
        {[
          { y: 52, desc: 'Assessment Income', dr: '', cr: '$4,200', clr: '#659a65' },
          { y: 66, desc: 'Insurance Premium', dr: '$1,800', cr: '', clr: '#e53e3e' },
          { y: 80, desc: 'Maintenance Repair', dr: '$650', cr: '', clr: '#e53e3e' },
          { y: 94, desc: 'Reserve Transfer', dr: '', cr: '$2,000', clr: '#659a65' },
          { y: 108, desc: 'Vendor Payment', dr: '$980', cr: '', clr: '#e53e3e' },
        ].map((row) => (
          <g key={row.y}>
            <text x="236" y={row.y + 7} fill="#566370" fontSize="7.5" fontFamily="system-ui">{row.desc}</text>
            <text x="375" y={row.y + 7} textAnchor="end" fill={row.clr} fontSize="8" fontWeight="600" fontFamily="system-ui">{row.dr || row.cr}</text>
            <line x1="230" y1={row.y + 13} x2="380" y2={row.y + 13} stroke="#f8f9fa" strokeWidth="0.8" />
          </g>
        ))}
        {/* Reserve fund donut */}
        <g transform="translate(460, 75)">
          <circle cx="0" cy="0" r="42" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
          <circle cx="0" cy="0" r="34" fill="none" stroke="#eef0f2" strokeWidth="10" />
          <circle cx="0" cy="0" r="34" fill="none" stroke="#3b8dba" strokeWidth="10" strokeDasharray="175" strokeDashoffset="35" strokeLinecap="round" transform="rotate(-90)" />
          <text x="0" y="-4" textAnchor="middle" fill="#1a1f25" fontSize="14" fontWeight="700" fontFamily="system-ui">82%</text>
          <text x="0" y="8" textAnchor="middle" fill="#929daa" fontSize="7" fontFamily="system-ui">Reserves</text>
          <text x="0" y="18" textAnchor="middle" fill="#929daa" fontSize="7" fontFamily="system-ui">Funded</text>
        </g>
      </svg>
    ),

    /* ── Property Log ── Clipboard with findings and action items */
    'property-log': (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Clipboard */}
        <rect x="30" y="10" width="210" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <rect x="85" y="4" width="100" height="16" rx="8" fill="#454f5a" />
        <text x="135" y="15" textAnchor="middle" fill="white" fontSize="8" fontWeight="600" fontFamily="system-ui">March Walkthrough</text>
        {/* Header stats */}
        <text x="46" y="34" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Findings</text>
        <rect x="94" y="26" width="22" height="12" rx="6" fill="#fef3c7" />
        <text x="105" y="35" textAnchor="middle" fill="#92400e" fontSize="7" fontWeight="700" fontFamily="system-ui">4</text>
        {/* Finding rows with condition dots */}
        {[
          { y: 44, area: 'Lobby', cond: 'Good', color: '#659a65' },
          { y: 60, area: 'Stairwell B', cond: 'Fair', color: '#d97706' },
          { y: 76, area: 'Parking Garage', cond: 'Poor', color: '#e53e3e' },
          { y: 92, area: 'Roof Access', cond: 'Good', color: '#659a65' },
        ].map((f) => (
          <g key={f.y}>
            <circle cx="52" cy={f.y + 5} r="4" fill={f.color} />
            <text x="62" y={f.y + 8} fill="#454f5a" fontSize="8.5" fontFamily="system-ui">{f.area}</text>
            <text x="228" y={f.y + 8} textAnchor="end" fill={f.color} fontSize="7.5" fontWeight="600" fontFamily="system-ui">{f.cond}</text>
          </g>
        ))}
        {/* Severity label */}
        <text x="46" y="120" fill="#929daa" fontSize="7" fontFamily="system-ui">Severity:</text>
        {[
          { x: 88, label: 'High', color: '#e53e3e' },
          { x: 120, label: 'Med', color: '#d97706' },
          { x: 148, label: 'Low', color: '#659a65' },
        ].map(s => (
          <g key={s.x}>
            <circle cx={s.x} cy="117" r="3" fill={s.color} />
            <text x={s.x + 6} y="120" fill="#6e7b8a" fontSize="7" fontFamily="system-ui">{s.label}</text>
          </g>
        ))}
        {/* Action items panel */}
        <rect x="270" y="10" width="260" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="286" y="30" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Action Items</text>
        <rect x="366" y="22" width="36" height="12" rx="6" fill="#fde3e3" />
        <text x="384" y="31" textAnchor="middle" fill="#b91c1c" fontSize="7" fontWeight="700" fontFamily="system-ui">2 open</text>
        {[
          { y: 42, text: 'Repair stairwell railing', assignee: 'ABC Maint.', done: true },
          { y: 62, text: 'Inspect garage cracks', assignee: 'J. Smith', done: false, overdue: true },
          { y: 82, text: 'Schedule roof repair', assignee: 'Board', done: false, overdue: false },
          { y: 102, text: 'Replace lobby tiles', assignee: 'XYZ Floors', done: true },
        ].map((a) => (
          <g key={a.y}>
            <rect x="286" y={a.y} width="14" height="14" rx="3" fill={a.done ? '#659a65' : 'white'} stroke={a.done ? '#659a65' : '#d8dce1'} strokeWidth="1.5" />
            {a.done && <path d={`M${289} ${a.y + 7.5}l3 3 5-5.5`} stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
            <text x="306" y={a.y + 10} fill={a.done ? '#929daa' : '#454f5a'} fontSize="8.5" fontFamily="system-ui" textDecoration={a.done ? 'line-through' : 'none'}>{a.text}</text>
            <text x="450" y={a.y + 10} fill="#929daa" fontSize="7.5" fontFamily="system-ui">{a.assignee}</text>
            {'overdue' in a && a.overdue && (
              <g>
                <rect x="490" y={a.y + 1} width="36" height="12" rx="6" fill="#fde3e3" />
                <text x="508" y={a.y + 10} textAnchor="middle" fill="#b91c1c" fontSize="6" fontWeight="700" fontFamily="system-ui">OVERDUE</text>
              </g>
            )}
          </g>
        ))}
      </svg>
    ),

    /* ── Community Room ── Announcements, request card, upvote */
    community: (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Announcement cards */}
        <rect x="20" y="10" width="180" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="36" y="30" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Announcements</text>
        {/* Pinned announcement */}
        <rect x="32" y="38" width="156" height="40" rx="6" fill="#f0f7fb" stroke="#b9dcee" strokeWidth="1" />
        <rect x="38" y="43" width="36" height="10" rx="5" fill="#3b8dba" />
        <text x="56" y="50.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="700" fontFamily="system-ui">PINNED</text>
        <rect x="38" y="58" width="120" height="5" rx="2.5" fill="#d8dce1" />
        <rect x="38" y="66" width="80" height="5" rx="2.5" fill="#eef0f2" />
        {/* Regular announcement */}
        <rect x="32" y="84" width="156" height="30" rx="6" fill="#f8f9fa" stroke="#eef0f2" strokeWidth="1" />
        <rect x="38" y="89" width="44" height="10" rx="5" fill="#fef3c7" />
        <text x="60" y="96.5" textAnchor="middle" fill="#92400e" fontSize="6" fontWeight="600" fontFamily="system-ui">Financial</text>
        <rect x="38" y="103" width="100" height="5" rx="2.5" fill="#eef0f2" />
        <text x="36" y="128" fill="#929daa" fontSize="7" fontFamily="system-ui">Board posted 2h ago</text>

        {/* Request card with upvote */}
        <rect x="220" y="10" width="180" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="236" y="30" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Requests</text>
        {/* Request item */}
        <rect x="232" y="38" width="156" height="52" rx="6" fill="#f8f9fa" stroke="#eef0f2" strokeWidth="1" />
        <rect x="238" y="43" width="60" height="10" rx="5" fill="#dceef6" />
        <text x="268" y="50.5" textAnchor="middle" fill="#255d7e" fontSize="6" fontWeight="600" fontFamily="system-ui">Maintenance</text>
        <rect x="302" y="43" width="42" height="10" rx="5" fill="#fef3c7" />
        <text x="323" y="50.5" textAnchor="middle" fill="#92400e" fontSize="6" fontWeight="600" fontFamily="system-ui">Medium</text>
        <rect x="238" y="58" width="130" height="5" rx="2.5" fill="#d8dce1" />
        <rect x="238" y="67" width="100" height="5" rx="2.5" fill="#eef0f2" />
        {/* Upvote button */}
        <rect x="238" y="76" width="28" height="10" rx="5" fill="#f0f5f0" stroke="#659a65" strokeWidth="0.8" />
        <text x="252" y="83.5" textAnchor="middle" fill="#659a65" fontSize="7" fontWeight="700" fontFamily="system-ui">5</text>
        {/* SLA indicator */}
        <rect x="232" y="96" width="156" height="22" rx="6" fill="#fef2f2" stroke="#fbc8c8" strokeWidth="1" />
        <text x="248" y="110" fill="#b91c1c" fontSize="7.5" fontWeight="600" fontFamily="system-ui">SLA: Response due in 3 days</text>
        <text x="236" y="128" fill="#929daa" fontSize="7" fontFamily="system-ui">Track status and SLA compliance</text>

        {/* Meeting + Votes mini */}
        <rect x="420" y="10" width="120" height="58" rx="8" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="436" y="28" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Meetings</text>
        <rect x="432" y="34" width="42" height="10" rx="5" fill="#3b8dba" />
        <text x="453" y="41.5" textAnchor="middle" fill="white" fontSize="6" fontWeight="600" fontFamily="system-ui">BOARD</text>
        <rect x="432" y="48" width="96" height="5" rx="2.5" fill="#eef0f2" />
        <text x="432" y="60" fill="#929daa" fontSize="7" fontFamily="system-ui">Mar 15 at 7pm</text>
        {/* Amenities mini */}
        <rect x="420" y="78" width="120" height="62" rx="8" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="436" y="96" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Amenities</text>
        <rect x="432" y="102" width="96" height="10" rx="5" fill="#d1fae5" />
        <text x="480" y="109.5" textAnchor="middle" fill="#065f46" fontSize="6.5" fontWeight="600" fontFamily="system-ui">Approved</text>
        <rect x="432" y="116" width="96" height="10" rx="5" fill="#fef3c7" />
        <text x="480" y="123.5" textAnchor="middle" fill="#92400e" fontSize="6.5" fontWeight="600" fontFamily="system-ui">Pending</text>
      </svg>
    ),

    /* ── The Archives ── Folder tabs with fiscal years, sections */
    archives: (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Folder tabs */}
        <rect x="30" y="40" width="500" height="100" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        {[
          { x: 40, label: 'FY 2023', active: false },
          { x: 130, label: 'FY 2024', active: false },
          { x: 220, label: 'FY 2025', active: true },
          { x: 310, label: 'FY 2026', active: false },
        ].map((tab) => (
          <g key={tab.x}>
            <rect x={tab.x} y={tab.active ? 22 : 26} width="80" height={tab.active ? 20 : 16} rx="6"
              fill={tab.active ? 'white' : '#eef0f2'} stroke={tab.active ? '#d8dce1' : '#eef0f2'} strokeWidth="1.5"  />
            {tab.active && <line x1={tab.x} y1="41" x2={tab.x + 80} y2="41" stroke="white" strokeWidth="2" />}
            <text x={tab.x + 40} y={tab.active ? 36 : 38} textAnchor="middle" fill={tab.active ? '#1a1f25' : '#929daa'} fontSize="9" fontWeight={tab.active ? '700' : '500'} fontFamily="system-ui">{tab.label}</text>
          </g>
        ))}
        {/* Archive section icons */}
        <text x="50" y="62" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Archive Sections</text>
        {[
          { x: 50, y: 74, label: 'Compliance', icon: 'M50 81 l4 4 8-8', color: '#659a65' },
          { x: 160, y: 74, label: 'Meetings', icon: '', color: '#3b8dba' },
          { x: 270, y: 74, label: 'Fiscal', icon: '', color: '#3b8dba' },
          { x: 380, y: 74, label: 'Insurance', icon: '', color: '#d97706' },
          { x: 50, y: 104, label: 'Legal Docs', icon: '', color: '#454f5a' },
          { x: 160, y: 104, label: 'Filings', icon: '', color: '#3b8dba' },
          { x: 270, y: 104, label: 'Board', icon: '', color: '#454f5a' },
          { x: 380, y: 104, label: 'Comms', icon: '', color: '#3b8dba' },
        ].map((sec) => (
          <g key={sec.label}>
            <rect x={sec.x} y={sec.y} width="100" height="22" rx="6" fill={sec.color + '15'} stroke={sec.color + '40'} strokeWidth="1" />
            <circle cx={sec.x + 14} cy={sec.y + 11} r="5" fill={sec.color} opacity="0.3" />
            <text x={sec.x + 24} y={sec.y + 14} fill="#454f5a" fontSize="8" fontWeight="500" fontFamily="system-ui">{sec.label}</text>
          </g>
        ))}
      </svg>
    ),

    /* ── My Unit ── Unit card, balance, payment button, autopay */
    'my-unit': (
      <svg viewBox="0 0 560 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Unit card */}
        <rect x="20" y="10" width="160" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <rect x="20" y="10" width="160" height="35" rx="10" fill="#454f5a" />
        <rect x="20" y="35" width="160" height="10" fill="#454f5a" />
        <text x="40" y="33" fill="white" fontSize="16" fontWeight="700" fontFamily="system-ui">Unit 4B</text>
        <rect x="130" y="20" width="40" height="14" rx="7" fill="#659a65" />
        <text x="150" y="30" textAnchor="middle" fill="white" fontSize="7" fontWeight="700" fontFamily="system-ui">Active</text>
        <text x="36" y="62" fill="#929daa" fontSize="8" fontFamily="system-ui">Owner</text>
        <text x="36" y="73" fill="#1a1f25" fontSize="9" fontWeight="600" fontFamily="system-ui">Jane Smith</text>
        {/* Metrics */}
        {[
          { y: 86, label: 'Monthly Fee', value: '$425.00' },
          { y: 100, label: 'Paid YTD', value: '$1,275.00' },
          { y: 114, label: 'Balance', value: '$0.00' },
          { y: 128, label: 'Late Fees', value: '$0.00' },
        ].map(m => (
          <g key={m.y}>
            <text x="36" y={m.y + 4} fill="#929daa" fontSize="7.5" fontFamily="system-ui">{m.label}</text>
            <text x="168" y={m.y + 4} textAnchor="end" fill="#1a1f25" fontSize="8" fontWeight="600" fontFamily="system-ui">{m.value}</text>
          </g>
        ))}
        {/* Payment section */}
        <rect x="200" y="10" width="170" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="216" y="32" fill="#1a1f25" fontSize="10" fontWeight="700" fontFamily="system-ui">Payments</text>
        {/* Balance breakdown */}
        <rect x="212" y="40" width="146" height="38" rx="6" fill="#f0f7fb" stroke="#b9dcee" strokeWidth="1" />
        <text x="220" y="54" fill="#566370" fontSize="8" fontFamily="system-ui">Current Balance</text>
        <text x="348" y="54" textAnchor="end" fill="#659a65" fontSize="12" fontWeight="700" fontFamily="system-ui">$425.00</text>
        <text x="220" y="70" fill="#929daa" fontSize="7" fontFamily="system-ui">Monthly Assessment due Mar 1</text>
        {/* Pay Now button */}
        <rect x="212" y="86" width="146" height="24" rx="8" fill="#454f5a" />
        <text x="285" y="101" textAnchor="middle" fill="white" fontSize="9" fontWeight="700" fontFamily="system-ui">Pay Now</text>
        {/* AutoPay badge */}
        <rect x="212" y="116" width="146" height="18" rx="9" fill="#d1fae5" stroke="#659a65" strokeWidth="1" />
        <text x="285" y="128.5" textAnchor="middle" fill="#065f46" fontSize="8" fontWeight="600" fontFamily="system-ui">AutoPay Enrolled — $425/mo</text>

        {/* Payment history */}
        <rect x="390" y="10" width="150" height="130" rx="10" fill="white" stroke="#d8dce1" strokeWidth="1.5" />
        <text x="406" y="30" fill="#1a1f25" fontSize="9" fontWeight="700" fontFamily="system-ui">Payment History</text>
        {[
          { y: 40, date: 'Mar 1, 2026', amt: '$425.00', method: 'Stripe' },
          { y: 56, date: 'Feb 1, 2026', amt: '$425.00', method: 'Stripe' },
          { y: 72, date: 'Jan 1, 2026', amt: '$425.00', method: 'Stripe' },
          { y: 88, date: 'Dec 1, 2025', amt: '$425.00', method: 'Check' },
          { y: 104, date: 'Nov 1, 2025', amt: '$425.00', method: 'Stripe' },
        ].map(p => (
          <g key={p.y}>
            <text x="406" y={p.y + 10} fill="#566370" fontSize="7.5" fontFamily="system-ui">{p.date}</text>
            <text x="484" y={p.y + 10} textAnchor="end" fill="#1a1f25" fontSize="7.5" fontWeight="600" fontFamily="system-ui">{p.amt}</text>
            <text x="530" y={p.y + 10} textAnchor="end" fill="#929daa" fontSize="6.5" fontFamily="system-ui">{p.method}</text>
            <line x1="406" y1={p.y + 14} x2="530" y2={p.y + 14} stroke="#f8f9fa" strokeWidth="0.8" />
          </g>
        ))}
      </svg>
    ),
  };

  const svg = svgs[moduleId];
  if (!svg) return null;

  return (
    <div className="mt-3 mb-2 rounded-lg bg-mist-50 border border-ink-100 p-3 overflow-hidden">
      <div className="w-full">{svg}</div>
    </div>
  );
}

/* Collapsible how-to card */
function HowToCard({ howTo }: { howTo: HowTo }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-ink-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-mist-25 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" />
        )}
        <span className="text-[13px] font-medium text-ink-700">{howTo.title}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-ink-100">
          <ol className="mt-2 space-y-1.5">
            {howTo.steps.map((step, i) => (
              <li key={i} className="text-[12.5px] text-ink-600 leading-relaxed flex gap-2">
                <span className="text-ink-400 font-medium flex-shrink-0 w-4 text-right">{i + 1}.</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
