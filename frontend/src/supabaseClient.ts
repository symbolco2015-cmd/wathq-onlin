import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

// Helper function to validate if the URL is a real HTTP/HTTPS link
const isValidSupabaseUrl = (url: string) => {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
};

// Check if environment variables are set and valid before creating the client
export const supabase = supabaseUrl && supabaseAnonKey && isValidSupabaseUrl(supabaseUrl)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

if (!supabase) {
  console.warn('Supabase URL or Anon Key is missing or invalid. Operating in Local Storage fallback mode. Please set valid keys in your .env file.');
}

