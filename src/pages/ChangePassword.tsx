import React, { useState } from "react";
import { Lock, Loader2, ArrowRight, Eye, EyeOff, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import LoginBackground from "../components/LoginBackground";

// Shown instead of the whole app while the account still has
// app_metadata.must_change_password (new accounts, see
// server/routes/account.ts). Nothing else is reachable until it's done.
export default function ChangePassword({ email }: { email?: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password harus berisi huruf dan angka.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/account/change-password", { password });
      // New token carries must_change_password = false; AuthContext picks
      // it up (TOKEN_REFRESHED) and App renders the dashboard.
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) {
        await supabase.auth.signOut();
      }
    } catch (err: any) {
      setError(err.message || "Gagal mengganti password.");
      setLoading(false);
    }
  };

  const inputClass =
    "block w-full pl-14 pr-14 py-3.5 bg-white/85 border border-white shadow-[0_4px_16px_rgba(90,48,90,0.1)] rounded-full text-sm text-[#5A305A] placeholder-[#5A305A]/40 focus:outline-none focus:ring-2 focus:ring-[#5A305A]/30 transition-all [&::-ms-reveal]:hidden [&::-ms-clear]:hidden";

  return (
    <div className="min-h-screen w-full relative bg-transparent lg:h-screen lg:flex lg:items-center lg:justify-center lg:p-6 lg:overflow-hidden">
      <LoginBackground className="absolute inset-x-0 top-0 h-[38vh] lg:inset-0 lg:h-full" />
      <div className="h-[38vh] lg:hidden" aria-hidden="true" />

      <div className="relative z-10 w-full flex justify-center px-4 pb-6 lg:px-0 lg:pb-0">
        <div className="relative w-full sm:w-[360px] backdrop-blur-2xl bg-[#FFF5C5]/90 border border-white/80 rounded-3xl shadow-[0_10px_30px_-8px_rgba(90,48,90,0.35),0_35px_80px_-25px_rgba(90,48,90,0.55)] px-5 sm:px-7 py-6">
          <h1 className="text-base font-bold text-[#5A305A]">Ganti Password</h1>
          <p className="mt-1 mb-4 text-xs text-[#73507B]">
            Akun Anda baru dibuat. Demi keamanan, ganti password bawaan dari
            HR sebelum melanjutkan
            {email ? (
              <>
                {" "}
                (<span className="font-semibold">{email}</span>)
              </>
            ) : null}
            .
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {[
              { value: password, set: setPassword, placeholder: "Password baru" },
              { value: confirmPassword, set: setConfirmPassword, placeholder: "Ulangi password baru" },
            ].map((field, i) => (
              <div key={i} className="relative">
                <div className="absolute z-10 left-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white ring-1 ring-black/5 shadow-[0_4px_14px_rgba(90,48,90,0.2)] flex items-center justify-center">
                  <Lock size={16} className="text-[#5A305A]" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={field.value}
                  onChange={(e) => field.set(e.target.value)}
                  className={inputClass}
                  placeholder={field.placeholder}
                />
                {i === 0 && (
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    title={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                    className="absolute z-10 right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-[#5A305A]/60 hover:text-[#5A305A] hover:bg-[#5A305A]/5 transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                )}
              </div>
            ))}

            <p className="px-1 text-xs text-[#73507B]">
              Minimal 8 karakter, berisi huruf dan angka, dan berbeda dari
              password lama.
            </p>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => supabase.auth.signOut()}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#5A305A]/60 hover:text-[#5A305A] transition-colors"
              >
                <LogOut size={14} />
                Keluar
              </button>
              <button
                type="submit"
                disabled={loading}
                aria-label="Simpan password"
                title="Simpan password"
                className="w-12 h-12 shrink-0 rounded-full bg-[#5A305A] text-white flex items-center justify-center shadow-lg hover:bg-[#3F223F] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <ArrowRight size={20} />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
