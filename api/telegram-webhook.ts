import { createClient } from '@supabase/supabase-js';
import { sendTelegramText } from './_lib/telegram';
import { runCapturePipeline, toCaptureLogPayload } from './_lib/capturePipeline';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function verifyTelegramSecret(req: any): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const provided = req.headers?.['x-telegram-bot-api-secret-token'];
  return String(provided || '') === expected;
}

function getTextMessage(update: any) {
  const message = update?.message || update?.edited_message;
  if (!message || typeof message?.text !== 'string') return null;
  return {
    updateId: String(update?.update_id || ''),
    messageId: Number(message?.message_id || 0),
    chatId: String(message?.chat?.id || ''),
    userId: String(message?.from?.id || ''),
    text: String(message.text || '').trim()
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const allowedUserId = process.env.TELEGRAM_USER_ID;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!botToken) {
      return res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN' });
    }
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }
    if (!geminiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY or VITE_GEMINI_API_KEY' });
    }
    if (!verifyTelegramSecret(req)) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const incoming = getTextMessage(req.body);
    if (!incoming) {
      return res.status(200).json({ success: true, message: 'Ignored non-text update' });
    }

    if (allowedUserId && incoming.userId !== String(allowedUserId)) {
      return res.status(200).json({ success: true, message: 'Ignored unauthorized user' });
    }
    if (allowedChatId && incoming.chatId !== String(allowedChatId)) {
      return res.status(200).json({ success: true, message: 'Ignored unauthorized chat' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    if (incoming.text.toLowerCase() === 'id') {
      await sendTelegramText({
        botToken,
        chatId: incoming.chatId,
        text: `user_id=${incoming.userId}\nchat_id=${incoming.chatId}`,
        replyToMessageId: incoming.messageId
      });
      return res.status(200).json({ success: true });
    }

    const eventId = incoming.updateId || `${incoming.chatId}:${incoming.messageId}`;
    const { data: existingLog } = await supabase
      .from('system_logs')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existingLog) {
      return res.status(200).json({ success: true, message: 'Duplicate ignored' });
    }

    const { data: logRow, error: logError } = await supabase
      .from('system_logs')
      .insert({
        event_source: 'TELEGRAM',
        event_id: eventId,
        user_message: incoming.text,
        status: 'PROCESSING',
        action_type: 'THINKING'
      })
      .select('id')
      .single();

    if (logError || !logRow?.id) {
      return res.status(500).json({ error: logError?.message || 'Failed to create log row' });
    }

    const result = await runCapturePipeline({
      supabase,
      userMessage: incoming.text,
      source: 'TELEGRAM',
      geminiApiKey: geminiKey,
      approvalGatesEnabled: process.env.ENABLE_APPROVAL_GATES === 'true',
      timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok',
      excludeLogId: logRow.id
    });

    const payload = toCaptureLogPayload(result);

    await supabase
      .from('system_logs')
      .update({
        ai_response: JSON.stringify(payload),
        action_type: result.actionType,
        status: result.status
      })
      .eq('id', logRow.id);

    await sendTelegramText({
      botToken,
      chatId: incoming.chatId,
      text: result.chatResponse,
      replyToMessageId: incoming.messageId
    });

    return res.status(200).json({
      success: result.success,
      operation: result.operation,
      status: result.status
    });
  } catch (error: any) {
    console.error('[telegram-webhook] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}
