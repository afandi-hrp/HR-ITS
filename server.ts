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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const triggerRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: "Terlalu banyak permintaan, silakan coba lagi nanti." }
});

const uploadRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 uploads per windowMs
  message: { error: "Terlalu banyak permintaan upload, silakan coba lagi nanti." }
});

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
const app = express();

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

const PORT = 3000;

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

  // Feature: Move Candidate to Log
  app.post("/api/candidates/move-to-log", async (req, res) => {
    const { candidateId, notes } = req.body;

    if (!candidateId) {
      return res.status(400).json({ error: "Candidate ID is required" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      // 1. Fetch candidate with schedules
      const { data: candidate, error: fetchError } = await supabaseAdmin
        .from("candidates")
        .select("*, psikotes_schedules(is_confirmed), interview_schedules(is_confirmed)")
        .eq("id", candidateId)
        .single();

      if (fetchError || !candidate) {
        return res.status(404).json({ error: "Candidate not found" });
      }

      // 2. Insert into logs (Remove fields that don't exist in candidate_logs and add statuses)
      const { created_at, updated_at, psikotes_schedules, interview_schedules, ...baseData } = candidate;
      
      const logData = {
        ...baseData,
        psikotes_status: psikotes_schedules?.some((s: any) => s.is_confirmed) ? "Sudah Psikotes" : "Belum Psikotes",
        interview_status: interview_schedules?.some((s: any) => s.is_confirmed) ? "Sudah Interview" : "Belum Interview",
        notes: notes || "",
        archived_at: new Date().toISOString(),
        created_at: candidate.created_at,
        updated_at: candidate.updated_at
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

    if (!type || !['email', 'wa', 'test'].includes(type)) {
      return res.status(400).json({ error: "Valid type (email, wa, test) is required" });
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.split(' ')[1];
      
      // Verify user
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
      
      if (authError || !user) {
        return res.status(401).json({ error: "Unauthorized. Invalid token." });
      }

      // Fetch webhook URL based on type from user metadata
      let webhookUrl = '';
      if (type === 'email') {
        webhookUrl = user.user_metadata?.n8n_webhook_url;
      } else if (type === 'wa') {
        webhookUrl = user.user_metadata?.wa_webhook_url;
      } else if (type === 'test') {
        const testType = payload?.type;
        if (testType === 'email') webhookUrl = user.user_metadata?.n8n_webhook_url;
        else if (testType === 'cv') webhookUrl = user.user_metadata?.cv_webhook_url;
        else if (testType === 'sheet') webhookUrl = user.user_metadata?.sheet_webhook_url;
        else if (testType === 'otp') webhookUrl = user.user_metadata?.otp_webhook_url;
        else if (testType === 'wa') webhookUrl = user.user_metadata?.wa_webhook_url;
      }

      if (!webhookUrl) {
        return res.status(400).json({ error: `Webhook URL for ${type === 'test' ? payload?.type : type} is not configured in your settings. Please save your settings first.` });
      }

      if (isLocalUrl(webhookUrl)) {
        return res.status(400).json({ 
          error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
        });
      }

      console.log(`Triggering n8n webhook for ${type}`);
      const response = await axios.post(webhookUrl, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000 // 5 seconds timeout to prevent Vercel 10s kill
      });

      console.log(`n8n response status: ${response.status}`);
      res.json(response.data);
    } catch (error: any) {
      console.error("Error triggering n8n proxy:", error);
      const status = error.response?.status || 500;
      const data = error.response?.data || { error: error.message };
      res.status(status).json(data);
    }
  });

  // Feature: Request OTP for Public Career Page
  app.post("/api/request-otp", async (req, res) => {
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
        timeout: 5000
      });

      res.json({ success: true, otpRequestId: otpData.id });
    } catch (error: any) {
      console.error("Error requesting OTP:", error);
      const status = error.response?.status || 500;
      const data = error.response?.data || { error: error.message };
      res.status(status).json(data);
    }
  });

  // Feature: Verify OTP for Public Career Page
  app.post("/api/verify-otp", async (req, res) => {
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
      candidatePosition, 
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

    try {
      const supabaseAdmin = getSupabaseAdmin();
      let webhookUrl = '';

      // Check if request is authenticated (HR) or public (Candidate with token)
      const authHeader = req.headers.authorization;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        // HR Upload: Validate Supabase token
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
        
        if (error || !user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
        
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
        const adminUser = users?.find((u: any) => u.user_metadata?.cv_webhook_url) || users?.[0];
        webhookUrl = adminUser?.user_metadata?.cv_webhook_url;
      }

      if (!webhookUrl) {
        return res.status(400).json({ error: "CV Webhook URL is not configured by Admin" });
      }

      if (isLocalUrl(webhookUrl)) {
        return res.status(400).json({ 
          error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
        });
      }

      console.log(`Uploading CV to n8n webhook: ${webhookUrl}`);
      console.log(`File details: ${file.originalname}, ${file.mimetype}, ${file.size} bytes`);
      
      const form = new FormData();
      form.append('candidateName', candidateName || '');
      form.append('candidateEmail', candidateEmail || '');
      form.append('candidatePosition', candidatePosition || '');
      form.append('fileName', fileName || file.originalname);
      form.append('mimeType', mimeType || file.mimetype);
      form.append('uploadedAt', uploadedAt || new Date().toISOString());
      form.append('senderName', senderName || '');
      form.append('senderEmail', senderEmail || '');
      
      // Append the file buffer directly
      form.append('file', file.buffer, {
        filename: fileName || file.originalname,
        contentType: mimeType || file.mimetype,
      });

      const response = await axios.post(webhookUrl, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 5000 // 5 seconds timeout to prevent Vercel 10s kill
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

      res.json(response.data);
    } catch (error: any) {
      console.error("Error uploading CV to n8n:", error);
      const status = error.response?.status || 500;
      const data = error.response?.data || { error: error.message };
      res.status(status).json(data);
    }
  });

  // Feature: Fetch CV Uploads
  app.get("/api/cv-uploads", async (req, res) => {
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
  app.delete("/api/cv-uploads", async (req, res) => {
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
    
    if (err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE') {
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
      const viteModule = await import("vite");
      const vite = await viteModule.createServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      app.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
      });
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
