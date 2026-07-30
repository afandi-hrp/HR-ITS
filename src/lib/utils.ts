import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { supabase } from "./supabase";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function formatDateDMY(date: string | Date | null | undefined): string {
  if (!date) return "-";
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [year, month, day] = date.split("T")[0].split("-");
    return `${day}-${month}-${year}`;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) return typeof date === "string" ? date : "-";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
}

export function calculateAge(birthDate: string | Date | null | undefined): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  if (isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dob.getMonth() ||
    (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;

  return age >= 0 ? age : null;
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('62')) {
    cleaned = '0' + cleaned.substring(2);
  }
  return cleaned;
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return '';
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  return email.toLowerCase().trim();
}

export async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 5) {
  let retries = maxRetries;
  
  const finalOptions = { ...options };
  if (url.startsWith('/api/')) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        finalOptions.headers = {
          ...finalOptions.headers,
          Authorization: `Bearer ${session.access_token}`
        };
      }
    } catch(e) {
      // ignore
    }
  }

  while (retries > 0) {
    try {
      // Prevent caching of the "Please wait" page
      const fetchOptions = {
        ...finalOptions,
        headers: {
          ...finalOptions.headers,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        cache: 'no-store' as RequestCache
      };

      const response = await fetch(url, fetchOptions);
      
      if (response.ok) {
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") === -1) {
          const text = await response.text();
          if (text.includes('Please wait') || text.includes('<html')) {
            console.warn(`Server is starting up. Retrying ${url}... (${retries} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 3000));
            retries--;
            continue;
          }
          // If it's HTML but not "Please wait", maybe it's a real error page
          throw new Error('API returned non-JSON response');
        }
        return response;
      }
      
      // If not OK, check if it's a 502/504 (Gateway errors during restart)
      if (response.status === 502 || response.status === 504) {
        console.warn(`Gateway error ${response.status}. Retrying ${url}... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        retries--;
        continue;
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") === -1) {
        throw new Error(`API Error ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error: any) {
      // Catch network errors (e.g. connection refused) and retry
      console.warn(`Network error fetching ${url}: ${error.message}. Retrying... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, 3000));
      retries--;
      if (retries === 0) {
        throw error;
      }
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

export function extractPhotoUrl(sourceInfo: any): string | null {
  if (!sourceInfo) return null;
  
  let data = sourceInfo;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  
  if (typeof data !== 'object' || data === null) return null;

  const photoKeys = ['foto', 'photo', 'avatar', 'image_url', 'picture', 'url_foto', 'profile_picture'];
  
  // Recursive search for photo URL
  const searchPhoto = (obj: any): string | null => {
    if (typeof obj !== 'object' || obj === null) return null;
    
    for (const key of Object.keys(obj)) {
      const lowerKey = key.toLowerCase();
      if (photoKeys.some(pk => lowerKey.includes(pk)) && typeof obj[key] === 'string' && obj[key].startsWith('http')) {
        return obj[key];
      }
      
      if (typeof obj[key] === 'object') {
        const found = searchPhoto(obj[key]);
        if (found) return found;
      }
    }
    return null;
  };

  return searchPhoto(data);
}

export function getEmbedUrl(url: string | null | undefined): string {
  if (!url) return '';

  // PDFs render natively in an iframe in every modern browser — route them
  // directly instead of through Google Docs Viewer (docs.google.com/gview).
  // gview frequently fails to fetch storage URLs it can't access/render and
  // falls back to trying to download its own (empty) response, which shows
  // up in the browser's Downloads tray as a stray "gview" file every time
  // the candidate profile page loads a resume/psikotes result.
  const pathWithoutQuery = url.split('?')[0].split('#')[0];
  if (pathWithoutQuery.toLowerCase().endsWith('.pdf')) {
    return url;
  }

  // Check if it's a Google Docs link
  const docsMatch = url.match(/docs\.google\.com\/document\/d\/([^/]+)/);
  if (docsMatch) {
    return `https://docs.google.com/document/d/${docsMatch[1]}/preview`;
  }

  // Check if it's a Google Drive link
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  
  // Check if it's already a Google Drive preview or view link
  if (url.includes('drive.google.com') && (url.includes('/preview') || url.includes('/view'))) {
    return url.replace('/view', '/preview');
  }

  // Otherwise, use Google Docs Viewer for standard files (PDF, Word, etc.)
  return `https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`;
}

const SOCIAL_MEDIA_DOMAINS: Record<string, string> = {
  LinkedIn: 'https://www.linkedin.com/in/',
  Instagram: 'https://www.instagram.com/',
  Facebook: 'https://www.facebook.com/',
  Twitter: 'https://twitter.com/',
  YouTube: 'https://www.youtube.com/@',
};

<<<<<<< HEAD
// Real LinkedIn vanity slugs are hyphenated and never contain spaces (e.g.
// "julian-eric-faustin-1a2b3c4"). Candidates often type their plain full
// name instead ("Julian Eric Faustin"), which is guaranteed to 404 as a
// profile URL — LinkedIn redirects any unrecognized /in/ slug to /404/.
function looksLikePlainName(handle: string): boolean {
  return /\s/.test(handle) && !/[./]/.test(handle);
}

=======
>>>>>>> a233318b6129393b3cfc816167aa3a6dd6737f00
// Candidates on the application form often type just their handle (e.g.
// "ndah_sibarani28") instead of a full profile URL. Build a clickable link
// to the actual platform profile instead of naively prefixing "https://" —
// that would produce an invalid link like "https://ndah_sibarani28".
export function getSocialMediaUrl(platform: string | null | undefined, account: string | null | undefined): string {
  if (!account) return '#';
  const trimmed = account.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;

  const handle = trimmed.replace(/^@/, '');
<<<<<<< HEAD
  // Already looks like a bare domain+path (e.g. "instagram.com/xyz") — just add the protocol.
=======
  // Only treat it as an already-complete domain+path (e.g. "instagram.com/xyz")
  // when there's a path segment after the domain — otherwise a dotted
  // username like "ratna.sibarani" would be misread as a bare domain.
>>>>>>> a233318b6129393b3cfc816167aa3a6dd6737f00
  if (/^([a-z0-9-]+\.)+[a-z]{2,}\//i.test(handle)) {
    return `https://${handle}`;
  }

<<<<<<< HEAD
  // A plain full name can't resolve to a real LinkedIn profile URL — send
  // to LinkedIn's people search instead of a link that's guaranteed to 404.
  if (platform === 'LinkedIn' && looksLikePlainName(handle)) {
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(handle)}`;
  }

  const domain = platform ? SOCIAL_MEDIA_DOMAINS[platform] : undefined;
  return domain ? `${domain}${encodeURIComponent(handle)}` : `https://${handle}`;
=======
  const domain = platform ? SOCIAL_MEDIA_DOMAINS[platform] : undefined;
  return domain ? `${domain}${handle}` : `https://${handle}`;
}

// Adds Indonesian-style thousand separators (dots) to a raw number/digit
// string, e.g. "8100000" -> "8.100.000".
export function formatCurrencyId(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : Number(String(value).replace(/[^\d]/g, ''));
  if (isNaN(num)) return String(value);
  return num.toLocaleString('id-ID');
>>>>>>> a233318b6129393b3cfc816167aa3a6dd6737f00
}
