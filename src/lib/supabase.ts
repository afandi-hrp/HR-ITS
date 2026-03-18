import { createClient } from '@supabase/supabase-js';

let supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://supabase2.waruna-group.co.id';
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcyNzY2MTc3LCJleHAiOjE5MzA0NDYxNzd9.fCRpiSLK-sonhxX8mZDzQBbgJRaPk9U8-oW4-JRogu8';

// Force HTTPS if it's accidentally set to HTTP
if (supabaseUrl && supabaseUrl.startsWith('http://')) {
  supabaseUrl = supabaseUrl.replace('http://', 'https://');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing! VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not defined.');
} else {
  console.log('Supabase client initialized with URL:', supabaseUrl);
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
