import React, { useState, useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Candidate } from "../types";
import {
  GraduationCap,
  ChevronRight,
  LayoutGrid,
  LayoutList,
  Lightbulb,
  AlertTriangle,
  ExternalLink,
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
import { api } from "../lib/api";
import { useToast } from "../components/ui/use-toast";
import JSONRenderer from "../components/JSONRenderer";
import * as XLSX from "xlsx";
import { usePermissions } from "../hooks/usePermissions";

// Accent + badge per archived outcome (candidate_logs.status_screening).
const STATUS_META: Record<string, { label: string; bar: string; badge: string; Icon: any }> = {
  hired: { label: "Direkrut", bar: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 border-indigo-200", Icon: Briefcase },
  accepted: { label: "Diterima", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: Star },
  rejected: { label: "Ditolak", bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 border-rose-200", Icon: X },
};
const getStatusMeta = (status?: string | null) =>
  STATUS_META[status === "Tidak Lolos" ? "rejected" : status || ""] || null;

// Same average the detail modal always showed: six assessment aspects / 6.
const getAssessmentAverage = (c: any) =>
  Math.round(
    ((c.technical_score || 0) +
      (c.communication_score || 0) +
      (c.problem_solving_score || 0) +
      (c.teamwork_score || 0) +
      (c.leadership_score || 0) +
      (c.adaptability_score || 0)) /
      6,
  );

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
  const { canEdit } = usePermissions();

  const [viewMode, setViewMode] = useState<"card" | "list">("card");

  const renderStatusBadge = (log: any) => {
    const meta = getStatusMeta(log.status_screening);
    if (!meta) return null;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
          meta.badge,
        )}
      >
        <meta.Icon size={12} /> {meta.label}
      </span>
    );
  };

  // psikotes_status / interview_status are stored text from move-to-log
  // ("Sudah …", "Tidak Hadir …", "Belum …"); shown as-is.
  const renderProcessChips = (log: any) =>
    [
      { value: log.psikotes_status || "Belum Psikotes", done: "Sudah Psikotes" },
      { value: log.interview_status || "Belum Interview", done: "Sudah Interview" },
    ].map(({ value, done }) => (
      <span
        key={done}
        className={cn(
          "inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border",
          value === done
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : value.startsWith("Tidak Hadir")
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-slate-50 text-[#73507B] border-slate-200",
        )}
      >
        {value}
      </span>
    ));

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

  const logFilters = () => ({
    search: debouncedSearch,
    startDate,
    endDate,
    status: statusFilter,
  });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      // Filtering, pagination and blacklist flags are resolved server-side
      // (HR only) — see server/routes/logs.ts.
      const { rows, total } = await api.get<{ rows: any[]; total: number }>(
        "/api/logs",
        { ...logFilters(), page: currentPage, pageSize: itemsPerPage },
      );
      setLogs(rows);
      setTotalItems(total);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrepareExport = async () => {
    setExportLoading(true);
    try {
      const { rows: data } = await api.get<{ rows: any[] }>(
        "/api/logs/export",
        logFilters(),
      );

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
      // One server call: deletes the log row, its files, and the linked
      // form — unless another application still uses that form.
      const result = await api.post<{ externalKept: number; filesFailed: number }>(
        "/api/logs/delete",
        { ids: [deleteModalData.id] },
      );

      toast({
        title: "Berhasil",
        description:
          (result.externalKept > 0
            ? "Kandidat beserta file berhasil dihapus. Data eksternal tetap disimpan karena masih ditautkan ke lamaran lain."
            : "Kandidat beserta file dan data eksternal berhasil dihapus.") +
          (result.filesFailed > 0
            ? ` ${result.filesFailed} file gagal dihapus dari storage.`
            : ""),
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
        description:
          `${restoreModalData.full_name} telah diaktifkan kembali ke pipeline aktif.` +
          (result.warning ? ` ${result.warning}` : ""),
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
      const result = await api.post<{
        deleted: number;
        externalKept: number;
        filesFailed: number;
      }>("/api/logs/delete", { ids: selectedIds });

      toast({
        title: "Berhasil",
        description:
          `${result.deleted} kandidat beserta file dan data eksternal berhasil dihapus.` +
          (result.externalKept > 0
            ? ` ${result.externalKept} data eksternal tetap disimpan karena masih ditautkan ke lamaran lain.`
            : "") +
          (result.filesFailed > 0
            ? ` ${result.filesFailed} file gagal dihapus dari storage.`
            : ""),
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
          <h1 className="text-2xl font-extrabold tracking-tight text-[#5A305A]">
            Log Kandidat
          </h1>
          <p className="text-sm font-medium text-[#5A305A]/70 max-w-xl">
            Arsip riwayat kandidat yang telah diproses.
          </p>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
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
            className="w-full pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm h-10"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-10 text-sm">
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
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-10 text-sm">
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
                className="px-4 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-sm shadow-red-200 flex items-center gap-2 h-10"
              >
                <Trash2 size={16} />
                Hapus Terpilih ({selectedIds.length})
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => {
                  setIsBulkDeleteMode(!isBulkDeleteMode);
                  if (isBulkDeleteMode) setSelectedIds([]);
                }}
                className={cn(
                  "px-4 text-sm font-medium rounded-xl transition-all border h-10",
                  isBulkDeleteMode
                    ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                )}
              >
                {isBulkDeleteMode ? "Batal Hapus Masal" : "Hapus Masal"}
              </button>
            )}
            <button
              onClick={() => {
                setSearch("");
                setStartDate("");
                setEndDate("");
                setStatusFilter("all");
                setCurrentPage(1);
              }}
              className="text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-200 rounded-xl transition-all shadow-sm flex items-center justify-center h-10 text-sm w-10 shrink-0"
              title="Reset Filter"
            >
              <FilterX size={20} />
            </button>
            <button
              onClick={fetchLogs}
              className="text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center h-10 text-sm w-10 shrink-0"
            >
              <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
            </button>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl p-1 h-10">
              {(
                [
                  { mode: "card", title: "Tampilan Kartu", Icon: LayoutGrid },
                  { mode: "list", title: "Tampilan Daftar", Icon: LayoutList },
                ] as const
              ).map(({ mode, title, Icon }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "p-1.5 rounded-lg transition-all h-full flex items-center justify-center",
                    viewMode === mode
                      ? "bg-white text-[#5A305A] shadow-sm"
                      : "text-[#73507B] hover:text-[#5A305A]",
                  )}
                  title={title}
                >
                  <Icon size={18} />
                </button>
              ))}
            </div>
            <button
              onClick={handlePrepareExport}
              disabled={exportLoading}
              className="flex items-center justify-center gap-2 px-4 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold rounded-xl transition-all shadow-sm border border-emerald-200 disabled:opacity-50 text-sm whitespace-nowrap h-10"
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

      {viewMode === "card" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {logs.map((log) => {
            const meta = getStatusMeta(log.status_screening);
            const isSelected = selectedIds.includes(log.id);
            return (
              <div
                key={log.id}
                id={`log-${log.id}`}
                className={cn(
                  "group relative bg-white rounded-2xl border shadow-sm overflow-hidden transition-all cursor-pointer hover:-translate-y-1 hover:shadow-lg flex flex-col",
                  isSelected
                    ? "border-[#5A305A] ring-2 ring-[#5A305A]/20"
                    : "border-slate-200 hover:border-[#5A305A]/30",
                  blinkingId === log.id
                    ? "animate-pulse ring-2 ring-indigo-500 ring-inset"
                    : "",
                )}
                onClick={() => {
                  if (isBulkDeleteMode) toggleSelection(log.id);
                  else setSelectedLog(log);
                }}
              >
                <div className={cn("h-1.5 w-full", meta?.bar || "bg-slate-300")} />

                {/* Header */}
                <div className="p-5 pb-4 flex items-start gap-3">
                  {isBulkDeleteMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelection(log.id);
                      }}
                      className="text-[#73507B] hover:text-[#5A305A] transition-colors shrink-0 mt-1"
                    >
                      {isSelected ? (
                        <CheckSquare size={22} className="text-[#5A305A]" />
                      ) : (
                        <Square size={22} />
                      )}
                    </button>
                  )}
                  <div className="w-14 h-14 rounded-2xl bg-[#5A305A]/10 flex items-center justify-center text-[#5A305A] text-xl font-bold overflow-hidden shrink-0 border border-[#5A305A]/10">
                    <CandidateAvatar
                      source={log.external_data?.raw_data || log.source_info}
                      alt={log.full_name}
                      className="w-full h-full object-cover"
                      fallback={log.full_name?.[0] || "?"}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#5A305A] truncate">
                        {log.full_name}
                      </h3>
                      {log.is_blacklisted && (
                        <span
                          className="px-1.5 py-0.5 bg-black text-white text-[10px] font-bold rounded shrink-0"
                          title={log.blacklist_reason || "Kandidat berada dalam daftar blacklist"}
                        >
                          BLACKLIST
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-[#73507B] truncate">
                      {log.position}
                    </p>
                    <div className="mt-2">{renderStatusBadge(log)}</div>
                  </div>
                </div>

                {/* Contact */}
                <div className="px-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-[#73507B] min-w-0">
                    <Mail size={13} className="shrink-0" />
                    <span className="truncate">{log.email || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#73507B] min-w-0">
                    <Phone size={13} className="shrink-0" />
                    <span className="truncate">{log.phone || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#73507B] min-w-0">
                    <GraduationCap size={13} className="shrink-0" />
                    <span className="truncate">{log.education || "-"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#73507B] min-w-0">
                    <Briefcase size={13} className="shrink-0" />
                    <span className="truncate">{log.work_experience || "-"}</span>
                  </div>
                </div>

                {/* Process + dates */}
                <div className="px-5 pt-4 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {renderProcessChips(log)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                      <p className="font-bold text-[#73507B]/70 uppercase tracking-wider text-[9px]">
                        Melamar
                      </p>
                      <p className="font-semibold text-[#5A305A]">{formatDate(log.date)}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5 border border-slate-100">
                      <p className="font-bold text-[#73507B]/70 uppercase tracking-wider text-[9px]">
                        Diarsipkan
                      </p>
                      <p className="font-semibold text-[#5A305A]">
                        {formatDate(log.archived_at || log.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Insight snippets */}
                <div className="px-5 pt-3 space-y-2">
                  {log.notes && (
                    <div className="rounded-xl bg-[#FFF5C5]/60 border border-[#F58C77]/30 px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#73507B]/80">
                        Catatan
                      </p>
                      <p className="text-xs text-[#5A305A] line-clamp-2 italic">
                        {log.notes}
                      </p>
                    </div>
                  )}
                  {log.strengths && (
                    <div className="rounded-xl bg-[#5A305A]/5 border border-[#5A305A]/10 px-3 py-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#73507B]/80 flex items-center gap-1">
                        <Star size={10} /> Kekuatan
                      </p>
                      <p className="text-xs text-[#5A305A] line-clamp-2">{log.strengths}</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="mt-auto pt-4">
                  <div className="px-5 py-3 bg-[#5A305A]/5 border-t border-[#5A305A]/10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-white border border-[#5A305A]/15 rounded-lg px-2.5 py-1 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[#73507B]/70">
                          Skor CV
                        </p>
                        <p className="text-sm font-black text-[#5A305A] leading-tight">
                          {log.assessment_score || 0}
                        </p>
                      </div>
                      <div className="bg-white border border-[#5A305A]/15 rounded-lg px-2.5 py-1 text-center">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-[#73507B]/70">
                          Asesmen
                        </p>
                        <p className="text-sm font-black text-[#5A305A] leading-tight">
                          {getAssessmentAverage(log)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!isBulkDeleteMode && canEdit && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteModalData(log);
                          }}
                          className="p-2 text-[#73507B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus Kandidat"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[#5A305A] flex items-center gap-1 group-hover:gap-2 transition-all">
                        Detail <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {logs.map((log) => {
            const meta = getStatusMeta(log.status_screening);
            const isSelected = selectedIds.includes(log.id);
            return (
              <div
                key={log.id}
                id={`log-${log.id}`}
                className={cn(
                  "group relative bg-white rounded-2xl border shadow-sm overflow-hidden transition-all cursor-pointer hover:shadow-md flex",
                  isSelected
                    ? "border-[#5A305A] ring-2 ring-[#5A305A]/20"
                    : "border-slate-200 hover:border-[#5A305A]/30",
                  blinkingId === log.id
                    ? "animate-pulse ring-2 ring-indigo-500 ring-inset"
                    : "",
                )}
                onClick={() => {
                  if (isBulkDeleteMode) toggleSelection(log.id);
                  else setSelectedLog(log);
                }}
              >
                <div className={cn("w-1.5 shrink-0", meta?.bar || "bg-slate-300")} />
                <div className="flex-1 min-w-0 p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex items-center gap-3 lg:w-[30%] min-w-0">
                    {isBulkDeleteMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelection(log.id);
                        }}
                        className="text-[#73507B] hover:text-[#5A305A] transition-colors shrink-0"
                      >
                        {isSelected ? (
                          <CheckSquare size={22} className="text-[#5A305A]" />
                        ) : (
                          <Square size={22} />
                        )}
                      </button>
                    )}
                    <div className="w-12 h-12 rounded-xl bg-[#5A305A]/10 flex items-center justify-center text-[#5A305A] font-bold overflow-hidden shrink-0 border border-[#5A305A]/10">
                      <CandidateAvatar
                        source={log.external_data?.raw_data || log.source_info}
                        alt={log.full_name}
                        className="w-full h-full object-cover"
                        fallback={log.full_name?.[0] || "?"}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-[#5A305A] truncate">
                          {log.full_name}
                        </h3>
                        {log.is_blacklisted && (
                          <span
                            className="px-1.5 py-0.5 bg-black text-white text-[10px] font-bold rounded shrink-0"
                            title={log.blacklist_reason || "Kandidat berada dalam daftar blacklist"}
                          >
                            BLACKLIST
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-[#73507B] truncate">
                        {log.position}
                      </p>
                    </div>
                  </div>

                  <div className="lg:w-[28%] min-w-0 space-y-1 text-xs text-[#73507B]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail size={13} className="shrink-0" />
                      <span className="truncate">{log.email || "-"}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <Phone size={13} className="shrink-0" />
                      <span className="truncate">{log.phone || "-"}</span>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <GraduationCap size={13} className="shrink-0" />
                      <span className="truncate">{log.education || "-"}</span>
                    </div>
                  </div>

                  <div className="lg:flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {renderStatusBadge(log)}
                      {renderProcessChips(log)}
                    </div>
                    <p className="text-[11px] text-[#73507B]">
                      Melamar {formatDate(log.date)} · Diarsipkan{" "}
                      {formatDate(log.archived_at || log.created_at)}
                    </p>
                    {log.notes && (
                      <p className="text-xs text-[#5A305A] italic line-clamp-1">
                        "{log.notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="bg-[#5A305A]/5 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#73507B]/70">
                        Skor CV
                      </p>
                      <p className="text-sm font-black text-[#5A305A] leading-tight">
                        {log.assessment_score || 0}
                      </p>
                    </div>
                    <div className="bg-[#5A305A]/5 border border-[#5A305A]/15 rounded-lg px-2.5 py-1 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-[#73507B]/70">
                        Asesmen
                      </p>
                      <p className="text-sm font-black text-[#5A305A] leading-tight">
                        {getAssessmentAverage(log)}
                      </p>
                    </div>
                    {!isBulkDeleteMode && canEdit && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteModalData(log);
                        }}
                        className="p-2 text-[#73507B] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Hapus Kandidat"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <ChevronRight
                      size={18}
                      className="text-[#73507B] group-hover:text-[#5A305A] transition-colors"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                    {renderStatusBadge(selectedLog)}
                    {selectedLog.is_blacklisted && (
                      <span
                        className="px-2 py-0.5 bg-black text-white text-[10px] font-bold rounded"
                        title={selectedLog.blacklist_reason || "Kandidat berada dalam daftar blacklist"}
                      >
                        BLACKLIST
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
                      {selectedLog.phone || "-"}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <GraduationCap size={16} className="text-slate-400" />
                      {selectedLog.education || "-"}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Briefcase size={16} className="text-slate-400" />
                      {selectedLog.work_experience || "-"}
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
                        {getAssessmentAverage(selectedLog)}
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

              {(selectedLog.strengths ||
                selectedLog.risk_factors ||
                selectedLog.potential_factors ||
                selectedLog.assessment_reason) && (
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Analisis Kandidat
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {[
                      { label: "Kekuatan", value: selectedLog.strengths, Icon: Star, cls: "bg-indigo-50 border-indigo-100 text-indigo-700" },
                      { label: "Faktor Risiko", value: selectedLog.risk_factors, Icon: AlertTriangle, cls: "bg-amber-50 border-amber-100 text-amber-700" },
                      { label: "Potensi", value: selectedLog.potential_factors, Icon: Lightbulb, cls: "bg-emerald-50 border-emerald-100 text-emerald-700" },
                    ].map(({ label, value, Icon, cls }) => (
                      <div key={label} className={cn("p-3 rounded-xl border", cls)}>
                        <p className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1">
                          <Icon size={12} /> {label}
                        </p>
                        <p className="text-sm text-slate-700 leading-relaxed">{value || "-"}</p>
                      </div>
                    ))}
                  </div>
                  {selectedLog.assessment_reason && (
                    <p className="text-sm text-slate-500 italic leading-relaxed">
                      Alasan skor: "{selectedLog.assessment_reason}"
                    </p>
                  )}
                </div>
              )}

              {[
                { label: "Ringkasan AI (Berdasarkan Biodata)", data: selectedLog.ai_biodata_summary },
                { label: "Ringkasan AI (Berdasarkan Psikotes)", data: selectedLog.ai_psikotes_summary },
              ].map(
                ({ label, data }) =>
                  data && (
                    <div key={label} className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Sparkles size={14} className="text-indigo-500" />
                        {label}
                      </h4>
                      <div className="text-sm text-indigo-900/80 bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-xl border border-indigo-100">
                        <JSONRenderer data={data} />
                      </div>
                    </div>
                  ),
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row justify-end gap-3">
              <Link
                to={`/candidates/${selectedLog.id}`}
                className="px-6 py-2.5 bg-white border border-[#5A305A]/20 text-[#5A305A] font-bold rounded-xl hover:bg-[#5A305A]/5 transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink size={16} />
                Buka Profil Lengkap
              </Link>
              {canEdit && (
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
              )}
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
