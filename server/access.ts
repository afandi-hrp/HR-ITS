import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthProfile } from "./auth";
import { SALARY_FORM_FIELDS } from "../src/lib/documentPaths";

// Access model (mirrors the live RLS on `candidates`, verified 2026-10-18):
//   HR_ADMIN      -> everything.
//   anyone else   -> only candidates they're assigned to via
//                    candidate_assignees, and the application form
//                    (external_data) linked to those candidates.
//   USER_MANAGER  -> additionally never sees remuneration data
//                    (usePermissions.hideSalary), enforced here instead of
//                    only being hidden in the UI.

export const isHrAdmin = (profile: AuthProfile) => profile.role === "HR_ADMIN";

export async function getAssignedCandidateIds(
  admin: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data, error } = await admin
    .from("candidate_assignees")
    .select("candidate_id")
    .eq("user_id", userId);
  if (error) throw error;
  return (data || []).map((r) => r.candidate_id);
}

export async function canAccessCandidate(
  admin: SupabaseClient,
  profile: AuthProfile,
  candidateId: string,
): Promise<boolean> {
  if (isHrAdmin(profile)) return true;
  const { data, error } = await admin
    .from("candidate_assignees")
    .select("candidate_id")
    .eq("user_id", profile.id)
    .eq("candidate_id", candidateId)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

// uid_sheet values of forms linked to the caller's assigned candidates.
// "all" for HR_ADMIN.
export async function getAccessibleExternalUids(
  admin: SupabaseClient,
  profile: AuthProfile,
): Promise<"all" | Set<string>> {
  if (isHrAdmin(profile)) return "all";
  const ids = await getAssignedCandidateIds(admin, profile.id);
  if (ids.length === 0) return new Set();
  const { data, error } = await admin
    .from("candidates")
    .select("linked_external_id")
    .in("id", ids)
    .not("linked_external_id", "is", null);
  if (error) throw error;
  return new Set((data || []).map((r) => r.linked_external_id as string));
}

export function canSeeSalary(profile: AuthProfile) {
  return profile.role !== "USER_MANAGER";
}

// Removes remuneration fields from a form for roles that may not see them.
export function sanitizeRawData<T extends Record<string, any> | null | undefined>(
  raw: T,
  profile: AuthProfile,
): T {
  if (!raw || canSeeSalary(profile)) return raw;
  const copy: Record<string, any> = { ...raw };
  for (const key of SALARY_FORM_FIELDS) delete copy[key];
  return copy as T;
}

export interface ExternalDataLink {
  id: string;
  full_name: string | null;
  position: string | null;
  linked_external_id: string;
  status: "active" | "archived";
  status_screening?: string | null;
}

// Every application (active + archived) linked to the given forms. Uses
// service_role so the answer is complete regardless of the caller's RLS
// view — the "is this form still used elsewhere" checks depend on that.
export async function fetchExternalDataLinks(
  admin: SupabaseClient,
  uids: string[],
): Promise<ExternalDataLink[]> {
  const unique = Array.from(new Set(uids.filter(Boolean)));
  if (unique.length === 0) return [];
  const out: ExternalDataLink[] = [];
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    const [activeRes, logsRes] = await Promise.all([
      admin
        .from("candidates")
        .select("id, full_name, position, linked_external_id")
        .in("linked_external_id", batch),
      admin
        .from("candidate_logs")
        .select("id, full_name, position, linked_external_id, status_screening")
        .in("linked_external_id", batch),
    ]);
    if (activeRes.error) throw activeRes.error;
    if (logsRes.error) throw logsRes.error;
    out.push(
      ...(activeRes.data || []).map((d: any) => ({ ...d, status: "active" as const })),
      ...(logsRes.data || []).map((d: any) => ({ ...d, status: "archived" as const })),
    );
  }
  return out;
}

// Of `uids`, those still linked to an application other than the archive
// rows in `excludeLogIds` (the ones being deleted). See CLAUDE.md
// "External data": deleting a shared form would strip it from the other
// application via the ON DELETE SET NULL FK.
export async function findExternalIdsStillInUse(
  admin: SupabaseClient,
  uids: string[],
  excludeLogIds: string[],
): Promise<Set<string>> {
  const links = await fetchExternalDataLinks(admin, uids);
  const exclude = new Set(excludeLogIds);
  return new Set(
    links
      .filter((l) => !(l.status === "archived" && exclude.has(l.id)))
      .map((l) => l.linked_external_id),
  );
}

// Blacklist flags for archive/log rows (email, phone or NIK match).
export async function attachBlacklist(
  admin: SupabaseClient,
  rows: any[],
): Promise<any[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await admin
    .from("blacklisted_candidates")
    .select("email, phone, identity_number, reason");
  if (error) {
    console.error("Error fetching blacklist:", error);
    return rows;
  }
  if (!data || data.length === 0) return rows;
  return rows.map((d) => {
    const nik = d.external_data?.raw_data?.identity_number;
    const hit = data.find(
      (b) =>
        (b.email && b.email === d.email) ||
        (b.phone && b.phone === d.phone) ||
        (nik && b.identity_number && b.identity_number === nik),
    );
    return { ...d, is_blacklisted: !!hit, blacklist_reason: hit?.reason };
  });
}
