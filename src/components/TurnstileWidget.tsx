import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile (explicit rendering). The site key is public; the
// secret key lives only on the Supabase Auth server (GOTRUE_SECURITY_CAPTCHA_*),
// which is what actually verifies the token — nothing is verified in the browser.

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

type Props = {
  siteKey: string;
  // token string when solved; null when it expires, errors, or is reset
  onToken: (token: string | null) => void;
  onLoadError?: () => void;
};

// A Turnstile token is single-use: call reset() after every submit attempt.
const TurnstileWidget = forwardRef<TurnstileHandle, Props>(({ siteKey, onToken, onLoadError }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      onTokenRef.current(null);
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
          callback: (token: string) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => onLoadError?.());
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey]);

  return <div ref={containerRef} className="flex justify-center min-h-[65px]" />;
});

TurnstileWidget.displayName = "TurnstileWidget";
export default TurnstileWidget;
