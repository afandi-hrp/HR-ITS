import type { Express, RequestHandler } from "express";
import crypto from "crypto";
import { auditLog, handle, HttpError, requireAuth as realRequireAuth, requireHrAdmin, requireHrRead } from "../auth";
import { getSupabaseAdmin } from "../supabase";

// Registration tokens gate /form-pelamar. Previously readable by every
// logged-in user straight from the browser (RLS SELECT USING true) — an
// unused token is all it takes to submit an application.

// Unambiguous characters only (no 0/O, 1/I/L) — tokens are often typed by hand.
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const randomPart = (length: number) =>
  Array.from(crypto.randomBytes(length), (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// `requireAuth` is injectable only so scripts/test-backend-routes.ts can run
// the routes with a fixed profile; server.ts always passes the real one.
export function registerRegistrationTokenRoutes(app: Express, requireAuth: RequestHandler = realRequireAuth) {
  // Token Pelamar page: every token + who it was sent to + who used it.
  app.get(
    "/api/registration-tokens",
    requireAuth,
    requireHrRead,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const { data: tokens, error } = await admin
        .from("registration_tokens")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Recipient: Send Email/WA stores the token's id in the candidate's
      // confirmation_token (kept when archived).
      const sentIds = (tokens || []).filter((t) => t.used_at || t.is_used).map((t) => t.id);
      const recipients: Record<string, { id: string; full_name: string | null; position: string | null }> = {};
      for (const ids of chunk(sentIds, 150)) {
        const [activeRes, logsRes] = await Promise.all([
          admin.from("candidates").select("id, full_name, position, confirmation_token").in("confirmation_token", ids),
          admin.from("candidate_logs").select("id, full_name, position, confirmation_token").in("confirmation_token", ids),
        ]);
        if (activeRes.error) throw activeRes.error;
        if (logsRes.error) throw logsRes.error;
        [...(logsRes.data || []), ...(activeRes.data || [])].forEach((c: any) => {
          recipients[c.confirmation_token] = { id: c.id, full_name: c.full_name, position: c.position };
        });
      }

      // Who actually used each token: submit_application_with_token sets
      // used_at = NOW() and inserts external_data in the same transaction,
      // so external_data.created_at equals the token's used_at.
      const usedTokens = (tokens || []).filter((t) => t.is_used && t.used_at);
      const byTime: Record<number, { uid_sheet: string; full_name: string | null; position: string | null; candidateId: string | null }> = {};
      for (const group of chunk(usedTokens, 100)) {
        const { data: forms, error: formsError } = await admin
          .from("external_data")
          .select("uid_sheet, created_at, full_name:raw_data->>full_name, position:raw_data->>position")
          .in("created_at", group.map((t) => t.used_at as string));
        if (formsError) throw formsError;
        const uids = (forms || []).map((f: any) => f.uid_sheet);
        const linked: Record<string, string> = {};
        if (uids.length > 0) {
          const [activeRes, logsRes] = await Promise.all([
            admin.from("candidates").select("id, linked_external_id").in("linked_external_id", uids),
            admin.from("candidate_logs").select("id, linked_external_id").in("linked_external_id", uids),
          ]);
          [...(logsRes.data || []), ...(activeRes.data || [])].forEach((c: any) => {
            linked[c.linked_external_id] = c.id;
          });
        }
        (forms || []).forEach((f: any) => {
          byTime[new Date(f.created_at).getTime()] = {
            uid_sheet: f.uid_sheet,
            full_name: f.full_name,
            position: f.position,
            candidateId: linked[f.uid_sheet] || null,
          };
        });
      }
      const submissions: Record<string, (typeof byTime)[number]> = {};
      usedTokens.forEach((t) => {
        const match = byTime[new Date(t.used_at as string).getTime()];
        if (match) submissions[t.id] = match;
      });

      // An unused token opens the application form — READ_ONLY sees it masked.
      const visibleTokens =
        req.profile.role === "READ_ONLY"
          ? (tokens || []).map((t) => ({ ...t, token: `${String(t.token || "").slice(0, 3)}••••••` }))
          : tokens || [];
      res.json({ tokens: visibleTokens, recipients, submissions });
    }),
  );

  app.post(
    "/api/registration-tokens",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const count = Math.min(Math.max(parseInt(String(req.body?.count ?? 1), 10) || 1, 1), 100);
      const admin = getSupabaseAdmin();
      const newTokens = Array.from({ length: count }, () => ({
        token: `WRN-${randomPart(8)}-${randomPart(4)}`,
        created_by: req.user.id,
      }));
      const { error } = await admin.from("registration_tokens").insert(newTokens);
      if (error) throw error;
      auditLog(req, "registration_tokens.create", { count });
      res.json({ created: count });
    }),
  );

  // ?used=1 deletes every used token; otherwise /:id deletes one.
  app.delete(
    "/api/registration-tokens/used",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const { error, count } = await admin
        .from("registration_tokens")
        .delete({ count: "exact" })
        .eq("is_used", true);
      if (error) throw error;
      auditLog(req, "registration_tokens.delete_used", { count });
      res.json({ deleted: count ?? 0 });
    }),
  );

  app.delete(
    "/api/registration-tokens/:id",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const { error } = await admin.from("registration_tokens").delete().eq("id", req.params.id);
      if (error) throw error;
      auditLog(req, "registration_tokens.delete", { id: req.params.id });
      res.json({ deleted: 1 });
    }),
  );

  // Send Email/WA modal (psikotes invitation): unused tokens + the one
  // already assigned to this candidate, if any.
  app.get(
    "/api/registration-tokens/available",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const admin = getSupabaseAdmin();
      const candidateId = String(req.query.candidateId || "");
      let assignedTokenId: string | null = null;
      if (candidateId) {
        const { data } = await admin
          .from("candidates")
          .select("confirmation_token")
          .eq("id", candidateId)
          .maybeSingle();
        assignedTokenId = data?.confirmation_token ?? null;
      }
      const { data, error } = await admin
        .from("registration_tokens")
        .select("id, token, used_at")
        .eq("is_used", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      res.json({ tokens: data || [], assignedTokenId });
    }),
  );

  // Mark a token as sent to a candidate: used_at = send time, is_used stays
  // false so the candidate can still use it (see RegistrationTokens.tsx).
  app.post(
    "/api/registration-tokens/:id/mark-sent",
    requireAuth,
    requireHrAdmin,
    handle(async (req, res) => {
      const candidateId = req.body?.candidateId;
      if (!candidateId || typeof candidateId !== "string") {
        throw new HttpError(400, "candidateId wajib diisi.");
      }
      const admin = getSupabaseAdmin();
      const now = new Date().toISOString();
      const { data: token, error: tokenError } = await admin
        .from("registration_tokens")
        .update({ used_at: now })
        .eq("id", req.params.id)
        .eq("is_used", false)
        .select("id, token")
        .maybeSingle();
      if (tokenError) throw tokenError;
      if (!token) throw new HttpError(404, "Token tidak ditemukan atau sudah terpakai.");

      const { error: candError } = await admin
        .from("candidates")
        .update({ confirmation_token: token.id, updated_at: now })
        .eq("id", candidateId);
      if (candError) throw candError;

      auditLog(req, "registration_tokens.mark_sent", { id: token.id, candidateId });
      res.json({ token: token.token });
    }),
  );
}
