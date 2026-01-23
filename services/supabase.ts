import { createClient } from '@supabase/supabase-js';

// HARDCODED FOR DEBUGGING AS REQUESTED
const supabaseUrl = 'https://rdohomvszfraxmcvboao.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkb2hvbXZzemZyYXhtY3Zib2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNTE2OTgsImV4cCI6MjA4NDcyNzY5OH0.QoJXQJM88wSIoMP4nMIO4w7bBOW-YbQNYI-2QvKEcj8';

// --- DEBUG LOGGING ---
console.log('[Supabase] Initializing client (Hardcoded)...');
console.log('[Supabase] URL:', supabaseUrl);
console.log('[Supabase] Key (partial):', supabaseKey ? `${supabaseKey.substring(0, 10)}...` : 'MISSING');

export const supabase = createClient(supabaseUrl, supabaseKey);