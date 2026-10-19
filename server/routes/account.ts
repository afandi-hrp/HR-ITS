import type { Express } from "express";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../supabase";

// Forced first-login password change. New accounts get
// app_metadata.must_change_password = true (DB trigger
// trg_force_password_change_on_new_user); until it's cleared the app only
// shows the change-password screen and requireAuth rejects /api routes.
// app_metadata can't be edited by the user themselves, so the flag can only
// be cleared here, together with the actual password change.

const MIN_PASSWORD_LENGTH = 8;

export function registerAccountRoutes(app: Express) {
  app.post("/api/account/change-password", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Sesi login tidak ditemukan. Silakan login ulang." });
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter.` });
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return res.status(400).json({ error: "Password harus berisi huruf dan angka." });
    }

    try {
      const admin = getSupabaseAdmin();
      const { data: { user }, error } = await admin.auth.getUser(authHeader.slice("Bearer ".length));
      if (error || !user) {
        return res.status(401).json({ error: "Sesi login tidak valid. Silakan login ulang." });
      }

      // Reject reusing the current (HR-issued) password: if signing in with
      // the "new" password works, it's the same one. Skipped if the anon key
      // isn't in the server env.
      const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
      const url = (process.env.VITE_SUPABASE_URL || "").replace(/^http:\/\//, "https://");
      if (anonKey && url && user.email) {
        const probe = createClient(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: same } = await probe.auth.signInWithPassword({ email: user.email, password });
        if (same.session) {
          await probe.auth.signOut().catch(() => {});
          return res.status(400).json({ error: "Password baru tidak boleh sama dengan password lama." });
        }
      }

      const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
        password,
        app_metadata: { ...user.app_metadata, must_change_password: false },
      });
      if (updateError) {
        console.error("change-password update error:", updateError);
        return res.status(400).json({ error: updateError.message || "Gagal mengganti password." });
      }

      console.log(JSON.stringify({ audit: "password_changed", at: new Date().toISOString(), user: user.id }));
      res.json({ success: true });
    } catch (err) {
      console.error("Error in POST /api/account/change-password:", err);
      res.status(500).json({ error: "Terjadi kesalahan pada server. Silakan coba lagi." });
    }
  });
}
