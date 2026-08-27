import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Mail, Lock, Loader2, RefreshCw, ArrowRight } from "lucide-react";
import { SiteSettings } from "../types";
import { cn } from "../lib/utils";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
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
      } finally {
        setTimeout(() => setIsLoaded(true), 100);
      }
    };
    fetchSettings();

    if (location.state?.message) {
      setMessage(location.state.message);
    }
  }, [location.state]);

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
    <div className="h-screen w-full flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-transparent">
      <div
        className={cn(
          "w-full h-full sm:h-auto sm:max-h-[94vh] max-w-5xl backdrop-blur-2xl bg-white/25 border border-white/70 rounded-3xl shadow-2xl overflow-hidden flex transition-all duration-700 ease-out",
          !isLoaded ? "opacity-0 scale-95" : "opacity-100 scale-100",
        )}
      >
        {/* Left: Login Panel */}
        <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col justify-center overflow-y-auto px-6 sm:px-10 py-8 bg-white/40 backdrop-blur-md">
          <div className="w-full max-w-sm mx-auto">
            <h1 className="text-2xl font-bold text-[#5A305A] mb-1">Log In</h1>
            <p className="text-sm text-[#5A305A]/60 mb-6">
              Log in to the WARUNA ATS Dashboard
            </p>

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
                <div className="absolute z-10 left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white ring-1 ring-black/5 shadow-[0_4px_14px_rgba(255,157,107,0.45)] flex items-center justify-center shrink-0">
                  <Mail size={16} className="text-[#5A305A]" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-14 pr-4 py-3.5 bg-white/80 backdrop-blur-sm border border-white shadow-[0_4px_20px_rgba(255,157,107,0.2)] rounded-full text-sm text-[#5A305A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all"
                  placeholder="Email"
                />
              </div>

              <div className="relative">
                <div className="absolute z-10 left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white ring-1 ring-black/5 shadow-[0_4px_14px_rgba(255,157,107,0.45)] flex items-center justify-center shrink-0">
                  <Lock size={16} className="text-[#5A305A]" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-14 pr-4 py-3.5 bg-white/80 backdrop-blur-sm border border-white shadow-[0_4px_20px_rgba(255,157,107,0.2)] rounded-full text-sm text-[#5A305A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all"
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
                    className="flex-1 min-w-0 px-4 py-3 bg-white/80 backdrop-blur-sm border border-white shadow-[0_4px_20px_rgba(255,157,107,0.2)] rounded-full text-sm text-[#5A305A] placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all font-mono tracking-widest"
                    placeholder="4 characters"
                  />
                  <div className="flex items-center gap-1.5 bg-white/80 backdrop-blur-sm border border-white shadow-[0_4px_20px_rgba(255,157,107,0.2)] p-1.5 rounded-full shrink-0">
                    <canvas
                      ref={canvasRef}
                      width="130"
                      height="36"
                      className="rounded-full bg-slate-50 border border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={generateCaptcha}
                      className="p-2 text-[#5A305A]/60 hover:text-[#5A305A] hover:bg-white rounded-full transition-colors shrink-0"
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

        {/* Right: Brand Panel (desktop only) */}
        <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-[#FFF9E3]/80 via-[#FFDAB9]/80 to-[#FFB08E]/80 backdrop-blur-md items-center justify-center px-10 overflow-hidden">
          <div
            className="absolute right-0 top-0 bottom-0 w-2/3 opacity-30 pointer-events-none"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(61,44,68,0.25) 1.5px, transparent 1.5px)",
              backgroundSize: "22px 22px",
              maskImage: "linear-gradient(to left, black, transparent)",
              WebkitMaskImage: "linear-gradient(to left, black, transparent)",
            }}
          />
          <div className="relative z-10 flex items-center gap-5 max-w-full">
            {settings?.login_logo_url ? (
              <img
                src={settings.login_logo_url}
                alt="Logo"
                className="h-16 w-auto object-contain drop-shadow-sm shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-16 w-16 rounded-3xl bg-[#5A305A] flex items-center justify-center shadow-xl shrink-0">
                <span className="text-3xl font-black text-white">
                  {sidebarText[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-4xl font-black text-[#5A305A] leading-tight whitespace-nowrap">
                WARUNA GROUP <span className="font-light text-[#5A305A]/60">ATS</span>
              </h1>
              <p className="text-base text-[#5A305A]/70 mt-3 font-medium">
                Applicant Tracking System
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
