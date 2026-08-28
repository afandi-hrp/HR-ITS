import React, { useState, useEffect } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Candidate } from "../types";
import {
  Search,
  Filter,
  RefreshCcw,
  Users,
  X,
  Calendar,
  Mail,
  Phone,
  Briefcase,
  Star,
  FileText,
  ChevronDown,
  Trash2,
  CheckSquare,
  Square,
  Sparkles,
  Database,
  Download,
  Loader2,
  RotateCcw,
  FilterX,
} from "lucide-react";
import { formatDate, cn, fetchWithRetry } from "../lib/utils";
import { CandidateAvatar } from "../components/CandidateAvatar";
import { removeDocumentFile } from "../lib/documentStorage";
import { useToast } from "../components/ui/use-toast";
import JSONRenderer from "../components/JSONRenderer";
import * as XLSX from "xlsx";

export default function Logs() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = location.state?.highlightId;
  const [blinkingId, setBlinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightId) {
      setBlinkingId(highlightId);
      const timer = setTimeout(() => {
        setBlinkingId(null);
      }, 5000);

      setTimeout(() => {
        document
          .getElementById(`log-${highlightId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [highlightId]);

  const [logs, setLogs] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(searchParams.get("q") || "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    
    if (search) params.set("q", search);
    else params.delete("q");
    
    if (startDate) params.set("startDate", startDate);
    else params.delete("startDate");
    
    if (endDate) params.set("endDate", endDate);
    else params.delete("endDate");
    
    if (statusFilter !== "all") params.set("status", statusFilter);
    else params.delete("status");
    
    if (currentPage !== 1) params.set("page", currentPage.toString());
    else params.delete("page");

    const currentParams = searchParams.toString();
    const newParams = params.toString();
    if (currentParams !== newParams) {
      setSearchParams(params, { replace: true });
    }
  }, [search, startDate, endDate, statusFilter, currentPage, setSearchParams, searchParams]);
  const [selectedLog, setSelectedLog] = useState<Candidate | null>(null);
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalData, setDeleteModalData] = useState<Candidate | null>(
    null,
  );
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [restoreModalData, setRestoreModalData] = useState<Candidate | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<"pending" | "accepted">("pending");
  const [isRestoring, setIsRestoring] = useState(false);

  const [exportPreviewOpen, setExportPreviewOpen] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  const { toast } = useToast();

  const isFirstRender = React.useRef(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      if (isFirstRender.current) {
        isFirstRender.current = false;
      } else {
        setCurrentPage(1); // Reset to first page on new search
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchLogs = async () => {
    setLoading(true);
    const from = (currentPage - 1) * itemsPerPage;
    const to = from + itemsPerPage - 1;

    let query = supabase
      .from("candidate_logs")
      .select("*, external_data(raw_data)", { count: "exact" });

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

    let { data, error, count } = await query
      .order("archived_at", { ascending: false })
      .range(from, to);

    // Handle array case if relationship returns an array
    if (data && !error) {
      data = data.map((d) => {
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
          data = data.map((d) => {
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
      setLogs(data || []);
      setTotalItems(count || 0);
    }
    setLoading(false);
  };

  const handlePrepareExport = async () => {
    setExportLoading(true);
    try {
      let query = supabase
        .from("candidate_logs")
        .select("*, external_data(raw_data)");

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

      const { data, error } = await query.order("archived_at", {
        ascending: false,
      });

      if (error) {
        throw error;
      }

      const formatted = (data || []).map((c) => ({
        "Nama Kandidat": c.full_name || "-",
        Posisi: c.position || "-",
        "Email Kandidat": c.email || "-",
        // Force string type in Excel for phone number to prevent stripping leading zeros
        "Nomor Telepon": c.phone ? `'${c.phone}` : "-",
        "Status Psikotest": c.psikotes_status || "-",
        "Status Interview": c.interview_status || "-",
        Status:
          c.status_screening === "hired"
            ? "Diterima"
            : c.status_screening === "rejected" ||
                c.status_screening === "Tidak Lolos"
              ? "Ditolak"
              : "Proses",
        "Skor Screening":
          c.ai_screening_score != null ? c.ai_screening_score : "-",
        "Sumber Lowongan": c.source_info || "-",
      }));

      setExportData(formatted);
      setExportPreviewOpen(true);
    } catch (err: any) {
      toast({
        title: "Export Gagal",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Log Kandidat");

      const colWidths = [
        { wch: 30 },
        { wch: 25 },
        { wch: 35 },
        { wch: 20 },
        { wch: 20 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 25 },
      ];
      worksheet["!cols"] = colWidths;

      XLSX.writeFile(
        workbook,
        `Log_Kandidat_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      setExportPreviewOpen(false);
      toast({ title: "Berhasil", description: "Data Excel berhasil diunduh." });
    } catch (error) {
      toast({
        title: "Error",
        description: "Gagal men-generate file Excel",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [
    currentPage,
    itemsPerPage,
    debouncedSearch,
    startDate,
    endDate,
    statusFilter,
  ]);

  const handleDelete = async () => {
    if (!deleteModalData) return;
    setIsDeleting(true);
    try {
      // 1. Ambil data kandidat untuk mendapatkan URL file dan ID eksternal
      const { data: candidate, error: fetchError } = await supabase
        .from("candidate_logs")
        .select("resume_url, psikotes_result_url, linked_external_id")
        .eq("id", deleteModalData.id)
        .single();

      if (fetchError) throw fetchError;

      if (candidate) {
        // 2. Hapus file fisik dari storage (menangani bucket lama & baru)
        await removeDocumentFile(candidate.resume_url);
        await removeDocumentFile(candidate.psikotes_result_url);

        // 3. Ambil data eksternal jika ada untuk mendapatkan URL file tambahan
        if (candidate.linked_external_id) {
          const { data: externalData } = await supabase
            .from("external_data")
            .select("raw_data")
            .eq("uid_sheet", candidate.linked_external_id)
            .single();

          if (externalData?.raw_data) {
            const raw = externalData.raw_data;
            await Promise.all([
              removeDocumentFile(raw.photo_url),
              removeDocumentFile(raw.ktp_url),
              removeDocumentFile(raw.ijazah_url),
              removeDocumentFile(raw.transcript_url),
              removeDocumentFile(raw.other_doc_url),
              removeDocumentFile(raw.payslip_url),
              removeDocumentFile(raw.signature_url),
              removeDocumentFile(raw.remuneration_signature_url),
            ]);
          }
        }

        // 4. Hapus data eksternal yang tertaut
        if (candidate.linked_external_id) {
          await supabase
            .from("external_data")
            .delete()
            .eq("uid_sheet", candidate.linked_external_id);
        }
      }

      // 5. Hapus baris kandidat dari tabel log
      const { error } = await supabase
        .from("candidate_logs")
        .delete()
        .eq("id", deleteModalData.id);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description:
          "Kandidat beserta file dan data eksternal berhasil dihapus.",
      });
      setDeleteModalData(null);
      fetchLogs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreModalData) return;
    setIsRestoring(true);
    try {
      const response = await fetchWithRetry("/api/candidates/restore-from-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId: restoreModalData.id, newStatus: restoreStatus }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal mengaktifkan kembali kandidat.");

      toast({
        title: "Berhasil",
        description: `${restoreModalData.full_name} telah diaktifkan kembali ke pipeline aktif.`,
      });
      setRestoreModalData(null);
      setSelectedLog(null);
      setRestoreStatus("pending");
      fetchLogs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setIsDeleting(true);
    try {
      // 1. Ambil data kandidat untuk mendapatkan URL file dan ID eksternal
      const { data: candidates, error: fetchError } = await supabase
        .from("candidate_logs")
        .select("resume_url, psikotes_result_url, linked_external_id")
        .in("id", selectedIds);

      if (fetchError) throw fetchError;

      if (candidates && candidates.length > 0) {
        // 2. Hapus file fisik dari storage (menangani bucket lama & baru), dan
        // kumpulkan ID eksternal yang perlu dihapus
        const externalIdsToDelete: string[] = [];
        const removalPromises: Promise<void>[] = [];

        candidates.forEach((candidate) => {
          removalPromises.push(removeDocumentFile(candidate.resume_url));
          removalPromises.push(removeDocumentFile(candidate.psikotes_result_url));

          if (candidate.linked_external_id) {
            externalIdsToDelete.push(candidate.linked_external_id);
          }
        });

        // Ambil data eksternal jika ada untuk mendapatkan URL file tambahan
        if (externalIdsToDelete.length > 0) {
          const { data: externalDataList } = await supabase
            .from("external_data")
            .select("raw_data")
            .in("uid_sheet", externalIdsToDelete);

          if (externalDataList) {
            externalDataList.forEach((ext) => {
              if (ext.raw_data) {
                const raw = ext.raw_data;
                removalPromises.push(
                  removeDocumentFile(raw.photo_url),
                  removeDocumentFile(raw.ktp_url),
                  removeDocumentFile(raw.ijazah_url),
                  removeDocumentFile(raw.transcript_url),
                  removeDocumentFile(raw.other_doc_url),
                  removeDocumentFile(raw.payslip_url),
                  removeDocumentFile(raw.signature_url),
                  removeDocumentFile(raw.remuneration_signature_url),
                );
              }
            });
          }
        }

        await Promise.all(removalPromises);

        // 4. Hapus data eksternal yang tertaut
        if (externalIdsToDelete.length > 0) {
          await supabase
            .from("external_data")
            .delete()
            .in("uid_sheet", externalIdsToDelete);
        }
      }

      // 5. Hapus baris kandidat dari tabel log
      const { error } = await supabase
        .from("candidate_logs")
        .delete()
        .in("id", selectedIds);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: `${selectedIds.length} kandidat beserta file dan data eksternal berhasil dihapus.`,
      });
      setBulkDeleteModalOpen(false);
      setSelectedIds([]);
      setIsBulkDeleteMode(false);
      fetchLogs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const toggleAllSelection = () => {
    if (selectedIds.length === logs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(logs.map((log) => log.id));
    }
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;

  return (
    <div className="space-y-4 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-[#5A305A]">
            Log Kandidat
          </h1>
          <p className="text-sm font-medium text-[#5A305A]/70 max-w-xl">
            Arsip riwayat kandidat yang telah diproses.
          </p>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Cari di arsip..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
            <Filter size={16} className="text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-700"
            >
              <option value="all">Semua Status</option>
              <option value="accepted">Diterima</option>
              <option value="rejected">Ditolak</option>
              <option value="hired">Direkrut</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
            <Calendar size={16} className="text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            {isBulkDeleteMode && selectedIds.length > 0 && (
              <button
                onClick={() => setBulkDeleteModalOpen(true)}
                className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-sm shadow-red-200 flex items-center gap-2"
              >
                <Trash2 size={16} />
                Hapus Terpilih ({selectedIds.length})
              </button>
            )}
            <button
              onClick={() => {
                setIsBulkDeleteMode(!isBulkDeleteMode);
                if (isBulkDeleteMode) setSelectedIds([]);
              }}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-xl transition-all border",
                isBulkDeleteMode
                  ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
              )}
            >
              {isBulkDeleteMode ? "Batal Hapus Masal" : "Hapus Masal"}
            </button>
            <button
              onClick={() => {
                setSearch("");
                setStartDate("");
                setEndDate("");
                setStatusFilter("all");
                setCurrentPage(1);
              }}
              className="p-2.5 text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
              title="Reset Filter"
            >
              <FilterX size={20} />
            </button>
            <button
              onClick={fetchLogs}
              className="p-2.5 text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center"
            >
              <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handlePrepareExport}
              disabled={exportLoading}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold rounded-xl transition-all shadow-sm border border-emerald-200 disabled:opacity-50 text-sm whitespace-nowrap"
            >
              {exportLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              <span className="hidden sm:inline">Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {logs.map((log) => (
          <div
            key={log.id}
            id={`log-${log.id}`}
            className={cn(
              "bg-white/70 backdrop-blur-md rounded-2xl border shadow-sm overflow-hidden transition-all cursor-pointer hover:-translate-y-1 hover:shadow-md flex flex-col",
              selectedIds.includes(log.id)
                ? "border-indigo-500 ring-2 ring-indigo-200"
                : "border-slate-200",
              blinkingId === log.id
                ? "animate-pulse ring-2 ring-indigo-500 ring-inset"
                : "",
            )}
            onClick={() => {
              if (isBulkDeleteMode) {
                toggleSelection(log.id);
              } else {
                setSelectedLog(log);
              }
            }}
          >
            {/* Card Header (Portrait Style) */}
            <div className="relative pt-6 pb-4 px-6 flex flex-col items-center text-center border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white">
              {isBulkDeleteMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(log.id);
                  }}
                  className="absolute top-4 left-4 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {selectedIds.includes(log.id) ? (
                    <CheckSquare size={24} className="text-indigo-600" />
                  ) : (
                    <Square size={24} />
                  )}
                </button>
              )}

              {!isBulkDeleteMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteModalData(log);
                  }}
                  className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Hapus Kandidat"
                >
                  <Trash2 size={18} />
                </button>
              )}

              <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-3xl font-bold mb-4 shadow-inner overflow-hidden">
                <CandidateAvatar
                  source={log.external_data?.raw_data || log.source_info}
                  alt={log.full_name}
                  className="w-full h-full object-cover"
                  fallback={log.full_name?.[0] || "?"}
                />
              </div>
              <div className="flex flex-col items-center gap-1 mt-1">
                <h3 className="text-lg font-bold text-[#5A305A] line-clamp-1">
                  {log.full_name}
                </h3>
                {log.is_blacklisted && (
                  <span
                    className="px-2 py-0.5 bg-black text-white text-[10px] font-bold rounded"
                    title={
                      log.blacklist_reason ||
                      "Kandidat berada dalam daftar blacklist"
                    }
                  >
                    BLACKLIST
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1 line-clamp-1">
                {log.position}
              </p>
            </div>

            {/* Card Body */}
            <div className="p-6 flex-1 flex flex-col gap-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500 flex items-center gap-1">
                  <Calendar size={14} /> Arsip
                </span>
                <span className="font-medium text-slate-700">
                  {log.archived_at
                    ? formatDate(log.archived_at)
                    : formatDate(log.created_at)}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {log.status_screening === "hired" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                      <Briefcase size={12} /> Direkrut
                    </span>
                  )}
                  {log.status_screening === "accepted" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                      <Star size={12} /> Diterima
                    </span>
                  )}
                  {log.status_screening === "rejected" && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800">
                      <X size={12} /> Ditolak
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                      log.psikotes_status === "Sudah Psikotes"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-50 text-slate-600 border border-slate-200",
                    )}
                  >
                    {log.psikotes_status || "Belum Psikotes"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                      log.interview_status === "Sudah Interview"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-50 text-slate-600 border border-slate-200",
                    )}
                  >
                    {log.interview_status || "Belum Interview"}
                  </span>
                </div>
              </div>

              {log.notes && (
                <div className="mt-auto pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 line-clamp-2 italic">
                    "{log.notes}"
                  </p>
                </div>
              )}
            </div>

            {/* Card Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-2 mt-auto">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Skor Screening
                </span>
                <span className="text-lg font-black text-indigo-600">
                  {log.assessment_score || 0}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {logs.length === 0 && !loading && (
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200 shadow-sm text-center py-20">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
            <Users className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-[#5A305A]">Arsip kosong</h3>
          <p className="text-slate-500">
            Kandidat yang dipindahkan ke log akan muncul di sini.
          </p>
        </div>
      )}

      {/* Pagination Controls */}
      {totalItems > 0 && (
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <p className="text-sm text-slate-500">
              Menampilkan{" "}
              <span className="font-bold text-[#5A305A]">{startIndex + 1}</span>{" "}
              -{" "}
              <span className="font-bold text-[#5A305A]">
                {Math.min(startIndex + itemsPerPage, totalItems)}
              </span>{" "}
              dari{" "}
              <span className="font-bold text-[#5A305A]">{totalItems}</span>{" "}
              arsip
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
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[10, 20, 50, 100].map((val) => (
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
            <div className="flex gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage;
                if (currentPage <= 3) pageNum = i + 1;
                else if (currentPage >= totalPages - 2)
                  pageNum = totalPages - 4 + i;
                else pageNum = currentPage - 2 + i;

                if (pageNum > 0 && pageNum <= totalPages) {
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-sm font-bold transition-all",
                        currentPage === pageNum
                          ? "bg-[#5A305A] text-white shadow-md shadow-indigo-200"
                          : "text-slate-600 hover:bg-slate-100",
                      )}
                    >
                      {pageNum}
                    </button>
                  );
                }
                return null;
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

      {/* Restore Confirmation Modal */}
      {restoreModalData && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <RotateCcw size={32} />
              </div>
              <h3 className="text-xl font-bold text-[#5A305A]">
                Aktifkan Kembali Kandidat
              </h3>
              <p className="text-slate-500">
                <span className="font-bold text-[#5A305A]">
                  {restoreModalData.full_name}
                </span>{" "}
                akan dipindahkan kembali ke pipeline aktif (Screening).
                Riwayat jadwal & evaluasi sebelumnya (kalau ada) tidak ikut
                kembali — cuma biodata, CV, dan skor asesmen.
              </p>
              <div className="text-left space-y-2 pt-2">
                <label className="text-sm font-bold text-slate-700">
                  Kandidat masuk ke status:
                </label>
                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setRestoreStatus("pending")}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                      restoreStatus === "pending"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    Belum Diproses
                  </button>
                  <button
                    type="button"
                    onClick={() => setRestoreStatus("accepted")}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-sm font-bold transition-all",
                      restoreStatus === "accepted"
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    Lolos Screening
                  </button>
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setRestoreModalData(null)}
                disabled={isRestoring}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleRestore}
                disabled={isRestoring}
                className="flex-1 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRestoring ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <RotateCcw size={18} />
                )}
                Aktifkan Kembali
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-[#5A305A]">
                Hapus Kandidat
              </h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menghapus kandidat{" "}
                <span className="font-bold text-[#5A305A]">
                  {deleteModalData.full_name}
                </span>{" "}
                dari arsip? Tindakan ini tidak dapat dibatalkan.
              </p>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setDeleteModalData(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-sm shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <RefreshCcw size={18} className="animate-spin" />
                ) : (
                  "Ya, Hapus"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-out-105 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-[#5A305A]">
                Detail Arsip Kandidat
              </h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              {/* Header Info */}
              <div className="flex items-start gap-6">
                <div className="w-20 h-20 rounded-2xl bg-indigo-100 flex items-center justify-center text-indigo-700 text-3xl font-bold overflow-hidden shrink-0">
                  <CandidateAvatar
                    source={selectedLog.external_data?.raw_data || selectedLog.source_info}
                    alt={selectedLog.full_name}
                    className="w-full h-full object-cover"
                    fallback={selectedLog.full_name?.[0] || "?"}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-bold text-[#5A305A]">
                      {selectedLog.full_name}
                    </h3>
                    {selectedLog.status_screening === "hired" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-800">
                        <Briefcase size={10} />
                        Direkrut
                      </span>
                    )}
                    {selectedLog.status_screening === "accepted" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800">
                        <Star size={10} />
                        Diterima
                      </span>
                    )}
                    {selectedLog.status_screening === "rejected" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-800">
                        <X size={10} />
                        Ditolak
                      </span>
                    )}
                  </div>
                  <p className="text-slate-500 font-medium mt-1">
                    {selectedLog.position}
                  </p>
                  <div className="flex flex-wrap gap-4 mt-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Mail size={16} className="text-slate-400" />
                      {selectedLog.email}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Phone size={16} className="text-slate-400" />
                      {selectedLog.phone}
                    </div>
                    {selectedLog.source_info && (
                      <div className="flex items-start gap-2 text-sm text-slate-600">
                        <Database
                          size={16}
                          className="text-slate-400 mt-0.5 shrink-0"
                        />
                        <div className="max-w-xs overflow-hidden">
                          {typeof selectedLog.source_info === "string" ? (
                            <span className="truncate">
                              {selectedLog.source_info}
                            </span>
                          ) : (
                            <div className="text-xs bg-slate-100 p-2 rounded-lg max-h-32 overflow-y-auto custom-scrollbar">
                              <JSONRenderer data={selectedLog.source_info} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Informasi Proses
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Status Psikotes
                      </span>
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          selectedLog.psikotes_status === "Sudah Psikotes"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-[#5A305A]",
                        )}
                      >
                        {selectedLog.psikotes_status || "Belum"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Status Interview
                      </span>
                      <span
                        className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          selectedLog.interview_status === "Sudah Interview"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-200 text-[#5A305A]",
                        )}
                      >
                        {selectedLog.interview_status || "Belum"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Skor Screening
                      </span>
                      <span className="text-lg font-bold text-indigo-600">
                        {selectedLog.assessment_score || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Skor Asesmen
                      </span>
                      <span className="text-lg font-bold text-indigo-600">
                        {Math.round(
                          ((selectedLog.technical_score || 0) +
                            (selectedLog.communication_score || 0) +
                            (selectedLog.problem_solving_score || 0) +
                            (selectedLog.teamwork_score || 0) +
                            (selectedLog.leadership_score || 0) +
                            (selectedLog.adaptability_score || 0)) /
                            6,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-slate-50 p-6 rounded-2xl border border-slate-100">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Riwayat Waktu
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Calendar size={16} className="text-slate-400" />
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                          Didaftarkan
                        </p>
                        <p className="text-sm font-medium text-slate-700">
                          {formatDate(selectedLog.date)}
                        </p>
                      </div>
                    </div>
                    {selectedLog.archived_at && (
                      <div className="flex items-center gap-3">
                        <RefreshCcw size={16} className="text-slate-400" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">
                            Diarsipkan
                          </p>
                          <p className="text-sm font-medium text-slate-700">
                            {formatDate(selectedLog.archived_at)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedLog.notes && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Catatan / Keterangan
                  </h4>
                  <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-100 text-sm text-slate-700 leading-relaxed">
                    {selectedLog.notes}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-3">
              <button
                onClick={() => {
                  setRestoreStatus("pending");
                  setRestoreModalData(selectedLog);
                }}
                className="px-6 py-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold rounded-xl hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={16} />
                Aktifkan Kembali
              </button>
              <button
                onClick={() => setSelectedLog(null)}
                className="px-8 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-all"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-[#5A305A]">Hapus Masal</h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menghapus{" "}
                <span className="font-bold text-[#5A305A]">
                  {selectedIds.length}
                </span>{" "}
                kandidat terpilih dari arsip? Tindakan ini tidak dapat
                dibatalkan.
              </p>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setBulkDeleteModalOpen(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
              >
                Batal
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-all shadow-sm shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <RefreshCcw size={18} className="animate-spin" />
                ) : (
                  "Ya, Hapus Semua"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Preview Modal */}
      {exportPreviewOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <Download size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#5A305A]">
                    Preview Data Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    Menampilkan {Math.min(exportData.length, 20)} baris pertama
                    dari total {exportData.length} baris yang akan diekspor.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExportPreviewOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-auto bg-slate-50/50 p-6 flex-1">
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-max">
                    <thead>
                      <tr className="bg-[#5A305A]/5 text-[#5A305A] text-[11px] font-extrabold uppercase tracking-wider">
                        <th className="p-4 py-3 border-b border-slate-200">
                          Nama Kandidat
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200">
                          Posisi
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200">
                          Email
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200">
                          No Telepon
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200">
                          Stat Psikotest
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200">
                          Stat Interview
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200 text-center">
                          Status
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200 text-center">
                          Skor
                        </th>
                        <th className="p-4 py-3 border-b border-slate-200">
                          Sumber
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-xs divide-y divide-slate-100">
                      {exportData.slice(0, 20).map((row, i) => (
                        <tr
                          key={i}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="p-4 py-2 font-medium text-[#5A305A]">
                            {row["Nama Kandidat"]}
                          </td>
                          <td className="p-4 py-2 text-slate-600">
                            {row["Posisi"]}
                          </td>
                          <td className="p-4 py-2 text-slate-500">
                            {row["Email Kandidat"]}
                          </td>
                          <td className="p-4 py-2 font-mono text-slate-600">
                            {row["Nomor Telepon"].replace(/^'/, "")}
                          </td>
                          <td className="p-4 py-2 text-slate-600">
                            {row["Status Psikotest"]}
                          </td>
                          <td className="p-4 py-2 text-slate-600">
                            {row["Status Interview"]}
                          </td>
                          <td className="p-4 py-2 text-center">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                                row["Status"] === "Diterima"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : row["Status"] === "Ditolak"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-slate-100 text-slate-600",
                              )}
                            >
                              {row["Status"]}
                            </span>
                          </td>
                          <td className="p-4 py-2 text-center font-bold text-indigo-600">
                            {row["Skor Screening"]}
                          </td>
                          <td className="p-4 py-2 text-slate-600">
                            {row["Sumber Lowongan"]}
                          </td>
                        </tr>
                      ))}
                      {exportData.length === 0 && (
                        <tr>
                          <td
                            colSpan={9}
                            className="p-8 text-center text-slate-500 italic"
                          >
                            Tidak ada data untuk diekspor.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="p-6 bg-white border-t border-slate-100 flex items-center justify-between shrink-0">
              <span className="text-sm font-medium text-slate-500">
                Total Baris:{" "}
                <strong className="text-[#5A305A]">{exportData.length}</strong>
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setExportPreviewOpen(false)}
                  className="px-6 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all"
                >
                  Batal
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={exportData.length === 0}
                  className="px-6 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-200 flex items-center gap-2 disabled:opacity-50"
                >
                  <Download size={18} />
                  Konfirmasi & Unduh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
