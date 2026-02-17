import { createClient } from '@supabase/supabase-js';
import {
  extractCustomInstructionsFromPreferences,
  normalizeCustomAiInstructions
} from './_lib/aiConfig.js';
import { finalizeApiObservation, startApiObservation } from './_lib/observability.js';
import { requireAuth } from './_lib/authGuard.js';

const OWNER_KEY = process.env.AGENT_OWNER_KEY || 'default';

function getServiceClient() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/ai-config', { source: 'AI_CONFIG' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  const auth = requireAuth(req, [process.env.CAPTURE_API_SECRET, process.env.CRON_SECRET]);
  if (!auth.ok) return respond(auth.status, auth.body, { reason: 'auth_failed' });

  if (!['GET', 'POST'].includes(String(req.method || '').toUpperCase())) {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return respond(500, { error: 'Missing Supabase server configuration' }, { reason: 'missing_env' });
  }

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_profile')
        .select('owner_key,preferences')
        .eq('owner_key', OWNER_KEY)
        .maybeSingle();

      if (error) {
        return respond(500, { error: error.message }, { reason: 'profile_select_failed' });
      }

      const customInstructions = extractCustomInstructionsFromPreferences(data?.preferences || {});
      return respond(200, {
        success: true,
        ownerKey: OWNER_KEY,
        customInstructions
      }, {
        ownerKey: OWNER_KEY,
        customInstructionCount: customInstructions.length
      });
    }

    const incoming = normalizeCustomAiInstructions(req.body?.instructions || []);
    const nowIso = new Date().toISOString();
    const { data: existing, error: selectError } = await supabase
      .from('user_profile')
      .select('id,preferences,timezone')
      .eq('owner_key', OWNER_KEY)
      .maybeSingle();

    if (selectError) {
      return respond(500, { error: selectError.message }, { reason: 'profile_select_failed' });
    }

    const mergedPreferences = {
      ...(existing?.preferences || {}),
      ai_custom_instructions: incoming,
      ai_custom_instructions_updated_at: nowIso
    };

    const payload = existing?.id
      ? {
          id: existing.id,
          owner_key: OWNER_KEY,
          timezone: String(existing.timezone || 'Asia/Bangkok'),
          preferences: mergedPreferences,
          updated_at: nowIso
        }
      : {
          owner_key: OWNER_KEY,
          timezone: 'Asia/Bangkok',
          goals: [],
          constraints: [],
          preferences: mergedPreferences,
          created_at: nowIso,
          updated_at: nowIso
        };

    const { error: upsertError } = await supabase
      .from('user_profile')
      .upsert(payload, { onConflict: 'owner_key' });

    if (upsertError) {
      return respond(500, { error: upsertError.message }, { reason: 'profile_upsert_failed' });
    }

    return respond(200, {
      success: true,
      ownerKey: OWNER_KEY,
      customInstructions: incoming
    }, {
      ownerKey: OWNER_KEY,
      customInstructionCount: incoming.length
    });
  } catch (error: any) {
    return respond(500, { error: error?.message || 'Internal error' }, { reason: 'exception' });
  }
}
