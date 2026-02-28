# Communications Module Proposal

## Current State Analysis

ONE two currently has two parallel communication systems that serve different but overlapping purposes:

### Announcements (`useComplianceStore.announcements`)
- **Purpose**: Public-facing community notices displayed in the Community Room
- **Visible to**: All residents and board members
- **Fields**: title, body, category, postedBy, postedDate, pinned
- **Email delivery**: Optional — board member can check "Also send via email" when posting
- **Examples**: Elevator maintenance updates, policy changes, meeting recaps

### Communications (`useComplianceStore.communications`)
- **Purpose**: Internal record-keeping log of official notices sent to owners
- **Visible to**: Board members only (Board Room → Communications tab)
- **Fields**: type, subject, date, method, recipients, respondedBy, status, notes
- **Email delivery**: None — purely a manual log entry
- **Examples**: Minutes distribution records, violation notice logs, resale certificate records

### Overlap & Confusion Points

1. **Minutes approval** auto-creates a Communication record AND prompts to create an Announcement — the board member must manage two separate objects for one event
2. **Compliance runbook completion** prompts a Communication draft, but if the board also wants to notify residents, they must separately create an Announcement
3. **Election certification** auto-creates an Announcement + Communication + sends email — three objects for one action
4. **Meeting notices** send email via edge function but create neither a Communication record nor an Announcement
5. **Issue status emails** are sent via edge function but leave no Communication audit trail

The fundamental issue: **Communications log what was sent, Announcements are what residents see, and edge functions handle actual delivery — but these three systems don't know about each other.**

---

## Proposed Unified "Outbox" Model

Replace the separate Communications and Announcements systems with a single **Outbox** model that tracks both the content and delivery of all board-to-resident communications.

### Data Model

```
outbox_messages
├── id                  uuid PRIMARY KEY
├── tenant_id           uuid NOT NULL REFERENCES tenants(id)
├── type                text NOT NULL
│   (announcement, meeting_notice, status_update, minutes, financial,
│    violation, notice, resale, response, other)
├── subject             text NOT NULL
├── body                text
├── category            text           -- for display grouping (general, maintenance, etc.)
├── posted_by           text           -- board member name/role
├── posted_date         date
├── pinned              boolean DEFAULT false
├── visibility          text DEFAULT 'public'
│   ('public' = Community Room, 'board_only' = Board Room only)
├── delivery_method     text
│   (portal_only, email, mail, email+portal, certified_mail)
├── delivery_status     text DEFAULT 'draft'
│   (draft, pending, sending, sent, partial_failure, failed)
├── recipients_summary  text           -- "All owners (50 units)" or "Unit 301 owner"
├── email_sent_count    integer DEFAULT 0
├── email_total_count   integer DEFAULT 0
├── email_sent_at       timestamptz
├── email_errors        jsonb          -- [{email, error, timestamp}]
├── source              text           -- what triggered this: 'manual', 'minutes_approval',
│                                      -- 'election_certified', 'compliance_runbook',
│                                      -- 'issue_status', 'meeting_scheduled'
├── source_id           text           -- ID of the originating meeting/issue/election
├── notes               text
├── responded_by        text
├── created_at          timestamptz DEFAULT now()
├── updated_at          timestamptz DEFAULT now()
```

### How It Works

**One object, multiple views:**

| View | Filter | Shows |
|------|--------|-------|
| Community Room → Announcements | `visibility = 'public'` | Title, body, category, pinned, posted date |
| Board Room → Communications | All records | Full detail including delivery status, method, notes |
| Board Room → Outbox (new) | `delivery_status IN ('draft', 'pending', 'sending')` | Items awaiting send/approval |

**Single creation flow:**
1. Board member creates a message (from modal, workflow trigger, or automation)
2. Chooses visibility: **Public** (appears in Community Room) or **Board-only** (internal record)
3. Chooses delivery: **Portal only**, **Email all members**, **Email specific recipient**
4. Message is created with `delivery_status = 'draft'` or `'pending'`
5. If email delivery is selected, edge function is called → status updates to `'sending'` → `'sent'`
6. Delivery results (sent count, errors) are written back to the record

---

## How Auto-Generated Communications Fit In

Each workflow automation creates a single Outbox message with appropriate defaults:

### Meeting → Announcement Pipeline (Workflow #1)
When minutes are approved by majority:
- **Auto-create**: `type: 'minutes'`, `visibility: 'public'`, `source: 'minutes_approval'`
- **Pre-fill**: Subject from meeting title, body from agenda + minutes summary
- **Prompt**: Board member reviews, optionally edits, selects delivery method
- **Result**: One Outbox record replaces the current Communication + Announcement pair

### Compliance Runbook → Communication (Workflow #4)
When a compliance item requiring owner notification is completed:
- **Auto-create**: `type: 'notice'`, `visibility: 'board_only'` (default), `source: 'compliance_runbook'`
- **Pre-fill**: Subject from runbook item, notes from legal reference
- **Prompt**: Board member can upgrade to `visibility: 'public'` if residents need to see it

### Issue Status Change (Workflow #5)
When issue status changes to IN_PROGRESS/RESOLVED/CLOSED:
- **Auto-create**: `type: 'status_update'`, `visibility: 'board_only'`, `source: 'issue_status'`
- **Delivery**: Automatic email to reporter only (not broadcast)
- **Record**: Captures delivery result for audit trail (currently missing)

### Meeting Notice (Workflow #6)
When "Send notice to all members" is checked:
- **Auto-create**: `type: 'meeting_notice'`, `visibility: 'public'`, `source: 'meeting_scheduled'`
- **Delivery**: Automatic email to all members
- **Record**: Links back to meeting via `source_id`

### Election Certification (Workflow #3)
When election is certified:
- **Auto-create**: `type: 'announcement'`, `visibility: 'public'`, `source: 'election_certified'`
- **Pre-fill**: Results summary, participation stats
- **Delivery**: Automatic email broadcast

---

## Delivery Status Tracking with Mailjet

### Current Gap
Edge functions fire-and-forget. Success/failure is shown in a transient browser alert and lost.

### Proposed Approach

**Option A: Write-back from edge function (Recommended)**

Edge functions already have `SB_SERVICE_KEY`. After sending emails, write delivery results back to the `outbox_messages` row:

```
1. Frontend creates outbox_messages row (delivery_status = 'pending')
2. Frontend calls edge function with outbox_message_id
3. Edge function sends emails via Mailjet
4. Edge function updates outbox_messages SET
     delivery_status = 'sent' (or 'partial_failure'),
     email_sent_count = N,
     email_total_count = M,
     email_sent_at = now(),
     email_errors = [...]
5. Frontend can poll or subscribe to see updated status
```

This eliminates the need for Mailjet webhooks while providing per-message delivery tracking.

**Option B: Mailjet webhooks (Future enhancement)**

For per-recipient tracking (opens, bounces, complaints), configure Mailjet event webhooks to POST to a `delivery_events` edge function. This is more complex and only worthwhile at scale.

### What Gets Tracked

| Field | Source | Value |
|-------|--------|-------|
| `delivery_status` | Edge function response | draft → pending → sending → sent/failed |
| `email_sent_count` | Edge function `data.sent` | Number successfully delivered to Mailjet |
| `email_total_count` | Edge function `data.total` | Number attempted |
| `email_sent_at` | Edge function timestamp | When batch completed |
| `email_errors` | Edge function error array | `[{email: "...", error: "..."}]` |

---

## Recommended UI Changes

### 1. Merge Communications Tab

Replace the current split layout (Announcements section + Communications Log section) with a unified view:

**Board Room → Communications tab** should show:
- **All Outbox messages**, sorted by date, with filters for:
  - Type (announcement, meeting_notice, minutes, etc.)
  - Visibility (public / board-only)
  - Delivery status (all / pending / sent / failed)
- Each row shows: type badge, subject, date, visibility icon, delivery status badge
- Click to expand: full body, delivery details, source link

### 2. Unified "New Message" Modal

Replace the separate "Post Announcement" and "Log Communication" modals with one modal:

```
┌─────────────────────────────────────────┐
│  New Communication                       │
├─────────────────────────────────────────┤
│  Subject: [________________________]     │
│  Body:    [________________________]     │
│           [________________________]     │
│                                          │
│  Type:  [announcement ▾]                 │
│                                          │
│  Visibility:                             │
│    (●) Public — appears in Community Room│
│    ( ) Board Only — internal record      │
│                                          │
│  Delivery:                               │
│    [ ] Send via email to all members     │
│    [  ] Specific recipient: [_______]    │
│                                          │
│  □ Pin to top of Community Room          │
│                                          │
│  Notes (internal): [_________________]   │
│                                          │
│            [Cancel]  [Post & Send]       │
└─────────────────────────────────────────┘
```

### 3. Community Room — No Changes

The Community Room continues to show `visibility = 'public'` messages only, rendered identically to current announcements. Residents see no difference.

### 4. Delivery Status Indicators

Add small status badges to messages in both Board Room and Community Room:

- **Draft**: Gray dot
- **Pending**: Yellow dot
- **Sent**: Green dot + "Emailed to 48 members"
- **Partial failure**: Amber dot + "Sent to 45/48 — 3 failed"
- **Failed**: Red dot + "Email delivery failed"

Board members can click the status badge to see delivery details and retry failed sends.

---

## Migration Path

### Phase 1: Database + Store (Minimal disruption)
1. Create `outbox_messages` table
2. Migrate existing `announcements` and `communications` data into it
3. Update `useComplianceStore` to use a single `messages` array with the outbox schema
4. Keep existing component rendering — just change the data source

### Phase 2: Edge Function Updates
1. Modify all three edge functions to accept an `outboxMessageId` parameter
2. After sending, write delivery results back to the `outbox_messages` row
3. Add a new `send-outbox-message` generic edge function that replaces the three specialized ones

### Phase 3: UI Consolidation
1. Merge the two modals into the unified "New Message" modal
2. Add delivery status badges
3. Add outbox filters and type/status badges
4. Remove the separate Announcements section from the Communications tab

### Data Migration

```sql
-- Move announcements into outbox_messages
INSERT INTO outbox_messages (tenant_id, type, subject, body, category, posted_by, posted_date, pinned, visibility, delivery_method, delivery_status, source, created_at)
SELECT tenant_id, 'announcement', title, body, category, posted_by, posted_date, pinned, 'public', 'portal_only', 'sent', 'manual', created_at
FROM announcements;

-- Move communications into outbox_messages
INSERT INTO outbox_messages (tenant_id, type, subject, body, posted_date, delivery_method, delivery_status, recipients_summary, responded_by, notes, source, created_at)
SELECT tenant_id, type, subject, NULL, date, method, status, recipients, responded_by, notes, 'manual', created_at
FROM communications;
```

---

## Summary

| Current | Proposed |
|---------|----------|
| 2 data models (Announcement + Communication) | 1 data model (Outbox Message) |
| 2 creation modals | 1 unified modal |
| 3 separate edge functions | 1 generic + delivery write-back |
| No delivery tracking | Per-message status + error tracking |
| Workflows create 2-3 objects | Workflows create 1 object |
| No audit trail for automated emails | Full audit trail via source + source_id |
| Manual Communication log only | Automated + manual in one view |

The unified Outbox model eliminates the confusion between "what residents see" and "what the board tracks" by making visibility a property of a single message, not a distinction between two entirely separate systems.
