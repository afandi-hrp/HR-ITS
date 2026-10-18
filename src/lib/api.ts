import { fetchWithRetry } from "./utils";

// Calls our own backend (server.ts / server/routes/*). fetchWithRetry adds
// the Supabase access token for /api/* URLs. Writes are not retried, so a
// slow response can't make a delete/insert run twice.

type Query = Record<string, string | number | boolean | null | undefined>;

const withQuery = (url: string, query?: Query) => {
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
};

async function request<T>(method: string, url: string, body?: unknown, query?: Query): Promise<T> {
  const response = await fetchWithRetry(
    withQuery(url, query),
    {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    method === "GET" ? 3 : 1,
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as any)?.error || `Permintaan gagal (${response.status}).`);
  }
  return data as T;
}

// multipart/form-data (file uploads). The browser sets the boundary header.
async function upload<T>(url: string, form: FormData): Promise<T> {
  const response = await fetchWithRetry(url, { method: "POST", body: form }, 1);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as any)?.error || `Upload gagal (${response.status}).`);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string, query?: Query) => request<T>("GET", url, undefined, query),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>("PUT", url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>("PATCH", url, body ?? {}),
  delete: <T>(url: string, body?: unknown) => request<T>("DELETE", url, body),
  upload,
};
