import { sendTelegramText } from './_lib/telegram.js';
import { requireAuth } from './_lib/authGuard.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireAuth(req, [process.env.CAPTURE_API_SECRET, process.env.CRON_SECRET]);
  if (!auth.ok) return res.status(auth.status).json(auth.body);

  try {
    const { message } = req.body || {};
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_USER_ID;

    if (!botToken) {
      return res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN' });
    }
    if (!chatId) {
      return res.status(500).json({ error: 'Missing TELEGRAM_CHAT_ID (or TELEGRAM_USER_ID fallback)' });
    }
    if (!message) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    const result = await sendTelegramText({
      botToken,
      chatId,
      text: String(message)
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    console.error('[telegram-push] failed', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
