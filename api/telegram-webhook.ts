import { createClient } from '@supabase/supabase-js';
import { sendTelegramText } from './_lib/telegram';
import { runCapturePipeline, toCaptureLogPayload } from './_lib/capturePipeline';
import { finalizeApiObservation, startApiObservation } from './_lib/observability';

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

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key value');
}

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/telegram-webhook', { source: 'TELEGRAM' });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const allowedUserId = process.env.TELEGRAM_USER_ID;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

    if (!botToken) {
      return respond(500, { error: 'Missing TELEGRAM_BOT_TOKEN' }, { reason: 'missing_token' });
    }
    if (!supabaseUrl || !supabaseKey) {
      return respond(500, { error: 'Missing Supabase credentials' }, { reason: 'missing_supabase' });
    }
    if (!geminiKey) {
      return respond(500, { error: 'Missing GEMINI_API_KEY or VITE_GEMINI_API_KEY' }, { reason: 'missing_gemini_key' });
    }
    if (!verifyTelegramSecret(req)) {
      return respond(401, { error: 'Invalid webhook secret' }, { reason: 'invalid_secret' });
    }

    const incoming = getTextMessage(req.body);
    if (!incoming) {
      return respond(200, { success: true, message: 'Ignored non-text update' }, { ignored: 'non_text' });
    }

    if (allowedUserId && incoming.userId !== String(allowedUserId)) {
      return respond(200, { success: true, message: 'Ignored unauthorized user' }, { ignored: 'unauthorized_user' });
    }
    if (allowedChatId && incoming.chatId !== String(allowedChatId)) {
      return respond(200, { success: true, message: 'Ignored unauthorized chat' }, { ignored: 'unauthorized_chat' });
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
      return respond(200, { success: true }, { operation: 'ID_DISCOVERY' });
    }

    const eventId = incoming.updateId || `${incoming.chatId}:${incoming.messageId}`;
    const { data: existingLog } = await supabase
      .from('system_logs')
      .select('id')
      .eq('event_source', 'TELEGRAM')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existingLog) {
      return respond(200, { success: true, message: 'Duplicate ignored' }, { duplicateEvent: true, eventId });
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
      if (isUniqueViolation(logError)) {
        return respond(200, { success: true, message: 'Duplicate ignored' }, { duplicateEvent: true, eventId });
      }
      return respond(500, { error: logError?.message || 'Failed to create log row' }, { reason: 'log_insert_failed', eventId });
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

    return respond(200, {
      success: result.success,
      operation: result.operation,
      status: result.status
    }, {
      operation: result.operation,
      status: result.status,
      actionType: result.actionType,
      eventId
    });
  } catch (error: any) {
    console.error('[telegram-webhook] failed', error);
    return respond(500, { error: error.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
