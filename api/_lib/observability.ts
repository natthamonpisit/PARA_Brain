import { createClient } from '@supabase/supabase-js';

interface ObservationContext {
  requestId: string;
  endpoint: string;
  method: string;
  source?: string;
  startedAt: number;
}

let cachedClient: any | null | undefined;

const getServiceClient = () => {
  if (cachedClient !== undefined) return cachedClient;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    cachedClient = null;
    return cachedClient;
  }
  cachedClient = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cachedClient;
};

const normalizeMethod = (value: unknown) => String(value || 'GET').toUpperCase();

const createRequestId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const startApiObservation = (
  req: any,
  endpoint: string,
  opts?: { source?: string }
): ObservationContext => {
  const requestId = String(req?.headers?.['x-request-id'] || '').trim() || createRequestId();
  return {
    requestId,
    endpoint,
    method: normalizeMethod(req?.method),
    source: opts?.source,
    startedAt: Date.now()
  };
};

export const finalizeApiObservation = async (
  context: ObservationContext,
  statusCode: number,
  meta?: Record<string, any>
) => {
  const latencyMs = Math.max(0, Date.now() - context.startedAt);
  const event = {
    request_id: context.requestId,
    endpoint: context.endpoint,
    method: context.method,
    status_code: Number(statusCode || 0),
    ok: Number(statusCode || 0) < 400,
    latency_ms: latencyMs,
    source: context.source || null,
    meta: meta || {},
    created_at: new Date().toISOString()
  };

  console.info(`[api-observe] ${JSON.stringify(event)}`);

  const db = getServiceClient();
  if (!db) return;
  try {
    await db.from('api_observability_events').insert(event);
  } catch (error: any) {
    console.warn('[api-observe] db insert failed:', error?.message || error);
  }
};
