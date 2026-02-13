export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  const providedKey = req.query?.key || req.headers?.['x-cron-key'];
  if (!cronSecret || providedKey !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { runHeartbeat } = await import('../scripts/run_heartbeat.mjs');
    const result = await runHeartbeat({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
      timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok'
    });

    const shouldPushLine = process.env.HEARTBEAT_PUSH_LINE === 'true';
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const targetUserId = process.env.LINE_USER_ID;
    if (shouldPushLine && channelAccessToken && targetUserId) {
      const warnCount = result.checks.filter((c: any) => c.status === 'WARN').length;
      const msg = [
        `Heartbeat ${result.today} (${result.overall})`,
        `Warn checks: ${warnCount}`,
        ...result.checks.map((c: any) => `- [${c.status}] ${c.key}: ${c.detail}`)
      ].join('\n');
      await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${channelAccessToken}`
        },
        body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: msg.slice(0, 4500) }] })
      });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron-heartbeat] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
