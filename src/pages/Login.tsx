import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Mail, Lock, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { SiteSettings } from "../types";
import { cn } from "../lib/utils";
import LoginBackground from "../components/LoginBackground";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  // Login content (card + wordmark) stays hidden below the wave background for
  // a few seconds, then rises up once and stays risen — never sinks back down.
  const [revealed, setRevealed] = useState(false);
  const location = useLocation();

  // CAPTCHA states
  const [captchaText, setCaptchaText] = useState("");
  const [captchaInput, setCaptchaInput] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateCaptcha = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    let text = "";
    for (let i = 0; i < 4; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(text);
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  useEffect(() => {
    if (captchaText && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Background
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Add noise (lines)
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255}, 0.5)`;
          ctx.beginPath();
          ctx.moveTo(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
          );
          ctx.lineTo(
            Math.random() * canvas.width,
            Math.random() * canvas.height,
          );
          ctx.stroke();
        }

        // Add text
        ctx.font = "bold 24px Inter, sans-serif";
        ctx.fillStyle = "#334155";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Draw characters with slight rotation, spaced to always fit the canvas width
        const spacing = canvas.width / (captchaText.length + 1);
        for (let i = 0; i < captchaText.length; i++) {
          ctx.save();
          ctx.translate(spacing * (i + 1), canvas.height / 2);
          ctx.rotate((Math.random() - 0.5) * 0.4);
          ctx.fillText(captchaText[i], 0, 0);
          ctx.restore();
        }
      }
    }
  }, [captchaText]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("*")
          .eq("id", 1)
          .single();
        if (data) {
          setSettings(data);
        }
      } catch (err) {
        console.warn("Failed to get site settings:", err);
      }
    };
    fetchSettings();

    if (location.state?.message) {
      setMessage(location.state.message);
    }
  }, [location.state]);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (captchaInput !== captchaText) {
      setError("Invalid CAPTCHA. Please try again.");
      generateCaptcha();
      setCaptchaInput("");
      return;
    }

    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("wrong username or password");
      setLoading(false);
      setTimeout(() => setError(null), 5000);
    }
  };

  const sidebarText = settings?.sidebar_text || "Waruna";

  return (
    <div className="min-h-screen w-full relative bg-transparent lg:h-screen lg:flex lg:items-center lg:justify-center lg:p-6 lg:overflow-hidden">
      <LoginBackground className="absolute inset-x-0 top-0 h-[38vh] lg:inset-0 lg:h-full" />

      {/* mobile spacer: pushes the card below the top background banner */}
      <div className="h-[38vh] lg:hidden" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-7xl flex flex-col items-center lg:flex-row lg:items-center justify-center gap-16 xl:gap-28 2xl:gap-36 px-4 pb-6 lg:px-0 lg:pb-0">
      <div
        className={cn(
          "relative w-full sm:w-[320px] shrink-0 backdrop-blur-2xl bg-[#FFF5C5]/90 border border-white/80 rounded-3xl shadow-[0_10px_30px_-8px_rgba(90,48,90,0.35),0_35px_80px_-25px_rgba(90,48,90,0.55)] transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)]",
          !revealed
            ? "opacity-0 translate-y-28 scale-95"
            : "opacity-100 translate-y-0 scale-100 animate-login-float",
        )}
      >
        {/* soft glow blob to sell the floating effect against the gradient bg */}
        <div className="hidden sm:block absolute -inset-6 -z-10 bg-white/40 blur-3xl rounded-[3rem] pointer-events-none" />
        <div className="w-full flex flex-col justify-center max-h-[92vh] overflow-y-auto rounded-3xl px-5 sm:px-7 py-6">
          <div className="w-full max-w-sm mx-auto">
            <div className="flex flex-col items-center text-center mb-4">
              {!settings ? (
                <div className="h-14 w-14 rounded-3xl bg-[#5A305A]/10 animate-pulse shrink-0" />
              ) : settings.login_logo_url ? (
                <img
                  src={settings.login_logo_url}
                  alt="Logo"
                  className="h-14 w-14 object-contain drop-shadow-sm shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-14 w-14 rounded-3xl bg-[#5A305A] flex items-center justify-center shadow-lg shrink-0">
                  <span className="text-xl font-bold text-white">
                    {sidebarText[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <h2 className="mt-3 text-lg font-bold text-[#5A305A] leading-tight">
                ATS <span className="font-light text-[#5A305A]/60">WARUNA</span>
              </h2>
            </div>

            <h1 className="text-base font-bold text-[#5A305A] mb-3">Log in</h1>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-red-600 font-bold">!</span>
                </div>
                <p className="font-medium">{error}</p>
              </div>
            )}

            {message && !error && (
              <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm rounded-2xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-indigo-600 font-bold">i</span>
                </div>
                <p className="font-medium">{message}</p>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div className="relative">
                <div className="absolute z-10 left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white ring-1 ring-black/5 shadow-[0_4px_14px_rgba(90,48,90,0.2)] flex items-center justify-center shrink-0">
                  <Mail size={16} className="text-[#5A305A]" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-14 pr-4 py-3.5 bg-white/85 border border-white shadow-[0_4px_16px_rgba(90,48,90,0.1)] rounded-full text-sm text-[#5A305A] placeholder-[#5A305A]/40 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all"
                  placeholder="Email"
                />
              </div>

              <div className="relative">
                <div className="absolute z-10 left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white ring-1 ring-black/5 shadow-[0_4px_14px_rgba(90,48,90,0.2)] flex items-center justify-center shrink-0">
                  <Lock size={16} className="text-[#5A305A]" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-14 pr-4 py-3.5 bg-white/85 border border-white shadow-[0_4px_16px_rgba(90,48,90,0.1)] rounded-full text-sm text-[#5A305A] placeholder-[#5A305A]/40 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all"
                  placeholder="Password"
                />
              </div>

              <div className="pt-1">
                <label className="block text-xs font-bold text-[#5A305A]/70 mb-1.5 px-1 uppercase tracking-wide">
                  Security Verification
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="w-20 shrink-0 px-3 py-3 bg-[#FDF3D3] border border-white/80 shadow-[0_4px_16px_rgba(90,48,90,0.08)] rounded-full text-sm text-[#5A305A] placeholder-[#5A305A]/40 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all font-mono tracking-wider"
                    placeholder="Kode"
                  />
                  <div className="flex items-center gap-1 bg-white/80 backdrop-blur-sm border border-white shadow-[0_4px_16px_rgba(90,48,90,0.08)] p-1.5 rounded-full shrink-0">
                    <canvas
                      ref={canvasRef}
                      width="110"
                      height="36"
                      className="rounded-full bg-slate-50 border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={generateCaptcha}
                      className="p-1.5 text-[#5A305A]/60 hover:text-[#5A305A] hover:bg-white rounded-full transition-colors shrink-0"
                      title="Refresh CAPTCHA"
                    >
                      <RefreshCw size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-[#5A305A]/50 font-semibold">
                  Powered by WARUNA Group
                </p>
                <button
                  type="submit"
                  disabled={loading}
                  aria-label="Log In"
                  title="Log In"
                  className="w-12 h-12 shrink-0 rounded-full bg-[#5A305A] text-white flex items-center justify-center shadow-lg hover:bg-[#3F223F] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  {loading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <ArrowRight size={20} />
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Desktop wordmark, sits close to the card in the open background */}
      <div
        className={cn(
          "hidden lg:flex flex-col items-start select-none pointer-events-none transition-all duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] delay-150",
          !revealed ? "opacity-0 translate-y-28" : "opacity-100 translate-y-0",
        )}
      >
        <div className="flex items-center gap-6 xl:gap-8 mb-5">
          {!settings ? (
            <div className="h-24 w-24 xl:h-32 xl:w-32 2xl:h-36 2xl:w-36 rounded-3xl bg-[#5A305A]/10 animate-pulse shrink-0" />
          ) : settings.login_logo_url ? (
            <img
              src={settings.login_logo_url}
              alt="Logo"
              className="h-24 w-24 xl:h-32 xl:w-32 2xl:h-36 2xl:w-36 object-contain drop-shadow-sm shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-24 w-24 xl:h-32 xl:w-32 2xl:h-36 2xl:w-36 rounded-3xl bg-[#5A305A] flex items-center justify-center shadow-xl shrink-0">
              <span className="text-4xl xl:text-5xl font-bold text-white">
                {sidebarText[0]?.toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-7xl xl:text-8xl 2xl:text-[10rem] font-bold text-[#5A305A] leading-none whitespace-nowrap">
            ATS <span className="font-light text-[#5A305A]/50">WARUNA</span>
          </h1>
        </div>
        <p className="text-xl xl:text-2xl text-[#5A305A]/70 font-medium">
          Powered by WARUNA Group
        </p>
      </div>
      </div>
    </div>
  );
}
