import { createClient } from '@supabase/supabase-js';
import { sendTelegramText } from './_lib/telegram.js';
import { runCapturePipeline, toCaptureLogPayload } from './_lib/capturePipeline.js';
import { fetchTelegramPhotoData, processImageCapture } from './_lib/imageCapturePipeline.js';
import { finalizeApiObservation, startApiObservation } from './_lib/observability.js';

export const config = {
  maxDuration: 60
};

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const PROCESSING_STALE_MS = Number(process.env.TELEGRAM_PROCESSING_STALE_MS || 90000);

interface IncomingTelegramMessage {
  updateId: string;
  messageId: number;
  chatId: string;
  userId: string;
  text: string;
  caption: string;
  photoFileId: string;
}

function verifyTelegramSecret(req: any): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const provided = req.headers?.['x-telegram-bot-api-secret-token'];
  return String(provided || '') === expected;
}

function getIncomingMessage(update: any): IncomingTelegramMessage | null {
  const message = update?.message || update?.edited_message;
  if (!message) return null;
  const photos = Array.isArray(message.photo) ? message.photo : [];
  const largestPhoto = photos.reduce((best: any, current: any) => {
    const bestSize = Number(best?.file_size || 0);
    const currentSize = Number(current?.file_size || 0);
    if (currentSize > bestSize) return current;
    return best;
  }, null);

  return {
    updateId: String(update?.update_id || ''),
    messageId: Number(message?.message_id || 0),
    chatId: String(message?.chat?.id || ''),
    userId: String(message?.from?.id || ''),
    text: String(message?.text || '').trim(),
    caption: String(message?.caption || '').trim(),
    photoFileId: String(largestPhoto?.file_id || '')
  };
}

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key value');
}

function parseMillis(value: any): number {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isProcessingStale(log: { created_at?: any }): boolean {
  const ts = parseMillis(log?.created_at);
  if (!ts) return true;
  return Date.now() - ts >= PROCESSING_STALE_MS;
}

function extractChatResponse(raw: any): string | null {
  if (!raw) return null;
  try {
    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const text = String(payload?.chatResponse || '').trim();
    return text || null;
  } catch {
    return null;
  }
}

async function sendTelegramReply(params: {
  botToken: string;
  chatId: string;
  text: string;
  replyToMessageId?: number;
}) {
  try {
    await sendTelegramText(params);
  } catch (error: any) {
    const detail = String(error?.message || '').toLowerCase();
    if (params.replyToMessageId && detail.includes('message to be replied not found')) {
      await sendTelegramText({
        botToken: params.botToken,
        chatId: params.chatId,
        text: params.text
      });
      return;
    }
    throw error;
  }
}

function normalizeTelegramPhotoMessage(caption: string): string {
  const safeCaption = String(caption || '').trim();
  return safeCaption ? `[PHOTO] ${safeCaption}` : '[PHOTO] (no caption)';
}

async function processTelegramPhoto(params: {
  supabase: any;
  incoming: IncomingTelegramMessage;
  botToken: string;
  geminiKey: string;
  logId: string;
}) {
  const { imageBase64, mimeType, filePath, byteLength } = await fetchTelegramPhotoData({
    botToken: params.botToken,
    fileId: params.incoming.photoFileId
  });

  return processImageCapture({
    supabase: params.supabase,
    source: 'TELEGRAM',
    geminiApiKey: params.geminiKey,
    imageBase64,
    mimeType,
    caption: params.incoming.caption,
    timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok',
    excludeLogId: params.logId,
    imageMeta: {
      telegramPhoto: true,
      filePath,
      byteLength
    }
  });
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

    const incoming = getIncomingMessage(req.body);
    if (!incoming) {
      return respond(200, { success: true, message: 'Ignored unsupported update' }, { ignored: 'unsupported' });
    }
    if (!incoming.text && !incoming.photoFileId) {
      return respond(200, { success: true, message: 'Ignored empty message update' }, { ignored: 'empty_message' });
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

    if (!incoming.photoFileId && incoming.text.toLowerCase() === 'id') {
      await sendTelegramReply({
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
      .select('id,status,action_type,ai_response,created_at')
      .eq('event_source', 'TELEGRAM')
      .eq('event_id', eventId)
      .maybeSingle();

    let logId = '';
    let recoveredFromStale = false;
    const logUserMessage = incoming.photoFileId
      ? normalizeTelegramPhotoMessage(incoming.caption)
      : incoming.text;

    if (existingLog?.id) {
      const currentStatus = String(existingLog.status || '').toUpperCase();

      if (currentStatus !== 'PROCESSING') {
        const replayText =
          extractChatResponse(existingLog.ai_response) ||
          'ข้อความนี้ถูกประมวลผลไปแล้วครับ';
        await sendTelegramReply({
          botToken,
          chatId: incoming.chatId,
          text: replayText,
          replyToMessageId: incoming.messageId
        });
        return respond(200, {
          success: true,
          duplicateEvent: true,
          message: 'Duplicate replayed',
          status: existingLog.status || null
        }, {
          duplicateEvent: true,
          replayed: true,
          eventId,
          status: existingLog.status || null
        });
      }

      if (!isProcessingStale(existingLog)) {
        await sendTelegramReply({
          botToken,
          chatId: incoming.chatId,
          text: 'กำลังประมวลผลข้อความนี้อยู่ครับ ลองรอสักครู่แล้วส่งใหม่ได้เลย',
          replyToMessageId: incoming.messageId
        });
        return respond(200, {
          success: true,
          duplicateEvent: true,
          message: 'Still processing',
          status: existingLog.status || 'PROCESSING'
        }, {
          duplicateEvent: true,
          processingInProgress: true,
          eventId
        });
      }

      const { data: claimed, error: claimError } = await supabase
        .from('system_logs')
        .update({
          status: 'PROCESSING',
          action_type: 'RETRYING'
        })
        .eq('id', existingLog.id)
        .eq('status', 'PROCESSING')
        .select('id')
        .maybeSingle();

      if (claimError || !claimed?.id) {
        await sendTelegramReply({
          botToken,
          chatId: incoming.chatId,
          text: 'กำลังประมวลผลข้อความนี้อยู่ครับ ลองรอสักครู่แล้วส่งใหม่ได้เลย',
          replyToMessageId: incoming.messageId
        });
        return respond(200, {
          success: true,
          duplicateEvent: true,
          message: 'Processing already claimed',
          status: 'PROCESSING'
        }, {
          duplicateEvent: true,
          processingInProgress: true,
          eventId
        });
      }

      logId = claimed.id;
      recoveredFromStale = true;
    } else {
      const { data: logRow, error: logError } = await supabase
        .from('system_logs')
        .insert({
          event_source: 'TELEGRAM',
          event_id: eventId,
          user_message: logUserMessage,
          status: 'PROCESSING',
          action_type: 'THINKING'
        })
        .select('id')
        .single();

      if (logError || !logRow?.id) {
        if (isUniqueViolation(logError)) {
          const { data: duplicateLog } = await supabase
            .from('system_logs')
            .select('id,status,ai_response')
            .eq('event_source', 'TELEGRAM')
            .eq('event_id', eventId)
            .maybeSingle();

          if (duplicateLog?.id) {
            const replayText =
              extractChatResponse(duplicateLog.ai_response) ||
              'ข้อความนี้ถูกประมวลผลไปแล้วครับ';
            await sendTelegramReply({
              botToken,
              chatId: incoming.chatId,
              text: replayText,
              replyToMessageId: incoming.messageId
            });

            return respond(200, {
              success: true,
              duplicateEvent: true,
              message: 'Duplicate replayed',
              status: duplicateLog.status || null
            }, {
              duplicateEvent: true,
              replayed: true,
              eventId,
              status: duplicateLog.status || null
            });
          }

          return respond(200, {
            success: true,
            duplicateEvent: true,
            message: 'Duplicate race ignored'
          }, {
            duplicateEvent: true,
            eventId
          });
        }
        return respond(500, { error: logError?.message || 'Failed to create log row' }, { reason: 'log_insert_failed', eventId });
      }

      logId = logRow.id;
    }

    const result = incoming.photoFileId
      ? await processTelegramPhoto({
          supabase,
          incoming,
          botToken,
          geminiKey,
          logId
        })
      : await runCapturePipeline({
          supabase,
          userMessage: incoming.text,
          source: 'TELEGRAM',
          geminiApiKey: geminiKey,
          approvalGatesEnabled: process.env.ENABLE_APPROVAL_GATES === 'true',
          timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok',
          excludeLogId: logId
        });

    const payload = toCaptureLogPayload(result);

    await supabase
      .from('system_logs')
      .update({
        ai_response: JSON.stringify(payload),
        action_type: result.actionType,
        status: result.status
      })
      .eq('id', logId);

    await sendTelegramReply({
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
      updateType: incoming.photoFileId ? 'PHOTO' : 'TEXT',
      recoveredFromStale,
      eventId
    });
  } catch (error: any) {
    console.error('[telegram-webhook] failed', error);
    return respond(500, { error: error.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
