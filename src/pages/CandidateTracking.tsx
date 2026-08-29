import React, { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Download, Search, Loader2, Edit2, Check, X } from "lucide-react";

import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

export default function CandidateTracking() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [candidates, setCandidates] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(searchParams.get("q") || "");
  const [positionFilter, setPositionFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [isExporting, setIsExporting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  
  const [currentPage, setCurrentPage] = useState(Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSize] = useState(50);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [externalDataMap, setExternalDataMap] = useState<Record<string, any>>({});

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    
    if (searchTerm) params.set("q", searchTerm);
    else params.delete("q");
    
    if (currentPage !== 1) params.set("page", currentPage.toString());
    else params.delete("page");

    const currentParams = searchParams.toString();
    const newParams = params.toString();
    if (currentParams !== newParams) {
      setSearchParams(params, { replace: true });
    }
  }, [searchTerm, currentPage, setSearchParams, searchParams]);

  
const topScrollRef = useRef<HTMLDivElement>(null);
  const bottomScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(3800);

  useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const updateWidth = () => setTableWidth(el.scrollWidth);
    updateWidth();

    // ResizeObserver reacts to the table's actual rendered size whenever it
    // changes (new columns' content, font load, data arriving async, etc.)
    // instead of guessing a fixed timeout — that guesswork is what let the
    // top scrollbar's spacer fall short of the real table width.
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, [candidates, currentPage, pageSize, searchTerm, editingId]);

  // Guards against the two onScroll handlers re-triggering each other in a
  // feedback loop (top scroll -> sets bottom -> fires bottom's onScroll ->
  // sets top -> fires top's onScroll -> ...), which is what made the two
  // bars visibly lag/drift out of sync during fast scrolling.
  const isSyncingScrollRef = useRef(false);

  // Sync by ratio, not raw pixel scrollLeft — the top bar's spacer width and
  // the bottom table's real scrollWidth aren't guaranteed to end up exactly
  // equal (fonts, async column content, sub-pixel rounding), so a 1:1 pixel
  // copy left the shorter one maxing out before the taller one actually
  // reached its own end. Matching the fraction scrolled (0..1) instead means
  // dragging either bar all the way always drags the other all the way too,
  // regardless of any small width mismatch between them.
  const handleTopScroll = () => {
    if (isSyncingScrollRef.current) return;
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!top || !bottom) return;
    const topMax = top.scrollWidth - top.clientWidth;
    const bottomMax = bottom.scrollWidth - bottom.clientWidth;
    if (topMax <= 0) return;
    isSyncingScrollRef.current = true;
    bottom.scrollLeft = (top.scrollLeft / topMax) * bottomMax;
    isSyncingScrollRef.current = false;
  };

  const handleBottomScroll = () => {
    if (isSyncingScrollRef.current) return;
    const top = topScrollRef.current;
    const bottom = bottomScrollRef.current;
    if (!top || !bottom) return;
    const topMax = top.scrollWidth - top.clientWidth;
    const bottomMax = bottom.scrollWidth - bottom.clientWidth;
    if (bottomMax <= 0) return;
    isSyncingScrollRef.current = true;
    top.scrollLeft = (bottom.scrollLeft / bottomMax) * topMax;
    isSyncingScrollRef.current = false;
  };

  const handleEdit = (c: any) => {
    setEditingId(c.id);
    setEditForm({
      trial_1_date: c.trial_1_date || "",
      trial_2_date: c.trial_2_date || "",
      trial_3_date: c.trial_3_date || "",
      trial_result: c.trial_result || "",
      background_check_date: c.background_check_date || "",
      background_check_result: c.background_check_result || "",
      join_date: c.join_date || "",
      finance_reject_reason: c.finance_reject_reason || "",
      notes: c.notes || ""
    });
  };

  const handleSave = async (id: string, isLog: boolean) => {
    try {
      const table = isLog ? "candidate_logs" : "candidates";
      
      const payload: any = {};
      Object.keys(editForm).forEach(k => {
        payload[k] = editForm[k] === "" ? null : editForm[k];
      });

      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq("id", id);
        
      if (error) throw error;
      
      setCandidates(candidates.map(c => c.id === id ? { ...c, ...payload } : c));
      setEditingId(null);
    } catch (err) {
      console.error("Error updating candidate:", err);
      alert("Gagal mengupdate data");
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch active candidates
      const { data: activeData, error: activeError } = await supabase
        .from("candidates")
        .select(`
          *,
          psikotes_schedules (is_confirmed, schedule_date),
          interview_schedules (is_confirmed, schedule_date, additional_notes),
          candidate_evaluations (evaluation_type, interviewer_name, total_score, evaluation_data)
        `)
        .order("created_at", { ascending: false });

      if (activeError) throw activeError;

      // Fetch logged candidates
      const { data: loggedData, error: loggedError } = await supabase
        .from("candidate_logs")
        .select(`
          *
        `)
        .order("created_at", { ascending: false });

      if (loggedError) throw loggedError;

      const combined = [...(activeData || []), ...(loggedData || [])];
      setCandidates(combined);

      // Fetch linked external application-form data, used as a fallback source
      // for "Sumber CV" when candidates.source_info wasn't set directly.
      const linkedIds = Array.from(
        new Set(combined.map((c) => c.linked_external_id).filter(Boolean)),
      );
      if (linkedIds.length > 0) {
        const { data: extData, error: extError } = await supabase
          .from("external_data")
          .select("uid_sheet, raw_data")
          .in("uid_sheet", linkedIds);

        if (!extError && extData) {
          const map: Record<string, any> = {};
          extData.forEach((row) => {
            map[row.uid_sheet] = row.raw_data;
          });
          setExternalDataMap(map);
        }
      }
    } catch (err) {
      console.error("Error fetching tracking data:", err);
    } finally {
      setIsLoading(false);
    }
  };
  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "";
    try {
      return format(new Date(dateString), "dd-MMM-yy", { locale: idLocale });
    } catch {
      return dateString;
    }
  };

  // Sumber CV: prefer the direct column; fall back to the linked application
  // form's "how did you find this vacancy" answer (external_data.raw_data.job_vacancy_info).
  const getSourceCv = (c: any) => {
    if (c.source_info) return c.source_info;
    const linked = c.linked_external_id ? externalDataMap[c.linked_external_id] : null;
    return linked?.job_vacancy_info || "";
  };

  const positionOptions = Array.from(
    new Set(candidates.map((c) => c.position).filter(Boolean)),
  ).sort();
  const sourceOptions = Array.from(
    new Set(candidates.map((c) => getSourceCv(c)).filter(Boolean)),
  ).sort();

  const filteredCandidates = candidates.filter((c) => {
    const matchesSearch =
      c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.position?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPosition =
      positionFilter === "all" || c.position === positionFilter;
    const matchesSource =
      sourceFilter === "all" || getSourceCv(c) === sourceFilter;
    return matchesSearch && matchesPosition && matchesSource;
  });

  const totalPages = pageSize === Infinity ? 1 : Math.ceil(filteredCandidates.length / pageSize);
  const paginatedCandidates = pageSize === Infinity ? filteredCandidates : filteredCandidates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Hasil Psikotes: derived from the General Learning Ability sub-score inside
  // ai_psikotes_summary, not from whether a result file was uploaded.
  const getPsikotesResult = (c: any) => {
    const skorRaw = c.ai_psikotes_summary?.data_hasil_psikotes?.general_learning_ability?.skor;
    const skor = parseFloat(skorRaw);
    if (isNaN(skor)) return "";
    if (skor < 84) return "NOK";
    if (skor <= 96) return "To be Considered";
    return "OK";
  };

  // Tgl Background Checking: sourced from the Reference Check submission date,
  // falling back to the manually-entered background_check_date for older records
  // that predate the Reference Check feature.
  const getBackgroundCheckDate = (c: any) => {
    const refCheck = c.candidate_evaluations?.find(
      (e: any) => e.evaluation_type === "REFERENCE_CHECK",
    );
    const checkedDate = refCheck?.evaluation_data?.checked_date;
    return checkedDate || c.background_check_date || "";
  };

  const getEvalField = (evalObj: any, fieldPart: string) => {
    if (!evalObj || !evalObj.evaluation_data) return "";
    const data = evalObj.evaluation_data;
    for (const key in data) {
      if (key.toLowerCase().includes(fieldPart.toLowerCase())) {
        return data[key];
      }
    }
    return evalObj.total_score || "";
  };

  const handleExportExcel = () => {
    setIsExporting(true);
    try {
      const exportData = paginatedCandidates.map((c, idx) => {
        const index = (currentPage - 1) * (pageSize === Infinity ? 0 : pageSize) + idx;
        // Find HR evaluation
        const hrEval = c.candidate_evaluations?.find(
          (e: any) => e.evaluation_type === "HR",
        );
        // Find USER evaluation
        const userEval = c.candidate_evaluations?.find(
          (e: any) => e.evaluation_type === "USER",
        );

        // Psikotes date and presence
        let psikotesDate = "";
        let kehadiran = "";
        let tglInterviewHR = "";
        let tglInterviewUser = "";
        
        // Try to get dates from active schedules first, or fallback to status if logged
        if (c.psikotes_schedules && c.psikotes_schedules.length > 0) {
          psikotesDate = formatDate(c.psikotes_schedules[0].schedule_date);
          kehadiran = c.psikotes_schedules[0].is_confirmed ? "Hadir" : "Belum Hadir";
        }

        if (c.interview_schedules && c.interview_schedules.length > 0) {
          const hrSchedules = c.interview_schedules.filter((s: any) => !s.additional_notes?.startsWith('[USER]'));
          const userSchedules = c.interview_schedules.filter((s: any) => s.additional_notes?.startsWith('[USER]'));
          
          if (hrSchedules.length > 0) {
            tglInterviewHR = formatDate(hrSchedules[hrSchedules.length - 1].schedule_date);
          }
          if (userSchedules.length > 0) {
            tglInterviewUser = formatDate(userSchedules[userSchedules.length - 1].schedule_date);
          }
        }

        return {
          "No": index + 1,
          "Posisi": c.position || "",
          "Sumber CV": getSourceCv(c),
          "Nama Kandidat": c.full_name || "",
          "No Hp": c.phone || "",
          "Email": c.email || "",
          "Tgl Pemanggilan": psikotesDate || tglInterviewHR,
          "Kehadiran": kehadiran,
          "Hasil Psikotes": getPsikotesResult(c),
          "Tgl Interview HR": tglInterviewHR,
          "HR Interviewer": hrEval?.interviewer_name || "",
          "Result": getEvalField(hrEval, "recommendation"),
          "Tgl Interview User": tglInterviewUser,
          "User": userEval?.interviewer_name || "",
          "Hasil User": getEvalField(userEval, "conclusion"),
          "Tgl Trial 1": formatDate(c.trial_1_date),
          "Tgl Trial 2": formatDate(c.trial_2_date),
          "Tgl Trial 3": formatDate(c.trial_3_date),
          "Hasil Trial": c.trial_result || "",
          "Tgl Background Checking": formatDate(getBackgroundCheckDate(c)),
          "Hasil Background Checking": c.background_check_result || "",
          "Management Approval Date": formatDate(c.director_approval_date),
          "Offering Date": formatDate(c.finance_approval_date),
          "Hasil Offering": c.finance_status || "",
          "Join Date": formatDate(c.join_date),
          "Reason Reject Offering": c.finance_reject_reason || "",
          "Remarks": c.notes || "",
        };
      });

      setPreviewData(exportData);
      setIsPreviewOpen(true);
    } catch (error) {
      console.error("Preview error:", error);
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDownload = () => {
    try {
      const worksheet = XLSX.utils.json_to_sheet(previewData);
      
      // Auto-fit columns
      const colWidths = Object.keys(previewData[0] || {}).map(key => {
        let maxLen = key.length;
        previewData.forEach(row => {
          const val = String(row[key] || "");
          if (val.length > maxLen) maxLen = val.length;
        });
        return { wch: maxLen + 2 };
      });
      worksheet['!cols'] = colWidths;
      
      // Style headers
      const range = XLSX.utils.decode_range(worksheet['!ref'] || "A1:A1");
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_col(C) + "1";
        if (!worksheet[address]) continue;
        
        let bgColor = "A895B6"; // Default Gray-Purple
        if (C >= 7 && C <= 12) bgColor = "F4B183"; // Orange (Tgl Pemanggilan to Result)
        else if (C >= 13 && C <= 15) bgColor = "9BC2E6"; // Blue (Tgl Interview User to Hasil User)
        else if (C >= 16 && C <= 19) bgColor = "FFD966"; // Yellow (Trial 1 to Hasil Trial)
        else if (C >= 20 && C <= 21) bgColor = "9BC2E6"; // Blue (Bg check)
        else if (C === 22) bgColor = "E6B8B7"; // Pinkish (Management Approval)
        else if (C >= 23 && C <= 25) bgColor = "9BC2E6"; // Blue (Offering to Join Date)
        else if (C >= 26) bgColor = "BFBFBF"; // Darker Gray (Reason Reject and Remarks)
        
        worksheet[address].s = {
          fill: {
            patternType: "solid",
            fgColor: { rgb: bgColor }
          },
          font: {
            bold: true,
            color: { rgb: "000000" }
          },
          border: {
             top: {style: "thin", color: {auto: 1}},
             bottom: {style: "thin", color: {auto: 1}},
             left: {style: "thin", color: {auto: 1}},
             right: {style: "thin", color: {auto: 1}}
          }
        };
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Tracking Kandidat");

      XLSX.writeFile(workbook, `Tracking_Kandidat_${format(new Date(), "yyyyMMdd")}.xlsx`);
      setIsPreviewOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Terjadi kesalahan saat mendownload file Excel.");
    }
  };

  return (
    <div className="pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#5A305A]">Live Tracking Kandidat</h1>
          <p className="text-[#5A305A]/70 mt-1">Monitor progress dan status pelamar</p>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-sm mb-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 flex-1">
            <div className="relative w-full sm:w-auto sm:flex-1 sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder="Cari kandidat..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#5A305A] transition-shadow"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <select
              value={positionFilter}
              onChange={(e) => {
                setPositionFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 bg-white text-[#5A305A] focus:outline-none focus:ring-2 focus:ring-[#5A305A] transition-shadow"
            >
              <option value="all">Semua Posisi</option>
              {positionOptions.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 bg-white text-[#5A305A] focus:outline-none focus:ring-2 focus:ring-[#5A305A] transition-shadow"
            >
              <option value="all">Semua Sumber CV</option>
              {sourceOptions.map((src) => (
                <option key={src} value={src}>
                  {src}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleExportExcel}
            disabled={isExporting || isLoading || filteredCandidates.length === 0}
            className="flex items-center justify-center gap-2 bg-[#5A305A] hover:bg-[#3F223F] text-white px-4 py-2 rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isExporting ? <Loader2 className="animate-spin" size={20} /> : <Download size={20} />}
            Export Excel
          </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div
          className="overflow-x-auto border-b border-slate-200" 
          ref={topScrollRef} 
          onScroll={handleTopScroll}
        >
          <div style={{ height: '1px', width: `${tableWidth}px` }}></div>
        </div>
        <div className="overflow-x-auto" ref={bottomScrollRef} onScroll={handleBottomScroll}>

          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="animate-spin text-slate-400" size={32} />
            </div>
          ) : (
            <table ref={tableRef} className="w-full text-sm text-left min-w-max">
                            <thead className="text-[#5A305A] font-bold border-b border-slate-300">
                <tr>
                  
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">No</th>
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">Aksi</th>

                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">Posisi</th>
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">Sumber CV</th>
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap min-w-[200px]">Nama Kandidat</th>
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">No Hp</th>
                  <th className="px-4 py-3 bg-[#a895b6] border-x border-slate-300 whitespace-nowrap">Email</th>
                  
                  <th className="px-4 py-3 bg-[#f4b183] border-x border-slate-300 whitespace-nowrap">Tgl Pemanggilan</th>
                  <th className="px-4 py-3 bg-[#f4b183] border-x border-slate-300 whitespace-nowrap">Kehadiran</th>
                  <th className="px-4 py-3 bg-[#f4b183] border-x border-slate-300 whitespace-nowrap">Hasil Psikotes</th>
                  <th className="px-4 py-3 bg-[#f4b183] border-x border-slate-300 whitespace-nowrap">Tgl Interview HR</th>
                  <th className="px-4 py-3 bg-[#f4b183] border-x border-slate-300 whitespace-nowrap">HR Interviewer</th>
                  <th className="px-4 py-3 bg-[#f4b183] border-x border-slate-300 whitespace-nowrap">Result</th>
                  
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Tgl Interview User</th>
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">User</th>
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Hasil User</th>
                  
                  <th className="px-4 py-3 bg-[#ffd966] border-x border-slate-300 whitespace-nowrap">Tgl Trial 1</th>
                  <th className="px-4 py-3 bg-[#ffd966] border-x border-slate-300 whitespace-nowrap">Tgl Trial 2</th>
                  <th className="px-4 py-3 bg-[#ffd966] border-x border-slate-300 whitespace-nowrap">Tgl Trial 3</th>
                  <th className="px-4 py-3 bg-[#ffd966] border-x border-slate-300 whitespace-nowrap">Hasil Trial</th>
                  
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Tgl Background Checking</th>
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Hasil Background Checking</th>
                  
                  <th className="px-4 py-3 bg-[#e6b8b7] border-x border-slate-300 whitespace-nowrap">Management Approval Date</th>
                  
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Offering Date</th>
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Hasil Offering</th>
                  <th className="px-4 py-3 bg-[#9bc2e6] border-x border-slate-300 whitespace-nowrap">Join Date</th>
                  
                  <th className="px-4 py-3 bg-[#bfbfbf] border-x border-slate-300 whitespace-nowrap">Reason Reject Offering</th>
                  <th className="px-4 py-3 bg-[#bfbfbf] border-x border-slate-300 whitespace-nowrap min-w-[200px]">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {paginatedCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={28} className="px-6 py-8 text-center text-slate-500">
                      Tidak ada data kandidat
                    </td>
                  </tr>
                ) : (
                  paginatedCandidates.map((c, idx) => {
                    const index = (currentPage - 1) * (pageSize === Infinity ? 0 : pageSize) + idx;
                    const hrEval = c.candidate_evaluations?.find(
                      (e: any) => e.evaluation_type === "HR",
                    );
                    const userEval = c.candidate_evaluations?.find(
                      (e: any) => e.evaluation_type === "USER",
                    );

                    let psikotesDate = "";
                    let kehadiran = "";
                    let tglInterviewHR = "";
                    let tglInterviewUser = "";
                    
                    if (c.psikotes_schedules && c.psikotes_schedules.length > 0) {
                      psikotesDate = formatDate(c.psikotes_schedules[0].schedule_date);
                      kehadiran = c.psikotes_schedules[0].is_confirmed ? "Hadir" : "Belum Hadir";
                    }

                    if (c.interview_schedules && c.interview_schedules.length > 0) {
                      const hrSchedules = c.interview_schedules.filter((s: any) => !s.additional_notes?.startsWith('[USER]'));
                      const userSchedules = c.interview_schedules.filter((s: any) => s.additional_notes?.startsWith('[USER]'));
                      
                      if (hrSchedules.length > 0) {
                        tglInterviewHR = formatDate(hrSchedules[hrSchedules.length - 1].schedule_date);
                      }
                      if (userSchedules.length > 0) {
                        tglInterviewUser = formatDate(userSchedules[userSchedules.length - 1].schedule_date);
                      }
                    }

                    return (
                      <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                        
                        <td className="px-4 py-3 border-x border-slate-200">{index + 1}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <div className="flex gap-1">
                              <button onClick={() => handleSave(c.id, !!c.archived_at)} className="p-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200"><Check size={16}/></button>
                              <button onClick={() => setEditingId(null)} className="p-1 bg-slate-100 text-slate-700 rounded hover:bg-slate-200"><X size={16}/></button>
                            </div>
                          ) : (
                            <button onClick={() => handleEdit(c)} className="p-1 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"><Edit2 size={16}/></button>
                          )}
                        </td>

                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.position}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{getSourceCv(c)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 font-medium text-[#5A305A] whitespace-nowrap">{c.full_name}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.phone}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.email}</td>

                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{psikotesDate || tglInterviewHR}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{kehadiran}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{getPsikotesResult(c)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{tglInterviewHR}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{hrEval?.interviewer_name || ""}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{getEvalField(hrEval, "recommendation")}</td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{tglInterviewUser}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{userEval?.interviewer_name || ""}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{getEvalField(userEval, "conclusion")}</td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.trial_1_date} onChange={e => setEditForm({...editForm, trial_1_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.trial_1_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.trial_2_date} onChange={e => setEditForm({...editForm, trial_2_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.trial_2_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.trial_3_date} onChange={e => setEditForm({...editForm, trial_3_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.trial_3_date)}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.trial_result} onChange={e => setEditForm({...editForm, trial_result: e.target.value})} className="border rounded px-2 py-1 text-sm w-48"/>
                          ) : (c.trial_result || "")}
                        </td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.background_check_date} onChange={e => setEditForm({...editForm, background_check_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(getBackgroundCheckDate(c))}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.background_check_result} onChange={e => setEditForm({...editForm, background_check_result: e.target.value})} className="border rounded px-2 py-1 text-sm w-48"/>
                          ) : (c.background_check_result || "")}
                        </td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.director_approval_date)}</td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{formatDate(c.finance_approval_date)}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">{c.finance_status || ""}</td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="date" value={editForm.join_date} onChange={e => setEditForm({...editForm, join_date: e.target.value})} className="border rounded px-2 py-1 text-sm"/>
                          ) : formatDate(c.join_date)}
                        </td>
                        
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.finance_reject_reason} onChange={e => setEditForm({...editForm, finance_reject_reason: e.target.value})} className="border rounded px-2 py-1 text-sm w-48"/>
                          ) : (c.finance_reject_reason || "")}
                        </td>
                        <td className="px-4 py-3 border-x border-slate-200 whitespace-nowrap">
                          {editingId === c.id ? (
                            <input type="text" value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="border rounded px-2 py-1 text-sm w-48"/>
                          ) : (c.notes || "")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

            </table>

          )}
        </div>
        
        {!isLoading && filteredCandidates.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-white flex items-center justify-between rounded-b-2xl">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-500">Tampilkan</span>
              <select 
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#5A305A] text-slate-700 font-medium"
                value={pageSize === Infinity ? "all" : pageSize}
                onChange={(e) => {
                  if (e.target.value === "all") {
                    setPageSize(Infinity);
                  } else {
                    setPageSize(Number(e.target.value));
                  }
                  setCurrentPage(1);
                }}
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={1000}>1000</option>
                <option value="all">Semua</option>
              </select>
              <span className="text-sm text-slate-500">
                dari {filteredCandidates.length} data
              </span>
            </div>
            
            {pageSize !== Infinity && (
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-[#5A305A] text-white rounded-lg hover:bg-[#3F223F] disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-slate-600 px-3 font-medium">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 bg-[#5A305A] text-white rounded-lg hover:bg-[#3F223F] disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Selanjutnya
                </button>
              </div>
            )}
          </div>
        )}
      </div>

{/* Preview Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h3 className="text-xl font-bold text-[#5A305A]">Preview Export Excel</h3>
                <p className="text-sm text-slate-500 mt-1">Periksa kembali data yang akan didownload.</p>
              </div>
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#5A305A]/5 text-[#5A305A] font-semibold border-b border-[#5A305A]/20">
                    <tr>
                      {previewData.length > 0 && Object.keys(previewData[0]).map((key, idx) => (
                        <th key={idx} className="px-4 py-3 whitespace-nowrap border-r border-slate-200 last:border-0">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {previewData.slice(0, 20).map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {Object.values(row).map((val: any, colIdx) => (
                          <td key={colIdx} className="px-4 py-3 whitespace-nowrap border-r border-slate-200 last:border-0 text-slate-600">
                            {val}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewData.length > 20 && (
                <p className="text-sm text-slate-500 mt-4 text-center">
                  Menampilkan 20 baris pertama dari {previewData.length} total baris...
                </p>
              )}
            </div>
            
            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3 shrink-0">
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmDownload}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-xl transition-colors shadow-sm"
              >
                <Download size={20} />
                Download Excel Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

