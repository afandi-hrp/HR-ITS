import type { Express, RequestHandler } from "express";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, requireHrAdmin, requireHrRead } from "../auth";
import { getSupabaseAdmin } from "../supabase";

// HR analytics pages (Dashboard, Recruitment Funnel, Live Tracking) — Fase 3.
// Lift-and-shift: the same queries the pages ran in the browser, run here
// with the same filters, returning the raw results so the pages' own
// aggregation code is unchanged. Date ranges come from the browser (so
// "this month" stays in HR's local timezone) as ISO strings.

const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));
const optIso = (v: unknown) => (isIso(v) ? new Date(v).toISOString() : null);
const position = (v: unknown) => (typeof v === "string" && v && v !== "all" ? v : null);
const cleanSearch = (v: unknown) => String(v || "").replace(/[,()*\\]/g, " ").trim();

const unwrap = <T>(res: { data: T | null; error: any }, label: string): T => {
  if (res.error) throw Object.assign(new Error(`${label}: ${res.error.message}`), { cause: res.error });
  return res.data as T;
};
const uniqueSorted = (rows: Array<{ position: string | null }>) =>
  Array.from(new Set(rows.map((d) => d.position).filter(Boolean) as string[])).sort();

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerAnalyticsRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // ---------------------------------------------------------------- Dashboard
  app.get(
    "/api/dashboard/positions",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const { data } = await getSupabaseAdmin().from("candidates").select("position").limit(1000);
      res.json({ positions: uniqueSorted(data || []) });
    }),
  );

  // ?position&start(ISO)&search
  app.get(
    "/api/dashboard",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const pos = position(req.query.position);
      const start = optIso(req.query.start);
      const search = cleanSearch(req.query.search);

      const count = (table: string, select = "*") => {
        let q = admin.from(table).select(select, { count: "exact", head: true });
        if (pos) q = q.eq("position", pos);
        if (start) q = q.gte("created_at", start);
        if (search) q = q.ilike("full_name", `%${search}%`);
        return q;
      };
      const rows = (table: string, select = "*") => {
        let q = admin.from(table).select(select);
        if (pos) q = q.eq("position", pos);
        if (start) q = q.gte("created_at", start);
        if (search) q = q.ilike("full_name", `%${search}%`);
        return q;
      };

      const now = new Date();
      const next7Days = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
      const next24Hours = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
      const nowIso = now.toISOString();

      const countQueries = {
        cTotal: count("candidates"),
        lTotal: count("candidate_logs"),
        cHired: count("candidates").eq("status_screening", "hired"),
        lHired: count("candidate_logs").eq("status_screening", "hired"),
        cRej: count("candidates").eq("status_screening", "rejected"),
        lRej: count("candidate_logs").eq("status_screening", "rejected"),
        cAcc: count("candidates").in("status_screening", ["accepted", "hired"]),
        lAcc: count("candidate_logs").in("status_screening", ["accepted", "hired"]),
        cPsi: count("candidates", "id, psikotes_schedules!inner(id)"),
        lPsi: count("candidate_logs").eq("psikotes_status", "Sudah Psikotes"),
        cInt: count("candidates", "id, interview_schedules!inner(id)"),
        lInt: count("candidate_logs").eq("interview_status", "Sudah Interview"),
        upcomingPsi: admin
          .from("psikotes_schedules")
          .select("*", { count: "exact", head: true })
          .gte("schedule_date", nowIso)
          .lte("schedule_date", next7Days),
        upcomingInt: admin
          .from("interview_schedules")
          .select("*", { count: "exact", head: true })
          .gte("schedule_date", nowIso)
          .lte("schedule_date", next7Days),
        openRecruitment: admin.from("open_recruitment").select("*", { count: "exact", head: true }),
      };
      const countEntries = await Promise.all(
        Object.entries(countQueries).map(async ([k, q]) => [k, (await q).count ?? 0] as const),
      );

      const dataQueries = {
        recentCands: rows("candidates", "id, full_name, position, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        recentLogs: rows("candidate_logs", "id, full_name, position, created_at, status_screening")
          .order("created_at", { ascending: false })
          .limit(10),
        recentPsi: admin
          .from("psikotes_schedules")
          .select("id, created_at, candidates!inner(id, full_name, position)")
          .order("created_at", { ascending: false })
          .limit(10),
        recentInt: admin
          .from("interview_schedules")
          .select("id, created_at, candidates!inner(id, full_name, position)")
          .order("created_at", { ascending: false })
          .limit(10),
        allActiveCandidates: admin
          .from("candidates")
          .select(
            "id, full_name, email, position, assessment_score, status_screening, technical_score, communication_score, problem_solving_score, teamwork_score, leadership_score, adaptability_score",
          )
          .not("status_screening", "in", '("rejected","hired")'),
        // Already marked "Tidak Hadir" (e.g. cancelled ahead) — not upcoming.
        upcomingPsiData: admin
          .from("psikotes_schedules")
          .select("id, schedule_date, is_confirmed, candidates!inner(id, full_name, position)")
          .gte("schedule_date", nowIso)
          .eq("is_no_show", false)
          .lte("schedule_date", next24Hours),
        upcomingIntData: admin
          .from("interview_schedules")
          .select("id, schedule_date, is_confirmed, candidates!inner(id, full_name, position)")
          .gte("schedule_date", nowIso)
          .eq("is_no_show", false)
          .lte("schedule_date", next24Hours),
        newCandidatesData: rows("candidates", "id, full_name, position, created_at, status_screening")
          .eq("status_screening", "pending")
          .order("created_at", { ascending: false })
          .limit(100),
      };
      const dataEntries = await Promise.all(
        Object.entries(dataQueries).map(async ([k, q]) => [k, unwrap<any[]>((await q) as any, k) || []] as const),
      );

      res.json({ counts: Object.fromEntries(countEntries), ...Object.fromEntries(dataEntries) });
    }),
  );

  // ------------------------------------------------------------------ Funnel
  app.get(
    "/api/funnel/positions",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const admin = getSupabaseAdmin();
      const { data: rpcData, error } = await admin.rpc("get_unique_positions");
      if (!error && rpcData) return res.json({ positions: uniqueSorted(rpcData) });
      const [{ data: c }, { data: l }] = await Promise.all([
        admin.from("candidates").select("position").limit(10000),
        admin.from("candidate_logs").select("position").limit(10000),
      ]);
      res.json({ positions: uniqueSorted([...(c || []), ...(l || [])]) });
    }),
  );

  // ?position&start&end (ISO)
  app.get(
    "/api/funnel",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const pos = position(req.query.position);
      const start = optIso(req.query.start);
      const end = optIso(req.query.end);
      const rpcArgs = { p_position: pos, p_start_date: start, p_end_date: end };

      const rows = (table: string, select = "*") => {
        let q = admin.from(table).select(select);
        if (pos) q = q.eq("position", pos);
        if (start) q = q.gte("created_at", start);
        if (end) q = q.lte("created_at", end);
        return q;
      };

      const [countsRes, pendingRes, stageRes] = await Promise.all([
        admin.rpc("get_recruitment_funnel_counts", rpcArgs),
        admin.rpc("count_pending_candidates", rpcArgs),
        admin.rpc("get_recruitment_funnel_stage_candidates", { ...rpcArgs, p_limit_per_stage: 50 }),
      ]);
      if (countsRes.error) console.error("Error fetching funnel counts:", countsRes.error);
      if (pendingRes.error) console.error("Error counting pending candidates:", pendingRes.error);
      if (stageRes.error) console.error("Error fetching funnel stage candidates:", stageRes.error);

      const stageRows: Array<{ stage: string; candidate_id: string; source_table: string }> = stageRes.data || [];
      const ids = (table: string) =>
        Array.from(new Set(stageRows.filter((r) => r.source_table === table).map((r) => r.candidate_id)));
      const candIds = ids("candidates");
      const logIds = ids("candidate_logs");

      const [candRows, logRows, recentHired, psikotesSchedules, interviewSchedules, activeSources, logSources] =
        await Promise.all([
          candIds.length ? admin.from("candidates").select("*").in("id", candIds) : Promise.resolve({ data: [], error: null }),
          logIds.length ? admin.from("candidate_logs").select("*").in("id", logIds) : Promise.resolve({ data: [], error: null }),
          rows("candidate_logs", "id, created_at, archived_at, updated_at, status_screening")
            .eq("status_screening", "hired")
            .order("created_at", { ascending: false })
            .limit(1000),
          admin.from("psikotes_schedules").select("candidate_id, created_at, schedule_date"),
          admin.from("interview_schedules").select("candidate_id, created_at, schedule_date"),
          rows("candidates", "id, created_at, source_info, status_screening").limit(10000),
          rows("candidate_logs", "id, created_at, source_info, status_screening").limit(10000),
        ]);

      const counts = Array.isArray(countsRes.data) ? countsRes.data[0] : countsRes.data;
      res.json({
        counts: counts || null,
        pending: pendingRes.error ? 0 : pendingRes.data || 0,
        stageRows,
        candidateRows: unwrap(candRows as any, "candidates") || [],
        logRows: unwrap(logRows as any, "candidate_logs") || [],
        recentHired: unwrap(recentHired, "recentHired") || [],
        psikotesSchedules: unwrap(psikotesSchedules, "psikotes_schedules") || [],
        interviewSchedules: unwrap(interviewSchedules, "interview_schedules") || [],
        activeSources: unwrap(activeSources, "activeSources") || [],
        logSources: unwrap(logSources, "logSources") || [],
      });
    }),
  );

  // ---------------------------------------------------------- Live Tracking
  app.get(
    "/api/tracking",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const admin = getSupabaseAdmin();
      const [active, logged] = await Promise.all([
        admin
          .from("candidates")
          .select(
            `*,
          psikotes_schedules (is_confirmed, is_no_show, schedule_date),
          interview_schedules (is_confirmed, is_no_show, schedule_date, additional_notes),
          candidate_evaluations (evaluation_type, interviewer_name, total_score, evaluation_data)`,
          )
          .order("created_at", { ascending: false }),
        admin.from("candidate_logs").select("*").order("created_at", { ascending: false }),
      ]);
      if (active.error) throw active.error;
      if (logged.error) throw logged.error;
      res.json({ active: active.data || [], logged: logged.data || [] });
    }),
  );

  // Inline edit of the trial / background-check / join columns.
  // `notes` only exists on candidate_logs — sending it for an active
  // candidate used to make the whole save fail ("column notes does not
  // exist"), so it's skipped there and reported back instead.
  const TRACKING_DATE_FIELDS = ["trial_1_date", "trial_2_date", "trial_3_date", "background_check_date", "join_date"];
  const TRACKING_TEXT_FIELDS = ["trial_result", "background_check_result", "finance_reject_reason", "notes"];
  app.patch(
    "/api/tracking/:id",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const isLog = req.body?.isLog === true;
      const table = isLog ? "candidate_logs" : "candidates";
      const fields = req.body?.fields || {};
      const update: Record<string, any> = {};
      for (const f of TRACKING_DATE_FIELDS) {
        if (!(f in fields)) continue;
        const v = fields[f];
        if (v !== null && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v))) {
          throw new HttpError(400, `Tanggal ${f} tidak valid.`);
        }
        update[f] = v;
      }
      for (const f of TRACKING_TEXT_FIELDS) {
        if (!(f in fields)) continue;
        const v = fields[f];
        if (v !== null && typeof v !== "string") throw new HttpError(400, `Kolom ${f} tidak valid.`);
        update[f] = v;
      }
      const skipped: string[] = [];
      if (!isLog && "notes" in update) {
        if (update.notes) skipped.push("notes");
        delete update.notes;
      }
      if (Object.keys(update).length === 0) return res.json({ update, skipped });
      const { data, error } = await getSupabaseAdmin()
        .from(table)
        .update(update)
        .eq("id", req.params.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Kandidat tidak ditemukan.");
      auditLog(req, "tracking.update", { id: req.params.id, table });
      res.json({ update, skipped });
    }),
  );
}
