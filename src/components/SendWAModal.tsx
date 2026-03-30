import React, { useState, useEffect } from 'react';
import { X, Send, MessageCircle, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Candidate, EmailTemplate, Schedule } from '../types';
import { useToast } from './ui/use-toast';
import { cn, formatDate, fetchWithRetry } from '../lib/utils';

interface SendWAModalProps {
  candidate: Candidate;
  schedule: Schedule;
  type: 'psikotes' | 'interview';
  onClose: () => void;
}

export default function SendWAModal({ candidate, schedule, type, onClose }: SendWAModalProps) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingTemplates, setFetchingTemplates] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchTemplates = async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        toast({ title: 'Error', description: 'Gagal mengambil template.', variant: 'destructive' });
      } else {
        setTemplates(data || []);
      }
      setFetchingTemplates(false);
    };

    fetchTemplates();

    // Auto-populate default body with schedule info
    const scheduleInfo = `Jadwal ${type === 'psikotes' ? 'Psikotes' : 'Interview'}:
Waktu: ${formatDate(schedule.schedule_date)}, ${new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
Lokasi: ${schedule.location_type} (${schedule.location_detail || '-'})`;
    
    setBody(`Halo ${candidate.full_name},\n\nBerikut adalah detail jadwal Anda:\n\n${scheduleInfo}\n\nTerima kasih.`);
  }, []);

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId) return;

    const template = templates.find(t => t.id === templateId);
    if (template) {
      const scheduleStr = `${formatDate(schedule.schedule_date)}, ${new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} (${schedule.location_type}: ${schedule.location_detail || '-'})`;
      
      const interviewSchedule = candidate.interview_schedules?.[0];
      const psikotesSchedule = candidate.psikotes_schedules?.[0];

      const interviewStr = interviewSchedule 
        ? `${formatDate(interviewSchedule.schedule_date)}, ${new Date(interviewSchedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
        : 'Belum dijadwalkan';
      
      const psikotesStr = psikotesSchedule
        ? `${formatDate(psikotesSchedule.schedule_date)}, ${new Date(psikotesSchedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
        : 'Belum dijadwalkan';

      const replaceVars = (text: string) => {
        return text
          .replace(/{{nama}}/g, candidate.full_name)
          .replace(/{{email_kandidat}}/g, candidate.email)
          .replace(/{{posisi}}/g, candidate.position)
          .replace(/{{pendidikan_terakhir}}/g, candidate.education || '-')
          .replace(/{{pengalaman_kerja}}/g, candidate.work_experience || '-')
          .replace(/{{jadwal}}/g, scheduleStr)
          .replace(/{{jadwal_interview}}/g, interviewStr)
          .replace(/{{jadwal_psikotes}}/g, psikotesStr);
      };
      
      // For WA, we usually just use the body template and ignore HTML tags or convert them to WA formatting
      // Here we just use body_html and strip basic tags if needed, or assume templates are plain text
      let processedBody = replaceVars(template.body_html).replace(/<[^>]*>?/gm, '');

      setBody(prev => prev ? `${prev}\n\n${processedBody}` : processedBody);
      // Reset selection so user can select the same template again if needed
      setTimeout(() => setSelectedTemplate(''), 100);
    }
  };

  const handleSend = async () => {
    if (!body) {
      toast({ title: 'Peringatan', description: 'Isi pesan tidak boleh kosong.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      const webhookUrl = user?.user_metadata?.wa_webhook_url;

      if (!webhookUrl) {
        toast({ 
          title: 'Konfigurasi Diperlukan', 
          description: 'Silakan atur n8n WhatsApp Webhook URL di menu Pengaturan terlebih dahulu.',
          variant: 'destructive' 
        });
        setLoading(false);
        return;
      }

      const response = await fetchWithRetry('/api/n8n/trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          type: 'wa',
          payload: {
            event: 'send_wa_invitation',
            type,
            candidate: {
              id: candidate.id,
              full_name: candidate.full_name,
              email: candidate.email,
              phone: candidate.phone,
              position: candidate.position,
            },
            schedule: {
              date: schedule.schedule_date,
              location_type: schedule.location_type,
              location_detail: schedule.location_detail,
            },
            whatsapp: {
              body
            },
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
        let errorMessage = data.error || `Gagal mengirim pesan WA: ${response.statusText}`;
        if (response.status === 404) {
          errorMessage = "n8n Webhook tidak ditemukan (404). Pastikan workflow n8n Anda sudah 'Active'.";
        }
        throw new Error(errorMessage);
      }

      toast({ 
        title: 'Berhasil Dikirim', 
        description: 'Undangan Whatsapp telah dikirim, periksa notifikasi untuk cek status',
        duration: 10000
      });
      onClose();
    } catch (error: any) {
      console.error('Error sending WA:', error);
      toast({ 
        title: 'Error', 
        description: 'Undangan Whatsapp gagal dikirim, coba beberapa saat lagi.', 
        variant: 'destructive',
        duration: 10000
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
              <MessageCircle size={20} />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Kirim Undangan WA {type === 'psikotes' ? 'Psikotes' : 'Interview'}</h2>
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
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Nomor Telepon</label>
              <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 truncate">
                {candidate.phone || '-'}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Jadwal {type === 'psikotes' ? 'Psikotes' : 'Interview'}</label>
              <div className="px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 truncate">
                {formatDate(schedule.schedule_date)}, {new Date(schedule.schedule_date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pilih Template Pesan</label>
              <div className="relative">
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  disabled={fetchingTemplates}
                  className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none text-sm font-medium truncate"
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

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Isi Pesan WhatsApp</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Ketik isi pesan WA di sini atau pilih template di atas..."
              rows={8}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm resize-none leading-relaxed"
            />
            <div className="flex flex-col sm:flex-row justify-between items-start gap-2">
              <p className="text-[10px] text-slate-400 italic">
                Variabel: {"{{nama}}"}, {"{{email_kandidat}}"}, {"{{posisi}}"}, {"{{pendidikan_terakhir}}"}, {"{{pengalaman_kerja}}"}, {"{{jadwal}}"}, {"{{jadwal_interview}}"}, {"{{jadwal_psikotes}}"}
              </p>
              <p className="text-[10px] text-amber-600 italic sm:max-w-[200px] sm:text-right">
                Jika notifikasi "Berhasil" tapi WA tidak masuk, pastikan workflow n8n Anda sudah Active.
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
            className="flex-[2] py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-200 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <Send size={20} />
            )}
            {loading ? 'Mengirim...' : 'Kirim WA Sekarang'}
          </button>
        </div>
      </div>
    </div>
  );
}
