import { api } from "./api";

// One external_data row (a submitted application form) may be linked to more
// than one application of the same person: an archived one (candidate_logs)
// plus a later re-application (candidates / candidate_logs). Anything that
// deletes external_data must therefore first check that no *other*
// application still points at it — the FK is ON DELETE SET NULL, so deleting
// a shared row would silently strip the form and its documents from the
// other application. The authoritative versions of these checks live in
// server/access.ts (used by link/unlink and Log deletion).

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
  const { links } = await api.post<{ links: ExternalDataLink[] }>(
    "/api/external-data/links",
    { uids },
  );
  return links;
}
