
import { createClient } from '@supabase/supabase-js';

// Helper to safely get env vars without crashing
// Rewritten to be extra defensive against "Cannot read properties of undefined"
const getEnvVar = (key: string): string => {
  let val = '';
  
  // 1. Try Import Meta (Vite)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      // @ts-ignore
      val = import.meta.env[key] || '';
    }
  } catch (e) { /* ignore */ }

  if (val) return val;

  // 2. Try Process Env (Node/Webpack)
  try {
    // @ts-ignore
    if (typeof process !== 'undefined' && process && process.env) {
      // @ts-ignore
      val = process.env[key] || '';
    }
  } catch (e) { /* ignore */ }

  return val;
};

const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!envUrl || !envKey) {
  throw new Error('[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(envUrl, envKey);
