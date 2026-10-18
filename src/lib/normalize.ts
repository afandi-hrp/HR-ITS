// Dependency-free so server/ can import it too (utils.ts pulls in the
// browser Supabase client).

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
