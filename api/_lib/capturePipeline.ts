import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { runWithRetry } from './externalPolicy.js';
import {
  extractCustomInstructionsFromPreferences,
  toRuntimeInstructionSnippets
} from './aiConfig.js';
import {
  ROUTING_RULES_VERSION,
  findExplicitAreaMentionInAreas,
  resolveTravelAreaRecommendation
} from '../../shared/routingRules.js';

export type CaptureSource = 'WEB' | 'TELEGRAM';
export type CaptureOperation = 'CREATE' | 'TRANSACTION' | 'MODULE_ITEM' | 'COMPLETE' | 'CHAT';
export type CaptureIntent =
  | 'CHITCHAT'
  | 'ACTIONABLE_NOTE'
  | 'PROJECT_IDEA'
  | 'TASK_CAPTURE'
  | 'RESOURCE_CAPTURE'
  | 'FINANCE_CAPTURE'
  | 'COMPLETE_TASK'
  | 'MODULE_CAPTURE';
export type CaptureItemType = 'PARA' | 'TRANSACTION' | 'MODULE';

interface DedupHints {
  isDuplicate: boolean;
  reason: string;
  method?: 'EXACT_MESSAGE' | 'URL_MATCH' | 'SEMANTIC_VECTOR' | 'NONE';
  similarity?: number;
  matchedItemId?: string;
  matchedTable?: string;
  matchedTitle?: string;
  matchedLink?: string;
  matchedLogId?: string;
  matchedActionType?: string;
  matchedStatus?: string;
  exactMessageNoWriteIgnored?: boolean;
}

interface SessionTurn {
  userMessage: string;
  intent?: string;
  actionType?: string;
  createdTitle?: string;
  projectTitle?: string;
  areaTitle?: string;
}

interface CaptureContext {
  projects: any[];
  areas: any[];
  tasks: any[];
  resources: any[];
  accounts: any[];
  modules: any[];
}

interface AreaRoutingDecision {
  applied: boolean;
  reason: string;
  ruleVersion?: string;
  areaName?: string;
  suggestedProjectTitle?: string;
  ensureProjectLink?: boolean;
  extraTags?: string[];
}

interface CaptureModelOutput {
  intent?: CaptureIntent;
  confidence?: number;
  isActionable?: boolean;
  operation?: CaptureOperation;
  chatResponse?: string;
  title?: string;
  summary?: string;
  category?: string;
  type?: 'Tasks' | 'Projects' | 'Resources' | 'Areas' | 'Archives';
  relatedItemId?: string;
  relatedProjectTitle?: string;
  relatedAreaTitle?: string;
  createProjectIfMissing?: boolean;
  askForParent?: boolean;
  clarifyingQuestion?: string;
  suggestedTags?: string[];
  dueDate?: string;
  amount?: number;
  transactionType?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  accountId?: string;
  targetModuleId?: string;
  moduleDataRaw?: Array<{ key: string; value: string }>;
  dedupRecommendation?: 'NEW' | 'LIKELY_DUPLICATE' | 'DUPLICATE';
  goal?: string;
  assumptions?: string[];
  prerequisites?: string[];
  starterTasks?: Array<{ title: string; description?: string }>;
  nextActions?: string[];
  clarifyingQuestions?: string[];
  riskNotes?: string[];
  recommendedProjectTitle?: string;
  recommendedAreaTitle?: string;
}

interface ConfirmCommand {
  force: boolean;
  message: string;
  completeTarget?: string; // set when user uses "เสร็จ:/done:" shortcut
}

export interface CapturePipelineInput {
  supabase: any;
  userMessage: string;
  source: CaptureSource;
  geminiApiKey: string;
  approvalGatesEnabled?: boolean;
  timezone?: string;
  excludeLogId?: string;
}

export interface CapturePipelineResult {
  success: boolean;
  source: CaptureSource;
  intent: CaptureIntent;
  confidence: number;
  isActionable: boolean;
  operation: CaptureOperation;
  chatResponse: string;
  itemType?: CaptureItemType;
  createdItem?: Record<string, any> | null;
  createdItems?: Record<string, any>[];
  actionType: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'SKIPPED_DUPLICATE';
  dedup: DedupHints;
  meta?: Record<string, any>;
}

const PARA_TYPE_TO_TABLE: Record<string, string> = {
  Tasks: 'tasks',
  Projects: 'projects',
  Resources: 'resources',
  Areas: 'areas',
  Archives: 'archives'
};

const DEFAULT_INTENT: CaptureIntent = 'CHITCHAT';
const DEFAULT_OPERATION: CaptureOperation = 'CHAT';
const CONFIDENCE_CONFIRM_THRESHOLD = Number(process.env.CAPTURE_CONFIRM_THRESHOLD || 0.72);
const SEMANTIC_DEDUP_THRESHOLD = Number(process.env.CAPTURE_SEMANTIC_DEDUP_THRESHOLD || 0.9);
const ALFRED_AUTO_CAPTURE_ENABLED = process.env.ALFRED_AUTO_CAPTURE_ENABLED !== 'false';
const CAPTURE_MODEL_NAME = process.env.CAPTURE_MODEL_NAME || 'gemini-3-flash-preview';
const WRITE_ACTION_TYPES = new Set(['CREATE_PARA', 'CREATE_TX', 'CREATE_MODULE', 'COMPLETE_TASK']);

const truncate = (value: string, max = 180): string => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

const normalizeMessage = (text: string): string => text.replace(/\s+/g, ' ').trim();

const parseLogPayload = (raw: any): any => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text || !text.startsWith('{')) return null;
  try {
    const first = JSON.parse(text);
    if (typeof first === 'string' && first.trim().startsWith('{')) {
      return JSON.parse(first);
    }
    return first;
  } catch {
    return null;
  }
};

const hasCommittedWrite = (row: any): boolean => {
  const actionType = String(row?.action_type || '').toUpperCase();
  if (WRITE_ACTION_TYPES.has(actionType)) return true;

  const payload = parseLogPayload(row?.ai_response);
  if (!payload || typeof payload !== 'object') return false;
  if (payload.createdItem) return true;
  if (Array.isArray(payload.createdItems) && payload.createdItems.length > 0) return true;
  return false;
};

const responseHasExplicitNoWrite = (text: string): boolean => {
  const lower = String(text || '').toLowerCase();
  return [
    /ยังไม่บันทึก/,
    /ยังไม่ได้บันทึก/,
    /ไม่ได้บันทึก/,
    /ยังไม่สร้าง/,
    /ยังไม่ได้สร้าง/,
    /not saved/,
    /not created/,
    /did not save/,
    /without saving/
  ].some((re) => re.test(lower));
};

const responseClaimsWrite = (text: string): boolean => {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return false;
  if (responseHasExplicitNoWrite(lower)) return false;
  return [
    /บันทึก.*เรียบร้อย/,
    /เก็บ.*เรียบร้อย/,
    /สร้าง.*เรียบร้อย/,
    /บันทึก.*ให้แล้ว/,
    /เก็บ.*ให้แล้ว/,
    /เพิ่ม.*ให้แล้ว/,
    /saved/,
    /stored/,
    /created/,
    /added.*to/
  ].some((re) => re.test(lower));
};

const parseConfirmCommand = (rawMessage: string): ConfirmCommand => {
  const text = normalizeMessage(rawMessage);
  if (!text) return { force: false, message: text };

  // "เสร็จ: task name" / "done: task name" → force COMPLETE intent
  const completePatterns = [
    /^เสร็จ\s*[:\-]\s*(.+)$/i,
    /^done\s*[:\-]\s*(.+)$/i,
    /^เสร็จแล้ว\s*[:\-]\s*(.+)$/i,
    /^ทำเสร็จ\s*[:\-]\s*(.+)$/i,
  ];
  for (const pattern of completePatterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) {
      const target = normalizeMessage(matched[1]);
      return { force: true, message: `เสร็จ: ${target}`, completeTarget: target };
    }
  }

  const confirmPatterns = [
    /^ยืนยัน\s*[:\-]\s*(.+)$/i,
    /^confirm\s*[:\-]\s*(.+)$/i,
    /^yes\s*[:\-]\s*(.+)$/i
  ];
  for (const pattern of confirmPatterns) {
    const matched = text.match(pattern);
    if (matched?.[1]) {
      return { force: true, message: normalizeMessage(matched[1]) };
    }
  }
  const quickForce = /^(ยืนยัน|confirm|yes|สร้างเลย|ทำเลย)\b/i.test(text);
  return { force: quickForce, message: text };
};

const extractUrls = (text: string): string[] => {
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return Array.from(new Set(urls.map((u) => u.trim())));
};

interface MessageHints {
  tags: string[];       // from #tag
  areaHint: string | null;  // from @area or !area
}

const extractMessageHints = (text: string): MessageHints => {
  const tags = (text.match(/#([\w\u0E00-\u0E7F]+)/g) || [])
    .map(t => t.slice(1).toLowerCase())
    .filter(Boolean);
  const areaMatch = text.match(/(?:^|\s)[@!]([\w\u0E00-\u0E7F]+)/);
  const areaHint = areaMatch ? areaMatch[1] : null;
  return { tags, areaHint };
};

async function fetchUrlTitle(url: string): Promise<string | null> {
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

const formatContextRows = (rows: any[], fields: string[]): string => {
  return rows
    .map((row) => {
      const parts = fields
        .map((f) => `${f}=${truncate(String(row?.[f] ?? ''))}`)
        .filter((part) => !part.endsWith('='));
      return parts.join(' | ');
    })
    .filter(Boolean)
    .join('\n');
};

const toIntent = (value: any): CaptureIntent => {
  const intents: CaptureIntent[] = [
    'CHITCHAT',
    'ACTIONABLE_NOTE',
    'PROJECT_IDEA',
    'TASK_CAPTURE',
    'RESOURCE_CAPTURE',
    'FINANCE_CAPTURE',
    'COMPLETE_TASK',
    'MODULE_CAPTURE'
  ];
  return intents.includes(value) ? value : DEFAULT_INTENT;
};

const toOperation = (value: any): CaptureOperation => {
  const ops: CaptureOperation[] = ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT'];
  return ops.includes(value) ? value : DEFAULT_OPERATION;
};

const toSafeNumber = (value: any, fallback: number): number => {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return fallback;
};

// Parse shorthand amounts: "3k"→3000, "1.5K"→1500, "2M"→2000000, "500"→500
const parseAmountShorthand = (value: any): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const str = String(value || '').trim().replace(/,/g, '');
  const match = str.match(/^(\d+(?:\.\d+)?)\s*([kKมพ]|[mM]|พัน|หมื่น|แสน|ล้าน)?$/);
  if (!match) return null;
  const base = parseFloat(match[1]);
  const suffix = (match[2] || '').toLowerCase();
  const multipliers: Record<string, number> = {
    k: 1_000, ม: 1_000, พ: 1_000, พัน: 1_000,
    m: 1_000_000, ล้าน: 1_000_000,
    หมื่น: 10_000, แสน: 100_000
  };
  const mult = multipliers[suffix] ?? 1;
  const result = base * mult;
  return Number.isFinite(result) ? result : null;
};

const toSafeTags = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 12);
};

const toSafeTextList = (value: any, max = 6): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeMessage(String(item || '')))
    .filter(Boolean)
    .slice(0, max);
};

const toSafeStarterTasks = (value: any): Array<{ title: string; description?: string }> => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const title = normalizeMessage(String(item?.title || item || ''));
      const description = normalizeMessage(String(item?.description || ''));
      if (!title) return null;
      return description ? { title, description } : { title };
    })
    .filter(Boolean)
    .slice(0, 6) as Array<{ title: string; description?: string }>;
};

const normalizeType = (value: any): 'Tasks' | 'Projects' | 'Resources' | 'Areas' | 'Archives' => {
  const allowed = ['Tasks', 'Projects', 'Resources', 'Areas', 'Archives'];
  return allowed.includes(value) ? (value as any) : 'Tasks';
};

const looksLikePlanningRequest = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [
    /ต้องรู้อะไร/,
    /ทำยังไง/,
    /เริ่มยังไง/,
    /ควรเริ่ม/,
    /แนวทาง/,
    /framework/,
    /roadmap/,
    /strategy/,
    /guide/,
    /\bplan\b/,
    /\bstep\b/,
    /แบ่งงาน/,
    /แตกงาน/
  ];
  return patterns.some((re) => re.test(text));
};

const wantsAutoCapturePlan = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [/จัดให้/, /ทำให้/, /บันทึก/, /สร้างให้/, /แตก task/, /split task/, /ช่วยวาง/];
  return patterns.some((re) => re.test(text));
};

/**
 * Detect meta/debug questions — user asking WHY something happened or didn't happen.
 * These should always get a real explanation, never be silently sanitized.
 */
const looksLikeMetaQuestion = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [
    /ทำไม(ไม่|ถึง|จึง)/,       // ทำไมไม่บันทึก, ทำไมถึงไม่สร้าง
    /เพราะ(อะไร|ไร)/,           // เพราะอะไร
    /ทำไม\b/,                   // ทำไม (standalone)
    /why (didn|don|can|won|isn|aren)/i,
    /why not/i,
    /ไม่บันทึก.*ทำไม/,
    /ไม่สร้าง.*ทำไม/,
    /ไม่ทำ.*ทำไม/,
    /explain/i,
    /อธิบาย/,
    /หมายความว่า/,
    /แปลว่าอะไร/,
    /คืออะไร/,
    /ช่วยอธิบาย/,
  ];
  return patterns.some((re) => re.test(text));
};

const joinSection = (title: string, lines: string[]): string => {
  if (!lines.length) return '';
  return `${title}\n${lines.join('\n')}`;
};

const buildAlfredGuidanceText = (modelOutput: CaptureModelOutput): string => {
  const goal = normalizeMessage(String(modelOutput.goal || modelOutput.summary || ''));
  const assumptions = toSafeTextList(modelOutput.assumptions, 4);
  const prerequisites = toSafeTextList(modelOutput.prerequisites, 5);
  const starterTasks = toSafeStarterTasks(modelOutput.starterTasks);
  const nextActions = toSafeTextList(modelOutput.nextActions, 4);
  const riskNotes = toSafeTextList(modelOutput.riskNotes, 3);
  const questions = toSafeTextList(modelOutput.clarifyingQuestions, 3);

  const sections = [
    goal ? `Direction\n- เป้าหมาย: ${goal}` : '',
    joinSection('Prerequisites', prerequisites.map((item) => `- ${item}`)),
    joinSection(
      'Starter Tasks',
      starterTasks.map((task, idx) =>
        task.description ? `${idx + 1}. ${task.title} - ${task.description}` : `${idx + 1}. ${task.title}`
      )
    ),
    joinSection('Immediate Next Actions', nextActions.map((item, idx) => `${idx + 1}. ${item}`)),
    joinSection('Assumptions', assumptions.map((item) => `- ${item}`)),
    joinSection('Risk Notes', riskNotes.map((item) => `- ${item}`)),
    joinSection('Need From You', questions.map((item, idx) => `${idx + 1}. ${item}`))
  ].filter(Boolean);

  return sections.join('\n\n').trim();
};

const buildPlanningTaskContent = (params: {
  message: string;
  modelOutput: CaptureModelOutput;
  fallbackSummary: string;
}): string => {
  const { message, modelOutput, fallbackSummary } = params;
  const guidance = buildAlfredGuidanceText(modelOutput);
  const summary = normalizeMessage(String(modelOutput.summary || fallbackSummary || message));
  if (!guidance) return summary;
  return ['Summary', summary, '', 'Starter Direction', guidance].join('\n');
};

const toTripProjectTitle = (seed: string): string => {
  const cleaned = normalizeMessage(seed).replace(/^trip\s*[:\-]?\s*/i, '');
  if (!cleaned) return 'Trip Plan';
  return `Trip: ${truncate(cleaned, 48)}`;
};

const resolveTravelAreaRouting = (params: {
  message: string;
  modelOutput: CaptureModelOutput;
  context: CaptureContext;
}): AreaRoutingDecision => {
  const { message, modelOutput, context } = params;
  const explicitArea = findExplicitAreaMentionInAreas(context.areas, message);
  const decision = resolveTravelAreaRecommendation(message, {
    explicitAreaMentioned: Boolean(explicitArea)
  });
  if (!decision.applied) {
    return {
      applied: false,
      reason: decision.reason,
      ruleVersion: ROUTING_RULES_VERSION
    };
  }

  const projectSeed = String(modelOutput.title || modelOutput.goal || modelOutput.summary || message);
  return {
    applied: true,
    reason: decision.reason,
    areaName: decision.areaName,
    suggestedProjectTitle: toTripProjectTitle(projectSeed),
    ensureProjectLink: true,
    extraTags: decision.extraTags || [],
    ruleVersion: ROUTING_RULES_VERSION
  };
};

const findByTitle = (rows: any[], title: string): any | null => {
  const needle = String(title || '').trim().toLowerCase();
  if (!needle) return null;
  const exact = rows.find((row) => String(row.title || row.name || '').trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = rows.find((row) => String(row.title || row.name || '').trim().toLowerCase().includes(needle));
  return partial || null;
};

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

async function loadCaptureContext(supabase: any): Promise<CaptureContext> {
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

async function loadRuntimeCustomInstructions(params: {
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

async function loadRecentSessionContext(params: {
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

async function detectDuplicateHints(params: {
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
    if (!hasCommittedWrite(row)) {
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
        isDuplicate: true,
        reason: 'Found matching URL in resources',
        method: 'URL_MATCH',
        matchedItemId: resourceMatch.id,
        matchedTable: 'resources',
        matchedTitle: resourceMatch.title,
        matchedLink: url
      };
    }

    const taskMatch = checks[1].data?.[0];
    if (taskMatch) {
      return {
        isDuplicate: true,
        reason: 'Found matching URL in tasks',
        method: 'URL_MATCH',
        matchedItemId: taskMatch.id,
        matchedTable: 'tasks',
        matchedTitle: taskMatch.title,
        matchedLink: url
      };
    }

    const projectMatch = checks[2].data?.[0];
    if (projectMatch) {
      return {
        isDuplicate: true,
        reason: 'Found matching URL in projects',
        method: 'URL_MATCH',
        matchedItemId: projectMatch.id,
        matchedTable: 'projects',
        matchedTitle: projectMatch.title,
        matchedLink: url
      };
    }
  }

  const semanticHint = await semanticVectorDuplicateCheck({
    supabase,
    apiKey: geminiApiKey,
    message
  });
  if (semanticHint?.isDuplicate) return semanticHint;

  return {
    isDuplicate: false,
    reason: exactNoWriteReason || 'No duplicate signal from exact/url/semantic checks',
    method: 'NONE',
    exactMessageNoWriteIgnored: exactNoWriteIgnored
  };
}

function buildCapturePrompt(params: {
  message: string;
  source: CaptureSource;
  timezone: string;
  context: CaptureContext;
  dedup: DedupHints;
  urls: string[];
  customInstructions: string[];
  urlMetaTitle?: string | null;
  hints?: MessageHints;
  recentContext?: SessionTurn[];
}): string {
  const { message, source, timezone, context, dedup, urls, customInstructions, urlMetaTitle, hints, recentContext } = params;
  const now = new Date();
  const nowText = now.toLocaleString('en-US', { timeZone: timezone });

  const projectsText = formatContextRows(context.projects, ['id', 'title', 'category']);
  const areasText = formatContextRows(context.areas, ['id', 'title']);
  const tasksText = formatContextRows(context.tasks.slice(0, 20), ['id', 'title', 'category']);
  const accountsText = formatContextRows(context.accounts, ['id', 'name']);
  const modulesText = formatContextRows(context.modules, ['id', 'name']);

  const sessionContextText = (() => {
    if (!recentContext || recentContext.length === 0) return '';
    const lines = recentContext.map((turn, idx) => {
      const parts: string[] = [`[Turn -${recentContext.length - idx}] User: "${truncate(turn.userMessage, 80)}"`];
      if (turn.actionType) parts.push(`action=${turn.actionType}`);
      if (turn.createdTitle) parts.push(`created="${turn.createdTitle}"`);
      if (turn.projectTitle) parts.push(`project="${turn.projectTitle}"`);
      if (turn.areaTitle) parts.push(`area="${turn.areaTitle}"`);
      return parts.join(' → ');
    });
    return `\nRecent session (${recentContext.length} turn${recentContext.length > 1 ? 's' : ''}, same source, last 30min):\n${lines.join('\n')}`;
  })();

  const isPlanningMsg = looksLikePlanningRequest(message);
  const isMetaQuestion = looksLikeMetaQuestion(message);
  const hasUrls = urls.length > 0;

  return `You are JAY, PARA Brain capture router. Respond in Thai. Return strict JSON only.
Now: ${nowText} (${timezone}) | ISO: ${now.toISOString()} | Source: ${source}
Msg: "${message}"${hasUrls ? `\nURLs: ${urls.join(', ')}` : ''}${urlMetaTitle ? `\nURL Title: "${urlMetaTitle}" (use this as the resource title)` : ''}${hints?.tags.length ? `\nUser tags: ${hints.tags.map(t => `#${t}`).join(' ')} (add to suggestedTags)` : ''}${hints?.areaHint ? `\nUser area hint: "${hints.areaHint}" (use as relatedAreaTitle if area exists)` : ''}
Dedup: dup=${dedup.isDuplicate}; reason=${dedup.reason}${dedup.matchedItemId ? `; id=${dedup.matchedItemId}` : ''}${isMetaQuestion ? `\nMeta-question detected: user is asking WHY/EXPLAIN. You MUST give a clear, informative explanation in chatResponse. Do NOT reply with just "รับทราบ". Explain what happened and what to do next.` : ''}

Rules:
1. CHITCHAT→operation=CHAT (no DB write). ACTIONABLE→map to PARA/finance/module.
2. URL RULE (CRITICAL): Any message containing a URL is ALWAYS actionable. Set isActionable=true, operation=CREATE, type=Resources. If user adds context like "Resource for X project" or "สำหรับโปรเจกต์ X" → set relatedProjectTitle=X. Never treat URL messages as CHITCHAT.
3. If operation=CHAT: never claim saved/created. Be honest about no DB write this turn. BUT if user asks WHY something didn't happen, explain clearly — don't just say "รับทราบ".
4. META-QUESTION rule: If user asks "ทำไม", "why", "explain", "อธิบาย" or any question about system behavior → operation=CHAT, isActionable=false, but chatResponse MUST contain a real explanation of what happened and how to fix it (2-4 sentences minimum). Never give a one-line non-answer.
5. Dedup: if isDuplicate=true, skip create unless user explicitly asks again.
6. Low confidence (<${CONFIDENCE_CONFIRM_THRESHOLD.toFixed(2)}): keep operation, data; system will confirm.
7. Reminder ("remind me/เตือน"): type=Tasks, dueDate=ISO8601+tz, title=action (not "remind me to..."), tag="reminder". Default 09:00 if no time given.
8. dueDate — Thai time expressions (ISO8601, timezone ${timezone}):
   - "วันนี้"→today, "พรุ่งนี้"→+1d, "มะรืน"→+2d
   - "อาทิตย์หน้า"/"สัปดาห์หน้า"→next Monday, "สองอาทิตย์"→+14d
   - "ต้นเดือนหน้า"→1st of next month 09:00, "กลางเดือน"→15th this/next month, "ก่อนสิ้นเดือน"/"สิ้นเดือน"→last day of this month
   - "วันจันทร์/อังคาร/พุธ/พฤหัส/ศุกร์/เสาร์/อาทิตย์"→next occurrence of that weekday
   - "เช้า"→08:00, "สาย"→10:00, "เที่ยง"→12:00, "บ่าย"→14:00, "เย็น"→17:00, "ค่ำ"→19:00, "ดึก"→22:00
   - "ด่วน"/"ด่วนมาก"/"urgent"→today 09:00, "เร็วๆนี้"→+2d
   - No time clue→leave dueDate empty (system adds +7d 09:00)
9. Finance shorthands:
   - Amount: "3k"/"3K"→3000, "1.5k"→1500, "3M"→3000000, bare number→EXPENSE if context implies spending
   - "โอน X ไป [account]"/"transfer X to [account]"→TRANSACTION type=TRANSFER, set accountId from Accounts list
   - "ได้รับ/ได้"→INCOME, "จ่าย/ซื้อ/ค่า"→EXPENSE
   - Multi-expense in one msg ("กาแฟ 65 + ข้าว 120"): pick the larger or most explicit one; note others in chatResponse
${isPlanningMsg ? `10. Planning mode ("ทำยังไง/แนวทาง/framework"): fill goal,prerequisites[],starterTasks[],nextActions[],riskNotes[],clarifyingQuestions[].` : ''}

PARA (STRICT):
P1. Project→must have Area: always set relatedAreaTitle from Existing Areas (closest fit).
P2. Task parent order: (a)relatedProjectTitle if project exists→(b)relatedAreaTitle if area exists→(c)askForParent=true+clarifyingQuestion if unsure.
P3. createProjectIfMissing=true only when area is also known (set relatedAreaTitle).
P4. Never orphan Task or Project without parent.
- URL always→isActionable=true, operation=CREATE, type=Resources (unless user says it's a task/reminder).
- "#tag"/"@area" prefix→apply as tag/area hint. "!personal"→Area personal.
- Travel one-off→"Side Projects & Experiments". With family→"Family & Relationships". Fitness→"Health & Energy".
- "ซื้อ/จัด/หา X สำหรับ [project]"→Task under that project, not standalone.
(routing v${ROUTING_RULES_VERSION})

Areas:
${areasText || '(none)'}

Projects:
${projectsText || '(none)'}

Tasks (pending):
${tasksText || '(none)'}
${accountsText ? `\nAccounts:\n${accountsText}` : ''}${modulesText ? `\nModules:\n${modulesText}` : ''}${customInstructions.length ? `\nCustom:\n${customInstructions.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}${sessionContextText}${sessionContextText ? `\nSession rule: If this message is short/ambiguous (no explicit project/area named) and a recent turn mentions a specific project, assume the same project. Override only if user names a different project.` : ''}`;
}

function buildResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      intent: {
        type: Type.STRING,
        enum: [
          'CHITCHAT',
          'ACTIONABLE_NOTE',
          'PROJECT_IDEA',
          'TASK_CAPTURE',
          'RESOURCE_CAPTURE',
          'FINANCE_CAPTURE',
          'COMPLETE_TASK',
          'MODULE_CAPTURE'
        ]
      },
      confidence: { type: Type.NUMBER },
      isActionable: { type: Type.BOOLEAN },
      operation: {
        type: Type.STRING,
        enum: ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT']
      },
      chatResponse: { type: Type.STRING },
      title: { type: Type.STRING, nullable: true },
      summary: { type: Type.STRING, nullable: true },
      category: { type: Type.STRING, nullable: true },
      type: {
        type: Type.STRING,
        enum: ['Tasks', 'Projects', 'Resources', 'Areas', 'Archives'],
        nullable: true
      },
      relatedItemId: { type: Type.STRING, nullable: true },
      relatedProjectTitle: { type: Type.STRING, nullable: true },
      relatedAreaTitle: { type: Type.STRING, nullable: true },
      createProjectIfMissing: { type: Type.BOOLEAN, nullable: true },
      askForParent: { type: Type.BOOLEAN, nullable: true },
      clarifyingQuestion: { type: Type.STRING, nullable: true },
      suggestedTags: {
        type: Type.ARRAY,
        nullable: true,
        items: { type: Type.STRING }
      },
      dueDate: { type: Type.STRING, nullable: true },
      amount: { type: Type.NUMBER, nullable: true },
      transactionType: {
        type: Type.STRING,
        enum: ['INCOME', 'EXPENSE', 'TRANSFER'],
        nullable: true
      },
      accountId: { type: Type.STRING, nullable: true },
      targetModuleId: { type: Type.STRING, nullable: true },
      moduleDataRaw: {
        type: Type.ARRAY,
        nullable: true,
        items: {
          type: Type.OBJECT,
          properties: {
            key: { type: Type.STRING },
            value: { type: Type.STRING }
          },
          required: ['key', 'value']
        }
      },
      dedupRecommendation: {
        type: Type.STRING,
        enum: ['NEW', 'LIKELY_DUPLICATE', 'DUPLICATE'],
        nullable: true
      },
      goal: { type: Type.STRING, nullable: true },
      assumptions: {
        type: Type.ARRAY,
        nullable: true,
        items: { type: Type.STRING }
      },
      prerequisites: {
        type: Type.ARRAY,
        nullable: true,
        items: { type: Type.STRING }
      },
      starterTasks: {
        type: Type.ARRAY,
        nullable: true,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING, nullable: true }
          },
          required: ['title']
        }
      },
      nextActions: {
        type: Type.ARRAY,
        nullable: true,
        items: { type: Type.STRING }
      },
      clarifyingQuestions: {
        type: Type.ARRAY,
        nullable: true,
        items: { type: Type.STRING }
      },
      riskNotes: {
        type: Type.ARRAY,
        nullable: true,
        items: { type: Type.STRING }
      },
      recommendedProjectTitle: { type: Type.STRING, nullable: true },
      recommendedAreaTitle: { type: Type.STRING, nullable: true }
    },
    required: ['intent', 'confidence', 'isActionable', 'operation', 'chatResponse']
  };
}

async function analyzeCapture(params: {
  apiKey: string;
  prompt: string;
}): Promise<CaptureModelOutput> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const response = await runWithRetry(() =>
    ai.models.generateContent({
      model: CAPTURE_MODEL_NAME,
      contents: params.prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: buildResponseSchema()
      }
    })
  );

  try {
    return JSON.parse(response.text || '{}') as CaptureModelOutput;
  } catch {
    return {
      intent: 'CHITCHAT',
      confidence: 0.4,
      isActionable: false,
      operation: 'CHAT',
      chatResponse: 'รับทราบครับ'
    };
  }
}

export async function runCapturePipeline(input: CapturePipelineInput): Promise<CapturePipelineResult> {
  const timezone = input.timezone || 'Asia/Bangkok';
  const approvalGatesEnabled = input.approvalGatesEnabled === true;
  const ownerKey = process.env.AGENT_OWNER_KEY || 'default';
  const confirmCommand = parseConfirmCommand(input.userMessage);
  const forceConfirmed = confirmCommand.force;
  const message = normalizeMessage(confirmCommand.message);

  const urls = extractUrls(message);

  const [context, dedup, runtimeCustomInstructions, urlMetaTitle, recentContext] = await Promise.all([
    loadCaptureContext(input.supabase),
    detectDuplicateHints({
      supabase: input.supabase,
      message,
      urls,
      geminiApiKey: input.geminiApiKey,
      excludeLogId: input.excludeLogId
    }),
    loadRuntimeCustomInstructions({
      supabase: input.supabase,
      ownerKey
    }),
    urls.length > 0 ? fetchUrlTitle(urls[0]) : Promise.resolve(null),
    loadRecentSessionContext({
      supabase: input.supabase,
      source: input.source,
      excludeLogId: input.excludeLogId
    })
  ]);

  const hints = extractMessageHints(message);

  const prompt = buildCapturePrompt({
    message,
    source: input.source,
    timezone,
    context,
    dedup,
    urls,
    customInstructions: runtimeCustomInstructions,
    urlMetaTitle,
    hints,
    recentContext
  });

  const modelOutput = await analyzeCapture({ apiKey: input.geminiApiKey, prompt });

  const intent = toIntent(modelOutput.intent);
  const confidence = Math.max(0, Math.min(1, toSafeNumber(modelOutput.confidence, 0.5)));
  const isActionable = modelOutput.isActionable === true;
  let operation = toOperation(modelOutput.operation);
  let chatResponse = String(modelOutput.chatResponse || '').trim() || 'รับทราบครับ';
  let chatWriteClaimSanitized = false;
  const planningRequest = looksLikePlanningRequest(message);
  const metaQuestion = looksLikeMetaQuestion(message);
  const autoCapturePlan = ALFRED_AUTO_CAPTURE_ENABLED && planningRequest && wantsAutoCapturePlan(message);

  if (!modelOutput.relatedProjectTitle && modelOutput.recommendedProjectTitle) {
    modelOutput.relatedProjectTitle = normalizeMessage(String(modelOutput.recommendedProjectTitle || ''));
  }
  if (!modelOutput.relatedAreaTitle && modelOutput.recommendedAreaTitle) {
    modelOutput.relatedAreaTitle = normalizeMessage(String(modelOutput.recommendedAreaTitle || ''));
  }

  const travelRouting = resolveTravelAreaRouting({
    message,
    modelOutput,
    context
  });
  if (travelRouting.applied && (isActionable || operation === 'CREATE' || autoCapturePlan)) {
    const currentArea = String(modelOutput.relatedAreaTitle || modelOutput.category || '').trim();
    const currentAreaMatched = currentArea ? findByTitle(context.areas, currentArea) : null;
    const shouldOverrideArea = !currentAreaMatched || /^(inbox|general)$/i.test(currentArea);
    if (shouldOverrideArea) {
      modelOutput.relatedAreaTitle = travelRouting.areaName;
      modelOutput.category = travelRouting.areaName;
    }
    if (!modelOutput.relatedProjectTitle && travelRouting.suggestedProjectTitle) {
      modelOutput.relatedProjectTitle = travelRouting.suggestedProjectTitle;
    }
    if (travelRouting.ensureProjectLink && typeof modelOutput.createProjectIfMissing !== 'boolean') {
      modelOutput.createProjectIfMissing = true;
    }
    chatResponse = `${chatResponse}\n\n(จัดหมวดอัตโนมัติ: ${travelRouting.areaName})`;
  }

  if (!isActionable && operation !== 'CHAT') {
    operation = 'CHAT';
  }

  // Server-side URL override: if message contains URL(s) and AI still classified as CHAT,
  // force to Resource CREATE — AI should never treat URL messages as chitchat
  if (operation === 'CHAT' && urls.length > 0 && !metaQuestion) {
    operation = 'CREATE';
    if (!modelOutput.type) modelOutput.type = 'Resources';
    if (!modelOutput.title) modelOutput.title = urlMetaTitle || truncate(message.replace(/https?:\/\/\S+/g, '').trim(), 80) || 'Captured Resource';
    if (!modelOutput.summary) modelOutput.summary = message;
    modelOutput.isActionable = true;
    chatResponse = chatResponse && chatResponse !== 'รับทราบครับ'
      ? chatResponse
      : `บันทึก Resource เรียบร้อยครับ${urlMetaTitle ? ` — "${urlMetaTitle}"` : ''}`;
  }

  // Short-circuit: "เสร็จ: task name" / "done: task name" bypasses AI operation
  // Force operation=COMPLETE without needing AI to figure it out
  if (confirmCommand.completeTarget) {
    operation = 'COMPLETE';
    // Override baseTitle-equivalent for the COMPLETE block to find the task
    if (!modelOutput.relatedItemId) {
      const foundByShortcut = findByTitle(context.tasks, confirmCommand.completeTarget);
      if (foundByShortcut?.id) {
        modelOutput.relatedItemId = foundByShortcut.id;
      } else if (!modelOutput.title) {
        // Let COMPLETE block search by title via baseTitle fallback
        modelOutput.title = confirmCommand.completeTarget;
      }
    }
  }

  if (autoCapturePlan && isActionable && operation === 'CHAT') {
    operation = 'CREATE';
    const starterTasks = toSafeStarterTasks(modelOutput.starterTasks);
    if (!modelOutput.type) modelOutput.type = 'Tasks';
    if (!modelOutput.title && starterTasks[0]?.title) modelOutput.title = starterTasks[0].title;
    if (!modelOutput.summary && modelOutput.goal) modelOutput.summary = modelOutput.goal;
    if (typeof modelOutput.createProjectIfMissing !== 'boolean') {
      modelOutput.createProjectIfMissing = Boolean(modelOutput.relatedProjectTitle);
    }
    chatResponse = `${chatResponse}\n\nรับทราบครับ ผมจัดเป็นแผนเริ่มต้นและบันทึกเป็น task ให้ทันที`;
  }

  const alfredGuidance = planningRequest ? buildAlfredGuidanceText(modelOutput) : '';
  if (operation === 'CHAT' && alfredGuidance) {
    chatResponse = `${chatResponse}\n\n${alfredGuidance}`;
  }

  // Sanitize only when AI wrongly claims a write happened — but never override meta-question answers
  if (operation === 'CHAT' && !metaQuestion && responseClaimsWrite(chatResponse)) {
    const saveHint =
      intent === 'RESOURCE_CAPTURE'
        ? 'บันทึกเรื่องนี้เป็น Resource'
        : intent === 'PROJECT_IDEA'
        ? 'สร้าง Project: <ชื่อโปรเจกต์>'
        : 'สร้าง Task: <ชื่องาน>';
    chatResponse = [
      'รับทราบครับ ผมยังไม่ได้บันทึกลงฐานข้อมูลในรอบนี้',
      `ถ้าต้องการให้บันทึกทันที ให้พิมพ์: ${saveHint}`
    ].join('\n');
    chatWriteClaimSanitized = true;
  }

  // If response is suspiciously short (≤10 chars) and it's a CHAT operation, signal possible bad response
  if (operation === 'CHAT' && chatResponse.length <= 10 && !metaQuestion) {
    chatResponse = 'รับทราบครับ ถ้าต้องการให้บันทึกหรือสร้างรายการ ให้ระบุเพิ่มเติมได้เลย';
  }

  if (dedup.isDuplicate && operation !== 'CHAT' && !forceConfirmed) {
    operation = 'CHAT';
    chatResponse = `ข้อมูลนี้ดูเหมือนเคยมีแล้ว (${dedup.reason}) ผมยังไม่สร้างรายการซ้ำให้นะครับ`;
    return {
      success: true,
      source: input.source,
      intent,
      confidence,
      isActionable: false,
      operation,
      chatResponse,
      actionType: 'SKIP_DUPLICATE',
      status: 'SKIPPED_DUPLICATE',
      dedup,
      meta: {
        dedupRecommendation: modelOutput.dedupRecommendation || 'DUPLICATE',
        requiresConfirmation: false,
        writeExecuted: false,
        dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
      }
    };
  }

  const requiresConfirmation =
    !forceConfirmed &&
    operation !== 'CHAT' &&
    isActionable &&
    confidence < CONFIDENCE_CONFIRM_THRESHOLD;
  if (requiresConfirmation) {
    const suggestedTitle = String(modelOutput.title || truncate(message, 80));
    const pendingMsg = [
      `${chatResponse}`,
      '',
      `ผมยังไม่บันทึกทันที เพราะความมั่นใจยังต่ำ (${Math.round(confidence * 100)}%).`,
      `ถ้าต้องการให้สร้างตอนนี้ ให้พิมพ์: ยืนยัน: ${suggestedTitle}`
    ].join('\n');
    return {
      success: true,
      source: input.source,
      intent,
      confidence,
      isActionable,
      operation,
      chatResponse: pendingMsg,
      actionType: 'NEEDS_CONFIRMATION',
      status: 'PENDING',
      dedup,
      meta: {
        requiresConfirmation: true,
        suggestedTitle,
        confirmThreshold: CONFIDENCE_CONFIRM_THRESHOLD,
        writeExecuted: false,
        dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
      }
    };
  }

  if (approvalGatesEnabled && ['TRANSACTION', 'MODULE_ITEM', 'COMPLETE'].includes(operation)) {
    const pendingMsg = `${chatResponse}\n\n⚠️ Action requires approval and was not executed automatically.`;
    return {
      success: true,
      source: input.source,
      intent,
      confidence,
      isActionable,
      operation,
      chatResponse: pendingMsg,
      actionType: 'PENDING_APPROVAL',
      status: 'PENDING',
      dedup,
      meta: {
        requestedOperation: operation,
        writeExecuted: false,
        dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
      }
    };
  }

  // Handle askForParent: AI is unsure about parent — ask user before creating
  if (modelOutput.askForParent && operation === 'CREATE' && !forceConfirmed) {
    const question = String(modelOutput.clarifyingQuestion || modelOutput.chatResponse || '').trim()
      || `ควรให้ "${String(modelOutput.title || truncate(message, 60))}" อยู่ใน Project หรือ Area ไหนครับ?`;
    return {
      success: true,
      source: input.source,
      intent,
      confidence,
      isActionable,
      operation,
      chatResponse: question,
      actionType: 'NEEDS_PARENT_CLARIFICATION',
      status: 'PENDING',
      dedup,
      meta: {
        requiresConfirmation: true,
        suggestedTitle: String(modelOutput.title || truncate(message, 80)),
        writeExecuted: false,
        dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
      }
    };
  }

  try {
    const nowIso = new Date().toISOString();
    const baseTitle = String(modelOutput.title || '').trim() || truncate(message, 80);
    const baseCategory = String(modelOutput.category || '').trim() || 'Inbox';
    const routeTags = toSafeTags(travelRouting.extraTags || []);
    const tags = Array.from(new Set([...toSafeTags(modelOutput.suggestedTags), ...routeTags])).slice(0, 12);

    if (operation === 'CHAT') {
      return {
        success: true,
        source: input.source,
        intent,
        confidence,
        isActionable,
        operation,
        chatResponse,
        actionType: alfredGuidance ? 'CHAT_WITH_GUIDANCE' : 'CHAT',
        status: 'SUCCESS',
        dedup,
        meta: {
          planningRequest,
          guidanceIncluded: Boolean(alfredGuidance),
          travelRouting,
          writeExecuted: false,
          chatWriteClaimSanitized,
          dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
        }
      };
    }

    if (operation === 'CREATE') {
      const paraType = normalizeType(modelOutput.type);
      const table = PARA_TYPE_TO_TABLE[paraType] || 'tasks';
      const createdItems: Record<string, any>[] = [];

      if (paraType === 'Tasks') {
        let relatedItemIds: string[] = [];

        if (modelOutput.relatedItemId) {
          relatedItemIds = [String(modelOutput.relatedItemId)];
        } else if (modelOutput.relatedProjectTitle) {
          const project = findByTitle(context.projects, modelOutput.relatedProjectTitle);
          if (project?.id) {
            relatedItemIds = [project.id];
          } else if (!modelOutput.createProjectIfMissing && !forceConfirmed) {
            // Project name not found and not explicitly asked to create — likely a typo
            const projectList = context.projects.slice(0, 8).map(p => `"${p.title}"`).join(', ');
            const clarifyMsg = [
              `หา project "${modelOutput.relatedProjectTitle}" ไม่เจอครับ`,
              projectList ? `Project ที่มีอยู่: ${projectList}` : '',
              `ถ้าชื่อถูกต้องและต้องการสร้าง project ใหม่ พิมพ์: ยืนยัน: ${input.userMessage}`,
              `หรือระบุชื่อ project ที่ถูกต้องมาใหม่ได้เลยครับ`
            ].filter(Boolean).join('\n');
            return {
              success: true,
              source: input.source,
              intent,
              confidence,
              isActionable,
              operation,
              chatResponse: clarifyMsg,
              actionType: 'NEEDS_PROJECT_CLARIFICATION',
              status: 'PENDING',
              dedup,
              meta: {
                requiresConfirmation: true,
                suggestedTitle: baseTitle,
                requestedProject: modelOutput.relatedProjectTitle,
                writeExecuted: false,
                dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
              }
            };
          }
        }

        let autoProject: any = null;
        if (relatedItemIds.length === 0 && (modelOutput.createProjectIfMissing || modelOutput.relatedProjectTitle)) {
          const targetProjectTitle = String(modelOutput.relatedProjectTitle || '').trim();
          if (targetProjectTitle) {
            const existingProject = findByTitle(context.projects, targetProjectTitle);
            if (existingProject?.id) {
              relatedItemIds = [existingProject.id];
            } else {
              // Find the area to link the auto-created project to
              const areaForProject = findByTitle(context.areas, modelOutput.relatedAreaTitle || baseCategory)
                || findByTitle(context.areas, baseCategory);
              const projectPayload: any = {
                id: uuidv4(),
                title: targetProjectTitle,
                type: 'Projects',
                category: String(modelOutput.relatedAreaTitle || areaForProject?.title || baseCategory || 'General'),
                content: `Auto-created from capture: ${truncate(message, 220)}`,
                tags: Array.from(new Set(['auto-capture', 'project', ...tags])),
                related_item_ids: areaForProject?.id ? [areaForProject.id] : [],
                is_completed: false,
                created_at: nowIso,
                updated_at: nowIso
              };
              const projectInsert = await input.supabase.from('projects').insert(projectPayload).select().single();
              if (projectInsert.error) throw new Error(projectInsert.error.message);
              autoProject = projectInsert.data;
              relatedItemIds = autoProject?.id ? [autoProject.id] : [];
              if (autoProject) createdItems.push(autoProject);
            }
          }
        }

        // Fallback: if still no project, try to link directly to an Area
        if (relatedItemIds.length === 0 && modelOutput.relatedAreaTitle) {
          const area = findByTitle(context.areas, modelOutput.relatedAreaTitle);
          if (area?.id) relatedItemIds = [area.id];
        }

        const taskPayload: any = {
          id: uuidv4(),
          title: baseTitle,
          type: 'Tasks',
          category: baseCategory,
          content: buildPlanningTaskContent({
            message,
            modelOutput,
            fallbackSummary: String(modelOutput.summary || message)
          }),
          tags,
          related_item_ids: relatedItemIds,
          is_completed: false,
          created_at: nowIso,
          updated_at: nowIso
        };
        if (modelOutput.dueDate && String(modelOutput.dueDate).includes('T')) {
          taskPayload.due_date = modelOutput.dueDate;
        } else {
          // Default: +7 days from now at 09:00 in user's timezone
          const tz = input.timezone || 'Asia/Bangkok';
          const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const parts = defaultDue.toLocaleDateString('en-CA', { timeZone: tz }).split('-');
          taskPayload.due_date = `${parts[0]}-${parts[1]}-${parts[2]}T09:00:00`;
        }

        const insert = await input.supabase.from(table).insert(taskPayload).select().single();
        if (insert.error) throw new Error(insert.error.message);
        createdItems.push(insert.data);

        return {
          success: true,
          source: input.source,
          intent,
          confidence,
          isActionable,
          operation,
          chatResponse,
          itemType: 'PARA',
          createdItem: createdItems.length === 1 ? createdItems[0] : null,
          createdItems: createdItems.length > 1 ? createdItems : undefined,
          actionType: 'CREATE_PARA',
          status: 'SUCCESS',
          dedup,
          meta: {
            table,
            paraType,
            autoProjectCreated: createdItems.length > 1,
            forceConfirmed,
            planningRequest,
            autoCapturePlan,
            guidanceIncluded: Boolean(alfredGuidance),
            travelRouting,
            writeExecuted: true,
            dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
          }
        };
      }

      // For Projects/Resources: resolve parent links
      let nonTaskRelatedIds: string[] = [];
      if (modelOutput.relatedItemId) {
        nonTaskRelatedIds = [String(modelOutput.relatedItemId)];
      } else if (paraType === 'Projects') {
        // P1: Project MUST link to an Area — try relatedAreaTitle, then category, then best guess
        const areaLookup = modelOutput.relatedAreaTitle || modelOutput.category || baseCategory;
        const linkedArea = findByTitle(context.areas, areaLookup)
          || (context.areas.length > 0 ? null : null); // only link if area found
        if (linkedArea?.id) nonTaskRelatedIds = [linkedArea.id];
      } else if (paraType === 'Resources') {
        // Link resource to project by title if user specified one
        if (modelOutput.relatedProjectTitle) {
          const project = findByTitle(context.projects, modelOutput.relatedProjectTitle);
          if (project?.id) {
            nonTaskRelatedIds = [project.id];
          } else if (!forceConfirmed) {
            // Project name not found — likely a typo, ask user to confirm
            const projectList = context.projects.slice(0, 8).map(p => `"${p.title}"`).join(', ');
            const clarifyMsg = [
              `หา project "${modelOutput.relatedProjectTitle}" ไม่เจอครับ`,
              projectList ? `Project ที่มีอยู่: ${projectList}` : '',
              `ถ้าชื่อถูกต้อง พิมพ์: ยืนยัน: ${input.userMessage}`,
              `หรือระบุชื่อ project ที่ถูกต้องมาใหม่ได้เลยครับ`
            ].filter(Boolean).join('\n');
            return {
              success: true,
              source: input.source,
              intent,
              confidence,
              isActionable,
              operation,
              chatResponse: clarifyMsg,
              actionType: 'NEEDS_PROJECT_CLARIFICATION',
              status: 'PENDING',
              dedup,
              meta: {
                requiresConfirmation: true,
                suggestedTitle: baseTitle,
                requestedProject: modelOutput.relatedProjectTitle,
                writeExecuted: false,
                dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
              }
            };
          }
        }
        // Fallback: link to area
        if (nonTaskRelatedIds.length === 0 && modelOutput.relatedAreaTitle) {
          const area = findByTitle(context.areas, modelOutput.relatedAreaTitle);
          if (area?.id) nonTaskRelatedIds = [area.id];
        }
      }

      const payload: any = {
        id: uuidv4(),
        title: baseTitle,
        type: paraType,
        category: String(modelOutput.relatedAreaTitle || baseCategory),
        content: String(modelOutput.summary || message),
        tags,
        related_item_ids: nonTaskRelatedIds,
        is_completed: false,
        created_at: nowIso,
        updated_at: nowIso
      };

      if (paraType === 'Areas') {
        payload.name = baseTitle;
        payload.category = baseCategory;
      }

      const insert = await input.supabase.from(table).insert(payload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      return {
        success: true,
        source: input.source,
        intent,
        confidence,
        isActionable,
        operation,
        chatResponse,
        itemType: 'PARA',
        createdItem: insert.data,
        actionType: 'CREATE_PARA',
        status: 'SUCCESS',
        dedup,
        meta: {
          table,
          paraType,
          forceConfirmed,
          planningRequest,
          guidanceIncluded: Boolean(alfredGuidance),
          travelRouting,
          writeExecuted: true,
          dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
        }
      };
    }

    if (operation === 'TRANSACTION') {
      const targetAccountId = modelOutput.accountId || context.accounts?.[0]?.id || null;
      if (!targetAccountId) {
        return {
          success: false,
          source: input.source,
          intent,
          confidence,
          isActionable,
          operation,
          chatResponse: '⚠️ หาบัญชีไม่เจอครับ',
          actionType: 'ERROR',
          status: 'FAILED',
          dedup,
          meta: {
            reason: 'ACCOUNT_NOT_FOUND',
            writeExecuted: false,
            dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
          }
        };
      }

      const txPayload = {
        id: uuidv4(),
        description: baseTitle,
        amount: parseAmountShorthand(modelOutput.amount) ?? toSafeNumber(modelOutput.amount, 0),
        type: modelOutput.transactionType || 'EXPENSE',
        category: baseCategory || 'General',
        account_id: targetAccountId,
        transaction_date: nowIso
      };

      const insert = await input.supabase.from('transactions').insert(txPayload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      return {
        success: true,
        source: input.source,
        intent,
        confidence,
        isActionable,
        operation,
        chatResponse,
        itemType: 'TRANSACTION',
        createdItem: insert.data,
        actionType: 'CREATE_TX',
        status: 'SUCCESS',
        dedup,
        meta: {
          table: 'transactions',
          forceConfirmed,
          writeExecuted: true,
          dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
        }
      };
    }

    if (operation === 'MODULE_ITEM') {
      if (!modelOutput.targetModuleId) {
        return {
          success: false,
          source: input.source,
          intent,
          confidence,
          isActionable,
          operation,
          chatResponse: '⚠️ ไม่พบโมดูลเป้าหมายสำหรับบันทึกข้อมูล',
          actionType: 'ERROR',
          status: 'FAILED',
          dedup,
          meta: {
            reason: 'MODULE_TARGET_MISSING',
            writeExecuted: false,
            dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
          }
        };
      }

      const moduleData: Record<string, any> = {};
      if (Array.isArray(modelOutput.moduleDataRaw)) {
        modelOutput.moduleDataRaw.forEach((f) => {
          const key = String(f?.key || '').trim();
          if (!key) return;
          const raw = String(f?.value || '').trim();
          const asNum = Number(raw);
          moduleData[key] = raw !== '' && Number.isFinite(asNum) ? asNum : raw;
        });
      }

      const modulePayload = {
        id: uuidv4(),
        module_id: modelOutput.targetModuleId,
        title: baseTitle || 'Entry',
        data: moduleData,
        tags,
        created_at: nowIso,
        updated_at: nowIso
      };

      const insert = await input.supabase.from('module_items').insert(modulePayload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      return {
        success: true,
        source: input.source,
        intent,
        confidence,
        isActionable,
        operation,
        chatResponse,
        itemType: 'MODULE',
        createdItem: insert.data,
        actionType: 'CREATE_MODULE',
        status: 'SUCCESS',
        dedup,
        meta: {
          table: 'module_items',
          forceConfirmed,
          writeExecuted: true,
          dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
        }
      };
    }

    if (operation === 'COMPLETE') {
      let targetTaskId = modelOutput.relatedItemId || '';

      if (!targetTaskId && baseTitle) {
        const foundTask = findByTitle(context.tasks, baseTitle);
        if (foundTask?.id) targetTaskId = foundTask.id;
      }

      if (!targetTaskId) {
        return {
          success: true,
          source: input.source,
          intent,
          confidence,
          isActionable,
          operation: 'CHAT',
          chatResponse: 'ยังหา task ที่จะ complete ไม่เจอครับ ลองระบุชื่องานอีกครั้ง',
          actionType: 'COMPLETE_TASK_NOT_FOUND',
          status: 'SUCCESS',
          dedup,
          meta: {
            requestedOperation: 'COMPLETE',
            writeExecuted: false,
            dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
          }
        };
      }

      const update = await input.supabase
        .from('tasks')
        .update({ is_completed: true, updated_at: nowIso })
        .eq('id', targetTaskId)
        .select()
        .single();

      if (update.error) throw new Error(update.error.message);

      return {
        success: true,
        source: input.source,
        intent,
        confidence,
        isActionable,
        operation,
        chatResponse,
        itemType: 'PARA',
        createdItem: update.data,
        actionType: 'COMPLETE_TASK',
        status: 'SUCCESS',
        dedup,
        meta: {
          table: 'tasks',
          forceConfirmed,
          writeExecuted: true,
          dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
        }
      };
    }

    return {
      success: true,
      source: input.source,
      intent,
      confidence,
      isActionable,
      operation: 'CHAT',
      chatResponse,
      actionType: 'CHAT',
      status: 'SUCCESS',
      dedup,
      meta: {
        writeExecuted: false,
        chatWriteClaimSanitized,
        dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
      }
    };
  } catch (error: any) {
    return {
      success: false,
      source: input.source,
      intent,
      confidence,
      isActionable,
      operation,
      chatResponse: 'ระบบขัดข้องชั่วคราวครับ',
      actionType: 'ERROR',
      status: 'FAILED',
      dedup,
      meta: {
        reason: 'PIPELINE_EXCEPTION',
        error: error?.message || 'Unknown error',
        writeExecuted: false,
        dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored)
      }
    };
  }
}

export function toCaptureLogPayload(result: CapturePipelineResult) {
  return {
    contract: 'telegram_chat_v1',
    version: 1,
    source: result.source,
    intent: result.intent,
    confidence: result.confidence,
    isActionable: result.isActionable,
    operation: result.operation,
    chatResponse: result.chatResponse,
    itemType: result.itemType,
    createdItem: result.createdItem || undefined,
    createdItems: result.createdItems,
    dedup: result.dedup,
    meta: {
      actionType: result.actionType,
      status: result.status,
      ...(result.meta || {})
    }
  };
}
