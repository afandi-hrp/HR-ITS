import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, FileText, CheckCircle2, Loader2, File, AlertCircle, Phone, User, Mail, Briefcase, KeyRound } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { cn } from '../lib/utils';

export default function PublicCareer() {
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Form, 2: OTP, 3: Upload
  const [loading, setLoading] = useState(false);
  
  // Form Data
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [position, setPosition] = useState('');
  
  // OTP Data
  const [otpInput, setOtpInput] = useState('');
  const [otpRequestId, setOtpRequestId] = useState('');
  
  // Upload Data
  const [files, setFiles] = useState<File[]>([]);
  
  // Positions
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);

  const { toast } = useToast();

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        const { data, error } = await supabase
          .from('open_recruitment')
          .select('position')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching positions:', error);
        } else if (data) {
          const positions = Array.from(new Set(data.map(item => item.position)));
          setAvailablePositions(positions);
          if (positions.length > 0) {
            setPosition(positions[0]);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPositions(false);
      }
    };

    fetchPositions();
  }, []);

  const handleRequestOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName || !candidateEmail || !phoneNumber || !position) {
      toast({ title: 'Peringatan', description: 'Silakan lengkapi semua data.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Save to Supabase
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes expiration
      
      const { data, error } = await supabase
        .from('otp_requests')
        .insert([{
          phone_number: phoneNumber,
          otp_code: otpCode,
          expires_at: expiresAt.toISOString(),
          is_used: false
        }])
        .select()
        .single();

      if (error) throw error;
      
      setOtpRequestId(data.id);

      // Trigger n8n webhook
      const response = await fetch('/api/n8n/trigger-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneNumber,
          otp: otpCode
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Gagal mengirim OTP via WhatsApp');
      }

      toast({ title: 'OTP Terkirim', description: 'Silakan periksa WhatsApp Anda untuk kode OTP.' });
      setStep(2);
    } catch (error: any) {
      console.error('Error requesting OTP:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput || otpInput.length !== 6) {
      toast({ title: 'Peringatan', description: 'Masukkan 6 digit kode OTP.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('otp_requests')
        .select('*')
        .eq('id', otpRequestId)
        .single();

      if (error || !data) throw new Error('Permintaan OTP tidak ditemukan.');

      if (data.is_used) {
        throw new Error('Kode OTP ini sudah digunakan.');
      }

      if (new Date() > new Date(data.expires_at)) {
        throw new Error('Kode OTP sudah kadaluarsa. Silakan minta ulang.');
      }

      if (data.otp_code !== otpInput) {
        throw new Error('Kode OTP salah.');
      }

      // Mark as used
      await supabase
        .from('otp_requests')
        .update({ is_used: true })
        .eq('id', otpRequestId);

      toast({ title: 'Berhasil', description: 'Verifikasi berhasil. Silakan unggah CV Anda.' });
      setStep(3);
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      
      const validFiles = selectedFiles.filter(f => allowedTypes.includes(f.type) && f.size <= 5 * 1024 * 1024);
      const invalidFiles = selectedFiles.filter(f => !allowedTypes.includes(f.type) || f.size > 5 * 1024 * 1024);

      if (invalidFiles.length > 0) {
        toast({ 
          title: 'Beberapa File Ditolak', 
          description: 'Hanya file PDF/Word di bawah 5MB yang diperbolehkan.',
          variant: 'destructive' 
        });
      }

      if (validFiles.length > 0) {
        setFiles(validFiles); // Only allow 1 file for candidates usually, or multiple if needed. Let's keep it to 1 for simplicity.
      }
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast({ title: 'Peringatan', description: 'Silakan pilih file CV Anda.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const file = files[0];
      const formData = new FormData();
      
      // We need to fetch the admin's CV webhook URL. 
      // Since this is a public page, we can use a new endpoint or the existing one.
      // Wait, the existing /api/n8n/upload-cv requires webhookUrl in the body.
      // Let's create a public wrapper for it in server.ts, or just fetch the webhookUrl first.
      // Let's fetch the webhook URL via a new endpoint /api/n8n/public-cv-webhook
      const webhookRes = await fetch('/api/n8n/public-cv-webhook');
      if (!webhookRes.ok) {
        throw new Error('Sistem sedang tidak dapat menerima lamaran saat ini (Webhook belum dikonfigurasi).');
      }
      const { webhookUrl } = await webhookRes.json();

      formData.append('webhookUrl', webhookUrl);
      formData.append('candidateName', candidateName);
      formData.append('candidateEmail', candidateEmail);
      formData.append('candidatePosition', position);
      formData.append('fileName', file.name);
      formData.append('mimeType', file.type);
      formData.append('uploadedAt', new Date().toISOString());
      formData.append('senderName', candidateName);
      formData.append('senderEmail', candidateEmail);
      formData.append('file', file);

      const response = await fetch('/api/n8n/upload-cv', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Gagal mengirim lamaran: ${response.statusText}`);
      }

      toast({ 
        title: 'Lamaran Terkirim!', 
        description: 'Terima kasih telah melamar. Tim kami akan segera meninjau CV Anda.' 
      });
      
      // Reset
      setStep(1);
      setCandidateName('');
      setCandidateEmail('');
      setPhoneNumber('');
      setFiles([]);
      setOtpInput('');
      
    } catch (error: any) {
      console.error('Error uploading CV:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Gagal mengunggah CV. Periksa koneksi Anda.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4 shadow-lg shadow-indigo-200">
            <span className="text-white text-3xl font-bold">H</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Karir ITS Waruna
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Bergabunglah bersama kami dan jadilah bagian dari tim yang luar biasa.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Progress Bar */}
          <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center px-8">
            <div className={cn("flex flex-col items-center", step >= 1 ? "text-indigo-600" : "text-slate-400")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 1 ? "bg-indigo-100" : "bg-slate-100")}>1</div>
              <span className="text-xs font-medium">Data Diri</span>
            </div>
            <div className={cn("h-1 flex-1 mx-4 rounded-full", step >= 2 ? "bg-indigo-600" : "bg-slate-200")} />
            <div className={cn("flex flex-col items-center", step >= 2 ? "text-indigo-600" : "text-slate-400")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 2 ? "bg-indigo-100" : "bg-slate-100")}>2</div>
              <span className="text-xs font-medium">Verifikasi</span>
            </div>
            <div className={cn("h-1 flex-1 mx-4 rounded-full", step >= 3 ? "bg-indigo-600" : "bg-slate-200")} />
            <div className={cn("flex flex-col items-center", step >= 3 ? "text-indigo-600" : "text-slate-400")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 3 ? "bg-indigo-100" : "bg-slate-100")}>3</div>
              <span className="text-xs font-medium">Upload CV</span>
            </div>
          </div>

          <div className="p-8">
            {step === 1 && (
              <form onSubmit={handleRequestOTP} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nama Lengkap</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="text"
                      required
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="Masukkan nama lengkap"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="email"
                      required
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      placeholder="kandidat@email.com"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nomor WhatsApp</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type="tel"
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Contoh: 6281234567890"
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Gunakan format 628... Kode OTP akan dikirim ke nomor ini.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Posisi Dilamar</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    {loadingPositions ? (
                      <div className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
                        Memuat posisi...
                      </div>
                    ) : availablePositions.length > 0 ? (
                      <select
                        required
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium appearance-none"
                      >
                        <option value="" disabled>Pilih Posisi</option>
                        {availablePositions.map((pos, idx) => (
                          <option key={idx} value={pos}>{pos}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        placeholder="Contoh: Frontend Developer"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                      />
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Phone size={20} />}
                  Kirim OTP via WhatsApp
                </button>
              </form>
            )}

            {step === 2 && (
              <form onSubmit={handleVerifyOTP} className="space-y-6 text-center">
                <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <KeyRound size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Verifikasi WhatsApp</h2>
                <p className="text-sm text-slate-500">
                  Kami telah mengirimkan 6 digit kode OTP ke nomor <br/>
                  <span className="font-bold text-slate-700">{phoneNumber}</span>
                </p>

                <div className="pt-4">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="• • • • • •"
                    className="w-full text-center text-3xl tracking-[1em] py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otpInput.length !== 6}
                  className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                  Verifikasi OTP
                </button>
                
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-indigo-600 font-medium hover:underline"
                >
                  Ganti Nomor WhatsApp
                </button>
              </form>
            )}

            {step === 3 && (
              <form onSubmit={handleUpload} className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Upload CV Anda</h2>
                  <p className="text-sm text-slate-500">Format yang didukung: PDF, DOC, DOCX (Maks. 5MB)</p>
                </div>

                <div 
                  className={cn(
                    "relative border-2 border-dashed rounded-2xl p-10 transition-all flex flex-col items-center justify-center gap-4",
                    files.length > 0 ? "border-emerald-200 bg-emerald-50/30" : "border-slate-200 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/30"
                  )}
                >
                  <input
                    type="file"
                    onChange={handleFileChange}
                    accept=".pdf,.doc,.docx"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />
                  
                  {files.length > 0 ? (
                    <div className="w-full space-y-3 z-20">
                      {files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-sm relative z-20">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center",
                              file.type === 'application/pdf' ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {file.type === 'application/pdf' ? <FileText size={20} /> : <File size={20} />}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-sm truncate max-w-[200px]">{file.name}</p>
                              <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="text-center mt-4 pt-4 border-t border-slate-200">
                        <p className="text-sm font-medium text-indigo-600">Klik untuk mengganti file</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-white text-slate-400 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
                        <Upload size={32} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-slate-900">Klik atau seret file ke sini</p>
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || files.length === 0}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                  Kirim Lamaran
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
