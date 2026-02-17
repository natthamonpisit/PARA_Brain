import { finalizeApiObservation, startApiObservation } from './_lib/observability.js';
import { requireAuth } from './_lib/authGuard.js';

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/cron-agent-daily', { source: 'CRON' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  const auth = requireAuth(req, [process.env.CRON_SECRET]);
  if (!auth.ok) return respond(auth.status, auth.body, { reason: 'auth_failed' });

  try {
    const { runDailyBrief } = await import('../scripts/lib/agent_daily_core.mjs');
    const result = await runDailyBrief({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
      geminiKey: process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY,
      model: process.env.AGENT_MODEL || 'gemini-2.0-flash',
      embeddingModel: process.env.AGENT_EMBEDDING_MODEL || 'gemini-embedding-001',
      ownerKey: process.env.AGENT_OWNER_KEY || 'default',
      writeFile: false,
      dryRun: false
    });
    return respond(200, { success: true, ...result }, {
      runType: 'DAILY_BRIEF',
      dryRun: false
    });
  } catch (error: any) {
    console.error('[cron-agent-daily] failed', error);
    return respond(500, { error: error.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
