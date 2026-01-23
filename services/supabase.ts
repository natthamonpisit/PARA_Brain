import { createClient } from '@supabase/supabase-js';

// Strictly access environment variables. 
// We use optional chaining to prevent crash if import.meta.env is undefined.
// @ts-ignore
const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || '';
// @ts-ignore
const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || '';

// --- DEBUG LOGGING ---
// Check your browser console to see if these match what you expect
console.log('[Supabase] Initializing client...');
console.log('[Supabase] URL:', supabaseUrl);
// Log only the first 10 chars of the key for security/verification
console.log('[Supabase] Key (partial):', supabaseKey ? `${supabaseKey.substring(0, 10)}...` : 'MISSING');

if (!supabaseUrl || !supabaseKey) {
  console.error('CRITICAL ERROR: Supabase credentials are missing in .env file.');
  console.error('Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

// Initialize Supabase client.
export const supabase = createClient(supabaseUrl, supabaseKey);