import React, { useState, useEffect, useRef } from 'react';
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
  ChevronUp,
  Trash2
} from 'lucide-react';
import { cn, formatDate, normalizeEmail, normalizeName, normalizePhone, fetchWithRetry, extractPhotoUrl, getEmbedUrl } from '../lib/utils';
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
import { printElement, generatePdfBlob } from '../lib/print';
import JSZip from 'jszip';

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
  const [isGeneratingInterview, setIsGeneratingInterview] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);
  const [isUploadingPsikotes, setIsUploadingPsikotes] = useState(false);
  const [isBiodataSummaryExpanded, setIsBiodataSummaryExpanded] = useState(false);
  const [isPsikotesSummaryExpanded, setIsPsikotesSummaryExpanded] = useState(false);
  const [isInterviewQuestionsExpanded, setIsInterviewQuestionsExpanded] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [managers, setManagers] = useState<any[]>([]);
  const [selectedManager, setSelectedManager] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [fullScreenPdf, setFullScreenPdf] = useState<string | null>(null);
  const [fullScreenData, setFullScreenData] = useState<any | null>(null);
  const [existingEvaluation, setExistingEvaluation] = useState<CandidateEvaluation | null>(null);
  
  // Internal Notes State
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [expandedEvaluations, setExpandedEvaluations] = useState<string[]>([]);

  const toggleEvaluation = (id: string) => {
    setExpandedEvaluations(prev => 
      prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]
    );
  };

  const [isPrinting, setIsPrinting] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  
  const handlePrint = async () => {
    setIsPrinting(true);
    try {
      await printElement(printRef.current, `Form_Lamaran_${linkedData?.full_name?.replace(/\s+/g, '_') || 'Kandidat'}`);
      toast({
        title: "Berhasil",
        description: "Dokumen berhasil disiapkan untuk dicetak.",
      });
    } catch (error: any) {
      if (error.message === 'POPUP_BLOCKED') {
        toast({
          title: "Popup Diblokir",
          description: "Browser Anda memblokir popup. Silakan izinkan popup (pop-up blocker) untuk situs ini agar dapat mencetak PDF.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Gagal",
          description: "Terjadi kesalahan saat menyiapkan dokumen.",
          variant: "destructive"
        });
      }
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSecureDownload = async (url: string, prefix: string, candidateName: string) => {
    try {
      toast({
        title: "Mengunduh...",
        description: "Sedang menyiapkan file untuk diunduh.",
      });

      const cleanName = candidateName.replace(/[^a-zA-Z0-9]/g, '_');

      // 1. Handle Google Docs links (Auto-convert to PDF)
      const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^/]+)/);
      if (docsMatch) {
        const exportUrl = `https://docs.google.com/document/d/${docsMatch[1]}/export?format=pdf`;
        const a = document.createElement('a');
        a.href = exportUrl;
        a.download = `${prefix}_${cleanName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 2. Handle Google Drive links (Direct download)
      const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
      if (driveMatch) {
        const exportUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
        const a = document.createElement('a');
        a.href = exportUrl;
        a.download = `${prefix}_${cleanName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 3. Handle standard files (Supabase, etc.) via secure blob to hide URL
      let ext = 'pdf';
      try {
        const urlWithoutQuery = url.split('?')[0];
        const parts = urlWithoutQuery.split('.');
        if (parts.length > 1) {
          ext = parts[parts.length - 1].toLowerCase();
        }
      } catch (e) {
        console.error('Gagal mengekstrak ekstensi:', e);
      }

      const filename = `${prefix}_${cleanName}.${ext}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: "Gagal Mengunduh",
        description: "Terjadi kesalahan saat mengunduh file. Pastikan dokumen masih tersedia.",
        variant: "destructive"
      });
    }
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      toast({
        title: "Menyiapkan ZIP...",
        description: "Sedang mengumpulkan dan mengompres dokumen. Mohon tunggu.",
      });

      const zip = new JSZip();
      const cleanName = candidate?.full_name?.replace(/[^a-zA-Z0-9]/g, '_') || 'Kandidat';

      // 1. Generate PDF Biodata
      if (printRef.current) {
        const biodataBlob = await generatePdfBlob(printRef.current, `Biodata_${cleanName}`);
        if (biodataBlob) {
          zip.file(`Biodata_${cleanName}.pdf`, biodataBlob);
        }
      }

      // Helper function to fetch file blob
      const fetchFileBlob = async (url: string): Promise<{ blob: Blob, ext: string } | null> => {
        try {
          // Handle Google Docs
          const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^/]+)/);
          if (docsMatch) {
            const exportUrl = `https://docs.google.com/document/d/${docsMatch[1]}/export?format=pdf`;
            const res = await fetch(exportUrl);
            if (res.ok) return { blob: await res.blob(), ext: 'pdf' };
          }
          // Handle Google Drive
          const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
          if (driveMatch) {
            const exportUrl = `https://drive.google.com/uc?export=download&id=${driveMatch[1]}`;
            const res = await fetch(exportUrl);
            if (res.ok) return { blob: await res.blob(), ext: 'pdf' };
          }
          
          // Handle standard files
          let ext = 'pdf';
          const urlWithoutQuery = url.split('?')[0];
          const parts = urlWithoutQuery.split('.');
          if (parts.length > 1) ext = parts[parts.length - 1].toLowerCase();
          
          const res = await fetch(url);
          if (res.ok) return { blob: await res.blob(), ext };
        } catch (e) {
          console.error('Failed to fetch file for zip:', url, e);
        }
        return null;
      };

      // 2. Fetch CV
      if (candidate?.resume_url) {
        const cvData = await fetchFileBlob(candidate.resume_url);
        if (cvData) {
          zip.file(`CV_${cleanName}.${cvData.ext}`, cvData.blob);
        }
      }

      // 3. Fetch Psikotes
      if (candidate?.psikotes_result_url) {
        const psikotesData = await fetchFileBlob(candidate.psikotes_result_url);
        if (psikotesData) {
          zip.file(`Psikotes_${cleanName}.${psikotesData.ext}`, psikotesData.blob);
        }
      }

      // Generate ZIP and download
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const objectUrl = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `Berkas_${cleanName}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(a);

      toast({
        title: "Berhasil",
        description: "File ZIP berhasil diunduh.",
      });
    } catch (error) {
      console.error('ZIP generation failed:', error);
      toast({
        title: "Gagal Mengunduh",
        description: "Terjadi kesalahan saat membuat file ZIP.",
        variant: "destructive"
      });
    } finally {
      setIsZipping(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
          if (data) setProfile(data);
        });
      }
    });
  }, []);

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
    if (id && profile) {
      fetchCandidate(id);
      fetchEvaluations(id);
      fetchNotes(id);
    }
  }, [id, profile]);

  const fetchNotes = async (candidateId: string) => {
    setLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from('internal_notes')
        .select('*, author:profiles(*)')
        .eq('candidate_id', candidateId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (data) {
        const filteredNotes = data.filter(note => note.author?.role === profile?.role);
        setNotes(filteredNotes);
      }
    } catch (err) {
      console.error('Error fetching notes:', err);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!id || !profile || !newNote.trim()) return;
    setIsAddingNote(true);
    try {
      const { error } = await supabase
        .from('internal_notes')
        .insert({
          candidate_id: id,
          author_id: profile.id,
          note_text: newNote.trim()
        });
      
      if (error) throw error;
      
      toast({ title: 'Berhasil', description: 'Catatan internal ditambahkan.' });
      setNewNote('');
      fetchNotes(id);
    } catch (err: any) {
      console.error('Error adding note:', err);
      toast({ title: 'Error', description: 'Gagal menambahkan catatan.', variant: 'destructive' });
    } finally {
      setIsAddingNote(false);
    }
  };

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
      .select('*, psikotes_schedules(id, is_confirmed, schedule_date), interview_schedules(id, is_confirmed, schedule_date), assignee:profiles(id, full_name, role, department)')
      .eq('id', candidateId)
      .single();

    let candidateData = data;

    if (error || !data) {
      // Try fetching from candidate_logs if not found in active candidates
      const { data: logData, error: logError } = await supabase
        .from('candidate_logs')
        .select('*, assignee:profiles(id, full_name, role, department)')
        .eq('id', candidateId)
        .single();

      if (logError || !logData) {
        toast({ title: 'Error', description: 'Gagal memuat profil kandidat', variant: 'destructive' });
        navigate('/screening');
        setLoading(false);
        return;
      }
      candidateData = logData;
    }

    // Access Control Check
    if (profile?.role === 'USER_MANAGER' && candidateData.assigned_to !== profile.id) {
      toast({ title: 'Akses Ditolak', description: 'Anda tidak memiliki akses ke kandidat ini.', variant: 'destructive' });
      navigate('/screening');
      setLoading(false);
      return;
    }

    setCandidate(candidateData);
    setEditedCandidate(candidateData);
    fetchExternalData(candidateData);
    setLoading(false);
  };

  const fetchManagers = async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, department')
      .in('role', ['USER_MANAGER', 'HR_ADMIN'])
      .order('full_name');
    
    if (data) {
      setManagers(data);
    }
  };

  const handleAssign = async () => {
    if (!id || !selectedManager) return;
    
    try {
      setAssigning(true);
      
      const { data: activeData } = await supabase
        .from('candidates')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      const table = activeData ? 'candidates' : 'candidate_logs';

      const { error } = await supabase
        .from(table)
        .update({ assigned_to: selectedManager })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Kandidat berhasil di-assign ke user.",
      });
      
      setIsAssignModalOpen(false);
      fetchCandidate(id);
    } catch (error: any) {
      console.error('Error assigning candidate:', error);
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setAssigning(false);
    }
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

  const handleGenerateInterviewQuestions = async () => {
    if (!candidate) return;
    setIsGeneratingInterview(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();
      
      const aiInterviewWebhookUrl = user?.user_metadata?.ai_interview_webhook_url;
      if (!aiInterviewWebhookUrl) {
        toast({ 
          title: 'Konfigurasi Diperlukan', 
          description: 'Silakan atur n8n AI Interview Question Generator Webhook URL di menu Pengaturan terlebih dahulu.',
          variant: 'destructive' 
        });
        setIsGeneratingInterview(false);
        return;
      }

      const response = await fetchWithRetry('/api/n8n/trigger', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          type: 'ai_interview',
          payload: {
            candidate_id: candidate.id,
            action: 'generate_interview_questions',
            ai_biodata_summary: candidate.ai_biodata_summary
          }
        }),
      });

      if (!response.ok) {
        let errorMsg = response.statusText || `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
          else if (errData.message) errorMsg = errData.message;
          else if (typeof errData === 'string') errorMsg = errData;
          else errorMsg = JSON.stringify(errData);
        } catch (e) {
          // ignore
        }
        throw new Error(`Gagal generate pertanyaan: ${errorMsg}`);
      }

      const responseData = await response.json();
      
      toast({ 
        title: 'Proses Dimulai', 
        description: 'Data berhasil dikirim untuk diproses, silahkan refresh halaman ini kembali.',
      });
    } catch (err: any) {
      console.error('Error generating interview questions:', err);
      toast({ title: 'Error', description: err.message || 'Gagal generate pertanyaan interview.', variant: 'destructive' });
    } finally {
      setIsGeneratingInterview(false);
    }
  };

  const handleSaveInterviewQuestions = async () => {
    if (!candidate) return;
    try {
      const { error } = await supabase
        .from('candidates')
        .update({ ai_interview_questions: generatedQuestions })
        .eq('id', candidate.id);

      if (error) throw error;

      setCandidate({ ...candidate, ai_interview_questions: generatedQuestions });
      setShowInterviewModal(false);
      toast({ title: 'Berhasil', description: 'Pertanyaan interview berhasil disimpan.' });
    } catch (err: any) {
      console.error('Error saving interview questions:', err);
      toast({ title: 'Error', description: err.message || 'Gagal menyimpan pertanyaan.', variant: 'destructive' });
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
      const updateData = {
        full_name: editedCandidate.full_name,
        email: editedCandidate.email,
        phone: editedCandidate.phone,
      };

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
            <>
              {profile?.role !== 'USER_MANAGER' && (
                <>
                  <button
                    onClick={() => {
                      fetchManagers();
                      setIsAssignModalOpen(true);
                    }}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <Users size={16} />
                    Assign User
                  </button>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-white border border-slate-200 text-indigo-600 rounded-xl hover:bg-indigo-50 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <Edit2 size={16} />
                    Edit Profil
                  </button>
                </>
              )}
            </>
          )}
          <div className={cn("px-4 py-1.5 rounded-full border text-sm font-bold uppercase tracking-wider", getStatusColor(candidate.status_screening))}>
            {getStatusText(candidate.status_screening)}
          </div>
          <button
            onClick={handleDownloadZip}
            disabled={isZipping}
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-colors flex items-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50"
          >
            {isZipping ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {isZipping ? 'Memproses...' : 'Download Semua (ZIP)'}
          </button>
        </div>
      </div>

      {candidate.assignee && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Users size={20} />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-900">Kandidat ini sedang di-review oleh:</p>
            <p className="text-sm text-blue-700">{candidate.assignee.full_name} ({candidate.assignee.department || 'User Manager'})</p>
          </div>
        </div>
      )}

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
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                        <FileText size={16} className="text-indigo-500" />
                        Preview CV / Resume
                      </h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setFullScreenPdf(candidate.resume_url!)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors text-xs font-medium"
                        >
                          <ExternalLink size={14} />
                          Full Screen
                        </button>
                        <button 
                          onClick={() => handleSecureDownload(candidate.resume_url!, 'CV', candidate.full_name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors text-xs font-medium"
                        >
                          <Download size={14} />
                          Unduh
                        </button>
                      </div>
                    </div>
                    <div className="w-full h-[400px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                      <iframe 
                        src={getEmbedUrl(candidate.resume_url)} 
                        className="w-full h-full"
                        title="Preview CV"
                      />
                    </div>
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

          {/* AI Interview Questions Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="text-indigo-500" size={20} />
                Pertanyaan Interview (AI)
              </h3>
              {profile?.role !== 'USER_MANAGER' && (
                <button
                  onClick={handleGenerateInterviewQuestions}
                  disabled={isGeneratingInterview}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-sm"
                >
                  {isGeneratingInterview ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                  {isGeneratingInterview ? 'AI sedang menyusun...' : 'Generate Pertanyaan (AI)'}
                </button>
              )}
            </div>

            {(() => {
              let questions: any[] = [];
              if (candidate.ai_interview_questions) {
                try {
                  const parsed = typeof candidate.ai_interview_questions === 'string' 
                    ? JSON.parse(candidate.ai_interview_questions) 
                    : candidate.ai_interview_questions;
                  
                  if (Array.isArray(parsed)) {
                    questions = parsed;
                  } else if (parsed && Array.isArray(parsed.interview_questions)) {
                    questions = parsed.interview_questions;
                  }
                } catch (e) {
                  console.error("Failed to parse ai_interview_questions", e);
                }
              }

              if (questions.length > 0) {
                return (
                  <div className="space-y-4">
                    {questions.map((q: any, index: number) => (
                      <div key={index} className="p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-md">
                            {q.category || 'General'}
                          </span>
                        </div>
                        <p className="text-slate-800 font-medium mb-2">{q.question}</p>
                        {q.reasoning && (
                          <div className="flex gap-2 text-sm text-slate-500 bg-white p-3 rounded-lg border border-slate-100">
                            <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                            <p className="italic">{q.reasoning}</p>
                          </div>
                        )}
                      </div>
                    ))}
                    {profile?.role !== 'USER_MANAGER' && (
                      <div className="flex justify-end mt-4">
                        <button
                          onClick={() => {
                            setGeneratedQuestions(questions);
                            setShowInterviewModal(true);
                          }}
                          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          Edit Daftar Pertanyaan
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                  <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">Belum ada pertanyaan interview</p>
                  <p className="text-sm text-slate-400 mt-1">Klik tombol "Generate Pertanyaan (AI)" untuk membuat daftar pertanyaan yang terpersonalisasi.</p>
                </div>
              );
            })()}
          </div>

          {/* Psikotes Eksternal */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Hasil Psikotes Eksternal
              </h3>
              {profile?.role !== 'USER_MANAGER' && (
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
              )}
            </div>

            {candidate.psikotes_result_url ? (
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  {profile?.role !== 'USER_MANAGER' && (
                    <button
                      onClick={handleAnalyzePsikotes}
                      disabled={isAnalyzingPsikotes}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {isAnalyzingPsikotes ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                      {isAnalyzingPsikotes ? 'AI sedang menganalisa...' : 'Analisa Psikotes dengan AI'}
                    </button>
                  )}
                  <button
                    onClick={() => setFullScreenPdf(candidate.psikotes_result_url!)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <ExternalLink size={16} />
                    Full Screen
                  </button>
                  <button
                    onClick={() => handleSecureDownload(candidate.psikotes_result_url!, 'Psikotes', candidate.full_name)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <Download size={16} />
                    Unduh
                  </button>
                </div>

                <div className="w-full h-[600px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <iframe 
                    src={getEmbedUrl(candidate.psikotes_result_url)} 
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
                <div className="flex justify-end gap-2">
                  {profile?.role !== 'USER_MANAGER' && (
                    <button
                      onClick={handleAnalyzeBiodata}
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {isAnalyzing ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                      {isAnalyzing ? 'AI sedang menganalisa...' : 'Analisa Biodata dengan AI'}
                    </button>
                  )}
                  <button
                    onClick={() => setFullScreenData(linkedData)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <ExternalLink size={16} />
                    Full Screen
                  </button>
                  <button
                    onClick={() => handlePrint()}
                    disabled={isPrinting}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition-colors text-sm font-medium shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isPrinting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Mengunduh...
                      </>
                    ) : (
                      <>
                        <Download size={16} />
                        Unduh PDF
                      </>
                    )}
                  </button>
                  {profile?.role !== 'USER_MANAGER' && (
                    <button 
                      onClick={handleUnlinkExternalData}
                      disabled={isLinking}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                    >
                      {isLinking ? <Loader2 className="animate-spin" size={16} /> : <X size={16} />}
                      {isLinking ? 'Memproses...' : 'Lepas Tautan'}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                    <CheckCircle size={16} />
                    Data berhasil ditautkan
                  </div>
                </div>
                <div className="max-h-[600px] overflow-y-auto custom-scrollbar -mx-2 px-2">
                  <div ref={printRef} className="print:p-8 print:bg-white print:w-[210mm] print:mx-auto">
                    <ApplicationForm readOnly initialData={linkedData} hideSalary={profile?.role === 'USER_MANAGER'} />
                  </div>
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
                        {profile?.role !== 'USER_MANAGER' && (
                          <button
                            onClick={() => handleLinkExternalData(data.uid_sheet)}
                            disabled={isLinking}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Tautkan Data Ini
                          </button>
                        )}
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

          {/* Internal Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Catatan Internal
              </h3>
            </div>
            
            <div className="space-y-4">
              {/* Note input area */}
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                  <User size={20} className="text-indigo-600" />
                </div>
                <div className="flex-1">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Tambahkan catatan internal untuk kandidat ini..."
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[100px] text-sm"
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || isAddingNote}
                      className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                      {isAddingNote ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      Simpan Catatan
                    </button>
                  </div>
                </div>
              </div>

              {/* Notes list */}
              <div className="space-y-4 mt-6">
                {loadingNotes ? (
                  <div className="flex justify-center py-4">
                    <Loader2 size={24} className="animate-spin text-indigo-600" />
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                    <p className="text-slate-500 font-medium">Belum ada catatan internal</p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <div key={note.id} className="flex gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {note.author?.avatar_url ? (
                          <img src={note.author.avatar_url} alt={note.author.full_name || 'User'} className="w-full h-full object-cover" />
                        ) : (
                          <User size={20} className="text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-slate-900 text-sm">{note.author?.full_name || 'Unknown User'}</p>
                          <p className="text-xs text-slate-500">{formatDate(note.created_at)}</p>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.note_text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
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
                  onClick={() => {
                    setExistingEvaluation(null);
                    setIsEvaluationModalOpen(true);
                  }}
                  className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  <PlusCircle size={16} />
                  Input Hasil
                </button>
              )}
            </div>

            {evaluations.filter(evalItem => {
              if (profile?.role === 'USER_MANAGER' && evalItem.evaluation_type === 'HR') {
                return false;
              }
              return true;
            }).length === 0 ? (
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
                {evaluations.filter(evalItem => {
                  if (profile?.role === 'USER_MANAGER' && evalItem.evaluation_type === 'HR') {
                    return false;
                  }
                  return true;
                }).map((evalItem) => (
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
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Total Skor</p>
                          <p className="text-lg font-black text-indigo-600">{evalItem.total_score}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleEvaluation(evalItem.id)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title={expandedEvaluations.includes(evalItem.id) ? "Tutup Preview" : "Buka Preview"}
                          >
                            {expandedEvaluations.includes(evalItem.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                          </button>
                          <button
                            onClick={() => {
                              setExistingEvaluation(evalItem);
                              setIsEvaluationModalOpen(true);
                            }}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="Edit Penilaian"
                          >
                            <Edit2 size={18} />
                          </button>
                        </div>
                      </div>
                    </div>
                    {expandedEvaluations.includes(evalItem.id) && (
                      <div className="p-4 bg-white border-b border-slate-100">
                        {evalItem.template?.form_schema?.categories?.map((category, catIdx) => (
                          <div key={catIdx} className="mb-6 last:mb-0">
                            <h4 className="font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">{category.name}</h4>
                            <div className="space-y-3">
                              {category.criteria.map((crit, critIdx) => {
                                const score = evalItem.evaluation_data[`cat_${catIdx}_crit_${critIdx}`];
                                const scaleItem = evalItem.template?.form_schema?.scale?.find(s => s.score === score);
                                return (
                                  <div key={critIdx} className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm bg-slate-50 p-3 rounded-lg">
                                    <span className="text-slate-700 font-medium">{crit.name}</span>
                                    <div className="flex items-center gap-3 shrink-0">
                                      {scaleItem && <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md">{scaleItem.label}</span>}
                                      <span className="font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md min-w-[40px] text-center">{score || '-'}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                        {evalItem.notes && (
                          <div className="mt-6 pt-4 border-t border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-2 text-sm flex items-center gap-2">
                              <FileText size={16} className="text-slate-400" />
                              Catatan Tambahan
                            </h4>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap bg-amber-50 p-4 rounded-xl border border-amber-100">{evalItem.notes}</p>
                          </div>
                        )}
                      </div>
                    )}
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
        onClose={() => {
          setIsEvaluationModalOpen(false);
          setExistingEvaluation(null);
        }}
        candidateId={id!}
        onSuccess={() => fetchEvaluations(id!)}
        existingEvaluation={existingEvaluation}
        userProfile={profile}
      />

      {/* AI Interview Questions Modal */}
      {showInterviewModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <Sparkles className="text-indigo-600" size={24} />
                  Kurasi Pertanyaan Interview
                </h2>
                <p className="text-sm text-slate-500 mt-1">Review, edit, atau hapus pertanyaan yang dihasilkan AI sebelum disimpan.</p>
              </div>
              <button 
                onClick={() => setShowInterviewModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {generatedQuestions.map((q, index) => (
                <div key={index} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm relative group">
                  <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        const newQuestions = [...generatedQuestions];
                        newQuestions.splice(index, 1);
                        setGeneratedQuestions(newQuestions);
                      }}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Hapus Pertanyaan"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="mb-3">
                    <select
                      value={q.category}
                      onChange={(e) => {
                        const newQuestions = [...generatedQuestions];
                        newQuestions[index].category = e.target.value;
                        setGeneratedQuestions(newQuestions);
                      }}
                      className="text-xs font-bold px-2 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="Technical">Technical</option>
                      <option value="Behavioral">Behavioral</option>
                      <option value="Risk Mitigation">Risk Mitigation</option>
                    </select>
                  </div>
                  
                  <textarea
                    value={q.question}
                    onChange={(e) => {
                      const newQuestions = [...generatedQuestions];
                      newQuestions[index].question = e.target.value;
                      setGeneratedQuestions(newQuestions);
                    }}
                    className="w-full text-slate-800 font-medium bg-transparent border-none focus:ring-0 p-0 resize-none"
                    rows={2}
                    placeholder="Tulis pertanyaan di sini..."
                  />
                  
                  {q.reasoning && (
                    <div className="mt-3 flex gap-2 text-sm text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
                      <p className="italic">{q.reasoning}</p>
                    </div>
                  )}
                </div>
              ))}
              
              <button
                onClick={() => {
                  setGeneratedQuestions([
                    ...generatedQuestions,
                    { category: 'Technical', question: '', reasoning: 'Ditambahkan manual oleh HR.' }
                  ]);
                }}
                className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 font-medium hover:bg-slate-50 hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
              >
                <PlusCircle size={18} />
                Tambah Pertanyaan Manual
              </button>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setShowInterviewModal(false)}
                className="px-6 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveInterviewQuestions}
                className="px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm flex items-center gap-2"
              >
                <Save size={18} />
                Simpan Daftar Pertanyaan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Screen PDF Modal */}
      {fullScreenPdf && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-white/10">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="text-indigo-400" size={20} />
              Preview Dokumen
            </h3>
            <button 
              onClick={() => setFullScreenPdf(null)}
              className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 w-full h-full p-4 md:p-8">
            <div className="w-full h-full bg-white rounded-xl overflow-hidden shadow-2xl">
              <iframe 
                src={getEmbedUrl(fullScreenPdf)} 
                className="w-full h-full"
                title="Preview Dokumen"
              />
            </div>
          </div>
        </div>
      )}

      {/* Full Screen Data Modal */}
      {fullScreenData && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-sm flex flex-col">
          <div className="flex items-center justify-between p-4 bg-slate-900 border-b border-white/10">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="text-indigo-400" size={20} />
              Preview Data Eksternal
            </h3>
            <button 
              onClick={() => setFullScreenData(null)}
              className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 w-full h-full p-4 md:p-8 overflow-hidden">
            <div className="w-full h-full bg-slate-50 rounded-xl overflow-y-auto shadow-2xl p-6 custom-scrollbar">
              <ApplicationForm readOnly initialData={fullScreenData} hideSalary={profile?.role === 'USER_MANAGER'} />
            </div>
          </div>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Assign Kandidat ke User</h3>
              <button 
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Pilih User Manager untuk me-review kandidat ini. User yang dipilih akan dapat melihat profil kandidat ini di halaman mereka.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Pilih User / Divisi
                </label>
                <select
                  value={selectedManager}
                  onChange={(e) => setSelectedManager(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- Pilih User --</option>
                  {managers.map(manager => (
                    <option key={manager.id} value={manager.id}>
                      {manager.full_name} {manager.department ? `(${manager.department})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning || !selectedManager}
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {assigning ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Assign Kandidat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
