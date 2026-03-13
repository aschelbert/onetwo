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
