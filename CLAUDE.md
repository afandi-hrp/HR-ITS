# HR-ITS — Waruna Group HR Applicant Tracking System

Internal ATS for Waruna Group. Talk to the user ("lae") in Indonesian.

## Stack

- **Frontend**: React 19 + Vite 6 + TypeScript + Tailwind CSS v4, `react-router-dom`.
- **Backend**: thin Express server (`server.ts`), deployed as a Vercel serverless function — used only for operations that need `SUPABASE_SERVICE_ROLE_KEY` (role updates, moving candidates to log, OTP, CV/document upload proxying to n8n, signed document URLs).
- **Database/Auth/Storage/Realtime**: self-hosted Supabase (`supabase2.waruna-group.co.id`). No direct Postgres/psql access from this environment — see "Supabase workflow" below.
- **Automation**: n8n workflows (via `/api/n8n/trigger` proxy) handle email, WhatsApp (WA OTP + notifications), Google Sheets sync, and Gemini-based AI analysis (biodata/psikotes summary/interview question generation, career-fit scoring).

## Recruitment pipeline

Candidate intake → Screening → Psikotes → Interview → Reference Check → Director/Finance Director approval → **Hired** or **Archived**.

Intake has two paths:
- Public quick-apply at `/career` (WA OTP verification).
- Full application at `/form-pelamar`, gated by an HR-issued one-time registration token (Registration Tokens page).

Archiving/hiring moves a row from `candidates` to `candidate_logs` (two physically separate tables holding the same shape of data — most queries and RPCs `UNION ALL` across both; keep this in mind whenever touching aggregate counts/stats).

## Roles (`src/hooks/usePermissions.ts`)

- `HR_ADMIN` — full access.
- `USER_MANAGER` — scoped to their own `department`, restricted nav.
- `DIRECTOR` / `FINANCE_DIRECTOR` — approval-only roles, restricted nav.
- `null`/unset role — **not** nav-restricted at the UI level (only `USER_MANAGER`/`DIRECTOR`/`FINANCE_DIRECTOR` are matched by `isRestrictedScreeningRole`), even though DB writes still require `role = 'HR_ADMIN'` server-side. New accounts get `role: null` until an HR_ADMIN assigns one via Manajemen Pengguna — `profiles.role` has **no default** (fixed 2026-08-06, see RLS audit below).
- **Known gap**: several pages (Dashboard, PsikotesSchedules, InterviewSchedules, CandidateTracking, CandidateArchive, Logs, Templates, RegistrationTokens) have no in-page role checks — access control there is routing/menu-level only (`src/App.tsx`), not enforced per-page or server-side beyond RLS.

## Directory map

```
src/pages/          One file per route (19 pages) — Dashboard, Screening, CandidateProfile,
                     CandidateTracking, CandidateArchive, RecruitmentFunnel, Logs,
                     PsikotesSchedules, InterviewSchedules, RegistrationTokens,
                     UserManagement, ExternalData, UploadCV, Templates,
                     EvaluationTemplates, OpenRecruitment, ApplicationForm (public),
                     PublicCareer (public), Login, Settings
src/components/      DashboardLayout (app shell — greeting, sidebar, notification bell),
                     SchedulingModal, SendEmailModal, SendWAModal, EvaluationModal,
                     ReferenceCheckModal, ScheduleCalendar, BulkUploadModal, ConfirmModal,
                     NotificationPanel, RealtimeNotifications, CandidateAvatar, JSONRenderer,
                     PdfToImages, components/ui/ (shadcn-style primitives)
src/lib/             supabase.ts (client), n8n.ts, documentStorage.ts (signed URL resolution),
                     print.ts (PDF/print popup), cvSummaryFormat.tsx, psikotesCategoryReference.ts,
                     utils.ts (cn, formatDate, etc.)
src/hooks/           usePermissions.ts
src/contexts/        AuthContext.tsx
server.ts            Express backend, service-role-only endpoints (see below)
supabase/migrations/ Tracked schema history — INCOMPLETE, see "Supabase workflow"
```

### `server.ts` endpoints
`/api/health`, `/api/users/update-role`, `/api/users/list`, `/api/candidates/move-to-log`, `/api/candidates/restore-from-log`, `/api/n8n/trigger`, `/api/request-otp`, `/api/verify-otp`, `/api/n8n/upload-cv`, `/api/n8n/upload-document`, `/api/documents/signed-url`, `/api/documents/remove`, `/api/cv-uploads` (GET/DELETE).

## Supabase schema (tables actually queried from the app)

Core: `candidates`, `candidate_logs` (archived/hired — same shape as `candidates`), `candidate_assignees`, `candidate_evaluations`, `internal_notes`, `blacklisted_candidates`.

Scheduling: `psikotes_schedules`, `interview_schedules`.

Config/content: `profiles` (role, department, job_title), `site_settings`, `open_recruitment`, `email_templates`, `evaluation_templates`, `registration_tokens`, `external_data`.

Ops/infra: `n8n_jobs`, `user_notifications`, `otp_requests`.

Storage buckets: `candidate-documents-private` (photos/KTP/ijazah/transcripts/payslips/psikotes results — private, accessed only via `/api/documents/signed-url`), `avatars`.

### Known RPC functions (`supabase.rpc(...)`)
- `get_recruitment_funnel_counts(p_position, p_start_date, p_end_date)` → `(total_applied, passed_screening, reached_psikotes, reached_interview, hired, rejected)`. **Cumulative** by construction (each stage = "reached this stage or beyond"), so bars are guaranteed to narrow monotonically. `rejected` is appended separately (an exit, not a milestone) — don't fold it into the cumulative chain.
- `get_recruitment_funnel_stage_candidates(p_position, p_start_date, p_end_date, p_limit_per_stage)` → `(stage, candidate_id, source_table)`, same cumulative logic, used for the funnel's click-a-bar → candidate list drill-down. Must stay logically in sync with `get_recruitment_funnel_counts`.
- `count_pending_candidates(p_position, p_start_date, p_end_date)` — "Pending" = zero progress at all (not accepted/hired/rejected AND no psikotes/interview schedule row).
- `handle_n8n_job_completion`, `notify_hr_admin_new_application`, `prevent_self_role_department_change`, `prevent_privileged_self_signup`, `submit_application_with_token` (untracked, Studio-only), `get_unique_positions`.

Other functions/policies may exist in the live DB that were created directly in Supabase Studio and were never committed as a migration file — **confirmed to have happened before** (see RLS audit note below). Don't assume `supabase/migrations/*.sql` is a complete picture of live schema.

## Supabase workflow — hard constraints

1. **No direct DB access from this environment.** No `DATABASE_URL`, no `psql`, no Supabase CLI. Every DDL change (new table/column, RLS policy, trigger, function) must be handed to the user as a runnable migration file under `supabase/migrations/` (naming: `YYYYMMDDHHMMSS_description.sql`), which the user runs manually in Supabase Studio's SQL Editor. **Never just describe a DB change in words — always give the exact SQL.**
2. **Migrations don't fully reflect live DB state.** At least one column default (`profiles.role`) and one RLS policy (`external_data`'s old "Allow authenticated reads") existed live but were absent from all tracked migrations. Before any RLS/security-sensitive work, get ground truth first via a read-only query the user runs in Studio:
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies WHERE schemaname IN ('public','storage')
   ORDER BY tablename, policyname;
   ```
   and `SELECT id, name, public FROM storage.buckets;` / `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '...';` for untracked functions.
3. After every code edit: run `npx tsc --noEmit` then `npm run build`, and only report a fix as done once both pass clean.
4. Explain root cause + fix in clear Indonesian before considering an issue resolved — don't just say "fixed."

## Design system (established through iterative user feedback — follow by default)

- **Body/label text**: `text-[#5A305A]` (primary purple, replaces `text-slate-700`+ black-ish text) and `text-[#73507B]` (secondary, replaces `text-slate-400/500/600` gray text).
- **Highlight/accent colors**: `#FFF5C5` (pale yellow) and `#F58C77` (coral) — used for badges/buttons like AI score badges, "Tutup"/"Batal" actions, CV Summary panel accents.
- **Table headers** (plain, non-color-coded ones): `bg-[#5A305A]/5 text-[#5A305A] border-b border-[#5A305A]/20` — a light tint, not a solid fill. **Exceptions, deliberately left alone**: `CandidateTracking.tsx`'s main Live Tracking table (multi-color section-coded header mirroring its Excel export's own color scheme — `bg-[#a895b6]`, `bg-[#f4b183]`, `#FFD966`, `#9BC2E6`, etc.), and `RecruitmentFunnel.tsx`'s PDF-preview-mockup `<thead>`s (styled to simulate the printed report, not real app UI).
- **Filter/action bars**: `bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm` — buttons and filter `<select>`s live inside this panel, not floating in the page header.
- **Page titles**: `text-4xl font-extrabold tracking-tight` app-wide, always paired with `text-[#5A305A]`.
- **Page content wrapper**: no `max-w-7xl mx-auto` centering — pages fill available width, tight to the sidebar (`px-4 md:px-5 pb-4 md:pb-8 pt-3` on the scrollable content container in `DashboardLayout.tsx`).
- **Scrollbar hiding idiom** (used wherever a scrollable panel shouldn't show a visible scrollbar): `[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`.
- **App-wide greeting** ("Selamat pagi/siang/sore/malam, {Nama}" + time-of-day icon + day/date), rendered in `DashboardLayout.tsx`: `position: absolute` (not `fixed`) inside the `relative` scrollable content container, `top-3 right-0 mr-16`, so it scrolls away with page content and aligns with the page title row instead of pushing content down. Hidden on `/candidates/*` and on `/screening?selectedPosition=...` (its drill-down view) via a `hideGreeting` check in that component, because those pages have their own header content it would collide with. Notification bell is `fixed` separately, not part of this.

## Recent significant fixes (Recruitment Funnel, 2026-08-28)

The funnel used to compute each stage's count **independently** (e.g. "Lolos Screening" = `status_screening IN ('accepted','hired')`; "Tahap Psikotes" = has a `psikotes_schedules` row) — but in this app's real workflow HR can schedule psikotes without ever setting `status_screening = 'accepted'`, so stages weren't true nested subsets and the bar chart could visually widen instead of narrow. Fixed by moving all funnel math server-side into the two cumulative RPCs listed above (migrations `20260828000001`/`20260828000002`), plus a separate `count_pending_candidates` RPC redefining "Pending" as zero-progress (`20260828000000`), plus a later `rejected` column added to both funnel RPCs, appended (not woven into the cumulative chain) and placed between "Tahap Interview" and "Diterima (Hired)" in the bar order — putting it last made the chart widen at the end again (`20260828000003`).

**Action needed**: confirm with the user whether all four `20260828*` migration files have actually been run in Supabase Studio — as of the last session this had been communicated but not confirmed executed.
