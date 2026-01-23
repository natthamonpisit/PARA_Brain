
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

// FALLBACK CREDENTIALS (From .env)
// Added to ensure the app works in preview environments where .env might not be loaded correctly.
const FALLBACK_URL = 'https://rdohomvszfraxmcvboao.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkb2hvbXZzemZyYXhtY3Zib2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNTE2OTgsImV4cCI6MjA4NDcyNzY5OH0.QoJXQJM88wSIoMP4nMIO4w7bBOW-YbQNYI-2QvKEcj8';

// SECURE CONFIGURATION
// Prioritize environment variables, fallback to hardcoded values if missing
const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const supabaseUrl = envUrl || FALLBACK_URL;
const supabaseKey = envKey || FALLBACK_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] Critical Error: Missing configuration.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
