import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { api } from "../lib/api";
import { Profile } from "../types";
import {
  Users,
  Shield,
  Building2,
  Briefcase,
  Mail,
  Search,
  Filter,
  Loader2,
  Save,
  X,
  Activity,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { usePermissions } from "../hooks/usePermissions";
import { useAuth } from "../contexts/AuthContext";
import { formatRelativeTime } from "../lib/utils";
import { getPageLabel } from "../lib/pageLabels";

type ActivityRow = {
  id: string;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  last_path: string | null;
};

type ActivityDetail = {
  trackingReady: boolean;
  last_sign_in_at: string | null;
  last_seen_at: string | null;
  last_path: string | null;
  visits: { path: string; visited_at: string }[];
};

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_REFRESH_MS = 60 * 1000;

const STATUS_META: Record<string, { label: string; cls: string; dot: string }> = {
  online: { label: "Online", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500 animate-pulse" },
  today: { label: "Aktif hari ini", cls: "bg-sky-50 text-sky-700 border-sky-200", dot: "bg-sky-500" },
  inactive: { label: "Tidak aktif", cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
  never: { label: "Belum pernah login", cls: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
};

// Online = seen within 5 minutes (the tracker sends a heartbeat every 2 min
// while a tab is open). Otherwise judged from the latest of last seen / login.
function getActivityStatus(a?: ActivityRow): string {
  const seen = a?.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
  const login = a?.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0;
  const latest = Math.max(seen, login);
  if (!latest) return "never";
  if (seen && Date.now() - seen <= ONLINE_WINDOW_MS) return "online";
  return Date.now() - latest <= DAY_MS ? "today" : "inactive";
}

const formatDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "-";

const ROLE_META: Record<
  string,
  { label: string; badgeClass: string }
> = {
  HR_ADMIN: { label: "HR Admin", badgeClass: "bg-purple-100 text-purple-700" },
  USER_MANAGER: { label: "User Manager", badgeClass: "bg-blue-100 text-blue-700" },
  DIRECTOR: { label: "Direktur", badgeClass: "bg-amber-100 text-amber-700" },
  FINANCE_DIRECTOR: { label: "Direktur Finance", badgeClass: "bg-emerald-100 text-emerald-700" },
  READ_ONLY: { label: "Read Only", badgeClass: "bg-slate-100 text-slate-700" },
};

function getRoleLabel(role?: string | null) {
  if (!role) return "User";
  return ROLE_META[role]?.label || role;
}

function getRoleBadgeClass(role?: string | null) {
  return (role && ROLE_META[role]?.badgeClass) || "bg-slate-100 text-slate-700";
}

export default function UserManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<Profile[]>([]);
  const [emailById, setEmailById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [roleFilter, setRoleFilter] = useState(searchParams.get("role") || "all");
  const [departmentFilter, setDepartmentFilter] = useState(
    searchParams.get("department") || "all",
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);

    if (searchQuery) params.set("q", searchQuery);
    else params.delete("q");

    if (roleFilter !== "all") params.set("role", roleFilter);
    else params.delete("role");

    if (departmentFilter !== "all") params.set("department", departmentFilter);
    else params.delete("department");

    const currentParams = searchParams.toString();
    const newParams = params.toString();
    if (currentParams !== newParams) {
      setSearchParams(params, { replace: true });
    }
  }, [searchQuery, roleFilter, departmentFilter, setSearchParams, searchParams]);
  const [activityById, setActivityById] = useState<Record<string, ActivityRow>>({});
  const [trackingReady, setTrackingReady] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailUser, setDetailUser] = useState<Profile | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resetUser, setResetUser] = useState<Profile | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string | null; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const { profile: me } = useAuth();
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { canEdit } = usePermissions();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { rows } = await api.get<{ rows: any[] }>("/api/profiles");
      setUsers(rows);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        try {
          const response = await fetch("/api/users/list", {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (response.ok) {
            const result = await response.json();
            const map: Record<string, string> = {};
            (result.users || []).forEach((u: { id: string; email?: string }) => {
              if (u.email) map[u.id] = u.email;
            });
            setEmailById(map);
          }
        } catch (emailErr) {
          console.warn("Failed to load user emails:", emailErr);
        }
      }
    } catch (error: any) {
      console.error("Error fetching users:", error);
      toast({
        title: "Gagal memuat data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchActivity = async () => {
    try {
      const { rows, trackingReady: ready } = await api.get<{ rows: ActivityRow[]; trackingReady: boolean }>(
        "/api/users/activity",
      );
      const map: Record<string, ActivityRow> = {};
      rows.forEach((r) => (map[r.id] = r));
      setActivityById(map);
      setTrackingReady(ready);
    } catch (err) {
      console.warn("Failed to load user activity:", err);
    }
  };

  useEffect(() => {
    fetchActivity();
    const timer = window.setInterval(fetchActivity, ACTIVITY_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const openDetail = async (user: Profile) => {
    setDetailUser(user);
    setDetail(null);
    setDetailLoading(true);
    try {
      setDetail(await api.get<ActivityDetail>(`/api/users/${user.id}/activity`));
    } catch (error: any) {
      toast({ title: "Gagal memuat aktivitas", description: error.message, variant: "destructive" });
      setDetailUser(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeReset = () => {
    setResetUser(null);
    setResetResult(null);
    setCopied(false);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    setResetting(true);
    try {
      const result = await api.post<{ email: string | null; temporaryPassword: string }>(
        `/api/users/${resetUser.id}/reset-password`,
      );
      setResetResult(result);
    } catch (error: any) {
      toast({ title: "Gagal mereset password", description: error.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const copyTempPassword = async () => {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Tidak bisa menyalin", description: "Salin password secara manual.", variant: "destructive" });
    }
  };

  const handleEdit = (user: Profile) => {
    setEditingUser(user);
    setEditRole(user.role || "user");
    setEditDepartment(user.department || "");
  };

  const handleSave = async () => {
    if (!editingUser) return;

    try {
      setSaving(true);
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session)
        throw new Error("Sesi tidak ditemukan. Silakan login kembali.");

      const response = await fetch("/api/users/update-role", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          userId: editingUser.id,
          role: editRole,
          department: editDepartment,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Gagal menyimpan perubahan.");
      }

      toast({
        title: "Berhasil",
        description: "Data pengguna berhasil diperbarui.",
      });

      setEditingUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error("Error updating user:", error);
      toast({
        title: "Gagal menyimpan",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const uniqueDepartments = Array.from(
    new Set(users.map((u) => u.department).filter(Boolean)),
  ) as string[];

  const uniqueRoles = Array.from(
    new Set(users.map((u) => u.role).filter(Boolean)),
  ) as string[];

  const filteredUsers = users.filter((user) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      user.full_name?.toLowerCase().includes(q) ||
      user.department?.toLowerCase().includes(q) ||
      user.job_title?.toLowerCase().includes(q) ||
      user.role?.toLowerCase().includes(q) ||
      emailById[user.id]?.toLowerCase().includes(q);

    const matchesRole = roleFilter === "all" || user.role === roleFilter;
    const matchesDepartment =
      departmentFilter === "all" || user.department === departmentFilter;

    const matchesStatus =
      statusFilter === "all" || getActivityStatus(activityById[user.id]) === statusFilter;

    return matchesSearch && matchesRole && matchesDepartment && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter, departmentFilter, statusFilter]);

  const totalPages =
    pageSize === Infinity ? 1 : Math.ceil(filteredUsers.length / pageSize);
  const paginatedUsers =
    pageSize === Infinity
      ? filteredUsers
      : filteredUsers.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize,
        );

  return (
    <div className="pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#5A305A] flex items-center gap-3">
            <Users className="w-6 h-6 text-indigo-600" />
            Manajemen Pengguna
          </h1>
          <p className="text-[#5A305A]/70 mt-2">
            Kelola akses dan peran pengguna lintas divisi.
          </p>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-md p-2 rounded-2xl border border-slate-200 shadow-sm mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, email, divisi, jabatan, atau peran..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 h-9 text-sm">
            <Filter size={16} className="text-slate-400 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-700"
            >
              <option value="all">Semua Peran</option>
              {uniqueRoles.map((role) => (
                <option key={role} value={role}>
                  {getRoleLabel(role)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 h-9 text-sm">
            <Building2 size={16} className="text-slate-400 shrink-0" />
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-700"
            >
              <option value="all">Semua Divisi</option>
              {uniqueDepartments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 h-9 text-sm">
            <Activity size={16} className="text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm focus:outline-none text-slate-700"
            >
              <option value="all">Semua Aktivitas</option>
              {Object.entries(STATUS_META).map(([key, m]) => (
                <option key={key} value={key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-left border-collapse">
            <colgroup>
              <col style={{ width: "20%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "11%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "17%" }} />
            </colgroup>
            <thead>
              <tr className="bg-[#5A305A]/5 border-b border-[#5A305A]/20">
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">
                  Pengguna
                </th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">
                  Peran (Role)
                </th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">
                  Divisi
                </th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">
                  Jabatan
                </th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">
                  Aktivitas
                </th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A]">
                  Halaman Terakhir
                </th>
                <th className="px-3 py-3 text-sm font-semibold text-[#5A305A] text-center">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
                    <p className="text-slate-500 mt-2">
                      Memuat data pengguna...
                    </p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Tidak ada pengguna yang ditemukan.
                  </td>
                </tr>
              ) : (
                paginatedUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {user.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.full_name || ""}
                            className="w-10 h-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                            {user.full_name?.charAt(0) || "U"}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-[#5A305A] truncate">
                            {user.full_name || "Tanpa Nama"}
                          </p>
                          {emailById[user.id] && (
                            <p className="flex items-center gap-1 text-xs text-slate-500 truncate">
                              <Mail size={12} className="shrink-0" />
                              {emailById[user.id]}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(user.role)}`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 text-[#5A305A] text-sm min-w-0">
                        <Building2 className="w-4 h-4 shrink-0" />
                        <span className="truncate" title={user.department || undefined}>
                          {user.department || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 text-[#5A305A] text-sm min-w-0">
                        <Briefcase className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="truncate" title={user.job_title || undefined}>
                          {user.job_title || "-"}
                        </span>
                      </div>
                    </td>
                    {(() => {
                      const act = activityById[user.id];
                      const st = STATUS_META[getActivityStatus(act)];
                      return (
                        <>
                          <td className="px-3 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${st.cls}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                              {st.label}
                            </span>
                            <p
                              className="text-xs text-[#73507B] mt-1"
                              title={formatDateTime(act?.last_sign_in_at)}
                            >
                              Login terakhir: {act?.last_sign_in_at ? formatRelativeTime(act.last_sign_in_at) : "belum pernah"}
                            </p>
                          </td>
                          <td className="px-3 py-3">
                            {act?.last_path ? (
                              <>
                                <p className="text-sm font-medium text-[#5A305A]" title={act.last_path}>
                                  {getPageLabel(act.last_path)}
                                </p>
                                <p className="text-xs text-[#73507B]" title={formatDateTime(act.last_seen_at)}>
                                  {formatRelativeTime(act.last_seen_at)}
                                </p>
                              </>
                            ) : (
                              <span
                                className="text-xs text-[#73507B]"
                                title={trackingReady ? undefined : "Pencatatan halaman belum aktif (migrasi database belum dijalankan)."}
                              >
                                -
                              </span>
                            )}
                          </td>
                        </>
                      );
                    })()}
                    <td className="px-3 py-3 text-center">
                      <div className="inline-flex flex-wrap items-center justify-center gap-1.5">
                        {canEdit && (
                          <button
                            onClick={() => handleEdit(user)}
                            className="inline-flex items-center justify-center bg-[#5A305A] hover:bg-[#3F223F] text-white font-medium text-xs px-3 py-2 rounded-lg transition-colors"
                          >
                            Edit Akses
                          </button>
                        )}
                        <button
                          onClick={() => openDetail(user)}
                          className="p-2 rounded-lg border border-[#5A305A]/20 text-[#5A305A] hover:bg-[#5A305A]/10 transition-colors"
                          title="Lihat aktivitas"
                        >
                          <Activity size={16} />
                        </button>
                        {canEdit && user.id !== me?.id && (
                          <button
                            onClick={() => setResetUser(user)}
                            className="p-2 rounded-lg border border-[#F58C77]/50 text-[#c2573f] hover:bg-[#FFF5C5] transition-colors"
                            title="Reset password"
                          >
                            <KeyRound size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredUsers.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 rounded-b-2xl">
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
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value="all">Semua</option>
              </select>
              <span className="text-sm text-slate-500">
                dari {filteredUsers.length} data
              </span>
            </div>

            {pageSize !== Infinity && totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 bg-[#5A305A] text-white rounded-lg hover:bg-[#3F223F] disabled:opacity-50 text-sm font-medium transition-colors"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-slate-600 px-3 font-medium">
                  Halaman {currentPage} dari {totalPages}
                </span>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
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

      {/* Activity Detail Modal */}
      {detailUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
          onClick={() => setDetailUser(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-[#5A305A]">Aktivitas Pengguna</h3>
                <p className="text-sm text-[#73507B] truncate">
                  {detailUser.full_name || "Tanpa Nama"}
                  {emailById[detailUser.id] ? ` · ${emailById[detailUser.id]}` : ""}
                </p>
              </div>
              <button onClick={() => setDetailUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {detailLoading || !detail ? (
                <div className="py-10 text-center">
                  <Loader2 className="w-7 h-7 animate-spin text-[#5A305A] mx-auto" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-[#5A305A]/5 border border-[#5A305A]/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#73507B]">Login terakhir</p>
                      <p className="text-sm font-semibold text-[#5A305A]">{formatDateTime(detail.last_sign_in_at)}</p>
                      <p className="text-xs text-[#73507B]">{detail.last_sign_in_at ? formatRelativeTime(detail.last_sign_in_at) : "belum pernah login"}</p>
                    </div>
                    <div className="rounded-xl bg-[#5A305A]/5 border border-[#5A305A]/10 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#73507B]">Terakhir aktif</p>
                      <p className="text-sm font-semibold text-[#5A305A]">{formatDateTime(detail.last_seen_at)}</p>
                      <p className="text-xs text-[#73507B]">
                        {detail.last_path ? getPageLabel(detail.last_path) : "-"}
                      </p>
                    </div>
                  </div>

                  {!detail.trackingReady ? (
                    <div className="flex items-start gap-2 text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2.5">
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      Pencatatan halaman belum aktif. Jalankan migrasi database 20261023000002_user_activity_tracking.sql di Supabase Studio.
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#73507B] mb-2">
                        Riwayat akses halaman (maks. 30 terakhir, disimpan 90 hari)
                      </p>
                      {detail.visits.length === 0 ? (
                        <p className="text-sm text-[#73507B] bg-slate-50 rounded-xl border border-dashed border-slate-300 py-6 text-center">
                          Belum ada riwayat halaman.
                        </p>
                      ) : (
                        <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                          {detail.visits.map((v, i) => (
                            <li key={`${v.visited_at}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                              <span className="font-medium text-[#5A305A] truncate" title={v.path}>
                                {getPageLabel(v.path)}
                              </span>
                              <span className="text-xs text-[#73507B] shrink-0">
                                {formatDateTime(v.visited_at)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#5A305A] flex items-center gap-2">
                <KeyRound size={18} /> Reset Password
              </h3>
              <button onClick={closeReset} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!resetResult ? (
              <>
                <div className="p-5 space-y-3 text-sm text-[#5A305A]">
                  <p>
                    Buat password sementara untuk{" "}
                    <span className="font-bold">{resetUser.full_name || "pengguna ini"}</span>
                    {emailById[resetUser.id] ? ` (${emailById[resetUser.id]})` : ""}?
                  </p>
                  <ul className="list-disc pl-5 text-[#73507B] space-y-1">
                    <li>Password lama langsung tidak berlaku.</li>
                    <li>Pengguna wajib mengganti password saat login berikutnya.</li>
                    <li>Password sementara hanya ditampilkan satu kali.</li>
                  </ul>
                </div>
                <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                  <button onClick={closeReset} className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors">
                    Batal
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={resetting}
                    className="px-4 py-2 bg-[#5A305A] text-white font-medium rounded-xl hover:bg-[#3F223F] transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {resetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Ya, Reset Password
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-5 space-y-3">
                  <p className="text-sm text-[#5A305A]">
                    Password sementara untuk{" "}
                    <span className="font-bold">{resetResult.email || resetUser.full_name}</span>:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-lg font-bold tracking-wider text-[#5A305A] bg-[#FFF5C5] border border-[#F58C77]/40 rounded-xl px-4 py-2.5 select-all">
                      {resetResult.temporaryPassword}
                    </code>
                    <button
                      onClick={copyTempPassword}
                      className="p-3 rounded-xl border border-[#5A305A]/20 text-[#5A305A] hover:bg-[#5A305A]/10 transition-colors"
                      title="Salin password"
                    >
                      {copied ? <Check size={18} className="text-emerald-600" /> : <Copy size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-rose-600 flex items-start gap-1.5">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    Catat atau salin sekarang, password ini tidak akan ditampilkan lagi. Kirimkan ke pengguna lewat jalur yang aman.
                  </p>
                </div>
                <div className="p-5 border-t border-slate-200 bg-slate-50 flex justify-end">
                  <button onClick={closeReset} className="px-4 py-2 bg-[#5A305A] text-white font-medium rounded-xl hover:bg-[#3F223F] transition-colors">
                    Selesai
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#5A305A]">
                Edit Akses Pengguna
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">
                  Nama Pengguna
                </p>
                <p className="font-medium text-[#5A305A]">
                  {editingUser.full_name}
                </p>
                {emailById[editingUser.id] && (
                  <p className="text-sm text-slate-500">
                    {emailById[editingUser.id]}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Peran (Role)
                </label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="user">User Biasa</option>
                  <option value="USER_MANAGER">
                    User Manager (Lintas Divisi)
                  </option>
                  <option value="HR_ADMIN">HR Admin</option>
                  <option value="DIRECTOR">Direktur</option>
                  <option value="FINANCE_DIRECTOR">Direktur Finance</option>
                  <option value="READ_ONLY">Read Only (Lihat Saja)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Divisi / Departemen
                </label>
                <select
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">-- Pilih Divisi --</option>
                  {uniqueDepartments.map((dept, idx) => (
                    <option key={idx} value={dept}>
                      {dept}
                    </option>
                  ))}
                  {editDepartment && !uniqueDepartments.includes(editDepartment) && (
                    <option value={editDepartment}>{editDepartment}</option>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Penting untuk User Manager agar hanya melihat kandidat
                  divisinya.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-[#5A305A] text-white font-medium rounded-xl hover:bg-[#3F223F] transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
