import { supabase } from "./supabase";

// One external_data row (a submitted application form) may be linked to more
// than one application of the same person: an archived one (candidate_logs)
// plus a later re-application (candidates / candidate_logs). Anything that
// deletes external_data must therefore first check that no *other*
// application still points at it — the FK is ON DELETE SET NULL, so deleting
// a shared row would silently strip the form and its documents from the
// other application.

export interface ExternalDataLink {
  id: string;
  full_name: string | null;
  position: string | null;
  linked_external_id: string;
  status: "active" | "archived";
  status_screening?: string | null;
}

export async function fetchExternalDataLinks(
  uids: string[],
): Promise<ExternalDataLink[]> {
  if (uids.length === 0) return [];
  const [activeRes, logsRes] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name, position, linked_external_id")
      .in("linked_external_id", uids),
    supabase
      .from("candidate_logs")
      .select("id, full_name, position, linked_external_id, status_screening")
      .in("linked_external_id", uids),
  ]);
  if (activeRes.error) throw activeRes.error;
  if (logsRes.error) throw logsRes.error;

  return [
    ...(activeRes.data || []).map((d) => ({ ...d, status: "active" as const })),
    ...(logsRes.data || []).map((d) => ({ ...d, status: "archived" as const })),
  ];
}

// Of `uids`, which are still linked to some application other than the
// archive rows in `excludeLogIds` (the ones about to be deleted).
export async function findExternalIdsStillInUse(
  uids: string[],
  excludeLogIds: string[],
): Promise<Set<string>> {
  const links = await fetchExternalDataLinks(uids);
  const exclude = new Set(excludeLogIds);
  return new Set(
    links
      .filter((l) => !(l.status === "archived" && exclude.has(l.id)))
      .map((l) => l.linked_external_id),
  );
}
