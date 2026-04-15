import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Mail, Lock, Loader2, RefreshCw } from 'lucide-react';
import { SiteSettings } from '../types';
import { cn } from '../lib/utils';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const location = useLocation();

  // CAPTCHA states
  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let text = '';
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
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Background
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add noise (lines)
        for (let i = 0; i < 4; i++) {
          ctx.strokeStyle = `rgba(${Math.random() * 255},${Math.random() * 255},${Math.random() * 255}, 0.5)`;
          ctx.beginPath();
          ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
          ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
          ctx.stroke();
        }

        // Add text
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.fillStyle = '#334155';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw characters with slight rotation
        for (let i = 0; i < captchaText.length; i++) {
          ctx.save();
          ctx.translate(30 + i * 30, canvas.height / 2);
          ctx.rotate((Math.random() - 0.5) * 0.4);
          ctx.fillText(captchaText[i], 0, 0);
          ctx.restore();
        }
      }
    }
  }, [captchaText]);

  useEffect(() => {
    supabase.from('site_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) {
        setSettings(data);
      }
      // Trigger animation after a tiny delay for smooth entry
      setTimeout(() => setIsLoaded(true), 100);
    });

    if (location.state?.message) {
      setMessage(location.state.message);
    }
  }, [location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (captchaInput !== captchaText) {
      setError("CAPTCHA tidak valid. Silakan coba lagi.");
      generateCaptcha();
      setCaptchaInput('');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent p-4 relative overflow-hidden">
      {/* Login Form Layer */}
      <div 
        className={cn(
          "w-full max-w-md relative z-10 transition-all duration-700 ease-out",
          !isLoaded ? "opacity-0 scale-90" : "opacity-100 scale-100"
        )}
      >
        <div className="bg-white/40 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/60 p-8">
          <div className="text-center mb-8">
            {settings?.login_logo_url && (
              <img src={settings.login_logo_url} alt="Logo" className="h-24 mx-auto mb-4 object-contain drop-shadow-sm" referrerPolicy="no-referrer" />
            )}
            <h1 className="text-2xl font-bold text-slate-900">Welcome</h1>
            <p className="text-slate-500 mt-2">Login to ATS Waruna Group Dashboard</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50/80 backdrop-blur-sm border border-red-200 text-red-600 text-sm rounded-xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-red-600 font-bold">!</span>
              </div>
              <p className="font-medium">{error}</p>
            </div>
          )}

          {message && !error && (
            <div className="mb-6 p-4 bg-indigo-50/80 backdrop-blur-sm border border-indigo-200 text-indigo-700 text-sm rounded-xl flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center shrink-0">
                <span className="text-indigo-600 font-bold">i</span>
              </div>
              <p className="font-medium">{message}</p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-white/40 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all"
                  placeholder="name@company.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-white/50 border border-white/40 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Verifikasi Keamanan</label>
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <input
                    type="text"
                    required
                    maxLength={4}
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    className="block w-full px-4 py-3 bg-white/50 border border-white/40 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all font-mono tracking-widest"
                    placeholder="Ketik 4 karakter"
                  />
                </div>
                <div className="flex items-center gap-2 bg-white/60 p-1.5 rounded-xl border border-white/40 shadow-sm">
                  <canvas 
                    ref={canvasRef} 
                    width="140" 
                    height="40" 
                    className="rounded-lg bg-slate-50 border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={generateCaptcha}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-white/80 rounded-lg transition-colors"
                    title="Muat ulang CAPTCHA"
                  >
                    <RefreshCw size={18} />
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? (
                <Loader2 className="animate-spin h-5 w-5" />
              ) : (
                'Masuk Sekarang'
              )}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-500">
            <p>© 2026 ATS Waruna Group App.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
