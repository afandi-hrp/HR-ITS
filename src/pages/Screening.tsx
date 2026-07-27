import React, { useState, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Candidate } from "../types";
import { formatAsNumberedList, formatLevelAndList } from "../lib/cvSummaryFormat";
import {
  Search,
  Filter,
  FilterX,
  RefreshCcw,
  Send,
  FolderInput,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Mail,
  Phone,
  GraduationCap,
  Briefcase,
  Star,
  AlertTriangle,
  Lightbulb,
  FileText,
  Users,
  CheckCircle,
  Calendar as CalendarIcon,
  ThumbsUp,
  ThumbsDown,
  X,
  LayoutList,
  LayoutGrid,
  Loader2,
  MessageCircle,
  CheckCheck,
  ClipboardCheck,
  CalendarClock,
} from "lucide-react";
import { cn, formatDate, fetchWithRetry, extractPhotoUrl } from "../lib/utils";
import { useToast } from "../components/ui/use-toast";

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../components/ui/popover";
import SchedulingModal from "../components/SchedulingModal";
import SendEmailModal from "../components/SendEmailModal";
import SendWAModal from "../components/SendWAModal";
import ConfirmModal from "../components/ConfirmModal";

const PIPELINE_STATUS_OPTIONS = [
  "Inbox",
  "Belum Diproses",
  "Lolos",
  "Jadwal Psikotes",
  "Psikotes Selesai",
  "Jadwal Interview HC",
  "Interview Selesai HC",
  "Jadwal Interview User",
  "Interview Selesai User",
  "Reference Check",
  "Rejected",
  "Hired",
];

export default function Screening() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = location.state?.highlightId;
  const [blinkingId, setBlinkingId] = useState<string | null>(null);
  const [expandedCandidates, setExpandedCandidates] = useState<string[]>([]);

  useEffect(() => {
    if (highlightId) {
      setBlinkingId(highlightId);
      setExpandedCandidates((prev) =>
        prev.includes(highlightId) ? prev : [...prev, highlightId],
      );

      const timer = setTimeout(() => {
        setBlinkingId(null);
      }, 5000);

      setTimeout(() => {
        document
          .getElementById(`candidate-${highlightId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [positionFilter, setPositionFilter] = useState(searchParams.get("position") || "all");
  const [positionStatusFilters, setPositionStatusFilters] = useState<Record<string, string>>(() => {
    const pos = searchParams.get("selectedPosition");
    const sub = searchParams.get("subStatus");
    if (pos && sub) return { [pos]: sub };
    return {};
  });
  const [openPositions, setOpenPositions] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [isStatusExpanded, setIsStatusExpanded] = useState(true);
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedPosition, setSelectedPosition] = useState<string | null>(searchParams.get("selectedPosition") || null);
  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    
    if (search) params.set("q", search);
    else params.delete("q");
    
    if (statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");
    
    if (positionFilter !== "all") params.set("position", positionFilter);
    else params.delete("position");
    
    if (startDate) params.set("startDate", startDate);
    else params.delete("startDate");
    
    if (endDate) params.set("endDate", endDate);
    else params.delete("endDate");
    
    if (currentPage !== 1) params.set("page", currentPage.toString());
    else params.delete("page");
    
    if (selectedPosition) {
      params.set("selectedPosition", selectedPosition);
      if (positionStatusFilters[selectedPosition] && positionStatusFilters[selectedPosition] !== "Inbox") {
        params.set("subStatus", positionStatusFilters[selectedPosition]);
      } else {
        params.delete("subStatus");
      }
    } else {
      params.delete("selectedPosition");
      params.delete("subStatus");
    }

    const currentParams = searchParams.toString();
    const newParams = params.toString();
    if (currentParams !== newParams) {
      setSearchParams(params, { replace: true });
    }
  }, [search, statusFilter, positionFilter, startDate, endDate, currentPage, selectedPosition, positionStatusFilters, setSearchParams]);
  const [schedulingData, setSchedulingData] = useState<{
    candidate: Candidate;
    type: "psikotes" | "interview";
  } | null>(null);
  const [commsModalData, setCommsModalData] = useState<{
    candidate: Candidate;
    schedule: any;
    type: "psikotes" | "interview";
    channel: "email" | "wa";
  } | null>(null);
  const [confirmScheduleData, setConfirmScheduleData] = useState<{
    table: "psikotes_schedules" | "interview_schedules";
    scheduleId: string;
    label: string;
  } | null>(null);
  const [confirmingSchedule, setConfirmingSchedule] = useState(false);
  const [logModalData, setLogModalData] = useState<Candidate | null>(null);
  const [logNotes, setLogNotes] = useState("");
  const [movingToLog, setMovingToLog] = useState(false);
  const [rejectModalData, setRejectModalData] = useState<Candidate | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejectCcEmail, setRejectCcEmail] = useState("");
  const [sendRejectEmail, setSendRejectEmail] = useState(false);
  const [addToBlacklist, setAddToBlacklist] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState("");
  const [rejectEmailTemplates, setRejectEmailTemplates] = useState<any[]>([]);
  const [selectedRejectTemplate, setSelectedRejectTemplate] = useState("");
  const [acceptModalData, setAcceptModalData] = useState<Candidate | null>(
    null,
  );
  const [hireModalData, setHireModalData] = useState<Candidate | null>(null);
  const [hireNotes, setHireNotes] = useState("");
  const [hiring, setHiring] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [assessmentModalData, setAssessmentModalData] =
    useState<Candidate | null>(null);
  const [assessmentScores, setAssessmentScores] = useState({
    technical_score: 0,
    communication_score: 0,
    problem_solving_score: 0,
    teamwork_score: 0,
    leadership_score: 0,
    adaptability_score: 0,
  });
  const [savingAssessment, setSavingAssessment] = useState(false);
  const { toast } = useToast();

  const [sortOption, setSortOption] = useState<"skor" | "interview" | "psikotes" | "terbaru">("terbaru");

  const [totalItems, setTotalItems] = useState(0);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const fetchUserAndProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          try {
            const { data } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", user.id)
              .single();
            if (data) setProfile(data);
          } catch (err) {
            console.warn("Failed to get profile:", err);
          }
        }
      } catch (err) {
        console.warn("Failed to get user:", err);
      }
    };
    fetchUserAndProfile();
  }, []);

  const isFirstRender = React.useRef(true);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      if (isFirstRender.current) {
        isFirstRender.current = false;
      } else {
        setCurrentPage(1); // Reset to page 1 on search
      }
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchCandidates = async () => {
    if (!profile) return; // Wait for profile to load

    setLoading(true);
    const scheduleColumns =
      "id, is_confirmed, schedule_date, location_type, location_detail, additional_notes, candidate_id, created_at, updated_at";
    let selectQuery =
      `*, psikotes_schedules(${scheduleColumns}), interview_schedules(${scheduleColumns}), candidate_evaluations(evaluation_type), external_data(raw_data), candidate_assignees(user_id, profiles(full_name))`;

    if (profile.role === "USER_MANAGER" || profile.role === "DIRECTOR" || profile.role === "FINANCE_DIRECTOR") {
      selectQuery =
        `*, psikotes_schedules(${scheduleColumns}), interview_schedules(${scheduleColumns}), candidate_evaluations(evaluation_type), external_data(raw_data), filter_assignees:candidate_assignees!inner(user_id), candidate_assignees(user_id, profiles(full_name))`;
    }

    let query = supabase
      .from("candidates")
      .select(selectQuery, { count: "exact" })
      .order("updated_at", { ascending: false });

    if (profile.role === "USER_MANAGER" || profile.role === "DIRECTOR" || profile.role === "FINANCE_DIRECTOR") {
      query = query.eq("filter_assignees.user_id", profile.id);
    }

    if (debouncedSearch) {
      query = query.or(
        `full_name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%`,
      );
    }
    if (startDate) {
      query = query.gte("date", `${startDate}T00:00:00`);
    }
    if (endDate) {
      query = query.lte("date", `${endDate}T23:59:59`);
    }
    if (statusFilter !== "all") {
      query = query.eq("status_screening", statusFilter);
    }
    if (positionFilter !== "all") {
      query = query.eq("position", positionFilter);
    }

    // Apply pagination (Moved to frontend for grouping/filtering)
    // const from = (currentPage - 1) * itemsPerPage;
    // const to = from + itemsPerPage - 1;
    // query = query.range(from, to);

    let { data, count, error } = await query.limit(2000);
    let typedData = data as any[] | null;

    // Handle array case if relationship returns an array
    if (typedData && !error) {
      typedData = typedData.map((d) => {
        if (Array.isArray(d.external_data) && d.external_data.length > 0) {
          return { ...d, external_data: d.external_data[0] };
        }
        return d;
      });

      try {
        const { data: blacklistData } = await supabase
          .from("blacklisted_candidates")
          .select("email, phone, identity_number, reason");

        if (blacklistData && blacklistData.length > 0) {
          typedData = typedData.map((d) => {
            const nik = d.external_data?.raw_data?.identity_number;
            const blacklistedRecord = blacklistData.find(
              (b) =>
                (b.email && b.email === d.email) ||
                (b.phone && b.phone === d.phone) ||
                (nik && b.identity_number && b.identity_number === nik),
            );
            return {
              ...d,
              is_blacklisted: !!blacklistedRecord,
              blacklist_reason: blacklistedRecord?.reason,
            };
          });
        }
      } catch (err) {
        console.error("Error fetching blacklist:", err);
      }
    }

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setCandidates(typedData || []);
      setTotalItems(count || 0);
      // Expand all groups by default
      const positions = Array.from(
        new Set((typedData || []).map((c) => c.position)),
      );
      setExpandedGroups(positions);
    }
    setLoading(false);
  };

  const fetchOpenPositions = async () => {
    try {
      const { data, error } = await supabase
        .from("open_recruitment")
        .select("position")
        .eq("is_published", true);

      if (!error && data) {
        const positions = Array.from(
          new Set(data.map((d) => d.position).filter(Boolean)),
        );
        setOpenPositions(positions);
      }
    } catch (err) {
      console.error("Error fetching open positions:", err);
    }
  };

  useEffect(() => {
    fetchOpenPositions();
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [
    startDate,
    endDate,
    debouncedSearch,
    currentPage,
    itemsPerPage,
    statusFilter,
    positionFilter,
    profile,
  ]);

  const confirmScheduleDone = async () => {
    if (!confirmScheduleData) return;
    setConfirmingSchedule(true);
    try {
      const { error } = await supabase
        .from(confirmScheduleData.table)
        .update({ is_confirmed: true })
        .eq("id", confirmScheduleData.scheduleId);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Jadwal telah dikonfirmasi selesai.",
      });
      setConfirmScheduleData(null);
      fetchCandidates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setConfirmingSchedule(false);
    }
  };

  const confirmReject = async () => {
    if (!rejectModalData) return;

    if (addToBlacklist && !blacklistReason.trim()) {
      toast({
        title: "Validasi Gagal",
        description:
          "Harap isi alasan detail saat menambahkan kandidat ke blacklist.",
        variant: "destructive",
      });
      return;
    }

    setRejecting(true);
    try {
      // Set status to rejected first so it's recorded as rejected in the log
      const { error: updateError } = await supabase
        .from("candidates")
        .update({ 
          status_screening: "rejected",
          updated_at: new Date().toISOString()
        })
        .eq("id", rejectModalData.id);

      if (updateError) throw updateError;

      // Then move to log
      const response = await fetchWithRetry("/api/candidates/move-to-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: rejectModalData.id,
          notes: rejectReason.trim() || "Ditolak pada tahap Screening Awal",
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({
          title: "Berhasil",
          description: `Kandidat ${rejectModalData.full_name} telah ditolak dan dipindahkan ke Candidate Archive.`,
        });

        if (sendRejectEmail && selectedRejectTemplate) {
          try {
            const template = rejectEmailTemplates.find(
              (t) => t.id === selectedRejectTemplate,
            );
            if (template) {
              const {
                data: { session },
              } = await supabase.auth.getSession();

              const replaceVars = (text: string) => {
                if (!text) return "";
                return text
                  .replace(/{{nama}}/g, rejectModalData.full_name || "")
                  .replace(/{{email_kandidat}}/g, rejectModalData.email || "")
                  .replace(/{{posisi}}/g, rejectModalData.position || "")
                  .replace(
                    /{{pendidikan_terakhir}}/g,
                    rejectModalData.education || "-",
                  )
                  .replace(
                    /{{pengalaman_kerja}}/g,
                    rejectModalData.work_experience || "-",
                  );
              };

              const processedSubject = replaceVars(template.subject);
              const processedBody = replaceVars(template.body_html);

              const n8nResponse = await fetchWithRetry("/api/n8n/trigger", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${session?.access_token}`,
                },
                body: JSON.stringify({
                  type: "email",
                  payload: {
                    event: "send_rejection",
                    type: "rejection",
                    candidate: {
                      id: rejectModalData.id,
                      full_name: rejectModalData.full_name,
                      email: rejectModalData.email,
                      position: rejectModalData.position,
                    },
                    email: {
                      subject: processedSubject,
                      body: processedBody,
                      body_html: processedBody
                        .replace(/\*(.*?)\*/g, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>")
                        .replace(/ {2}/g, "&nbsp;&nbsp;"),
                      cc: rejectCcEmail || undefined,
                    },
                    sender: {
                      name: profile?.full_name || "HR Team",
                    },
                  },
                }),
              });

              if (!n8nResponse.ok) {
                toast({
                  title: "Peringatan",
                  description:
                    "Kandidat ditolak, tapi email penolakan gagal terkirim.",
                  variant: "destructive",
                });
              } else {
                toast({
                  title: "Email Terkirim",
                  description:
                    "Email penolakan otomatis berhasil dikirim ke kandidat.",
                });
              }
            }
          } catch (err: any) {
            toast({
              title: "Error Email",
              description: err.message || "Gagal memproses email penolakan",
              variant: "destructive",
            });
          }
        }

        if (addToBlacklist) {
          try {
            const { error: blacklistError } = await supabase
              .from("blacklisted_candidates")
              .insert({
                email: rejectModalData.email,
                phone: rejectModalData.phone,
                identity_number:
                  rejectModalData.external_data?.raw_data?.identity_number,
                reason:
                  blacklistReason.trim() ||
                  "Ditolak dan di-blacklist pada tahap Screening Awal",
              });
            if (blacklistError)
              console.error("Gagal menambahkan ke blacklist:", blacklistError);
            else
              toast({
                title: "Blacklist",
                description:
                  "Kandidat berhasil ditambahkan ke daftar Blacklist.",
              });
          } catch (err) {
            console.error("Error inserting to blacklist:", err);
          }
        }

        setCandidates(candidates.filter((c) => c.id !== rejectModalData.id));
        setRejectModalData(null);
        setRejectReason("");
        setRejectCcEmail("");
        setAddToBlacklist(false);
        setBlacklistReason("");
      } else {
        throw new Error(result.error || "Gagal memindahkan kandidat");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  };

  const handleUpdateStatus = async (
    candidateId: string,
    status: "accepted" | "rejected" | "hired",
  ) => {
    if (status === "rejected") {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (candidate) {
        setRejectModalData(candidate);
        setSendRejectEmail(false);
        setSelectedRejectTemplate("");
        const fetchTemplates = async () => {
          try {
            const { data } = await supabase
              .from("email_templates")
              .select("*")
              .order("created_at", { ascending: false });
            if (data) setRejectEmailTemplates(data);
          } catch (err) {
            console.warn("Failed to fetch templates:", err);
          }
        };
        fetchTemplates();
      }
      return;
    }

    if (status === "hired") {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (candidate) {
        setHireModalData(candidate);
      }
      return;
    }

    if (status === "accepted") {
      const candidate = candidates.find((c) => c.id === candidateId);
      if (candidate) {
        setAcceptModalData(candidate);
      }
      return;
    }
  };

  const confirmAccept = async () => {
    if (!acceptModalData) return;

    setAccepting(true);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({ 
          status_screening: "accepted",
          updated_at: new Date().toISOString()
        })
        .eq("id", acceptModalData.id);

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Berhasil",
          description: `Status kandidat ${acceptModalData.full_name} diperbarui menjadi Diterima (Lolos Screening).`,
        });
        fetchCandidates();
        setAcceptModalData(null);
      }
    } finally {
      setAccepting(false);
    }
  };

  const confirmHire = async () => {
    if (!hireModalData) return;

    setHiring(true);
    try {
      // Set status to hired first
      const { error: updateError } = await supabase
        .from("candidates")
        .update({ 
          status_screening: "hired",
          updated_at: new Date().toISOString()
        })
        .eq("id", hireModalData.id);

      if (updateError) throw updateError;

      // Then move to log
      const response = await fetchWithRetry("/api/candidates/move-to-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: hireModalData.id,
          notes: hireNotes || "Kandidat telah direkrut (Hired)",
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({
          title: "Berhasil",
          description: `Kandidat ${hireModalData.full_name} telah direkrut dan dipindahkan ke Candidate Archive.`,
        });
        setCandidates(candidates.filter((c) => c.id !== hireModalData.id));
        setHireModalData(null);
        setHireNotes("");
      } else {
        throw new Error(result.error || "Gagal memindahkan kandidat");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setHiring(false);
    }
  };

  useEffect(() => {
    fetchCandidates();
  }, []);

  const handleMoveToLog = async () => {
    if (!logModalData) return;

    setMovingToLog(true);
    try {
      const response = await fetchWithRetry("/api/candidates/move-to-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: logModalData.id,
          notes: logNotes,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast({
          title: "Berhasil",
          description: "Kandidat dipindahkan ke log.",
        });
        setLogModalData(null);
        setLogNotes("");
        fetchCandidates();
      } else {
        throw new Error(result.error || "Gagal memindahkan kandidat");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setMovingToLog(false);
    }
  };

  const handleSaveAssessment = async () => {
    if (!assessmentModalData) return;
    setSavingAssessment(true);
    try {
      const { error } = await supabase
        .from("candidates")
        .update({
          technical_score: assessmentScores.technical_score,
          communication_score: assessmentScores.communication_score,
          problem_solving_score: assessmentScores.problem_solving_score,
          teamwork_score: assessmentScores.teamwork_score,
          leadership_score: assessmentScores.leadership_score,
          adaptability_score: assessmentScores.adaptability_score,
          updated_at: new Date().toISOString(),
        })
        .eq("id", assessmentModalData.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Rincian skor asesmen berhasil disimpan.",
      });
      setAssessmentModalData(null);
      fetchCandidates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSavingAssessment(false);
    }
  };

  const isUserInterview = (s: any) => s.additional_notes?.startsWith("[USER]");

  const getCandidateDerivedStatus = (candidate: any) => {
    if (candidate.status_screening === "hired") return "Hired";
    if (candidate.status_screening === "rejected") return "Rejected";

    if (candidate.candidate_evaluations?.some((e: any) => e.evaluation_type === "REFERENCE_CHECK")) {
      return "Reference Check";
    }

    // If they already have an interview status/result (legacy candidates with no schedule rows), interview is done
    if (candidate.interview_status && candidate.interview_status.trim() !== '') return "Interview Selesai User";

    // Schedule checks come first so we see them in the pipeline correctly
    const interviewSchedules = candidate.interview_schedules || [];
    const userSchedules = interviewSchedules.filter(isUserInterview);
    const hcSchedules = interviewSchedules.filter((s: any) => !isUserInterview(s));

    if (userSchedules.length > 0) {
      return userSchedules.some((s: any) => s.is_confirmed) ? "Interview Selesai User" : "Jadwal Interview User";
    }
    if (hcSchedules.length > 0) {
      return hcSchedules.some((s: any) => s.is_confirmed) ? "Interview Selesai HC" : "Jadwal Interview HC";
    }

    // If they already have a psikotes status/result, it means psikotes is done
    if (candidate.psikotes_status && candidate.psikotes_status.trim() !== '') return "Psikotes Selesai";

    if (candidate.psikotes_schedules && candidate.psikotes_schedules.length > 0) {
      if (candidate.psikotes_schedules.some((s: any) => s.is_confirmed)) return "Psikotes Selesai";
      return "Jadwal Psikotes";
    }

    if (candidate.status_screening === "accepted") return "Lolos"; // Lolos screening awal

    // We can also assume "invited" might mean they are waiting for schedule?
    // We will just default to Belum Diproses for now if they don't have schedules yet
    return "Belum Diproses";
  };

  const allGroupedCandidates = candidates.reduce(
    (acc: Record<string, Candidate[]>, c) => {
      if (!acc[c.position]) acc[c.position] = [];
      acc[c.position].push(c);
      return acc;
    },
    {} as Record<string, Candidate[]>,
  );

  const candidatesForSelectedPosition = selectedPosition ? (allGroupedCandidates[selectedPosition] || []) : [];
  
  const filteredCandidatesForPosition = candidatesForSelectedPosition.filter((c) => {
    const selectedStatus = positionStatusFilters[selectedPosition!] || "Inbox";
    if (selectedStatus === "Inbox" || !PIPELINE_STATUS_OPTIONS.includes(selectedStatus)) return true;
    return getCandidateDerivedStatus(c) === selectedStatus;
  });

  const getManualAssessmentScoreLocal = (candidate: any) => {
    const scores = [
      candidate.technical_score || 0,
      candidate.communication_score || 0,
      candidate.problem_solving_score || 0,
      candidate.teamwork_score || 0,
      candidate.leadership_score || 0,
      candidate.adaptability_score || 0,
    ];
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    return Math.round((totalScore / 600) * 100);
  };

  const sortedCandidatesForPosition = [...filteredCandidatesForPosition].sort((a, b) => {
    if (sortOption === "skor") {
      const scoreA = a.assessment_score || 0;
      const scoreB = b.assessment_score || 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
    } else if (sortOption === "interview") {
      const statusA = getCandidateDerivedStatus(a);
      const statusB = getCandidateDerivedStatus(b);
      const interviewStatuses = ["Interview Selesai HC", "Interview Selesai User", "Jadwal Interview HC", "Jadwal Interview User"];
      const isInterviewA = interviewStatuses.includes(statusA) ? 1 : 0;
      const isInterviewB = interviewStatuses.includes(statusB) ? 1 : 0;
      if (isInterviewA !== isInterviewB) return isInterviewB - isInterviewA;
    } else if (sortOption === "psikotes") {
      const statusA = getCandidateDerivedStatus(a);
      const statusB = getCandidateDerivedStatus(b);
      const isPsikotesA = statusA === "Psikotes Selesai" || statusA === "Jadwal Psikotes" ? 1 : 0;
      const isPsikotesB = statusB === "Psikotes Selesai" || statusB === "Jadwal Psikotes" ? 1 : 0;
      if (isPsikotesA !== isPsikotesB) return isPsikotesB - isPsikotesA;
    }
    // Default to "terbaru"
    return new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime();
  });

  const totalFilteredItems = selectedPosition ? sortedCandidatesForPosition.length : Object.keys(allGroupedCandidates).length;
  const totalPages = Math.ceil(totalFilteredItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  
  const paginatedCandidates = selectedPosition ? sortedCandidatesForPosition.slice(startIndex, startIndex + itemsPerPage) : [];
  const paginatedPositions = !selectedPosition ? Object.keys(allGroupedCandidates).sort((a, b) => {
    const maxA = Math.max(...(allGroupedCandidates[a] || []).map(c => new Date(c.updated_at || c.created_at || 0).getTime()));
    const maxB = Math.max(...(allGroupedCandidates[b] || []).map(c => new Date(c.updated_at || c.created_at || 0).getTime()));
    return maxB - maxA;
  }).slice(startIndex, startIndex + itemsPerPage) : [];

  const getManualAssessmentScore = (candidate: Candidate) => {
    const scores = [
      candidate.technical_score || 0,
      candidate.communication_score || 0,
      candidate.problem_solving_score || 0,
      candidate.teamwork_score || 0,
      candidate.leadership_score || 0,
      candidate.adaptability_score || 0,
    ];
    const total = scores.reduce((a, b) => a + b, 0);
    return Math.round(total / 6);
  };

  const topCandidatesByPosition = React.useMemo(() => {
    const grouped: Record<string, Candidate[]> = {};
    candidates.forEach((c) => {
      // Exclude rejected and hired candidates from the top list
      if (c.status_screening === "rejected" || c.status_screening === "hired")
        return;

      if (!grouped[c.position]) grouped[c.position] = [];
      grouped[c.position].push(c);
    });

    const top5: Record<string, Candidate[]> = {};
    Object.keys(grouped).forEach((pos) => {
      // Sort by assessment_score descending
      const sorted = grouped[pos].sort(
        (a, b) => (b.assessment_score || 0) - (a.assessment_score || 0),
      );
      if (sorted.length > 0) {
        top5[pos] = sorted.slice(0, 5);
      }
    });
    return top5;
  }, [candidates]);

  const toggleGroup = (position: string) => {
    setExpandedGroups((prev) =>
      prev.includes(position)
        ? prev.filter((p) => p !== position)
        : [...prev, position],
    );
  };

  const toggleCandidate = (id: string) => {
    setExpandedCandidates((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const handleTopCandidateClick = (candidate: Candidate) => {
    // Ensure the group is expanded
    if (!expandedGroups.includes(candidate.position)) {
      setExpandedGroups((prev) => [...prev, candidate.position]);
    }
    // Ensure the candidate is expanded
    if (!expandedCandidates.includes(candidate.id)) {
      setExpandedCandidates((prev) => [...prev, candidate.id]);
    }

    // With server-side pagination, we can't easily jump to the exact page without an extra query.
    // For now, we just clear filters and go to page 1, hoping they are near the top,
    // or we can just scroll if they are already on the current page.

    const isOnCurrentPage = candidates.some((c) => c.id === candidate.id);

    if (!isOnCurrentPage) {
      setSearch("");
      setStartDate("");
      setEndDate("");
      setCurrentPage(1);
    }

    // Scroll to the candidate list area
    setTimeout(() => {
      const el = document.getElementById(`candidate-${candidate.id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 500); // Give it a bit more time if we had to refetch
  };

  return (
    <div className="space-y-8">
      {!selectedPosition ? (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
            <div className="space-y-1">
              <h1 className="text-4xl font-extrabold tracking-tight text-[#3D2C44]">
                Screening Awal
              </h1>
              <p className="text-sm font-medium text-[#3D2C44]/70 max-w-xl">
                Kelola dan tinjau kandidat berdasarkan lowongan.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white/70 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-sm mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[120px]">
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Cari nama kandidat atau posisi..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3D2C44] transition-all text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 max-w-[150px]">
                <Filter size={16} className="text-slate-400 shrink-0" />
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-slate-700 w-full truncate"
                >
                  <option value="all">Semua Lowongan</option>
                  {openPositions.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 max-w-[140px]">
                <Filter size={16} className="text-slate-400 shrink-0" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-slate-700 w-full truncate"
                >
                  <option value="all">Semua Status</option>
                  <option value="pending">Pending</option>
                  <option value="invited">Invited</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                  <option value="hired">Hired</option>
                </select>
              </div>
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 shrink-0">
                <CalendarIcon size={16} className="text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-slate-700 w-[104px]"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent text-sm focus:outline-none text-slate-700 w-[104px]"
                />
              </div>
              <button
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setPositionFilter("all");
                  setStartDate("");
                  setEndDate("");
                  setCurrentPage(1);
                }}
                className="p-2 text-slate-500 hover:text-red-600 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all shadow-sm flex items-center gap-2 shrink-0"
                title="Reset Filter"
              >
                <FilterX size={18} />
                <span className="font-medium hidden 2xl:inline">Reset</span>
              </button>

              <button
                onClick={fetchCandidates}
                className="p-2 text-[#3D2C44] bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all shadow-sm flex items-center gap-2 shrink-0"
                title="Refresh Data"
              >
                <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
                <span className="font-medium hidden 2xl:inline">Refresh</span>
              </button>
            </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
             {paginatedPositions.length === 0 && !loading ? (
                <div className="py-12 text-center bg-white/50 backdrop-blur-sm rounded-2xl border border-dashed border-slate-300">
                  <p className="text-slate-500 font-medium">Tidak ada lowongan ditemukan.</p>
                </div>
             ) : (
               paginatedPositions.map(position => {
                 const allCands = allGroupedCandidates[position] || [];
                 const total = allCands.length;
                 const newCount = allCands.filter((c: any) => getCandidateDerivedStatus(c) === "Belum Diproses").length;
                 const highFitCount = allCands.filter((c: any) => getCandidateDerivedStatus(c) === "Lolos").length;
                 
                 const jadwalPsikotesCount = allCands.filter((c: any) => getCandidateDerivedStatus(c) === "Jadwal Psikotes").length;
                 const selesaiPsikotesCount = allCands.filter((c: any) => getCandidateDerivedStatus(c) === "Psikotes Selesai").length;
                 
                 const jadwalInterviewCount = allCands.filter((c: any) => ["Jadwal Interview HC", "Jadwal Interview User"].includes(getCandidateDerivedStatus(c))).length;
                 const selesaiInterviewCount = allCands.filter((c: any) => ["Interview Selesai HC", "Interview Selesai User"].includes(getCandidateDerivedStatus(c))).length;
                 const referenceCheckCount = allCands.filter((c: any) => getCandidateDerivedStatus(c) === "Reference Check").length;
                 
                 return (
                   <div 
                     key={position}
                     onClick={() => { setSelectedPosition(position); setCurrentPage(1); setSearch(""); }}
                     className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
                   >
                     <div className="space-y-2">
                       <h3 className="text-xl font-bold text-slate-900 underline decoration-slate-300 decoration-2 underline-offset-4 group-hover:text-[#3D2C44] transition-colors">{position}</h3>
                       <div className="text-sm text-slate-500 flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-3 sm:gap-4 mt-2">
                         <span className="flex items-center gap-1.5"><Users size={16} className="text-slate-400" /> <span className="font-medium">{total} Total Pelamar</span></span>
                         
                         <span className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg"><Search size={14} className="text-indigo-500" /> <span className="font-medium text-indigo-700">{newCount} Baru</span></span>
                         <span className="flex items-center gap-1.5 bg-emerald-50 px-2 py-1 rounded-lg text-emerald-700 font-medium" title="Lolos screening awal tetapi belum dijadwalkan test/interview"><Star size={14} /> {highFitCount} Lolos Awal</span>
                         
                         <div className="flex items-center gap-2 bg-sky-50 px-2 py-1 rounded-lg text-sky-700 font-medium">
                           <FileText size={14} /> Psikotes: 
                           <span className="text-xs bg-sky-200 px-1.5 rounded">{jadwalPsikotesCount} Jadwal</span>
                           <span className="text-xs bg-sky-200 px-1.5 rounded">{selesaiPsikotesCount} Selesai</span>
                         </div>
                         
                         <div className="flex items-center gap-2 bg-amber-50 px-2 py-1 rounded-lg text-amber-700 font-medium">
                           <Users size={14} /> Interview:
                           <span className="text-xs bg-amber-200 px-1.5 rounded">{jadwalInterviewCount} Jadwal</span>
                           <span className="text-xs bg-amber-200 px-1.5 rounded">{selesaiInterviewCount} Selesai</span>
                         </div>

                         {referenceCheckCount > 0 && (
                           <span className="flex items-center gap-1.5 bg-fuchsia-50 px-2 py-1 rounded-lg text-fuchsia-700 font-medium">
                             <FileText size={14} /> {referenceCheckCount} Reference Check
                           </span>
                         )}
                       </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-400 group-hover:text-[#3D2C44] font-medium transition-colors hidden sm:block">Lihat kandidat &rarr;</span>
                     </div>
                   </div>
                 );
               })
             )}
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
            <div className="space-y-1">
              <button 
                onClick={() => { setSelectedPosition(null); setCurrentPage(1); setSearch(""); }}
                className="text-sm text-slate-600 hover:text-[#3D2C44] font-bold flex items-center gap-1.5 mb-2 transition-colors border border-slate-200 bg-white/70 backdrop-blur-md hover:bg-white px-3 py-1.5 rounded-xl w-fit shadow-sm"
              >
                <ChevronLeft size={16} /> Kembali ke Lowongan
              </button>
              <h1 className="text-3xl font-extrabold tracking-tight text-[#3D2C44]">
                {selectedPosition}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center bg-white/70 backdrop-blur-md border border-slate-200 rounded-xl px-3 h-[42px] gap-2 shadow-sm">
                <span className="text-sm font-medium text-slate-500">Urutkan:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as any)}
                  className="bg-transparent text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="terbaru">Terbaru</option>
                  <option value="skor">Skor Tertinggi</option>
                  <option value="interview">Sudah Interview</option>
                  <option value="psikotes">Sudah Psikotes</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="w-full lg:w-64 shrink-0 space-y-4">
              <div className="bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-4">
                
                {/* Search */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2 px-1">Cari Kandidat</h3>
                  <div className="relative w-full">
                    <Search
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                      size={16}
                    />
                    <input
                      type="text"
                      placeholder="Nama atau posisi..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3D2C44] transition-all text-sm"
                    />
                  </div>
                </div>

                {/* Date Filter */}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 mb-2 px-1">Tanggal Apply</h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-full">
                      <CalendarIcon size={14} className="text-slate-400 shrink-0" />
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent text-sm focus:outline-none text-slate-700 w-full"
                        placeholder="Mulai"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-full">
                      <CalendarIcon size={14} className="text-slate-400 shrink-0" />
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent text-sm focus:outline-none text-slate-700 w-full"
                        placeholder="Selesai"
                      />
                    </div>
                  </div>
                </div>

                {/* Status Filter */}
                <div>
                  <button 
                    onClick={() => setIsStatusExpanded(!isStatusExpanded)}
                    className="w-full flex items-center justify-between text-sm font-bold text-slate-900 mb-2 px-1 hover:text-indigo-600 transition-colors"
                  >
                    <span>Status</span>
                    <ChevronDown size={16} className={cn("transition-transform duration-300", !isStatusExpanded && "rotate-180")} />
                  </button>
                  {isStatusExpanded && (
                    <div className="space-y-1">
                      {(() => {
                      const allCandidatesInThisPosition = allGroupedCandidates[selectedPosition] || [];
                      return PIPELINE_STATUS_OPTIONS.map(opt => {
                        const count = opt === "Inbox" ? allCandidatesInThisPosition.length : allCandidatesInThisPosition.filter((c: any) => getCandidateDerivedStatus(c) === opt).length;
                        const currentFilter = positionStatusFilters[selectedPosition] || "Inbox";

                        let filterLabel = opt;
                        if (opt === "Lolos") filterLabel = "Lolos Awal (Menunggu Jadwal)";
                        
                        return (
                          <button
                            key={opt}
                            onClick={() => {
                              setPositionStatusFilters(prev => ({ ...prev, [selectedPosition]: opt }));
                              setCurrentPage(1);
                            }}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 text-sm rounded-xl transition-all duration-200",
                              currentFilter === opt ? "bg-[#3D2C44]/10 text-[#3D2C44] font-bold" : "text-slate-600 hover:bg-slate-50"
                            )}
                          >
                            <span className="text-left leading-tight truncate mr-2">{filterLabel}</span>
                            <span className={cn(
                              "text-xs px-2 py-0.5 rounded-full font-medium transition-colors shrink-0",
                              currentFilter === opt ? "bg-[#3D2C44]/20 text-[#3D2C44] font-bold" : "bg-slate-100 text-slate-500"
                            )}>{count}</span>
                          </button>
                        );
                      });
                      })()}
                    </div>
                  )}
                </div>

                {/* Reset Button */}
                <div className="pt-2">
                  <button
                    onClick={() => {
                      setSearch("");
                      setStartDate("");
                      setEndDate("");
                      setPositionStatusFilters(prev => {
                        const next = { ...prev };
                        delete next[selectedPosition!];
                        return next;
                      });
                      setCurrentPage(1);
                    }}
                    className="w-full flex items-center justify-center gap-2 p-2 text-slate-500 hover:text-red-600 bg-white border border-slate-200 hover:bg-red-50 hover:border-red-200 rounded-xl transition-all shadow-sm"
                  >
                    <FilterX size={16} />
                    <span className="font-medium text-sm">Reset Filter</span>
                  </button>
                </div>

              </div>
            </div>
            <div className="flex-1 min-w-0 space-y-6 pb-10">
              <div className="flex flex-col gap-6">
{paginatedCandidates.map((candidate: any) => {
                  const isExpanded = expandedCandidates.includes(candidate.id);
                  const unconfirmedPsikotes = (candidate.psikotes_schedules || []).filter((s: any) => !s.is_confirmed);
                  const unconfirmedInterviews = (candidate.interview_schedules || []).filter((s: any) => !s.is_confirmed);
                  const allSchedulesForComms = [
                    ...(candidate.psikotes_schedules || []).map((s: any) => ({ schedule: s, type: "psikotes" as const })),
                    ...(candidate.interview_schedules || []).map((s: any) => ({ schedule: s, type: "interview" as const })),
                  ];

                  return (
                    <div
                      key={candidate.id}
                      id={`candidate-${candidate.id}`}
                      className={cn(
                        "group bg-white/70 backdrop-blur-md border border-[#3D2C44]/20 rounded-2xl overflow-hidden hover:border-[#3D2C44]/50 hover:shadow-xl transition-all duration-300 flex flex-col",
                        blinkingId === candidate.id
                          ? "animate-pulse ring-2 ring-indigo-500 ring-inset"
                          : ""
                      )}
                    >
                      <div className="p-5 flex flex-col lg:flex-row gap-6">
                        
                        {/* Avatar & Header */}
                        <div className="flex flex-col sm:flex-row items-start gap-4 flex-1 min-w-0">
                          <Link
                            to={`/candidates/${candidate.id}`}
                            className="w-14 h-14 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0 text-indigo-700 font-bold hover:bg-indigo-200 transition-colors overflow-hidden border border-indigo-200 shadow-sm"
                          >
                            {extractPhotoUrl(
                              candidate.external_data?.raw_data || candidate.source_info
                            ) ? (
                              <img
                                src={extractPhotoUrl(
                                  candidate.external_data?.raw_data || candidate.source_info
                                )!}
                                alt={candidate.full_name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <span className="text-xl">{candidate.full_name?.[0] || "?"}</span>
                            )}
                          </Link>
                          
                          <div className="space-y-2 flex-1 min-w-0">
                            <div>
                              <div className="flex items-center gap-2">
                                <Link
                                  to={`/candidates/${candidate.id}`}
                                  className="text-lg font-bold text-slate-900 hover:text-indigo-600 transition-colors truncate min-w-0"
                                >
                                  {candidate.full_name}
                                </Link>
                                {candidate.is_blacklisted && (
                                  <span
                                    className="px-2 py-0.5 bg-black text-white text-[10px] font-bold rounded"
                                    title={candidate.blacklist_reason || "Kandidat berada dalam daftar blacklist"}
                                  >
                                    BLACKLIST
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                Applied: {formatDate(candidate.date)} • ID: {candidate.id.substring(0, 8)}
                              </p>
                            </div>
                            
                            {/* Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 mt-2 w-full">
                              <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                <Mail size={14} className="text-slate-400 shrink-0" />
                                <span className="truncate">{candidate.email || "-"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0">
                                <Phone size={14} className="text-slate-400 shrink-0" />
                                <span className="truncate">{candidate.phone || "-"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0 sm:col-span-2">
                                <GraduationCap size={14} className="text-slate-400 shrink-0" />
                                <span className="truncate">{candidate.education || "-"}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-slate-600 min-w-0 sm:col-span-2">
                                <Briefcase size={14} className="text-slate-400 shrink-0" />
                                <span className="truncate">{candidate.work_experience || "-"}</span>
                              </div>
                            </div>
                            
                            {/* Badges / Status */}
                            <div className="pt-3 flex flex-wrap gap-2">
                              {candidate.status_screening === "accepted" && (
                                <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-emerald-100 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  Lolos Screening
                                </span>
                              )}
                              {candidate.status_screening === "hired" && (
                                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-indigo-100 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                  Direkrut
                                </span>
                              )}
                              {candidate.status_screening === "rejected" && (
                                <span className="px-2 py-1 bg-red-50 text-red-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-red-100 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  Ditolak
                                </span>
                              )}
                              
                              {/* Psikotes Badge */}
                              {candidate.psikotes_schedules?.filter((s: any) => s.is_confirmed).length > 0 ? (
                                <span className="px-2 py-1 bg-sky-50 text-sky-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-sky-100 flex items-center gap-1">
                                  Selesai Psikotes
                                </span>
                              ) : candidate.psikotes_schedules?.length > 0 ? (
                                <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-amber-100 flex items-center gap-1">
                                  Jadwal Psikotes
                                </span>
                              ) : null}
                              
                              {/* Interview Badge */}
                              {candidate.interview_schedules?.filter((s: any) => s.is_confirmed).length > 0 ? (
                                <span className="px-2 py-1 bg-sky-50 text-sky-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-sky-100 flex items-center gap-1">
                                  Selesai Interview {candidate.interview_schedules.filter((s: any) => s.is_confirmed).length > 1 ? `(${candidate.interview_schedules.filter((s: any) => s.is_confirmed).length})` : ""}
                                </span>
                              ) : candidate.interview_schedules?.length > 0 ? (
                                <span className="px-2 py-1 bg-amber-50 text-amber-700 rounded-md text-[10px] font-bold uppercase tracking-wider border border-amber-100 flex items-center gap-1">
                                  Jadwal Interview
                                </span>
                              ) : null}

                              {candidate.director_status && candidate.director_status !== 'pending' && (
                                <span className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                                   candidate.director_status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                   candidate.director_status === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                   'bg-amber-50 text-amber-700 border-amber-100'
                                )}>
                                  Dir: {candidate.director_status}
                                </span>
                              )}
                              {candidate.finance_status && candidate.finance_status !== 'pending' && (
                                <span className={cn("px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                                   candidate.finance_status === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                   'bg-rose-50 text-rose-700 border-rose-100'
                                )}>
                                  Fin: {candidate.finance_status}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Right: Scores & Actions */}
                        <div className="flex flex-col gap-3 justify-between shrink-0 lg:w-56 lg:border-l lg:border-slate-100 lg:pl-6 border-t border-slate-100 pt-4 lg:pt-0 lg:border-t-0">
                          {/* CV Score Preview */}
                          <div className="flex items-center justify-between lg:justify-start gap-3">
                             <div className="bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 flex items-center gap-2">
                               <span className="text-[10px] font-bold text-indigo-400 uppercase">Skor CV</span>
                               <span className="text-lg font-black text-indigo-700">{candidate.assessment_score || 0}</span>
                             </div>
                             
                             <button
                               onClick={() => toggleCandidate(candidate.id)}
                               className="p-1.5 rounded-lg bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center gap-1"
                               title="Lihat Detail & Resume"
                             >
                               <span className="text-[10px] font-bold uppercase hidden sm:block">{isExpanded ? "Tutup" : "Preview"}</span>
                               <ChevronDown size={16} className={cn("transition-transform duration-300", isExpanded && "rotate-180")} />
                             </button>
                          </div>
                          
                          {/* Buttons */}
                          <div className="flex flex-col gap-2 mt-auto">
                            {profile?.role !== "USER_MANAGER" && (
                              <Popover>
                                <PopoverTrigger
                                  render={
                                    <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border border-[#3D2C44]/20 text-[#3D2C44] bg-white rounded-xl hover:bg-[#3D2C44] hover:text-white transition-all hover:-translate-y-0.5 shadow-sm">
                                      <ClipboardCheck size={16} />
                                      <span>Status Kandidat</span>
                                      <ChevronDown size={14} className="opacity-60" />
                                    </button>
                                  }
                                />
                                <PopoverContent className="w-56 p-1.5">
                                  <div className="flex flex-col gap-0.5">
                                    <button
                                      onClick={() => handleUpdateStatus(candidate.id, "accepted")}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-[#3D2C44]/10 hover:text-[#3D2C44] transition-colors text-left"
                                    >
                                      <ThumbsUp size={16} /> Terima Kandidat
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(candidate.id, "hired")}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-[#3D2C44]/10 hover:text-[#3D2C44] transition-colors text-left"
                                    >
                                      <Briefcase size={16} /> Rekrut (Hired)
                                    </button>
                                    <button
                                      onClick={() => handleUpdateStatus(candidate.id, "rejected")}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-red-600 rounded-lg hover:bg-red-50 transition-colors text-left"
                                    >
                                      <ThumbsDown size={16} /> Tolak Kandidat
                                    </button>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}

                            <Popover>
                              <PopoverTrigger
                                render={
                                  <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs sm:text-sm font-bold border border-[#3D2C44]/20 text-[#3D2C44] bg-white rounded-xl hover:bg-[#3D2C44] hover:text-white transition-all hover:-translate-y-0.5 shadow-sm">
                                    <CalendarClock size={16} />
                                    <span>Jadwal & Komunikasi</span>
                                    <ChevronDown size={14} className="opacity-60" />
                                  </button>
                                }
                              />
                              <PopoverContent className="w-72 p-1.5 max-h-96 overflow-y-auto">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => setSchedulingData({ candidate, type: "psikotes" })}
                                    className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-sky-50 hover:text-sky-700 transition-colors text-left"
                                  >
                                    <FileText size={16} /> Jadwalkan Psikotes
                                  </button>
                                  <button
                                    onClick={() => setSchedulingData({ candidate, type: "interview" })}
                                    className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-amber-50 hover:text-amber-700 transition-colors text-left"
                                  >
                                    <Users size={16} /> Jadwalkan Interview
                                  </button>

                                  {(unconfirmedPsikotes.length > 0 || unconfirmedInterviews.length > 0) && (
                                    <div className="my-1 border-t border-slate-100" />
                                  )}
                                  {unconfirmedPsikotes.map((s: any) => (
                                    <button
                                      key={s.id}
                                      onClick={() => setConfirmScheduleData({ table: "psikotes_schedules", scheduleId: s.id, label: "Psikotes" })}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-sky-50 hover:text-sky-700 transition-colors text-left"
                                    >
                                      <CheckCheck size={16} /> Konfirmasi Psikotes Selesai
                                    </button>
                                  ))}
                                  {unconfirmedInterviews.map((s: any) => (
                                    <button
                                      key={s.id}
                                      onClick={() => setConfirmScheduleData({
                                        table: "interview_schedules",
                                        scheduleId: s.id,
                                        label: `Interview ${isUserInterview(s) ? "User" : "HC"}`,
                                      })}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-amber-50 hover:text-amber-700 transition-colors text-left"
                                    >
                                      <CheckCheck size={16} /> Konfirmasi Interview {isUserInterview(s) ? "User" : "HC"} Selesai
                                    </button>
                                  ))}

                                  {allSchedulesForComms.length > 0 && (
                                    <div className="my-1 border-t border-slate-100" />
                                  )}
                                  {allSchedulesForComms.map(({ schedule, type }) => (
                                    <button
                                      key={`email-${schedule.id}`}
                                      onClick={() => setCommsModalData({ candidate, schedule, type, channel: "email" })}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
                                    >
                                      <Mail size={16} className="shrink-0" />
                                      <span className="truncate">
                                        Kirim Email — {type === "psikotes" ? "Psikotes" : `Interview ${isUserInterview(schedule) ? "User" : "HC"}`} ({formatDate(schedule.schedule_date)})
                                      </span>
                                    </button>
                                  ))}
                                  {allSchedulesForComms.map(({ schedule, type }) => (
                                    <button
                                      key={`wa-${schedule.id}`}
                                      onClick={() => setCommsModalData({ candidate, schedule, type, channel: "wa" })}
                                      className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-slate-700 rounded-lg hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-left"
                                    >
                                      <MessageCircle size={16} className="shrink-0" />
                                      <span className="truncate">
                                        Kirim WA — {type === "psikotes" ? "Psikotes" : `Interview ${isUserInterview(schedule) ? "User" : "HC"}`} ({formatDate(schedule.schedule_date)})
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>

                      {/* Expanded Section (Preview) */}
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-4 border-t border-slate-100 bg-slate-50/50 animate-in slide-in-from-top-2 duration-300">
                          <div className="mb-6">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Ringkasan Pengalaman</p>
                            <p className="text-sm text-slate-700 leading-relaxed font-medium">
                              {candidate.resume_summary || "Tidak ada ringkasan"}
                            </p>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-4">
                              <h4 className="font-bold text-emerald-800 flex items-center gap-2 mb-2 text-sm">
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
                              <h4 className="font-bold text-rose-800 flex items-center gap-2 mb-2 text-sm">
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
                              <h4 className="font-bold text-[#3D2C44] flex items-center gap-2 mb-2 text-sm">
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
                              <h4 className="font-bold text-amber-800 flex items-center gap-2 mb-2 text-sm">
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

                          <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                                <Lightbulb className="text-indigo-600" size={20} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-indigo-900 mb-2 text-sm">Alasan Penilaian AI</h4>
                                <div className="text-sm text-indigo-800">
                                  {formatAsNumberedList(
                                    candidate.assessment_reason,
                                    <span className="italic opacity-70">Tidak ada alasan penilaian yang diberikan.</span>,
                                    true,
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mt-6 flex justify-end gap-3">
                            <Link
                              to={`/candidates/${candidate.id}`}
                              className="px-4 py-2 bg-indigo-50 text-indigo-600 font-bold text-sm rounded-xl hover:bg-indigo-100 transition-colors"
                            >
                              Buka Profil Lengkap
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}


      {schedulingData && (
        <SchedulingModal
          candidate={schedulingData.candidate}
          type={schedulingData.type}
          onClose={() => setSchedulingData(null)}
          onSuccess={fetchCandidates}
        />
      )}

      {commsModalData && commsModalData.channel === "email" && (
        <SendEmailModal
          candidate={commsModalData.candidate}
          schedule={commsModalData.schedule}
          type={commsModalData.type}
          onClose={() => setCommsModalData(null)}
        />
      )}

      {commsModalData && commsModalData.channel === "wa" && (
        <SendWAModal
          candidate={commsModalData.candidate}
          schedule={commsModalData.schedule}
          type={commsModalData.type}
          onClose={() => setCommsModalData(null)}
        />
      )}

      <ConfirmModal
        isOpen={!!confirmScheduleData}
        onClose={() => setConfirmScheduleData(null)}
        onConfirm={confirmScheduleDone}
        title="Konfirmasi Selesai"
        message={`Tandai jadwal ${confirmScheduleData?.label || ""} ini sebagai sudah selesai dilaksanakan?`}
        confirmText="Ya, Sudah Selesai"
        loading={confirmingSchedule}
      />

      {/* Move to Log Modal */}
      {logModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <FolderInput size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Pindahkan ke Log
                  </h3>
                  <p className="text-xs text-slate-500">
                    Konfirmasi pemindahan kandidat
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLogModalData(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <ChevronDown className="rotate-90" size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-900">
                  {logModalData.full_name}
                </h4>
                <p className="text-sm text-slate-500">{logModalData.email}</p>
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Posisi
                  </p>
                  <p className="text-sm font-medium text-slate-700">
                    {logModalData.position}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Catatan / Keterangan
                </label>
                <textarea
                  value={logNotes}
                  onChange={(e) => setLogNotes(e.target.value)}
                  placeholder="Masukkan alasan pemindahan atau catatan tambahan..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[120px] text-sm resize-none transition-all"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => setLogModalData(null)}
                className="flex-1 px-6 py-3 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleMoveToLog}
                disabled={movingToLog}
                className="flex-1 px-6 py-3 bg-[#3D2C44] text-white font-bold rounded-2xl hover:bg-[#3D2C44]/90 shadow-lg shadow-[#3D2C44]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {movingToLog ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <>
                    <FolderInput size={18} />
                    Konfirmasi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {candidates.length === 0 && !loading && (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-300">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Users className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900">
            Tidak ada kandidat
          </h3>
          <p className="text-slate-500">
            Kandidat baru akan muncul di sini setelah mereka mendaftar.
          </p>
        </div>
      )}

      {/* Pagination Controls */}
      {candidates.length > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-500">
              Menampilkan{" "}
              <span className="font-bold text-slate-900">{startIndex + 1}</span>{" "}
              -{" "}
              <span className="font-bold text-slate-900">
                {Math.min(startIndex + itemsPerPage, totalFilteredItems)}
              </span>{" "}
              dari{" "}
              <span className="font-bold text-slate-900">{totalFilteredItems}</span>{" "}
              kandidat
            </p>
            <div className="h-4 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Tampilkan:</label>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D2C44]"
              >
                {[5, 10, 20, 50, 100].map((val) => (
                  <option key={val} value={val}>
                    {val}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((prev) => prev - 1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronDown className="rotate-90" size={18} />
            </button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage;
                if (totalPages <= 5) pageNum = i + 1;
                else if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2)
                  pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                      currentPage === pageNum
                        ? "bg-[#3D2C44] text-white shadow-md shadow-[#3D2C44]/20"
                        : "text-slate-600 hover:bg-slate-50 border border-transparent hover:border-slate-200",
                    )}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((prev) => prev + 1)}
              className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <ChevronDown className="-rotate-90" size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Accept Confirmation Modal */}
      {acceptModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4 overflow-y-auto">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 shrink-0">
                <ThumbsUp size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                Konfirmasi Terima
              </h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menerima kandidat{" "}
                <span className="font-bold text-slate-800">
                  {acceptModalData.full_name}
                </span>
                ? Status kandidat akan diubah menjadi Lolos Screening.
              </p>

              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                    Skor Screening
                  </p>
                  <p className="text-sm font-bold text-indigo-600">
                    {acceptModalData.assessment_score || 0}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => setAcceptModalData(null)}
                className="flex-1 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmAccept}
                disabled={accepting}
                className="flex-1 py-2.5 bg-[#3D2C44] text-white font-bold rounded-xl hover:bg-[#3D2C44]/90 transition-all shadow-sm shadow-[#3D2C44]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {accepting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  "Ya, Terima Kandidat"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4 overflow-y-auto">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 shrink-0">
                <AlertTriangle size={32} />
              </div>
              <h3 className="text-xl font-bold text-slate-900">
                Konfirmasi Penolakan
              </h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menolak kandidat{" "}
                <span className="font-bold text-slate-800">
                  {rejectModalData.full_name}
                </span>
                ? Kandidat ini akan dipindahkan ke Candidate Archive.
              </p>
              <div className="text-left mt-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Alasan Penolakan (Opsional)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-none"
                  placeholder="Ditolak pada tahap Screening Awal"
                  rows={3}
                />
              </div>

              <div className="text-left mt-4 border-t border-slate-100 pt-4 space-y-4">
                <div className="flex flex-col space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer group bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <input
                      type="checkbox"
                      checked={addToBlacklist}
                      onChange={(e) => setAddToBlacklist(e.target.checked)}
                      className="w-4 h-4 text-slate-900 rounded border-slate-300 focus:ring-slate-900 transition-all cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 group-hover:text-black transition-colors">
                        Tambahkan ke Blacklist
                      </span>
                      <span className="text-xs text-slate-500">
                        Kandidat akan ditandai hitam jika melamar kembali di
                        masa depan.
                      </span>
                    </div>
                  </label>

                  {addToBlacklist && (
                    <div className="pl-2 animate-in fade-in slide-in-from-top-2">
                      <label className="block text-sm font-medium text-slate-700 mb-1">
                        Alasan Blacklist <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={blacklistReason}
                        onChange={(e) => setBlacklistReason(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all resize-none text-sm"
                        placeholder="Masukkan alasan detail blacklist untuk referensi HR..."
                        rows={2}
                        required={addToBlacklist}
                      />
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={sendRejectEmail}
                    onChange={(e) => setSendRejectEmail(e.target.checked)}
                    className="w-4 h-4 text-red-600 rounded border-slate-300 focus:ring-red-500 transition-all cursor-pointer"
                  />
                  <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                    Kirim Email Penolakan Otomatis
                  </span>
                </label>

                {sendRejectEmail && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                        Pilih Template Email
                      </label>
                      <div className="relative">
                        <select
                          value={selectedRejectTemplate}
                          onChange={(e) =>
                            setSelectedRejectTemplate(e.target.value)
                          }
                          className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all appearance-none"
                        >
                          <option value="">-- Pilih Template --</option>
                          {rejectEmailTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          size={16}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wide">
                        CC Email (Opsional)
                      </label>
                      <input
                        type="text"
                        value={rejectCcEmail}
                        onChange={(e) => setRejectCcEmail(e.target.value)}
                        placeholder="hr.manager@example.com, manager@example.com"
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => {
                  setRejectModalData(null);
                  setRejectReason("");
                  setRejectCcEmail("");
                  setAddToBlacklist(false);
                  setBlacklistReason("");
                }}
                className="flex-1 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmReject}
                disabled={rejecting}
                className="flex-1 py-2.5 bg-[#3D2C44] text-white font-bold rounded-xl hover:bg-[#3D2C44]/90 transition-all shadow-sm shadow-[#3D2C44]/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {rejecting ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  "Ya, Tolak Kandidat"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hire Modal */}
      {hireModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Konfirmasi Rekrut Kandidat
                  </h3>
                  <p className="text-sm text-slate-500">
                    Review singkat sebelum merekrut
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHireModalData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                <h4 className="font-bold text-slate-900">
                  {hireModalData.full_name}
                </h4>
                <p className="text-sm text-slate-500">{hireModalData.email}</p>
                <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Posisi
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {hireModalData.position}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Skor Screening
                    </p>
                    <p className="text-sm font-bold text-indigo-600">
                      {hireModalData.assessment_score || 0}
                    </p>
                  </div>
                </div>
                {(hireModalData.strengths || hireModalData.risk_factors) && (
                  <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                    {hireModalData.strengths && (
                      <div>
                        <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-1">
                          Kekuatan
                        </p>
                        <p className="text-xs font-medium text-slate-600 line-clamp-2">
                          {hireModalData.strengths}
                        </p>
                      </div>
                    )}
                    {hireModalData.risk_factors && (
                      <div>
                        <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-1">
                          Faktor Risiko
                        </p>
                        <p className="text-xs font-medium text-slate-600 line-clamp-2">
                          {hireModalData.risk_factors}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                  Keterangan / Catatan Rekrutmen
                </label>
                <textarea
                  value={hireNotes}
                  onChange={(e) => setHireNotes(e.target.value)}
                  placeholder="Masukkan catatan rekrutmen, penempatan, atau informasi tambahan lainnya..."
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[100px] text-sm resize-none transition-all"
                />
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => setHireModalData(null)}
                className="flex-1 px-6 py-3 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={confirmHire}
                disabled={hiring}
                className="flex-1 px-6 py-3 bg-[#3D2C44] text-white font-bold rounded-2xl hover:bg-[#3D2C44]/90 shadow-lg shadow-[#3D2C44]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {hiring ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <>
                    <Briefcase size={18} />
                    Konfirmasi Rekrut
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Scores Modal */}
      {assessmentModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-sky-50/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
                  <Star size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Rincian Skor Asesmen
                  </h3>
                  <p className="text-sm text-slate-500">
                    {assessmentModalData.full_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssessmentModalData(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Technical
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.technical_score}
                    onChange={(e) =>
                      setAssessmentScores({
                        ...assessmentScores,
                        technical_score: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Communication
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.communication_score}
                    onChange={(e) =>
                      setAssessmentScores({
                        ...assessmentScores,
                        communication_score: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Problem Solving
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.problem_solving_score}
                    onChange={(e) =>
                      setAssessmentScores({
                        ...assessmentScores,
                        problem_solving_score: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Teamwork
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.teamwork_score}
                    onChange={(e) =>
                      setAssessmentScores({
                        ...assessmentScores,
                        teamwork_score: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Leadership
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.leadership_score}
                    onChange={(e) =>
                      setAssessmentScores({
                        ...assessmentScores,
                        leadership_score: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Adaptability
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={assessmentScores.adaptability_score}
                    onChange={(e) =>
                      setAssessmentScores({
                        ...assessmentScores,
                        adaptability_score: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 transition-all"
                  />
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                onClick={() => setAssessmentModalData(null)}
                className="flex-1 px-6 py-3 bg-rose-50 border border-rose-200 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={handleSaveAssessment}
                disabled={savingAssessment}
                className="flex-1 px-6 py-3 bg-[#3D2C44] text-white font-bold rounded-2xl hover:bg-[#3D2C44]/90 shadow-lg shadow-[#3D2C44]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingAssessment ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  <>
                    <Star size={18} />
                    Simpan Skor
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
