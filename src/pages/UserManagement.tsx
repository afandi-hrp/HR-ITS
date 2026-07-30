import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
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
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";

const ROLE_META: Record<
  string,
  { label: string; badgeClass: string }
> = {
  HR_ADMIN: { label: "HR Admin", badgeClass: "bg-purple-100 text-purple-700" },
  USER_MANAGER: { label: "User Manager", badgeClass: "bg-blue-100 text-blue-700" },
  DIRECTOR: { label: "Direktur", badgeClass: "bg-amber-100 text-amber-700" },
  FINANCE_DIRECTOR: { label: "Direktur Finance", badgeClass: "bg-emerald-100 text-emerald-700" },
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
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editDepartment, setEditDepartment] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("full_name");

      if (error) throw error;
      setUsers(data || []);

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

  const roleCounts = users.reduce<Record<string, number>>((acc, u) => {
    const key = u.role || "Lainnya";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

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

    return matchesSearch && matchesRole && matchesDepartment;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-[#3D2C44] flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            Manajemen Pengguna
          </h1>
          <p className="text-[#3D2C44]/70 mt-2">
            Kelola akses dan peran pengguna lintas divisi.
          </p>
        </div>
      </div>

      {/* Role summary */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#3D2C44]/5 text-[#3D2C44]">
          {users.length} Total Pengguna
        </span>
        {Object.entries(roleCounts).map(([role, count]) => (
          <span
            key={role}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${getRoleBadgeClass(role)}`}
          >
            {count} {getRoleLabel(role)}
          </span>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, email, divisi, jabatan, atau peran..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-2">
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
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-2">
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Pengguna
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Peran (Role)
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Divisi
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600">
                  Jabatan
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-600 text-right">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto" />
                    <p className="text-slate-500 mt-2">
                      Memuat data pengguna...
                    </p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-500"
                  >
                    Tidak ada pengguna yang ditemukan.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
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
                          <p className="font-medium text-slate-900 truncate">
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
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(user.role)}`}
                      >
                        <Shield className="w-3.5 h-3.5" />
                        {getRoleLabel(user.role)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Building2 className="w-4 h-4 shrink-0" />
                        {user.department || "-"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Briefcase className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="truncate max-w-[220px]">
                          {user.job_title || "-"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleEdit(user)}
                        className="text-indigo-600 hover:text-indigo-700 font-medium text-sm px-3 py-1.5 hover:bg-indigo-50 rounded-lg transition-colors"
                      >
                        Edit Akses
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">
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
                <p className="font-medium text-slate-900">
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
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Divisi / Departemen
                </label>
                <input
                  type="text"
                  list="departments-list"
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  placeholder="Contoh: ICT, Finance, Operational"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <datalist id="departments-list">
                  {uniqueDepartments.map((dept, idx) => (
                    <option key={idx} value={dept} />
                  ))}
                </datalist>
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
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
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
