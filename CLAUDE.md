# HR-ITS — Waruna Group HR Applicant Tracking System

Internal ATS for Waruna Group. Talk to the user ("lae") in Indonesian.

## Stack

- **Frontend**: React 19 + Vite 6 + TypeScript + Tailwind CSS v4, `react-router-dom`.
- **Backend**: Express (`server.ts` + `server/`), runs in production on the **office server** as ONE process that serves both the built frontend (`dist/`) and `/api/*` (`vercel.json` is a leftover, unused). Uses `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS — so every route must check role/ownership itself.
- **Backend migration (started 2026-10-18)**: moving browser→Supabase queries behind `/api`, phase by phase. **Fase 1 done**: `external_data`, `registration_tokens`, Log/Arsip (`candidate_logs` list/export/delete), document signed URLs → `server/routes/{externalData,registrationTokens,logs,documents}.ts`. New routes use `server/auth.ts` (`requireAuth` loads `req.profile`, `requireRole`/`requireHrAdmin`, `handle`, `HttpError`, `auditLog`) and `server/access.ts` (non-HR = only candidates assigned via `candidate_assignees` + their linked forms; USER_MANAGER never gets `SALARY_FORM_FIELDS`). Frontend calls them with `api.get/post/delete` (`src/lib/api.ts`). Code shared by browser and server must be dependency-free (`src/lib/normalize.ts`, `src/lib/documentPaths.ts`) — `utils.ts` pulls in the browser Supabase client. **Fase 2 done**: Screening, CandidateProfile, schedule pages + SchedulingModal/NoShowModal, Evaluation/ReferenceCheck saves, notes, assignees, approvals, psikotes upload, blacklist add → `server/routes/{candidates,schedules}.ts`; `move-to-log` is now HR only. **Fase 3 done**: Dashboard, Funnel, Live Tracking (incl. inline edit), Upload CV duplicate check, Open Recruitment, email/evaluation templates, user list → `server/routes/{analytics,content}.ts` (lift-and-shift: same queries server-side, page aggregation unchanged; date ranges computed in the browser and sent as ISO). **Still direct from the browser, by design**: Supabase Auth + own `profiles` row (AuthContext, Settings), Realtime channels, own `user_notifications` / `n8n_jobs`, public branding `site_settings`, public `/career` (`open_recruitment`), Settings uploads to public buckets (HR-only by RLS). RLS lockdown per phase: `20261018000001`–`20261018000004` (`…0003`/`…0004` must run only after that phase's server code is deployed). `public.current_user_role()` (SECURITY DEFINER) exists for policies ON `profiles` — selecting `profiles` inside a profiles policy recurses. Funnel RPCs are SECURITY DEFINER and, since `…0004`, executable by service_role only. Auth and Realtime stay in the browser by design. Tests: `scripts/test-backend-routes.ts <config.json>` (read-only, real DB), `scripts/test-application-form-validation.ts`.
- **Database/Auth/Storage/Realtime**: self-hosted Supabase (`supabase2.waruna-group.co.id`, behind Cloudflare; DB on LAN at `172.16.9.5:5433`). Claude has **read-only** DB access via the `supabase-db` MCP connector (role `claude_readonly`) — see "Supabase workflow" below.
- **Automation**: n8n workflows (via `/api/n8n/trigger` proxy) handle email, WhatsApp (WA OTP + notifications), Google Sheets sync, and Gemini-based AI analysis (biodata/psikotes summary/interview question generation, career-fit scoring).

## Recruitment pipeline

Candidate intake → Screening → Psikotes → Interview → Reference Check → Director/Finance Director approval → **Hired** or **Archived**.

Intake has two paths:
- Public quick-apply at `/career` (WA OTP verification).
- Full application at `/form-pelamar`, gated by an HR-issued one-time registration token (Registration Tokens page).

Archiving/hiring moves a row from `candidates` to `candidate_logs` (two physically separate tables holding the same shape of data — most queries and RPCs `UNION ALL` across both; keep this in mind whenever touching aggregate counts/stats).

**Archiving deletes the `candidates` row**, and `psikotes_schedules`, `interview_schedules`, `candidate_evaluations`, `internal_notes`, `candidate_assignees` all reference `candidates(id) ON DELETE CASCADE` (verified live 2026-10-04). Do **not** drop those FKs — PostgREST embeds like `candidates.select('*, psikotes_schedules(...)')` depend on them. Instead (migration `20261004000001`), `move-to-log` snapshots the first four into `candidate_logs.archived_records` (jsonb, keyed by table name) and `restore-from-log` re-inserts them (rolling back the restore if any insert fails). Archived reads (CandidateProfile notes/evaluations/schedules, Live Tracking) fall back to `archived_records`. Anything archived before that migration has already lost these rows — unrecoverable except from a DB backup.

The only live ways into the archive are **Tolak** (reject) and **Hire** on the Screening page (both call `/api/candidates/move-to-log`). Screening also contains a "Pindahkan ke Log" modal (`logModalData`), but nothing opens it — dead UI. The user chose (2026-09-29) to keep using Tolak when a candidate is moved to another position rather than reviving it.

### External data (submitted application forms)
- `external_data` rows (keyed by `uid_sheet`, form fields in `raw_data`) are linked from the candidate side via `candidates.linked_external_id` / `candidate_logs.linked_external_id` — FK `ON DELETE SET NULL`, no UNIQUE constraint (verified live 2026-09-29).
- **One form may be shared by several applications of the same person** (e.g. rejected for Finance, re-applies for Purchasing), but **only if every other linked application is archived** — never by two active ones. Enforced in `CandidateProfile.tsx` (suggestions + re-check at link time) and in `restore-from-log` (restores without the link if an active application already holds it).
- Anything that deletes `external_data` must first call `findExternalIdsStillInUse()` (`src/lib/externalDataLinks.ts`) — deleting a shared row would silently strip the form + documents from the other application via the SET NULL FK. `Logs.tsx` single/bulk delete already does this.
- Human-readable card summaries (name, position, contact, education, last job) come from `getExternalDataSummary()` (`src/lib/externalDataSummary.ts`), rendered by `components/ExternalDataSummary.tsx` on both the Data Eksternal page and the profile's match suggestions. Never show raw keys like `FULL_NAME` to users.

### Schedule attendance (psikotes / interview)
- `is_confirmed` = attended/done; `is_no_show` + `no_show_reason` = "Tidak Hadir" (migration `20260929000000`, DB CHECK forbids both true). Anything else = still pending.
- Use the helpers in `src/lib/scheduleStatus.ts` (`isPendingSchedule`, `isNoShowSchedule`, `getStageAttendance`) instead of testing `is_confirmed` alone — a no-show is *not* pending (no confirm/reminder/email/WA buttons, not "upcoming" on Dashboard) and counts as finished for rescheduling eligibility in `SchedulingModal`.
- No-show rows are kept (never deleted) so the history survives a reschedule; a reschedule is a new row. Marking UI: `components/NoShowModal.tsx` (Screening menu + the schedule pages' "Tidak Hadir" tab). When confirming attendance on a no-show row, also clear `is_no_show` or the CHECK fails.
- Funnel RPCs count stage reach by schedule-row existence — a no-show still "reached" the stage (was invited). Intentionally unchanged.

## Roles (`src/hooks/usePermissions.ts`)

- `HR_ADMIN` — full access.
- `USER_MANAGER` — scoped to their own `department`, restricted nav.
- `DIRECTOR` / `FINANCE_DIRECTOR` — approval-only roles, restricted nav.
- `READ_ONLY` (2026-10-19) — full nav and every candidate like HR Admin, but no salary (`hideSalary`, server `canSeeSalary`, payslip/remuneration files refused in `/api/documents/signed-url`) and no writes: `server/auth.ts` `requireAuth` refuses every non-GET except `READ_ONLY_POST_ALLOWLIST`; HR pages' GET routes use `requireHrRead`; read visibility uses `canViewAllCandidates` (`server/access.ts`), writes still `isHrAdmin`/`requireHrAdmin`. UI hides write controls via `usePermissions().canEdit` — **any new create/edit/delete/send button must be gated with `canEdit`**. Registration token values are masked for READ_ONLY. Internal notes stay same-role, so READ_ONLY sees none.
- `null`/unset role — **not** nav-restricted at the UI level (only `USER_MANAGER`/`DIRECTOR`/`FINANCE_DIRECTOR` are matched by `isRestrictedScreeningRole`), even though DB writes still require `role = 'HR_ADMIN'` server-side. New accounts get `role: null` until an HR_ADMIN assigns one via Manajemen Pengguna — `profiles.role` has **no default** (fixed 2026-08-06, see RLS audit below).
- **Known gap**: several pages (Dashboard, PsikotesSchedules, InterviewSchedules, CandidateTracking, Logs, Templates, RegistrationTokens) have no in-page role checks — access control there is routing/menu-level only (`src/App.tsx`), not enforced per-page or server-side beyond RLS.

## Directory map

```
src/pages/          One file per route (18 pages) — Dashboard, Screening, CandidateProfile,
                     CandidateTracking, RecruitmentFunnel, Logs,
                     PsikotesSchedules, InterviewSchedules, RegistrationTokens,
                     UserManagement, ExternalData, UploadCV, Templates,
                     EvaluationTemplates, OpenRecruitment, ApplicationForm (public),
                     PublicCareer (public), Login, Settings
src/components/      DashboardLayout (app shell — greeting, sidebar, notification bell),
                     SchedulingModal, SendEmailModal, SendWAModal, EvaluationModal,
                     ReferenceCheckModal, ScheduleCalendar, BulkUploadModal, ConfirmModal,
                     NotificationPanel, RealtimeNotifications, CandidateAvatar, JSONRenderer,
                     PdfToImages, ExternalDataSummary (applicant card header/fields/link notes),
                     NoShowModal (+ NoShowBadge, ScheduleStatusTag),
                     components/ui/ (shadcn-style primitives)
src/lib/             supabase.ts (client), n8n.ts, documentStorage.ts (signed URL resolution),
                     print.ts (PDF/print popup), cvSummaryFormat.tsx, psikotesCategoryReference.ts,
                     externalDataSummary.ts, externalDataLinks.ts, scheduleStatus.ts,
                     utils.ts (cn, formatDate, etc.)
src/hooks/           usePermissions.ts
src/contexts/        AuthContext.tsx
server.ts            Express backend, service-role-only endpoints (see below)
supabase/migrations/ Tracked schema history — INCOMPLETE, see "Supabase workflow"
```

### `server.ts` endpoints
`/api/health`, `/api/users/update-role`, `/api/users/list`, `/api/candidates/move-to-log`, `/api/candidates/restore-from-log`, `/api/n8n/trigger`, `/api/request-otp`, `/api/verify-otp`, `/api/n8n/upload-cv`, `/api/n8n/upload-document`, `/api/documents/remove`, `/api/cv-uploads` (GET/DELETE).
In `server/routes/`: `/api/external-data` (list), `/by-uids`, `/links`, `/for-candidate/:id`, `/link`, `/unlink`; `/api/registration-tokens` (GET/POST), `/used` + `/:id` (DELETE), `/available`, `/:id/mark-sent`; `/api/logs`, `/api/logs/export`, `/api/logs/delete`; `/api/documents/signed-url` (per-document check for non-HR). `/api/candidates/screening|positions|archived-for-position`, `/api/candidates/:id` (GET/PATCH), `/:id/status|assessment|approval|interview-questions|psikotes-result|notes|evaluations`, `PUT /:id/assignees`, `/api/profiles/assignable`, `/api/blacklist`, `/api/evaluations` (POST, PATCH /:id); `/api/schedules/:type` (list/POST), `/:type/calendar`, `/:type/candidates`, `/:type/:id` (PATCH/DELETE), `/:type/:id/attendance`. `/api/activity/ping` (any logged-in user, incl. READ_ONLY), `/api/users/activity`, `/api/users/:id/activity`, `POST /api/users/:id/reset-password`, `/:id/disable`, `/:id/enable` (new temp password + must_change_password), `POST /api/users/disable-inactive` (bulk, never-logged-in > 60 days; server re-validates each id) (HR_ADMIN; `server/routes/userActivity.ts`; disabled = GoTrue `banned_until`, also rejected in `requireAuth`); `/api/dashboard` (+`/positions`), `/api/funnel` (+`/positions`), `/api/tracking` (GET, PATCH `/:id`); `/api/open-recruitment`, `/api/email-templates`, `/api/evaluation-templates` (GET + POST/PATCH `/:id`/DELETE `/:id`, column whitelists), `/api/profiles` (+`/departments`), `/api/candidates-by-email`.

## Supabase schema (tables actually queried from the app)

Core: `candidates`, `candidate_logs` (archived/hired — same shape as `candidates`), `candidate_assignees`, `candidate_evaluations`, `internal_notes`, `blacklisted_candidates`.

Scheduling: `psikotes_schedules`, `interview_schedules` (both have `is_confirmed`, `is_no_show`, `no_show_reason` — see "Schedule attendance").

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

1. **Read-only DB access only** (`supabase-db` MCP connector). Use it to check live state before writing SQL; never try to write through it. Every DDL change (new table/column, RLS policy, trigger, function) must be handed to the user as a runnable migration file under `supabase/migrations/` (naming: `YYYYMMDDHHMMSS_description.sql`), which the user runs manually in Supabase Studio's SQL Editor. **Never just describe a DB change in words — always give the exact SQL.**
2. **Migrations don't fully reflect live DB state.** At least one column default (`profiles.role`) and one RLS policy (`external_data`'s old "Allow authenticated reads") existed live but were absent from all tracked migrations. Before any RLS/security-sensitive work, get ground truth first via a read-only query the user runs in Studio:
   ```sql
   SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
   FROM pg_policies WHERE schemaname IN ('public','storage')
   ORDER BY tablename, policyname;
   ```
   and `SELECT id, name, public FROM storage.buckets;` / `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '...';` for untracked functions.
3. After every code edit: run `npx tsc --noEmit` then `npm run build`, and only report a fix as done once both pass clean.
4. Explain root cause + fix in clear Indonesian before considering an issue resolved — don't just say "fixed."
6. **Quick test after every update (user's standing rule, 2026-10-24).** `tsc` + `build` only prove it compiles. Before calling an update done, also run a quick check of the changed behavior and report the result in Indonesian as two lists, **Sudah diuji** / **Belum diuji**, never implying more was tested than was:
   - Server route/auth change: exercise it for real — e.g. start the server locally (`npx tsx server.ts`) and `curl` the endpoint (expect 401 without a token, 403 for the wrong role, 400 on bad input), or run `scripts/test-backend-routes.ts`. Check `server/auth.ts` guards too, not just the happy path.
   - SQL/migration: run the SELECT/preview part read-only through the `supabase-db` MCP (check counts, that functions like `extensions.crypt` resolve, that the WHERE matches the expected rows) and say clearly that the write part still has to be run by the user in Studio.
   - UI change: confirm the new elements/props/imports are wired (grep the usage, check the state it relies on is set) and, if the app can be run locally, open the page; otherwise list the UI as "belum diuji" and give the user a short manual test checklist.
   - **Never test by writing to the live DB** (disable/reset a real user, bulk update, etc.). Use a read-only query, a dry run, or fake data; hand the user a step-by-step check for the write path instead.
   - If a check fails or can't be run, say so with the output; don't paper over it.
7. The old root-level `supabase_setup.sql` / `supabase_update*.sql` were deleted (2026-09-29): one-off scripts already applied, with pre-hardening insecure policies — never recreate or re-run them. For a fresh environment, dump the live schema instead (`supabase db dump --schema-only`); `supabase/migrations/` has no base-table creation.

## Design system (established through iterative user feedback — follow by default)

- **Body/label text**: `text-[#5A305A]` (primary purple, replaces `text-slate-700`+ black-ish text) and `text-[#73507B]` (secondary, replaces `text-slate-400/500/600` gray text).
- **Highlight/accent colors**: `#FFF5C5` (pale yellow) and `#F58C77` (coral) — used for badges/buttons like AI score badges, "Tutup"/"Batal" actions, CV Summary panel accents.
- **Table headers** (plain, non-color-coded ones): `bg-[#5A305A]/5 text-[#5A305A] border-b border-[#5A305A]/20` — a light tint, not a solid fill. **Exceptions, deliberately left alone**: `CandidateTracking.tsx`'s main Live Tracking table (multi-color section-coded header mirroring its Excel export's own color scheme — `bg-[#a895b6]`, `bg-[#f4b183]`, `#FFD966`, `#9BC2E6`, etc.), and `RecruitmentFunnel.tsx`'s PDF-preview-mockup `<thead>`s (styled to simulate the printed report, not real app UI).
- **Filter/action bars**: `bg-white/70 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-sm` — buttons and filter `<select>`s live inside this panel, not floating in the page header. **Every control inside is `h-9` + `text-sm` + `rounded-xl`** (compacted from `h-10` on 2026-10-23, together with the app-wide 90% root font-size in `index.css`): inputs, select boxes, icon+select wrappers, popover triggers and text buttons; icon-only buttons are `h-9 w-9` (icon size 16, no text label); gaps `gap-1.5`. Keep the bar on **one row** from `lg` up (`lg:flex-nowrap` — the user's screen is below the `xl` breakpoint, so `xl:` layouts still wrapped; search `flex-1 min-w-[160px]` shrinks first, fixed-width selects, short labels) — the user rejected two-row filter bars (2026-10-04).
- **Page titles**: `text-2xl font-extrabold tracking-tight` app-wide (reduced from `text-4xl` on 2026-10-04 at the user's request), always paired with `text-[#5A305A]`.
- **Page content wrapper**: no `max-w-7xl mx-auto` centering — pages fill available width, tight to the sidebar (`px-4 md:px-5 pb-4 md:pb-8 pt-3` on the scrollable content container in `DashboardLayout.tsx`).
- **Scrollbar hiding idiom** (used wherever a scrollable panel shouldn't show a visible scrollbar): `[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`.
- **App-wide greeting** ("Selamat pagi/siang/sore/malam, {Nama}" + time-of-day icon + day/date), rendered in `DashboardLayout.tsx`: `position: absolute` (not `fixed`) inside the `relative` scrollable content container, `top-3 right-0 mr-16`, so it scrolls away with page content and aligns with the page title row instead of pushing content down. Hidden on `/candidates/*` and on `/screening?selectedPosition=...` (its drill-down view) via a `hideGreeting` check in that component, because those pages have their own header content it would collide with. Notification bell is `fixed` separately, not part of this.

## Recent significant fixes (Recruitment Funnel, 2026-08-28)

The funnel used to compute each stage's count **independently** (e.g. "Lolos Screening" = `status_screening IN ('accepted','hired')`; "Tahap Psikotes" = has a `psikotes_schedules` row) — but in this app's real workflow HR can schedule psikotes without ever setting `status_screening = 'accepted'`, so stages weren't true nested subsets and the bar chart could visually widen instead of narrow. Fixed by moving all funnel math server-side into the two cumulative RPCs listed above (migrations `20260828000001`/`20260828000002`), plus a separate `count_pending_candidates` RPC redefining "Pending" as zero-progress (`20260828000000`), plus a later `rejected` column added to both funnel RPCs, appended (not woven into the cumulative chain) and placed between "Tahap Interview" and "Diterima (Hired)" in the bar order — putting it last made the chart widen at the end again (`20260828000003`).

**Action needed**: confirm with the user whether all four `20260828*` migration files have actually been run in Supabase Studio — as of the last session this had been communicated but not confirmed executed.

## Unsaved-input protection in modals (2026-09-29)

`AuthContext` replaces `profile` with a brand-new object every time Supabase re-checks the session — i.e. on **every browser tab switch**. Any modal `useEffect` that resets form state and lists `profile`/`userProfile` (or another parent-refreshed object) as a dependency will wipe what the user typed. Pattern to follow (used by `EvaluationModal` and `ReferenceCheckModal`):
- initialize form state once per open, guarded by a ref keyed on candidate + evaluation id (depend on ids, not objects);
- debounce-autosave a draft to `localStorage` and restore it on open ("Draft Ditemukan" toast), removing it after a successful save;
- call `setSessionProtected(isOpen)` from `useAuth()` so a false-alarm session event doesn't bounce the user to Login mid-entry.

Migration `20260929000000_add_schedule_no_show.sql` was run in Studio by the user (confirmed 2026-09-29).

**Upload CV (2026-10-04)**: CV uploads are **PDF only** (the n8n analysis workflow can't read Word) — enforced in both `UploadCV.tsx` and `BulkUploadModal.tsx`; the phone field is intentionally absent and the position intentionally resets after each upload (user decisions). `cv_uploads` was created in Studio (untracked); migration `20261004000000` adds `job_id` (→ `n8n_jobs`, for the Diproses/Selesai/Gagal badge) and `source_info`. `server.ts` retries the insert without those columns if the migration isn't run. Migrations `20261004000000` and `20261004000001` (archived_records) were run in Studio by the user (confirmed 2026-10-04). **Action needed**: confirm `server.ts` has been restarted/redeployed since (the archive snapshot, restore re-insert and cv_uploads job_id only take effect after that).

**Token Pelamar**: `registration_tokens.used_at` is the *send* time (set by Send Email/WA) until `submit_application_with_token` sets `is_used = true, used_at = NOW()` and inserts `external_data` in the same transaction — so for used tokens, `used_at` is the use time and equals that form's `external_data.created_at` (used to show "Digunakan … oleh …"). Recipient = candidate whose `confirmation_token` = token id. **Action needed**: confirm `server.ts` has been restarted/redeployed since then (restore-from-log link guard, no-show-aware archive status).

**Account monitoring + password reset (2026-10-23, Manajemen Pengguna)**: `components/ActivityTracker.tsx` (mounted in `App.tsx`) pings `/api/activity/ping` on every navigation + a 2-min heartbeat; the server stores `user_activity` (last seen / last path) and `user_page_visits` (history, 30 shown, 90 days kept by a pg_cron job) — migration `20261023000002_user_activity_tracking.sql`, service_role only. UUIDs in paths are stored as `:id`; `src/lib/pageLabels.ts` maps paths to page names (add a label there when adding a route). "Last login" is `auth.users.last_sign_in_at` (no migration). Online = seen within 5 min. Reset password generates a 12-char temporary password, sets `must_change_password` (same forced-change flow as new accounts) and returns it once (never logged); not allowed on your own account. **Action needed**: run migration `20261023000002` in Studio and restart `server.ts` — until then the page shows login times but no page history (the UI says so).

## Self-hosted Supabase server (HR instance = `project2`) — upgrade status & TODO (2026-10-24)

Server `172.16.9.5` (SSH alias `supabase-server`, user `jeffry`, key auth, LAN only; docker needs `sudo`, so Claude **writes `sudo docker ...` commands and the user runs them** — Claude only reads files / runs read-only probes over SSH). It hosts **3 live Supabase stacks in separate folders**: `/home/jeffry/supabase/project2` (**HR-ITS**, containers `*-2`, DB via Supavisor 5433, Kong 8001, `supabase2.waruna-group.co.id`), `project3` and `supabase-project` (other apps — **never touch them**). Always run compose from project2 only, name services explicitly with `up -d --no-deps <svc>`, never `down -v` / `system prune`.

**Done 2026-10-24** (backup + rollback files in `/home/jeffry/backups/project2-20261024-1600/`: `postgres.dump`, `globals.sql`, `storage.tgz`, original `docker-compose.yml`/`.env`/`kong.yml`, `docker-compose.yml.wave1-live`): auth v2.197.0, rest v14.18, realtime v2.143.3 (+`METRICS_JWT_SECRET`, `REGION`), storage v1.81.0 (+`AUTH_JWT_SECRET`; storage migrations are one-way), studio 2026.10.12, meta v0.100.0, edge-runtime v1.77.4, imgproxy v3.31.4, supavisor 2.9.13. Kong 2.8.1 / Postgres 15.8.1.085 / Logflare 1.31.2 / Vector deliberately unchanged (do NOT move to Postgres 17 or Envoy by just changing tags). Kong now blocks `/realtime/v1/api/tenants|openapi` (was open to the anon key).

**Kong gotcha:** the Kong entrypoint is `eval "echo \"$(cat temp.yml)\""`, so `volumes/api/kong.yml` must not contain a double quote, `$` or backtick (use single quotes). A bad file crash-loops Kong = API gateway down. Before restarting Kong, simulate on the server (`bash -c 'eval "echo \"$(cat FILE)\"" > /tmp/x.yml'` must exit 0) and parse the output as YAML.

### TODO — Logflare upgrade (do later, separate step; highest risk)
- `supabase/logflare:1.31.2` → `1.50.15` (+ keep `timberio/vector:0.53.0-alpine`). Why it is risky: almost every service has `depends_on: analytics (service_healthy)`, so a Logflare that never turns healthy blocks the whole stack on the next reboot/recreate; 19 minor versions with its own DB migrations (metadata lives in the **`_supabase`** database, which the earlier `pg_dump -d postgres` did NOT cover).
- Before: wait a few days of stable running, take a fresh backup (`pg_dump -Fc -d _supabase` + `-d postgres`, via `sudo docker exec supabase-db-2 pg_dump -h 127.0.0.1 -U supabase_admin ...`), copy backups off-server (NAS QNAP), pick a quiet time.
- Compose changes vs. current (from upstream `docker-compose.logs.yml`): image tag, healthcheck `CMD-SHELL curl -sSfL -o /dev/null http://localhost:4000/health` + `start_period: 30s`, env `LOGFLARE_SINGLE_TENANT`/`LOGFLARE_SUPABASE_MODE` as strings `"true"`; re-diff against upstream first (`CHANGELOG.md` in `supabase/supabase` → `docker/`).
- Do it as: edit compose on a copy → `config -q` → `cp` → `sudo docker compose pull analytics && sudo docker compose up -d --no-deps analytics` → wait until healthy → then `vector`. Verify: analytics `(healthy)`, Studio → Logs works, other services still healthy, `docker compose ps` clean. Rollback: restore compose (old tag) and recreate `analytics` (restore `_supabase` dump only if its migrations broke).

### Optional hardening (status)
- **Edge Functions route blocked — APPLIED 2026-10-24 (verified 403 with and without key):** `kong.yml.hardening` (route `/functions/v1/` was open without any key, `FUNCTIONS_VERIFY_JWT=false`; HR-ITS doesn't use Edge Functions). Replaces `cors` with `request-termination` 403. Apply: `cp $BK/kong.yml.hardening volumes/api/kong.yml && sudo docker compose restart kong`, then verify `/functions/v1/hello` = 403 and Auth/REST/Realtime/Storage probes still OK.
- **Studio/Meta → `postgres` role** — NOT started, needs its own plan: official guide requires `sh utils/reassign-owner.sh` (moves `public` object ownership from `supabase_admin` to `postgres`; no documented rollback), then `POSTGRES_USER_READ_WRITE: postgres` on studio and `PG_META_DB_USER: postgres` on meta. Only do after the DB is backed up and off-server, and test in Studio SQL editor (`select current_user;`). Low priority.

### Gateway cutover Kong → Envoy (2026-10-26, project2)
- `api-gw` = `envoyproxy/envoy:v1.39.1` (container `supabase-envoy-2`, host port `${KONG_HTTP_PORT}`=8001 → 8000, aliases `envoy` + `kong` so Studio/Edge Functions' `http://kong:8000` still works). Config lives in `/home/jeffry/supabase/project2/volumes/api/envoy/` (`envoy.yaml`, `cds.yaml`, `lds.template.yaml`, `docker-entrypoint.sh`; copies + upstream originals in `/home/jeffry/backups/project2-20261024-1600/envoy*/`). The entrypoint renders `lds.yaml` from the template with the keys from `.env` (ANON_KEY, SERVICE_ROLE_KEY, DASHBOARD_*, SUPABASE_PUBLIC_URL); legacy JWT keys only (`sb_` keys disabled).
- Patches vs upstream (re-apply when taking a newer upstream `lds.template.yaml`): `cds.yaml` Realtime address `realtime-dev.supabase-realtime-2`; `/functions/v1/` route RBAC → **DENY** (upstream leaves it open; HR-ITS doesn't use Edge Functions); route `timeout` 30s → 60s (Kong default); `/storage/v1/` `timeout: 0s` + `idle_timeout: 160s` (large uploads). Upstream already DENYs `/realtime/v1/api/tenants|openapi`, `/mcp`, `/api/mcp`. `GET /rest/v1/` (OpenAPI) is now service-key only (anon got 404 on Kong, 403 on Envoy) — intended.
- Verified after cutover: 31 requests (auth/rest/graphql/storage/realtime/pg/functions/mcp/Studio × none/anon/service) all equal to the Kong baseline, public domain via Cloudflare tunnel OK, Realtime WebSocket held 45 s (direct and `wss://` public), Studio OK, HR app 3005/8089 OK. CORS: Envoy reflects any origin (same permissiveness as Kong's `*`).
- **Rollback**: Kong is kept in compose behind `profiles: ["kong-rollback"]` (not started by default). To roll back: `cp $BK/docker-compose.yml.envoy-phaseA.proposed docker-compose.yml && sudo docker compose up -d --no-deps --force-recreate api-gw` (Envoy back to 8003), then `sudo docker compose up -d --no-deps kong` (Kong back on 8001). The Kong `kong.yml` quoting gotcha above only matters if Kong is brought back.
- Envoy logs print Lua `inline_code` deprecation warnings at start — upstream's own config, harmless for now ("will be removed from Envoy soon": re-check upstream before bumping Envoy).
- TODO later: delete the Kong service from compose after a few stable days; optional Studio restriction: in `lds.template.yaml` route `prefix: /` (Studio) add an RBAC DENY for requests that carry header `cf-connecting-ip` (= came through the Cloudflare tunnel) so Studio is LAN-only while the API stays public; also restrict LAN-exposed ports 5433-5435/6544-6546/8000-8003 (no host firewall).

### Login captcha: Cloudflare Turnstile (2026-10-26)
- Old captcha was client-side only (canvas text compared in the browser) — bypassable by calling `/auth/v1/token` directly. Now: `src/components/TurnstileWidget.tsx` (script from `challenges.cloudflare.com`, explicit render, token is single-use → `reset()` after each attempt) used in `Login.tsx` with `signInWithPassword({ options: { captchaToken } })`. Site key = `VITE_TURNSTILE_SITE_KEY` in the HR-ITS `.env` **before building the image** (Vite inlines it); empty = no widget (local dev). CSP `script-src` allows `https://challenges.cloudflare.com` (server.ts).
- Enforcement is in **Supabase Auth** (project2 `docker-compose.yml`, `auth` env): `GOTRUE_SECURITY_CAPTCHA_ENABLED=true`, `_PROVIDER=turnstile`, `_SECRET=${TURNSTILE_SECRET_KEY:?...}`; the secret lives only in project2 `.env` (never in chat/repo). Rollback file: `$BK/docker-compose.yml.pre-captcha-live`.
- Side effect handled: `/api/account/change-password` used to detect "new password == old" by trying `signInWithPassword` (breaks once captcha is enforced). It now calls RPC `public.password_matches_current` (migration `20261026000000`, service_role only) and falls back to the old probe if the function doesn't exist yet → run the migration BEFORE enabling captcha on Auth.
- Turnstile widgets only work on the hostnames listed in the Cloudflare widget (IP addresses like `172.16.9.5:8089` are not valid hostnames → login by IP fails once enforced; use the domain). Cloudflare test keys for dev: site `1x00000000000000000000AA` / secret `1x0000000000000000000000000000000AA` (always pass).
- Not done: `PublicCareer.tsx` (public /career + WA OTP) still uses a client-side canvas captcha; verify Turnstile server-side in Express (`siteverify`) if that form needs real protection.
