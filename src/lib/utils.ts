import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
  while (retries > 0) {
    try {
      // Prevent caching of the "Please wait" page
      const fetchOptions = {
        ...options,
        headers: {
          ...options?.headers,
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
