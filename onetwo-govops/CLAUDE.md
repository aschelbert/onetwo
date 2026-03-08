# CLAUDE.md — Step 2 Reserve Study Implementation
**Annual Budget Planning workflow · ONE two**

You are implementing the redesigned Step 2 "Review Reserve Study" screen for the Case Ops workflow. Read this file first, then work through the implementation in the order listed below.

## Source of truth
- **Visual spec**: `step2-mockup-faithful.html` (in project root or ask for it)
- **Full spec**: `STEP2_RESERVE_STUDY_IMPL.md` — read this entirely before writing any code

## Stack
- Next.js 15, App Router, React 19, TypeScript
- Tailwind CSS (no compiler — use exact hex values via `text-[#xxx]` / `bg-[#xxx]` for all brand colors)
- Supabase (PostgreSQL + Auth + Edge Functions)
- DM Sans font (already loaded globally)

## Project-specific paths (src/ prefix)
- Tenant route: `src/app/app/[tenancy]/` (not `app/(tenant)/`)
- Components: `src/components/`
- Types: `src/types/`
- Supabase server client: `createServerSupabase()` from `@/lib/supabase/server` (async)
- Supabase project: HOA (`eaalfhrrytnmtzqjruxg`)

## Implementation order — follow exactly

### Step 1: Database migration ✅
Applied `create_cases_table` and `add_case_step_responses` to HOA project.

### Step 2: TypeScript types ✅
`src/types/case-steps.ts`

### Step 3: Server action
Create `src/app/app/[tenancy]/boardroom/cases/[caseId]/steps/actions.ts` using the code in STEP2_RESERVE_STUDY_IMPL.md Section 3.

### Step 4: Shared components (create all 4)
In `src/components/case-ops/steps/shared/`:
- `MarkCompleteCard.tsx` — spec in section 6.1
- `StepDescriptionCard.tsx` — spec in section 6.2
- `QuickActionsCard.tsx` — spec in section 6.3
- `SectionCard.tsx` — spec in section 5 (shared wrapper)

### Step 5: Section sub-components (create all 4)
In `src/components/case-ops/steps/step2/`:
- `Section1StudyValidity.tsx` — spec in section 5.1
- `Section2ComponentSchedule.tsx` — spec in section 5.2
- `Section3PercentFunded.tsx` — spec in section 5.3
- `Section4DecisionFraming.tsx` — spec in section 5.4

### Step 6: Main component
Create `src/components/case-ops/steps/Step2ReserveStudy.tsx` using section 4.2 of the spec.

### Step 7: Page route
Wire `src/app/app/[tenancy]/boardroom/cases/[caseId]/steps/[stepNumber]/page.tsx` using section 4.1.

### Step 8: Seed data
Run the INSERT from section 10 of the spec against the dev database.

### Step 9: Regenerate TypeScript types
Run `Supabase:generate_typescript_types` and merge the new `case_step_responses` type into `src/types/database.ts`.

## Key rules while implementing

1. **All colors are exact hex** — do not substitute Tailwind named colors for the brand palette. Use `text-[#d12626]` not `text-red-600`.

2. **Client component boundary** — `Step2ReserveStudy` must be `'use client'`. The page.tsx that imports it is a server component that fetches initial data and passes it as props.

3. **Auto-save, not manual save** — text inputs debounce 800ms then call `upsertStep2Data`. Select/date/button choices call it immediately. No "Save" button exists.

4. **Gate logic** — the Mark Complete button stays `disabled` and `opacity-45` until all 4 section IDs appear in `confirmed_sections[]`. Gate is enforced both in UI and in `markStep2Complete()` server action.

5. **% Funded is always derived** — never store it. Compute it: `Math.round((reserveBalance / totalReplacement) * 1000) / 10`. Risk band flows from this value.

6. **Section 1 starts collapsed** — sections 2, 3, 4 start expanded. This matches the mockup.

7. **Do not implement steps 1, 3–9** — only Step 2 content is in scope.

## Design tokens quick reference

| Purpose | Value |
|---|---|
| Page background | `bg-[#f8f9fa]` |
| Card background | `bg-white` |
| Card border | `border border-[#e6e8eb]` (1.5px) |
| Card border-radius | `rounded-[10px]` |
| Body padding | `px-7 py-[18px]` |
| Red accent | `#d12626` |
| Body text | `#1a1f25` |
| Secondary text | `#45505a` |
| Muted | `#929da8` |
| Green | `#047857` |
| Yellow | `#a16207` |
| Teal (guidance bg) | `#f0fdfa` + `text-[#0d9488]` |
| Indigo (framing) | `text-indigo-500` / `border-indigo-500` |
