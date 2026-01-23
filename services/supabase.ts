import { createClient } from '@supabase/supabase-js';

// SECURE CONFIGURATION
// @ts-ignore
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
// @ts-ignore
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] Missing environment variables. Check .env file.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');