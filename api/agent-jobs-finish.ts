import { createClient } from '@supabase/supabase-js';

function getAuthKey(req: any): string {
  return req.headers?.['x-agent-key'] || req.headers?.authorization?.replace('Bearer ', '') || req.query?.key || '';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.AGENT_JOB_SECRET || process.env.CRON_SECRET;
  if (!secret) return res.status(401).json({ error: 'Unauthorized. Set AGENT_JOB_SECRET (or CRON_SECRET fallback).' });
  if (getAuthKey(req) !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Missing server configuration' });

  const jobId = String(req.body?.jobId || '').trim();
  const agentName = String(req.body?.agentName || '').trim();
  const success = req.body?.success !== false;
  const result = req.body?.result && typeof req.body.result === 'object' ? req.body.result : {};
  const errorText = req.body?.errorText ? String(req.body.errorText) : null;
  if (!jobId) return res.status(400).json({ error: 'jobId is required' });
  if (!agentName) return res.status(400).json({ error: 'agentName is required' });

  try {
    const db = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await db.rpc('finish_external_agent_job', {
      p_job_id: jobId,
      p_actor: agentName,
      p_success: success,
      p_result: result,
      p_error_text: errorText
    });
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Job not found or not in running state' });
    return res.status(200).json({ success: true, job: data });
  } catch (error: any) {
    console.error('[agent-jobs-finish] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
