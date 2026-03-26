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

export async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 3) {
  let retries = maxRetries;
  while (retries > 0) {
    const response = await fetch(url, options);
    
    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") === -1) {
        const text = await response.text();
        if (text.includes('Please wait') || text.includes('<html')) {
          console.warn(`Server is starting up. Retrying ${url}...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
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
      console.warn(`Gateway error ${response.status}. Retrying ${url}...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      retries--;
      continue;
    }
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") === -1) {
      throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }
    
    return response;
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}
