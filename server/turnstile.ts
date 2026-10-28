import axios from "axios";
import type { Request } from "express";

// Server-side verification of a Cloudflare Turnstile token (siteverify).
// Used by the public /career flow (POST /api/request-otp). The login page is
// verified by Supabase Auth itself (GOTRUE_SECURITY_CAPTCHA_*), not here.
//
//  - secret set, token missing/invalid/wrong action -> rejected.
//  - secret set, Cloudflare unreachable             -> rejected as `unavailable` (fail closed).
//  - secret NOT set, NODE_ENV=production            -> rejected as `unavailable` (fail closed:
//    a missing env var must never silently turn the captcha off in production).
//  - secret NOT set, anything else (local dev)      -> skipped.
//
// Optional env TURNSTILE_ALLOWED_HOSTNAMES (comma separated): when set, the
// `hostname` Cloudflare reports for the token must be one of them.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
let warnedMissingSecret = false;

// (Plain optional fields rather than a discriminated union: the project's tsconfig
// is not `strict`, so `if (!result.ok)` would not narrow a union.)
export type TurnstileResult = {
  ok: boolean;
  skipped?: boolean; // ok because no secret is configured (non-production only)
  unavailable?: boolean; // not ok because Cloudflare couldn't be reached / not configured
  codes?: string[]; // error codes when not ok
};

export const turnstileConfigured = () => !!process.env.TURNSTILE_SECRET_KEY;

// The real client IP when the request came through the Cloudflare tunnel.
const clientIp = (req: Request) => {
  const cf = req.headers["cf-connecting-ip"];
  return (Array.isArray(cf) ? cf[0] : cf) || undefined;
};

// Pure decision on a siteverify response body (unit-testable without the network).
export function evaluateSiteverify(
  data: any,
  opts: { action?: string; hostnames?: string[] } = {},
): TurnstileResult {
  if (data?.success !== true) {
    return { ok: false, unavailable: false, codes: Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [] };
  }
  // A token minted for another widget action (e.g. the login page's "login")
  // must not be accepted here.
  if (opts.action && data.action !== opts.action) {
    return { ok: false, unavailable: false, codes: ["action-mismatch"] };
  }
  if (opts.hostnames && opts.hostnames.length > 0) {
    const host = String(data.hostname || "").toLowerCase();
    if (!opts.hostnames.includes(host)) return { ok: false, unavailable: false, codes: ["hostname-mismatch"] };
  }
  return { ok: true, skipped: false };
}

export async function verifyTurnstile(req: Request, token: unknown, expectedAction?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      if (!warnedMissingSecret) {
        warnedMissingSecret = true;
        console.error("TURNSTILE_SECRET_KEY is not set in production: captcha-protected requests are refused.");
      }
      return { ok: false, unavailable: true, codes: ["not-configured"] };
    }
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn("TURNSTILE_SECRET_KEY is not set: Turnstile verification is skipped (non-production).");
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
    const hostnames = (process.env.TURNSTILE_ALLOWED_HOSTNAMES || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);
    return evaluateSiteverify(data, { action: expectedAction, hostnames });
  } catch (err: any) {
    console.error("Turnstile siteverify unreachable:", err?.message || err);
    return { ok: false, unavailable: true, codes: ["internal-error"] };
  }
}
