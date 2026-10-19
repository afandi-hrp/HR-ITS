import type { Express, RequestHandler } from "express";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, requireHrAdmin, requireHrRead } from "../auth";
import { getSupabaseAdmin } from "../supabase";

// HR content: job openings, email templates, evaluation templates, user
// directory, duplicate check for Upload CV — Fase 3. Writes only accept the
// columns listed per table (a request can't set id/created_at/... ).

const cleanSearch = (v: unknown) => String(v || "").replace(/[,()*\\]/g, " ").trim();
const toInt = (v: unknown, def: number, max: number) => {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
};

function pick(body: any, fields: Record<string, "string" | "boolean" | "json">, partial: boolean) {
  const out: Record<string, any> = {};
  for (const [f, kind] of Object.entries(fields)) {
    if (!(f in (body || {}))) continue;
    const v = body[f];
    if (v === null) out[f] = null;
    else if (kind === "string" && typeof v === "string") out[f] = v;
    else if (kind === "boolean" && typeof v === "boolean") out[f] = v;
    else if (kind === "json") out[f] = v;
    else throw new HttpError(400, `Kolom ${f} tidak valid.`);
  }
  if (!partial && Object.keys(out).length === 0) throw new HttpError(400, "Data kosong.");
  return out;
}

// GET list / POST / PATCH :id / DELETE :id for one HR-managed table.
function crud(
  app: Express,
  requireAuth: RequestHandler,
  base: string,
  table: string,
  fields: Record<string, "string" | "boolean" | "json">,
  required: string[],
  opts: { touchUpdatedAt?: boolean } = {},
) {
  app.post(
    base,
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const row = pick(req.body, fields, false);
      for (const f of required) {
        if (typeof row[f] !== "string" || !row[f].trim()) throw new HttpError(400, `Kolom ${f} wajib diisi.`);
      }
      const { data, error } = await getSupabaseAdmin().from(table).insert([row]).select("*").single();
      if (error) throw error;
      auditLog(req, `${table}.create`, { id: data.id });
      res.json({ row: data });
    }),
  );

  app.patch(
    `${base}/:id`,
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const update = pick(req.body, fields, true);
      for (const f of required) {
        if (f in update && (typeof update[f] !== "string" || !update[f].trim())) {
          throw new HttpError(400, `Kolom ${f} wajib diisi.`);
        }
      }
      if (Object.keys(update).length === 0) throw new HttpError(400, "Tidak ada perubahan.");
      if (opts.touchUpdatedAt) update.updated_at = new Date().toISOString();
      const { data, error } = await getSupabaseAdmin()
        .from(table)
        .update(update)
        .eq("id", req.params.id)
        .select("*")
        .maybeSingle();
      if (error) {
        if (error.code === "42703") throw new HttpError(400, `Kolom belum ada di database: ${error.message}`);
        throw error;
      }
      if (!data) throw new HttpError(404, "Data tidak ditemukan.");
      auditLog(req, `${table}.update`, { id: req.params.id });
      res.json({ row: data });
    }),
  );

  app.delete(
    `${base}/:id`,
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const { error } = await getSupabaseAdmin().from(table).delete().eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, `${table}.delete`, { id: req.params.id });
      res.json({ success: true });
    }),
  );
}

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerContentRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // ---------------------------------------------------- Open Recruitment
  // ?search&order=position|created_at&published=1&fields=position
  app.get(
    "/api/open-recruitment",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const order = req.query.order === "created_at" ? "created_at" : "position";
      let query = getSupabaseAdmin()
        .from("open_recruitment")
        .select(req.query.fields === "position" ? "position" : "*")
        .order(order, { ascending: order === "position" });
      const search = cleanSearch(req.query.search);
      if (search) query = query.ilike("position", `%${search}%`);
      // Upload CV treats a missing flag (null) as published.
      if (req.query.published === "1") query = query.or("is_published.eq.true,is_published.is.null");
      const { data, error } = await query;
      if (error) throw error;
      res.json({ rows: data || [] });
    }),
  );
  crud(
    app,
    requireAuth,
    "/api/open-recruitment",
    "open_recruitment",
    { position: "string", jobdesk: "string", kualifikasi: "string", is_published: "boolean" },
    ["position"],
  );

  // ------------------------------------------------------ Email templates
  // Paged (Templates page: ?page&pageSize&search) or all (modals: ?all=1).
  app.get(
    "/api/email-templates",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      let query = getSupabaseAdmin().from("email_templates").select("*", { count: "exact" });
      const search = cleanSearch(req.query.search);
      if (search) query = query.or(`name.ilike.%${search}%,subject.ilike.%${search}%`);
      query =
        req.query.order === "name"
          ? query.order("name", { ascending: true })
          : query.order("created_at", { ascending: false });
      if (req.query.all !== "1") {
        const page = toInt(req.query.page, 1, 100000);
        const pageSize = toInt(req.query.pageSize, 10, 200);
        query = query.range((page - 1) * pageSize, page * pageSize - 1);
      }
      const { data, error, count } = await query;
      if (error) throw error;
      res.json({ rows: data || [], total: count ?? 0 });
    }),
  );
  crud(
    app,
    requireAuth,
    "/api/email-templates",
    "email_templates",
    { name: "string", subject: "string", body_html: "string" },
    ["name"],
  );

  // ------------------------------------------------- Evaluation templates
  // Read by every role: EvaluationModal is used by assigned reviewers too.
  // ?search | ?type=REFERENCE_CHECK | ?excludeType=REFERENCE_CHECK
  app.get(
    "/api/evaluation-templates",
    requireAuth,
    handle(async (req, res) => {
      let query = getSupabaseAdmin().from("evaluation_templates").select("*");
      const search = cleanSearch(req.query.search);
      if (search) query = query.ilike("name", `%${search}%`);
      if (typeof req.query.type === "string" && req.query.type) query = query.eq("type", req.query.type);
      if (typeof req.query.excludeType === "string" && req.query.excludeType) {
        query = query.neq("type", req.query.excludeType);
      }
      const { data, error } = await query.order("name", { ascending: true });
      if (error) throw error;
      res.json({ rows: data || [] });
    }),
  );
  crud(
    app,
    requireAuth,
    "/api/evaluation-templates",
    "evaluation_templates",
    {
      name: "string",
      type: "string",
      form_schema: "json",
      target_role: "string",
      target_department: "string",
    },
    ["name", "type"],
    { touchUpdatedAt: true },
  );

  // ------------------------------------------------------------ Profiles
  app.get(
    "/api/profiles",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const { data, error } = await getSupabaseAdmin().from("profiles").select("*").order("full_name");
      if (error) throw error;
      res.json({ rows: data || [] });
    }),
  );

  app.get(
    "/api/profiles/departments",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const { data, error } = await getSupabaseAdmin()
        .from("profiles")
        .select("department")
        .not("department", "is", null);
      if (error) throw error;
      res.json({ departments: Array.from(new Set((data || []).map((d) => d.department).filter(Boolean))).sort() });
    }),
  );

  // --------------------------------------------- Upload CV duplicate check
  // Exact, case-insensitive email match in active + archived + blacklist.
  app.get(
    "/api/candidates-by-email",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const email = String(req.query.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json({ candidates: [], blacklist: [] });
      const pattern = email.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      const admin = getSupabaseAdmin();
      const [activeRes, logsRes, blacklistRes] = await Promise.all([
        admin.from("candidates").select("id, position, status_screening").ilike("email", pattern),
        admin.from("candidate_logs").select("id, position, status_screening").ilike("email", pattern),
        admin.from("blacklisted_candidates").select("reason").ilike("email", pattern),
      ]);
      res.json({
        candidates: [
          ...(activeRes.data || []).map((c: any) => ({ ...c, archived: false })),
          ...(logsRes.data || []).map((c: any) => ({ ...c, archived: true })),
        ],
        blacklist: blacklistRes.data || [],
      });
    }),
  );
}
