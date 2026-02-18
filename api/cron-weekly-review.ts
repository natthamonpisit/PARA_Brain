import { requireAuth } from './_lib/authGuard.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAuth(req, [process.env.CRON_SECRET]);
  if (!auth.ok) return res.status(auth.status).json(auth.body);

  try {
    const { runWeeklyOpsReview } = await import('../scripts/run_weekly_ops_review.mjs');
    const result = await runWeeklyOpsReview({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
      timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok'
    });
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron-weekly-review] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
