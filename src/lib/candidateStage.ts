import { getStageAttendance } from "./scheduleStatus";

export const isUserInterview = (s: any) => s.additional_notes?.startsWith("[USER]");

// A candidate's current pipeline stage ("Belum Diproses", "Jadwal Psikotes",
// "Interview Selesai HC", "Hired", ...). Shared by Screening (badges, filters,
// position cards) and Live Tracking (Status column), so both always agree.
// Expects psikotes_schedules / interview_schedules (with additional_notes) and
// candidate_evaluations(evaluation_type) to be loaded on the candidate.
export function getCandidateStage(candidate: any): string {
  if (candidate.status_screening === "hired") return "Hired";
  if (candidate.status_screening === "rejected") return "Rejected";

  if (candidate.candidate_evaluations?.some((e: any) => e.evaluation_type === "REFERENCE_CHECK")) {
    return "Reference Check";
  }

  // If they already have an interview status/result (legacy candidates with no schedule rows), interview is done
  if (candidate.interview_status && candidate.interview_status.trim() !== '') return "Interview Selesai User";

  // Schedule checks come first so we see them in the pipeline correctly
  const interviewSchedules = candidate.interview_schedules || [];
  const userSchedules = interviewSchedules.filter(isUserInterview);
  const hcSchedules = interviewSchedules.filter((s: any) => !isUserInterview(s));

  const stageLabel = {
    done: "Interview Selesai",
    scheduled: "Jadwal Interview",
    no_show: "Tidak Hadir Interview",
  } as const;
  const userStage = getStageAttendance(userSchedules);
  if (userStage) return `${stageLabel[userStage]} User`;
  const hcStage = getStageAttendance(hcSchedules);
  if (hcStage) return `${stageLabel[hcStage]} HC`;

  // If they already have a psikotes status/result, it means psikotes is done
  if (candidate.psikotes_status && candidate.psikotes_status.trim() !== '') return "Psikotes Selesai";

  const psikotesStage = getStageAttendance(candidate.psikotes_schedules);
  if (psikotesStage === "done") return "Psikotes Selesai";
  if (psikotesStage === "scheduled") return "Jadwal Psikotes";
  if (psikotesStage === "no_show") return "Tidak Hadir Psikotes";

  if (candidate.status_screening === "accepted") return "Lolos"; // Lolos screening awal

  // We can also assume "invited" might mean they are waiting for schedule?
  // We will just default to Belum Diproses for now if they don't have schedules yet
  return "Belum Diproses";
}
