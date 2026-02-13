import { createClient } from '@supabase/supabase-js';
import { runCapturePipeline, toCaptureLogPayload, CaptureSource } from './_lib/capturePipeline';

function getCaptureKey(req: any): string {
  return req.headers?.['x-capture-key'] || req.headers?.authorization?.replace('Bearer ', '') || req.query?.key || '';
}

function toSource(value: any): CaptureSource {
  return String(value || '').toUpperCase() === 'TELEGRAM' ? 'TELEGRAM' : 'WEB';
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const captureSecret = process.env.CAPTURE_API_SECRET;
  if (captureSecret && getCaptureKey(req) !== captureSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const source = toSource(req.body?.source);
    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!supabaseUrl || !supabaseKey || !geminiKey) {
      return res.status(500).json({ error: 'Missing server configuration' });
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
      .eq('event_id', eventId)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({
        success: true,
        duplicateEvent: true,
        logId: existing.id,
        status: existing.status,
        actionType: existing.action_type,
        aiResponse: existing.ai_response
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
      return res.status(500).json({ error: logError?.message || 'Failed to write system log' });
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

    return res.status(200).json({
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
    });
  } catch (error: any) {
    console.error('[capture-intake] failed', error);
    return res.status(500).json({ error: error?.message || 'Internal error' });
  }
}
