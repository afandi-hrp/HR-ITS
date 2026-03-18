import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '@supabase/supabase-js';
import { 
  User as UserIcon, 
  Camera, 
  Lock, 
  Save,
  Loader2,
  Settings as SettingsIcon,
  X
} from 'lucide-react';
import { useToast } from '../components/ui/use-toast';

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState('');
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('');
  const [cvWebhookUrl, setCvWebhookUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingWebhook, setTestingWebhook] = useState<'email' | 'cv' | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showWebhookSettings, setShowWebhookSettings] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setFullName(user?.user_metadata.full_name || '');
      setN8nWebhookUrl(user?.user_metadata.n8n_webhook_url || '');
      setCvWebhookUrl(user?.user_metadata.cv_webhook_url || '');
    });
  }, []);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    if (n8nWebhookUrl.trim() === cvWebhookUrl.trim() && n8nWebhookUrl.trim() !== '') {
      toast({ 
        title: 'Peringatan', 
        description: 'Anda menggunakan URL yang sama untuk kedua webhook. Pastikan workflow n8n Anda dapat menangani kedua jenis event tersebut.',
        variant: 'default'
      });
    }
    
    const { error } = await supabase.auth.updateUser({
      data: { 
        full_name: fullName,
        n8n_webhook_url: n8nWebhookUrl.trim(),
        cv_webhook_url: cvWebhookUrl.trim()
      }
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: 'Profil diperbarui.' });
    }
    setLoading(false);
  };

  const testWebhook = async (type: 'email' | 'cv') => {
    const url = type === 'email' ? n8nWebhookUrl : cvWebhookUrl;
    if (!url) {
      toast({ title: 'Peringatan', description: 'Silakan masukkan URL webhook terlebih dahulu.', variant: 'destructive' });
      return;
    }

    setTestingWebhook(type);
    try {
      const response = await fetch('/api/n8n/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: url,
          payload: {
            event: 'test_connection',
            type: type,
            timestamp: new Date().toISOString(),
            message: 'Testing connection from HR Dashboard'
          }
        }),
      });

      const responseText = await response.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        data = { error: responseText };
      }

      if (response.ok) {
        toast({ title: 'Berhasil', description: `Koneksi ke webhook ${type === 'email' ? 'Email' : 'CV'} berhasil!` });
      } else {
        toast({ 
          title: 'Gagal', 
          description: data.error || `Koneksi gagal: ${response.statusText}`, 
          variant: 'destructive' 
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Terjadi kesalahan saat mencoba koneksi.', variant: 'destructive' });
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Password tidak cocok.', variant: 'destructive' });
      return;
    }

    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: 'Password diperbarui.' });
      setNewPassword('');
      setConfirmPassword('');
    }
    setPasswordLoading(false);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === 'Waruna#10') {
      setShowWebhookSettings(true);
      setShowPinModal(false);
      setPinInput('');
      toast({ title: 'Akses Diberikan', description: 'Pengaturan Webhook sekarang dapat diakses.' });
    } else {
      toast({ title: 'PIN Salah', description: 'PIN yang Anda masukkan tidak valid.', variant: 'destructive' });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}-${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) {
      toast({ title: 'Error', description: uploadError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl }
    });

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: 'Foto profil diperbarui.' });
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-1 mb-2">
        <h1 className="text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">
          Pengaturan Akun
        </h1>
        <p className="text-sm font-medium text-slate-500 max-w-xl">
          Kelola informasi profil dan keamanan akun Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left: Avatar */}
        <div className="md:col-span-1">
          <div className="bg-white/70 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm text-center">
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-full bg-slate-100 border-4 border-white shadow-md overflow-hidden mx-auto">
                {user.user_metadata.avatar_url ? (
                  <img src={user.user_metadata.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-indigo-50 text-indigo-700 text-4xl font-bold">
                    {fullName?.[0] || user.email?.[0].toUpperCase()}
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-all">
                <Camera size={20} />
                <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
              </label>
            </div>
            <div className="mt-4">
              <h3 className="font-bold text-slate-900">{fullName || 'User'}</h3>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Right: Forms */}
        <div className="md:col-span-2 space-y-8">
          {/* Profile Form */}
          <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <UserIcon size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Informasi Profil</h2>
            </div>
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Nama Lengkap</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Masukkan nama lengkap"
                />
              </div>

              {!showWebhookSettings ? (
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">Pengaturan Webhook</h3>
                    <p className="text-xs text-slate-500">Tersembunyi untuk keamanan</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowPinModal(true)}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Buka Pengaturan Webhook"
                  >
                    <SettingsIcon size={20} />
                  </button>
                </div>
              ) : (
                <div className="space-y-6 p-6 bg-slate-50 border border-slate-200 rounded-xl relative">
                  <button
                    type="button"
                    onClick={() => setShowWebhookSettings(false)}
                    className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                    title="Sembunyikan Pengaturan Webhook"
                  >
                    <X size={16} />
                  </button>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">n8n Webhook URL</label>
                    <input
                      type="url"
                      value={n8nWebhookUrl}
                      onChange={(e) => setN8nWebhookUrl(e.target.value)}
                      className="block w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      placeholder="https://n8n.your-domain.com/webhook/..."
                    />
                    <p className="mt-2 text-xs text-slate-500 italic">
                      URL ini akan dipicu saat Anda mengklik tombol "Kirim Undangan" di menu Screening. 
                    </p>
                    <button
                      type="button"
                      onClick={() => testWebhook('email')}
                      disabled={testingWebhook === 'email'}
                      className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      {testingWebhook === 'email' ? <Loader2 className="animate-spin" size={12} /> : null}
                      Test Koneksi Email Webhook
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">n8n CV Upload Webhook URL</label>
                    <input
                      type="url"
                      value={cvWebhookUrl}
                      onChange={(e) => setCvWebhookUrl(e.target.value)}
                      className="block w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                      placeholder="https://n8n.your-domain.com/webhook/..."
                    />
                    <p className="mt-2 text-xs text-slate-500 italic">
                      URL ini khusus digunakan untuk menu <strong>Upload CV</strong>. 
                      File akan dikirimkan sebagai <code>multipart/form-data</code> (format asli).
                    </p>
                    <button
                      type="button"
                      onClick={() => testWebhook('cv')}
                      disabled={testingWebhook === 'cv'}
                      className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-50"
                    >
                      {testingWebhook === 'cv' ? <Loader2 className="animate-spin" size={12} /> : null}
                      Test Koneksi CV Webhook
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                Simpan Perubahan
              </button>
            </form>
          </div>

          {/* Password Form */}
          <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Lock size={20} />
              </div>
              <h2 className="text-xl font-bold text-slate-900">Keamanan</h2>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Password Baru</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Konfirmasi Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={passwordLoading}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
              >
                {passwordLoading ? <Loader2 className="animate-spin" size={20} /> : <Lock size={20} />}
                Perbarui Password
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Masukkan PIN</h3>
              <button 
                onClick={() => {
                  setShowPinModal(false);
                  setPinInput('');
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePinSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">PIN Keamanan</label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center tracking-widest text-lg"
                  placeholder="••••••••"
                  autoFocus
                />
                <p className="mt-2 text-xs text-slate-500 text-center">
                  Masukkan PIN untuk mengakses pengaturan webhook.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false);
                    setPinInput('');
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!pinInput}
                  className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  Verifikasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
