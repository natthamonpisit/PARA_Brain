import { createClient } from '@supabase/supabase-js';
import { finalizeApiObservation, startApiObservation } from './_lib/observability';

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/agent-daily', { source: 'AGENT' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const allowUiTrigger = process.env.ALLOW_AGENT_UI_TRIGGER === 'true';
    const approvalSecret = process.env.APPROVAL_SECRET;

    if (!supabaseUrl || !serviceRole || !geminiKey) {
      return respond(500, { error: 'Missing server configuration' }, { reason: 'missing_env' });
    }

    const providedKey =
      req.headers?.['x-cron-key'] ||
      req.headers?.authorization?.replace('Bearer ', '') ||
      req.query?.key;
    if (cronSecret && providedKey !== cronSecret && !allowUiTrigger) {
      return respond(401, {
        error: 'Unauthorized. Provide x-cron-key or enable ALLOW_AGENT_UI_TRIGGER=true for UI/manual runs.'
      }, { reason: 'auth_failed' });
    }

    const dryRun = !!req.body?.dryRun;
    const force = !!req.body?.force;
    const runDate = typeof req.body?.date === 'string' ? req.body.date : undefined;
    const approvalKey = req.headers?.['x-approval-key'] || req.query?.approval_key;

    if (force && approvalSecret && approvalKey !== approvalSecret) {
      return respond(403, {
        error: 'Force run requires valid approval key (x-approval-key).'
      }, { reason: 'approval_required' });
    }

    const db = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Rate guard: block repeated runs in short interval unless forced.
    if (!force) {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recentRuns, error: recentErr } = await db
        .from('agent_runs')
        .select('id,status,started_at')
        .eq('run_type', 'DAILY_BRIEF')
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(1);
      if (recentErr) return respond(500, { error: recentErr.message }, { reason: 'recent_runs_query_failed' });
      if (recentRuns && recentRuns.length > 0) {
        return respond(429, {
          error: 'Daily agent recently triggered. Use force=true to bypass.',
          retryable: true
        }, { reason: 'cooldown_guard' });
      }
    }

    // Idempotency guard: block duplicate success for same date unless forced.
    if (!force && runDate) {
      const { data: existingSummary, error: existsErr } = await db
        .from('memory_summaries')
        .select('id,summary_date')
        .eq('summary_type', 'DAILY')
        .eq('summary_date', runDate)
        .maybeSingle();
      if (existsErr) return respond(500, { error: existsErr.message }, { reason: 'summary_exists_query_failed' });
      if (existingSummary) {
        return respond(409, {
          error: `Summary already exists for ${runDate}. Use force=true to regenerate.`,
          retryable: true
        }, { reason: 'idempotency_guard', runDate });
      }
    }

    const { runDailyBrief } = await import('../scripts/lib/agent_daily_core.mjs');
    const result = await runDailyBrief({
      supabaseUrl,
      serviceRole,
      geminiKey,
      model: process.env.AGENT_MODEL || 'gemini-2.0-flash',
      ownerKey: process.env.AGENT_OWNER_KEY || 'default',
      runDate,
      dryRun,
      writeFile: false
    });

    return respond(200, { success: true, ...result, dryRun }, {
      dryRun,
      force,
      runDate: runDate || null
    });
  } catch (error: any) {
    console.error('[api/agent-daily] failed', error);
    return respond(500, { error: error.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
