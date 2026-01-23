import { createClient } from '@supabase/supabase-js';

let supabaseUrl = '';
let supabaseKey = '';

try {
  // @ts-ignore
  if (import.meta && import.meta.env) {
    // @ts-ignore
    supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    // @ts-ignore
    supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
  }
} catch (e) {
  console.warn('Environment variables (import.meta.env) not accessible.');
}

if (!supabaseUrl || !supabaseKey) {
  try {
    if (typeof process !== 'undefined' && process.env) {
      supabaseUrl = process.env.VITE_SUPABASE_URL || '';
      supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
    }
  } catch (e) {}
}

export const isSupabaseConfigured = !!(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.warn('Supabase credentials missing. Falling back to LocalStorage.');
}

// Initialize with fallback values to prevent instant crash on load.
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co', 
  supabaseKey || 'placeholder-key'
);