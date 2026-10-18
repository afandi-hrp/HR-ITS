import type { NextFunction, Request, Response } from "express";
import type { User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "./supabase";

export type Role = "HR_ADMIN" | "USER_MANAGER" | "DIRECTOR" | "FINANCE_DIRECTOR";

export interface AuthProfile {
  id: string;
  role: Role | null;
  department: string | null;
  full_name: string | null;
}

export interface AuthedRequest extends Request {
  user: User;
  profile: AuthProfile;
}

// Verifies the Supabase access token (Authorization: Bearer ...) and loads
// the caller's profile, so routes can check role server-side instead of
// trusting the UI's menu hiding.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Sesi login tidak ditemukan. Silakan login ulang." });
  }
  try {
    const admin = getSupabaseAdmin();
    const token = authHeader.slice("Bearer ".length);
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ error: "Sesi login tidak valid. Silakan login ulang." });
    }
    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, department, full_name")
      .eq("id", user.id)
      .maybeSingle();

    const authed = req as AuthedRequest;
    authed.user = user;
    authed.profile = {
      id: user.id,
      role: (profile?.role as Role) ?? null,
      department: profile?.department ?? null,
      full_name: profile?.full_name ?? null,
    };
    next();
  } catch (err) {
    console.error("requireAuth error:", err);
    return res.status(401).json({ error: "Sesi login tidak valid. Silakan login ulang." });
  }
}

// Chain after requireAuth.
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = (req as AuthedRequest).profile?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: "Anda tidak memiliki akses untuk tindakan ini." });
    }
    next();
  };

export const requireHrAdmin = requireRole("HR_ADMIN");

// Minimal audit trail for access to personal data (KTP, salary, ...):
// one structured line per request in the server log.
export function auditLog(req: Request, action: string, detail: Record<string, unknown> = {}) {
  const { profile } = req as AuthedRequest;
  console.log(
    JSON.stringify({
      audit: action,
      at: new Date().toISOString(),
      user: profile?.id,
      role: profile?.role,
      ...detail,
    }),
  );
}

// Wrap async handlers so a thrown error becomes a JSON 500 instead of an
// unhandled rejection. Database/internal messages are logged, not returned.
export const handle =
  (fn: (req: AuthedRequest, res: Response) => Promise<unknown>) =>
  async (req: Request, res: Response) => {
    try {
      await fn(req as AuthedRequest, res);
    } catch (err: any) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message });
      }
      console.error(`Error in ${req.method} ${req.originalUrl}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Terjadi kesalahan pada server. Silakan coba lagi." });
      }
    }
  };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
