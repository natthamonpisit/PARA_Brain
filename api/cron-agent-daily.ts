export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedKey = req.query?.key || req.headers?.['x-cron-key'];
  if (cronSecret && providedKey !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron-agent-daily] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
