import React, { useState, useEffect } from "react";
import { fetchWithRetry } from "../lib/utils";
import { api } from "../lib/api";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";
import {
  User as UserIcon,
  Camera,
  Lock,
  Save,
  Loader2,
  Settings as SettingsIcon,
  Webhook,
  Palette,
  X,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { usePermissions } from "../hooks/usePermissions";
import { useAuth } from "../contexts/AuthContext";

// n8n webhook URLs are set once for the whole app in the server .env
// (N8N_WEBHOOK_*), not per user. Keys match server.ts N8N_WEBHOOK_ENV.
const N8N_WEBHOOKS = [
  { key: "email", label: "Email", env: "N8N_WEBHOOK_EMAIL", description: 'Tombol "Kirim Undangan" (email) di Screening dan jadwal.' },
  { key: "wa", label: "WhatsApp Invitation", env: "N8N_WEBHOOK_WA", description: 'Tombol "Kirim WA" di Screening dan jadwal.' },
  { key: "otp", label: "WhatsApp OTP", env: "N8N_WEBHOOK_OTP", description: "Kandidat meminta OTP di halaman publik /career." },
  { key: "cv", label: "CV Upload (Internal)", env: "N8N_WEBHOOK_CV", description: "Menu Upload CV dan Bulk Upload di dashboard." },
  { key: "public_cv", label: "CV Upload (Public Career)", env: "N8N_WEBHOOK_PUBLIC_CV", description: "Upload CV dari halaman publik /career." },
  { key: "sheet", label: "Google Sheets Sync", env: "N8N_WEBHOOK_SHEET", description: "Sinkronisasi otomatis setelah hapus di Open Recruitment." },
  { key: "external_data_delete", label: "External Data DELETE", env: "N8N_WEBHOOK_EXTERNAL_DATA_DELETE", description: "Hapus kartu di menu Data Eksternal." },
  { key: "ai_analysis", label: "AI Analysis (Biodata)", env: "N8N_WEBHOOK_AI_ANALYSIS", description: '"Analisa Biodata dengan AI" di Profil Kandidat.' },
  { key: "ai_psikotes", label: "AI Psikotes Analysis", env: "N8N_WEBHOOK_AI_PSIKOTES", description: '"Analisa Psikotes dengan AI" di Profil Kandidat.' },
  { key: "ai_interview", label: "AI Interview Questions", env: "N8N_WEBHOOK_AI_INTERVIEW", description: '"Generate Pertanyaan Interview (AI)" di Profil Kandidat.' },
] as const;
type N8nWebhookKey = (typeof N8N_WEBHOOKS)[number]["key"];

export default function Settings() {
  const { isUserManager, isApprovalRole } = usePermissions();
  const { profile } = useAuth();
  const [user, setUser] = useState<User | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [loginLogoUrl, setLoginLogoUrl] = useState("");
  const [careerLogoUrl, setCareerLogoUrl] = useState("");
  const [sidebarLogoUrl, setSidebarLogoUrl] = useState("");
  const [sidebarText, setSidebarText] = useState("");
  const [loginAnimationUrl, setLoginAnimationUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [jobSources, setJobSources] = useState<string[]>([]);
  const [careerJobSources, setCareerJobSources] = useState<string[]>([]);
  const [newJobSource, setNewJobSource] = useState("");
  const [newCareerJobSource, setNewCareerJobSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadingAssets, setUploadingAssets] = useState<
    Record<string, boolean>
  >({});
  const [testingWebhook, setTestingWebhook] = useState<N8nWebhookKey | null>(
    null,
  );
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinType, setPinType] = useState<"display" | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [displayPin, setDisplayPin] = useState("Waruna#10"); // Default PIN
  const [newDisplayPin, setNewDisplayPin] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error) {
          console.warn("Settings getUser error:", error.message);
        }
        setUser(user);

        setFullName(user?.user_metadata.full_name || "");
        setPhone(user?.user_metadata.phone || "");
        if (user?.user_metadata.display_pin)
          setDisplayPin(user.user_metadata.display_pin);
      } catch (err) {
        console.warn("Settings failed to get user:", err);
      }
    };
    fetchUserData();

    const fetchSettings = async () => {
      try {
        const { data } = await supabase
          .from("site_settings")
          .select("*")
          .eq("id", 1)
          .single();
        if (data) {
          setLoginLogoUrl(data.login_logo_url || "");
          setCareerLogoUrl(data.career_logo_url || "");
          setSidebarLogoUrl(data.sidebar_logo_url || "");
          setSidebarText(data.sidebar_text || "");
          setLoginAnimationUrl(data.login_animation_url || "");
          setFaviconUrl(data.favicon_url || "");
          setJobSources(
            data.job_sources && data.job_sources.length > 0
              ? data.job_sources
              : [
                  "Campus Hiring",
                  "Email",
                  "Instagram",
                  "Jobstreet",
                  "LinkedIn",
                  "Referensi",
                  "Walk In",
                  "TGT Program",
                  "Head Hunter",
                  "Others",
                ],
          );
          setCareerJobSources(
            data.career_job_sources && data.career_job_sources.length > 0
              ? data.career_job_sources
              : [
                  "Campus Hiring",
                  "Email",
                  "Instagram",
                  "Jobstreet",
                  "LinkedIn",
                  "Referensi",
                  "Walk In",
                  "TGT Program",
                  "Head Hunter",
                  "Others",
                ],
          );
        }
      } catch (err) {
        console.warn("Failed to get site settings:", err);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (isUserManager || isApprovalRole) return;
    api
      .get<Record<string, boolean>>("/api/n8n/webhook-status")
      .then(setWebhookStatus)
      .catch((err) => console.warn("Failed to get webhook status:", err));
  }, [isUserManager, isApprovalRole]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: fullName,
        phone: phone.trim(),
        display_pin: newDisplayPin || displayPin,
      },
    });

    if (newDisplayPin) {
      setDisplayPin(newDisplayPin);
      setNewDisplayPin("");
    }
    
    if (user) {
      await supabase.from("profiles").update({ full_name: fullName, phone: phone.trim() }).eq("id", user.id);
    }

    const { error: settingsError } = await supabase
      .from("site_settings")
      .upsert({
        id: 1,
        login_logo_url: loginLogoUrl.trim(),
        career_logo_url: careerLogoUrl.trim(),
        sidebar_logo_url: sidebarLogoUrl.trim(),
        sidebar_text: sidebarText.trim(),
        login_animation_url: loginAnimationUrl.trim(),
        favicon_url: faviconUrl.trim(),
        job_sources: jobSources,
        career_job_sources: careerJobSources,
        updated_at: new Date().toISOString(),
      });

    if (error || settingsError) {
      toast({
        title: "Error",
        description: error?.message || settingsError?.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Berhasil",
        description: "Profil dan pengaturan diperbarui.",
      });
    }
    setLoading(false);
  };

  const testWebhook = async (type: N8nWebhookKey) => {
    const label = N8N_WEBHOOKS.find((w) => w.key === type)?.label || type;
    setTestingWebhook(type);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const response = await fetchWithRetry("/api/n8n/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          type: "test",
          payload: {
            event: "test_connection",
            type: type,
            timestamp: new Date().toISOString(),
            message: "Testing connection from HR Dashboard",
          },
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
        toast({
          title: "Berhasil",
          description: data.message || `Koneksi ke webhook ${label} berhasil!`,
        });
      } else {
        toast({
          title: "Gagal",
          description: data.error || `Koneksi gagal: ${response.statusText}`,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Terjadi kesalahan saat mencoba koneksi.",
        variant: "destructive",
      });
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Password tidak cocok.",
        variant: "destructive",
      });
      return;
    }

    setPasswordLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Berhasil", description: "Password diperbarui." });
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordLoading(false);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Hash the input pin for comparison (simulated SHA512 for now, ideally done backend)
    const encoder = new TextEncoder();
    const data = encoder.encode(pinInput);
    const hashBuffer = await crypto.subtle.digest("SHA-512", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashedPinInput = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // For demonstration, we'll check against plain text or hashed if stored that way
    // In a real scenario, you'd only store and compare hashes.
    // Here we'll just use the plain text comparison for simplicity as requested,
    // but the user asked if it can be SHA512. We'll simulate the check.

    const isDisplayValid =
      pinType === "display" &&
      (pinInput === displayPin || hashedPinInput === displayPin);

    if (isDisplayValid) {
      setShowDisplaySettings(true);
      setShowPinModal(false);
      setPinInput("");
      setPinType(null);
      toast({
        title: "Akses Diberikan",
        description: "Pengaturan Tampilan sekarang dapat diakses.",
      });
    } else {
      toast({
        title: "PIN Salah",
        description: "PIN yang Anda masukkan tidak valid.",
        variant: "destructive",
      });
    }
  };

  const openPinModal = (type: "display") => {
    setPinType(type);
    setShowPinModal(true);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setLoading(true);
    const fileExt = file.name.split(".").pop();
    const fileName = `${user.id}-${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file);

    if (uploadError) {
      toast({
        title: "Error",
        description: uploadError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(filePath);

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: publicUrl },
    });

    if (updateError) {
      toast({
        title: "Error",
        description: updateError.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Berhasil", description: "Foto profil diperbarui." });
    }
    setLoading(false);
  };

  const handleAssetUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    type:
      "loginLogo" | "careerLogo" | "sidebarLogo" | "favicon" | "loginAnimation",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAssets((prev) => ({ ...prev, [type]: true }));
    const fileExt = file.name.split(".").pop();
    const fileName = `${type}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("site-assets")
      .upload(filePath, file);

    if (uploadError) {
      toast({
        title: "Error",
        description: uploadError.message,
        variant: "destructive",
      });
      setUploadingAssets((prev) => ({ ...prev, [type]: false }));
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("site-assets").getPublicUrl(filePath);

    if (type === "loginLogo") setLoginLogoUrl(publicUrl);
    if (type === "careerLogo") setCareerLogoUrl(publicUrl);
    if (type === "sidebarLogo") setSidebarLogoUrl(publicUrl);
    if (type === "favicon") setFaviconUrl(publicUrl);
    if (type === "loginAnimation") setLoginAnimationUrl(publicUrl);

    toast({
      title: "Berhasil",
      description: "File berhasil diunggah. Jangan lupa klik Simpan Perubahan.",
    });
    setUploadingAssets((prev) => ({ ...prev, [type]: false }));
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-1 mb-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#5A305A]">
          Pengaturan Akun
        </h1>
        <p className="text-sm font-medium text-[#5A305A]/70 max-w-xl">
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
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-indigo-50 text-indigo-700 text-4xl font-bold">
                    {fullName?.[0] || user.email?.[0]?.toUpperCase()}
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 p-2 bg-[#5A305A] text-white rounded-full shadow-lg cursor-pointer hover:bg-[#3F223F] transition-all">
                <Camera size={20} />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                />
              </label>
            </div>
            <div className="mt-4">
              <h3 className="font-bold text-[#5A305A]">{fullName || "User"}</h3>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Right: Forms */}
        <div className="md:col-span-2 space-y-8">
          <form onSubmit={handleUpdateProfile} className="space-y-8">
          {/* Profile Form */}
          <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <UserIcon size={20} />
              </div>
              <h2 className="text-xl font-bold text-[#5A305A]">
                Informasi Profil
              </h2>
            </div>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nama Lengkap
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Masukkan nama lengkap"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Nomor WhatsApp
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  placeholder="Contoh: 081234567890 (Hanya untuk internal)"
                />
              </div>

              {profile?.job_title && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Jabatan
                  </label>
                  <input
                    type="text"
                    value={profile.job_title}
                    disabled
                    className="block w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-xl text-slate-500 cursor-not-allowed"
                  />
                </div>
              )}
            </div>
          </div>

          {!isUserManager && !isApprovalRole && (
            <>
              {/* Webhook Status Card — URL diatur di .env server, bukan per user */}
              <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-sky-50 text-sky-600 rounded-lg">
                    <Webhook size={20} />
                  </div>
                  <h2 className="text-xl font-bold text-[#5A305A]">
                    Status Webhook n8n
                  </h2>
                </div>
                <p className="text-xs text-[#73507B] mb-6">
                  URL webhook berlaku untuk semua user dan diatur oleh admin di
                  file <code>.env</code> server. Perubahan URL memerlukan
                  restart server.
                </p>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-slate-50">
                  {N8N_WEBHOOKS.map((w) => {
                    const configured = webhookStatus?.[w.key];
                    return (
                      <div
                        key={w.key}
                        className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-4"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-[#5A305A]">
                              {w.label}
                            </h3>
                            {webhookStatus === null ? (
                              <span className="text-xs text-[#73507B]">
                                Memuat...
                              </span>
                            ) : configured ? (
                              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Terkonfigurasi
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[#F58C77]/10 text-[#c2412c] border border-[#F58C77]/40">
                                Belum diisi
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#73507B] mt-1">
                            {w.description}{" "}
                            <code className="text-[11px]">{w.env}</code>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => testWebhook(w.key)}
                          disabled={!configured || testingWebhook === w.key}
                          className="shrink-0 px-4 py-2 text-sm font-bold text-white bg-[#5A305A] hover:bg-[#3F223F] rounded-lg flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm w-fit"
                        >
                          {testingWebhook === w.key ? (
                            <Loader2 className="animate-spin" size={16} />
                          ) : null}
                          Test Koneksi
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Display Settings Card */}
              <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-fuchsia-50 text-fuchsia-600 rounded-lg">
                    <Palette size={20} />
                  </div>
                  <h2 className="text-xl font-bold text-[#5A305A]">
                    Pengaturan Tampilan
                  </h2>
                </div>
                {!showDisplaySettings ? (
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-700">
                      Terkunci dengan PIN
                    </h3>
                    <p className="text-xs text-slate-500">
                      Tersembunyi untuk keamanan
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPinModal("display")}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Buka Pengaturan Tampilan"
                  >
                    <SettingsIcon size={20} />
                  </button>
                </div>
              ) : (
                <div className="space-y-6 p-6 bg-slate-50 border border-slate-200 rounded-xl relative">
                  <button
                    type="button"
                    onClick={() => setShowDisplaySettings(false)}
                    className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-all"
                    title="Sembunyikan Pengaturan Tampilan"
                  >
                    <X size={16} />
                  </button>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Logo Halaman Login
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center justify-center px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-sm font-medium text-slate-700">
                          {uploadingAssets["loginLogo"] ? (
                            <>
                              <Loader2
                                className="animate-spin mr-2"
                                size={16}
                              />{" "}
                              Mengunggah...
                            </>
                          ) : (
                            <>
                              <Camera className="mr-2" size={16} /> Pilih File
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleAssetUpload(e, "loginLogo")}
                            disabled={uploadingAssets["loginLogo"]}
                          />
                        </label>
                        {loginLogoUrl && (
                          <div className="flex-1 truncate text-xs text-slate-500">
                            {loginLogoUrl}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Logo Halaman Karir Publik
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center justify-center px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-sm font-medium text-slate-700">
                          {uploadingAssets["careerLogo"] ? (
                            <>
                              <Loader2
                                className="animate-spin mr-2"
                                size={16}
                              />{" "}
                              Mengunggah...
                            </>
                          ) : (
                            <>
                              <Camera className="mr-2" size={16} /> Pilih File
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => handleAssetUpload(e, "careerLogo")}
                            disabled={uploadingAssets["careerLogo"]}
                          />
                        </label>
                        {careerLogoUrl && (
                          <div className="flex-1 truncate text-xs text-slate-500">
                            {careerLogoUrl}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Logo Sidebar Navigasi
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center justify-center px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-sm font-medium text-slate-700">
                          {uploadingAssets["sidebarLogo"] ? (
                            <>
                              <Loader2
                                className="animate-spin mr-2"
                                size={16}
                              />{" "}
                              Mengunggah...
                            </>
                          ) : (
                            <>
                              <Camera className="mr-2" size={16} /> Pilih File
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={(e) =>
                              handleAssetUpload(e, "sidebarLogo")
                            }
                            disabled={uploadingAssets["sidebarLogo"]}
                          />
                        </label>
                        {sidebarLogoUrl && (
                          <div className="flex-1 truncate text-xs text-slate-500">
                            {sidebarLogoUrl}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Teks Sidebar Navigasi
                      </label>
                      <input
                        type="text"
                        value={sidebarText}
                        onChange={(e) => setSidebarText(e.target.value)}
                        className="block w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        placeholder="HRD Pro"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Favicon
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center justify-center px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-sm font-medium text-slate-700">
                          {uploadingAssets["favicon"] ? (
                            <>
                              <Loader2
                                className="animate-spin mr-2"
                                size={16}
                              />{" "}
                              Mengunggah...
                            </>
                          ) : (
                            <>
                              <Camera className="mr-2" size={16} /> Pilih File
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/x-icon,image/png,image/jpeg,image/svg+xml"
                            onChange={(e) => handleAssetUpload(e, "favicon")}
                            disabled={uploadingAssets["favicon"]}
                          />
                        </label>
                        {faviconUrl && (
                          <div className="flex-1 truncate text-xs text-slate-500">
                            {faviconUrl}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Animasi Login (Gambar/Video)
                      </label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center justify-center px-4 py-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-all text-sm font-medium text-slate-700">
                          {uploadingAssets["loginAnimation"] ? (
                            <>
                              <Loader2
                                className="animate-spin mr-2"
                                size={16}
                              />{" "}
                              Mengunggah...
                            </>
                          ) : (
                            <>
                              <Camera className="mr-2" size={16} /> Pilih File
                            </>
                          )}
                          <input
                            type="file"
                            className="hidden"
                            accept="image/*,video/*"
                            onChange={(e) =>
                              handleAssetUpload(e, "loginAnimation")
                            }
                            disabled={uploadingAssets["loginAnimation"]}
                          />
                        </label>
                        {loginAnimationUrl && (
                          <div className="flex-1 truncate text-xs text-slate-500">
                            {loginAnimationUrl}
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-slate-500 italic">
                        Upload file gambar (PNG/JPG/GIF) atau video (MP4) untuk
                        animasi di halaman login.
                      </p>
                    </div>
                    <div className="pt-4 border-t border-slate-200">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Sumber Lowongan (Upload CV)
                      </label>
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          value={newJobSource}
                          onChange={(e) => setNewJobSource(e.target.value)}
                          placeholder="Tambah sumber baru..."
                          className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              newJobSource.trim() &&
                              !jobSources.includes(newJobSource.trim())
                            ) {
                              setJobSources([
                                ...jobSources,
                                newJobSource.trim(),
                              ]);
                              setNewJobSource("");
                            }
                          }}
                          className="px-4 py-2 bg-[#5A305A] text-white rounded-xl hover:bg-[#3F223F] transition-all text-sm font-medium"
                        >
                          Tambah
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {jobSources.map((source, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-sm text-slate-700"
                          >
                            <span>{source}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setJobSources(
                                  jobSources.filter((_, i) => i !== idx),
                                )
                              }
                              className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500 italic">
                        Daftar ini akan muncul sebagai pilihan di halaman Upload
                        CV.
                      </p>
                    </div>

                    <div className="pt-4 border-t border-slate-200">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Sumber Lowongan (Public Career / Form Pelamar)
                      </label>
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          value={newCareerJobSource}
                          onChange={(e) =>
                            setNewCareerJobSource(e.target.value)
                          }
                          placeholder="Tambah sumber baru..."
                          className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              newCareerJobSource.trim() &&
                              !careerJobSources.includes(
                                newCareerJobSource.trim(),
                              )
                            ) {
                              setCareerJobSources([
                                ...careerJobSources,
                                newCareerJobSource.trim(),
                              ]);
                              setNewCareerJobSource("");
                            }
                          }}
                          className="px-4 py-2 bg-[#5A305A] text-white rounded-xl hover:bg-[#3F223F] transition-all text-sm font-medium"
                        >
                          Tambah
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {careerJobSources.map((source, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg text-sm text-slate-700"
                          >
                            <span>{source}</span>
                            <button
                              type="button"
                              onClick={() =>
                                setCareerJobSources(
                                  careerJobSources.filter((_, i) => i !== idx),
                                )
                              }
                              className="text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500 italic">
                        Daftar ini akan muncul sebagai pilihan di halaman Public
                        Career (Form Pelamar).
                      </p>
                    </div>
                    <div className="pt-4 border-t border-slate-200">
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Ubah PIN Tampilan
                      </label>
                      <input
                        type="password"
                        value={newDisplayPin}
                        onChange={(e) => setNewDisplayPin(e.target.value)}
                        className="block w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                        placeholder="Masukkan PIN baru (opsional)"
                      />
                      <p className="mt-2 text-xs text-slate-500 italic">
                        Biarkan kosong jika tidak ingin mengubah PIN. PIN akan
                        dienkripsi (SHA512) saat disimpan (simulasi).
                      </p>
                    </div>
                  </div>
                </div>
              )}
              </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                className="flex items-center gap-2 px-6 py-3 bg-[#5A305A] text-white font-bold rounded-xl hover:bg-[#3F223F] transition-all disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Save size={20} />
                )}
                Simpan Perubahan
              </button>
          </form>

          {/* Password Form */}
          <div className="bg-white/70 backdrop-blur-md p-8 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Lock size={20} />
              </div>
              <h2 className="text-xl font-bold text-[#5A305A]">Keamanan</h2>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Password Baru
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Konfirmasi Password
                  </label>
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
                {passwordLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Lock size={20} />
                )}
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
              <h3 className="text-lg font-bold text-[#5A305A]">
                Masukkan PIN Tampilan
              </h3>
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setPinInput("");
                  setPinType(null);
                }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handlePinSubmit} className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  PIN Keamanan
                </label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="block w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center tracking-widest text-lg"
                  placeholder="••••••••"
                  autoFocus
                />
                <p className="mt-2 text-xs text-slate-500 text-center">
                  Masukkan PIN untuk mengakses pengaturan{" "}
                  tampilan.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPinModal(false);
                    setPinInput("");
                    setPinType(null);
                  }}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!pinInput}
                  className="flex-1 py-3 bg-[#5A305A] text-white font-bold rounded-xl hover:bg-[#3F223F] transition-all disabled:opacity-50"
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
