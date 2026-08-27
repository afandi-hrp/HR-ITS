import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { PassThrough } from "stream";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const triggerRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Terlalu banyak permintaan, silakan coba lagi nanti." },
  validate: { trustProxy: false, xForwardedForHeader: false }
});

const uploadRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // limit each IP to 50 uploads per windowMs
  message: { error: "Terlalu banyak permintaan upload, silakan coba lagi nanti." },
  validate: { trustProxy: false, xForwardedForHeader: false }
});

const otpRequestRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 15, // limit each IP to 15 OTP requests per 5 minutes to prevent spamming different numbers
  message: { error: "Terlalu banyak permintaan OTP dari perangkat Anda. Silakan coba lagi nanti." },
  validate: { trustProxy: false, xForwardedForHeader: false }
});

const otpVerifyRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // limit each IP to 10 OTP verification attempts per 5 minutes to prevent brute-force
  message: { error: "Terlalu banyak percobaan kode OTP. Silakan coba lagi nanti." },
  validate: { trustProxy: false, xForwardedForHeader: false }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    // Strict MIME type validation
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF and Word documents are allowed."));
    }
  }
});

// Separate multer config for application-form document uploads (photo/KTP/
// ijazah/transcript/payslip/other/portfolio) — these can be images, PDFs, or
// (for the portfolio field) PowerPoint files. The hard ceiling here is 5MB
// to fit the largest allowed single file (a lone portfolio upload); ktp/
// ijazah/etc. are already capped tighter (3MB) client-side in
// ApplicationForm.tsx before the request is even sent.
const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only images, PDF, Word, and PowerPoint documents are allowed."));
    }
  }
});
const app = express();
app.set('trust proxy', 1);

// Security headers (defense in depth against XSS/clickjacking, not a
// substitute for fixing an actual injection bug if one is ever found).
// The self-hosted Supabase origin needs to be explicitly whitelisted since
// the browser talks to it directly (Auth/Storage/PostgREST/Realtime) using
// the public anon key, per this app's two-key architecture.
const SUPABASE_HTTP_ORIGIN = (process.env.VITE_SUPABASE_URL || "").replace(/^http:\/\//, "https://");
const SUPABASE_WS_ORIGIN = SUPABASE_HTTP_ORIGIN.replace(/^https:\/\//, "wss://");
const IS_PRODUCTION = process.env.NODE_ENV === "production";

app.use(
  helmet({
    // Vite's dev middleware (used below when NODE_ENV !== "production")
    // injects inline bootstrap <script> tags for React Refresh/HMR directly
    // into the HTML — a strict script-src with no 'unsafe-inline' blocks
    // those and the app never mounts (blank page). The production build
    // never has inline scripts, so the strict policy only needs to apply
    // there.
    contentSecurityPolicy: IS_PRODUCTION
      ? {
          directives: {
            defaultSrc: ["'self'"],
            // https://unpkg.com is needed for PDF.js's worker: when a real
            // Worker can't be set up it falls back to a "fake worker" that
            // dynamically import()s the module instead, which is governed
            // by script-src, not worker-src (kept below for the real-worker
            // path too).
            scriptSrc: ["'self'", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            // Candidate CVs/photos can be hosted on arbitrary external
            // sources (Google Drive, job boards like Jobstreet, etc.), not
            // just our own Supabase Storage — these need to be embeddable
            // (preview) and fetchable (secure download) from any HTTPS
            // origin. script-src stays locked to 'self' regardless, which
            // is what actually prevents injected-script XSS.
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            fontSrc: ["'self'", "data:"],
            connectSrc: ["'self'", "https:", SUPABASE_WS_ORIGIN].filter(Boolean),
            frameSrc: ["'self'", "https:"],
            // PdfToImages.tsx (KTP/ijazah/transkrip/slip gaji "Lampiran
            // Dokumen" print view) loads its PDF.js worker from the unpkg
            // CDN — worker-src falls back to script-src when unset, and
            // script-src is locked to 'self', so without this the worker
            // fails to load and PDF pages never render.
            workerSrc: ["'self'", "blob:", "https://unpkg.com"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
    // Disabled: our own domain and the Supabase origin don't set
    // Cross-Origin-Resource-Policy headers, so COEP would silently break
    // loading candidate photos/documents/avatars from Supabase Storage.
    crossOriginEmbedderPolicy: false,
  })
);

// Supabase Admin Client (Lazy initialization to prevent crash if env vars are missing)
const getSupabaseAdmin = () => {
  let url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error("Supabase Admin credentials (VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing.");
  }

  if (url.startsWith('http://')) {
    url = url.replace('http://', 'https://');
  }
  
  return createClient(url, key);
};

const DEFAULT_PORT = process.env.NODE_ENV === "production" ? 3000 : 3001;
const PORT = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT;

// Increase limit for large payloads (e.g., CV uploads)
// In Vercel, req.body might already be parsed. If so, don't run express.json()
app.use((req: any, res, next) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      next();
    } else {
      express.json({ limit: '20mb' })(req, res, next);
    }
  });

  app.use((req: any, res, next) => {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      next();
    } else {
      express.urlencoded({ limit: '20mb', extended: true })(req, res, next);
    }
  });

  // Auth middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized. Missing or invalid Authorization header." });
    }
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
      if (error || !user) {
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
      }
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: "Unauthorized." });
    }
  };

  // Chain after requireAuth (needs req.user). Frontend routing already
  // hides these pages from non-HR_ADMIN roles, but that's a UI-only
  // restriction — anyone with a valid session can call the API directly,
  // so destructive/admin-only operations need this enforced server-side
  // too, not just hidden from the menu.
  const requireHrAdmin = async (req: any, res: any, next: any) => {
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', req.user.id)
        .single();

      if (profile?.role !== 'HR_ADMIN') {
        return res.status(403).json({ error: "Forbidden: HR Admin only." });
      }
      next();
    } catch (error) {
      return res.status(403).json({ error: "Forbidden." });
    }
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: {
        hasUrl: !!process.env.VITE_SUPABASE_URL,
        hasAnonKey: !!process.env.VITE_SUPABASE_ANON_KEY,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    });
  });

  // Feature: Update User Role (Admin Only)
  app.post("/api/users/update-role", async (req, res) => {
    const { userId, role, department } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');
      
      // Verify token
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify HR_ADMIN role
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'HR_ADMIN') {
        return res.status(403).json({ error: "Forbidden: Only HR Admin can update roles" });
      }

      // Update target user
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .update({ role, department: department || null })
        .eq('id', userId)
        .select();

      if (error) throw error;

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Feature: List Users with Email (Admin Only)
  // profiles has no email column (it lives on auth.users, which the client
  // SDK can't query directly), so Manajemen Pengguna needs this endpoint to
  // show email alongside role/department/job_title.
  app.get("/api/users/list", async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');

      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'HR_ADMIN') {
        return res.status(403).json({ error: "Forbidden: Only HR Admin can list users" });
      }

      let allUsers: { id: string; email?: string }[] = [];
      let page = 1;
      while (true) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        allUsers = allUsers.concat(data.users.map(u => ({ id: u.id, email: u.email })));
        if (data.users.length < 200) break;
        page++;
      }

      res.json({ users: allUsers });
    } catch (error: any) {
      console.error("Error listing users:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Feature: Move Candidate to Log
  app.post("/api/candidates/move-to-log", requireAuth, async (req, res) => {
    const { candidateId, notes } = req.body;

    if (!candidateId) {
      return res.status(400).json({ error: "Candidate ID is required" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      // 1. Fetch candidate with schedules and assignees
      const { data: candidate, error: fetchError } = await supabaseAdmin
        .from("candidates")
        .select("*, psikotes_schedules(is_confirmed), interview_schedules(is_confirmed), candidate_assignees(user_id, profiles(full_name))")
        .eq("id", candidateId)
        .single();

      if (fetchError || !candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      // Build assigned_history
      const history = candidate.candidate_assignees?.map((a: any) => ({
        id: a.user_id,
        name: a.profiles?.full_name
      })) || [];

      // 2. Insert into logs (Remove fields that don't exist in candidate_logs and add statuses)
      const { 
        created_at, 
        updated_at, 
        psikotes_schedules, 
        interview_schedules, 
        candidate_assignees,
        ai_cv_analysis,
        career_fit_recommendation,
        psikotes_result_url,
        source_info,
        ...baseData 
      } = candidate;
      
      const logData = {
        ...baseData,
        director_status: candidate.director_status,
        finance_status: candidate.finance_status,
        director_approval_date: candidate.director_approval_date,
        finance_approval_date: candidate.finance_approval_date,
        join_date: candidate.join_date,
        finance_reject_reason: candidate.finance_reject_reason,
        trial_1_date: candidate.trial_1_date,
        trial_2_date: candidate.trial_2_date,
        trial_3_date: candidate.trial_3_date,
        trial_result: candidate.trial_result,
        background_check_date: candidate.background_check_date,
        background_check_result: candidate.background_check_result,

        career_fit_recommendation: candidate.career_fit_recommendation,
        psikotes_result_url: candidate.psikotes_result_url,
        source_info: candidate.source_info,
        psikotes_status: psikotes_schedules?.some((s: any) => s.is_confirmed) ? "Sudah Psikotes" : "Belum Psikotes",
        interview_status: interview_schedules?.some((s: any) => s.is_confirmed) ? "Sudah Interview" : "Belum Interview",
        notes: notes || "",
        archived_at: new Date().toISOString(),
        created_at: candidate.created_at,
        updated_at: candidate.updated_at,
        assigned_history: history
      };

      const { error: insertError } = await supabaseAdmin
        .from("candidate_logs")
        .insert([logData]);

      if (insertError) {
        throw insertError;
      }

      // 3. Delete from candidates
      const { error: deleteError } = await supabaseAdmin
        .from("candidates")
        .delete()
        .eq("id", candidateId);

      if (deleteError) {
        throw deleteError;
      }

      res.json({ success: true, message: "Candidate moved to log successfully" });
    } catch (error: any) {
      console.error("Error moving candidate:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Feature: Restore an archived candidate (candidate_logs) back to the
  // active pipeline (candidates). Reverse of move-to-log above.
  //
  // candidate_logs and candidates aren't identical schemas (confirmed via
  // a live information_schema query, 2026-08-06 — don't trust the two
  // tables' column lists to match just because they look similar in the
  // migration files):
  //   - candidate_logs-only columns (dropped on restore, no home on
  //     candidates): archived_at, assigned_history, psikotes_status,
  //     interview_status, notes.
  //   - ai_biodata_summary / ai_interview_questions are `json`/`jsonb` on
  //     candidates but `text` on candidate_logs — parsed back into real
  //     JSON values here rather than relying on an implicit text->json
  //     cast on insert, which is fragile if the stored text ever isn't
  //     valid JSON.
  // Approval/trial-stage fields (director_status, finance_status, trial
  // dates, background check, join_date, finance_reject_reason) are reset
  // to a clean slate — a prior rejection's approval history shouldn't
  // silently carry over into a fresh run through the pipeline.
  const safeParseJson = (value: any) => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  app.post("/api/candidates/restore-from-log", requireAuth, requireHrAdmin, async (req, res) => {
    const { logId, newStatus } = req.body;

    if (!logId) {
      return res.status(400).json({ error: "Log ID is required" });
    }
    const validStatuses = ["pending", "accepted"];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: "Valid newStatus (pending, accepted) is required" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: logRow, error: fetchError } = await supabaseAdmin
        .from("candidate_logs")
        .select("*")
        .eq("id", logId)
        .single();

      if (fetchError || !logRow) {
        return res.status(404).json({ error: "Arsip kandidat tidak ditemukan" });
      }

      const {
        archived_at,
        assigned_history,
        psikotes_status,
        interview_status,
        notes,
        ai_biodata_summary,
        ai_interview_questions,
        ...baseData
      } = logRow;

      const candidateData = {
        ...baseData,
        ai_biodata_summary: safeParseJson(ai_biodata_summary),
        ai_interview_questions: safeParseJson(ai_interview_questions),
        status_screening: newStatus,
        director_status: "pending",
        finance_status: "pending",
        director_approval_date: null,
        finance_approval_date: null,
        join_date: null,
        finance_reject_reason: null,
        trial_1_date: null,
        trial_2_date: null,
        trial_3_date: null,
        trial_result: null,
        background_check_date: null,
        background_check_result: null,
        updated_at: new Date().toISOString(),
      };

      const { error: insertError } = await supabaseAdmin
        .from("candidates")
        .insert([candidateData]);

      if (insertError) {
        throw insertError;
      }

      const { error: deleteError } = await supabaseAdmin
        .from("candidate_logs")
        .delete()
        .eq("id", logId);

      if (deleteError) {
        // Roll back the insert so the candidate doesn't end up duplicated
        // in both tables (which would show them twice in Live Tracking).
        await supabaseAdmin.from("candidates").delete().eq("id", logId);
        throw deleteError;
      }

      res.json({ success: true, message: "Kandidat berhasil diaktifkan kembali" });
    } catch (error: any) {
      console.error("Error restoring candidate from log:", error);
      res.status(500).json({ error: error.message || "Gagal mengaktifkan kembali kandidat" });
    }
  });

  // Helper to check if URL is local
  const isLocalUrl = (url: string) => {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname;
      return (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
      );
    } catch (e) {
      return false;
    }
  };

  // Feature: Trigger n8n Webhook (Proxy to avoid CORS)
  app.post("/api/n8n/trigger", triggerRateLimiter, async (req, res) => {
    const { type, payload } = req.body || {};
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Unauthorized. Missing or invalid Authorization header." });
    }

    if (!type || !['email', 'wa', 'test', 'sheet', 'external_data_delete', 'ai_analysis', 'ai_psikotes_analysis', 'ai_interview'].includes(type)) {
      return res.status(400).json({ error: "Valid type (email, wa, test, sheet, external_data_delete, ai_analysis, ai_psikotes_analysis, ai_interview) is required" });
    }

    let jobId = null;

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.split(' ')[1];
      
      // Verify user
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
      }

      // type "test" accepts an arbitrary caller-supplied payload.url (used
      // by the Settings page to test a webhook before saving it) — that's
      // an SSRF-adjacent capability (our server will make a request to
      // whatever URL is given), so restrict it to HR_ADMIN, the only role
      // with access to the webhook settings UI that uses it.
      if (type === 'test') {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();
        if (profile?.role !== 'HR_ADMIN') {
          return res.status(403).json({ error: "Forbidden: HR Admin only." });
        }
      }

      // Fetch webhook URL based on type from user metadata
      let webhookUrl = '';
      if (type === 'email') {
        webhookUrl = user.user_metadata?.n8n_webhook_url;
      } else if (type === 'wa') {
        webhookUrl = user.user_metadata?.wa_webhook_url;
      } else if (type === 'sheet') {
        webhookUrl = user.user_metadata?.sheet_webhook_url;
      } else if (type === 'external_data_delete') {
        webhookUrl = user.user_metadata?.external_data_delete_webhook_url;
      } else if (type === 'ai_analysis') {
        webhookUrl = user.user_metadata?.ai_analysis_webhook_url;
      } else if (type === 'ai_psikotes_analysis') {
        webhookUrl = user.user_metadata?.ai_psikotes_webhook_url;
      } else if (type === 'ai_interview') {
        webhookUrl = user.user_metadata?.ai_interview_webhook_url;
      } else if (type === 'test') {
        const testType = payload?.type;
        webhookUrl = payload?.url; // Use URL from payload if provided
        
        if (!webhookUrl) {
          if (testType === 'email') webhookUrl = user.user_metadata?.n8n_webhook_url;
          else if (testType === 'cv') webhookUrl = user.user_metadata?.cv_webhook_url;
          else if (testType === 'public_cv') webhookUrl = user.user_metadata?.public_cv_webhook_url;
          else if (testType === 'sheet') webhookUrl = user.user_metadata?.sheet_webhook_url;
          else if (testType === 'otp') webhookUrl = user.user_metadata?.otp_webhook_url;
          else if (testType === 'wa') webhookUrl = user.user_metadata?.wa_webhook_url;
        }
      }

      if (!webhookUrl) {
        return res.status(400).json({ error: `Webhook URL for ${type === 'test' ? payload?.type : type} is not configured in your settings. Please save your settings first.` });
      }

      if (isLocalUrl(webhookUrl)) {
        return res.status(400).json({ 
          error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
        });
      }

      if (type !== 'test') {
        try {
          const { data: job, error: jobError } = await supabaseAdmin
            .from('n8n_jobs')
            .insert([{
              job_type: type,
              status: 'pending',
              user_id: user.id
            }])
            .select()
            .single();
          if (!jobError && job) {
            jobId = job.id;
            payload.job_id = jobId;
          }
        } catch (e) {
          console.warn("n8n_jobs table might not exist yet. Falling back to synchronous mode.");
        }
      }

      console.log(`Triggering n8n webhook for ${type}`);
      let response;
      
      if (type === 'test' && (payload?.type === 'cv' || payload?.type === 'public_cv')) {
        // Send as multipart/form-data for CV webhooks (without actual file for test)
        const form = new FormData();
        form.append('event', payload.event || 'test_connection');
        form.append('type', payload.type);
        form.append('timestamp', payload.timestamp || new Date().toISOString());
        form.append('message', payload.message || 'Testing connection from HR Dashboard');

        response = await axios.post(webhookUrl, form, {
          headers: { ...form.getHeaders() },
          timeout: 30000,
          validateStatus: () => true
        });
      } else {
        // Send as application/json for other webhooks
        response = await axios.post(webhookUrl, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 30000, // 30 seconds timeout to prevent Vercel kill
          validateStatus: () => true // Resolve promise for all HTTP status codes
        });
      }

      console.log(`n8n response status: ${response.status}`);
      
      if (response.status >= 400) {
        if (type === 'test') {
          // For test connections, return the actual error from n8n
          // so the user can see exactly what went wrong.
          const errorData = typeof response.data === 'object' && response.data !== null 
            ? response.data 
            : { error: response.data || `Webhook returned status ${response.status}` };
          return res.status(response.status).json(errorData);
        }
        
        // For non-test, throw an error to be caught by the catch block
        const err: any = new Error(`Webhook returned status ${response.status}`);
        err.response = response;
        throw err;
      }

      if (jobId) {
        if (typeof response.data === 'object' && response.data !== null) {
          res.json({ ...response.data, jobId });
        } else {
          res.json({ message: response.data, jobId });
        }
      } else {
        res.json(response.data);
      }
    } catch (error: any) {
      console.error("Error triggering n8n proxy:", error);
      
      // If we created a job, update it to error status
      if (jobId) {
        try {
          const supabaseAdmin = getSupabaseAdmin();
          await supabaseAdmin
            .from('n8n_jobs')
            .update({ 
              status: 'error', 
              message: error.message || 'Gagal menghubungi server n8n' 
            })
            .eq('id', jobId);
        } catch (dbError) {
          console.error("Failed to update job status to error:", dbError);
        }
      }

      const status = error.response?.status || 500;
      
      // Log the actual error data from the webhook if available, but don't expose it to the client
      if (error.response?.data) {
        console.error("Webhook error response:", error.response.data);
      }
      
      // Return a generic, user-friendly error message
      const errorMessage = "Gagal memproses permintaan. Sistem sedang sibuk atau ada gangguan pada layanan. Silakan coba beberapa saat lagi.";
      
      res.status(status).json({ error: errorMessage });
    }
  });

  // Feature: Request OTP for Public Career Page
  app.post("/api/request-otp", otpRequestRateLimiter, async (req, res) => {
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      
      // Basic Rate Limiting: Check if there are more than 3 requests in the last 5 minutes for this phone
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count, error: rateLimitError } = await supabaseAdmin
        .from('otp_requests')
        .select('*', { count: 'exact', head: true })
        .eq('phone_number', phone)
        .gte('created_at', fiveMinsAgo);

      if (rateLimitError) throw rateLimitError;
      if (count && count >= 3) {
        return res.status(429).json({ error: "Terlalu banyak permintaan OTP. Silakan coba lagi dalam 5 menit." });
      }

      const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
      
      if (error || !users || users.length === 0) {
        return res.status(500).json({ error: "Could not fetch admin settings" });
      }

      // Find the first user that has otp_webhook_url configured
      const adminUser = users.find((u: any) => u.user_metadata?.otp_webhook_url) || users[0];
      const webhookUrl = adminUser?.user_metadata?.otp_webhook_url;

      if (!webhookUrl) {
        return res.status(400).json({ error: "OTP Webhook URL is not configured by Admin" });
      }

      if (isLocalUrl(webhookUrl)) {
        return res.status(400).json({ 
          error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
        });
      }

      // Generate 6-digit OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Save to Supabase
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 5); // 5 minutes expiration
      
      const { data: otpData, error: insertError } = await supabaseAdmin
        .from('otp_requests')
        .insert([{
          phone_number: phone,
          otp_code: otpCode,
          expires_at: expiresAt.toISOString(),
          is_used: false
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      console.log(`Triggering OTP webhook: ${webhookUrl}`);
      const response = await axios.post(webhookUrl, { phone, otp: otpCode }, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000
      });

      res.json({ success: true, otpRequestId: otpData.id });
    } catch (error: any) {
      console.error("Error requesting OTP:", error);
      const status = error.response?.status || 500;
      
      // Log the actual error data from the webhook if available, but don't expose it to the client
      if (error.response?.data) {
        console.error("Webhook error response:", error.response.data);
      }
      
      // Return a generic, user-friendly error message
      const errorMessage = "Gagal mengirim pesan OTP. Sistem sedang sibuk atau ada gangguan pada layanan pengiriman pesan. Silakan coba beberapa saat lagi.";
      
      res.status(status).json({ error: errorMessage });
    }
  });

  // Feature: Verify OTP for Public Career Page
  app.post("/api/verify-otp", otpVerifyRateLimiter, async (req, res) => {
    const { otpRequestId, otpInput } = req.body || {};

    if (!otpRequestId || !otpInput) {
      return res.status(400).json({ error: "OTP Request ID and OTP Input are required" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      
      const { data, error } = await supabaseAdmin
        .from('otp_requests')
        .select('*')
        .eq('id', otpRequestId)
        .single();

      if (error || !data) {
        return res.status(400).json({ error: "Permintaan OTP tidak ditemukan." });
      }

      if (data.is_used) {
        return res.status(400).json({ error: "Kode OTP ini sudah digunakan." });
      }

      if (new Date() > new Date(data.expires_at)) {
        return res.status(400).json({ error: "Kode OTP sudah kadaluarsa. Silakan minta ulang." });
      }

      if (data.otp_code !== otpInput) {
        return res.status(400).json({ error: "Kode OTP salah." });
      }

      // Generate an upload token and extend expiration to 1 hour
      const uploadToken = crypto.randomBytes(32).toString('hex');
      const newExpiresAt = new Date();
      newExpiresAt.setHours(newExpiresAt.getHours() + 1);

      await supabaseAdmin
        .from('otp_requests')
        .update({ 
          is_used: true, 
          otp_code: uploadToken, // Store token in otp_code field to reuse the table
          expires_at: newExpiresAt.toISOString() 
        })
        .eq('id', otpRequestId);

      res.json({ success: true, uploadToken });
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Feature: Upload CV to n8n (Multipart)
  app.post("/api/n8n/upload-cv", uploadRateLimiter, (req: any, res, next) => {
    if (req.body && Buffer.isBuffer(req.body)) {
      // Vercel parsed the body into a Buffer (raw body)
      const stream = new PassThrough();
      stream.end(req.body);
      (stream as any).headers = req.headers;
      (stream as any).method = req.method;
      (stream as any).url = req.url;
      
      upload.single('file')(stream as any, res, (err) => {
        if (err) return next(err);
        req.file = (stream as any).file;
        req.body = (stream as any).body;
        next();
      });
    } else if (req.body && typeof req.body === 'string') {
      // Vercel parsed the body into a string
      const stream = new PassThrough();
      stream.end(Buffer.from(req.body));
      (stream as any).headers = req.headers;
      (stream as any).method = req.method;
      (stream as any).url = req.url;
      
      upload.single('file')(stream as any, res, (err) => {
        if (err) return next(err);
        req.file = (stream as any).file;
        req.body = (stream as any).body;
        next();
      });
    } else {
      upload.single('file')(req, res, next);
    }
  }, async (req: any, res: any) => {
    const { 
      uploadToken,
      candidateName, 
      candidateEmail,
      candidatePhone,
      candidatePosition, 
      sourceInfo,
      fileName,
      mimeType,
      uploadedAt,
      senderName, 
      senderEmail 
    } = req.body || {};
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }

    let jobId = null;

    try {
      const supabaseAdmin = getSupabaseAdmin();
      let webhookUrl = '';
      let userId = null;

      // Check if request is authenticated (HR) or public (Candidate with token)
      const authHeader = req.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // HR Upload: Validate Supabase token
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error || !user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        
        userId = user.id;
        webhookUrl = user.user_metadata?.cv_webhook_url;
        
        if (!webhookUrl) {
          // Fallback to first admin if not set for this specific user
          const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
          const adminUser = users?.find((u: any) => u.user_metadata?.cv_webhook_url) || users?.[0];
          webhookUrl = adminUser?.user_metadata?.cv_webhook_url;
        }
      } else {
        // Public Upload: Validate uploadToken
        if (!uploadToken) {
          return res.status(401).json({ error: "Upload token is required" });
        }

        // Atomic delete to prevent race conditions
        const { data: tokenData, error: tokenError } = await supabaseAdmin
          .from('otp_requests')
          .delete()
          .eq('otp_code', uploadToken)
          .eq('is_used', true)
          .select()
          .single();

        if (tokenError || !tokenData) {
          return res.status(401).json({ error: "Invalid or already used upload token" });
        }

        if (new Date() > new Date(tokenData.expires_at)) {
          return res.status(401).json({ error: "Upload token expired" });
        }

        // Fetch webhook URL from admin settings
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const adminUser = users?.find((u: any) => u.user_metadata?.public_cv_webhook_url) || users?.[0];
        webhookUrl = adminUser?.user_metadata?.public_cv_webhook_url;
      }

      if (!webhookUrl) {
        return res.status(400).json({ error: "CV Webhook URL is not configured by Admin" });
      }

      if (isLocalUrl(webhookUrl)) {
        return res.status(400).json({ 
          error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
        });
      }

      try {
        const { data: job, error: jobError } = await supabaseAdmin
          .from('n8n_jobs')
          .insert([{
            job_type: 'upload_cv',
            status: 'pending',
            user_id: userId
          }])
          .select()
          .single();
        if (!jobError && job) {
          jobId = job.id;
        }
      } catch (e) {
        console.warn("n8n_jobs table might not exist yet. Falling back to synchronous mode.");
      }

      console.log(`Uploading CV to n8n webhook: ${webhookUrl}`);
      console.log(`File details: ${file.originalname}, ${file.mimetype}, ${file.size} bytes`);
      
      const form = new FormData();
      form.append('candidateName', candidateName || '');
      form.append('candidateEmail', candidateEmail || '');
      form.append('candidatePhone', candidatePhone || '');
      form.append('candidatePosition', candidatePosition || '');
      form.append('sourceInfo', sourceInfo || '');
      form.append('fileName', fileName || file.originalname);
      form.append('mimeType', mimeType || file.mimetype);
      form.append('uploadedAt', uploadedAt || new Date().toISOString());
      form.append('senderName', senderName || '');
      form.append('senderEmail', senderEmail || '');
      if (jobId) {
        form.append('job_id', jobId);
      }
      
      // Append the file buffer directly
      form.append('file', file.buffer, {
        filename: fileName || file.originalname,
        contentType: mimeType || file.mimetype,
      });

      const response = await axios.post(webhookUrl, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000 // 30 seconds timeout to prevent Vercel kill
      });

      console.log(`n8n upload response status: ${response.status}`);
      
      // Save metadata to Supabase if possible
      try {
        const supabaseAdmin = getSupabaseAdmin();
        await supabaseAdmin.from('cv_uploads').insert([{
          candidate_name: candidateName,
          candidate_email: candidateEmail,
          position: candidatePosition,
          file_name: fileName || file.originalname,
          mime_type: mimeType || file.mimetype,
          uploaded_at: uploadedAt || new Date().toISOString(),
          sender_name: senderName,
          sender_email: senderEmail
        }]);
      } catch (dbError) {
        console.warn("Could not save CV metadata to Supabase (table might not exist):", dbError);
      }

      if (jobId) {
        if (typeof response.data === 'object' && response.data !== null) {
          res.json({ ...response.data, jobId });
        } else {
          res.json({ message: response.data, jobId });
        }
      } else {
        res.json(response.data);
      }
    } catch (error: any) {
      console.error("Error uploading CV to n8n:", error);
      
      // If we created a job, update it to error status
      if (jobId) {
        try {
          const supabaseAdmin = getSupabaseAdmin();
          await supabaseAdmin
            .from('n8n_jobs')
            .update({ 
              status: 'error', 
              message: error.message || 'Gagal mengunggah CV ke server n8n' 
            })
            .eq('id', jobId);
        } catch (dbError) {
          console.error("Failed to update job status to error:", dbError);
        }
      }

      const status = error.response?.status || 500;
      
      // Log the actual error data from the webhook if available, but don't expose it to the client
      if (error.response?.data) {
        console.error("Webhook error response:", error.response.data);
      }
      
      // Return a generic, user-friendly error message
      const errorMessage = "Gagal mengirim lamaran. Sistem sedang sibuk atau ada gangguan pada layanan pengiriman. Silakan coba beberapa saat lagi.";
      
      res.status(status).json({ error: errorMessage });
    }
  });

  // Feature: Upload Application-Form Document (Public, token-gated)
  // Candidates filling /form-pelamar upload photo/KTP/ijazah/transcript/
  // payslip/other documents here instead of writing to Supabase Storage
  // directly from the browser. A valid, not-yet-used registration token is
  // required — the same token the candidate must enter to eventually submit
  // via the submit_application_with_token RPC. The token is NOT marked used
  // here (only at final submission), so one token can gate multiple document
  // uploads during a single form-filling session.
  app.post("/api/n8n/upload-document", uploadRateLimiter, (req: any, res, next) => {
    if (req.body && Buffer.isBuffer(req.body)) {
      const stream = new PassThrough();
      stream.end(req.body);
      (stream as any).headers = req.headers;
      (stream as any).method = req.method;
      (stream as any).url = req.url;

      uploadDocument.single('file')(stream as any, res, (err) => {
        if (err) return next(err);
        req.file = (stream as any).file;
        req.body = (stream as any).body;
        next();
      });
    } else if (req.body && typeof req.body === 'string') {
      const stream = new PassThrough();
      stream.end(Buffer.from(req.body));
      (stream as any).headers = req.headers;
      (stream as any).method = req.method;
      (stream as any).url = req.url;

      uploadDocument.single('file')(stream as any, res, (err) => {
        if (err) return next(err);
        req.file = (stream as any).file;
        req.body = (stream as any).body;
        next();
      });
    } else {
      uploadDocument.single('file')(req, res, next);
    }
  }, async (req: any, res: any) => {
    const { token, docType } = req.body || {};
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "File is required" });
    }

    const allowedDocTypes = ['photo', 'ktp', 'ijazah', 'transcript', 'payslip', 'other', 'portfolio'];
    if (!docType || !allowedDocTypes.includes(docType)) {
      return res.status(400).json({ error: "Invalid document type" });
    }

    if (!token) {
      return res.status(401).json({ error: "Token pendaftaran wajib diisi sebelum mengunggah dokumen." });
    }

    // The shared multer instance allows up to 5MB (the portfolio field's
    // ceiling) — everything else stays capped at 3MB server-side too, not
    // just via the client-side check in ApplicationForm.tsx.
    const maxSizeByDocType: Record<string, number> = { portfolio: 5 * 1024 * 1024 };
    const maxSize = maxSizeByDocType[docType] ?? 3 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(413).json({ error: `Ukuran file untuk ${docType} maksimal ${Math.round(maxSize / (1024 * 1024))}MB.` });
    }

    if (docType === 'portfolio') {
      const allowedPortfolioMimeTypes = [
        'application/pdf',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      ];
      if (!allowedPortfolioMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: "Bahan Presentasi / Portofolio harus berformat PDF, PPT, atau PPTX." });
      }
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: tokenData, error: tokenError } = await supabaseAdmin
        .from('registration_tokens')
        .select('id')
        .eq('token', token)
        .eq('is_used', false)
        .maybeSingle();

      if (tokenError || !tokenData) {
        return res.status(401).json({ error: "Token pendaftaran tidak valid atau sudah digunakan." });
      }

      const fileExt = (file.originalname.split('.').pop() || 'bin').toLowerCase();
      const filePath = `candidates/${docType}-${Date.now()}-${crypto.randomUUID()}.${fileExt}`;

      // Private bucket: no public URL is generated here. The frontend gets
      // back a bare storage path and must resolve it into a short-lived
      // signed URL via GET /api/documents/signed-url whenever it needs to
      // actually display/download the file.
      const { error: uploadError } = await supabaseAdmin.storage
        .from('candidate-documents-private')
        .upload(filePath, file.buffer, { contentType: file.mimetype });

      if (uploadError) {
        console.error("Error uploading document to storage:", uploadError);
        return res.status(500).json({ error: `Gagal mengunggah ${docType}: ${uploadError.message}` });
      }

      res.json({ url: filePath });
    } catch (error: any) {
      console.error("Error in /api/n8n/upload-document:", error);
      res.status(500).json({ error: "Gagal mengunggah dokumen. Silakan coba lagi." });
    }
  });

  // Resolve a storage path into a short-lived signed URL, for either the
  // private bucket or the legacy public one (once that's also flipped to
  // private, its documents still need to be viewable through here).
  // Authenticated-only: every readOnly render path that needs this
  // (CandidateProfile.tsx, ExternalData.tsx via ApplicationForm.tsx) is
  // only ever reached from logged-in HR/Director/Finance pages, never from
  // the public /form-pelamar route.
  const SIGNABLE_BUCKETS = ['candidate-documents-private', 'candidate-documents'];
  app.get("/api/documents/signed-url", requireAuth, async (req: any, res) => {
    const path = req.query?.path;
    const bucket = req.query?.bucket || 'candidate-documents-private';
    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "Parameter path wajib diisi." });
    }
    if (!SIGNABLE_BUCKETS.includes(bucket)) {
      return res.status(400).json({ error: "Bucket tidak valid." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(path, 600);

      if (error || !data) {
        return res.status(404).json({ error: "Dokumen tidak ditemukan." });
      }

      res.json({ url: data.signedUrl });
    } catch (error: any) {
      console.error("Error in /api/documents/signed-url:", error);
      res.status(500).json({ error: "Gagal membuat URL dokumen." });
    }
  });

  // Delete an object from candidate-documents-private (or, legacy, the old
  // public candidate-documents bucket — e.g. CVs still under cv-candidates/
  // uploaded before that bucket was superseded) using service_role
  // (bypasses RLS entirely). The client-side DELETE RLS policy was observed
  // to silently match zero rows on this self-hosted storage-api instance
  // (200 OK with an empty result, file left in place) despite matching the
  // documented policy conditions, for BOTH buckets — routing deletes
  // through the server sidesteps that instability rather than depending on
  // it. `bucket` is restricted to this allowlist so the endpoint can't be
  // used to delete from an arbitrary bucket.
  const DELETABLE_BUCKETS = ['candidate-documents-private', 'candidate-documents'];
  app.delete("/api/documents/remove", requireAuth, requireHrAdmin, async (req: any, res) => {
    const path = req.body?.path;
    const bucket = req.body?.bucket || 'candidate-documents-private';
    if (!path || typeof path !== "string") {
      return res.status(400).json({ error: "Parameter path wajib diisi." });
    }
    if (!DELETABLE_BUCKETS.includes(bucket)) {
      return res.status(400).json({ error: "Bucket tidak valid." });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { data, error } = await supabaseAdmin.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        console.error("Error removing document:", error);
        return res.status(500).json({ error: "Gagal menghapus dokumen." });
      }

      res.json({ removed: data?.length || 0 });
    } catch (error: any) {
      console.error("Error in /api/documents/remove:", error);
      res.status(500).json({ error: "Gagal menghapus dokumen." });
    }
  });

  // Feature: Fetch CV Uploads
  app.get("/api/cv-uploads", requireAuth, requireHrAdmin, async (req, res) => {
    const { search, page = '1', limit = '10' } = req.query;
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const pageNum = parseInt(page as string, 10);
      const limitNum = parseInt(limit as string, 10);
      const from = (pageNum - 1) * limitNum;
      const to = from + limitNum - 1;

      let query = supabaseAdmin.from('cv_uploads').select('*', { count: 'exact' }).order('uploaded_at', { ascending: false });
      
      if (search) {
        query = query.or(`candidate_name.ilike.%${search}%,candidate_email.ilike.%${search}%,position.ilike.%${search}%`);
      }

      const { data, error, count } = await query.range(from, to);
      if (error) {
        // Handle case where table might not exist yet (42P01 is Postgres code for undefined_table)
        if (error.code === '42P01') {
          console.warn("cv_uploads table does not exist yet. Returning empty array.");
          return res.json({ data: [], count: 0 });
        }
        throw error;
      }
      res.json({ data: data || [], count: count || 0 });
    } catch (error: any) {
      console.error("Error fetching CV uploads:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Feature: Delete CV Uploads
  app.delete("/api/cv-uploads", requireAuth, requireHrAdmin, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided" });
    }
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const { error } = await supabaseAdmin.from('cv_uploads').delete().in('id', ids);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error deleting CV uploads:", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // API 404 handler - Catch all unmatched /api routes
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API Route ${req.method} ${req.originalUrl} not found` });
  });

  // Global Error Handler for API and other errors
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler:", err);
    
    if (err instanceof SyntaxError && 'status' in err && err.status === 400 && 'body' in err) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    
    if (err.code === 'LIMIT_FILE_SIZE') {
      const limitLabel = req.path === '/api/n8n/upload-document' ? '3MB' : '15MB';
      return res.status(413).json({ error: `Ukuran file terlalu besar. Maksimal ${limitLabel} per dokumen.` });
    }

    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: "Payload atau file terlalu besar. Maksimal 20MB." });
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ error: "Field file tidak terduga. Gunakan field 'file'." });
    }

    // Default error response
    res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    (async () => {
      // Start listening first so we have a concrete http.Server to hand to
      // Vite's HMR websocket — without server.hmr.server, Vite instead
      // spins up its own standalone HMR server on a separate auto-picked
      // port, which the browser's HMR client (still pointed at this app's
      // own host/port) can never actually reach, causing a WebSocket
      // handshake 400 in the console (visible, but otherwise harmless:
      // code edits just require a manual browser refresh instead of
      // hot-reloading — doesn't affect the production build at all).
      const server = app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
      });

      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true, hmr: { server } },
        appType: "spa",
      });
      app.use(vite.middlewares);
    })();
  } else {
    // Serve static files in production (Local or non-Vercel)
    if (!process.env.VERCEL) {
      app.use(express.static(path.join(__dirname, "dist")));
      app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "dist", "index.html"));
      });
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
      });
    }
  }

export default app;
