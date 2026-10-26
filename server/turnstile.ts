import axios from "axios";
import type { Request } from "express";

// Server-side verification of a Cloudflare Turnstile token (siteverify).
// Used by the public /career flow (POST /api/request-otp). The login page is
// verified by Supabase Auth itself (GOTRUE_SECURITY_CAPTCHA_*), not here.
//
//  - TURNSTILE_SECRET_KEY unset  -> verification is skipped (logged once), so the
//    app keeps working until the key is configured / in local dev.
//  - secret set, token missing/invalid -> rejected.
//  - secret set, Cloudflare unreachable -> rejected as `unavailable` (fail closed).

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
let warnedMissingSecret = false;

// (Plain optional fields rather than a discriminated union: the project's tsconfig
// is not `strict`, so `if (!result.ok)` would not narrow a union.)
export type TurnstileResult = {
  ok: boolean;
  skipped?: boolean; // ok because no secret is configured
  unavailable?: boolean; // not ok because Cloudflare couldn't be reached
  codes?: string[]; // Cloudflare error codes when not ok
};

export const turnstileConfigured = () => !!process.env.TURNSTILE_SECRET_KEY;

// The real client IP when the request came through the Cloudflare tunnel.
const clientIp = (req: Request) => {
  const cf = req.headers["cf-connecting-ip"];
  return (Array.isArray(cf) ? cf[0] : cf) || undefined;
};

export async function verifyTurnstile(req: Request, token: unknown): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("TURNSTILE_SECRET_KEY is not set: Turnstile verification is skipped.");
    }
    return { ok: true, skipped: true };
  }

  // Tokens are at most 2048 chars; refuse anything absurd before calling out.
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) {
    return { ok: false, unavailable: false, codes: ["missing-input-response"] };
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    const ip = clientIp(req);
    if (ip) body.set("remoteip", ip);
    const { data } = await axios.post(SITEVERIFY_URL, body.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 8000,
    });
    if (data?.success === true) return { ok: true, skipped: false };
    return { ok: false, unavailable: false, codes: Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [] };
  } catch (err: any) {
    console.error("Turnstile siteverify unreachable:", err?.message || err);
    return { ok: false, unavailable: true, codes: ["internal-error"] };
  }
}
