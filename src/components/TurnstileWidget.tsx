import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import { cn } from "../lib/utils";

// Cloudflare Turnstile (explicit rendering). The site key is public; the
// secret key lives only on the servers that verify the token (Supabase Auth for
// login via GOTRUE_SECURITY_CAPTCHA_*, Express for /career) — nothing is
// verified in the browser.
//
// The widget itself is an iframe we can't restyle, so by default it is rendered
// with appearance "interaction-only" (hidden unless Cloudflare needs the user to
// do something) and our own status chip shows what's happening. Pass
// appearance="always" to get Cloudflare's own box back.

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile tidak tersedia")));
      script.onerror = () => {
        scriptPromise = null; // allow a retry on the next mount
        reject(new Error("Gagal memuat Cloudflare Turnstile"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export type TurnstileHandle = { reset: () => void };

type Status = "verifying" | "interactive" | "success" | "error";

type Props = {
  siteKey: string;
  // token string when solved; null when it expires, errors, or is reset
  onToken: (token: string | null) => void;
  onLoadError?: () => void;
  // "interaction-only" (default): widget hidden unless a challenge is needed.
  // "always": Cloudflare's own box, always visible.
  appearance?: "always" | "interaction-only";
  // Look of our status chip: pill (login page) or rounded box (public career form).
  variant?: "login" | "career";
  // Binds the token to one action (letters/digits/_/-, max 32). The server rejects a
  // token minted for a different action, e.g. the login one used for request-otp.
  action?: string;
};

const CHIP: Record<NonNullable<Props["variant"]>, string> = {
  login:
    "rounded-full bg-white/85 border border-white shadow-[0_4px_16px_rgba(90,48,90,0.1)] px-4 py-2.5 text-[#5A305A]",
  career: "rounded-xl bg-white/60 border border-white/60 shadow-sm px-4 py-3 text-slate-700",
};

// A Turnstile token is single-use: call reset() after every submit attempt.
const TurnstileWidget = forwardRef<TurnstileHandle, Props>(
  ({ siteKey, onToken, onLoadError, appearance = "interaction-only", variant = "login", action }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    onTokenRef.current = onToken;
    const [status, setStatus] = useState<Status>("verifying");

    useImperativeHandle(ref, () => ({
      reset: () => {
        onTokenRef.current(null);
        setStatus("verifying");
        if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
      },
    }));

    useEffect(() => {
      let cancelled = false;
      loadTurnstile()
        .then((api) => {
          if (cancelled || !containerRef.current) return;
          widgetIdRef.current = api.render(containerRef.current, {
            sitekey: siteKey,
            theme: "light",
            language: "id",
            size: "flexible", // fills the card width like the inputs above it
            appearance,
            ...(action ? { action } : {}),
            callback: (token: string) => {
              setStatus("success");
              onTokenRef.current(token);
            },
            "expired-callback": () => {
              setStatus("verifying"); // Turnstile refreshes an expired token by itself
              onTokenRef.current(null);
            },
            "error-callback": () => {
              setStatus("error");
              onTokenRef.current(null);
            },
            "before-interactive-callback": () => setStatus("interactive"),
            "after-interactive-callback": () => setStatus("verifying"),
          });
        })
        .catch(() => {
          setStatus("error");
          onLoadError?.();
        });
      return () => {
        cancelled = true;
        if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      };
    }, [siteKey, appearance, action]);

    const chip = {
      verifying: { icon: <Loader2 size={16} className="animate-spin shrink-0 opacity-70" />, text: "Memverifikasi keamanan…", tone: "" },
      interactive: { icon: <ShieldCheck size={16} className="shrink-0 opacity-70" />, text: "Selesaikan verifikasi di bawah ini", tone: "" },
      success: { icon: <ShieldCheck size={16} className="shrink-0 text-emerald-600" />, text: "Verifikasi keamanan berhasil", tone: "text-emerald-700" },
      error: { icon: <AlertTriangle size={16} className="shrink-0 text-amber-600" />, text: "Verifikasi bermasalah, mencoba lagi…", tone: "text-amber-700" },
    }[status];

    return (
      <div className="space-y-2" aria-live="polite">
        {appearance === "interaction-only" && (
          <div className={cn("flex items-center gap-2 text-xs font-semibold transition-colors", CHIP[variant], chip.tone)}>
            {chip.icon}
            <span>{chip.text}</span>
          </div>
        )}
        {/* Cloudflare's iframe; clipped to rounded corners so it matches the card. */}
        <div
          ref={containerRef}
          className={cn(
            "overflow-hidden",
            appearance === "always" ? "rounded-2xl min-h-[65px]" : status === "interactive" ? "rounded-2xl min-h-[65px]" : "",
          )}
        />
      </div>
    );
  },
);

TurnstileWidget.displayName = "TurnstileWidget";
export default TurnstileWidget;
