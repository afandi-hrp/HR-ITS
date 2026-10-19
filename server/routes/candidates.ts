import type { Express, RequestHandler } from "express";
import multer from "multer";
import {
  auditLog,
  handle,
  HttpError,
  requireAuth as realRequireAuth,
  requireHrAdmin,
  requireHrRead,
  requireRole,
  type AuthedRequest,
} from "../auth";
import { getSupabaseAdmin } from "../supabase";
import {
  attachBlacklist,
  canAccessCandidate,
  canViewAllCandidates,
  getAssignedCandidateIds,
  isHrAdmin,
  sanitizeRawData,
} from "../access";
import { collectStorageRefs, PRIVATE_BUCKET } from "../../src/lib/documentPaths";
import { invalidateDocumentAccessCache } from "./documents";

// Active candidates (Screening + Candidate Profile). Fase 2 of the backend
// migration — writes used to go straight from the browser under RLS that
// let an assigned user change ANY column of their candidate.

const SCREENING_FETCH_LIMIT = 2000;
const SCHEDULE_COLUMNS =
  "id, is_confirmed, is_no_show, no_show_reason, schedule_date, location_type, location_detail, additional_notes, candidate_id, created_at, updated_at";
const SCREENING_SELECT = `*, psikotes_schedules(${SCHEDULE_COLUMNS}), interview_schedules(${SCHEDULE_COLUMNS}), candidate_evaluations(evaluation_type), external_data(raw_data), candidate_assignees(user_id, profiles(full_name))`;
const PROFILE_SELECT =
  "*, psikotes_schedules(id, is_confirmed, is_no_show, no_show_reason, schedule_date), interview_schedules(id, is_confirmed, is_no_show, no_show_reason, schedule_date, additional_notes), candidate_assignees(user_id, profiles(id, full_name, role, department))";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const cleanSearch = (v: unknown) => String(v || "").replace(/[,()*%\\]/g, " ").trim();
const nowIso = () => new Date().toISOString();

const psikotesUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new HttpError(400, "Hasil psikotes harus berupa file PDF."));
  },
});

// The embed may come back as an array; strip remuneration fields for
// USER_MANAGER (usePermissions.hideSalary).
function shapeCandidateRow(row: any, req: AuthedRequest) {
  let ext = row.external_data;
  if (Array.isArray(ext)) ext = ext[0] ?? null;
  if (ext?.raw_data) ext = { ...ext, raw_data: sanitizeRawData(ext.raw_data, req.profile) };
  return { ...row, external_data: ext };
}

async function requireActiveCandidate(id: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("candidates")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, "Kandidat tidak ditemukan atau sudah diarsipkan.");
}

// "candidates" or "candidate_logs" (HR only), like the old browser code that
// checked candidates first and fell back to the archive.
async function resolveCandidateTable(req: AuthedRequest, id: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from("candidates").select("id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (data) {
    if (!(await canAccessCandidate(admin, req.profile, id))) {
      throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
    }
    return "candidates" as const;
  }
  if (!canViewAllCandidates(req.profile)) throw new HttpError(404, "Kandidat tidak ditemukan.");
  return "candidate_logs" as const;
}

async function loadArchivedRecords(id: string) {
  const { data } = await getSupabaseAdmin()
    .from("candidate_logs")
    .select("archived_records")
    .eq("id", id)
    .maybeSingle();
  return (data as any)?.archived_records || null;
}

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerCandidateRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // ---------------------------------------------------------------- Screening
  app.get(
    "/api/candidates/screening",
    requireAuth,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      let query = admin
        .from("candidates")
        .select(SCREENING_SELECT, { count: "exact" })
        .order("updated_at", { ascending: false });

      // Non-HR roles see only candidates assigned to them (same as RLS).
      if (!canViewAllCandidates(req.profile)) {
        const ids = await getAssignedCandidateIds(admin, req.profile.id);
        if (ids.length === 0) return res.json({ rows: [], total: 0, truncated: false });
        query = query.in("id", ids);
      }

      const search = cleanSearch(req.query.search);
      if (search) query = query.or(`full_name.ilike.%${search}%,position.ilike.%${search}%`);
      if (isDate(req.query.startDate)) query = query.gte("date", `${req.query.startDate}T00:00:00`);
      if (isDate(req.query.endDate)) query = query.lte("date", `${req.query.endDate}T23:59:59`);
      if (req.query.position && req.query.position !== "all") query = query.eq("position", String(req.query.position));

      const { data, error, count } = await query.limit(SCREENING_FETCH_LIMIT);
      if (error) throw error;
      const rows = await attachBlacklist(admin, (data || []).map((r) => shapeCandidateRow(r, req)));
      res.json({ rows, total: count ?? 0, truncated: rows.length >= SCREENING_FETCH_LIMIT });
    }),
  );

  // Published openings + positions that still have (visible) candidates.
  app.get(
    "/api/candidates/positions",
    requireAuth,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const { data: published, error } = await admin
        .from("open_recruitment")
        .select("position")
        .eq("is_published", true);
      if (error) throw error;

      let candQuery = admin.from("candidates").select("position").limit(SCREENING_FETCH_LIMIT);
      if (!canViewAllCandidates(req.profile)) {
        const ids = await getAssignedCandidateIds(admin, req.profile.id);
        candQuery = candQuery.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      }
      const { data: candPositions } = await candQuery;
      const publishedList = (published || []).map((d) => d.position).filter(Boolean);
      const positions = Array.from(
        new Set([...publishedList, ...(candPositions || []).map((d) => d.position).filter(Boolean)]),
      ).sort((a, b) => a.localeCompare(b));
      res.json({ published: publishedList, positions });
    }),
  );

  // Rejected/hired applications for one position (Screening status sidebar).
  // candidate_logs is HR only — other roles got an empty list from RLS.
  app.get(
    "/api/candidates/archived-for-position",
    requireAuth,
    handle(async (req, res) => {
      if (!canViewAllCandidates(req.profile)) return res.json({ rows: [] });
      const position = String(req.query.position || "");
      if (!position) return res.json({ rows: [] });
      const { data, error } = await getSupabaseAdmin()
        .from("candidate_logs")
        .select("*")
        .eq("position", position)
        .in("status_screening", ["rejected", "hired"])
        .order("archived_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      res.json({ rows: data || [] });
    }),
  );

  // Screening actions (HR only, like the menu that shows them).
  app.post(
    "/api/candidates/:id/status",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const status = req.body?.status;
      if (!["accepted", "rejected", "hired"].includes(status)) {
        throw new HttpError(400, "Status tidak valid.");
      }
      await requireActiveCandidate(req.params.id);
      const { error } = await getSupabaseAdmin()
        .from("candidates")
        .update({ status_screening: status, updated_at: nowIso() })
        .eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, "candidates.status", { id: req.params.id, status });
      res.json({ success: true });
    }),
  );

  const SCORE_FIELDS = [
    "technical_score",
    "communication_score",
    "problem_solving_score",
    "teamwork_score",
    "leadership_score",
    "adaptability_score",
  ] as const;
  app.post(
    "/api/candidates/:id/assessment",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const update: Record<string, any> = { updated_at: nowIso() };
      for (const f of SCORE_FIELDS) {
        const v = Number(req.body?.[f] ?? 0);
        if (!Number.isFinite(v) || v < 0 || v > 100) throw new HttpError(400, `Nilai ${f} tidak valid.`);
        update[f] = Math.round(v);
      }
      await requireActiveCandidate(req.params.id);
      const { error } = await getSupabaseAdmin().from("candidates").update(update).eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    }),
  );

  app.post(
    "/api/blacklist",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const { email, phone, identity_number, reason } = req.body || {};
      const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
      if (!str(email) && !str(phone) && !str(identity_number)) {
        throw new HttpError(400, "Minimal email, nomor HP, atau NIK wajib diisi.");
      }
      const { error } = await getSupabaseAdmin().from("blacklisted_candidates").insert({
        email: str(email),
        phone: str(phone),
        identity_number: str(identity_number),
        reason: str(reason) || "Ditolak dan di-blacklist pada tahap Screening Awal",
        created_by: req.user.id,
      });
      if (error) throw error;
      auditLog(req, "blacklist.add", { email: str(email) });
      res.json({ success: true });
    }),
  );

  // ------------------------------------------------------- Candidate profile
  app.get(
    "/api/candidates/:id",
    requireAuth,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const id = req.params.id;
      // ?full=1: every schedule column (Send Email/WA modal fills placeholders).
      const select =
        req.query.full === "1"
          ? "*, interview_schedules(*), psikotes_schedules(*), candidate_assignees(user_id)"
          : PROFILE_SELECT;
      const { data: active, error } = await admin.from("candidates").select(select).eq("id", id).maybeSingle();
      if (error) throw error;
      if (active) {
        if (!(await canAccessCandidate(admin, req.profile, id))) {
          throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
        }
        return res.json({ candidate: active, archived: false });
      }
      if (!canViewAllCandidates(req.profile)) throw new HttpError(404, "Kandidat tidak ditemukan.");
      const { data: log, error: logError } = await admin.from("candidate_logs").select("*").eq("id", id).maybeSingle();
      if (logError) throw logError;
      if (!log) throw new HttpError(404, "Kandidat tidak ditemukan.");
      res.json({
        candidate: {
          ...log,
          psikotes_schedules: log.archived_records?.psikotes_schedules || [],
          interview_schedules: log.archived_records?.interview_schedules || [],
        },
        archived: true,
      });
    }),
  );

  // Edit name/email/phone (HR only — the edit button is hidden for others).
  app.patch(
    "/api/candidates/:id",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : undefined);
      const update: Record<string, any> = { updated_at: nowIso() };
      for (const f of ["full_name", "email", "phone"]) {
        const v = str(req.body?.[f]);
        if (v !== undefined) update[f] = v;
      }
      if (update.full_name === "") throw new HttpError(400, "Nama kandidat wajib diisi.");
      const table = await resolveCandidateTable(req, req.params.id);
      const { error } = await getSupabaseAdmin().from(table).update(update).eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, "candidates.edit", { id: req.params.id, table });
      res.json({ success: true });
    }),
  );

  // Director / Finance Director approval on their assigned (active) candidate.
  app.post(
    "/api/candidates/:id/approval",
    requireAuth,
    requireRole("DIRECTOR", "FINANCE_DIRECTOR"),
    handle(async (req, res) => {
      const status = req.body?.status;
      if (!["accepted", "rejected", "hold"].includes(status)) throw new HttpError(400, "Status approval tidak valid.");
      const admin = getSupabaseAdmin();
      const id = req.params.id;
      // Archived applications are HR-only; this used to "succeed" silently
      // (RLS matched zero rows) without saving anything.
      await requireActiveCandidate(id);
      if (!(await canAccessCandidate(admin, req.profile, id))) {
        throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
      }
      const isDirector = req.profile.role === "DIRECTOR";
      const now = nowIso();
      const update: Record<string, any> = {
        [isDirector ? "director_status" : "finance_status"]: status,
        updated_at: now,
      };
      if (status === "accepted") update[isDirector ? "director_approval_date" : "finance_approval_date"] = now;
      const { error } = await admin.from("candidates").update(update).eq("id", id);
      if (error) throw error;
      auditLog(req, "candidates.approval", { id, status });
      res.json({ update });
    }),
  );

  app.post(
    "/api/candidates/:id/interview-questions",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const questions = req.body?.questions;
      if (questions === undefined) throw new HttpError(400, "Pertanyaan wajib diisi.");
      const table = await resolveCandidateTable(req, req.params.id);
      const { error } = await getSupabaseAdmin()
        .from(table)
        .update({ ai_interview_questions: questions, updated_at: nowIso() })
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ success: true });
    }),
  );

  // Upload/replace the psikotes result PDF (max 5MB).
  app.post(
    "/api/candidates/:id/psikotes-result",
    requireAuth,
    requireHrAdmin,
    (req, res, next) =>
      psikotesUpload.single("file")(req, res, (err: any) => {
        if (!err) return next();
        const message =
          err.code === "LIMIT_FILE_SIZE" ? "Ukuran file maksimal 5MB." : err.message || "Gagal membaca file.";
        res.status(400).json({ error: message });
      }),
    handle(async (req, res) => {
      const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
      if (!file) throw new HttpError(400, "File hasil psikotes wajib diunggah.");
      const id = req.params.id;
      const table = await resolveCandidateTable(req, id);
      const admin = getSupabaseAdmin();

      const { data: current } = await admin.from(table).select("psikotes_result_url").eq("id", id).maybeSingle();

      const ext = (file.originalname.split(".").pop() || "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
      const fileName = `psikotes/${id}_${Date.now()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from(PRIVATE_BUCKET)
        .upload(fileName, file.buffer, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { error: updateError } = await admin
        .from(table)
        .update({ psikotes_result_url: fileName, updated_at: nowIso() })
        .eq("id", id);
      if (updateError) {
        await admin.storage.from(PRIVATE_BUCKET).remove([fileName]);
        throw updateError;
      }

      // Old file last, so a failure never leaves the row without a file.
      for (const ref of collectStorageRefs([current?.psikotes_result_url])) {
        const { error } = await admin.storage.from(ref.bucket).remove([ref.path]);
        if (error) console.error("Failed to delete old psikotes file:", error);
      }
      invalidateDocumentAccessCache();
      auditLog(req, "candidates.psikotes_upload", { id, table });
      res.json({ path: fileName });
    }),
  );

  // Reviewers that can be assigned (assign modal, HR only).
  app.get(
    "/api/profiles/assignable",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const { data, error } = await getSupabaseAdmin()
        .from("profiles")
        .select("id, full_name, role, department, phone")
        .in("role", ["USER_MANAGER", "HR_ADMIN", "DIRECTOR", "FINANCE_DIRECTOR"])
        .order("full_name");
      if (error) throw error;
      res.json({ rows: data || [] });
    }),
  );

  // Replace the reviewer list. Adds new ones before removing old ones, so a
  // failed insert no longer leaves the candidate with nobody assigned.
  app.put(
    "/api/candidates/:id/assignees",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const id = req.params.id;
      const userIds: string[] = Array.isArray(req.body?.userIds)
        ? Array.from(new Set(req.body.userIds.filter((v: unknown) => typeof v === "string")))
        : [];
      await requireActiveCandidate(id);
      const admin = getSupabaseAdmin();
      const { data: existing, error } = await admin
        .from("candidate_assignees")
        .select("user_id")
        .eq("candidate_id", id);
      if (error) throw error;
      const current = new Set((existing || []).map((r) => r.user_id));
      const toAdd = userIds.filter((u) => !current.has(u));
      const toRemove = [...current].filter((u) => !userIds.includes(u));
      if (toAdd.length) {
        const { error: insError } = await admin
          .from("candidate_assignees")
          .insert(toAdd.map((user_id) => ({ candidate_id: id, user_id })));
        if (insError) throw insError;
      }
      if (toRemove.length) {
        const { error: delError } = await admin
          .from("candidate_assignees")
          .delete()
          .eq("candidate_id", id)
          .in("user_id", toRemove);
        if (delError) throw delError;
      }
      invalidateDocumentAccessCache();
      auditLog(req, "candidates.assign", { id, added: toAdd, removed: toRemove });
      res.json({ added: toAdd, removed: toRemove });
    }),
  );

  // ------------------------------------------------------------------- Notes
  // Visible: notes written by someone with the caller's own role (same rule
  // as the live RLS "Users can view same-role internal_notes").
  app.get(
    "/api/candidates/:id/notes",
    requireAuth,
    handle(async (req, res) => {
      const id = req.params.id;
      const table = await resolveCandidateTable(req, id);
      const admin = getSupabaseAdmin();
      let rows: any[] = [];
      if (table === "candidates") {
        const { data, error } = await admin
          .from("internal_notes")
          .select("*, author:profiles(*)")
          .eq("candidate_id", id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        rows = data || [];
      } else {
        const archived = (await loadArchivedRecords(id))?.internal_notes;
        if (Array.isArray(archived) && archived.length > 0) {
          const authorIds = Array.from(new Set(archived.map((r: any) => r.author_id).filter(Boolean)));
          const { data: authors } = authorIds.length
            ? await admin.from("profiles").select("*").in("id", authorIds)
            : { data: [] as any[] };
          const byId = Object.fromEntries((authors || []).map((p: any) => [p.id, p]));
          rows = archived
            .map((r: any) => ({ ...r, author: byId[r.author_id] || null }))
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        }
      }
      res.json({ rows: rows.filter((n) => n.author?.role === req.profile.role) });
    }),
  );

  app.post(
    "/api/candidates/:id/notes",
    requireAuth,
    handle(async (req, res) => {
      const id = req.params.id;
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      if (!text) throw new HttpError(400, "Catatan tidak boleh kosong.");
      if ((await resolveCandidateTable(req, id)) !== "candidates") {
        throw new HttpError(400, "Kandidat yang sudah diarsipkan tidak bisa diberi catatan baru.");
      }
      const admin = getSupabaseAdmin();
      const { error } = await admin
        .from("internal_notes")
        .insert({ candidate_id: id, author_id: req.user.id, note_text: text });
      if (error) throw error;
      // Adding a note counts as a "touch" (Screening's "Terbaru" sort).
      await admin.from("candidates").update({ updated_at: nowIso() }).eq("id", id);
      res.json({ success: true });
    }),
  );

  // ------------------------------------------------------------- Evaluations
  app.get(
    "/api/candidates/:id/evaluations",
    requireAuth,
    handle(async (req, res) => {
      const id = req.params.id;
      const table = await resolveCandidateTable(req, id);
      const admin = getSupabaseAdmin();
      if (table === "candidates") {
        const { data, error } = await admin
          .from("candidate_evaluations")
          .select("*, template:evaluation_templates(*)")
          .eq("candidate_id", id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return res.json({ rows: data || [] });
      }
      const archived = (await loadArchivedRecords(id))?.candidate_evaluations;
      if (!Array.isArray(archived) || archived.length === 0) return res.json({ rows: [] });
      const templateIds = Array.from(new Set(archived.map((e: any) => e.template_id).filter(Boolean)));
      const { data: templates } = templateIds.length
        ? await admin.from("evaluation_templates").select("*").in("id", templateIds)
        : { data: [] as any[] };
      const byId = Object.fromEntries((templates || []).map((t: any) => [t.id, t]));
      res.json({
        rows: archived
          .map((e: any) => ({ ...e, template: byId[e.template_id] || null }))
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      });
    }),
  );

  const evaluationFields = (body: any) => {
    const type = body?.evaluation_type;
    if (typeof type !== "string" || !type) throw new HttpError(400, "Tipe evaluasi wajib diisi.");
    if (typeof body?.template_id !== "string" || !body.template_id) throw new HttpError(400, "Template wajib dipilih.");
    const score = Number(body?.total_score ?? 0);
    return {
      template_id: body.template_id,
      evaluation_type: type,
      interviewer_name: typeof body?.interviewer_name === "string" ? body.interviewer_name.trim() : null,
      evaluation_data: body?.evaluation_data ?? {},
      total_score: Number.isFinite(score) ? score : 0,
    };
  };

  app.post(
    "/api/evaluations",
    requireAuth,
    handle(async (req, res) => {
      const candidateId = req.body?.candidate_id;
      if (typeof candidateId !== "string" || !candidateId) throw new HttpError(400, "candidate_id wajib diisi.");
      const fields = evaluationFields(req.body);
      if (fields.evaluation_type === "REFERENCE_CHECK" && !isHrAdmin(req.profile)) {
        throw new HttpError(403, "Reference check hanya bisa diisi oleh HR.");
      }
      await requireActiveCandidate(candidateId);
      const admin = getSupabaseAdmin();
      if (!(await canAccessCandidate(admin, req.profile, candidateId))) {
        throw new HttpError(403, "Anda tidak memiliki akses ke kandidat ini.");
      }
      const { error } = await admin
        .from("candidate_evaluations")
        .insert({ ...fields, candidate_id: candidateId, evaluator_id: req.user.id });
      if (error) throw error;
      auditLog(req, "evaluations.create", { candidateId, type: fields.evaluation_type });
      res.json({ success: true });
    }),
  );

  // Only the evaluator (or HR) may change an evaluation. The old RLS also
  // let ANYONE change evaluations whose evaluator_id was empty.
  app.patch(
    "/api/evaluations/:id",
    requireAuth,
    handle(async (req, res) => {
      const fields = evaluationFields(req.body);
      const admin = getSupabaseAdmin();
      const { data: existing, error } = await admin
        .from("candidate_evaluations")
        .select("id, candidate_id, evaluator_id, evaluation_type")
        .eq("id", req.params.id)
        .maybeSingle();
      if (error) throw error;
      if (!existing) throw new HttpError(404, "Evaluasi tidak ditemukan.");
      const hr = isHrAdmin(req.profile);
      if (!hr && existing.evaluator_id !== req.user.id) {
        throw new HttpError(403, "Hanya penilai yang bisa mengubah evaluasi ini.");
      }
      if (!hr && (fields.evaluation_type === "REFERENCE_CHECK" || existing.evaluation_type === "REFERENCE_CHECK")) {
        throw new HttpError(403, "Reference check hanya bisa diubah oleh HR.");
      }
      const { error: updError } = await admin.from("candidate_evaluations").update(fields).eq("id", existing.id);
      if (updError) throw updError;
      auditLog(req, "evaluations.update", { id: existing.id, candidateId: existing.candidate_id });
      res.json({ success: true });
    }),
  );
}
