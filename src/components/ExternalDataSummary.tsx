import React from "react";
import {
  Mail,
  Phone,
  User,
  MapPin,
  GraduationCap,
  Briefcase,
  CalendarDays,
  AlertTriangle,
  History,
  Info,
} from "lucide-react";
import { cn, formatDate } from "../lib/utils";
import { ExternalDataSummary, getInitials } from "../lib/externalDataSummary";
import { ExternalDataLink } from "../lib/externalDataLinks";
import { CandidateAvatar } from "./CandidateAvatar";

// Photo (or initials) + applicant name + "Melamar sebagai …" line, plus an
// optional slot for status badges underneath.
export function ExternalDataHeader({
  row,
  summary,
  children,
}: {
  row: Record<string, any>;
  summary: ExternalDataSummary;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 min-w-0">
      <CandidateAvatar
        source={row}
        alt={summary.name || "Foto pelamar"}
        className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-white shadow-sm"
        fallback={
          <div className="w-12 h-12 rounded-full shrink-0 bg-gradient-to-br from-indigo-500 to-purple-500 text-white font-bold flex items-center justify-center shadow-sm">
            {getInitials(summary.name)}
          </div>
        }
      />
      <div className="min-w-0 flex-1">
        <h3
          className="font-bold text-lg leading-tight text-[#5A305A] truncate"
          title={summary.name || undefined}
        >
          {summary.name || "Nama tidak diisi"}
        </h3>
        <p className="text-sm text-[#73507B] mt-0.5 truncate" title={summary.position || undefined}>
          Melamar sebagai{" "}
          <span className="font-semibold text-indigo-700">
            {summary.position || "-"}
          </span>
        </p>
        {children && <div className="flex flex-wrap gap-1.5 mt-2">{children}</div>}
      </div>
    </div>
  );
}

const describeLink = (l: ExternalDataLink) =>
  `${l.full_name || "-"} – ${l.position || "-"}`;

// Plain-language notes about a form that is (or would be) shared between
// applications of the same person, and about the form's position differing
// from this application's position (e.g. applied for Finance on the form,
// now re-applying for Purchasing). Renders nothing when there's nothing to say.
export function ExternalLinkNotes({
  formPosition,
  candidatePosition,
  archivedLinks,
  activeLinks,
}: {
  formPosition: string | null;
  candidatePosition: string | null | undefined;
  archivedLinks: ExternalDataLink[];
  activeLinks: ExternalDataLink[];
}) {
  const positionDiffers =
    !!formPosition &&
    !!candidatePosition &&
    formPosition.trim().toLowerCase() !== candidatePosition.trim().toLowerCase();

  if (!positionDiffers && archivedLinks.length === 0 && activeLinks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {activeLinks.length > 0 && (
        <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs p-2.5 rounded-lg">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            Form ini masih ditautkan ke lamaran aktif:{" "}
            <span className="font-semibold">{activeLinks.map(describeLink).join("; ")}</span>.
            Arsipkan lamaran tersebut terlebih dahulu sebelum menautkan form ini ke lamaran lain.
          </span>
        </div>
      )}
      {archivedLinks.length > 0 && (
        <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 text-sky-800 text-xs p-2.5 rounded-lg">
          <History size={14} className="shrink-0 mt-0.5" />
          <span>
            Form ini juga dipakai lamaran sebelumnya (sudah diarsipkan):{" "}
            <span className="font-semibold">{archivedLinks.map(describeLink).join("; ")}</span>.
          </span>
        </div>
      )}
      {positionDiffers && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2.5 rounded-lg">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span>
            Posisi di form: <span className="font-semibold">{formPosition}</span> · Posisi
            lamaran ini: <span className="font-semibold">{candidatePosition}</span>
          </span>
        </div>
      )}
    </div>
  );
}

// Labeled key facts about the applicant, in plain language.
export function ExternalDataFields({
  summary,
  highlight = [],
  className,
}: {
  summary: ExternalDataSummary;
  // Fields to mark as matching the candidate profile (e.g. ["email"]).
  highlight?: ("email" | "phone" | "name")[];
  className?: string;
}) {
  const sexAge = [summary.sex, summary.age !== null ? `${summary.age} tahun` : null]
    .filter(Boolean)
    .join(", ");

  const fields = [
    { key: "email", icon: Mail, label: "Email", value: summary.email },
    { key: "phone", icon: Phone, label: "No. HP", value: summary.phone },
    { key: "sexAge", icon: User, label: "Jenis Kelamin / Usia", value: sexAge || null },
    { key: "address", icon: MapPin, label: "Domisili", value: summary.address },
    { key: "education", icon: GraduationCap, label: "Pendidikan Terakhir", value: summary.education },
    { key: "lastJob", icon: Briefcase, label: "Pengalaman Terakhir", value: summary.lastJob },
    {
      key: "submittedAt",
      icon: CalendarDays,
      label: "Tanggal Kirim Form",
      value: summary.submittedAt ? formatDate(summary.submittedAt) : null,
    },
  ];

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3", className)}>
      {fields.map(({ key, icon: Icon, label, value }) => {
        const isMatch = highlight.includes(key as any);
        return (
          <div key={key} className="flex items-start gap-2 min-w-0 text-sm">
            <Icon
              size={15}
              className={cn("mt-0.5 shrink-0", isMatch ? "text-emerald-600" : "text-indigo-400")}
            />
            <div className="min-w-0">
              <span className="block text-[11px] font-medium text-slate-500">
                {label}
                {isMatch && (
                  <span className="ml-1.5 text-emerald-600 font-semibold">✓ sama dengan profil</span>
                )}
              </span>
              <span
                className={cn(
                  "block line-clamp-2 break-words",
                  value ? "text-[#5A305A] font-medium" : "text-slate-400",
                )}
                title={value || undefined}
              >
                {value || "-"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
