import { createClient } from '@supabase/supabase-js';

function getAuthKey(req: any): string {
  return req.headers?.['x-agent-key'] || req.headers?.authorization?.replace('Bearer ', '') || req.query?.key || '';
}

function requireAuth(req: any, res: any): string | null {
  const agentJobSecret = process.env.AGENT_JOB_SECRET || process.env.CRON_SECRET;
  if (!agentJobSecret) {
    res.status(401).json({ error: 'Unauthorized. Set AGENT_JOB_SECRET (or CRON_SECRET fallback).' });
    return null;
  }
  const provided = getAuthKey(req);
  if (provided !== agentJobSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return agentJobSecret;
}

export default async function handler(req: any, res: any) {
  const authOk = requireAuth(req, res);
  if (!authOk) return;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Missing server configuration' });
  }
  const db = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    if (req.method === 'GET') {
      const status = typeof req.query?.status === 'string' ? req.query.status : null;
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 20)));
      let q = db.from('external_agent_jobs').select('*').order('requested_at', { ascending: false }).limit(limit);
      if (status) q = q.eq('status', status);
      const { data, error } = await q;
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, jobs: data || [] });
    }

    if (req.method === 'POST') {
      const requestText = String(req.body?.requestText || '').trim();
      if (!requestText) return res.status(400).json({ error: 'requestText is required' });

      const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
      const source = String(req.body?.source || 'OPENCLAW');
      const priority = Number.isFinite(Number(req.body?.priority)) ? Number(req.body.priority) : 100;
      const dedupeKey = req.body?.dedupeKey ? String(req.body.dedupeKey) : null;
      const createdBy = req.body?.createdBy ? String(req.body.createdBy) : 'user';
      const autoApprove = req.body?.autoApprove === true || process.env.AUTO_APPROVE_AGENT_JOBS === 'true';

      const { data, error } = await db
        .from('external_agent_jobs')
        .insert({
          source,
          request_text: requestText,
          payload,
          priority,
          dedupe_key: dedupeKey,
          created_by: createdBy,
          status: autoApprove ? 'APPROVED' : 'REQUESTED'
        })
        .select('*')
        .single();
      if (error) return res.status(500).json({ error: error.message });

      await db.from('external_agent_actions').insert({
        job_id: data.id,
        actor: createdBy,
        action_type: autoApprove ? 'APPROVED' : 'REQUESTED',
        action_payload: { source, priority, dedupe_key: dedupeKey }
      });

      return res.status(200).json({ success: true, job: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[agent-jobs] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
