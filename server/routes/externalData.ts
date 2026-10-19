import type { Express, RequestHandler } from "express";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, requireHrRead } from "../auth";
import { getSupabaseAdmin } from "../supabase";
import {
  canAccessCandidate,
  canViewAllCandidates,
  fetchExternalDataLinks,
  getAccessibleExternalUids,
  isHrAdmin,
  sanitizeRawData,
} from "../access";
import { normalizeEmail, normalizeName, normalizePhone } from "../../src/lib/normalize";
import { invalidateDocumentAccessCache } from "./documents";

// Application forms (external_data). Previously read straight from the
// browser under an RLS policy that let ANY logged-in user read every form
// (KTP number, address, salary) — see migration 20261018000002.

const toInt = (v: unknown, def: number, max = 1000) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerExternalDataRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // Data Eksternal page (HR only): paginated list + link status.
  app.get(
    "/api/external-data",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const page = toInt(req.query.page, 1, 100000);
      const pageSize = toInt(req.query.pageSize, 10, 200);
      const status = String(req.query.status || "all");
      const search = String(req.query.search || "").trim();

      let query = admin.from("external_data").select("*", { count: "exact" });

      if (status !== "all") {
        const [activeRes, logsRes] = await Promise.all([
          admin.from("candidates").select("linked_external_id").not("linked_external_id", "is", null),
          admin.from("candidate_logs").select("linked_external_id").not("linked_external_id", "is", null),
        ]);
        if (activeRes.error) throw activeRes.error;
        if (logsRes.error) throw logsRes.error;

        const activeUids = (activeRes.data || []).map((d) => d.linked_external_id).filter(Boolean);
        // A form shared by an archived application and a later active
        // re-application counts as active, so "archived" = archived only.
        const activeSet = new Set(activeUids);
        const archivedUids = (logsRes.data || [])
          .map((d) => d.linked_external_id)
          .filter((uid) => uid && !activeSet.has(uid));

        if (status === "hide_archived" && archivedUids.length > 0) {
          query = query.not("uid_sheet", "in", `(${archivedUids.join(",")})`);
        } else if (status === "available") {
          const allUsed = [...activeUids, ...archivedUids];
          if (allUsed.length > 0) query = query.not("uid_sheet", "in", `(${allUsed.join(",")})`);
        } else if (status === "active") {
          query = query.in("uid_sheet", activeUids.length > 0 ? activeUids : ["__EMPTY__"]);
        } else if (status === "archived") {
          query = query.in("uid_sheet", archivedUids.length > 0 ? archivedUids : ["__EMPTY__"]);
        }
      }

      if (search) {
        // Same full-text search the page used before (to_tsvector(json)).
        query = query.textSearch("raw_data", `'${search.replace(/'/g, "''")}'`);
      }

      const from = (page - 1) * pageSize;
      const { data, error, count } = await query
        .range(from, from + pageSize - 1)
        .order("created_at", { ascending: false });
      if (error) throw error;

      let rows: any[] = (data || []).map((item) => ({
        uid_sheet: item.uid_sheet,
        ...(sanitizeRawData(item.raw_data, req.profile) || {}),
        _submitted_at: item.created_at,
      }));

      if (rows.length > 0) {
        const links = await fetchExternalDataLinks(admin, rows.map((d) => d.uid_sheet));
        rows = rows.map((item) => {
          const itemLinks = links.filter((l) => l.linked_external_id === item.uid_sheet);
          const activeLinks = itemLinks.filter((l) => l.status === "active");
          const archivedLinks = itemLinks.filter((l) => l.status === "archived");
          return {
            ...item,
            _link_status: activeLinks.length ? "active" : archivedLinks.length ? "archived" : "available",
            _active_links: activeLinks,
            _archived_links: archivedLinks,
          };
        });
      }

      auditLog(req, "external_data.list", { page, count: rows.length, search: search || undefined });
      res.json({ rows, total: count ?? 0 });
    }),
  );

  // Raw forms by uid (Live Tracking's "Sumber CV" fallback). HR + READ_ONLY
  // (read-only POST, allow-listed in requireAuth; salary stripped).
  app.post(
    "/api/external-data/by-uids",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const uids: string[] = Array.isArray(req.body?.uids)
        ? req.body.uids.filter((u: unknown) => typeof u === "string")
        : [];
      if (uids.length === 0) return res.json({ rows: [] });
      const admin = getSupabaseAdmin();
      const rows: any[] = [];
      for (let i = 0; i < uids.length; i += 200) {
        const { data, error } = await admin
          .from("external_data")
          .select("uid_sheet, raw_data")
          .in("uid_sheet", uids.slice(i, i + 200));
        if (error) throw error;
        rows.push(...(data || []).map((r) => ({ ...r, raw_data: sanitizeRawData(r.raw_data, req.profile) })));
      }
      res.json({ rows });
    }),
  );

  // Which applications use each form. Complete answer (service_role) for
  // HR; other roles only learn about forms they can already access.
  app.post(
    "/api/external-data/links",
    requireAuth,
    handle(async (req, res) => {
      let uids: string[] = Array.isArray(req.body?.uids)
        ? req.body.uids.filter((u: unknown) => typeof u === "string")
        : [];
      const admin = getSupabaseAdmin();
      const accessible = await getAccessibleExternalUids(admin, req.profile);
      if (accessible !== "all") uids = uids.filter((u) => accessible.has(u));
      res.json({ links: await fetchExternalDataLinks(admin, uids) });
    }),
  );

  // Candidate profile: the linked form, or match suggestions when none is
  // linked yet. Matching used to download EVERY form into the browser.
  app.get(
    "/api/external-data/for-candidate/:candidateId",
    requireAuth,
    handle(async (req, res) => {
      const candidateId = req.params.candidateId;
      const archived = req.query.archived === "1";
      const admin = getSupabaseAdmin();

      // Archived applications (candidate_logs) are HR-only, same as RLS.
      if (archived ? !canViewAllCandidates(req.profile) : !(await canAccessCandidate(admin, req.profile, candidateId))) {
        throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
      }

      const { data: candidate, error: candError } = await admin
        .from(archived ? "candidate_logs" : "candidates")
        .select("id, full_name, email, phone, linked_external_id")
        .eq("id", candidateId)
        .maybeSingle();
      if (candError) throw candError;
      if (!candidate) throw new HttpError(404, "Kandidat tidak ditemukan.");

      if (candidate.linked_external_id) {
        const { data: row, error } = await admin
          .from("external_data")
          .select("*")
          .eq("uid_sheet", candidate.linked_external_id)
          .maybeSingle();
        if (error) throw error;
        if (row) {
          const links = await fetchExternalDataLinks(admin, [row.uid_sheet]);
          auditLog(req, "external_data.view", { candidateId, uid_sheet: row.uid_sheet });
          return res.json({
            linked: { uid_sheet: row.uid_sheet, ...(sanitizeRawData(row.raw_data, req.profile) || {}) },
            linkedElsewhere: links.filter((l) => l.id !== candidate.id),
            suggestions: [],
          });
        }
      }

      const normEmail = normalizeEmail(candidate.email);
      const normPhone = normalizePhone(candidate.phone);
      const normName = normalizeName(candidate.full_name);

      const { data: all, error } = await admin.from("external_data").select("*");
      if (error) throw error;

      const matches = (all || [])
        .map((item) => {
          // Which of the candidate's fields this row matched on, shown on
          // the suggestion card so HR can judge how reliable the match is.
          const reasons = new Set<"email" | "phone" | "name">();
          const raw = item.raw_data;
          if (!raw) return { item, reasons };
          Object.entries(raw).forEach(([key, val]) => {
            if (typeof val !== "string") return;
            const lowerKey = key.toLowerCase();
            if (lowerKey.includes("email") && normEmail && normalizeEmail(val) === normEmail)
              reasons.add("email");
            if (
              (lowerKey.includes("phone") ||
                lowerKey.includes("telepon") ||
                lowerKey.includes("hp") ||
                lowerKey.includes("whatsapp")) &&
              normPhone !== "" &&
              normalizePhone(val) === normPhone
            )
              reasons.add("phone");
            if ((lowerKey.includes("name") || lowerKey.includes("nama")) && normName && normalizeName(val) === normName)
              reasons.add("name");
          });
          return { item, reasons };
        })
        .filter(({ reasons }) => reasons.size > 0);

      // A form linked to an *archived* application (same person
      // re-applying) may be linked again; one held by another *active*
      // application may not.
      const links = (await fetchExternalDataLinks(admin, matches.map(({ item }) => item.uid_sheet))).filter(
        (l) => l.id !== candidate.id,
      );

      const suggestions = matches.map(({ item, reasons }) => {
        const itemLinks = links.filter((l) => l.linked_external_id === item.uid_sheet);
        return {
          uid_sheet: item.uid_sheet,
          ...(sanitizeRawData(item.raw_data, req.profile) || {}),
          _submitted_at: item.created_at,
          _match_reasons: Array.from(reasons),
          _archived_links: itemLinks.filter((l) => l.status === "archived"),
          _active_links: itemLinks.filter((l) => l.status === "active"),
        };
      });

      auditLog(req, "external_data.suggest", { candidateId, matches: suggestions.length });
      res.json({ linked: null, linkedElsewhere: [], suggestions });
    }),
  );

  // Link / unlink a form to an application. The "not held by another
  // ACTIVE application" rule is checked here with a complete view —
  // from the browser a non-HR user's RLS hid other users' candidates and
  // all of candidate_logs, so the check could silently pass.
  const resolveTarget = async (req: any, candidateId: string) => {
    const admin = getSupabaseAdmin();
    const { data: active, error } = await admin
      .from("candidates")
      .select("id")
      .eq("id", candidateId)
      .maybeSingle();
    if (error) throw error;
    if (active) {
      if (!(await canAccessCandidate(admin, req.profile, candidateId))) {
        throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
      }
      return "candidates" as const;
    }
    if (!isHrAdmin(req.profile)) throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
    return "candidate_logs" as const;
  };

  app.post(
    "/api/external-data/link",
    requireAuth,
    handle(async (req, res) => {
      const { candidateId, uid_sheet } = req.body || {};
      if (typeof candidateId !== "string" || typeof uid_sheet !== "string" || !candidateId || !uid_sheet) {
        throw new HttpError(400, "candidateId dan uid_sheet wajib diisi.");
      }
      const table = await resolveTarget(req, candidateId);
      const admin = getSupabaseAdmin();

      const { data: form, error: formError } = await admin
        .from("external_data")
        .select("uid_sheet")
        .eq("uid_sheet", uid_sheet)
        .maybeSingle();
      if (formError) throw formError;
      if (!form) throw new HttpError(404, "Data eksternal tidak ditemukan.");

      const activeHolder = (await fetchExternalDataLinks(admin, [uid_sheet])).find(
        (l) => l.status === "active" && l.id !== candidateId,
      );
      if (activeHolder) {
        return res.status(409).json({
          error: `Data ini masih ditautkan ke lamaran aktif ${activeHolder.full_name || "-"} (${activeHolder.position || "-"}). Arsipkan lamaran tersebut terlebih dahulu.`,
        });
      }

      const { error } = await admin
        .from(table)
        .update({ linked_external_id: uid_sheet, updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      if (error) throw error;
      invalidateDocumentAccessCache();
      auditLog(req, "external_data.link", { candidateId, uid_sheet, table });
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/external-data/unlink",
    requireAuth,
    handle(async (req, res) => {
      const { candidateId } = req.body || {};
      if (typeof candidateId !== "string" || !candidateId) throw new HttpError(400, "candidateId wajib diisi.");
      const table = await resolveTarget(req, candidateId);
      const { error } = await getSupabaseAdmin()
        .from(table)
        .update({ linked_external_id: null, updated_at: new Date().toISOString() })
        .eq("id", candidateId);
      if (error) throw error;
      invalidateDocumentAccessCache();
      auditLog(req, "external_data.unlink", { candidateId, table });
      res.json({ success: true });
    }),
  );
}
