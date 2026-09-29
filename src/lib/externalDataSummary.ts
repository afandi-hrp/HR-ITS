import { calculateAge, formatDateDMY } from "./utils";

// Human-readable summary of one external_data row (a submitted
// ApplicationForm, flattened as { uid_sheet, ...raw_data }). Known form keys
// (see the formData defaults in pages/ApplicationForm.tsx) are read first;
// the fuzzy key matching is a fallback for older sheet-based rows whose
// column names don't follow the form's keys.
export interface ExternalDataSummary {
  name: string | null;
  position: string | null;
  email: string | null;
  phone: string | null;
  sex: string | null;
  age: number | null;
  birth: string | null;
  address: string | null;
  education: string | null;
  lastJob: string | null;
  submittedAt: string | null;
}

const clean = (val: unknown): string | null => {
  if (typeof val === "number") return String(val);
  if (typeof val !== "string") return null;
  const trimmed = val.trim();
  return trimmed === "" || trimmed === "-" ? null : trimmed;
};

const pick = (
  row: Record<string, any>,
  exactKeys: string[],
  fuzzyIncludes: string[] = [],
  fuzzyExcludes: string[] = [],
): string | null => {
  for (const key of exactKeys) {
    const val = clean(row[key]);
    if (val) return val;
  }
  for (const [key, raw] of Object.entries(row)) {
    const lowerKey = key.toLowerCase();
    if (
      fuzzyIncludes.some((f) => lowerKey.includes(f)) &&
      !fuzzyExcludes.some((f) => lowerKey.includes(f))
    ) {
      const val = clean(raw);
      if (val) return val;
    }
  }
  return null;
};

const summarizeEducation = (list: unknown): string | null => {
  if (!Array.isArray(list)) return null;
  // formal_education is ordered lowest → highest level (SMA, Diploma, S1, S2),
  // so the last filled-in row is the highest education.
  const filled = list.filter((e) => e && clean(e.institution));
  const top = filled[filled.length - 1];
  if (!top) return null;
  const level = clean(top.level)?.replace(/\s*\(.*\)\s*$/, "");
  return [level, clean(top.institution), clean(top.major)]
    .filter(Boolean)
    .join(" · ");
};

const summarizeLastJob = (list: unknown): string | null => {
  if (!Array.isArray(list)) return null;
  const filled = list.filter((w) => w && clean(w.company_name));
  if (filled.length === 0) return null;
  const job =
    filled.find((w) => w.is_current_job) ||
    [...filled].sort((a, b) =>
      String(b.period_end || "").localeCompare(String(a.period_end || "")),
    )[0];
  const role = clean(job.current_position);
  const company = clean(job.company_name);
  const until = job.is_current_job ? "sekarang" : clean(job.period_end)?.slice(0, 4);
  const since = clean(job.period_start)?.slice(0, 4);
  const period = since || until ? ` (${since || "?"} – ${until || "?"})` : "";
  return `${role ? `${role} di ` : ""}${company}${period}`;
};

export function getExternalDataSummary(row: Record<string, any>): ExternalDataSummary {
  const dob = pick(row, ["date_of_birth"], ["tanggal_lahir", "birth_date"]);
  const pob = pick(row, ["place_of_birth"], ["tempat_lahir"]);

  return {
    name: pick(row, ["full_name", "nama_lengkap", "nama"], ["nama", "name"], [
      "company",
      "institution",
      "signature",
      "father",
      "mother",
    ]),
    position: pick(row, ["position"], ["posisi", "jabatan", "melamar", "position"], [
      "current_position",
      "waruna",
    ]),
    email: pick(row, ["email"], ["email", "e-mail"]),
    phone: pick(row, ["mobile_phone", "home_phone"], ["telepon", "phone", "whatsapp", "no_hp"], [
      "emergency",
    ]),
    sex: pick(row, ["sex", "jenis_kelamin", "gender"]),
    age: calculateAge(dob),
    birth: [pob, dob ? formatDateDMY(dob) : null].filter(Boolean).join(", ") || null,
    address: pick(row, ["current_address", "address_ktp"], ["alamat", "domisili"]),
    education: summarizeEducation(row.formal_education),
    lastJob: summarizeLastJob(row.work_experience),
    submittedAt: clean(row._submitted_at),
  };
}

export function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
