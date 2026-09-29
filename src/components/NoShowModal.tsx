import { useEffect, useState } from "react";
import { UserX, X, Loader2, CalendarClock, ThumbsDown, Save, CheckCircle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { formatDate } from "../lib/utils";
import { isNoShowSchedule } from "../lib/scheduleStatus";
import { useToast } from "./ui/use-toast";

export type NoShowFollowUp = "reschedule" | "reject" | "none";

export interface NoShowTarget {
  candidateName: string;
  table: "psikotes_schedules" | "interview_schedules";
  scheduleId: string;
  scheduleDate: string;
  label: string; // "Psikotes", "Interview HC", "Interview User"
}

const QUICK_REASONS = [
  "Tanpa kabar",
  "Berhalangan, minta dijadwalkan ulang",
  "Sudah diterima di tempat lain",
  "Mengundurkan diri",
];

// Red "Tidak Hadir …" status badge; the tooltip lists each missed schedule
// with its reason.
export function NoShowBadge({
  label,
  schedules,
}: {
  label: string;
  schedules: { is_confirmed?: boolean | null; is_no_show?: boolean | null; schedule_date: string; no_show_reason?: string | null }[] | null | undefined;
}) {
  const missed = (schedules || []).filter(isNoShowSchedule);
  const tooltip = missed
    .map((s) => `${formatDate(s.schedule_date)}: ${s.no_show_reason || "tanpa keterangan"}`)
    .join("\n");
  return (
    <span
      className="px-2 py-1 bg-rose-50 text-rose-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-rose-100 flex items-center gap-1"
      title={tooltip || undefined}
    >
      <UserX size={12} />
      {label}
      {missed.length > 1 ? ` (${missed.length}x)` : ""}
    </span>
  );
}

// Small per-schedule status tag: Selesai / Tidak Hadir (+reason) / Menunggu.
export function ScheduleStatusTag({
  schedule,
}: {
  schedule: { is_confirmed?: boolean | null; is_no_show?: boolean | null; no_show_reason?: string | null };
}) {
  if (schedule.is_confirmed) {
    return (
      <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-md">
        <CheckCircle size={12} /> Selesai
      </span>
    );
  }
  if (isNoShowSchedule(schedule)) {
    return (
      <span
        className="flex items-center gap-1 text-rose-600 font-medium text-xs bg-rose-50 px-2 py-1 rounded-md"
        title={schedule.no_show_reason || "Tanpa keterangan"}
      >
        <UserX size={12} /> Tidak Hadir
        {schedule.no_show_reason ? ` · ${schedule.no_show_reason}` : ""}
      </span>
    );
  }
  return (
    <span className="text-amber-600 font-medium text-xs bg-amber-50 px-2 py-1 rounded-md">
      Menunggu
    </span>
  );
}

// Marks one schedule as "Tidak Hadir" (no-show) with an optional reason, then
// hands the chosen next step (reschedule / reject / nothing) back to the
// caller, which owns the scheduling and rejection flows.
export default function NoShowModal({
  target,
  onClose,
  onSaved,
  followUps = ["reschedule", "reject", "none"],
}: {
  target: NoShowTarget | null;
  onClose: () => void;
  onSaved: (followUp: NoShowFollowUp) => void;
  // Next steps offered after saving; pages without a rejection flow (e.g.
  // the schedule pages) leave out "reject".
  followUps?: NoShowFollowUp[];
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState<NoShowFollowUp | null>(null);

  useEffect(() => {
    if (target) setReason("");
  }, [target]);

  if (!target) return null;

  const handleSave = async (followUp: NoShowFollowUp) => {
    setSaving(followUp);
    try {
      const { error } = await supabase
        .from(target.table)
        .update({
          is_no_show: true,
          is_confirmed: false,
          no_show_reason: reason.trim() || null,
        })
        .eq("id", target.scheduleId);
      if (error) throw error;

      toast({
        title: "Berhasil",
        description: `${target.candidateName} ditandai tidak hadir ${target.label}.`,
      });
      onSaved(followUp);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Gagal menandai tidak hadir.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
              <UserX size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#5A305A]">Tandai Tidak Hadir</h3>
              <p className="text-xs text-[#73507B]">
                {target.label} · {formatDate(target.scheduleDate)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving !== null}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-[#73507B]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          <p className="text-sm text-[#5A305A]">
            <span className="font-bold">{target.candidateName}</span> tidak hadir pada jadwal{" "}
            {target.label} ini? Jadwal tetap tersimpan di riwayat kandidat.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-bold text-[#73507B] uppercase tracking-widest ml-1">
              Alasan / Keterangan (opsional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    reason === r
                      ? "bg-rose-50 border-rose-300 text-rose-700"
                      : "bg-white border-slate-200 text-[#73507B] hover:bg-slate-50"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Contoh: sudah dihubungi via WA, tidak ada respon"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 text-sm"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-[#73507B] uppercase tracking-widest ml-1">
              Simpan lalu…
            </p>
            {followUps.includes("reschedule") && (
            <button
              onClick={() => handleSave("reschedule")}
              disabled={saving !== null}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-[#5A305A] bg-white border border-[#5A305A]/20 rounded-xl hover:bg-sky-50 transition-colors disabled:opacity-50"
            >
              {saving === "reschedule" ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
              Jadwalkan Ulang {target.label.startsWith("Interview") ? "Interview" : "Psikotes"}
            </button>
            )}
            {followUps.includes("reject") && (
            <button
              onClick={() => handleSave("reject")}
              disabled={saving !== null}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-rose-600 bg-white border border-rose-200 rounded-xl hover:bg-rose-50 transition-colors disabled:opacity-50"
            >
              {saving === "reject" ? <Loader2 size={16} className="animate-spin" /> : <ThumbsDown size={16} />}
              Tolak Kandidat
            </button>
            )}
            <button
              onClick={() => handleSave("none")}
              disabled={saving !== null}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-white bg-[#5A305A] rounded-xl hover:bg-[#3F223F] transition-colors disabled:opacity-50"
            >
              {saving === "none" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Simpan Saja (putuskan nanti)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
