import { createClient } from '@supabase/supabase-js';

function getAuthKey(req: any): string {
  return req.headers?.['x-agent-key'] || req.headers?.authorization?.replace('Bearer ', '') || req.query?.key || '';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.APPROVAL_SECRET || process.env.AGENT_JOB_SECRET || process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'Missing approval/job secret' });
  if (getAuthKey(req) !== secret) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Missing server configuration' });

  const jobId = String(req.body?.jobId || '').trim();
  const actor = String(req.body?.actor || 'approver');
  const approve = req.body?.approve !== false;
  const note = req.body?.note ? String(req.body.note) : null;
  if (!jobId) return res.status(400).json({ error: 'jobId is required' });

  try {
    const db = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await db.rpc('approve_external_agent_job', {
      p_job_id: jobId,
      p_actor: actor,
      p_approve: approve,
      p_note: note
    });
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Job not found or not in approvable state' });
    return res.status(200).json({ success: true, job: data });
  } catch (error: any) {
    console.error('[agent-jobs-approve] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
