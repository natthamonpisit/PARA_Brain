import { sendTelegramText } from './_lib/telegram.js';

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
    const { runHeartbeat } = await import('../scripts/run_heartbeat.mjs');
    const result = await runHeartbeat({
      supabaseUrl: process.env.VITE_SUPABASE_URL,
      serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY,
      timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok'
    });

    const shouldPushTelegram = process.env.HEARTBEAT_PUSH_TELEGRAM === 'true';
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_USER_ID;
    if (shouldPushTelegram && botToken && chatId) {
      const warnCount = result.checks.filter((c: any) => c.status === 'WARN').length;
      const msg = [
        `Heartbeat ${result.today} (${result.overall})`,
        `Warn checks: ${warnCount}`,
        ...result.checks.map((c: any) => `- [${c.status}] ${c.key}: ${c.detail}`)
      ].join('\n');
      await sendTelegramText({
        botToken,
        chatId,
        text: msg
      });
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error: any) {
    console.error('[cron-heartbeat] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
