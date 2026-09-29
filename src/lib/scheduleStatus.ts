// Attendance state of psikotes / interview schedules. `is_confirmed` means
// the candidate attended (done); `is_no_show` means they were scheduled but
// didn't show up (see migration 20260929000000_add_schedule_no_show.sql).
// Anything else is still upcoming / awaiting confirmation.

type ScheduleLike = { is_confirmed?: boolean | null; is_no_show?: boolean | null };

export type ScheduleAttendance = "done" | "scheduled" | "no_show";

export const isNoShowSchedule = (s: ScheduleLike) => !!s.is_no_show && !s.is_confirmed;

// Still waiting to happen / be confirmed — the only schedules that should get
// "Konfirmasi Selesai", "Tandai Tidak Hadir", email/WA reminders, etc.
export const isPendingSchedule = (s: ScheduleLike) => !s.is_confirmed && !s.is_no_show;

export function getScheduleAttendance(s: ScheduleLike): ScheduleAttendance {
  if (s.is_confirmed) return "done";
  if (s.is_no_show) return "no_show";
  return "scheduled";
}

// Overall state of one stage (all psikotes rows, or all interview rows of
// one kind): attended at least once → done; otherwise any still pending
// (e.g. a reschedule after a no-show) → scheduled; otherwise only no-shows →
// no_show. null when there are no schedules at all.
export function getStageAttendance(
  schedules: ScheduleLike[] | null | undefined,
): ScheduleAttendance | null {
  if (!schedules || schedules.length === 0) return null;
  if (schedules.some((s) => s.is_confirmed)) return "done";
  if (schedules.some(isPendingSchedule)) return "scheduled";
  return "no_show";
}

export const ATTENDANCE_LABEL: Record<ScheduleAttendance, string> = {
  done: "Selesai",
  scheduled: "Terjadwal",
  no_show: "Tidak Hadir",
};
