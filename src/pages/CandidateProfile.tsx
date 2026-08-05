import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Candidate, CandidateEvaluation } from "../types";
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
  Trash2,
  UserCheck,
} from "lucide-react";
import {
  cn,
  formatDate,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  fetchWithRetry,
  getEmbedUrl,
} from "../lib/utils";
import { waitForN8nJob } from "../lib/n8n";
import { resolveDocumentUrl, removeDocumentFile } from "../lib/documentStorage";
import { CandidateAvatar } from "../components/CandidateAvatar";
import { useToast } from "../components/ui/use-toast";
import EvaluationModal from "../components/EvaluationModal";
import ReferenceCheckModal from "../components/ReferenceCheckModal";
import JSONRenderer from "../components/JSONRenderer";
import {
  ResponsiveContainer,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
} from "recharts";
import ApplicationForm from "./ApplicationForm";
import { printElement } from "../lib/print";
import { formatAsNumberedList, formatLevelAndList } from "../lib/cvSummaryFormat";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";

const extractMatchPercentage = (
  summary: any,
): { value: number | null; text: string | null } => {
  let result = { value: null as number | null, text: null as string | null };
  const search = (obj: any) => {
    if (!obj || typeof obj !== "object" || result.value !== null) return;
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        (lowerKey.includes("persentase") ||
          lowerKey.includes("kecocokan") ||
          lowerKey.includes("match") ||
          lowerKey.includes("fit")) &&
        (typeof value === "string" || typeof value === "number")
      ) {
        const num = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
        if (!isNaN(num) && num >= 0 && num <= 100) {
          result = { value: num, text: String(value) };
          return;
        }
      }
      if (typeof value === "object") {
        search(value);
      }
    }
  };
  search(summary);
  return result;
};

export default function CandidateProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [evaluations, setEvaluations] = useState<CandidateEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCandidate, setEditedCandidate] = useState<Partial<Candidate>>(
    {},
  );
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
  const [isBiodataSummaryExpanded, setIsBiodataSummaryExpanded] =
    useState(false);
  const [isPsikotesSummaryExpanded, setIsPsikotesSummaryExpanded] =
    useState(false);
  const [isInterviewQuestionsExpanded, setIsInterviewQuestionsExpanded] =
    useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [managers, setManagers] = useState<any[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);
  const { profile } = useAuth();
  const {
    isHrAdmin,
    isUserManager,
    isDirector,
    isFinanceDirector,
    isApprovalRole,
    canSeeReferenceCheck,
    canRunAiAnalysis,
    hideSalary,
  } = usePermissions();
  const [fullScreenPdf, setFullScreenPdf] = useState<string | null>(null);
  const [fullScreenData, setFullScreenData] = useState<any | null>(null);
  const [resolvedPsikotesUrl, setResolvedPsikotesUrl] = useState<string | null>(null);
  const [resolvedResumeUrl, setResolvedResumeUrl] = useState<string | null>(null);
  const [existingEvaluation, setExistingEvaluation] =
    useState<CandidateEvaluation | null>(null);
  const [isReferenceCheckModalOpen, setIsReferenceCheckModalOpen] = useState(false);
  const [existingReferenceCheck, setExistingReferenceCheck] =
    useState<CandidateEvaluation | null>(null);
  const [isArchived, setIsArchived] = useState(false);

  // Internal Notes State
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [expandedEvaluations, setExpandedEvaluations] = useState<string[]>([]);
  const [forceHideSalary, setForceHideSalary] = useState(false);
  const [onlyRemun, setOnlyRemun] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [isUpdatingApproval, setIsUpdatingApproval] = useState(false);

  const handleUpdateApproval = async (status: 'accepted' | 'rejected' | 'hold') => {
    if (!candidate || !profile) return;
    setIsUpdatingApproval(true);
    try {
      const column = isDirector ? 'director_status' : 'finance_status';
      const dateColumn = isDirector ? 'director_approval_date' : 'finance_approval_date';
      const now = new Date().toISOString();
      
      const { data: activeData } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", candidate.id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";
      
      const updatePayload: any = { 
        [column]: status, 
        updated_at: now 
      };
      
      // Update date only when accepting. (You could also update it for rejecting if needed)
      if (status === 'accepted') {
         updatePayload[dateColumn] = now;
      }

      const { error } = await supabase
        .from(table)
        .update(updatePayload)
        .eq("id", candidate.id);

      if (error) throw error;
      setCandidate({ ...candidate, ...updatePayload });
      toast({
        title: "Status Diperbarui",
        description: `Status approval berhasil diubah menjadi ${status}.`,
      });
    } catch (error) {
      console.error("Error updating approval status:", error);
      toast({
        title: "Gagal",
        description: "Terjadi kesalahan saat memperbarui status approval.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingApproval(false);
    }
  };

  const toggleEvaluation = (id: string) => {
    setExpandedEvaluations((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  };

  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        showDownloadMenu &&
        !(event.target as Element).closest(".download-menu-container")
      ) {
        setShowDownloadMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDownloadMenu]);

  useEffect(() => {
    let cancelled = false;
    resolveDocumentUrl(candidate?.psikotes_result_url).then((url) => {
      if (!cancelled) setResolvedPsikotesUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate?.psikotes_result_url]);

  useEffect(() => {
    let cancelled = false;
    resolveDocumentUrl(candidate?.resume_url).then((url) => {
      if (!cancelled) setResolvedResumeUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [candidate?.resume_url]);

  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = async (
    mode: "all" | "form-only" | "remun-only" = "all",
  ) => {
    setShowDownloadMenu(false);

    if (mode === "form-only") {
      setForceHideSalary(true);
      setOnlyRemun(false);
    } else if (mode === "remun-only") {
      setForceHideSalary(false);
      setOnlyRemun(true);
    } else {
      setForceHideSalary(false);
      setOnlyRemun(false);
    }

    // Give React time to re-render with new states before printing
    if (mode !== "all") {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    setIsPrinting(true);
    try {
      await printElement(
        printRef.current,
        `Form_Lamaran_${linkedData?.full_name?.replace(/\s+/g, "_") || "Kandidat"}`,
      );
      toast({
        title: "Berhasil",
        description: "Dokumen berhasil disiapkan untuk dicetak.",
      });
    } catch (error: any) {
      if (error.message === "POPUP_BLOCKED") {
        toast({
          title: "Popup Diblokir",
          description:
            "Browser Anda memblokir popup. Silakan izinkan popup (pop-up blocker) untuk situs ini agar dapat mencetak PDF.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Gagal",
          description: "Terjadi kesalahan saat menyiapkan dokumen.",
          variant: "destructive",
        });
      }
    } finally {
      setIsPrinting(false);
      setForceHideSalary(false);
      setOnlyRemun(false);
    }
  };

  const handleSecureDownload = async (
    url: string,
    prefix: string,
    candidateName: string,
  ) => {
    try {
      toast({
        title: "Mengunduh...",
        description: "Sedang menyiapkan file untuk diunduh.",
      });

      const cleanName = candidateName.replace(/[^a-zA-Z0-9]/g, "_");

      // 1. Handle Google Docs links (Auto-convert to PDF)
      const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^/]+)/);
      if (docsMatch) {
        const exportUrl = `https://docs.google.com/document/d/${docsMatch[1]}/export?format=pdf`;
        const a = document.createElement("a");
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
        const a = document.createElement("a");
        a.href = exportUrl;
        a.download = `${prefix}_${cleanName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }

      // 3. Handle standard files (Supabase, etc.) via secure blob to hide URL
      let ext = "pdf";
      try {
        const urlWithoutQuery = url.split("?")[0];
        const parts = urlWithoutQuery.split(".");
        if (parts.length > 1) {
          ext = parts[parts.length - 1].toLowerCase();
        }
      } catch (e) {
        console.error("Gagal mengekstrak ekstensi:", e);
      }

      const filename = `${prefix}_${cleanName}.${ext}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error("Network response was not ok");
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(objectUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
      toast({
        title: "Gagal Mengunduh",
        description:
          "Terjadi kesalahan saat mengunduh file. Pastikan dokumen masih tersedia.",
        variant: "destructive",
      });
    }
  };


  const formatValue = (val: any): string => {
    if (val === null || val === undefined || val === "") return "-";
    if (typeof val === "object") {
      if (Array.isArray(val)) {
        if (val.length === 0) return "-";
        const nonEmptyItems = val.filter((item) => {
          if (typeof item === "object" && item !== null) {
            return Object.values(item).some((v) => v !== "");
          }
          return true;
        });
        if (nonEmptyItems.length === 0) return "-";
        return nonEmptyItems
          .map((item, idx) => {
            if (typeof item === "object" && item !== null) {
              return (
                `[${idx + 1}] ` +
                Object.entries(item)
                  .filter(([_, v]) => v !== "")
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")
              );
            }
            return String(item);
          })
          .join("\n");
      }
      const entries = Object.entries(val).filter(([_, v]) => v !== "");
      if (entries.length === 0) return "-";
      return entries.map(([k, v]) => `${k}: ${v}`).join("\n");
    }
    return String(val);
  };

  useEffect(() => {
    if (id && profile) {
      fetchCandidate(id);
      fetchEvaluations(id);
      fetchNotes(id);
    }
    // profile.id (not the whole `profile` object) on purpose: AuthContext
    // re-fetches and replaces `profile` with a brand-new object on every
    // auth event, including an ordinary background token refresh that
    // succeeds — which fires on essentially every browser tab/app switch.
    // Depending on the whole object re-triggered this full refetch (visible
    // as the page appearing to "reset") on every such switch, even when
    // nothing about the candidate or the logged-in user actually changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile?.id]);

  const fetchNotes = async (candidateId: string) => {
    setLoadingNotes(true);
    try {
      const { data, error } = await supabase
        .from("internal_notes")
        .select("*, author:profiles(*)")
        .eq("candidate_id", candidateId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) {
        const filteredNotes = data.filter(
          (note) => note.author?.role === profile?.role,
        );
        setNotes(filteredNotes);
      }
    } catch (err) {
      console.error("Error fetching notes:", err);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleAddNote = async () => {
    if (!id || !profile || !newNote.trim()) return;
    setIsAddingNote(true);
    try {
      const { error } = await supabase.from("internal_notes").insert({
        candidate_id: id,
        author_id: profile.id,
        note_text: newNote.trim(),
      });

      if (error) throw error;

      // Bump the candidate's own updated_at too — notes live in a separate
      // table, but adding one is still a "touch" on this candidate from
      // HR's perspective (e.g. surfaces them at the top of Screening's
      // "Terbaru" sort).
      await supabase
        .from("candidates")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", id);

      toast({
        title: "Berhasil",
        description: "Catatan internal ditambahkan.",
      });
      setNewNote("");
      fetchNotes(id);
    } catch (err: any) {
      console.error("Error adding note:", err);
      toast({
        title: "Error",
        description: "Gagal menambahkan catatan.",
        variant: "destructive",
      });
    } finally {
      setIsAddingNote(false);
    }
  };

  const fetchEvaluations = async (candidateId: string) => {
    const { data, error } = await supabase
      .from("candidate_evaluations")
      .select("*, template:evaluation_templates(*)")
      .eq("candidate_id", candidateId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setEvaluations(data);
    }
  };

  const fetchCandidate = async (candidateId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("candidates")
      .select(
        "*, psikotes_schedules(id, is_confirmed, schedule_date), interview_schedules(id, is_confirmed, schedule_date, additional_notes), candidate_assignees(user_id, profiles(id, full_name, role, department))",
      )
      .eq("id", candidateId)
      .single();

    let candidateData = data;

    if (error || !data) {
      // Try fetching from candidate_logs if not found in active candidates
      const { data: logData, error: logError } = await supabase
        .from("candidate_logs")
        .select("*")
        .eq("id", candidateId)
        .single();

      if (logError || !logData) {
        toast({
          title: "Error",
          description: "Gagal memuat profil kandidat",
          variant: "destructive",
        });
        navigate("/screening");
        setLoading(false);
        return;
      }
      candidateData = logData;
      setIsArchived(true);
    } else {
      setIsArchived(false);
    }

    // Access Control Check
    if (
      isUserManager &&
      !candidateData.candidate_assignees?.some(
        (a: any) => a.user_id === profile?.id,
      )
    ) {
      toast({
        title: "Akses Ditolak",
        description: "Anda tidak memiliki akses ke kandidat ini.",
        variant: "destructive",
      });
      navigate("/screening");
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
      .from("profiles")
      .select("id, full_name, role, department, phone")
      .in("role", ["USER_MANAGER", "HR_ADMIN", "DIRECTOR", "FINANCE_DIRECTOR"])
      .order("full_name");

    if (data) {
      setManagers(data);
    }
  };

  const handleAssign = async () => {
    if (!id) return;

    try {
      setAssigning(true);

      const { data: activeData } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";

      // Delete existing assignments
      await supabase
        .from("candidate_assignees")
        .delete()
        .eq("candidate_id", id);

      // Insert new assignments
      if (selectedManagers.length > 0) {
        const inserts = selectedManagers.map((userId) => ({
          candidate_id: id,
          user_id: userId,
        }));
        const { error } = await supabase
          .from("candidate_assignees")
          .insert(inserts);

        if (error) throw error;

        // Send WhatsApp notification to assigned users
        const { data: { session } } = await supabase.auth.getSession();
        
        for (const userId of selectedManagers) {
          const manager = managers.find(m => m.id === userId);
          if (manager && manager.phone) {
            try {
              await fetchWithRetry("/api/n8n/trigger", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${session?.access_token}`
                },
                body: JSON.stringify({
                  type: 'wa',
                  payload: {
                    event: 'assign_candidate_notification',
                    manager: {
                      id: manager.id,
                      name: manager.full_name,
                      phone: manager.phone
                    },
                    candidate: {
                      id: candidate?.id,
                      full_name: candidate?.full_name,
                      position: candidate?.position
                    },
                    whatsapp: {
                      phone: manager.phone,
                      body: `Halo ${manager.full_name},\n\nAnda telah di-assign untuk me-review kandidat:\n\nNama: ${candidate?.full_name}\nPosisi: ${candidate?.position}\n\nSilakan cek aplikasi untuk informasi lebih lanjut.`
                    }
                  }
                })
              });
            } catch (e) {
              console.error("Failed to send WA notification to manager", manager.full_name, e);
            }
          }
        }
      }

      toast({
        title: "Berhasil",
        description: "Kandidat berhasil di-assign ke user.",
      });

      setIsAssignModalOpen(false);
      fetchCandidate(id);
    } catch (error: any) {
      console.error("Error assigning candidate:", error);
      toast({
        title: "Gagal",
        description: error.message,
        variant: "destructive",
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
          .from("external_data")
          .select("*")
          .eq("uid_sheet", candidateData.linked_external_id)
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

      const { data, error } = await supabase.from("external_data").select("*");

      if (data) {
        // Filter out data that is already linked to other candidates
        const uids = data.map((d) => d.uid_sheet);

        const [activeRes, logsRes] = await Promise.all([
          supabase
            .from("candidates")
            .select("linked_external_id")
            .in("linked_external_id", uids)
            .neq("id", candidateData.id),
          supabase
            .from("candidate_logs")
            .select("linked_external_id")
            .in("linked_external_id", uids)
            .neq("id", candidateData.id),
        ]);

        const usedUids = new Set([
          ...(activeRes.data?.map((d) => d.linked_external_id) || []),
          ...(logsRes.data?.map((d) => d.linked_external_id) || []),
        ]);

        const availableData = data.filter((d) => !usedUids.has(d.uid_sheet));

        const matches = availableData.filter((item) => {
          const raw = item.raw_data;
          if (!raw) return false;

          let match = false;
          Object.entries(raw).forEach(([key, val]) => {
            if (typeof val !== "string") return;
            const lowerKey = key.toLowerCase();
            const strVal = String(val);

            if (
              lowerKey.includes("email") &&
              normalizeEmail(strVal) === normEmail
            )
              match = true;
            if (
              (lowerKey.includes("phone") ||
                lowerKey.includes("telepon") ||
                lowerKey.includes("hp") ||
                lowerKey.includes("whatsapp")) &&
              normalizePhone(strVal) === normPhone &&
              normPhone !== ""
            )
              match = true;
            if (
              (lowerKey.includes("name") || lowerKey.includes("nama")) &&
              normalizeName(strVal) === normName
            )
              match = true;
          });
          return match;
        });

        setExternalData(
          matches.map((m) => ({ uid_sheet: m.uid_sheet, ...m.raw_data })),
        );
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
        .from("candidates")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";

      const { error } = await supabase
        .from(table)
        .update({ linked_external_id: uid_sheet, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Data eksternal berhasil ditautkan.",
      });

      // Refresh
      fetchCandidate(id);
    } catch (err: any) {
      console.error("Error linking data:", err);
      toast({
        title: "Error",
        description: "Gagal menautkan data.",
        variant: "destructive",
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkExternalData = async () => {
    if (!candidate || !id) return;
    setIsLinking(true);
    try {
      const { data: activeData } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";

      const { error } = await supabase
        .from(table)
        .update({ linked_external_id: null, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Tautan data eksternal dilepas.",
      });
      setLinkedData(null);
      fetchCandidate(id);
    } catch (err: any) {
      console.error("Error unlinking data:", err);
      toast({
        title: "Error",
        description: "Gagal melepas tautan data.",
        variant: "destructive",
      });
    } finally {
      setIsLinking(false);
    }
  };

  const handleAnalyzeBiodata = async () => {
    if (!candidate || !linkedData) return;
    setIsAnalyzing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const aiWebhookUrl = user?.user_metadata?.ai_analysis_webhook_url;
      if (!aiWebhookUrl) {
        toast({
          title: "Konfigurasi Diperlukan",
          description:
            "Silakan atur n8n AI Analysis Webhook URL di menu Pengaturan terlebih dahulu.",
          variant: "destructive",
        });
        setIsAnalyzing(false);
        return;
      }

      const response = await fetchWithRetry("/api/n8n/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          type: "ai_analysis",
          payload: {
            event: "analyze_candidate_biodata",
            candidate_id: candidate.id,
            full_name: candidate.full_name,
            position: candidate.position,
            raw_data: linkedData,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gagal memicu analisa AI: ${response.statusText}`);
      }

      const responseData = await response.json();

      toast({
        title: "Analisa Dimulai",
        description:
          "AI sedang menganalisa biodata. Hasilnya akan muncul setelah proses selesai (silakan refresh halaman ini nanti).",
      });
    } catch (err: any) {
      console.error("Error triggering AI analysis:", err);
      toast({
        title: "Error",
        description: err.message || "Gagal memulai analisa AI.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzePsikotes = async () => {
    if (!candidate || !candidate.psikotes_result_url) return;
    setIsAnalyzingPsikotes(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const aiPsikotesWebhookUrl = user?.user_metadata?.ai_psikotes_webhook_url;
      if (!aiPsikotesWebhookUrl) {
        toast({
          title: "Konfigurasi Diperlukan",
          description:
            "Silakan atur n8n AI Psikotes Analysis Webhook URL di menu Pengaturan terlebih dahulu.",
          variant: "destructive",
        });
        setIsAnalyzingPsikotes(false);
        return;
      }

      const psikotesUrlForN8n = await resolveDocumentUrl(candidate.psikotes_result_url);
      if (!psikotesUrlForN8n) {
        toast({
          title: "Error",
          description: "Gagal menyiapkan URL hasil psikotes untuk dianalisa.",
          variant: "destructive",
        });
        setIsAnalyzingPsikotes(false);
        return;
      }

      const response = await fetchWithRetry("/api/n8n/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          type: "ai_psikotes_analysis",
          payload: {
            event: "analyze_candidate_psikotes",
            candidate_id: candidate.id,
            full_name: candidate.full_name,
            position: candidate.position,
            psikotes_url: psikotesUrlForN8n,
            timestamp: new Date().toISOString(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Gagal memicu analisa AI: ${response.statusText}`);
      }

      const responseData = await response.json();

      toast({
        title: "Analisa Dimulai",
        description:
          "AI sedang menganalisa hasil psikotes. Hasilnya akan muncul setelah proses selesai (silakan refresh halaman ini nanti).",
      });
    } catch (err: any) {
      console.error("Error triggering AI analysis:", err);
      toast({
        title: "Error",
        description: err.message || "Gagal memulai analisa AI.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzingPsikotes(false);
    }
  };

  const handleGenerateInterviewQuestions = async () => {
    if (!candidate) return;
    setIsGeneratingInterview(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const aiInterviewWebhookUrl =
        user?.user_metadata?.ai_interview_webhook_url;
      if (!aiInterviewWebhookUrl) {
        toast({
          title: "Konfigurasi Diperlukan",
          description:
            "Silakan atur n8n AI Interview Question Generator Webhook URL di menu Pengaturan terlebih dahulu.",
          variant: "destructive",
        });
        setIsGeneratingInterview(false);
        return;
      }

      const response = await fetchWithRetry("/api/n8n/trigger", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          type: "ai_interview",
          payload: {
            candidate_id: candidate.id,
            action: "generate_interview_questions",
            ai_biodata_summary: candidate.ai_biodata_summary,
          },
        }),
      });

      if (!response.ok) {
        let errorMsg = response.statusText || `HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.error) errorMsg = errData.error;
          else if (errData.message) errorMsg = errData.message;
          else if (typeof errData === "string") errorMsg = errData;
          else errorMsg = JSON.stringify(errData);
        } catch (e) {
          // ignore
        }
        throw new Error(`Gagal generate pertanyaan: ${errorMsg}`);
      }

      const responseData = await response.json();

      toast({
        title: "Proses Dimulai",
        description:
          "Data berhasil dikirim untuk diproses, silahkan refresh halaman ini kembali.",
      });
    } catch (err: any) {
      console.error("Error generating interview questions:", err);
      toast({
        title: "Error",
        description: err.message || "Gagal generate pertanyaan interview.",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingInterview(false);
    }
  };

  const handleSaveInterviewQuestions = async () => {
    if (!candidate) return;
    try {
      const { data: activeData } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", candidate.id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";

      const { error } = await supabase
        .from(table)
        .update({ ai_interview_questions: generatedQuestions, updated_at: new Date().toISOString() })
        .eq("id", candidate.id);

      if (error) throw error;

      setCandidate({
        ...candidate,
        ai_interview_questions: generatedQuestions,
      });
      setShowInterviewModal(false);
      toast({
        title: "Berhasil",
        description: "Pertanyaan interview berhasil disimpan.",
      });
    } catch (err: any) {
      console.error("Error saving interview questions:", err);
      toast({
        title: "Error",
        description: err.message || "Gagal menyimpan pertanyaan.",
        variant: "destructive",
      });
    }
  };

  const handleUploadPsikotes = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file || !candidate || !id) return;

    if (file.type !== "application/pdf") {
      toast({
        title: "Error",
        description: "Hanya file PDF yang diperbolehkan.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Ukuran file maksimal 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingPsikotes(true);
    try {
      // Delete old file if exists to prevent accumulation (handles both the
      // legacy public bucket and the new private bucket).
      if (candidate.psikotes_result_url) {
        try {
          await removeDocumentFile(candidate.psikotes_result_url);
        } catch (delErr) {
          console.error("Failed to delete old file:", delErr);
        }
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `psikotes/${id}_${Date.now()}.${fileExt}`;

      // fileName always includes a fresh timestamp and the previous file is
      // already deleted above, so this never actually collides — upsert
      // would force Postgres into an INSERT ... ON CONFLICT DO UPDATE path
      // that requires satisfying both INSERT and UPDATE RLS policies.
      const { error: uploadError } = await supabase.storage
        .from("candidate-documents-private")
        .upload(fileName, file, {
          contentType: "application/pdf",
        });

      if (uploadError) throw uploadError;

      // Stored as a bare storage path (not a public URL) — resolved into a
      // short-lived signed URL on demand whenever it's actually displayed.
      const { data: activeData } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";

      const { error: updateError } = await supabase
        .from(table)
        .update({ psikotes_result_url: fileName, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (updateError) throw updateError;

      toast({
        title: "Berhasil",
        description: "Hasil psikotes berhasil diunggah.",
      });
      fetchCandidate(id);
    } catch (err: any) {
      console.error("Error uploading psikotes:", err);
      toast({
        title: "Error",
        description: err.message || "Gagal mengunggah hasil psikotes.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingPsikotes(false);
      // Reset input
      e.target.value = "";
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
        updated_at: new Date().toISOString(),
      };

      // Check if candidate is in active candidates or logs
      const { data: activeData } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      const table = activeData ? "candidates" : "candidate_logs";

      const { error } = await supabase
        .from(table)
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Profil kandidat berhasil diperbarui",
      });

      setIsEditing(false);
      fetchCandidate(id);
    } catch (error: any) {
      console.error("Error updating candidate:", error);
      toast({
        title: "Error",
        description: error.message || "Gagal memperbarui profil kandidat",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedCandidate(candidate || {});
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    setEditedCandidate((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
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
        <h2 className="text-2xl font-bold text-slate-700 mb-2">
          Kandidat Tidak Ditemukan
        </h2>
        <p className="text-slate-500 mb-6">
          Profil kandidat yang Anda cari tidak ada atau telah dihapus.
        </p>
        <button
          onClick={() => navigate(-1)}
          className="px-6 py-2 bg-[#3D2C44] text-white font-medium rounded-xl hover:bg-[#3D2C44]/90 transition-colors"
        >
          Kembali
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

  const totalScore =
    techScore + commScore + probScore + teamScore + leadScore + adaptScore;
  const averageScore = Math.round(totalScore / 6);

  const radarData = [
    { subject: "Technical", A: techScore },
    { subject: "Communication", A: commScore },
    { subject: "Problem Solving", A: probScore },
    { subject: "Teamwork", A: teamScore },
    { subject: "Leadership", A: leadScore },
    { subject: "Adaptability", A: adaptScore },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "hired":
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "accepted":
        return "bg-[#3D2C44] text-white border-[#3D2C44]";
      case "rejected":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "invited":
        return "bg-amber-100 text-amber-700 border-amber-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const interviewEvaluations = evaluations.filter((e) => e.evaluation_type !== "REFERENCE_CHECK");
  const referenceChecks = evaluations.filter((e) => e.evaluation_type === "REFERENCE_CHECK");

  const getStatusText = (status: string) => {
    switch (status) {
      case "hired":
        return "Hired";
      case "accepted":
        return "Lolos";
      case "rejected":
        return "Ditolak";
      case "invited":
        return "Diundang";
      default:
        return "Menunggu";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[#3D2C44]">
              Profil Kandidat
            </h1>
            <p className="text-[#3D2C44]/70 text-sm mt-1">
              Detail informasi dan hasil asesmen kandidat
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isEditing ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="px-4 py-2 border border-rose-200 text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <X size={16} />
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-[#3D2C44] text-white rounded-xl hover:bg-[#3D2C44]/90 transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          ) : (
            <>
              {!isUserManager && !isArchived && (
                <>
                  <button
                    onClick={() => setIsApprovalModalOpen(true)}
                    className="px-4 py-2 bg-white text-[#3D2C44] border border-[#3D2C44] rounded-xl hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <UserCheck size={16} />
                    Approval & Review
                  </button>
                  {!isApprovalRole && (
                    <button
                      onClick={() => {
                        fetchManagers();
                        setSelectedManagers(
                          candidate.candidate_assignees?.map((a: any) => a.user_id) || [],
                        );
                        setIsAssignModalOpen(true);
                      }}
                      className="px-4 py-2 bg-[#3D2C44] text-white rounded-xl hover:bg-[#3D2C44]/90 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <Users size={16} />
                      Assign User
                    </button>
                  )}
                  {!isApprovalRole && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="px-4 py-2 bg-[#3D2C44] text-white rounded-xl hover:bg-[#3D2C44]/90 transition-colors flex items-center gap-2 text-sm font-medium"
                    >
                      <Edit2 size={16} />
                      Edit Profil
                    </button>
                  )}
                </>
              )}
            </>
          )}
          {candidate.director_status === "accepted" &&
            candidate.finance_status === "accepted" && (
              <div className="px-4 py-1.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle size={16} />
                Disetujui Direktur &amp; Finance
              </div>
            )}
          <div
            className={cn(
              "px-4 py-1.5 rounded-full border text-sm font-bold uppercase tracking-wider",
              getStatusColor(candidate.status_screening),
            )}
          >
            {getStatusText(candidate.status_screening)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Basic Info */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-24 bg-[#3D2C44]"></div>
            <div className="px-6 pb-6 relative">
              <div className="w-20 h-20 bg-white rounded-2xl border-4 border-white shadow-md flex items-center justify-center text-3xl font-bold text-[#3D2C44] absolute -top-10 overflow-hidden">
                <CandidateAvatar
                  source={linkedData || candidate.source_info}
                  alt={candidate.full_name}
                  className="w-full h-full object-cover"
                  fallback={candidate.full_name.charAt(0)}
                />
              </div>
              <div className="pt-14">
                {isEditing ? (
                  <input
                    type="text"
                    name="full_name"
                    value={editedCandidate.full_name || ""}
                    onChange={handleInputChange}
                    className="w-full text-2xl font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-1 mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <h2 className="text-2xl font-bold text-slate-900">
                    {candidate.full_name}
                  </h2>
                )}

                <div className="flex items-center gap-2 text-indigo-600 font-medium mt-1">
                  <Briefcase size={16} />
                  {isEditing ? (
                    <input
                      type="text"
                      name="position"
                      value={editedCandidate.position || ""}
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
                        value={editedCandidate.email || ""}
                        onChange={handleInputChange}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <a
                        href={`mailto:${candidate.email}`}
                        className="hover:text-indigo-600 transition-colors truncate"
                      >
                        {candidate.email}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-600">
                    <Phone size={16} className="text-slate-400 shrink-0" />
                    {isEditing ? (
                      <input
                        type="text"
                        name="phone"
                        value={editedCandidate.phone || ""}
                        onChange={handleInputChange}
                        className="flex-1 bg-white border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : candidate.phone ? (
                      <a
                        href={`tel:${candidate.phone}`}
                        className="hover:text-indigo-600 transition-colors"
                      >
                        {candidate.phone}
                      </a>
                    ) : (
                      <span className="text-slate-400 italic">
                        Belum ada nomor telepon
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-600">
                    <CalendarIcon size={16} className="text-slate-400" />
                    <span>Melamar pada {formatDate(candidate.date)}</span>
                  </div>
                  {candidate.source_info && (
                    <div className="flex items-center gap-3 text-slate-600">
                      <div className="w-4 h-4 flex items-center justify-center shrink-0">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="text-slate-400"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                          <path d="M2 12h20" />
                        </svg>
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
                          onClick={async () => {
                            const url = await resolveDocumentUrl(candidate.resume_url);
                            if (url) setFullScreenPdf(url);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3D2C44]/5 hover:bg-[#3D2C44]/10 text-[#3D2C44] rounded-lg transition-colors text-xs font-medium"
                        >
                          <ExternalLink size={14} />
                          Full Screen
                        </button>
                        <button
                          onClick={async () => {
                            const url = await resolveDocumentUrl(candidate.resume_url);
                            if (url) {
                              handleSecureDownload(url, "CV", candidate.full_name);
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#3D2C44]/10 hover:bg-[#3D2C44]/20 text-[#3D2C44] rounded-lg transition-colors text-xs font-medium"
                        >
                          <Download size={14} />
                          Unduh
                        </button>
                      </div>
                    </div>
                    <div className="w-full h-[400px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                      <iframe
                        src={getEmbedUrl(resolvedResumeUrl)}
                        className="w-full h-full"
                        title="Preview CV"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {candidate.ai_cv_analysis && (
            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-indigo-300 shadow-sm p-6 overflow-hidden">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <UserCheck className="text-indigo-500" size={20} />
                Analisis CV (AI / Manusia)
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {(() => {
                  const analysis = candidate.ai_cv_analysis as string;
                  if (!analysis) return null;
                  const parts = analysis
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean);

                  if (parts.length >= 3) {
                    const percentage = parts[0].replace("%", ""); // In case it already has %
                    const probability = parts[1];
                    const reason = parts.slice(2).join(" ");

                    return (
                      <span>
                        Persentase AI{" "}
                        <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">
                          {percentage}%
                        </span>
                        , probabilitas penggunaan AI{" "}
                        <span className="font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-100">
                          {probability}
                        </span>
                        , dengan Alasan:{" "}
                        <span className="font-medium text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-md border border-slate-200">
                          {reason}
                        </span>
                      </span>
                    );
                  }
                  return analysis;
                })()}
              </p>
            </div>
          )}

          {candidate.career_fit_recommendation && (
            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-sky-300 shadow-sm p-6 overflow-hidden">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                <Briefcase className="text-sky-500" size={20} />
                Rekomendasi Kecocokan Karier (Career Fit)
              </h3>
              <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                {candidate.career_fit_recommendation}
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Experience & Education */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-sky-300 shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Briefcase className="text-indigo-500" size={20} />
                  Pengalaman Kerja
                </h3>
                <div className="text-sm text-slate-600">
                  {formatAsNumberedList(
                    candidate.work_experience,
                    <p className="text-slate-400 italic text-sm">
                      Tidak ada data pengalaman kerja.
                    </p>,
                  )}
                </div>
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
                  <p className="text-slate-400 italic text-sm">
                    Tidak ada data pendidikan.
                  </p>
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
                  {(() => {
                    const rawSkills = candidate.skills.replace(/\\n/g, "\n");
                    let parsed: string[] = [];
                    if (/(?:^|\s|\n)\d+[\.\)]\s+/.test(rawSkills)) {
                      parsed = rawSkills.split(/(?:^|\s+|\n)\d+[\.\)]\s+/);
                    } else if (rawSkills.includes("\n")) {
                      parsed = rawSkills.split("\n");
                    } else {
                      parsed = rawSkills.split(",");
                    }
                    return parsed
                      .map((s) =>
                        s
                          .replace(/^[-•*]\s*/, "")
                          .trim()
                          .replace(/,$/, "")
                          .trim(),
                      )
                      .filter(Boolean);
                  })().map((skill, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 italic text-sm">
                  Tidak ada data keahlian.
                </p>
              )}
            </div>
          </div>

          {/* Assessment Details */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-sky-300 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
              <FileText className="text-indigo-500" size={20} />
              CV Summary
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                <h4 className="font-bold text-emerald-800 flex items-center gap-2 mb-2">
                  <ThumbsUp size={16} />
                  Kekuatan (Strengths)
                </h4>
                <div className="text-sm text-emerald-700">
                  {formatAsNumberedList(
                    candidate.strengths,
                    <span className="italic opacity-70">Belum dianalisis</span>,
                  )}
                </div>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                <h4 className="font-bold text-rose-800 flex items-center gap-2 mb-2">
                  <ThumbsDown size={16} />
                  Kelemahan (Weaknesses)
                </h4>
                <div className="text-sm text-rose-700">
                  {formatAsNumberedList(
                    candidate.weaknesses,
                    <span className="italic opacity-70">Belum dianalisis</span>,
                  )}
                </div>
              </div>

              <div className="bg-[#3D2C44]/5 border border-[#3D2C44]/20 rounded-xl p-4">
                <h4 className="font-bold text-[#3D2C44] flex items-center gap-2 mb-2">
                  <Star size={16} />
                  Potensi
                </h4>
                <div className="text-sm text-[#3D2C44]/80">
                  {formatLevelAndList(
                    candidate.potential_factors,
                    <span className="italic opacity-70">Belum dianalisis</span>,
                  )}
                </div>
              </div>

              <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4">
                <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2">
                  <AlertTriangle size={16} />
                  Faktor Risiko
                </h4>
                <div className="text-sm text-amber-700">
                  {formatLevelAndList(
                    candidate.risk_factors,
                    <span className="italic opacity-70">Belum dianalisis</span>,
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex flex-col items-center mt-1">
                  <div
                    className="w-14 h-14 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-2xl font-bold shadow-lg shadow-indigo-200"
                    title="Skor CV (AI)"
                  >
                    {candidate.assessment_score || 0}
                  </div>
                  <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mt-2">
                    Skor AI
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <FileText size={16} className="text-indigo-500" />
                    Alasan Penilaian
                  </h4>
                  <div className="text-sm text-indigo-800">
                    {formatAsNumberedList(
                      candidate.assessment_reason,
                      <span className="italic opacity-70">
                        Tidak ada alasan penilaian yang diberikan.
                      </span>,
                      true,
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI Biodata Summary Section */}
          {candidate.ai_biodata_summary && (
            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-indigo-300 shadow-sm overflow-hidden mb-6">
              <div
                className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() =>
                  setIsBiodataSummaryExpanded(!isBiodataSummaryExpanded)
                }
              >
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="text-indigo-500" size={20} />
                  Ringkasan AI (Berdasarkan Biodata)
                  {isBiodataSummaryExpanded ? (
                    <ChevronUp size={20} className="text-slate-400 ml-2" />
                  ) : (
                    <ChevronDown size={20} className="text-slate-400 ml-2" />
                  )}
                </h3>
              </div>
              {isBiodataSummaryExpanded && (
                <div className="px-6 pb-6 border-t border-slate-100 pt-6 text-sm text-slate-700">
                  <JSONRenderer data={candidate.ai_biodata_summary} />
                </div>
              )}
            </div>
          )}

          {/* AI Psikotes Summary Section */}
          {candidate.ai_psikotes_summary && (
            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-indigo-300 shadow-sm overflow-hidden mb-6">
              <div
                className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 transition-colors flex-wrap gap-2"
                onClick={() =>
                  setIsPsikotesSummaryExpanded(!isPsikotesSummaryExpanded)
                }
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Sparkles className="text-indigo-500" size={20} />
                    Ringkasan AI (Berdasarkan Psikotes)
                  </h3>
                  {(() => {
                    const matchData = extractMatchPercentage(
                      candidate.ai_psikotes_summary,
                    );
                    if (matchData.value !== null) {
                      const isGood = matchData.value > 60;
                      return (
                        <span
                          className={cn(
                            "ml-2 text-sm font-bold px-2 py-0.5 rounded-full border",
                            isGood
                              ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                              : "text-red-700 bg-red-50 border-red-200",
                          )}
                        >
                          Persentase Kecocokan:{" "}
                          {matchData.text?.includes("%")
                            ? matchData.text
                            : `${matchData.value}%`}
                        </span>
                      );
                    }
                    return null;
                  })()}
                  {isPsikotesSummaryExpanded ? (
                    <ChevronUp size={20} className="text-slate-400 ml-2" />
                  ) : (
                    <ChevronDown size={20} className="text-slate-400 ml-2" />
                  )}
                </div>
              </div>
              {isPsikotesSummaryExpanded && (
                <div className="px-6 pb-6 border-t border-slate-100 pt-6 text-sm text-slate-700">
                  <JSONRenderer data={candidate.ai_psikotes_summary} />
                </div>
              )}
            </div>
          )}

          {/* AI Interview Questions Section */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-indigo-300 shadow-sm overflow-hidden mb-6">
            <div
              className="flex items-center justify-between p-6 cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() =>
                setIsInterviewQuestionsExpanded(!isInterviewQuestionsExpanded)
              }
            >
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="text-indigo-500" size={20} />
                Pertanyaan Interview (AI)
                {isInterviewQuestionsExpanded ? (
                  <ChevronUp size={20} className="text-slate-400 ml-2" />
                ) : (
                  <ChevronDown size={20} className="text-slate-400 ml-2" />
                )}
              </h3>
              <div
                className="flex items-center gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                {canRunAiAnalysis && !isArchived && (
                  <button
                    onClick={handleGenerateInterviewQuestions}
                    disabled={isGeneratingInterview}
                    className="flex items-center gap-2 px-4 py-2 bg-[#3D2C44] text-white text-sm font-bold rounded-xl hover:bg-[#3D2C44]/90 disabled:opacity-50 transition-all shadow-sm shrink-0"
                  >
                    {isGeneratingInterview ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    {isGeneratingInterview
                      ? "AI sedang menyusun..."
                      : "Generate (AI)"}
                  </button>
                )}
              </div>
            </div>

            {isInterviewQuestionsExpanded && (
              <div className="px-6 pb-6 border-t border-slate-100 pt-6">
                {(() => {
                  let questions: any[] = [];
                  if (candidate.ai_interview_questions) {
                    try {
                      const parsed =
                        typeof candidate.ai_interview_questions === "string"
                          ? JSON.parse(candidate.ai_interview_questions)
                          : candidate.ai_interview_questions;

                      if (Array.isArray(parsed)) {
                        questions = parsed;
                      } else if (
                        parsed &&
                        Array.isArray(parsed.interview_questions)
                      ) {
                        questions = parsed.interview_questions;
                      }
                    } catch (e) {
                      console.error(
                        "Failed to parse ai_interview_questions",
                        e,
                      );
                    }
                  }

                  if (questions.length > 0) {
                    const grouped: Record<string, any[]> = {};
                    questions.forEach((q: any) => {
                      const cat = q.category || "General";
                      if (!grouped[cat]) grouped[cat] = [];
                      grouped[cat].push(q);
                    });

                    let runningIndex = 0;

                    return (
                      <div className="space-y-5">
                        {Object.entries(grouped).map(([category, catQuestions]) => (
                          <div key={category}>
                            <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                              {category}
                            </h4>
                            <div className="space-y-3">
                              {catQuestions.map((q: any) => {
                                runningIndex += 1;
                                const num = runningIndex;
                                return (
                                  <div
                                    key={num}
                                    className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-3"
                                  >
                                    <span className="shrink-0 w-6 h-6 rounded-full bg-[#3D2C44] text-white text-xs font-bold flex items-center justify-center mt-0.5">
                                      {num}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-slate-800 font-medium mb-2">
                                        {q.question}
                                      </p>
                                      {q.reasoning && (
                                        <div className="flex gap-2 text-sm text-slate-500 bg-white p-3 rounded-lg border border-slate-100">
                                          <Sparkles
                                            size={16}
                                            className="text-indigo-400 shrink-0 mt-0.5"
                                          />
                                          <p className="italic">{q.reasoning}</p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        {!isUserManager && !isArchived && (
                          <div className="flex justify-end mt-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setGeneratedQuestions(questions);
                                setShowInterviewModal(true);
                              }}
                              className="text-sm font-medium text-[#3D2C44] hover:text-[#3D2C44]/80"
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
                      <p className="text-slate-500 font-medium">
                        Belum ada pertanyaan interview
                      </p>
                      <p className="text-sm text-slate-400 mt-1">
                        Klik tombol "Generate (AI)" untuk membuat daftar
                        pertanyaan yang terpersonalisasi.
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Psikotes Eksternal */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-sky-300 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Hasil Psikotes Eksternal
              </h3>
              {!isUserManager && !isArchived && (
                <div>
                  <label className="cursor-pointer px-4 py-2 bg-[#3D2C44]/10 text-[#3D2C44] hover:bg-[#3D2C44]/20 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium">
                    {isUploadingPsikotes ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      <PlusCircle size={16} />
                    )}
                    {isUploadingPsikotes ? "Mengunggah..." : "Upload PDF"}
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
                  {canRunAiAnalysis && !isArchived && (
                    <button
                      onClick={handleAnalyzePsikotes}
                      disabled={isAnalyzingPsikotes}
                      className="flex items-center gap-2 px-4 py-2 bg-[#3D2C44] text-white text-sm font-bold rounded-xl hover:bg-[#3D2C44]/90 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {isAnalyzingPsikotes ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {isAnalyzingPsikotes
                        ? "AI sedang menganalisa..."
                        : "Analisa Psikotes dengan AI"}
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      const url = await resolveDocumentUrl(candidate.psikotes_result_url);
                      if (url) setFullScreenPdf(url);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#3D2C44]/5 hover:bg-[#3D2C44]/10 text-[#3D2C44] rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <ExternalLink size={16} />
                    Full Screen
                  </button>
                  <button
                    onClick={async () => {
                      const url = await resolveDocumentUrl(candidate.psikotes_result_url);
                      if (url) {
                        handleSecureDownload(url, "Psikotes", candidate.full_name);
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-[#3D2C44]/20 text-[#3D2C44] hover:bg-[#3D2C44]/5 rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <Download size={16} />
                    Unduh
                  </button>
                </div>

                <div className="w-full h-[600px] border border-slate-200 rounded-xl overflow-hidden bg-slate-50">
                  <iframe
                    src={getEmbedUrl(resolvedPsikotesUrl)}
                    className="w-full h-full"
                    title="Hasil Psikotes"
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  Belum ada hasil psikotes
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Klik tombol "Upload PDF" untuk menambahkan dokumen hasil
                  psikotes eksternal.
                </p>
              </div>
            )}
          </div>

          {/* External Data Integration */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-sky-300 shadow-sm p-6">
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
                  {canRunAiAnalysis && !isArchived && (
                    <button
                      onClick={handleAnalyzeBiodata}
                      disabled={isAnalyzing}
                      className="flex items-center gap-2 px-4 py-2 bg-[#3D2C44] text-white text-sm font-bold rounded-xl hover:bg-[#3D2C44]/90 disabled:opacity-50 transition-all shadow-sm"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Sparkles size={16} />
                      )}
                      {isAnalyzing
                        ? "AI sedang menganalisa..."
                        : "Analisa Biodata dengan AI"}
                    </button>
                  )}
                  <button
                    onClick={() => setFullScreenData(linkedData)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#3D2C44]/5 hover:bg-[#3D2C44]/10 text-[#3D2C44] rounded-xl transition-colors text-sm font-medium shadow-sm"
                  >
                    <ExternalLink size={16} />
                    Full Screen
                  </button>

                  <div className="relative download-menu-container">
                    <button
                      onClick={() =>
                        !isUserManager
                          ? setShowDownloadMenu(!showDownloadMenu)
                          : handlePrint("form-only")
                      }
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
                          {!isUserManager && (
                            <svg
                              className={`w-4 h-4 ml-1 transition-transform ${showDownloadMenu ? "rotate-180" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M19 9l-7 7-7-7"
                              ></path>
                            </svg>
                          )}
                        </>
                      )}
                    </button>
                    {showDownloadMenu &&
                      !isUserManager &&
                      !isPrinting && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                          <button
                            onClick={() => handlePrint("form-only")}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 border-b border-slate-100 transition-colors"
                          >
                            Unduh Form Pelamar Saja
                          </button>
                          <button
                            onClick={() => handlePrint("remun-only")}
                            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
                          >
                            Unduh Remunerasi
                          </button>
                        </div>
                      )}
                  </div>

                  {!isUserManager && !isArchived && (
                    <button
                      onClick={handleUnlinkExternalData}
                      disabled={isLinking}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-sm font-medium shadow-sm disabled:opacity-50"
                    >
                      {isLinking ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <X size={16} />
                      )}
                      {isLinking ? "Memproses..." : "Lepas Tautan"}
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
                  <div
                    ref={printRef}
                    className="print:p-0 print:bg-white print:w-full"
                  >
                    <ApplicationForm
                      readOnly
                      initialData={linkedData}
                      hideSalary={forceHideSalary || hideSalary}
                      onlyRemuneration={onlyRemun}
                    />
                  </div>
                </div>
              </div>
            ) : externalData.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-3">
                  <AlertTriangle
                    className="text-amber-600 shrink-0 mt-0.5"
                    size={16}
                  />
                  <div className="text-sm text-amber-800">
                    <span className="font-bold">
                      Ditemukan {externalData.length} data yang mungkin cocok.
                    </span>
                    <p className="mt-1 opacity-80">
                      Pilih salah satu data di bawah ini untuk ditautkan ke
                      profil ini.
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  {externalData.map((data, idx) => (
                    <div
                      key={idx}
                      className="border border-slate-200 rounded-xl p-4 hover:border-indigo-300 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                          Opsi {idx + 1}
                        </span>
                        {!isUserManager && !isArchived && (
                          <button
                            onClick={() =>
                              handleLinkExternalData(data.uid_sheet)
                            }
                            disabled={isLinking}
                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            Tautkan Data Ini
                          </button>
                        )}
                      </div>
                      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {(() => {
                          let nama = "-";
                          let email = "-";
                          let telepon = "-";
                          let posisi = "-";

                          Object.entries(data).forEach(([key, val]) => {
                            if (
                              typeof val !== "string" &&
                              typeof val !== "number"
                            )
                              return;
                            const lowerKey = key.toLowerCase();
                            const strVal = String(val);

                            if (
                              (lowerKey.includes("nama") ||
                                lowerKey.includes("name")) &&
                              nama === "-"
                            )
                              nama = strVal;
                            else if (
                              (lowerKey.includes("email") ||
                                lowerKey.includes("e-mail")) &&
                              email === "-"
                            )
                              email = strVal;
                            else if (
                              (lowerKey.includes("telepon") ||
                                lowerKey.includes("phone") ||
                                lowerKey.includes("hp") ||
                                lowerKey.includes("whatsapp")) &&
                              telepon === "-"
                            )
                              telepon = strVal;
                            else if (
                              (lowerKey.includes("posisi") ||
                                lowerKey.includes("position") ||
                                lowerKey.includes("jabatan") ||
                                lowerKey.includes("melamar")) &&
                              posisi === "-"
                            )
                              posisi = strVal;
                          });

                          const previewFields = [
                            { label: "Nama", value: nama },
                            { label: "Email", value: email },
                            { label: "Nomor Telepon", value: telepon },
                            { label: "Posisi yang Dilamar", value: posisi },
                          ];

                          return previewFields.map((field, i) => (
                            <div key={i} className="text-sm">
                              <span className="font-medium text-slate-500 block text-xs uppercase tracking-wider mb-0.5">
                                {field.label}
                              </span>
                              <span className="text-slate-800 whitespace-pre-wrap">
                                {field.value}
                              </span>
                            </div>
                          ));
                        })()}
                        {Object.keys(data).filter((k) => k !== "uid_sheet")
                          .length > 4 && (
                          <div className="text-xs text-indigo-600 font-medium italic mt-2">
                            +{" "}
                            {Object.keys(data).filter((k) => k !== "uid_sheet")
                              .length - 4}{" "}
                            field lainnya
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
                <p className="text-sm text-slate-500 font-medium">
                  Tidak ada data eksternal yang cocok
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Sistem tidak menemukan data dengan email, nomor telepon, atau
                  nama yang sama.
                </p>
              </div>
            )}
          </div>

          {/* Internal Notes */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-slate-300 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Catatan Internal
              </h3>
            </div>

            <div className="space-y-4">
              {/* Note input area */}
              {!isArchived && (
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
                        className="px-4 py-2 bg-[#3D2C44] text-white text-sm font-bold rounded-xl hover:bg-[#3D2C44]/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                      >
                        {isAddingNote ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Save size={16} />
                        )}
                        Simpan Catatan
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes list */}
              <div className="space-y-4 mt-6">
                {loadingNotes ? (
                  <div className="flex justify-center py-4">
                    <Loader2
                      size={24}
                      className="animate-spin text-indigo-600"
                    />
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                    <p className="text-slate-500 font-medium">
                      Belum ada catatan internal
                    </p>
                  </div>
                ) : (
                  notes.map((note) => (
                    <div
                      key={note.id}
                      className="flex gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100"
                    >
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {note.author?.avatar_url ? (
                          <img
                            src={note.author.avatar_url}
                            alt={note.author.full_name || "User"}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <User size={20} className="text-slate-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-bold text-slate-900 text-sm">
                            {note.author?.full_name || "Unknown User"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(note.created_at)}
                          </p>
                        </div>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {note.note_text}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Interview Evaluations */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-fuchsia-300 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileText className="text-indigo-500" size={20} />
                Hasil Interview
              </h3>
              {["accepted", "hired"].includes(candidate.status_screening) &&
                !isArchived && (
                  <button
                    onClick={() => {
                      setExistingEvaluation(null);
                      setIsEvaluationModalOpen(true);
                    }}
                    className="px-4 py-2 bg-[#3D2C44]/10 text-[#3D2C44] hover:bg-[#3D2C44]/20 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <PlusCircle size={16} />
                    Input Hasil
                  </button>
                )}
            </div>

            {interviewEvaluations.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  Belum ada hasil interview
                </p>
                {["accepted", "hired"].includes(candidate.status_screening) ? (
                  <p className="text-sm text-slate-400 mt-1">
                    Klik tombol "Input Hasil" untuk menambahkan penilaian.
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 mt-1">
                    Kandidat harus diterima (Lolos Screening) terlebih dahulu
                    untuk mengisi evaluasi.
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {interviewEvaluations.map((evalItem) => (
                  <div
                    key={evalItem.id}
                    className="border border-slate-200 rounded-xl overflow-hidden"
                  >
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-bold tracking-wider",
                            evalItem.evaluation_type === "HR"
                              ? "bg-[#3D2C44]/10 text-[#3D2C44]"
                              : "bg-violet-100 text-violet-700",
                          )}
                        >
                          {evalItem.evaluation_type}
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {evalItem.template?.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            Oleh: {evalItem.interviewer_name} •{" "}
                            {formatDate(evalItem.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">
                            Total Skor
                          </p>
                          <p className="text-lg font-black text-indigo-600">
                            {evalItem.total_score}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleEvaluation(evalItem.id)}
                            className="p-2 text-slate-400 hover:text-[#3D2C44] hover:bg-[#3D2C44]/10 rounded-lg transition-colors"
                            title={
                              expandedEvaluations.includes(evalItem.id)
                                ? "Tutup Preview"
                                : "Buka Preview"
                            }
                          >
                            {expandedEvaluations.includes(evalItem.id) ? (
                              <ChevronUp size={18} />
                            ) : (
                              <ChevronDown size={18} />
                            )}
                          </button>
                          {!isArchived &&
                            evalItem.evaluator_id === profile?.id && (
                              <button
                                onClick={() => {
                                  setExistingEvaluation(evalItem);
                                  setIsEvaluationModalOpen(true);
                                }}
                                className="p-2 text-slate-400 hover:text-[#3D2C44] hover:bg-[#3D2C44]/10 rounded-lg transition-colors"
                                title="Edit Penilaian"
                              >
                                <Edit2 size={18} />
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                    {expandedEvaluations.includes(evalItem.id) && (
                      <div className="p-4 bg-white border-b border-slate-100">
                        {(evalItem.template?.form_schema as any)?.categories?.map(
                          (category: any, catIdx: number) => (
                            <div key={catIdx} className="mb-6 last:mb-0">
                              <h4 className="font-bold text-slate-800 mb-3 pb-2 border-b border-slate-100">
                                {category.name}
                              </h4>
                              <div className="space-y-3">
                                {category.criteria.map((crit: any, critIdx: number) => {
                                  const score =
                                    evalItem.evaluation_data[
                                      `cat_${catIdx}_crit_${critIdx}`
                                    ];
                                  const scaleItem =
                                    (evalItem.template?.form_schema as any)?.scale?.find(
                                      (s: any) => s.score === score,
                                    );
                                  return (
                                    <div
                                      key={critIdx}
                                      className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm bg-slate-50 p-3 rounded-lg"
                                    >
                                      <span className="text-slate-700 font-medium">
                                        {crit.name}
                                      </span>
                                      <div className="flex items-center gap-3 shrink-0">
                                        {scaleItem && (
                                          <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md">
                                            {scaleItem.label}
                                          </span>
                                        )}
                                        <span className="font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-md min-w-[40px] text-center">
                                          {score || "-"}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ),
                        )}
                        {evalItem.notes && (
                          <div className="mt-6 pt-4 border-t border-slate-200">
                            <h4 className="font-bold text-slate-800 mb-2 text-sm flex items-center gap-2">
                              <FileText size={16} className="text-slate-400" />
                              Catatan Tambahan
                            </h4>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap bg-amber-50 p-4 rounded-xl border border-amber-100">
                              {evalItem.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="p-4 bg-white">
                      {/* Display Summary Fields if they exist */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {Object.entries(evalItem.evaluation_data)
                          .filter(([key]) => key.startsWith("summary_"))
                          .map(([key, value]) => {
                            const fieldName = key.replace("summary_", "");
                            const valStr = String(value);
                            const valLower = valStr.toLowerCase().trim();

                            let highlightClass =
                              "text-sm text-slate-700 whitespace-pre-wrap";
                            if (
                              valLower === "not recommended" ||
                              valLower === "ditolak"
                            ) {
                              highlightClass =
                                "text-sm font-bold text-red-600 bg-red-50 px-2 py-1 rounded inline-block whitespace-pre-wrap";
                            } else if (valLower === "to be considered") {
                              highlightClass =
                                "text-sm font-bold text-yellow-600 bg-yellow-50 px-2 py-1 rounded inline-block whitespace-pre-wrap";
                            } else if (
                              valLower === "recommended" ||
                              valLower === "diterima"
                            ) {
                              highlightClass =
                                "text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded inline-block whitespace-pre-wrap";
                            }

                            const isObject =
                              typeof value === "object" && value !== null;
                            const isScoring =
                              isObject &&
                              !(
                                Object.keys(value).every(
                                  (k) => !isNaN(Number(k)),
                                ) || Array.isArray(value)
                              );

                            return (
                              <div
                                key={key}
                                className={`space-y-2 bg-slate-50 border border-slate-100 rounded-xl p-4 ${isScoring ? "col-span-1 md:col-span-2" : ""}`}
                              >
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                                  {fieldName}
                                </p>
                                {isObject ? (
                                  !isScoring ? (
                                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                                      {Object.values(value).map((v, i) => (
                                        <li key={i}>{String(v)}</li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                      {Object.entries(value)
                                        .filter(
                                          ([, v]) =>
                                            !isNaN(Number(v)) &&
                                            String(v).trim() !== "",
                                        )
                                        .map(([k, v]) => {
                                          return {
                                            score: Number(v),
                                            label: String(k),
                                            originalKey: k,
                                          };
                                        })
                                        .sort((a, b) => {
                                          if (isNaN(a.score)) return 1;
                                          if (isNaN(b.score)) return -1;
                                          return a.score - b.score;
                                        })
                                        .map((item) => (
                                          <div
                                            key={item.originalKey}
                                            className="flex items-start gap-3 text-sm text-slate-700 bg-white border border-slate-200 p-3 rounded-lg shadow-sm font-medium h-full break-words"
                                          >
                                            <div className="min-w-[32px] w-8 h-8 rounded border border-indigo-100 bg-indigo-50 flex items-center justify-center font-bold text-indigo-700 shrink-0 mt-0.5">
                                              {item.score}
                                            </div>
                                            <span className="flex-1 leading-snug pt-1.5 break-words whitespace-normal break-all sm:break-normal">
                                              {item.label}
                                            </span>
                                          </div>
                                        ))}
                                    </div>
                                  )
                                ) : (
                                  <div className={highlightClass}>
                                    {valStr || "-"}
                                  </div>
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

          {/* Reference Check */}
          {canSeeReferenceCheck && (
            <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-fuchsia-300 shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="text-fuchsia-500" size={20} />
                  Reference Check
                </h3>
                {isHrAdmin && !isArchived && (
                  <button
                    onClick={() => {
                      setExistingReferenceCheck(null);
                      setIsReferenceCheckModalOpen(true);
                    }}
                    className="px-4 py-2 bg-fuchsia-50 text-fuchsia-700 hover:bg-fuchsia-100 rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
                  >
                    <PlusCircle size={16} />
                    Isi Reference Check
                  </button>
                )}
              </div>

              {referenceChecks.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                  <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">
                    Belum ada reference check.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {referenceChecks.map((evalItem) => {
                    const rcData = evalItem.evaluation_data as any;
                    const schema = evalItem.template?.form_schema as any;
                    return (
                      <div
                        key={evalItem.id}
                        className="border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">
                              Checked by: {evalItem.interviewer_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              Tanggal: {rcData?.checked_date ? formatDate(rcData.checked_date) : "-"}
                            </p>
                          </div>
                          {isHrAdmin &&
                            !isArchived &&
                            evalItem.evaluator_id === profile?.id && (
                              <button
                                onClick={() => {
                                  setExistingReferenceCheck(evalItem);
                                  setIsReferenceCheckModalOpen(true);
                                }}
                                className="p-2 text-slate-400 hover:text-[#3D2C44] hover:bg-[#3D2C44]/10 rounded-lg transition-colors"
                                title="Edit Reference Check"
                              >
                                <Edit2 size={18} />
                              </button>
                            )}
                        </div>
                        <div className="p-4 bg-white space-y-4 text-sm">
                          {schema?.two_column?.rows?.map((row: any) => (
                            <div key={row.key} className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-slate-100 pb-2 last:border-0">
                              <span className="font-medium text-slate-700">{row.label}</span>
                              <span className="text-slate-600">{rcData?.applicant?.[row.key] || "-"}</span>
                              <span className="text-slate-600">{rcData?.reference?.[row.key] || "-"}</span>
                            </div>
                          ))}
                          {schema?.single_column?.rows?.map((row: any) => (
                            <div key={row.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-b border-slate-100 pb-2 last:border-0">
                              <span className="font-medium text-slate-700">{row.label}</span>
                              <span className="text-slate-600">{rcData?.referee_comments?.[row.key] || "-"}</span>
                            </div>
                          ))}
                          {rcData?.additional_comments && (
                            <div className="pt-2">
                              <p className="font-medium text-slate-700 mb-1">Additional Comments</p>
                              <p className="text-slate-600 whitespace-pre-wrap bg-amber-50 p-3 rounded-xl border border-amber-100">
                                {rcData.additional_comments}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Schedules */}
          <div className="bg-white rounded-2xl border border-slate-200 border-l-4 border-l-amber-300 shadow-sm p-6">
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
                  {candidate.psikotes_schedules &&
                  candidate.psikotes_schedules.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {candidate.psikotes_schedules.map((schedule, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm"
                        >
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
                    <p className="text-sm text-slate-500 mt-1">
                      Status:{" "}
                      <span className="font-medium text-slate-700">
                        {candidate.psikotes_status}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500 mt-1">
                      Belum ada jadwal psikotes.
                    </p>
                  )}
                </div>
              </div>

              {(() => {
                const isUserInterview = (s: any) => s.additional_notes?.startsWith("[USER]");
                const hcSchedules = (candidate.interview_schedules || []).filter((s: any) => !isUserInterview(s));
                const userSchedules = (candidate.interview_schedules || []).filter((s: any) => isUserInterview(s));
                const hasAnySchedules = (candidate.interview_schedules || []).length > 0;

                const renderInterviewGroup = (label: string, colorClass: string, schedules: any[]) => (
                  <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0", colorClass)}>
                      <Users size={18} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-900 text-sm">{label}</h4>
                      {schedules.length > 0 ? (
                        <div className="mt-2 space-y-2">
                          {schedules.map((schedule, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
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
                      ) : (
                        <p className="text-sm text-slate-500 mt-1">
                          Belum ada jadwal {label.toLowerCase()}.
                        </p>
                      )}
                    </div>
                  </div>
                );

                return (
                  <>
                    {!hasAnySchedules && candidate.interview_status && (
                      <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50">
                        <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                          <Users size={18} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-900 text-sm">Interview</h4>
                          <p className="text-sm text-slate-500 mt-1">
                            Status:{" "}
                            <span className="font-medium text-slate-700">
                              {candidate.interview_status}
                            </span>
                          </p>
                        </div>
                      </div>
                    )}
                    {renderInterviewGroup("Interview HC", "bg-violet-100 text-violet-600", hcSchedules)}
                    {renderInterviewGroup("Interview User", "bg-sky-100 text-sky-600", userSchedules)}
                  </>
                );
              })()}
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
        isAssignedToMe={
          candidate?.candidate_assignees?.some(
            (a: any) => a.user_id === profile?.id,
          ) || false
        }
      />

      <ReferenceCheckModal
        isOpen={isReferenceCheckModalOpen}
        onClose={() => {
          setIsReferenceCheckModalOpen(false);
          setExistingReferenceCheck(null);
        }}
        candidateId={id!}
        candidateFullName={candidate?.full_name || ""}
        onSuccess={() => fetchEvaluations(id!)}
        existingEvaluation={existingReferenceCheck}
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
                <p className="text-sm text-slate-500 mt-1">
                  Review, edit, atau hapus pertanyaan yang dihasilkan AI sebelum
                  disimpan.
                </p>
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
                <div
                  key={index}
                  className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm relative group"
                >
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
                      <Sparkles
                        size={16}
                        className="text-indigo-400 shrink-0 mt-0.5"
                      />
                      <p className="italic">{q.reasoning}</p>
                    </div>
                  )}
                </div>
              ))}

              <button
                onClick={() => {
                  setGeneratedQuestions([
                    ...generatedQuestions,
                    {
                      category: "Technical",
                      question: "",
                      reasoning: "Ditambahkan manual oleh HR.",
                    },
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
                className="px-6 py-2.5 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveInterviewQuestions}
                className="px-6 py-2.5 text-sm font-bold text-white bg-[#3D2C44] hover:bg-[#3D2C44]/90 rounded-xl transition-colors shadow-sm flex items-center gap-2"
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
              <ApplicationForm
                readOnly
                initialData={fullScreenData}
                hideSalary={hideSalary}
              />
            </div>
          </div>
        </div>
      )}

      {isApprovalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Users size={20} className="text-[#3D2C44]" />
                Status Approval & Review
              </h3>
              <button
                onClick={() => setIsApprovalModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Approval Status Card */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800 mb-3">Status Approval Manajemen</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Director Approval */}
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Direktur</p>
                      <span className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-md",
                        candidate.director_status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                        candidate.director_status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                        candidate.director_status === 'hold' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-200 text-slate-700'
                      )}>
                        {(candidate.director_status || 'pending').toUpperCase()}
                      </span>
                    </div>
                    {isDirector && (
                      <div className="flex gap-1.5 mt-3 pt-3 border-t border-slate-200">
                        <button onClick={() => handleUpdateApproval('accepted')} disabled={isUpdatingApproval} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors shadow-sm text-xs font-semibold disabled:opacity-50"><ThumbsUp size={14} /> Terima</button>
                        <button onClick={() => handleUpdateApproval('hold')} disabled={isUpdatingApproval} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-amber-200 text-amber-600 hover:bg-amber-50 rounded-md transition-colors shadow-sm text-xs font-semibold disabled:opacity-50"><Clock size={14} /> Hold</button>
                        <button onClick={() => handleUpdateApproval('rejected')} disabled={isUpdatingApproval} className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-md transition-colors shadow-sm text-xs font-semibold disabled:opacity-50"><ThumbsDown size={14} /> Tolak</button>
                      </div>
                    )}
                  </div>

                  {/* Finance Director Approval */}
                  <div className="p-4 bg-slate-50 border border-slate-100 rounded-lg">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Finance Director</p>
                      <span className={cn(
                        "px-2.5 py-1 text-xs font-bold rounded-md",
                        candidate.finance_status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                        candidate.finance_status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                        'bg-slate-200 text-slate-700'
                      )}>
                        {(candidate.finance_status || 'pending').toUpperCase()}
                      </span>
                    </div>
                    {isFinanceDirector && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                        {candidate.director_status !== 'accepted' && (
                          <p className="text-[11px] text-amber-600 font-medium">Menunggu approval Direktur terlebih dahulu.</p>
                        )}
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleUpdateApproval('accepted')}
                            disabled={isUpdatingApproval || candidate.director_status !== 'accepted'}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors shadow-sm text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ThumbsUp size={14} /> Terima
                          </button>
                          <button
                            onClick={() => handleUpdateApproval('rejected')}
                            disabled={isUpdatingApproval || candidate.director_status !== 'accepted'}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-md transition-colors shadow-sm text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ThumbsDown size={14} /> Tolak
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-slate-900">
                Assign Kandidat ke User
              </h3>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <p className="text-sm text-slate-600">
                Pilih siapa saja yang akan me-review kandidat ini. User yang
                dipilih akan dapat melihat profil kandidat ini di halaman
                mereka.
              </p>

              {(() => {
                const picOptions = managers.filter(
                  (m) => m.role !== "DIRECTOR" && m.role !== "FINANCE_DIRECTOR",
                );
                const directorOptions = managers.filter(
                  (m) => m.role === "DIRECTOR",
                );
                const financeOptions = managers.filter(
                  (m) => m.role === "FINANCE_DIRECTOR",
                );
                const selectedPicIds = selectedManagers.filter((mid) =>
                  picOptions.some((m) => m.id === mid),
                );
                const selectedDirectorId =
                  selectedManagers.find((mid) =>
                    directorOptions.some((m) => m.id === mid),
                  ) || "";
                const selectedFinanceId =
                  selectedManagers.find((mid) =>
                    financeOptions.some((m) => m.id === mid),
                  ) || "";

                const replaceSingleSelection = (
                  options: any[],
                  newId: string,
                ) => {
                  setSelectedManagers((prev) => {
                    const withoutRole = prev.filter(
                      (mid) => !options.some((m) => m.id === mid),
                    );
                    return newId ? [...withoutRole, newId] : withoutRole;
                  });
                };

                return (
                  <>
                    {/* PIC User Manager */}
                    <div className="space-y-3">
                      <label className="block text-sm font-bold text-slate-700">
                        PIC User Manager
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {selectedPicIds.map((userId) => {
                          const user = managers.find((u) => u.id === userId);
                          return (
                            <div
                              key={userId}
                              className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-lg text-sm font-medium border border-indigo-100"
                            >
                              <span>{user?.full_name || "Unknown User"}</span>
                              <button
                                onClick={() =>
                                  setSelectedManagers((prev) =>
                                    prev.filter((id) => id !== userId),
                                  )
                                }
                                className="p-0.5 hover:bg-indigo-200 rounded-md transition-colors ml-1"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <select
                        value=""
                        onChange={(e) => {
                          if (
                            e.target.value &&
                            !selectedManagers.includes(e.target.value)
                          ) {
                            setSelectedManagers((prev) => [
                              ...prev,
                              e.target.value,
                            ]);
                          }
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">-- Tambah PIC --</option>
                        {picOptions
                          .filter((m) => !selectedManagers.includes(m.id))
                          .map((manager) => (
                            <option key={manager.id} value={manager.id}>
                              {manager.full_name}{" "}
                              {manager.department
                                ? `(${manager.department})`
                                : ""}
                            </option>
                          ))}
                      </select>
                    </div>

                    {/* Direktur */}
                    <div className="space-y-3">
                      <label className="block text-sm font-bold text-slate-700">
                        Direktur
                      </label>
                      <select
                        value={selectedDirectorId}
                        onChange={(e) =>
                          replaceSingleSelection(
                            directorOptions,
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">-- Belum ditentukan --</option>
                        {directorOptions.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.full_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Direktur Finance */}
                    <div className="space-y-3">
                      <label className="block text-sm font-bold text-slate-700">
                        Direktur Finance
                      </label>
                      <select
                        value={selectedFinanceId}
                        onChange={(e) =>
                          replaceSingleSelection(
                            financeOptions,
                            e.target.value,
                          )
                        }
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="">-- Belum ditentukan --</option>
                        {financeOptions.map((manager) => (
                          <option key={manager.id} value={manager.id}>
                            {manager.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="px-4 py-2 text-rose-600 bg-rose-50 border border-rose-200 font-medium hover:bg-rose-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleAssign}
                disabled={assigning}
                className="px-4 py-2 bg-[#3D2C44] text-white font-medium rounded-xl hover:bg-[#3D2C44]/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {assigning ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Assign Kandidat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
