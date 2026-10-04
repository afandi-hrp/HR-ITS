import React, { useState, useEffect } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  Loader2,
  X,
  AlertCircle,
  Search,
  RefreshCcw,
  Mail,
  Calendar,
  User,
  Trash2,
  File,
  Plus,
  Info,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ShieldAlert,
  ExternalLink,
  Tag,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useToast } from "../components/ui/use-toast";
import { cn, fetchWithRetry, formatDateDMMMY } from "../lib/utils";
import BulkUploadModal from "../components/BulkUploadModal";
import ConfirmModal from "../components/ConfirmModal";

interface CVUpload {
  id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  file_name: string;
  mime_type: string;
  uploaded_at: string;
  sender_name: string;
  sender_email: string;
  source_info?: string | null;
  job_status?: "pending" | "success" | "error" | null;
  job_message?: string | null;
  candidate_matches?: CandidateMatch[];
}

interface CandidateMatch {
  id: string;
  position: string | null;
  status_screening: string | null;
  archived: boolean;
}

// The n8n CV-analysis workflow can only process PDFs.
const MAX_FILE_MB = 15;
const isPdfFile = (f: File) =>
  f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

const JOB_STATUS_BADGE: Record<string, { label: string; cls: string; hint: string }> = {
  pending: { label: "Diproses", cls: "bg-amber-50 text-amber-700 border-amber-200", hint: "CV sedang dianalisa AI" },
  success: { label: "Selesai", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", hint: "Analisa selesai, kandidat sudah masuk Screening" },
  error: { label: "Gagal", cls: "bg-rose-50 text-rose-700 border-rose-200", hint: "Proses gagal" },
};

const formatUploadedAt = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return `${formatDateDMMMY(d)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function UploadCV() {
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [position, setPosition] = useState("");
  const [sourceInfo, setSourceInfo] = useState("");
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [availableJobSources, setAvailableJobSources] = useState<string[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    current: 0,
    total: 0,
  });
  const [uploads, setUploads] = useState<CVUpload[]>([]);
  const [fetchingUploads, setFetchingUploads] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedUploads, setSelectedUploads] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // Existing records for the typed email — informational only, uploading is
  // never blocked (the same person may apply for another position).
  const [emailMatches, setEmailMatches] = useState<{
    candidates: CandidateMatch[];
    blacklist: { reason: string | null }[];
  }>({ candidates: [], blacklist: [] });
  const { toast } = useToast();

  useEffect(() => {
    const email = candidateEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailMatches({ candidates: [], blacklist: [] });
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      // ilike without wildcards = case-insensitive exact match.
      const pattern = email.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      const [activeRes, logsRes, blacklistRes] = await Promise.all([
        supabase.from("candidates").select("id, position, status_screening").ilike("email", pattern),
        supabase.from("candidate_logs").select("id, position, status_screening").ilike("email", pattern),
        supabase.from("blacklisted_candidates").select("reason").ilike("email", pattern),
      ]);
      if (cancelled) return;
      setEmailMatches({
        candidates: [
          ...(activeRes.data || []).map((c: any) => ({ ...c, archived: false })),
          ...(logsRes.data || []).map((c: any) => ({ ...c, archived: true })),
        ],
        blacklist: blacklistRes.data || [],
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [candidateEmail]);

  // Default to the first available job source, mirroring how `position` is
  // defaulted, so the field is never silently submitted empty.
  useEffect(() => {
    if (availableJobSources.length > 0 && !sourceInfo) {
      setSourceInfo(availableJobSources[0]);
    }
  }, [availableJobSources]);

  const isFirstRender = React.useRef(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      if (isFirstRender.current) {
        isFirstRender.current = false;
      } else {
        setCurrentPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUploads = async () => {
    setFetchingUploads(true);
    try {
      const response = await fetchWithRetry(
        `/api/cv-uploads?search=${encodeURIComponent(debouncedSearch)}&page=${currentPage}&limit=${itemsPerPage}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      if (response.ok) {
        const result = await response.json();
        setUploads(result.data || []);
        setTotalItems(result.count || 0);
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `API error: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching uploads:", error);
    } finally {
      setFetchingUploads(false);
    }
  };

  // Deletes history rows only (the candidate record and CV file stay).
  const confirmDelete = async () => {
    if (!deleteTarget || deleteTarget.length === 0) return;
    setDeleting(true);
    try {
      const response = await fetchWithRetry("/api/cv-uploads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteTarget }),
      });
      if (!response.ok) throw new Error("Gagal menghapus riwayat");

      toast({
        title: "Berhasil",
        description: `${deleteTarget.length} riwayat berhasil dihapus.`,
      });
      setSelectedUploads((prev) => prev.filter((id) => !deleteTarget.includes(id)));
      setDeleteTarget(null);
      fetchUploads();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedUploads((prev) =>
      prev.includes(id)
        ? prev.filter((selectedId) => selectedId !== id)
        : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (selectedUploads.length === uploads.length) {
      setSelectedUploads([]);
    } else {
      setSelectedUploads(uploads.map((u) => u.id));
    }
  };

  useEffect(() => {
    fetchUploads();
  }, [currentPage, itemsPerPage, debouncedSearch]);

  useEffect(() => {
    const fetchPositionsAndSources = async () => {
      try {
        const { data: positionsData, error: positionsError } = await supabase
          .from("open_recruitment")
          .select("position")
          .or("is_published.eq.true,is_published.is.null")
          .order("position", { ascending: true });

        if (positionsError) {
          console.error("Error fetching positions:", positionsError);
        } else if (positionsData) {
          const positions = Array.from(
            new Set(positionsData.map((item) => item.position)),
          );
          setAvailablePositions(positions);
          if (positions.length > 0 && !position) {
            setPosition(positions[0]);
          }
        }

        const { data: settingsData, error: settingsError } = await supabase
          .from("site_settings")
          .select("job_sources")
          .eq("id", 1)
          .single();

        if (settingsError) {
          console.error("Error fetching job sources:", settingsError);
          setAvailableJobSources([
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
          ]);
        } else if (
          settingsData &&
          settingsData.job_sources &&
          settingsData.job_sources.length > 0
        ) {
          setAvailableJobSources(settingsData.job_sources);
        } else {
          setAvailableJobSources([
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
          ]);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPositions(false);
      }
    };

    fetchPositionsAndSources();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDragging(false);
    if (e.target.files && e.target.files.length > 0) {
      const selectedFiles = Array.from(e.target.files) as File[];
      const isValid = (f: File) => isPdfFile(f) && f.size <= MAX_FILE_MB * 1024 * 1024;

      const validFiles = selectedFiles.filter(isValid);
      const invalidFiles = selectedFiles.filter((f) => !isValid(f));

      if (invalidFiles.length > 0) {
        toast({
          title: `${invalidFiles.length} File Ditolak`,
          description: invalidFiles
            .map((f) => `${f.name}: ${!isPdfFile(f) ? "bukan PDF" : `lebih dari ${MAX_FILE_MB}MB`}`)
            .join("; "),
          variant: "destructive",
        });
      }

      if (validFiles.length > 0) {
        setFiles((prev) => [...prev, ...validFiles]);
      }

      // Reset input value so the same file can be selected again
      e.target.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      toast({
        title: "Peringatan",
        description: "Silakan pilih minimal 1 file.",
        variant: "destructive",
      });
      return;
    }
    if (!candidateName || !candidateEmail || !position || !sourceInfo) {
      toast({
        title: "Peringatan",
        description: "Silakan isi semua data kandidat.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setUploadProgress({ current: 0, total: files.length });
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      const webhookUrl = user?.user_metadata?.cv_webhook_url;

      if (!webhookUrl) {
        toast({
          title: "Konfigurasi Diperlukan",
          description:
            "Silakan atur n8n CV Upload Webhook URL di menu Pengaturan terlebih dahulu.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const file of files) {
        const formData = new FormData();
        formData.append("candidateName", candidateName);
        formData.append("candidateEmail", candidateEmail);
        formData.append("candidatePosition", position);
        formData.append("sourceInfo", sourceInfo);
        formData.append("fileName", file.name);
        formData.append("mimeType", file.type);
        formData.append("uploadedAt", new Date().toISOString());
        formData.append("senderName", user?.user_metadata?.full_name || "User");
        formData.append("senderEmail", user?.email || "");
        formData.append("file", file);

        try {
          const response = await fetchWithRetry("/api/n8n/upload-cv", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(
              errData.error || `Gagal mengirim ke n8n: ${response.statusText}`,
            );
          }

          successCount++;
        } catch (err) {
          console.error("Error uploading CV:", err);
          errorCount++;
        }

        setUploadProgress((prev) => ({ ...prev, current: prev.current + 1 }));
      }

      if (successCount > 0) {
        toast({
          title: "Berhasil Diunggah",
          description: `${successCount} CV berhasil dikirim ke antrean. Anda akan menerima notifikasi saat proses analisa selesai.`,
        });
      }
      if (errorCount > 0) {
        toast({
          title: "Error",
          description: `${errorCount} CV gagal dikirim.`,
          variant: "destructive",
        });
      }

      // Reset files and fields
      setFiles([]);
      setCandidateName("");
      setCandidateEmail("");
      setPosition("");

      // Refresh list
      fetchUploads();
    } catch (error: any) {
      console.error("Error uploading CV:", error);
      toast({
        title: "Error",
        description:
          error.message || "Gagal mengunggah CV. Periksa koneksi n8n Anda.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#5A305A]">
            Upload CV Kandidat
          </h1>
          <p className="text-sm font-medium text-[#5A305A]/70 max-w-xl">
            CV dianalisa AI, lalu masuk ke Screening Awal.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Upload Form */}
        <div className="space-y-6">
          <form
            onSubmit={handleUpload}
            className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-2xl overflow-hidden"
          >
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#73507B] uppercase tracking-widest">
                    Nama Kandidat
                  </label>
                  <input
                    type="text"
                    required
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Masukkan nama lengkap..."
                    className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A305A] focus:bg-white/80 transition-all text-sm font-medium"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#73507B] uppercase tracking-widest">
                    Email Kandidat
                  </label>
                  <input
                    type="email"
                    required
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="kandidat@email.com"
                    className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A305A] focus:bg-white/80 transition-all text-sm font-medium"
                  />
                </div>
                {(emailMatches.blacklist.length > 0 || emailMatches.candidates.length > 0) && (
                  <div className="md:col-span-2 space-y-2">
                    {emailMatches.blacklist.length > 0 && (
                      <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-xl">
                        <ShieldAlert size={16} className="shrink-0 mt-0.5" />
                        <span>
                          <span className="font-bold">Email ini masuk daftar blacklist.</span>
                          {emailMatches.blacklist[0].reason ? ` Alasan: ${emailMatches.blacklist[0].reason}` : ""}
                        </span>
                      </div>
                    )}
                    {emailMatches.candidates.length > 0 && (() => {
                      const samePositionActive = emailMatches.candidates.some(
                        (c) => !c.archived && position && c.position?.trim().toLowerCase() === position.trim().toLowerCase(),
                      );
                      return (
                        <div
                          className={cn(
                            "flex items-start gap-2 text-xs p-3 rounded-xl border",
                            samePositionActive
                              ? "bg-amber-50 border-amber-200 text-amber-800"
                              : "bg-sky-50 border-sky-200 text-sky-800",
                          )}
                        >
                          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-bold">
                              {samePositionActive
                                ? "Kandidat ini sedang aktif melamar posisi yang sama — kemungkinan duplikat."
                                : "Email ini sudah terdaftar di lamaran lain. Tetap bisa diproses untuk posisi ini."}
                            </p>
                            <ul className="space-y-0.5">
                              {emailMatches.candidates.map((c) => (
                                <li key={`${c.archived ? "log" : "active"}-${c.id}`}>
                                  •{" "}
                                  <Link to={`/candidates/${c.id}`} target="_blank" className="font-semibold underline hover:no-underline">
                                    {candidateName || "Kandidat"} – {c.position || "-"}
                                  </Link>{" "}
                                  ({c.archived ? `Diarsipkan${c.status_screening ? `, ${c.status_screening}` : ""}` : "Aktif"})
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-[#73507B] uppercase tracking-widest">
                    Posisi Dilamar
                  </label>
                  {loadingPositions ? (
                    <div className="flex items-center gap-2 text-sm text-[#73507B] py-3">
                      <Loader2 className="animate-spin" size={16} /> Memuat
                      posisi...
                    </div>
                  ) : availablePositions.length > 0 ? (
                    <select
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      className="block w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A305A] focus:bg-white/80 transition-all text-sm font-medium appearance-none"
                    >
                      <option value="" disabled>
                        Pilih Posisi
                      </option>
                      {availablePositions.map((pos, idx) => (
                        <option key={idx} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={position}
                      onChange={(e) => setPosition(e.target.value)}
                      placeholder="Contoh: Frontend Developer"
                      className="w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A305A] focus:bg-white/80 transition-all text-sm font-medium"
                    />
                  )}
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-bold text-[#73507B] uppercase tracking-widest">
                    Info Sumber Lowongan
                  </label>
                  <select
                    required
                    value={sourceInfo}
                    onChange={(e) => setSourceInfo(e.target.value)}
                    className="block w-full px-4 py-3 bg-white/50 border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A305A] focus:bg-white/80 transition-all text-sm font-medium appearance-none"
                  >
                    <option value="" disabled>
                      Pilih Sumber Lowongan
                    </option>
                    {availableJobSources.map((source, idx) => (
                      <option key={idx} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-[#73507B] uppercase tracking-widest">
                  File CV (PDF)
                </label>
                <div
                  onDragEnter={() => setIsDragging(true)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
                  }}
                  onDrop={() => setIsDragging(false)}
                  className={cn(
                    "relative border-2 border-dashed rounded-2xl p-10 transition-all flex flex-col items-center justify-center gap-4",
                    isDragging
                      ? "border-[#5A305A] bg-[#5A305A]/10 scale-[1.01] shadow-lg"
                      : files.length > 0
                        ? "border-emerald-300 bg-emerald-50/50"
                        : "border-white/60 bg-white/40 hover:border-[#5A305A]/40 hover:bg-white/60",
                  )}
                >
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    accept=".pdf,application/pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                  />

                  {files.length > 0 ? (
                    <div className="w-full space-y-3 z-20">
                      {files.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm relative z-20"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center",
                                file.type === "application/pdf"
                                  ? "bg-red-100 text-red-600"
                                  : "bg-blue-100 text-blue-600",
                              )}
                            >
                              {file.type === "application/pdf" ? (
                                <FileText size={20} />
                              ) : (
                                <File size={20} />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-[#5A305A] text-sm truncate max-w-[200px]">
                                {file.name}
                              </p>
                              <p className="text-xs text-[#73507B]">
                                {(file.size / 1024 / 1024).toFixed(2)} MB
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFile(index);
                            }}
                            className="p-2 text-[#73507B] hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                      <div className="text-center mt-4 pt-4 border-t border-white/40">
                        <p className="text-sm font-medium text-[#5A305A]">
                          {isDragging ? "Lepaskan file di sini" : "Klik atau seret untuk menambah file lain"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={cn(
                        "w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm border transition-colors",
                        isDragging ? "bg-[#5A305A] text-white border-[#5A305A]" : "bg-white/60 text-[#73507B] border-white/80",
                      )}>
                        <Upload size={32} />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-[#5A305A]">
                          {isDragging ? "Lepaskan file di sini" : "Klik atau seret file ke sini"}
                        </p>
                        <p className="text-xs text-[#73507B]">
                          Hanya file PDF, maksimal {MAX_FILE_MB}MB per file
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="p-8 bg-white/30 border-t border-white/40 space-y-4">
              {loading && uploadProgress.total > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-xs font-medium text-[#73507B]">
                    <span>Mengunggah file...</span>
                    <span>
                      {uploadProgress.current} / {uploadProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-slate-200/50 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#5A305A] h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={
                  loading ||
                  files.length === 0 ||
                  !candidateName ||
                  !candidateEmail ||
                  !position
                }
                className="w-full py-4 bg-[#5A305A] text-white font-bold rounded-2xl hover:bg-[#3F223F] shadow-lg shadow-[#5A305A]/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={24} />
                )}
                {loading
                  ? `Mengirim ${uploadProgress.current}/${uploadProgress.total} CV...`
                  : `Kirim ${files.length > 0 ? files.length : ""} CV`}
              </button>
            </div>
          </form>
        </div>

        {/* History / Search */}
        <div className="space-y-6">
          <div className="bg-white/40 backdrop-blur-xl rounded-3xl border border-white/60 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/40 bg-white/30 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-[#5A305A]">
                  Riwayat Upload
                </h2>
                <div className="flex items-center gap-2">
                  {selectedUploads.length > 0 && (
                    <button
                      onClick={() => setDeleteTarget(selectedUploads)}
                      className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                    >
                      <Trash2 size={16} />
                      Hapus ({selectedUploads.length})
                    </button>
                  )}
                  <button
                    onClick={fetchUploads}
                    className="p-2.5 text-[#5A305A] bg-white/70 border border-slate-200 hover:bg-white rounded-xl transition-all shadow-sm flex items-center justify-center"
                  >
                    <RefreshCcw
                      size={20}
                      className={fetchingUploads ? "animate-spin" : ""}
                    />
                  </button>
                  <button
                    onClick={() => setIsBulkModalOpen(true)}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-[#5A305A] text-white font-bold rounded-xl hover:bg-[#3F223F] transition-all shadow-sm text-sm whitespace-nowrap"
                  >
                    <Plus size={18} />
                    Upload Massal
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[#73507B]"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="Cari nama, email, atau posisi..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchUploads()}
                  className="w-full pl-10 pr-4 py-2.5 bg-white/50 backdrop-blur-md border border-white/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#5A305A] focus:bg-white/80 transition-all text-sm"
                />
              </div>
              {uploads.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                  <input
                    type="checkbox"
                    checked={
                      selectedUploads.length === uploads.length &&
                      uploads.length > 0
                    }
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-white/60 bg-white/50 text-[#5A305A] focus:ring-[#5A305A]"
                  />
                  <span className="text-xs font-medium text-[#73507B]">
                    Pilih Semua
                  </span>
                </div>
              )}
            </div>

            <div className="p-6 space-y-4">
              {fetchingUploads ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#73507B] gap-3">
                  <Loader2 size={32} className="animate-spin" />
                  <p className="text-sm font-medium">Memuat data...</p>
                </div>
              ) : uploads.length > 0 ? (
                <>
                  {uploads.map((upload) => (
                    <div
                      key={upload.id}
                      className={cn(
                        "p-4 border rounded-2xl transition-all group relative",
                        selectedUploads.includes(upload.id)
                          ? "bg-[#5A305A]/5 border-[#5A305A]/30"
                          : "bg-white/40 border-white/60 hover:border-[#5A305A]/30 hover:bg-white/60 hover:shadow-xl",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div className="pt-1">
                          <input
                            type="checkbox"
                            checked={selectedUploads.includes(upload.id)}
                            onChange={() => toggleSelect(upload.id)}
                            className="w-4 h-4 rounded border-white/60 bg-white/50 text-[#5A305A] focus:ring-[#5A305A]"
                          />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-[#5A305A]">
                              {upload.candidate_name}
                            </h3>
                            {upload.job_status && JOB_STATUS_BADGE[upload.job_status] && (
                              <span
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border",
                                  JOB_STATUS_BADGE[upload.job_status].cls,
                                )}
                                title={upload.job_message || JOB_STATUS_BADGE[upload.job_status].hint}
                              >
                                {JOB_STATUS_BADGE[upload.job_status].label}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[#73507B] min-w-0">
                            <Mail size={12} className="shrink-0" />
                            <span className="truncate">{upload.candidate_email}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[#73507B]">
                            <FileText size={12} className="shrink-0" />
                            <span className="font-semibold text-[#5A305A]">
                              {upload.position}
                            </span>
                            {upload.source_info && (
                              <span className="flex items-center gap-1">
                                <Tag size={11} /> {upload.source_info}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-[#73507B] min-w-0">
                            <File size={12} className="shrink-0" />
                            <span className="truncate" title={upload.file_name}>{upload.file_name}</span>
                          </div>
                          {(() => {
                            // Prefer the application for this exact position.
                            const matches = upload.candidate_matches || [];
                            const match =
                              matches.find((m) => m.position?.trim().toLowerCase() === upload.position?.trim().toLowerCase()) ||
                              matches[0];
                            return match ? (
                              <Link
                                to={`/candidates/${match.id}`}
                                className="inline-flex items-center gap-1 mt-1 text-xs font-bold text-[#5A305A] hover:underline"
                              >
                                <ExternalLink size={12} /> Lihat Profil
                                {match.position && match.position !== upload.position ? ` (${match.position})` : ""}
                              </Link>
                            ) : null;
                          })()}
                        </div>
                        <div className="text-right space-y-1 shrink-0">
                          <div className="flex items-center justify-end gap-1 text-[11px] text-[#73507B] font-medium">
                            <Calendar size={11} />
                            <span>{formatUploadedAt(upload.uploaded_at)}</span>
                          </div>
                          <div className="flex items-center justify-end gap-1 text-[11px] text-[#73507B]">
                            <User size={11} />
                            <span>{upload.sender_name}</span>
                          </div>
                          <button
                            onClick={() => setDeleteTarget([upload.id])}
                            className="mt-2 p-1.5 text-[#73507B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-all inline-flex"
                            title="Hapus riwayat"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Pagination Controls */}
                  {totalItems > itemsPerPage && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-5 mt-6 border-t border-white/60">
                      <div className="text-sm text-[#73507B]">
                        Menampilkan{" "}
                        <span className="font-semibold text-[#5A305A]">
                          {(currentPage - 1) * itemsPerPage + 1}
                        </span>{" "}
                        &ndash;{" "}
                        <span className="font-semibold text-[#5A305A]">
                          {Math.min(currentPage * itemsPerPage, totalItems)}
                        </span>{" "}
                        dari{" "}
                        <span className="font-semibold text-[#5A305A]">
                          {totalItems}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((prev) => prev - 1)}
                          className="p-2 rounded-full border border-[#5A305A]/20 bg-white/60 text-[#5A305A] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                          title="Sebelumnya"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <div className="flex items-center gap-1">
                          {Array.from(
                            {
                              length: Math.min(
                                5,
                                Math.ceil(totalItems / itemsPerPage),
                              ),
                            },
                            (_, i) => {
                              let pageNum = currentPage;
                              const totalPages = Math.ceil(
                                totalItems / itemsPerPage,
                              );
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
                                    "w-9 h-9 rounded-full text-sm font-semibold transition-all",
                                    currentPage === pageNum
                                      ? "bg-[#5A305A] text-white shadow-md shadow-[#5A305A]/30"
                                      : "text-[#5A305A] hover:bg-white/70",
                                  )}
                                >
                                  {pageNum}
                                </button>
                              );
                            },
                          )}
                        </div>
                        <button
                          disabled={
                            currentPage === Math.ceil(totalItems / itemsPerPage)
                          }
                          onClick={() => setCurrentPage((prev) => prev + 1)}
                          className="p-2 rounded-full border border-[#5A305A]/20 bg-white/60 text-[#5A305A] hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center"
                          title="Selanjutnya"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-[#73507B] gap-3">
                  <div className="p-4 bg-white/50 rounded-full border border-white/60 shadow-sm">
                    <Search size={32} />
                  </div>
                  <p className="text-sm font-medium">
                    Tidak ada data ditemukan
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Hapus Riwayat Upload"
        message={`Hapus ${deleteTarget?.length || 0} riwayat upload? Data kandidat dan file CV yang sudah masuk sistem tidak ikut terhapus.`}
        confirmText="Ya, Hapus"
        variant="danger"
        loading={deleting}
      />

      <BulkUploadModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        onSuccess={() => {
          fetchUploads();
          setIsBulkModalOpen(false);
        }}
      />
    </div>
  );
}
