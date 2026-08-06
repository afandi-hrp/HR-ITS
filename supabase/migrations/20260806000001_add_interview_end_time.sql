-- Adds an optional end time for interview schedules (Jadwal Interview page
-- only, per request — psikotes schedules are untouched). Nullable: when not
-- set, the UI falls back to showing "- Selesai" (see SchedulingModal.tsx /
-- InterviewSchedules.tsx / ScheduleCalendar.tsx / SendEmailModal.tsx /
-- SendWAModal.tsx). Stored as a full timestamptz (same date as
-- schedule_date, different time) to match how schedule_date already works.
ALTER TABLE public.interview_schedules ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
