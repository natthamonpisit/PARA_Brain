
import { createClient } from '@supabase/supabase-js';

// Helper to safely get env vars without crashing
const getEnvVar = (key: string): string => {
  try {
    // Check import.meta.env (Vite)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      // @ts-ignore
      return import.meta.env[key];
    }
  } catch (e) {}

  try {
    // Check process.env (Node/Webpack/Other)
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      // @ts-ignore
      return process.env[key];
    }
  } catch (e) {}

  return '';
};

// SECURE CONFIGURATION
const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] Missing environment variables. Check .env file or environment configuration.');
}

// Prevent crash if URL is empty by using a dummy URL if missing (Note: requests will fail, but app won't crash on load)
const safeUrl = supabaseUrl || 'https://placeholder.supabase.co';
const safeKey = supabaseKey || 'placeholder';

export const supabase = createClient(safeUrl, safeKey);
