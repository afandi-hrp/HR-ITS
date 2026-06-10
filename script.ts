import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const run = async () => {
    // using postgres directly is not possible with supabase-js unless using rpc
    // we simply add it and ignore if error... wait, supabase-js cannot execute arbitary raw SQL!
}
