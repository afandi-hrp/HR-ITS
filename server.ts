import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import multer from "multer";
import axios from "axios";
import FormData from "form-data";
import { PassThrough } from "stream";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });
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
  app.post("/api/n8n/trigger", async (req, res) => {
    const { webhookUrl, payload } = req.body || {};

    if (!webhookUrl) {
      return res.status(400).json({ error: "Webhook URL is required" });
    }

    if (isLocalUrl(webhookUrl)) {
      return res.status(400).json({ 
        error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
      });
    }

    try {
      console.log(`Triggering n8n webhook: ${webhookUrl}`);
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

  // Feature: Upload CV to n8n (Multipart)
  app.post("/api/n8n/upload-cv", (req: any, res, next) => {
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
      webhookUrl, 
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

    if (!webhookUrl || !file) {
      return res.status(400).json({ error: "Webhook URL and file are required" });
    }

    if (isLocalUrl(webhookUrl)) {
      return res.status(400).json({ 
        error: "Vercel (Cloud) tidak dapat mengakses n8n lokal (localhost/IP Private). Gunakan ngrok, localtunnel, atau n8n Cloud agar dapat diakses dari internet." 
      });
    }

    try {
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
