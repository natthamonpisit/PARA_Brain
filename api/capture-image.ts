import { createClient } from '@supabase/supabase-js';
import { processImageCapture } from './_lib/imageCapturePipeline.js';
import { toCaptureLogPayload, CaptureSource } from './_lib/capturePipeline.js';
import { finalizeApiObservation, startApiObservation } from './_lib/observability.js';
import { requireAuth } from './_lib/authGuard.js';

function toSource(value: any): CaptureSource {
  return String(value || '').toUpperCase() === 'TELEGRAM' ? 'TELEGRAM' : 'WEB';
}

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key value');
}

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

function userMessageFromImage(caption: string): string {
  const safeCaption = normalizeSpace(caption);
  return safeCaption ? `[IMAGE] ${safeCaption}` : '[IMAGE] uploaded';
}

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/capture-image', {
    source: String(req?.body?.source || 'WEB').toUpperCase()
  });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  const auth = requireAuth(req, [process.env.CAPTURE_API_SECRET, process.env.CRON_SECRET]);
  if (!auth.ok) return respond(auth.status, auth.body, { reason: 'auth_failed' });

  try {
    const source = toSource(req.body?.source);
    const imageBase64 = String(req.body?.imageBase64 || '').trim();
    const mimeType = String(req.body?.mimeType || 'image/jpeg').trim() || 'image/jpeg';
    const caption = normalizeSpace(String(req.body?.caption || ''));
    if (!imageBase64) {
      return respond(400, { error: "Missing 'imageBase64' in request body" }, { reason: 'missing_image' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      const missing = [
        !supabaseUrl && 'VITE_SUPABASE_URL',
        !supabaseKey && 'SUPABASE_SERVICE_ROLE_KEY',
        !geminiKey && 'GEMINI_API_KEY'
      ].filter(Boolean);
      return respond(500, { error: `Missing server configuration: ${missing.join(', ')}` }, { reason: 'missing_env', missing });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const eventId =
      String(req.body?.eventId || '').trim() ||
      `${source}:image:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const userMessage = userMessageFromImage(caption);

    const { data: existing } = await supabase
      .from('system_logs')
      .select('id,status,action_type,ai_response,created_at')
      .eq('event_source', source)
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      return respond(200, {
        success: true,
        duplicateEvent: true,
        logId: existing.id,
        status: existing.status,
        actionType: existing.action_type,
        aiResponse: existing.ai_response
      }, {
        duplicateEvent: true,
        eventId,
        source
      });
    }

    const { data: logRow, error: logError } = await supabase
      .from('system_logs')
      .insert({
        event_source: source,
        event_id: eventId,
        user_message: userMessage,
        action_type: 'THINKING',
        status: 'PROCESSING'
      })
      .select('id')
      .single();

    if (logError || !logRow?.id) {
      if (isUniqueViolation(logError)) {
        const { data: duplicate } = await supabase
          .from('system_logs')
          .select('id,status,action_type,ai_response,created_at')
          .eq('event_source', source)
          .eq('event_id', eventId)
          .maybeSingle();
        return respond(200, {
          success: true,
          duplicateEvent: true,
          logId: duplicate?.id || null,
          status: duplicate?.status || 'SKIPPED_DUPLICATE',
          actionType: duplicate?.action_type || 'SKIP_DUPLICATE',
          aiResponse: duplicate?.ai_response || null
        }, {
          duplicateEvent: true,
          source,
          eventId
        });
      }
      return respond(500, { error: logError?.message || 'Failed to write system log' }, { reason: 'log_insert_failed', source, eventId });
    }

    const result = await processImageCapture({
      supabase,
      source,
      geminiApiKey: geminiKey,
      imageBase64,
      mimeType,
      caption,
      timezone: process.env.AGENT_DEFAULT_TIMEZONE || 'Asia/Bangkok',
      excludeLogId: logRow.id,
      imageMeta: {
        eventId,
        uploadSource: 'capture-image-api'
      }
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

    return respond(200, {
      success: result.success,
      logId: logRow.id,
      source: result.source,
      intent: result.intent,
      confidence: result.confidence,
      isActionable: result.isActionable,
      operation: result.operation,
      chatResponse: result.chatResponse,
      itemType: result.itemType,
      createdItem: result.createdItem || null,
      createdItems: result.createdItems || [],
      actionType: result.actionType,
      status: result.status,
      dedup: result.dedup,
      meta: result.meta || {}
    }, {
      source: result.source,
      operation: result.operation,
      status: result.status,
      actionType: result.actionType,
      eventId
    });
  } catch (error: any) {
    console.error('[capture-image] failed', error);
    return respond(500, { error: error?.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
