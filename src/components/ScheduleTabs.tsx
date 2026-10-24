import { CalendarClock, CheckCircle2, UserX } from "lucide-react";
import { cn } from "../lib/utils";

export type ScheduleTab = "pending" | "confirmed" | "no_show";
export type ScheduleTabCounts = Record<ScheduleTab, number>;

const TABS: {
  id: ScheduleTab;
  label: string;
  Icon: typeof CalendarClock;
  active: string;
  idleBadge: string;
}[] = [
  { id: "pending", label: "Menunggu", Icon: CalendarClock, active: "bg-[#5A305A] text-white shadow-md shadow-[#5A305A]/25", idleBadge: "bg-[#FFF5C5] text-[#8a5a00]" },
  { id: "confirmed", label: "Selesai", Icon: CheckCircle2, active: "bg-emerald-600 text-white shadow-md shadow-emerald-600/25", idleBadge: "bg-emerald-50 text-emerald-700" },
  { id: "no_show", label: "Tidak Hadir", Icon: UserX, active: "bg-rose-600 text-white shadow-md shadow-rose-600/25", idleBadge: "bg-rose-50 text-rose-700" },
];

// Segmented tab bar shared by the Psikotes and Interview schedule pages.
// `counts` (from /api/schedules/:type/counts) is optional: until it loads the
// badges are simply hidden.
export default function ScheduleTabs({
  activeTab,
  onChange,
  counts,
}: {
  activeTab: ScheduleTab;
  onChange: (tab: ScheduleTab) => void;
  counts: ScheduleTabCounts | null;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex max-w-full overflow-x-auto items-center gap-1 p-1 bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl shadow-sm"
    >
      {TABS.map(({ id, label, Icon, active, idleBadge }) => {
        const isActive = activeTab === id;
        const count = counts?.[id];
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-center gap-2 px-4 h-9 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
              isActive ? active : "text-[#73507B] hover:bg-[#5A305A]/5 hover:text-[#5A305A]",
            )}
          >
            <Icon size={16} className="shrink-0" />
            {label}
            {count !== undefined && (
              <span
                className={cn(
                  "min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-[11px] font-extrabold leading-none text-center tabular-nums",
                  isActive ? "bg-white/25 text-white" : idleBadge,
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
