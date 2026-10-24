import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import {
  auditLog,
  handle,
  HttpError,
  requireAuth as realRequireAuth,
  requireHrAdmin,
  requireHrRead,
} from "../auth";
import { getSupabaseAdmin } from "../supabase";

// Account monitoring + password reset for Manajemen Pengguna.
//  - last login:   auth.users.last_sign_in_at (no migration needed)
//  - last seen /
//    last page /
//    page history: public.user_activity + public.user_page_visits, filled by
//                  POST /api/activity/ping (migration 20261023000002). Until
//                  that migration is run the endpoints still work and report
//                  trackingReady: false.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_IN_PATH_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
const HISTORY_LIMIT = 30;
const HEARTBEAT_MIN_GAP_MS = 60_000;
const SAME_PATH_DEDUPE_MS = 3_000;

const isMissingTable = (error: any) => !!error && MISSING_TABLE_CODES.has(error.code);

// "/candidates/<uuid>?tab=x#y" -> "/candidates/:id"; anything that isn't an
// in-app path is refused.
function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const clean = raw.split(/[?#]/)[0].trim();
  if (!clean.startsWith("/") || clean.length > 120 || /[\s<>"'`]/.test(clean)) return null;
  return clean.replace(UUID_IN_PATH_RE, ":id");
}

// 12 chars, no look-alikes (0/O, 1/l/I), always letters + digits so it passes
// the same rule as /api/account/change-password.
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;
  const pick = (set: string) => set[crypto.randomInt(set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(digits)];
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Accounts that never logged in within this many days of being created can be
// disabled in bulk from Manajemen Pengguna.
const NEVER_LOGIN_DISABLE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
// GoTrue has no "banned forever"; 100 years is the usual stand-in.
const DISABLE_DURATION = "876000h";
const BULK_DISABLE_MAX = 200;

type AuthUserRow = {
  id: string;
  email?: string;
  created_at: string;
  last_sign_in_at: string | null;
  disabled: boolean;
};

async function listAuthUsers() {
  const admin = getSupabaseAdmin();
  const users: AuthUserRow[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        disabled: !!u.banned_until && new Date(u.banned_until).getTime() > Date.now(),
      })),
    );
    if (data.users.length < 200) break;
  }
  return users;
}

// Never logged in and created more than NEVER_LOGIN_DISABLE_DAYS ago.
const isStaleNeverLoggedIn = (u: AuthUserRow) =>
  !u.last_sign_in_at && Date.now() - new Date(u.created_at).getTime() > NEVER_LOGIN_DISABLE_DAYS * DAY_MS;

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerUserActivityRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  const lastHeartbeat = new Map<string, number>();
  const lastVisit = new Map<string, { path: string; at: number }>();

  // Any logged-in user (READ_ONLY included — see READ_ONLY_POST_ALLOWLIST).
  app.post(
    "/api/activity/ping",
    requireAuth,
    handle(async (req, res) => {
      const path = normalizePath(req.body?.path);
      if (!path) throw new HttpError(400, "Path tidak valid.");
      const heartbeat = req.body?.heartbeat === true;
      const uid = req.profile.id;
      const now = Date.now();

      if (heartbeat) {
        if (now - (lastHeartbeat.get(uid) ?? 0) < HEARTBEAT_MIN_GAP_MS) return res.json({ ok: true });
        lastHeartbeat.set(uid, now);
      } else {
        const prev = lastVisit.get(uid);
        if (prev && prev.path === path && now - prev.at < SAME_PATH_DEDUPE_MS) return res.json({ ok: true });
        lastVisit.set(uid, { path, at: now });
        lastHeartbeat.set(uid, now);
      }

      const admin = getSupabaseAdmin();
      const iso = new Date(now).toISOString();
      const userAgent = String(req.headers["user-agent"] || "").slice(0, 255) || null;
      const { error } = await admin
        .from("user_activity")
        .upsert({ user_id: uid, last_seen_at: iso, last_path: path, user_agent: userAgent }, { onConflict: "user_id" });
      if (error) {
        if (isMissingTable(error)) return res.json({ ok: true, trackingReady: false });
        throw error;
      }
      if (!heartbeat) {
        const { error: visitError } = await admin
          .from("user_page_visits")
          .insert({ user_id: uid, path, visited_at: iso });
        if (visitError && !isMissingTable(visitError)) throw visitError;
      }
      res.json({ ok: true });
    }),
  );

  // One row per user for the Manajemen Pengguna table.
  app.get(
    "/api/users/activity",
    requireAuth,
    requireHrRead,
    handle(async (_req, res) => {
      const admin = getSupabaseAdmin();
      const [users, activity] = await Promise.all([
        listAuthUsers(),
        admin.from("user_activity").select("user_id, last_seen_at, last_path"),
      ]);
      let trackingReady = true;
      if (activity.error) {
        if (!isMissingTable(activity.error)) throw activity.error;
        trackingReady = false;
      }
      const byUser = new Map((activity.data || []).map((a: any) => [a.user_id, a]));
      res.json({
        trackingReady,
        neverLoginDays: NEVER_LOGIN_DISABLE_DAYS,
        rows: users.map((u) => ({
          id: u.id,
          created_at: u.created_at,
          disabled: u.disabled,
          last_sign_in_at: u.last_sign_in_at,
          last_seen_at: byUser.get(u.id)?.last_seen_at ?? null,
          last_path: byUser.get(u.id)?.last_path ?? null,
        })),
      });
    }),
  );

  // Detail for one user: last HISTORY_LIMIT page visits.
  app.get(
    "/api/users/:id/activity",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const id = req.params.id;
      if (!UUID_RE.test(id)) throw new HttpError(400, "ID pengguna tidak valid.");
      const admin = getSupabaseAdmin();
      const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(id);
      if (authErr || !authUser?.user) throw new HttpError(404, "Pengguna tidak ditemukan.");

      const [activity, visits] = await Promise.all([
        admin.from("user_activity").select("last_seen_at, last_path").eq("user_id", id).maybeSingle(),
        admin
          .from("user_page_visits")
          .select("path, visited_at")
          .eq("user_id", id)
          .order("visited_at", { ascending: false })
          .limit(HISTORY_LIMIT),
      ]);
      const trackingReady = !isMissingTable(activity.error) && !isMissingTable(visits.error);
      if (trackingReady) {
        if (activity.error) throw activity.error;
        if (visits.error) throw visits.error;
      }
      res.json({
        trackingReady,
        last_sign_in_at: authUser.user.last_sign_in_at ?? null,
        last_seen_at: trackingReady ? (activity.data as any)?.last_seen_at ?? null : null,
        last_path: trackingReady ? (activity.data as any)?.last_path ?? null : null,
        visits: trackingReady ? visits.data || [] : [],
      });
    }),
  );

  // HR Admin sets a new temporary password and forces a change at next login
  // (same must_change_password flag as a brand-new account). The password is
  // returned once and never logged.
  app.post(
    "/api/users/:id/reset-password",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const id = req.params.id;
      if (!UUID_RE.test(id)) throw new HttpError(400, "ID pengguna tidak valid.");
      if (id === req.profile.id) {
        throw new HttpError(400, "Untuk mengganti password akun sendiri, gunakan menu Pengaturan.");
      }
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) throw new HttpError(404, "Pengguna tidak ditemukan.");

      const temporaryPassword = generateTempPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(id, {
        password: temporaryPassword,
        app_metadata: { ...data.user.app_metadata, must_change_password: true },
      });
      if (updateError) {
        console.error("reset-password update error:", updateError);
        throw new HttpError(400, updateError.message || "Gagal mereset password.");
      }
      auditLog(req, "users.reset_password", { target: id });
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, email: data.user.email ?? null, temporaryPassword });
    }),
  );

  // Disable (ban) one account. Data is kept; sign-in and token refresh are
  // refused by GoTrue and requireAuth rejects tokens that are still valid.
  app.post(
    "/api/users/:id/disable",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const id = req.params.id;
      if (!UUID_RE.test(id)) throw new HttpError(400, "ID pengguna tidak valid.");
      if (id === req.profile.id) throw new HttpError(400, "Anda tidak dapat menonaktifkan akun sendiri.");

      const admin = getSupabaseAdmin();
      const users = await listAuthUsers();
      const target = users.find((u) => u.id === id);
      if (!target) throw new HttpError(404, "Pengguna tidak ditemukan.");
      if (target.disabled) throw new HttpError(400, "Akun ini sudah nonaktif.");

      // Never lock HR out: another active HR Admin must remain.
      const { data: hrAdmins, error: hrError } = await admin.from("profiles").select("id").eq("role", "HR_ADMIN");
      if (hrError) throw hrError;
      const hrIds = new Set((hrAdmins || []).map((p: any) => p.id));
      if (hrIds.has(id) && !users.some((u) => u.id !== id && hrIds.has(u.id) && !u.disabled)) {
        throw new HttpError(400, "Tidak dapat menonaktifkan HR Admin terakhir yang aktif.");
      }

      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: DISABLE_DURATION });
      if (error) {
        console.error("disable user error:", error);
        throw new HttpError(400, error.message || "Gagal menonaktifkan akun.");
      }
      auditLog(req, "users.disable", { target: id });
      res.json({ success: true });
    }),
  );

  // Re-enable a disabled account. It comes back with a fresh temporary
  // password and must_change_password, since the old password is the
  // HR-issued one (returned once, like reset-password).
  app.post(
    "/api/users/:id/enable",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const id = req.params.id;
      if (!UUID_RE.test(id)) throw new HttpError(400, "ID pengguna tidak valid.");
      const admin = getSupabaseAdmin();
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error || !data?.user) throw new HttpError(404, "Pengguna tidak ditemukan.");
      const bannedUntil = data.user.banned_until;
      if (!bannedUntil || new Date(bannedUntil).getTime() <= Date.now()) {
        throw new HttpError(400, "Akun ini tidak dalam keadaan nonaktif.");
      }

      const temporaryPassword = generateTempPassword();
      const { error: updateError } = await admin.auth.admin.updateUserById(id, {
        ban_duration: "none",
        password: temporaryPassword,
        app_metadata: { ...data.user.app_metadata, must_change_password: true },
      });
      if (updateError) {
        console.error("enable user error:", updateError);
        throw new HttpError(400, updateError.message || "Gagal mengaktifkan akun.");
      }
      auditLog(req, "users.enable", { target: id });
      res.setHeader("Cache-Control", "no-store");
      res.json({ success: true, email: data.user.email ?? null, temporaryPassword });
    }),
  );

  // Bulk-disable accounts that never logged in. The client sends the ids it
  // previewed; each one is re-checked here, so a stale or tampered list can't
  // disable anyone who doesn't qualify.
  app.post(
    "/api/users/disable-inactive",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const ids: unknown = req.body?.ids;
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > BULK_DISABLE_MAX || !ids.every((i) => typeof i === "string" && UUID_RE.test(i))) {
        throw new HttpError(400, "Daftar pengguna tidak valid.");
      }
      const admin = getSupabaseAdmin();
      const byId = new Map((await listAuthUsers()).map((u) => [u.id, u]));

      const disabled: string[] = [];
      const skipped: string[] = [];
      for (const id of new Set(ids as string[])) {
        const u = byId.get(id);
        if (!u || id === req.profile.id || u.disabled || !isStaleNeverLoggedIn(u)) {
          skipped.push(id);
          continue;
        }
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: DISABLE_DURATION });
        if (error) {
          console.error("bulk disable error:", id, error);
          skipped.push(id);
          continue;
        }
        disabled.push(id);
      }
      auditLog(req, "users.disable_inactive", { disabled, skipped: skipped.length });
      res.json({ success: true, disabled: disabled.length, skipped: skipped.length });
    }),
  );
}
