import { createClient } from '@supabase/supabase-js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    const cronSecret = process.env.CRON_SECRET;
    const allowUiTrigger = process.env.ALLOW_AGENT_UI_TRIGGER === 'true';
    const approvalSecret = process.env.APPROVAL_SECRET;

    if (!supabaseUrl || !serviceRole || !geminiKey) {
      return res.status(500).json({ error: 'Missing server configuration' });
    }

    const providedKey =
      req.headers?.['x-cron-key'] ||
      req.headers?.authorization?.replace('Bearer ', '') ||
      req.query?.key;
    if (cronSecret && providedKey !== cronSecret && !allowUiTrigger) {
      return res.status(401).json({
        error: 'Unauthorized. Provide x-cron-key or enable ALLOW_AGENT_UI_TRIGGER=true for UI/manual runs.'
      });
    }

    const dryRun = !!req.body?.dryRun;
    const force = !!req.body?.force;
    const runDate = typeof req.body?.date === 'string' ? req.body.date : undefined;
    const approvalKey = req.headers?.['x-approval-key'] || req.query?.approval_key;

    if (force && approvalSecret && approvalKey !== approvalSecret) {
      return res.status(403).json({
        error: 'Force run requires valid approval key (x-approval-key).'
      });
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
      if (recentErr) return res.status(500).json({ error: recentErr.message });
      if (recentRuns && recentRuns.length > 0) {
        return res.status(429).json({
          error: 'Daily agent recently triggered. Use force=true to bypass.',
          retryable: true
        });
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
      if (existsErr) return res.status(500).json({ error: existsErr.message });
      if (existingSummary) {
        return res.status(409).json({
          error: `Summary already exists for ${runDate}. Use force=true to regenerate.`,
          retryable: true
        });
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

    return res.status(200).json({ success: true, ...result, dryRun });
  } catch (error: any) {
    console.error('[api/agent-daily] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
