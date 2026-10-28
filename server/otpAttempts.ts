// Wrong-code counter per OTP request id for POST /api/verify-otp (in memory: a single
// server instance; a restart only resets the counters, the code itself still expires
// after 5 minutes). After OTP_MAX_WRONG_ATTEMPTS wrong tries the code is burned and a
// new one has to be requested, which needs a captcha again.
export const OTP_MAX_WRONG_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const attempts = new Map<string, { n: number; at: number }>();

export const noteWrongOtpAttempt = (id: string, now = Date.now()) => {
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now - v.at > WINDOW_MS) attempts.delete(k);
  }
  const cur = attempts.get(id);
  const n = (cur && now - cur.at < WINDOW_MS ? cur.n : 0) + 1;
  attempts.set(id, { n, at: now });
  return n;
};

export const clearOtpAttempts = (id: string) => {
  attempts.delete(id);
};
