import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Upload, FileText, CheckCircle2, Loader2, File, AlertCircle, Phone, User, Mail, Briefcase, KeyRound, ChevronRight, X, ArrowLeft, ClipboardList, GraduationCap, RefreshCw, MessageCircle, Heart, TrendingUp, Users, Zap, HelpCircle, ChevronDown, ChevronUp, Quote, Star } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { cn, fetchWithRetry } from '../lib/utils';
import { SiteSettings } from '../types';

interface OpenRecruitment {
  id: string;
  position: string;
  jobdesk: string;
  kualifikasi: string;
  created_at: string;
}

export default function PublicCareer() {
  const [view, setView] = useState<'listing' | 'form'>('listing');
  const [selectedJob, setSelectedJob] = useState<OpenRecruitment | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Form, 2: OTP, 3: Upload
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  
  // Form Data
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [position, setPosition] = useState('');
  
  // OTP Data
  const [otpInput, setOtpInput] = useState('');
  const [otpRequestId, setOtpRequestId] = useState('');
  const [uploadToken, setUploadToken] = useState('');
  
  // Upload Data
  const [files, setFiles] = useState<File[]>([]);
  
  // CAPTCHA Data
  const [captchaText, setCaptchaText] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Positions
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [jobs, setJobs] = useState<OpenRecruitment[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);

  const [showOtpConfirmModal, setShowOtpConfirmModal] = useState(false);
  const [showUploadConfirmModal, setShowUploadConfirmModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const { toast } = useToast();

  const faqs = [
    {
      q: "Berapa lama proses seleksi berlangsung?",
      a: "Proses seleksi biasanya memakan waktu 1-2 minggu setelah batas waktu pendaftaran ditutup. Kami akan menghubungi Anda melalui email atau WhatsApp terkait status lamaran Anda."
    },
    {
      q: "Apakah fresh graduate bisa melamar?",
      a: "Tentu! Kami memiliki beberapa posisi entry-level yang sangat cocok untuk fresh graduate. Silakan cek kualifikasi pada setiap lowongan."
    },
    {
      q: "Apakah saya bisa melamar lebih dari satu posisi?",
      a: "Kami menyarankan Anda untuk melamar pada posisi yang paling sesuai dengan minat dan keahlian Anda. Namun, Anda diperbolehkan melamar maksimal 2 posisi yang relevan."
    },
    {
      q: "Bagaimana tahapan interview di Waruna Group?",
      a: "Tahapan interview meliputi interview HR untuk menilai kecocokan budaya kerja, dilanjutkan dengan interview User/Teknis untuk menilai kompetensi spesifik sesuai posisi."
    }
  ];

  const benefits = [
    { icon: <Heart className="text-rose-500" size={24} />, title: "Asuransi Kesehatan", desc: "Perlindungan kesehatan komprehensif untuk Anda dan keluarga." },
    { icon: <TrendingUp className="text-emerald-500" size={24} />, title: "Jenjang Karir", desc: "Kesempatan berkembang dengan program mentoring dan promosi yang jelas." },
    { icon: <Users className="text-blue-500" size={24} />, title: "Lingkungan Positif", desc: "Budaya kerja yang kolaboratif, inklusif, dan saling mendukung." },
    { icon: <Zap className="text-amber-500" size={24} />, title: "Pelatihan Rutin", desc: "Program pengembangan skill dan kompetensi secara berkala." }
  ];

  const processSteps = [
    { step: "01", title: "Seleksi Berkas", desc: "Tim HR kami akan mereview CV dan portofolio Anda." },
    { step: "02", title: "Psikotes & Teknis", desc: "Pengerjaan tes sesuai dengan bidang yang dilamar." },
    { step: "03", title: "Wawancara", desc: "Sesi diskusi dengan tim HR dan calon atasan Anda." },
    { step: "04", title: "Offering", desc: "Penawaran kerja dan proses onboarding karyawan baru." }
  ];

  const generateCaptcha = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let text = '';
    for (let i = 0; i < 5; i++) {
      text += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaText(text);
  };

  useEffect(() => {
    if (step === 2) {
      generateCaptcha();
    }
  }, [step]);

  useEffect(() => {
    if (step === 2 && captchaText && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Background
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Add noise (lines)
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
          ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
          ctx.strokeStyle = '#cbd5e1';
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
          ctx.translate(20 + i * 20, canvas.height / 2);
          ctx.rotate((Math.random() - 0.5) * 0.4);
          ctx.fillText(captchaText[i], 0, 0);
          ctx.restore();
        }
      }
    }
  }, [captchaText, step]);

  useEffect(() => {
    supabase.from('site_settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) setSettings(data);
    });

    const fetchPositions = async () => {
      try {
        const { data, error } = await supabase
          .from('open_recruitment')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching positions:', error);
        } else if (data) {
          setJobs(data);
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

  const handleRequestOTPClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName || !candidateEmail || !phoneNumber || !position) {
      toast({ title: 'Peringatan', description: 'Silakan lengkapi semua data.', variant: 'destructive' });
      return;
    }
    setShowOtpConfirmModal(true);
  };

  const handleRequestOTP = async () => {
    setShowOtpConfirmModal(false);
    setLoading(true);
    try {
      // Request OTP via backend
      const response = await fetchWithRetry('/api/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneNumber
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal mengirim OTP via WhatsApp');
      }

      const data = await response.json();
      setOtpRequestId(data.otpRequestId);

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

    if (captchaInput !== captchaText) {
      toast({ title: 'Peringatan', description: 'CAPTCHA tidak valid. Silakan coba lagi.', variant: 'destructive' });
      generateCaptcha();
      setCaptchaInput('');
      return;
    }

    setLoading(true);
    try {
      // Verify OTP via backend
      const response = await fetchWithRetry('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          otpRequestId,
          otpInput
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Gagal memverifikasi OTP');
      }

      const data = await response.json();
      setUploadToken(data.uploadToken);

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

  const handleUploadClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast({ title: 'Peringatan', description: 'Silakan pilih file CV Anda.', variant: 'destructive' });
      return;
    }
    setShowUploadConfirmModal(true);
  };

  const handleUpload = async () => {
    setShowUploadConfirmModal(false);
    setLoading(true);
    try {
      const file = files[0];
      const formData = new FormData();
      
      formData.append('uploadToken', uploadToken);
      formData.append('candidateName', candidateName);
      formData.append('candidateEmail', candidateEmail);
      formData.append('candidatePosition', position);
      formData.append('fileName', file.name);
      formData.append('mimeType', file.type);
      formData.append('uploadedAt', new Date().toISOString());
      formData.append('senderName', candidateName);
      formData.append('senderEmail', candidateEmail);
      formData.append('file', file);

      let retries = 3;
      let success = false;
      
      while (retries > 0 && !success) {
        try {
          const response = await fetch('/api/n8n/upload-cv', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Gagal mengirim lamaran: ${response.statusText}`);
          }
          
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") === -1) {
            const text = await response.text();
            if (text.includes('Please wait') || text.includes('<html')) {
               console.warn('Server is starting up. Retrying upload...');
               await new Promise(resolve => setTimeout(resolve, 2000));
               retries--;
               continue;
            }
          }
          
          success = true;
        } catch (error: any) {
          if (retries <= 1) {
            throw error;
          } else {
            console.warn('Upload failed, retrying...', error);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          retries--;
        }
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
    <div className="min-h-screen bg-transparent py-12 px-4 sm:px-6 lg:px-8">
      <style>{`
        body {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        body::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className={cn("mx-auto", view === 'listing' ? "max-w-6xl" : "max-w-xl")}>
        <div className="text-center mb-10">
          {settings?.career_logo_url && (
            <img src={settings.career_logo_url} alt="Logo" className="h-24 mx-auto mb-4 object-contain mix-blend-multiply contrast-125" referrerPolicy="no-referrer" />
          )}
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            Waruna Group Career
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Bergabunglah Bersama Waruna Group dan Menjadi Bagian Dari Tim Yang Luar Biasa.
          </p>
        </div>

        {view === 'listing' ? (
          <div className="space-y-8">
            {loadingPositions ? (
              <div className="flex justify-center p-12">
                <Loader2 className="animate-spin text-indigo-600" size={32} />
              </div>
            ) : jobs.length === 0 ? (
              <div className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 p-12 text-center shadow-xl">
                <Briefcase className="mx-auto text-slate-400 mb-4" size={48} />
                <h3 className="text-lg font-bold text-slate-800">Belum Ada Lowongan</h3>
                <p className="text-slate-600 mt-2">Saat ini belum ada posisi yang dibuka. Silakan cek kembali nanti.</p>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-6">
                {jobs.map((job) => (
                  <div 
                    key={job.id} 
                    className="w-full md:w-[calc(50%-12px)] lg:w-[calc(33.333%-16px)] bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl hover:shadow-2xl hover:border-white/80 transition-all duration-300 p-6 flex flex-col cursor-pointer group"
                    onClick={() => setSelectedJob(job)}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                      <Briefcase size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-600 transition-colors">{job.position}</h3>
                    <p className="text-sm text-slate-500 line-clamp-3 mb-6 flex-1">
                      {job.jobdesk}
                    </p>
                    <div className="flex items-center text-indigo-600 font-semibold text-sm group-hover:translate-x-1 transition-transform">
                      Lihat Detail <ChevronRight size={16} className="ml-1" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 1. Hero Banner / Life at Waruna */}
            <div className="mt-20 relative rounded-3xl overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/90 to-slate-900/80 z-10"></div>
              <img 
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80" 
                alt="Tim Waruna" 
                className="w-full h-80 object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-8">
                <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">Membangun Masa Depan Bersama</h2>
                <p className="text-lg text-indigo-100 max-w-2xl">
                  Kami mencari individu yang bersemangat, inovatif, dan siap memberikan dampak positif. 
                  Jadilah bagian dari perjalanan luar biasa kami.
                </p>
              </div>
            </div>

            {/* 2. Why Join Us */}
            <div className="mt-24">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-slate-900">Mengapa Bergabung Bersama Kami?</h2>
                <p className="mt-4 text-slate-500">Kami memberikan lingkungan terbaik agar Anda dapat berkembang secara maksimal.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {benefits.map((benefit, idx) => (
                  <div key={idx} className="bg-white/60 backdrop-blur-lg rounded-3xl p-6 border border-white/80 shadow-lg hover:-translate-y-2 transition-transform duration-300">
                    <div className="w-14 h-14 rounded-2xl bg-white flex items-center justify-center shadow-sm mb-6">
                      {benefit.icon}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{benefit.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{benefit.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Hiring Process */}
            <div className="mt-24">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-slate-900">Alur Rekrutmen</h2>
                <p className="mt-4 text-slate-500">Langkah-langkah transparan menuju karir impian Anda.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
                <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-indigo-100 -translate-y-1/2 z-0"></div>
                {processSteps.map((step, idx) => (
                  <div key={idx} className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold border-4 border-white shadow-xl mb-6">
                      {step.step}
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">{step.title}</h3>
                    <p className="text-sm text-slate-600">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 4. Employee Testimonial */}
            <div className="mt-24 bg-indigo-900 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-10 -mr-10 text-indigo-800 opacity-50">
                <Quote size={200} />
              </div>
              <div className="relative z-10 max-w-3xl mx-auto text-center">
                <div className="flex justify-center mb-6">
                  {[...Array(5)].map((_, i) => <Star key={i} className="text-amber-400 fill-amber-400 mx-1" size={24} />)}
                </div>
                <p className="text-xl md:text-2xl font-medium text-white leading-relaxed mb-8">
                  "Bekerja di sini memberikan saya ruang untuk terus berinovasi. Lingkungan yang kolaboratif dan suportif membuat setiap tantangan terasa lebih mudah diselesaikan bersama."
                </p>
                <div className="flex items-center justify-center gap-4">
                  <img 
                    src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=150&q=80" 
                    alt="Employee" 
                    className="w-14 h-14 rounded-full border-2 border-indigo-400 object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="text-left">
                    <p className="font-bold text-white">Sarah Anindya</p>
                    <p className="text-sm text-indigo-300">Senior Software Engineer</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. FAQ */}
            <div className="mt-24 mb-12 max-w-3xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-slate-900">Pertanyaan Umum (FAQ)</h2>
                <p className="mt-4 text-slate-500">Informasi yang sering ditanyakan seputar proses rekrutmen.</p>
              </div>
              <div className="space-y-4">
                {faqs.map((faq, idx) => (
                  <div 
                    key={idx} 
                    className="bg-white/60 backdrop-blur-sm border border-white/80 rounded-2xl overflow-hidden shadow-sm transition-all duration-200"
                  >
                    <button
                      onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                      className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
                    >
                      <span className="font-bold text-slate-800">{faq.q}</span>
                      {openFaq === idx ? (
                        <ChevronUp className="text-indigo-600 flex-shrink-0" size={20} />
                      ) : (
                        <ChevronDown className="text-slate-400 flex-shrink-0" size={20} />
                      )}
                    </button>
                    <div 
                      className={cn(
                        "px-6 overflow-hidden transition-all duration-300 ease-in-out",
                        openFaq === idx ? "max-h-40 pb-5 opacity-100" : "max-h-0 opacity-0"
                      )}
                    >
                      <p className="text-slate-600 text-sm leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl overflow-hidden">
            {/* Back Button */}
            <div className="bg-white/30 border-b border-white/40 p-4 px-8">
              <button 
                onClick={() => {
                  setView('listing');
                  setStep(1);
                  setOtpInput('');
                  setFiles([]);
                }}
                className="flex items-center text-sm font-medium text-slate-600 hover:text-indigo-700 transition-colors"
              >
                <ArrowLeft size={16} className="mr-2" /> Kembali ke Daftar Lowongan
              </button>
            </div>

            {/* Progress Bar */}
            <div className="bg-white/30 border-b border-white/40 p-4 flex justify-between items-center px-8">
            <div className={cn("flex flex-col items-center", step >= 1 ? "text-indigo-700" : "text-slate-500")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 1 ? "bg-indigo-100/80" : "bg-white/50")}>1</div>
              <span className="text-xs font-medium">Data Diri</span>
            </div>
            <div className={cn("h-1 flex-1 mx-4 rounded-full", step >= 2 ? "bg-indigo-600" : "bg-white/50")} />
            <div className={cn("flex flex-col items-center", step >= 2 ? "text-indigo-700" : "text-slate-500")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 2 ? "bg-indigo-100/80" : "bg-white/50")}>2</div>
              <span className="text-xs font-medium">Verifikasi</span>
            </div>
            <div className={cn("h-1 flex-1 mx-4 rounded-full", step >= 3 ? "bg-indigo-600" : "bg-white/50")} />
            <div className={cn("flex flex-col items-center", step >= 3 ? "text-indigo-700" : "text-slate-500")}>
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1", step >= 3 ? "bg-indigo-100/80" : "bg-white/50")}>3</div>
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
                      className="w-full pl-10 pr-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
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
                      className="w-full pl-10 pr-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
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
                      className="w-full pl-10 pr-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
                    />
                  </div>
                  <p className="text-xs text-slate-500">Gunakan format 628... Kode OTP akan dikirim ke nomor ini.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Posisi Dilamar</label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    {loadingPositions ? (
                      <div className="w-full pl-10 pr-4 py-3 bg-white/50 border border-white/60 rounded-xl text-sm text-slate-600">
                        Memuat posisi...
                      </div>
                    ) : availablePositions.length > 0 ? (
                      <select
                        required
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium appearance-none"
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
                        className="w-full pl-10 pr-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all text-sm font-medium"
                      />
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestOTPClick}
                  disabled={loading}
                  className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <MessageCircle size={20} />}
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
                    className="w-full text-center text-3xl tracking-[1em] py-4 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all font-mono font-bold"
                  />
                </div>

                {/* CAPTCHA Section */}
                <div className="pt-4 text-left">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Verifikasi Keamanan</label>
                  <div className="flex gap-3 items-center">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        required
                        maxLength={5}
                        value={captchaInput}
                        onChange={(e) => setCaptchaInput(e.target.value)}
                        className="block w-full px-4 py-3 bg-white/50 border border-white/40 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white/80 transition-all font-mono tracking-widest"
                        placeholder="Ketik 5 karakter"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-white/60 p-1.5 rounded-xl border border-white/40 shadow-sm">
                      <canvas 
                        ref={canvasRef} 
                        width="120" 
                        height="40" 
                        className="rounded-lg cursor-pointer"
                        onClick={generateCaptcha}
                        title="Klik untuk mengganti CAPTCHA"
                      />
                      <button
                        type="button"
                        onClick={generateCaptcha}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Ganti CAPTCHA"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                  </div>
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
              <form onSubmit={(e) => { e.preventDefault(); handleUploadClick(e); }} className="space-y-6">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-bold text-slate-900">Upload CV Anda</h2>
                  <p className="text-sm text-slate-500">Format yang didukung: PDF, DOC, DOCX (Maks. 5MB)</p>
                </div>

                <div 
                  className={cn(
                    "relative border-2 border-dashed rounded-2xl p-10 transition-all flex flex-col items-center justify-center gap-4",
                    files.length > 0 ? "border-emerald-300 bg-emerald-50/50" : "border-white/60 bg-white/40 hover:border-indigo-300 hover:bg-white/60"
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
                        <div key={index} className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm relative z-20">
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
                      <div className="text-center mt-4 pt-4 border-t border-white/40">
                        <p className="text-sm font-medium text-indigo-600">Klik untuk mengganti file</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-white/60 text-slate-500 rounded-2xl flex items-center justify-center shadow-sm border border-white/80">
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
        )}
      </div>

      {/* Job Detail Modal */}
      {selectedJob && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/20 backdrop-blur-md"
          onClick={() => setSelectedJob(null)}
        >
          <div 
            className="bg-white/60 backdrop-blur-2xl rounded-3xl border border-white/60 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-white/40 flex items-center justify-between bg-white/30">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-100/80 text-indigo-700 flex items-center justify-center">
                  <Briefcase size={24} />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">{selectedJob.position}</h2>
                  <p className="text-sm text-slate-600">Waruna Group</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedJob(null)}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-white/50 rounded-xl transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="bg-blue-50/60 border border-blue-100/60 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-blue-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <ClipboardList size={16} className="text-blue-600" /> Deskripsi Pekerjaan (Jobdesk)
                </h3>
                <div className="prose prose-sm prose-slate max-w-none">
                  <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{selectedJob.jobdesk}</p>
                </div>
              </div>
              
              <div className="bg-emerald-50/60 border border-emerald-100/60 rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <GraduationCap size={16} className="text-emerald-600" /> Kualifikasi
                </h3>
                <div className="prose prose-sm prose-slate max-w-none">
                  <p className="whitespace-pre-wrap text-slate-800 leading-relaxed">{selectedJob.kualifikasi}</p>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-white/40 bg-white/30 flex justify-end gap-3">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-6 py-2.5 text-slate-700 font-bold hover:bg-white/60 rounded-xl transition-colors"
              >
                Tutup
              </button>
              <button
                onClick={() => {
                  setPosition(selectedJob.position);
                  setSelectedJob(null);
                  setStep(1);
                  setOtpInput('');
                  setFiles([]);
                  setView('form');
                }}
                className="px-8 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
              >
                Lamar Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
      {/* OTP Confirmation Modal */}
      {showOtpConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Konfirmasi Data</h2>
              <p className="text-sm text-slate-500 mt-1">Pastikan data Anda sudah benar sebelum melanjutkan.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nama Lengkap</p>
                <p className="text-slate-900 font-medium">{candidateName}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email</p>
                <p className="text-slate-900 font-medium">{candidateEmail}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nomor WhatsApp</p>
                <p className="text-slate-900 font-medium">{phoneNumber}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Posisi Dilamar</p>
                <p className="text-slate-900 font-medium">{position}</p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowOtpConfirmModal(false)}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleRequestOTP}
                className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-200 flex items-center gap-2"
              >
                Lanjutkan Verifikasi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Confirmation Modal */}
      {showUploadConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900">Konfirmasi Upload CV</h2>
            </div>
            <div className="p-6">
              <p className="text-slate-700">Apakah Anda yakin ingin mengunggah CV ini dan mengirimkan lamaran Anda?</p>
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-sm font-medium text-slate-900 truncate">{files[0]?.name}</p>
                <p className="text-xs text-slate-500">{(files[0]?.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowUploadConfirmModal(false)}
                className="px-6 py-2.5 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleUpload}
                className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
              >
                Ya, Kirim Lamaran
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
