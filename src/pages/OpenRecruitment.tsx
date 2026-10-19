import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  RefreshCcw,
  Briefcase,
  FileText,
  GraduationCap,
  Send,
  ChevronDown,
  Eye,
  EyeOff,
  FilterX,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { cn, fetchWithRetry } from "../lib/utils";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../components/ui/popover";
import { usePermissions } from "../hooks/usePermissions";

interface OpenRecruitment {
  id: string;
  position: string;
  jobdesk: string;
  kualifikasi: string;
  created_at: string;
  is_published: boolean;
}

type SortOption = "az" | "za" | "newest" | "oldest" | "published" | "draft";

const SORT_OPTIONS: { value: SortOption; label: string; group: string }[] = [
  { value: "az", label: "Nama posisi (A–Z)", group: "Alfabet" },
  { value: "za", label: "Nama posisi (Z–A)", group: "Alfabet" },
  { value: "newest", label: "Terbaru dibuat", group: "Tanggal dibuat" },
  { value: "oldest", label: "Terlama dibuat", group: "Tanggal dibuat" },
  { value: "published", label: "Published dulu", group: "Status publish" },
  { value: "draft", label: "Draft / Unpublish dulu", group: "Status publish" },
];
const DEFAULT_SORT: SortOption = "az";
const SORT_STORAGE_KEY = "open_recruitment_sort";

// A missing flag (null) counts as published, same as the rest of the app.
const isPublishedItem = (item: { is_published: boolean | null }) => item.is_published !== false;
const byName = (a: { position: string }, b: { position: string }) =>
  (a.position || "").localeCompare(b.position || "", "id", { sensitivity: "base" });
const byCreated = (a: { created_at: string }, b: { created_at: string }) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export default function OpenRecruitment() {
  const [items, setItems] = useState<OpenRecruitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Remembered per browser (convenience only — falls back to A–Z).
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY) as SortOption | null;
      return saved && SORT_OPTIONS.some((o) => o.value === saved) ? saved : DEFAULT_SORT;
    } catch {
      return DEFAULT_SORT;
    }
  });
  const [sortOpen, setSortOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    position: "",
    jobdesk: "",
    kualifikasi: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();
  const { canEdit } = usePermissions();

  const fetchItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await api
        .get<{ rows: any[] }>("/api/open-recruitment", { search })
        .then((r) => ({ data: r.rows, error: null as any }), (err) => ({ data: null, error: err }));

      if (error) {
        // If table doesn't exist, it will throw an error. We handle it gracefully.
        if (error.code === "42P01") {
          toast({
            title: "Tabel Belum Dibuat",
            description:
              "Tabel open_recruitment belum ada di database Supabase Anda. Silakan jalankan SQL query yang diperlukan.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
      } else {
        setItems(data || []);
      }
    } catch (error: any) {
      console.error("Error fetching open recruitment:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      fetchItems();
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validasi input tidak boleh kosong atau hanya spasi
    if (
      !formData.position.trim() ||
      !formData.jobdesk.trim() ||
      !formData.kualifikasi.trim()
    ) {
      toast({
        title: "Validasi Gagal",
        description:
          "Pastikan Posisi, Jobdesk, dan Kualifikasi telah diisi dengan benar.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      if (editingId) {
        await api.patch(`/api/open-recruitment/${editingId}`, {
          position: formData.position,
          jobdesk: formData.jobdesk,
          kualifikasi: formData.kualifikasi,
        });
        toast({
          title: "Berhasil",
          description: "Data lowongan berhasil diperbarui.",
        });
      } else {
        await api.post("/api/open-recruitment", {
          position: formData.position,
          jobdesk: formData.jobdesk,
          kualifikasi: formData.kualifikasi,
        });
        toast({
          title: "Berhasil",
          description: "Data lowongan berhasil ditambahkan.",
        });
      }

      setIsModalOpen(false);
      setFormData({ position: "", jobdesk: "", kualifikasi: "" });
      setEditingId(null);
      fetchItems();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      await api.delete(`/api/open-recruitment/${id}`);
      toast({
        title: "Berhasil",
        description: "Data lowongan berhasil dihapus.",
      });
      setDeleteConfirmId(null);

      // Ambil data terbaru setelah dihapus
      const { rows: newData } = await api.get<{ rows: any[] }>("/api/open-recruitment", {
        order: "created_at",
      });

      if (newData) {
        setItems(newData);

        // Auto-sync ke n8n setelah hapus (server mengabaikan jika webhook
        // Sheets belum diatur di .env; error-nya hanya dicatat di console)
        const {
          data: { session },
        } = await supabase.auth.getSession();
        fetchWithRetry("/api/n8n/trigger", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            type: "sheet",
            payload: {
              event: "sync_open_recruitment",
              action: "auto_sync_after_delete",
              deletedId: id,
              data: newData, // Mengirim full data terbaru
              timestamp: new Date().toISOString(),
            },
          }),
        }).catch(console.error);
      }
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

  const togglePublish = async (id: string, currentStatus: boolean) => {
    try {
      await api.patch(`/api/open-recruitment/${id}`, { is_published: !currentStatus });

      toast({
        title: "Berhasil",
        description: `Lowongan berhasil di-${!currentStatus ? "publish" : "unpublish"}.`,
      });
      // Update local state smoothly
      setItems(
        items.map((item) =>
          item.id === id ? { ...item, is_published: !currentStatus } : item,
        ),
      );
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (item: OpenRecruitment) => {
    setFormData({
      position: item.position,
      jobdesk: item.jobdesk,
      kualifikasi: item.kualifikasi,
    });
    setEditingId(item.id);
    setIsModalOpen(true);
  };

  const toggleExpand = (id: string) => {
    setExpandedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  useEffect(() => {
    try {
      localStorage.setItem(SORT_STORAGE_KEY, sortOption);
    } catch {
      // storage unavailable (private mode) — sorting still works
    }
  }, [sortOption]);

  // Sorted client-side: the list is small and every mutation (edit, delete,
  // publish toggle) updates `items`, so the order always stays consistent.
  const sortedItems = useMemo(() => {
    const list = [...items];
    switch (sortOption) {
      case "za":
        return list.sort((a, b) => byName(b, a));
      case "newest":
        return list.sort((a, b) => byCreated(b, a) || byName(a, b));
      case "oldest":
        return list.sort((a, b) => byCreated(a, b) || byName(a, b));
      case "published":
        return list.sort((a, b) => Number(isPublishedItem(b)) - Number(isPublishedItem(a)) || byName(a, b));
      case "draft":
        return list.sort((a, b) => Number(isPublishedItem(a)) - Number(isPublishedItem(b)) || byName(a, b));
      default:
        return list.sort(byName);
    }
  }, [items, sortOption]);
  const currentSort = SORT_OPTIONS.find((o) => o.value === sortOption) ?? SORT_OPTIONS[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-[#5A305A]">
            Open Recruitment
          </h1>
          <p className="text-sm font-medium text-[#5A305A]/70 max-w-xl">
            Kelola daftar lowongan pekerjaan yang sedang dibuka.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md p-3 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Cari posisi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm h-10"
          />
        </div>
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger
            render={
              <button
                className={cn(
                  "relative flex items-center gap-2 px-3 bg-white border rounded-xl transition-all shadow-sm shrink-0 h-10 text-sm",
                  sortOption !== DEFAULT_SORT
                    ? "text-[#5A305A] border-[#5A305A]/40 bg-[#5A305A]/5"
                    : "text-[#73507B] border-slate-200 hover:text-[#5A305A] hover:bg-slate-50",
                )}
                title={`Urutkan: ${currentSort.label}`}
              >
                <ArrowUpDown size={18} className="shrink-0" />
                <span className="hidden sm:inline whitespace-nowrap">{currentSort.label}</span>
                {sortOption !== DEFAULT_SORT && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#F58C77] border-2 border-white" />
                )}
              </button>
            }
          />
          <PopoverContent className="w-64 p-1.5">
            {Array.from(new Set(SORT_OPTIONS.map((o) => o.group))).map((group) => (
              <div key={group} className="py-0.5">
                <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold text-[#73507B] uppercase tracking-wider">
                  {group}
                </p>
                {SORT_OPTIONS.filter((o) => o.group === group).map((o) => (
                  <button
                    key={o.value}
                    onClick={() => {
                      setSortOption(o.value);
                      setSortOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg text-left transition-colors",
                      sortOption === o.value
                        ? "bg-[#5A305A]/10 text-[#5A305A] font-bold"
                        : "text-[#5A305A] hover:bg-slate-50",
                    )}
                  >
                    {o.label}
                    {sortOption === o.value && <Check size={16} className="shrink-0" />}
                  </button>
                ))}
              </div>
            ))}
          </PopoverContent>
        </Popover>
        <button
          onClick={() => {
            setSearch("");
            setSortOption(DEFAULT_SORT);
          }}
          className="text-rose-600 bg-rose-50 border border-rose-100 hover:bg-rose-100 hover:border-rose-200 rounded-xl transition-all shadow-sm flex items-center justify-center h-10 text-sm w-10 shrink-0"
          title="Reset Filter"
        >
          <FilterX size={20} />
        </button>
        <button
          onClick={fetchItems}
          className="text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 rounded-xl transition-all shadow-sm flex items-center justify-center h-10 text-sm w-10 shrink-0"
          title="Refresh Data"
        >
          <RefreshCcw size={20} className={loading ? "animate-spin" : ""} />
        </button>
        {canEdit && (
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ position: "", jobdesk: "", kualifikasi: "" });
              setIsModalOpen(true);
            }}
            className="flex items-center justify-center gap-2 px-4 bg-[#5A305A] text-white hover:bg-[#3F223F] font-bold rounded-xl transition-all shadow-md shadow-indigo-200 text-sm whitespace-nowrap h-10"
          >
            <Plus size={18} />
            Tambah Lowongan
          </button>
        )}
      </div>

      {/* Data Grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <RefreshCcw className="animate-spin text-indigo-600" size={32} />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-slate-200 p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Briefcase className="text-slate-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-[#5A305A] mb-1">
            Belum ada lowongan
          </h3>
          <p className="text-slate-500 mb-6">
            Tambahkan lowongan pekerjaan baru untuk mulai merekrut.
          </p>
          {canEdit && (
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({ position: "", jobdesk: "", kualifikasi: "" });
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-all"
            >
              <Plus size={18} />
              Tambah Lowongan
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {sortedItems.map((item) => {
            const isExpanded = expandedItems.includes(item.id);
            return (
              <div
                key={item.id}
                className="bg-white/70 backdrop-blur-md border border-slate-200 rounded-2xl overflow-hidden hover:border-indigo-300 hover:shadow-xl transition-all duration-300 flex flex-col"
              >
                <div
                  className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 cursor-pointer"
                  onClick={() => toggleExpand(item.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      <Briefcase size={24} />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#5A305A] text-lg">
                        {item.position}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-slate-500">
                          Dibuat:{" "}
                          {new Date(item.created_at).toLocaleDateString(
                            "id-ID",
                          )}
                        </p>
                        {item.is_published === false ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 uppercase tracking-widest border border-slate-200">
                            Draft / Unpublish
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-600 uppercase tracking-widest border border-emerald-200">
                            Published
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {canEdit && (
                        <button
                          onClick={() =>
                            togglePublish(item.id, item.is_published !== false)
                          }
                          className={cn(
                            "flex items-center justify-center p-2 rounded-lg transition-colors border",
                            item.is_published === false
                              ? "text-emerald-600 border-emerald-200 hover:bg-emerald-50 bg-emerald-50/50"
                              : "text-amber-500 border-amber-200 hover:bg-amber-50",
                          )}
                          title={
                            item.is_published === false
                              ? "Publish Lowongan"
                              : "Unpublish Lowongan"
                          }
                        >
                          {item.is_published === false ? (
                            <Eye size={18} />
                          ) : (
                            <EyeOff size={18} />
                          )}
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => handleEdit(item)}
                          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={18} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setDeleteConfirmId(item.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Hapus"
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <ChevronDown
                        size={20}
                        className={cn(
                          "transition-transform duration-300",
                          isExpanded ? "rotate-180" : "",
                        )}
                      />
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-6 flex flex-col md:flex-row gap-8 bg-white animate-in slide-in-from-top-2 duration-300">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText size={16} className="text-indigo-500" />
                        <h4 className="text-sm font-bold text-[#5A305A] uppercase tracking-wider">
                          Jobdesk
                        </h4>
                      </div>
                      <p className="text-sm text-[#5A305A] whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                        {item.jobdesk}
                      </p>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <GraduationCap size={16} className="text-indigo-500" />
                        <h4 className="text-sm font-bold text-[#5A305A] uppercase tracking-wider">
                          Kualifikasi
                        </h4>
                      </div>
                      <p className="text-sm text-[#5A305A] whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                        {item.kualifikasi}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <Briefcase size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#5A305A]">
                    {editingId ? "Edit Lowongan" : "Tambah Lowongan Baru"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Isi detail posisi yang dibuka
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400"
              >
                <Plus className="rotate-45" size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form
                id="recruitment-form"
                onSubmit={handleSubmit}
                className="space-y-5"
              >
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Posisi (Position)
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.position}
                    onChange={(e) =>
                      setFormData({ ...formData, position: e.target.value })
                    }
                    placeholder="Contoh: Frontend Developer"
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Deskripsi Pekerjaan (Jobdesk)
                  </label>
                  <textarea
                    required
                    value={formData.jobdesk}
                    onChange={(e) =>
                      setFormData({ ...formData, jobdesk: e.target.value })
                    }
                    placeholder="Jelaskan tugas dan tanggung jawab..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[120px] text-sm resize-y transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                    Kualifikasi
                  </label>
                  <textarea
                    required
                    value={formData.kualifikasi}
                    onChange={(e) =>
                      setFormData({ ...formData, kualifikasi: e.target.value })
                    }
                    placeholder="Jelaskan syarat dan kualifikasi yang dibutuhkan..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-h-[120px] text-sm resize-y transition-all"
                  />
                </div>
              </form>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 px-6 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                form="recruitment-form"
                disabled={saving}
                className="flex-1 px-6 py-3 bg-[#5A305A] text-white font-bold rounded-2xl hover:bg-[#3F223F] shadow-lg shadow-indigo-200 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCcw size={18} className="animate-spin" />{" "}
                    Menyimpan...
                  </>
                ) : (
                  "Simpan Lowongan"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600 mb-2">
                <Trash2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-[#5A305A]">
                Hapus Lowongan?
              </h3>
              <p className="text-slate-500">
                Apakah Anda yakin ingin menghapus lowongan ini? Tindakan ini
                tidak dapat dibatalkan.
              </p>
            </div>
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-100 transition-all"
              >
                Batal
              </button>
              <button
                onClick={() => handleDelete(deleteConfirmId)}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-2xl hover:bg-red-700 shadow-lg shadow-red-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <RefreshCcw className="animate-spin" size={18} />
                ) : (
                  "Ya, Hapus"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
