import type { Express, RequestHandler } from "express";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, requireHrAdmin, requireHrRead } from "../auth";
import { getSupabaseAdmin } from "../supabase";
import { isPendingSchedule } from "../../src/lib/scheduleStatus";

// Psikotes / interview schedules — HR only (the schedule pages and the
// Screening schedule actions are HR-only; writes already were via RLS).
// :type is "psikotes" or "interview".

const TABLES = { psikotes: "psikotes_schedules", interview: "interview_schedules" } as const;
type ScheduleType = keyof typeof TABLES;

const tableFor = (type: string) => {
  if (!(type in TABLES)) throw new HttpError(400, "Tipe jadwal tidak valid.");
  return TABLES[type as ScheduleType];
};
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const cleanSearch = (v: unknown) => String(v || "").replace(/[,()*%\\]/g, " ").trim();
const toInt = (v: unknown, def: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};

function scheduleFields(type: ScheduleType, body: any) {
  if (!isIso(body?.schedule_date)) throw new HttpError(400, "Tanggal dan waktu jadwal wajib diisi.");
  const fields: Record<string, any> = {
    schedule_date: new Date(body.schedule_date).toISOString(),
    location_type: typeof body?.location_type === "string" ? body.location_type : null,
    location_detail: typeof body?.location_detail === "string" ? body.location_detail : null,
    additional_notes: typeof body?.additional_notes === "string" ? body.additional_notes : null,
  };
  if (type === "interview") {
    if (body?.end_time != null && !isIso(body.end_time)) throw new HttpError(400, "Waktu selesai tidak valid.");
    fields.end_time = body?.end_time ? new Date(body.end_time).toISOString() : null;
    if (fields.end_time && fields.end_time <= fields.schedule_date) {
      throw new HttpError(400, "Waktu selesai harus setelah waktu mulai.");
    }
  }
  return fields;
}

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerScheduleRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // List view: ?tab=pending|confirmed|no_show&startDate&endDate&search&page&pageSize
  app.get(
    "/api/schedules/:type",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const table = tableFor(req.params.type);
      const tab = String(req.query.tab || "pending");
      const page = toInt(req.query.page, 1, 100000);
      const pageSize = toInt(req.query.pageSize, 10, 500);
      let query = getSupabaseAdmin()
        .from(table)
        .select("*, candidate:candidates!inner(*)", { count: "exact" });
      if (isDate(req.query.startDate)) query = query.gte("schedule_date", `${req.query.startDate}T00:00:00`);
      if (isDate(req.query.endDate)) query = query.lte("schedule_date", `${req.query.endDate}T23:59:59`);
      const search = cleanSearch(req.query.search);
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,position.ilike.%${search}%`, { foreignTable: "candidates" });
      }
      if (tab === "no_show") query = query.eq("is_no_show", true);
      else query = query.eq("is_confirmed", tab === "confirmed").eq("is_no_show", false);

      const from = (page - 1) * pageSize;
      const { data, error, count } = await query
        .order("schedule_date", { ascending: tab === "pending" })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      res.json({ rows: data || [], total: count ?? 0 });
    }),
  );

  // Calendar view: ?start&end (ISO) &search
  app.get(
    "/api/schedules/:type/calendar",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const table = tableFor(req.params.type);
      if (!isIso(req.query.start) || !isIso(req.query.end)) throw new HttpError(400, "Rentang tanggal tidak valid.");
      let query = getSupabaseAdmin()
        .from(table)
        .select("*, candidate:candidates!inner(*)")
        .gte("schedule_date", req.query.start)
        .lte("schedule_date", req.query.end);
      const search = cleanSearch(req.query.search);
      if (search) {
        query = query.or(`full_name.ilike.%${search}%,position.ilike.%${search}%`, { foreignTable: "candidates" });
      }
      const { data, error } = await query.order("schedule_date", { ascending: true });
      if (error) throw error;
      res.json({ rows: data || [] });
    }),
  );

  // Candidates that can get a new schedule of this type: passed screening
  // and no schedule of this type still pending (a no-show can be rescheduled).
  app.get(
    "/api/schedules/:type/candidates",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const table = tableFor(req.params.type);
      const { data, error } = await getSupabaseAdmin()
        .from("candidates")
        .select(`*, schedules: ${table}(id, is_confirmed, is_no_show)`)
        .eq("status_screening", "accepted")
        .order("full_name", { ascending: true });
      if (error) throw error;
      res.json({ rows: (data || []).filter((c: any) => !(c.schedules || []).some(isPendingSchedule)) });
    }),
  );

  app.post(
    "/api/schedules/:type",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const type = req.params.type as ScheduleType;
      const table = tableFor(type);
      const candidateId = req.body?.candidate_id;
      if (typeof candidateId !== "string" || !candidateId) throw new HttpError(400, "Silakan pilih kandidat.");
      const fields = scheduleFields(type, req.body);
      const admin = getSupabaseAdmin();
      const { data: cand } = await admin.from("candidates").select("id").eq("id", candidateId).maybeSingle();
      if (!cand) throw new HttpError(404, "Kandidat tidak ditemukan atau sudah diarsipkan.");
      const { data, error } = await admin
        .from(table)
        .insert([{ ...fields, candidate_id: candidateId }])
        .select("id")
        .single();
      if (error) throw error;
      auditLog(req, "schedules.create", { type, id: data.id, candidateId });
      res.json({ id: data.id });
    }),
  );

  app.patch(
    "/api/schedules/:type/:id",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const type = req.params.type as ScheduleType;
      const { error } = await getSupabaseAdmin()
        .from(tableFor(type))
        .update(scheduleFields(type, req.body))
        .eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, "schedules.update", { type, id: req.params.id });
      res.json({ success: true });
    }),
  );

  // action: confirm | unconfirm | no_show (+reason) | clear_no_show.
  // Confirming always clears the no-show flags — the DB CHECK forbids both.
  app.post(
    "/api/schedules/:type/:id/attendance",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const action = req.body?.action;
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      const updates: Record<string, Record<string, any>> = {
        confirm: { is_confirmed: true, is_no_show: false, no_show_reason: null },
        unconfirm: { is_confirmed: false },
        no_show: { is_no_show: true, is_confirmed: false, no_show_reason: reason || null },
        clear_no_show: { is_no_show: false, no_show_reason: null },
      };
      if (!updates[action]) throw new HttpError(400, "Aksi tidak valid.");
      const { error } = await getSupabaseAdmin()
        .from(tableFor(req.params.type))
        .update(updates[action])
        .eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, "schedules.attendance", { type: req.params.type, id: req.params.id, action });
      res.json({ success: true });
    }),
  );

  app.delete(
    "/api/schedules/:type/:id",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const { error } = await getSupabaseAdmin().from(tableFor(req.params.type)).delete().eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, "schedules.delete", { type: req.params.type, id: req.params.id });
      res.json({ success: true });
    }),
  );
}
