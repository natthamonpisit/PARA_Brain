import { createClient } from '@supabase/supabase-js';
import { runCapturePipeline, toCaptureLogPayload, CaptureSource } from './_lib/capturePipeline';
import { finalizeApiObservation, startApiObservation } from './_lib/observability';

function getCaptureKey(req: any): string {
  return req.headers?.['x-capture-key'] || req.headers?.authorization?.replace('Bearer ', '') || req.query?.key || '';
}

function toSource(value: any): CaptureSource {
  return String(value || '').toUpperCase() === 'TELEGRAM' ? 'TELEGRAM' : 'WEB';
}

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '23505' || message.includes('duplicate key value');
}

export default async function handler(req: any, res: any) {
  const obs = startApiObservation(req, '/api/capture-intake', {
    source: String(req?.body?.source || 'WEB').toUpperCase()
  });
  const respond = async (status: number, body: any, meta?: Record<string, any>) => {
    await finalizeApiObservation(obs, status, meta);
    return res.status(status).json(body);
  };

  if (req.method !== 'POST') {
    return respond(405, { error: 'Method not allowed' }, { reason: 'method_not_allowed' });
  }

  const captureSecret = process.env.CAPTURE_API_SECRET;
  if (captureSecret && getCaptureKey(req) !== captureSecret) {
    return respond(401, { error: 'Unauthorized' }, { reason: 'auth_failed' });
  }

  try {
    const source = toSource(req.body?.source);
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return respond(400, { error: "Missing 'message' in request body" }, { reason: 'missing_message' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      return respond(500, { error: 'Missing server configuration' }, { reason: 'missing_env' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const eventId =
      String(req.body?.eventId || '').trim() ||
      `${source}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;

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
        user_message: message,
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

    const result = await runCapturePipeline({
      supabase,
      userMessage: message,
      source,
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
    console.error('[capture-intake] failed', error);
    return respond(500, { error: error?.message || 'Internal error' }, { reason: 'exception', error: error?.message || 'unknown' });
  }
}
