import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Candidate, CandidateEvaluation } from '../types';
import { 
  ArrowLeft, 
  Mail, 
  Phone, 
  Briefcase, 
  GraduationCap, 
  Star, 
  AlertTriangle, 
  Lightbulb, 
  FileText, 
  Calendar as CalendarIcon,
  CheckCircle,
  Clock,
  User,
  ThumbsUp,
  ThumbsDown,
  Download,
  Users,
  Edit2,
  Save,
  X,
  Loader2,
  PlusCircle,
  Database,
  Sparkles,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn, formatDate, normalizeEmail, normalizeName, normalizePhone, fetchWithRetry, extractPhotoUrl } from '../lib/utils';
import { waitForN8nJob } from '../lib/n8n';
import { useToast } from '../components/ui/use-toast';
import EvaluationModal from '../components/EvaluationModal';
import JSONRenderer from '../components/JSONRenderer';
import {
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip
} from 'recharts';
import ApplicationForm from './ApplicationForm';

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [evaluations, setEvaluations] = useState<CandidateEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCandidate, setEditedCandidate] = useState<Partial<Candidate>>({});
  const [saving, setSaving] = useState(false);
  const [isEvaluationModalOpen, setIsEvaluationModalOpen] = useState(false);
  const [externalData, setExternalData] = useState<any[]>([]);
  const [linkedData, setLinkedData] = useState<any | null>(null);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingPsikotes, setIsAnalyzingPsikotes] = useState(false);
  const [isUploadingPsikotes, setIsUploadingPsikotes] = useState(false);
  const [isBiodataSummaryExpanded, setIsBiodataSummaryExpanded] = useState(false);
  const [isPsikotesSummaryExpanded, setIsPsikotesSummaryExpanded] = useState(false);

  const formatValue = (val: any): string => {
    if (val === null || val === undefined || val === '') return '-';
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        if (val.length === 0) return '-';
        const nonEmptyItems = val.filter(item => {
          if (typeof item === 'object' && item !== null) {
            return Object.values(item).some(v => v !== '');
          }
          return true;
        });
        if (nonEmptyItems.length === 0) return '-';
        return nonEmptyItems.map((item, idx) => {
          if (typeof item === 'object' && item !== null) {
            return `[${idx + 1}] ` + Object.entries(item)
              .filter(([_, v]) => v !== '')
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ');
          }
          return String(item);
        }).join('\n');
      }
      const entries = Object.entries(val).filter(([_, v]) => v !== '');
      if (entries.length === 0) return '-';
      return entries.map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    return String(val);
  };

  useEffect(() => {
    if (id) {
      fetchCandidate(id);
      fetchEvaluations(id);
    }
  }, [id]);

  const fetchEvaluations = async (candidateId: string) => {
    const { data, error } = await supabase
      .from('candidate_evaluations')
      .select('*, template:evaluation_templates(*)')
      .eq('candidate_id', candidateId)
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setEvaluations(data);
    }
  };

  const fetchCandidate = async (candidateId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from('candidates')
      .select('*, psikotes_schedules(id, is_confirmed, schedule_date), interview_schedules(id, is_confirmed, schedule_date)')
      .eq('id', candidateId)
      .single();

    if (error || !data) {
      // Try fetching from candidate_logs if not found in active candidates
      const { data: logData, error: logError } = await supabase
        .from('candidate_logs')
        .select('*')
        .eq('id', candidateId)
        .single();

      if (logError || !logData) {
        toast({ title: 'Error', description: 'Gagal memuat profil kandidat', variant: 'destructive' });
        navigate('/screening');
      } else {
        setCandidate(logData);
        setEditedCandidate(logData);
        fetchExternalData(logData);
      }
    } else {
      setCandidate(data);
      setEditedCandidate(data);
      fetchExternalData(data);
    }
    setLoading(false);
  };

  const fetchExternalData = async (candidateData: Candidate) => {
    setIsSearchingExternal(true);
    try {
      // If already linked, fetch that specific one
      if (candidateData.linked_external_id) {
        const { data, error } = await supabase
          .from('external_data')
          .select('*')
          .eq('uid_sheet', candidateData.linked_external_id)
          .single();
        
        if (data) {
          setLinkedData({ uid_sheet: data.uid_sheet, ...data.raw_data });
          setIsSearchingExternal(false);
          return;
        }
      }

      // Otherwise, auto-suggest
      const normEmail = normalizeEmail(candidateData.email);
      const normPhone = normalizePhone(candidateData.phone);
      const normName = normalizeName(candidateData.full_name);

      const { data, error } = await supabase
        .from('external_data')
        .select('*');

      if (data) {
        // Filter out data that is already linked to other candidates
        const uids = data.map(d => d.uid_sheet);
        
        const [activeRes, logsRes] = await Promise.all([
          supabase.from('candidates').select('linked_external_id').in('linked_external_id', uids).neq('id', candidateData.id),
          supabase.from('candidate_logs').select('linked_external_id').in('linked_external_id', uids).neq('id', candidateData.id)
        ]);

        const usedUids = new Set([
          ...(activeRes.data?.map(d => d.linked_external_id) || []),
          ...(logsRes.data?.map(d => d.linked_external_id) || [])
        ]);

        const availableData = data.filter(d => !usedUids.has(d.uid_sheet));

        const matches = availableData.filter(item => {
          const raw = item.raw_data;
          if (!raw) return false;
          
          let match = false;
          Object.entries(raw).forEach(([key, val]) => {
            if (typeof val !== 'string') return;
            const lowerKey = key.toLowerCase();
            const strVal = String(val);
            
            if (lowerKey.includes('email') && normalizeEmail(strVal) === normEmail) match = true;
            if ((lowerKey.includes('phone') || lowerKey.includes('telepon') || lowerKey.includes('hp') || lowerKey.includes('whatsapp')) && normalizePhone(strVal) === normPhone && normPhone !== '') match = true;
            if ((lowerKey.includes('name') || lowerKey.includes('nama')) && normalizeName(strVal) === normName) match = true;
          });
          return match;
        });
        
        setExternalData(matches.map(m => ({ uid_sheet: m.uid_sheet, ...m.raw_data })));
      }
    } catch (err) {
      console.error("Error fetching external data:", err);
    } finally {
      setIsSearchingExternal(false);
    }
  };

  const handleLinkExternalData = async (uid_sheet: string) => {
    if (!candidate || !id) return;
    setIsLinking(true);
    try {
      const { data: activeData } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      const table = activeData ? 'candidates' : 'candidate_logs';

      const { error } = await supabase
        .from(table)
        .update({ linked_external_id: uid_sheet })
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Berhasil', description: 'Data eksternal berhasil ditautkan.' });
      
      // Refresh
      fetchCandidate(id);
    } catch (err: any) {
      console.error('Error linking data:', err);
      toast({ title: 'Error', description: 'Gagal menautkan data.', variant: 'destructive' });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkExternalData = async () => {
    if (!candidate || !id) return;
    setIsLinking(true);
    try {
      const { data: activeData } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      const table = activeData ? 'candidates' : 'candidate_logs';

      const { error } = await supabase
        .from(table)
        .update({ linked_external_id: null })
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Berhasil', description: 'Tautan data eksternal dilepas.' });
      setLinkedData(null);
      fetchCandidate(id);
    } catch (err: any) {
      console.error('Error unlinking data:', err);
      toast({ title: 'Error', description: 'Gagal melepas tautan data.', variant: 'destructive' });
    } finally {
      setIsLinking(false);
    }
  };

  const handleAnalyzeBiodata = async () => {
    if (!candidate || !linkedData) return;
    setIsAnalyzing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      const aiWebhookUrl = user?.user_metadata?.ai_analysis_webhook_url;
      if (!aiWebhookUrl) {
        toast({ 
          title: 'Konfigurasi Diperlukan', 
          description: 'Silakan atur n8n AI Analysis Webhook URL di menu Pengaturan terlebih dahulu.',
          variant: 'destructive' 
        });
        setIsAnalyzing(false);
        return;
      }

      const response = await fetchWithRetry('/api/n8n/trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          type: 'ai_analysis',
          payload: {
            event: 'analyze_candidate_biodata',
            candidate_id: candidate.id,
            full_name: candidate.full_name,
            position: candidate.position,
            raw_data: linkedData,
            timestamp: new Date().toISOString()
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Gagal memicu analisa AI: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      toast({ 
        title: 'Analisa Dimulai', 
        description: 'AI sedang menganalisa biodata. Hasilnya akan muncul setelah proses selesai (silakan refresh halaman ini nanti).',
      });
    } catch (err: any) {
      console.error('Error triggering AI analysis:', err);
      toast({ title: 'Error', description: err.message || 'Gagal memulai analisa AI.', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzePsikotes = async () => {
    if (!candidate || !candidate.psikotes_result_url) return;
    setIsAnalyzingPsikotes(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      const aiPsikotesWebhookUrl = user?.user_metadata?.ai_psikotes_webhook_url;
      if (!aiPsikotesWebhookUrl) {
        toast({ 
          title: 'Konfigurasi Diperlukan', 
          description: 'Silakan atur n8n AI Psikotes Analysis Webhook URL di menu Pengaturan terlebih dahulu.',
          variant: 'destructive' 
        });
        setIsAnalyzingPsikotes(false);
        return;
      }

      const response = await fetchWithRetry('/api/n8n/trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          type: 'ai_psikotes_analysis',
          payload: {
            event: 'analyze_candidate_psikotes',
            candidate_id: candidate.id,
            full_name: candidate.full_name,
            position: candidate.position,
            psikotes_url: candidate.psikotes_result_url,
            timestamp: new Date().toISOString()
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`Gagal memicu analisa AI: ${response.statusText}`);
      }

      const responseData = await response.json();
      
      toast({ 
        title: 'Analisa Dimulai', 
        description: 'AI sedang menganalisa hasil psikotes. Hasilnya akan muncul setelah proses selesai (silakan refresh halaman ini nanti).',
      });
    } catch (err: any) {
      console.error('Error triggering AI analysis:', err);
      toast({ title: 'Error', description: err.message || 'Gagal memulai analisa AI.', variant: 'destructive' });
    } finally {
      setIsAnalyzingPsikotes(false);
    }
  };

  const handleUploadPsikotes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !candidate || !id) return;

    if (file.type !== 'application/pdf') {
      toast({ title: 'Error', description: 'Hanya file PDF yang diperbolehkan.', variant: 'destructive' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Error', description: 'Ukuran file maksimal 5MB.', variant: 'destructive' });
      return;
    }

    setIsUploadingPsikotes(true);
    try {
      // Delete old file if exists to prevent accumulation
      if (candidate.psikotes_result_url) {
        try {
          const urlParts = candidate.psikotes_result_url.split('/candidate-documents/');
          if (urlParts.length > 1) {
            const oldFilePath = urlParts[1];
            await supabase.storage.from('candidate-documents').remove([oldFilePath]);
          }
        } catch (delErr) {
          console.error('Failed to delete old file:', delErr);
        }
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `psikotes/${id}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('candidate-documents')
        .upload(fileName, file, { 
          upsert: true,
          contentType: 'application/pdf'
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('candidate-documents')
        .getPublicUrl(fileName);

      const { data: activeData } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      const table = activeData ? 'candidates' : 'candidate_logs';

      const { error: updateError } = await supabase
        .from(table)
        .update({ psikotes_result_url: publicUrl })
        .eq('id', id);

      if (updateError) throw updateError;

      toast({ title: 'Berhasil', description: 'Hasil psikotes berhasil diunggah.' });
      fetchCandidate(id);
    } catch (err: any) {
      console.error('Error uploading psikotes:', err);
      toast({ title: 'Error', description: err.message || 'Gagal mengunggah hasil psikotes.', variant: 'destructive' });
    } finally {
      setIsUploadingPsikotes(false);
      // Reset input
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!candidate || !id) return;
    setSaving(true);

    try {
      // Calculate new average score
      const techScore = editedCandidate.technical_score || 0;
      const commScore = editedCandidate.communication_score || 0;
      const probScore = editedCandidate.problem_solving_score || 0;
      const teamScore = editedCandidate.teamwork_score || 0;
      const leadScore = editedCandidate.leadership_score || 0;
      const adaptScore = editedCandidate.adaptability_score || 0;
      const totalScore = techScore + commScore + probScore + teamScore + leadScore + adaptScore;
      const averageScore = Math.round(totalScore / 6);

      const updateData = {
        ...editedCandidate,
        assessment_score: averageScore
      };

      // Remove joined tables before update
      delete updateData.psikotes_schedules;
      delete updateData.interview_schedules;

      // Check if candidate is in active candidates or logs
      const { data: activeData } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      const table = activeData ? 'candidates' : 'candidate_logs';

      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Berhasil',
        description: 'Profil kandidat berhasil diperbarui'
      });
      
      setIsEditing(false);
      fetchCandidate(id);
    } catch (error: any) {
      console.error('Error updating candidate:', error);
      toast({
        title: 'Error',
        description: error.message || 'Gagal memperbarui profil kandidat',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedCandidate(candidate || {});
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setEditedCandidate(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <User className="w-16 h-16 text-slate-300 mb-4" />
        <h2 className="text-2xl font-bold text-slate-700 mb-2">Kandidat Tidak Ditemukan</h2>
        <p className="text-slate-500 mb-6">Profil kandidat yang Anda cari tidak ada atau telah dihapus.</p>
        <button 
          onClick={() => navigate('/screening')}
          className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors"
        >
          Kembali ke Screening
        </button>
      </div>
    );
  }

  // Calculate average score from detailed assessment scores
  const techScore = candidate.technical_score || 0;
  const commScore = candidate.communication_score || 0;
  const probScore = candidate.problem_solving_score || 0;
  const teamScore = candidate.teamwork_score || 0;
  const leadScore = candidate.leadership_score || 0;
  const adaptScore = candidate.adaptability_score || 0;

  const totalScore = techScore + commScore + probScore + teamScore + leadScore + adaptScore;
  const averageScore = Math.round(totalScore / 6);

  const radarData = [
    { subject: 'Technical', A: techScore },
    { subject: 'Communication', A: commScore },
    { subject: 'Problem Solving', A: probScore },
    { subject: 'Teamwork', A: teamScore },
    { subject: 'Leadership', A: leadScore },
    { subject: 'Adaptability', A: adaptScore },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'hired': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'accepted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'rejected': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'invited': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'hired': return 'Hired';
      case 'accepted': return 'Lolos';
      case 'rejected': return 'Ditolak';
      case 'invited': return 'Diundang';
      default: return 'Menunggu';
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Profil Kandidat</h1>
            <p className="text-slate-500 text-sm mt-1">Detail informasi dan hasil asesmen kandidat</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <X size={16} />
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors flex items-center gap-2 text-sm font-medium"
            >
              <Edit2 size={16} />
              Edit Profil
            </button>
          )}
          <div className={cn("px-4 py-1.5 rounded-full border text-sm font-bold uppercase tracking-wider", getStatusColor(candidate.status_screening))}>
            {getStatusText(candidate.status_screening)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-24 bg-gradient-to-r from-indigo-500 to-violet-500"></div>
            <div className="px-6 pb-6 relative">
              <div className="w-20 h-20 bg-white rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-3xl font-bold text-indigo-600 absolute -top-10 bg-gradient-to-br from-indigo-50 to-white overflow-hidden">
                {extractPhotoUrl(linkedData || candidate.source_info) ? (
                  <img src={extractPhotoUrl(linkedData || candidate.source_info)!} alt={candidate.full_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  candidate.full_name.charAt(0)
                )}
              </div>
              <div className="pt-14">
                {isEditing ? (
                  <input
                    type="text"
                    name="full_name"
                    value={editedCandidate.full_name || ''}
                    onChange={handleInputChange}
                    className="w-full text-2xl font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-slate-900">{candidate.full_name}</h2>
                )}
                
                <div className="flex items-center gap-2 text-indigo-600 font-medium mt-1">
                  <Briefcase size={16} />
                  {isEditing ? (
                    <input
                      type="text"
                      name="position"
                      value={editedCandidate.position || ''}
                      onChange={handleInputChange}
                      className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <span>{candidate.position}</span>
                  )}
                </div>
                
                <div className="mt-6 space-y-3">
                  <div className="flex items-center gap-3 text-slate-600">
                    <Mail size={16} className="text-slate-400 shrink-0" />
                    {isEditing ? (
                      <input
                        type="email"
                        name="email"
                        value={editedCandidate.email || ''}
                        onChange={handleInputChange}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <a href={`mailto:${candidate.email}`} className="hover:text-indigo-600 transition-colors truncate">{candidate.email}</a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-600">
                    <Phone size={16} className="text-slate-400 shrink-0" />
                    {isEditing ? (
                      <input
                        type="text"
                        name="phone"
                        value={editedCandidate.phone || ''}
                        onChange={handleInputChange}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      candidate.phone ? (
                        <a href={`tel:${candidate.phone}`} className="hover:text-indigo-600 transition-colors">{candidate.phone}</a>
                      ) : (
                        <span className="text-slate-400 italic">Belum ada nomor telepon</span>
                      )
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-600">
                    <CalendarIcon size={16} className="text-slate-400" />
                    <span>Melamar pada {formatDate(candidate.date)}</span>
                  </div>
                  {candidate.source_info && (
                    <div className="flex items-center gap-3 text-slate-600">
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                      </div>
                      <span>Sumber: {candidate.source_info}</span>
                    </div>
                  )}
                </div>

                {candidate.resume_url && (
                  <div className="mt-6 pt-6 border-t border-slate-100">
                    <a 
                      href={candidate.resume_url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-medium transition-colors"
                    >
                      <Download size={18} />
                      Unduh CV / Resume
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Experience & Education */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Briefcase className="text-indigo-500" size={20} />
                  Pengalaman Kerja
                </h3>
                {candidate.work_experience ? (
                  <div className="prose prose-sm text-slate-600 whitespace-pre-wrap">
                    {candidate.work_experience}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-sm">Tidak ada data pengalaman kerja.</p>
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="text-indigo-500" size={20} />
                  Pendidikan
                </h3>
                {candidate.education ? (
                  <div className="prose prose-sm text-slate-600 whitespace-pre-wrap">
                    {candidate.education}
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-sm">Tidak ada data pendidikan.</p>
                )}
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-slate-100">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Lightbulb className="text-indigo-500" size={20} />
                Keahlian (Skills)
              </h3>
              {candidate.skills ? (
                <div className="flex flex-wrap gap-2">
                  {candidate.skills.split(',').map((skill, index) => (
                    <span key={index} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-sm">Tidak ada data keahlian.</p>
              )}
            </div>
          </div>

          {/* Assessment Details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <FileText className="text-indigo-500" size={20} />
              Hasil Evaluasi & Analisis
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                <h4 className="font-bold text-emerald-800 flex items-center gap-2 mb-2">
                  <ThumbsUp size={16} />
                  Kekuatan (Strengths)
                </h4>
                <p className="text-sm text-emerald-700 whitespace-pre-wrap">
                  {candidate.strengths || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
              
              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                <h4 className="font-bold text-rose-800 flex items-center gap-2 mb-2">
                  <ThumbsDown size={16} />
                  Kelemahan (Weaknesses)
                </h4>
                <p className="text-sm text-rose-700 whitespace-pre-wrap">
                  {candidate.weaknesses || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
              
              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} />
                  Faktor Risiko
                </h4>
                <p className="text-sm text-amber-700 whitespace-pre-wrap">
                  {candidate.risk_factors || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
              
              <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4">
                <h4 className="font-bold text-blue-800 flex items-center gap-2 mb-2">
                  <Star size={16} />
                  Potensi
                </h4>
                <p className="text-sm text-blue-700 whitespace-pre-wrap">
                  {candidate.potential_factors || <span className="italic opacity-70">Belum dianalisis</span>}
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                <FileText size={16} className="text-indigo-500" />
                Alasan Penilaian
              </h4>
              <p className="text-sm text-indigo-800 whitespace-pre-wrap leading-relaxed">
                {candidate.assessment_reason || <span className="italic opacity-70">Tidak ada alasan penilaian yang diberikan.</span>}
              </p>
            </div>

            {candidate.ai_biodata_summary && (
              <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Sparkles size={64} className="text-indigo-600" />
                </div>
                <button 
                  onClick={() => setIsBiodataSummaryExpanded(!isBiodataSummaryExpanded)}
                  className="w-full p-5 flex items-center justify-between text-left relative z-10 focus:outline-none"
                >
                  <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-600" />
                    Ringkasan AI (Berdasarkan Biodata)
                  </h4>
                  {isBiodataSummaryExpanded ? (
                    <ChevronUp size={20} className="text-indigo-600" />
                  ) : (
                    <ChevronDown size={20} className="text-indigo-600" />
                  )}
                </button>
                {isBiodataSummaryExpanded && (
                  <div className="px-5 pb-5 text-sm text-indigo-900/80 relative z-10 border-t border-indigo-100/50 pt-4">
                    <JSONRenderer data={candidate.ai_biodata_summary} />
                  </div>
                )}
              </div>
            )}

            {candidate.ai_psikotes_summary && (
              <div className="mt-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                  <Sparkles size={64} className="text-indigo-600" />
                </div>
                <button 
                  onClick={() => setIsPsikotesSummaryExpanded(!isPsikotesSummaryExpanded)}
                  className="w-full p-5 flex items-center justify-between text-left relative z-10 focus:outline-none"
                >
                  <h4 className="font-bold text-indigo-900 flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-600" />
                    Ringkasan AI (Berdasarkan Psikotes)
                  </h4>
                  {isPsikotesSummaryExpanded ? (
                    <ChevronUp size={20} className="text-indigo-600" />
                  ) : (
                    <ChevronDown size={20} className="text-indigo-600" />
                  )}
                </button>
                {isPsikotesSummaryExpanded && (
                  <div className="px-5 pb-5 text-sm text-indigo-900/80 relative z-10 border-t border-indigo-100/50 pt-4">
                    <JSONRenderer data={candidate.ai_psikotes_summary} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Psikotes Eksternal */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Hasil Psikotes Eksternal
              </h3>
              <div>
                <label className="cursor-pointer px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium">
                  {isUploadingPsikotes ? <Loader2 className="animate-spin" size={16} /> : <PlusCircle size={16} />}
                  {isUploadingPsikotes ? 'Mengunggah...' : 'Upload PDF'}
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="application/pdf"
                    onChange={handleUploadPsikotes}
                    disabled={isUploadingPsikotes}
                  />
                </label>
              </div>
            </div>

            {candidate.psikotes_result_url ? (
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  <button
                    onClick={handleAnalyzePsikotes}
                    disabled={isAnalyzingPsikotes}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {isAnalyzingPsikotes ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {isAnalyzingPsikotes ? 'AI sedang menganalisa...' : 'Analisa Psikotes dengan AI'}
                  </button>
                  <a
                    href={candidate.psikotes_result_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <ExternalLink size={16} />
                    Buka di Tab Baru
                  </a>
                </div>

                <div className="w-full h-[600px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <iframe 
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(candidate.psikotes_result_url)}&embedded=true`} 
                    className="w-full h-full"
                    title="Hasil Psikotes"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Belum ada hasil psikotes</p>
                <p className="text-sm text-slate-400 mt-1">Klik tombol "Upload PDF" untuk menambahkan dokumen hasil psikotes eksternal.</p>
              </div>
            )}
          </div>

          {/* External Data Integration */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Database className="text-indigo-500" size={20} />
              Data Eksternal
            </h3>
            
            {isSearchingExternal ? (
              <div className="flex items-center justify-center py-6 text-slate-500">
                <Loader2 size={24} className="animate-spin text-indigo-600" />
              </div>
            ) : linkedData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                    <CheckCircle size={16} />
                    Data berhasil ditautkan
                  </div>
                  <button 
                    onClick={handleUnlinkExternalData}
                    disabled={isLinking}
                    className="text-xs font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50"
                  >
                    {isLinking ? 'Memproses...' : 'Lepas Tautan'}
                  </button>
                </div>
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden max-h-[600px] overflow-y-auto custom-scrollbar">
                  <ApplicationForm readOnly initialData={linkedData} />
                </div>
                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleAnalyzeBiodata}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-sm"
                  >
                    {isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {isAnalyzing ? 'AI sedang menganalisa...' : 'Analisa Biodata dengan AI'}
                  </button>
                </div>
              </div>
            ) : externalData.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={16} />
                  <div className="text-sm text-amber-800">
                    <span className="font-bold">Ditemukan {externalData.length} data yang mungkin cocok.</span>
                    <p className="mt-1 opacity-80">Pilih salah satu data di bawah ini untuk ditautkan ke profil ini.</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {externalData.map((data, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">Opsi {idx + 1}</span>
                        <button
                          onClick={() => handleLinkExternalData(data.uid_sheet)}
                          disabled={isLinking}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          Tautkan Data Ini
                        </button>
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {Object.entries(data).filter(([k]) => k !== 'uid_sheet').slice(0, 5).map(([key, val]) => (
                          <div key={key} className="text-sm">
                            <span className="font-medium text-slate-500 block text-xs uppercase tracking-wider mb-0.5">{key}</span>
                            <span className="text-slate-800 whitespace-pre-wrap">{formatValue(val)}</span>
                          </div>
                        ))}
                        {Object.keys(data).length > 6 && (
                          <div className="text-xs text-indigo-600 font-medium italic mt-2">
                            + {Object.keys(data).length - 6} field lainnya
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                <Database className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500 font-medium">Tidak ada data eksternal yang cocok</p>
                <p className="text-xs text-slate-400 mt-1">Sistem tidak menemukan data dengan email, nomor telepon, atau nama yang sama.</p>
              </div>
            )}
          </div>

          {/* Interview Evaluations */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Hasil Interview
              </h3>
              {['accepted', 'hired'].includes(candidate.status_screening) && (
                <button
                  onClick={() => setIsEvaluationModalOpen(true)}
                  className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <PlusCircle size={16} />
                  Input Hasil
                </button>
              )}
            </div>

            {evaluations.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">Belum ada hasil interview</p>
                {['accepted', 'hired'].includes(candidate.status_screening) ? (
                  <p className="text-sm text-slate-400 mt-1">Klik tombol "Input Hasil" untuk menambahkan penilaian.</p>
                ) : (
                  <p className="text-sm text-slate-400 mt-1">Kandidat harus diterima (Lolos Screening) terlebih dahulu untuk mengisi evaluasi.</p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {evaluations.map((evalItem) => (
                  <div key={evalItem.id} className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "px-2.5 py-1 rounded-md text-xs font-bold tracking-wider",
                          evalItem.evaluation_type === 'HR' ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
                        )}>
                          {evalItem.evaluation_type}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{evalItem.template?.name}</p>
                          <p className="text-xs text-slate-500">Oleh: {evalItem.interviewer_name} • {formatDate(evalItem.created_at)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Total Skor</p>
                        <p className="text-lg font-black text-indigo-600">{evalItem.total_score}</p>
                      </div>
                    </div>
                    <div className="p-4 bg-white">
                      {/* Display Summary Fields if they exist */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(evalItem.evaluation_data)
                          .filter(([key]) => key.startsWith('summary_'))
                          .map(([key, value]) => {
                            const fieldName = key.replace('summary_', '');
                            return (
                              <div key={key} className="space-y-1">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{fieldName}</p>
                                {Array.isArray(value) ? (
                                  <ul className="list-disc list-inside text-sm text-slate-700">
                                    {value.map((v, i) => <li key={i}>{v}</li>)}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(value) || '-'}</p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Schedules */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <CalendarIcon className="text-indigo-500" size={20} />
              Jadwal & Status
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <FileText size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 text-sm">Psikotes</h4>
                  {candidate.psikotes_schedules && candidate.psikotes_schedules.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {candidate.psikotes_schedules.map((schedule, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Clock size={14} />
                            <span>{formatDate(schedule.schedule_date)}</span>
                          </div>
                          {schedule.is_confirmed ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-md">
                              <CheckCircle size={12} /> Selesai
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium text-xs bg-amber-50 px-2 py-1 rounded-md">
                              Menunggu
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : candidate.psikotes_status ? (
                    <p className="text-sm text-slate-500 mt-1">Status: <span className="font-medium text-slate-700">{candidate.psikotes_status}</span></p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">Belum ada jadwal psikotes.</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                  <Users size={18} />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-slate-900 text-sm">Interview</h4>
                  {candidate.interview_schedules && candidate.interview_schedules.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {candidate.interview_schedules.map((schedule, idx) => (
                        <div key={idx} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 text-slate-600">
                            <Clock size={14} />
                            <span>{formatDate(schedule.schedule_date)}</span>
                          </div>
                          {schedule.is_confirmed ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded-md">
                              <CheckCircle size={12} /> Selesai
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium text-xs bg-amber-50 px-2 py-1 rounded-md">
                              Menunggu
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : candidate.interview_status ? (
                    <p className="text-sm text-slate-500 mt-1">Status: <span className="font-medium text-slate-700">{candidate.interview_status}</span></p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">Belum ada jadwal interview.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <EvaluationModal
        isOpen={isEvaluationModalOpen}
        onClose={() => setIsEvaluationModalOpen(false)}
        candidateId={id!}
        onSuccess={() => fetchEvaluations(id!)}
      />
    </div>
  );
}
