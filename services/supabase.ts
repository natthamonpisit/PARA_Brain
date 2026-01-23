
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

// FALLBACK CREDENTIALS (From .env)
const FALLBACK_URL = 'https://rdohomvszfraxmcvboao.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkb2hvbXZzemZyYXhtY3Zib2FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNTE2OTgsImV4cCI6MjA4NDcyNzY5OH0.QoJXQJM88wSIoMP4nMIO4w7bBOW-YbQNYI-2QvKEcj8';

// SECURE CONFIGURATION
const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

// Ensure we don't pass empty strings to createClient which might trigger internal errors
const supabaseUrl = envUrl || FALLBACK_URL;
const supabaseKey = envKey || FALLBACK_KEY;

if (!envUrl || !envKey) {
    // Log warning but continue with fallback
    console.warn('[Supabase] Environment variables missing. Using fallback configuration.');
}

if (!supabaseUrl || !supabaseKey) {
    console.error('[Supabase] Critical Error: Missing configuration.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);
