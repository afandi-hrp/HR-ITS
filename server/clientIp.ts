import type { Request } from "express";

// Key for the public OTP rate limiters (request-otp / verify-otp).
//
// Behind nginx (and the Cloudflare tunnel in front of it) `req.ip` is the
// address nginx saw, which for tunnel traffic is the tunnel itself — the same
// for every visitor, so one person spamming would exhaust the limit for
// everybody. Cloudflare always overwrites `CF-Connecting-IP` with the real
// visitor address, so it is used — but only when the connection comes from a
// private/loopback address (the tunnel / nginx). A request that reaches the app
// directly from a public address can't choose its own bucket by sending the
// header. (A device on the office LAN could still spoof it; the LAN is trusted.)

const PRIVATE_RE =
  /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|fc[0-9a-f]{2}:|fd[0-9a-f]{2}:|fe80:)/i;

export const isPrivateAddress = (ip: string | undefined | null) =>
  !!ip && PRIVATE_RE.test(ip.replace(/^::ffff:/i, ""));

export function otpClientKey(req: Pick<Request, "ip" | "headers">): string {
  const direct = req.ip || "";
  const cf = req.headers["cf-connecting-ip"];
  const real = (Array.isArray(cf) ? cf[0] : cf)?.trim();
  if (real && real.length <= 64 && isPrivateAddress(direct)) return real;
  return direct;
}
