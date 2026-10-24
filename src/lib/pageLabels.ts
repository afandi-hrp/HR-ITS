// Friendly names for the in-app paths recorded by the activity tracker
// (server/routes/userActivity.ts). The server stores UUIDs as ":id".
const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/open-recruitment": "Open Recruitment",
  "/screening": "Screening Awal",
  "/candidates/:id": "Profil Kandidat",
  "/funnel": "Funnel Rekrutmen",
  "/psikotes": "Jadwal Psikotes",
  "/interview": "Jadwal Interview",
  "/tracking": "Live Tracking",
  "/logs": "Log Kandidat",
  "/upload-cv": "Upload CV",
  "/templates": "Template Email",
  "/evaluation-templates": "Template Evaluasi",
  "/tokens": "Token Pelamar",
  "/users": "Manajemen Pengguna",
  "/settings": "Pengaturan",
  "/external-data": "Data Eksternal",
};

export function getPageLabel(path?: string | null): string {
  if (!path) return "-";
  return PAGE_LABELS[path] || path;
}
