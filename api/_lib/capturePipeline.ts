import { GoogleGenAI, Type } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { runWithRetry } from './externalPolicy.js';

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
}

interface CaptureContext {
  projects: any[];
  areas: any[];
  tasks: any[];
  resources: any[];
  accounts: any[];
  modules: any[];
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

const truncate = (value: string, max = 180): string => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

const normalizeMessage = (text: string): string => text.replace(/\s+/g, ' ').trim();

const parseConfirmCommand = (rawMessage: string): ConfirmCommand => {
  const text = normalizeMessage(rawMessage);
  if (!text) return { force: false, message: text };
  const patterns = [
    /^ยืนยัน\s*[:\-]\s*(.+)$/i,
    /^confirm\s*[:\-]\s*(.+)$/i,
    /^yes\s*[:\-]\s*(.+)$/i
  ];
  for (const pattern of patterns) {
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
      .select('id,title,category,type,related_item_ids,updated_at')
      .order('updated_at', { ascending: false })
      .limit(60),
    supabase
      .from('areas')
      .select('id,title,name,category,updated_at')
      .order('updated_at', { ascending: false })
      .limit(30),
    supabase
      .from('tasks')
      .select('id,title,category,related_item_ids,is_completed,due_date,updated_at')
      .order('updated_at', { ascending: false })
      .limit(80),
    supabase
      .from('resources')
      .select('id,title,category,content,updated_at')
      .order('updated_at', { ascending: false })
      .limit(40),
    supabase.from('accounts').select('id,name').limit(20),
    supabase.from('modules').select('id,name,schema_config').limit(20)
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

async function detectDuplicateHints(params: {
  supabase: any;
  message: string;
  urls: string[];
  geminiApiKey: string;
  excludeLogId?: string;
}): Promise<DedupHints> {
  const { supabase, message, urls, excludeLogId, geminiApiKey } = params;

  const recentLogRes = await supabase
    .from('system_logs')
    .select('id,event_source,created_at,user_message')
    .eq('user_message', message)
    .order('created_at', { ascending: false })
    .limit(5);

  const recentLog = (recentLogRes.data || []).find((row: any) => row.id !== excludeLogId);
  if (recentLog) {
    return {
      isDuplicate: true,
      reason: 'Exact same message already captured in system_logs',
      method: 'EXACT_MESSAGE',
      matchedLogId: recentLog.id
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
    reason: 'No duplicate signal from exact/url/semantic checks',
    method: 'NONE'
  };
}

function buildCapturePrompt(params: {
  message: string;
  source: CaptureSource;
  timezone: string;
  context: CaptureContext;
  dedup: DedupHints;
  urls: string[];
}): string {
  const { message, source, timezone, context, dedup, urls } = params;
  const now = new Date();
  const nowText = now.toLocaleString('en-US', { timeZone: timezone });

  const projectsText = formatContextRows(context.projects.slice(0, 25), ['id', 'title', 'category']);
  const areasText = formatContextRows(context.areas.slice(0, 20), ['id', 'title', 'name', 'category']);
  const tasksText = formatContextRows(context.tasks.slice(0, 25), ['id', 'title', 'category', 'is_completed']);
  const accountsText = formatContextRows(context.accounts.slice(0, 12), ['id', 'name']);
  const modulesText = formatContextRows(context.modules.slice(0, 12), ['id', 'name']);

  return `You are JAY, PARA Brain capture router.

Current time (${timezone}): ${nowText} | ISO: ${now.toISOString()}
Inbound source: ${source}
User message: "${message}"
URLs detected: ${urls.length > 0 ? urls.join(', ') : 'none'}
Duplicate hints: isDuplicate=${dedup.isDuplicate}; reason=${dedup.reason}; matchedItemId=${dedup.matchedItemId || 'none'}; matchedTable=${dedup.matchedTable || 'none'}

Core behavior:
1. Classify intent first: CHITCHAT vs actionable capture.
2. If CHITCHAT, set operation=CHAT and do not create data.
3. If actionable, map into PARA/finance/module actions.
4. Prefer linking task to an existing project.
5. If task has no matching project but user clearly implies a project, propose relatedProjectTitle and createProjectIfMissing=true.
6. Use dedup hints: if likely duplicate, avoid new create unless user explicitly asks to create another.
7. Keep assistant response concise in Thai.
8. If confidence is low (< ${CONFIDENCE_CONFIRM_THRESHOLD.toFixed(2)}) for write operation, keep operation but provide data that can be confirmed.
9. Alfred planning mode: when user asks "how to / what should I know / direction / framework", provide starter guidance fields:
   - goal, prerequisites[], starterTasks[], nextActions[], riskNotes[], clarifyingQuestions[]
10. If the user asks to "จัดให้/วางให้/ช่วยแตกงาน", keep response practical and suggest concrete starter tasks that can be executed today.
11. Prefer a single master task with clear checklist when user has broad goal and low detail.

PARA constraints:
- Task should belong to a project when possible.
- Project should map to an area by category or relatedAreaTitle.
- Resource with URL should go to type=Resources unless user clearly asks for task/action.

Existing Areas:
${areasText || '(none)'}

Existing Projects:
${projectsText || '(none)'}

Recent Tasks:
${tasksText || '(none)'}

Accounts:
${accountsText || '(none)'}

Modules:
${modulesText || '(none)'}

Return strict JSON only.`;
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
  const confirmCommand = parseConfirmCommand(input.userMessage);
  const forceConfirmed = confirmCommand.force;
  const message = normalizeMessage(confirmCommand.message);

  const [context, dedup] = await Promise.all([
    loadCaptureContext(input.supabase),
    detectDuplicateHints({
      supabase: input.supabase,
      message,
      urls: extractUrls(message),
      geminiApiKey: input.geminiApiKey,
      excludeLogId: input.excludeLogId
    })
  ]);

  const prompt = buildCapturePrompt({
    message,
    source: input.source,
    timezone,
    context,
    dedup,
    urls: extractUrls(message)
  });

  const modelOutput = await analyzeCapture({ apiKey: input.geminiApiKey, prompt });

  const intent = toIntent(modelOutput.intent);
  const confidence = Math.max(0, Math.min(1, toSafeNumber(modelOutput.confidence, 0.5)));
  const isActionable = modelOutput.isActionable === true;
  let operation = toOperation(modelOutput.operation);
  let chatResponse = String(modelOutput.chatResponse || '').trim() || 'รับทราบครับ';
  const planningRequest = looksLikePlanningRequest(message);
  const autoCapturePlan = ALFRED_AUTO_CAPTURE_ENABLED && planningRequest && wantsAutoCapturePlan(message);

  if (!modelOutput.relatedProjectTitle && modelOutput.recommendedProjectTitle) {
    modelOutput.relatedProjectTitle = normalizeMessage(String(modelOutput.recommendedProjectTitle || ''));
  }
  if (!modelOutput.relatedAreaTitle && modelOutput.recommendedAreaTitle) {
    modelOutput.relatedAreaTitle = normalizeMessage(String(modelOutput.recommendedAreaTitle || ''));
  }

  if (!isActionable && operation !== 'CHAT') {
    operation = 'CHAT';
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
        requiresConfirmation: false
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
        confirmThreshold: CONFIDENCE_CONFIRM_THRESHOLD
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
        requestedOperation: operation
      }
    };
  }

  try {
    const nowIso = new Date().toISOString();
    const baseTitle = String(modelOutput.title || '').trim() || truncate(message, 80);
    const baseCategory = String(modelOutput.category || '').trim() || 'Inbox';
    const tags = toSafeTags(modelOutput.suggestedTags);

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
          guidanceIncluded: Boolean(alfredGuidance)
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
              const area = findByTitle(context.areas, modelOutput.relatedAreaTitle || baseCategory);
              const projectPayload: any = {
                id: uuidv4(),
                title: targetProjectTitle,
                type: 'Projects',
                category: String(modelOutput.relatedAreaTitle || baseCategory || 'General'),
                content: `Auto-created from capture: ${truncate(message, 220)}`,
                tags: Array.from(new Set(['auto-capture', 'project', ...tags])),
                related_item_ids: area?.id ? [area.id] : [],
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
            guidanceIncluded: Boolean(alfredGuidance)
          }
        };
      }

      const payload: any = {
        id: uuidv4(),
        title: baseTitle,
        type: paraType,
        category: baseCategory,
        content: String(modelOutput.summary || message),
        tags,
        related_item_ids: modelOutput.relatedItemId ? [String(modelOutput.relatedItemId)] : [],
        is_completed: false,
        created_at: nowIso,
        updated_at: nowIso
      };

      if (paraType === 'Areas') {
        payload.name = baseTitle;
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
          guidanceIncluded: Boolean(alfredGuidance)
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
          meta: { reason: 'ACCOUNT_NOT_FOUND' }
        };
      }

      const txPayload = {
        id: uuidv4(),
        description: baseTitle,
        amount: toSafeNumber(modelOutput.amount, 0),
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
          forceConfirmed
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
          meta: { reason: 'MODULE_TARGET_MISSING' }
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
          forceConfirmed
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
            requestedOperation: 'COMPLETE'
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
          forceConfirmed
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
      dedup
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
        error: error?.message || 'Unknown error'
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
