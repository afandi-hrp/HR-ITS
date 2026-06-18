import React, { useState, useEffect } from 'react';
import { X, Send, Mail, ChevronDown, Loader2, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Candidate, EmailTemplate, Schedule } from '../types';
import { useToast } from './ui/use-toast';
import { cn, formatDate, fetchWithRetry } from '../lib/utils';

interface SendEmailModalProps {
  candidate: Candidate;
  schedule: Schedule;
  type: 'psikotes' | 'interview';
  onClose: () => void;
}

interface Token {
  id: string;
  token: string;
  used_at: string | null;
}

export default function SendEmailModal({ candidate, schedule, type, onClose }: SendEmailModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [ccEmail, setCcEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingTemplates, setFetchingTemplates] = useState(true);
  
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>('');
  const [fullCandidate, setFullCandidate] = useState<Candidate>(candidate);
  
  const { toast } = useToast();

  useEffect(() => {
    const fetchFullCandidate = async () => {
      const { data } = await supabase
        .from('candidates')
        .select('*, interview_schedules(*), psikotes_schedules(*)')
        .eq('id', candidate.id)
        .single();
        
      if (data) {
        setFullCandidate(data as Candidate);
      }
    };
    fetchFullCandidate();

    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        toast({ title: 'Error', description: 'Gagal mengambil template email.', variant: 'destructive' });
      } else {
        setTemplates(data || []);
      }
      setFetchingTemplates(false);
    };

    const fetchTokens = async () => {
      // Fetch latest candidate state to see if token is already assigned
      const { data: cData } = await supabase.from('candidates').select('confirmation_token').eq('id', candidate.id).single();
      if (cData?.confirmation_token) {
        setFullCandidate(prev => ({ ...prev, confirmation_token: cData.confirmation_token }));
      }

      const { data, error } = await supabase
        .from('registration_tokens')
        .select('id, token, used_at')
        .eq('is_used', false)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        setTokens(data);
        if (cData?.confirmation_token) {
          const assignedDef = data.find(t => t.id === cData.confirmation_token);
          if (assignedDef) setSelectedToken(assignedDef.id);
        }
      }
    };

    fetchTemplates();
    if (type === 'psikotes') {
      fetchTokens();
    }

    // Auto-populate default body with schedule info
    const scheduleInfo = `Jadwal ${type === 'psikotes' ? 'Psikotes' : 'Interview'}:
Waktu: ${formatDate(schedule.schedule_date)}, ${new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
Lokasi: ${schedule.location_type} (${schedule.location_detail || '-'})`;
    
    setBody(`Halo ${candidate.full_name},\n\nBerikut adalah detail jadwal Anda:\n\n${scheduleInfo}\n\nTerima kasih.`);
    setSubject(`Undangan ${type === 'psikotes' ? 'Psikotes' : 'Interview'} - ${candidate.position}`);
  }, []);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;

    const template = templates.find(t => t.id === templateId);
    if (template) {
      const scheduleStr = `${formatDate(schedule.schedule_date)}, ${new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} (${schedule.location_type}: ${schedule.location_detail || '-'})`;
      
      const interviewSchedule = type === 'interview' ? schedule : fullCandidate.interview_schedules?.[0];
      const psikotesSchedule = type === 'psikotes' ? schedule : fullCandidate.psikotes_schedules?.[0];

      const interviewStr = interviewSchedule 
        ? `${formatDate(interviewSchedule.schedule_date)}, ${new Date(interviewSchedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
        : 'Belum dijadwalkan';
      
      const psikotesStr = psikotesSchedule
        ? `${formatDate(psikotesSchedule.schedule_date)}, ${new Date(psikotesSchedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
        : 'Belum dijadwalkan';

      const lokasiInterviewStr = interviewSchedule
        ? `${interviewSchedule.location_type} (${interviewSchedule.location_detail || '-'})`
        : 'Belum dijadwalkan';

      const lokasiPsikotesStr = psikotesSchedule
        ? `${psikotesSchedule.location_type} (${psikotesSchedule.location_detail || '-'})`
        : 'Belum dijadwalkan';

      const replaceVars = (text: string) => {
        let replaced = text
          .replace(/{{nama}}/g, fullCandidate.full_name)
          .replace(/{{email_kandidat}}/g, fullCandidate.email)
          .replace(/{{posisi}}/g, fullCandidate.position)
          .replace(/{{pendidikan_terakhir}}/g, fullCandidate.education || '-')
          .replace(/{{pengalaman_kerja}}/g, fullCandidate.work_experience || '-')
          .replace(/{{jadwal}}/g, scheduleStr)
          .replace(/{{jadwal_interview}}/g, interviewStr)
          .replace(/{{jadwal_psikotes}}/g, psikotesStr)
          .replace(/{{lokasi_interview}}/g, lokasiInterviewStr)
          .replace(/{{lokasi_psikotes}}/g, lokasiPsikotesStr);
          
        if (selectedToken) {
          const tokenObj = tokens.find(t => t.id === selectedToken);
          if (tokenObj) {
            replaced = replaced.replace(/{{token}}/g, tokenObj.token);
          }
        }
        return replaced;
      };
      
      let processedSubject = replaceVars(template.subject);
      let processedBody = replaceVars(template.body_html);

      setSubject(processedSubject);
      setBody(processedBody);
      // Reset selection so user can select the same template again if needed
      setTimeout(() => setSelectedTemplate(''), 100);
    }
  };

  const handleSend = async () => {
    if (!subject || !body) {
      toast({ title: 'Peringatan', description: 'Subjek dan isi email tidak boleh kosong.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      const webhookUrl = user?.user_metadata?.n8n_webhook_url;

      if (!webhookUrl) {
        toast({ 
          title: 'Konfigurasi Diperlukan', 
          description: 'Silakan atur n8n Webhook URL di menu Pengaturan terlebih dahulu.',
          variant: 'destructive' 
        });
        setLoading(false);
        return;
      }
      
      let tokenValue = null;
      if (selectedToken) {
        const tokenObj = tokens.find(t => t.id === selectedToken);
        if (tokenObj) {
          tokenValue = tokenObj.token;
          // Mark token as sent by setting used_at, but keep is_used = false so candidate can still use it
          await supabase
            .from('registration_tokens')
            .update({ used_at: new Date().toISOString() })
            .eq('id', selectedToken);
          
          await supabase
            .from('candidates')
            .update({ confirmation_token: selectedToken })
            .eq('id', candidate.id);
        }
      }

      const response = await fetchWithRetry('/api/n8n/trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          type: 'email',
          payload: {
            event: 'send_invitation',
            type,
            candidate: {
              id: candidate.id,
              full_name: candidate.full_name,
              email: candidate.email,
              position: candidate.position,
            },
            schedule: {
              date: schedule.schedule_date,
              location_type: schedule.location_type,
              location_detail: schedule.location_detail,
            },
            email: {
              subject,
              body: body.replace(/{{token}}/g, ''),
              body_html: body.replace(/\*(.*?)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>').replace(/{{token}}/g, ''),
              cc: ccEmail
            },
            token: tokenValue,
            sender: {
              name: user?.user_metadata?.full_name,
              email: user?.email
            },
            timestamp: new Date().toISOString()
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

      if (!response.ok) {
        let errorMessage = data.error || `Gagal mengirim email: ${response.statusText}`;
        if (response.status === 404) {
          errorMessage = "n8n Webhook tidak ditemukan (404). Pastikan workflow n8n Anda sudah 'Active'.";
        }
        throw new Error(errorMessage);
      }

      toast({ 
        title: 'Berhasil Dikirim', 
        description: 'Undangan Email telah dikirim, periksa notifikasi untuk cek status'
      });
      onClose();
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast({ 
        title: 'Error', 
        description: 'Undangan Email gagal dikirim, coba beberapa saat lagi.', 
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTokenChange = (tokenId: string) => {
    const oldTokenObj = tokens.find(t => t.id === selectedToken);
    const newTokenObj = tokens.find(t => t.id === tokenId);
    
    let newBody = body;
    
    if (oldTokenObj && newBody.includes(oldTokenObj.token)) {
       if (newTokenObj) {
         newBody = newBody.replace(oldTokenObj.token, newTokenObj.token);
       } else {
         if (newBody.includes(`\n\nToken Akses: ${oldTokenObj.token}`)) {
           newBody = newBody.replace(`\n\nToken Akses: ${oldTokenObj.token}`, '');
         } else {
           newBody = newBody.replace(oldTokenObj.token, '{{token}}');
         }
       }
    } else if (newTokenObj) {
       if (newBody.includes('{{token}}')) {
         newBody = newBody.replace('{{token}}', newTokenObj.token);
       } else {
         newBody = newBody + `\n\nToken Akses: ${newTokenObj.token}`;
       }
    }
    
    setSelectedToken(tokenId);
    setBody(newBody);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
              <Mail size={20} />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Kirim Undangan {type === 'psikotes' ? 'Psikotes' : 'Interview'}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all shrink-0">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nama Kandidat</label>
              <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 truncate">
                {candidate.full_name}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Email Tujuan</label>
              <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 truncate">
                {candidate.email}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">CC Email</label>
              <input
                type="text"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="email1@domain.com, email2@domain.com"
                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all truncate"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Jadwal {type === 'psikotes' ? 'Psikotes' : 'Interview'}</label>
              <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 truncate">
                {formatDate(schedule.schedule_date)}, {new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pilih Template Email</label>
              <div className="relative">
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={fetchingTemplates}
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none text-sm font-medium truncate"
                >
                  <option value="">-- Pilih Template --</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
            </div>
          </div>

          {type === 'psikotes' && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <KeyRound size={14} />
                Pilih Token Psikotes (Opsional)
              </label>
              <div className="relative">
                <select
                  value={selectedToken}
                  onChange={(e) => handleTokenChange(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all appearance-none text-sm font-medium truncate"
                >
                  <option value="">-- Tanpa Token --</option>
                  {tokens.filter(t => !t.used_at || t.id === fullCandidate.confirmation_token || t.id === selectedToken).map(t => (
                    <option key={t.id} value={t.id}>{t.token} {t.id === fullCandidate.confirmation_token ? '(Token Tersimpan)' : ''}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
              </div>
              <p className="text-xs text-slate-500">Token yang dipilih akan otomatis disisipkan ke dalam pesan email.</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subject Email</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Masukkan subjek email..."
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Isi Pesan Email</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ketik isi email di sini atau pilih template di atas..."
              rows={8}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm resize-none leading-relaxed"
            />
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
              <div className="text-[10px] text-slate-400 italic">
                <p>Variabel: {"{{nama}}"}, {"{{email_kandidat}}"}, {"{{posisi}}"}, {"{{pendidikan_terakhir}}"}, {"{{pengalaman_kerja}}"}, {"{{jadwal}}"}, {"{{jadwal_interview}}"}, {"{{jadwal_psikotes}}"}, {"{{lokasi_interview}}"}, {"{{lokasi_psikotes}}"}, {"{{token}}"}</p>
                <p className="mt-1">Format: Gunakan tanda asteris (*) untuk teks tebal. Contoh: *Teks Tebal*</p>
                <p className="mt-1 font-semibold text-indigo-500">Tips n8n: Untuk format tebal, gunakan variabel <code>body_html</code> di payload dan aktifkan "Is HTML". Untuk menghilangkan tulisan "This email was sent...", nonaktifkan opsi "Append Attribution" pada node email n8n Anda.</p>
              </div>
              <p className="text-[10px] text-amber-600 italic sm:max-w-[200px] sm:text-right">
                Jika notifikasi "Berhasil" tapi email tidak masuk, pastikan workflow n8n Anda sudah Active.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-3 shrink-0">
          <button 
            onClick={onClose}
            className="flex-1 py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
          >
            Batal
          </button>
          <button 
            onClick={handleSend}
            disabled={loading}
            className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
            {loading ? 'Mengirim...' : 'Kirim Email Sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
}
