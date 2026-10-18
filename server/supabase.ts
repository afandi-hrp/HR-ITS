import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// service_role client — BYPASSES RLS. Every route using it must do its own
// role/ownership check first (see server/auth.ts, server/access.ts).
// Lazy so a missing env var fails the request, not the whole server boot.
export const getSupabaseAdmin = (): SupabaseClient => {
  let url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase Admin credentials (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing.",
    );
  }

  if (url.startsWith("http://")) {
    url = url.replace("http://", "https://");
  }

  return createClient(url, key);
};
