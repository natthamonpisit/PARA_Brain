// ─── Capture Pipeline — DB Loaders & Writers ──────────────────────────────────
// All Supabase read/write operations: context loading, dedup, JAY memory/learning.

import { GoogleGenAI } from '@google/genai';
import { runWithRetry } from './externalPolicy.js';
import {
  extractCustomInstructionsFromPreferences,
  toRuntimeInstructionSnippets
} from './aiConfig.js';
import {
  CaptureSource, CaptureContext, DedupHints, SessionTurn,
  JayMemoryEntry, JayLearningEntry,
  SEMANTIC_DEDUP_THRESHOLD, WRITE_ACTION_TYPES
} from './captureTypes.js';
import { parseLogPayload, hasCommittedWrite } from './captureUtils.js';

// ─── URL metadata ─────────────────────────────────────────────────────────────

export async function fetchUrlTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PARABrain/1.0)' },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim().replace(/\s+/g, ' ').slice(0, 120) : null;
  } catch {
    return null;
  }
}

// ─── PARA context loader ──────────────────────────────────────────────────────

export async function loadCaptureContext(supabase: any): Promise<CaptureContext> {
  const [projectsRes, areasRes, tasksRes, resourcesRes, accountsRes, modulesRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id,title,category,updated_at')
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('areas')
      .select('id,title,name,updated_at')
      .order('updated_at', { ascending: false })
      .limit(25),
    supabase
      .from('tasks')
      .select('id,title,category,is_completed,updated_at')
      .eq('is_completed', false)
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('resources')
      .select('id,title,category,updated_at')
      .order('updated_at', { ascending: false })
      .limit(15),
    supabase.from('accounts').select('id,name').limit(15),
    supabase.from('modules').select('id,name').limit(10)
  ]);

  return {
    projects: projectsRes.data || [],
    areas: areasRes.data || [],
    tasks: tasksRes.data || [],
    resources: resourcesRes.data || [],
    accounts: accountsRes.data || [],
    modules: modulesRes.data || []
  };
}

// ─── Runtime custom instructions ─────────────────────────────────────────────

export async function loadRuntimeCustomInstructions(params: {
  supabase: any;
  ownerKey: string;
}): Promise<string[]> {
  try {
    const { data, error } = await params.supabase
      .from('user_profile')
      .select('preferences')
      .eq('owner_key', params.ownerKey)
      .maybeSingle();
    if (error) {
      console.warn('[capturePipeline] load custom instructions failed:', error.message);
      return [];
    }
    const custom = extractCustomInstructionsFromPreferences(data?.preferences || {});
    return toRuntimeInstructionSnippets(custom, 12);
  } catch (error: any) {
    console.warn('[capturePipeline] load custom instructions failed:', error?.message || error);
    return [];
  }
}

// ─── Session context (recent turns) ──────────────────────────────────────────

export async function loadRecentSessionContext(params: {
  supabase: any;
  source: CaptureSource;
  excludeLogId?: string;
}): Promise<SessionTurn[]> {
  try {
    const windowStart = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data, error } = await params.supabase
      .from('system_logs')
      .select('user_message,ai_response,action_type')
      .eq('event_source', params.source)
      .eq('status', 'SUCCESS')
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.warn('[capturePipeline] loadRecentSessionContext failed:', error.message);
      return [];
    }

    const rows: any[] = (data || []);
    const turns: SessionTurn[] = [];
    for (const row of rows.slice(0, 3)) {
      const payload = parseLogPayload(row.ai_response);
      const turn: SessionTurn = {
        userMessage: String(row.user_message || '').trim(),
        intent: payload?.intent ? String(payload.intent) : undefined,
        actionType: row.action_type ? String(row.action_type) : undefined,
        createdTitle: payload?.createdItem?.title
          ? String(payload.createdItem.title)
          : payload?.createdItems?.[0]?.title
          ? String(payload.createdItems[0].title)
          : undefined,
        projectTitle: payload?.relatedProjectTitle
          ? String(payload.relatedProjectTitle)
          : undefined,
        areaTitle: payload?.relatedAreaTitle
          ? String(payload.relatedAreaTitle)
          : undefined,
      };
      if (turn.userMessage) turns.push(turn);
    }
    return turns;
  } catch (err: any) {
    console.warn('[capturePipeline] loadRecentSessionContext error:', err?.message || err);
    return [];
  }
}

// ─── JAY Memory ───────────────────────────────────────────────────────────────

export async function loadJayMemory(supabase: any): Promise<JayMemoryEntry[]> {
  try {
    const { data, error } = await supabase
      .from('jay_memory')
      .select('key,value,category,confidence,source')
      .order('last_seen', { ascending: false })
      .limit(20);
    if (error) { console.warn('[JAY] loadJayMemory error:', error.message); return []; }
    return (data || []) as JayMemoryEntry[];
  } catch (err: any) {
    console.warn('[JAY] loadJayMemory exception:', err?.message || err);
    return [];
  }
}

export async function loadJayLearnings(supabase: any): Promise<JayLearningEntry[]> {
  try {
    const { data, error } = await supabase
      .from('jay_learning')
      .select('lesson,category,outcome')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) { console.warn('[JAY] loadJayLearnings error:', error.message); return []; }
    return (data || []) as JayLearningEntry[];
  } catch (err: any) {
    console.warn('[JAY] loadJayLearnings exception:', err?.message || err);
    return [];
  }
}

/** JAY writes a memory entry (upsert by key). Called after pipeline completes. */
export async function writeJayMemory(
  supabase: any,
  entry: { key: string; value: string; category: string; confidence: number; source?: string }
): Promise<void> {
  try {
    await supabase.from('jay_memory').upsert({
      key: entry.key,
      value: entry.value,
      category: entry.category,
      confidence: entry.confidence,
      source: entry.source ?? 'inferred_from_interaction',
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
  } catch (err: any) {
    console.warn('[JAY] writeJayMemory error:', err?.message || err);
  }
}

/** JAY writes a learning entry when something notable happens. */
export async function writeJayLearning(
  supabase: any,
  entry: { lesson: string; triggerMessage?: string; outcome: string; category: string }
): Promise<void> {
  try {
    await supabase.from('jay_learning').insert({
      lesson: entry.lesson,
      trigger_message: entry.triggerMessage ?? null,
      outcome: entry.outcome,
      category: entry.category,
    });
  } catch (err: any) {
    console.warn('[JAY] writeJayLearning error:', err?.message || err);
  }
}

// ─── Dedup ────────────────────────────────────────────────────────────────────

async function embedForSemanticDedup(apiKey: string, text: string): Promise<number[] | null> {
  const ai = new GoogleGenAI({ apiKey });
  const candidates = [
    process.env.AGENT_EMBEDDING_MODEL || 'gemini-embedding-001',
    'text-embedding-004'
  ].filter(Boolean);

  let lastError: any = null;
  for (const model of [...new Set(candidates)]) {
    try {
      const response = await runWithRetry(() =>
        ai.models.embedContent({
          model,
          contents: [text],
          config: { outputDimensionality: 1536 }
        })
      );
      const firstEmbedding: any = response?.embeddings?.[0];
      const values = firstEmbedding?.values || firstEmbedding?.embedding?.values;
      if (Array.isArray(values) && values.length === 1536) {
        return values;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    console.warn('[capturePipeline] semantic embedding unavailable:', lastError?.message || lastError);
  }
  return null;
}

async function semanticVectorDuplicateCheck(params: {
  supabase: any;
  apiKey: string;
  message: string;
}): Promise<DedupHints | null> {
  const embedding = await embedForSemanticDedup(params.apiKey, params.message);
  if (!embedding) return null;

  try {
    const queryEmbedding = `[${embedding.join(',')}]`;
    const rpc = await params.supabase.rpc('match_memory_chunks', {
      query_embedding: queryEmbedding,
      match_count: 3,
      source_tables: ['projects', 'tasks', 'resources']
    });

    if (rpc.error) {
      console.warn('[capturePipeline] semantic dedup rpc failed:', rpc.error.message);
      return null;
    }

    const top = Array.isArray(rpc.data) && rpc.data.length > 0 ? rpc.data[0] : null;
    const similarity = Number(top?.similarity || 0);
    if (top && Number.isFinite(similarity) && similarity >= SEMANTIC_DEDUP_THRESHOLD) {
      return {
        isDuplicate: true,
        reason: `Semantic match ${similarity.toFixed(3)} from ${top.source_table || 'memory_chunks'}`,
        method: 'SEMANTIC_VECTOR',
        similarity,
        matchedItemId: top.source_id ? String(top.source_id) : undefined,
        matchedTable: top.source_table ? String(top.source_table) : undefined
      };
    }
  } catch (error: any) {
    console.warn('[capturePipeline] semantic dedup check failed:', error?.message || error);
  }

  return null;
}

export async function detectDuplicateHints(params: {
  supabase: any;
  message: string;
  urls: string[];
  geminiApiKey: string;
  excludeLogId?: string;
}): Promise<DedupHints> {
  const { supabase, message, urls, excludeLogId, geminiApiKey } = params;
  let exactNoWriteIgnored = false;
  let exactNoWriteReason = '';

  const recentLogRes = await supabase
    .from('system_logs')
    .select('id,event_source,created_at,user_message,ai_response,action_type,status')
    .eq('user_message', message)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentLogs = (recentLogRes.data || []).filter((row: any) => row.id !== excludeLogId);
  for (const row of recentLogs) {
    if (!hasCommittedWrite(row, WRITE_ACTION_TYPES)) {
      exactNoWriteIgnored = true;
      exactNoWriteReason = `Exact message seen but prior run had no write (action=${String(row?.action_type || 'unknown')}, status=${String(row?.status || 'unknown')})`;
      continue;
    }
    return {
      isDuplicate: true,
      reason: 'Exact same message already created previously',
      method: 'EXACT_MESSAGE',
      matchedLogId: row.id,
      matchedActionType: String(row?.action_type || ''),
      matchedStatus: String(row?.status || '')
    };
  }

  for (const url of urls) {
    const pattern = `%${url}%`;
    const checks = await Promise.all([
      supabase.from('resources').select('id,title').ilike('content', pattern).limit(1),
      supabase.from('tasks').select('id,title').ilike('content', pattern).limit(1),
      supabase.from('projects').select('id,title').ilike('content', pattern).limit(1)
    ]);

    const resourceMatch = checks[0].data?.[0];
    if (resourceMatch) {
      return {
        isDuplicate: true, reason: 'Found matching URL in resources',
        method: 'URL_MATCH', matchedItemId: resourceMatch.id,
        matchedTable: 'resources', matchedTitle: resourceMatch.title, matchedLink: url
      };
    }
    const taskMatch = checks[1].data?.[0];
    if (taskMatch) {
      return {
        isDuplicate: true, reason: 'Found matching URL in tasks',
        method: 'URL_MATCH', matchedItemId: taskMatch.id,
        matchedTable: 'tasks', matchedTitle: taskMatch.title, matchedLink: url
      };
    }
    const projectMatch = checks[2].data?.[0];
    if (projectMatch) {
      return {
        isDuplicate: true, reason: 'Found matching URL in projects',
        method: 'URL_MATCH', matchedItemId: projectMatch.id,
        matchedTable: 'projects', matchedTitle: projectMatch.title, matchedLink: url
      };
    }
  }

  const semanticHint = await semanticVectorDuplicateCheck({ supabase, apiKey: geminiApiKey, message });
  if (semanticHint?.isDuplicate) return semanticHint;

  return {
    isDuplicate: false,
    reason: exactNoWriteReason || 'No duplicate signal from exact/url/semantic checks',
    method: 'NONE',
    exactMessageNoWriteIgnored: exactNoWriteIgnored
  };
}
