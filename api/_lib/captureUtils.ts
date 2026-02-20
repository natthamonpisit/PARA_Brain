// ─── Capture Pipeline — Utilities & Classifiers ───────────────────────────────
// Pure functions: string helpers, parsers, type coercions, message classifiers.

import {
  CaptureIntent, CaptureOperation, CaptureContext, AreaRoutingDecision,
  CaptureModelOutput, ConfirmCommand, MessageHints,
  DEFAULT_INTENT, DEFAULT_OPERATION,
} from './captureTypes.js';
import {
  ROUTING_RULES_VERSION,
  findExplicitAreaMentionInAreas,
  resolveTravelAreaRecommendation
} from '../../shared/routingRules.js';

// ─── String helpers ───────────────────────────────────────────────────────────

export const truncate = (value: string, max = 180): string => {
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
};

export const normalizeMessage = (text: string): string => text.replace(/\s+/g, ' ').trim();

export const formatContextRows = (rows: any[], fields: string[]): string => {
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

export const joinSection = (title: string, lines: string[]): string => {
  if (!lines.length) return '';
  return `${title}\n${lines.join('\n')}`;
};

// ─── Log payload helpers ─────────────────────────────────────────────────────

export const parseLogPayload = (raw: any): any => {
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

export const hasCommittedWrite = (row: any, writeActionTypes: Set<string>): boolean => {
  const actionType = String(row?.action_type || '').toUpperCase();
  if (writeActionTypes.has(actionType)) return true;
  const payload = parseLogPayload(row?.ai_response);
  if (!payload || typeof payload !== 'object') return false;
  if (payload.createdItem) return true;
  if (Array.isArray(payload.createdItems) && payload.createdItems.length > 0) return true;
  return false;
};

export const responseHasExplicitNoWrite = (text: string): boolean => {
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

export const responseClaimsWrite = (text: string): boolean => {
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

// ─── Message parsers ──────────────────────────────────────────────────────────

export const parseConfirmCommand = (rawMessage: string): ConfirmCommand => {
  const text = normalizeMessage(rawMessage);
  if (!text) return { force: false, message: text };

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

export const extractUrls = (text: string): string[] => {
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return Array.from(new Set(urls.map((u) => u.trim())));
};

export const extractMessageHints = (text: string): MessageHints => {
  const tags = (text.match(/#([\w\u0E00-\u0E7F]+)/g) || [])
    .map(t => t.slice(1).toLowerCase())
    .filter(Boolean);
  const areaMatch = text.match(/(?:^|\s)[@!]([\w\u0E00-\u0E7F]+)/);
  const areaHint = areaMatch ? areaMatch[1] : null;
  return { tags, areaHint };
};

// ─── Type coercions ───────────────────────────────────────────────────────────

export const toIntent = (value: any): CaptureIntent => {
  const intents: CaptureIntent[] = [
    'CHITCHAT', 'ACTIONABLE_NOTE', 'PROJECT_IDEA', 'TASK_CAPTURE',
    'RESOURCE_CAPTURE', 'FINANCE_CAPTURE', 'COMPLETE_TASK', 'MODULE_CAPTURE'
  ];
  return intents.includes(value) ? value : DEFAULT_INTENT;
};

export const toOperation = (value: any): CaptureOperation => {
  const ops: CaptureOperation[] = ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT'];
  return ops.includes(value) ? value : DEFAULT_OPERATION;
};

export const toSafeNumber = (value: any, fallback: number): number => {
  const n = Number(value);
  if (Number.isFinite(n)) return n;
  return fallback;
};

export const parseAmountShorthand = (value: any): number | null => {
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

export const toSafeTags = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((tag) => String(tag || '').trim()).filter(Boolean).slice(0, 12);
};

export const toSafeTextList = (value: any, max = 6): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeMessage(String(item || ''))).filter(Boolean).slice(0, max);
};

export const toSafeStarterTasks = (value: any): Array<{ title: string; description?: string }> => {
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

export const normalizeType = (value: any): 'Tasks' | 'Projects' | 'Resources' | 'Areas' | 'Archives' => {
  const allowed = ['Tasks', 'Projects', 'Resources', 'Areas', 'Archives'];
  return allowed.includes(value) ? (value as any) : 'Tasks';
};

// ─── Message classifiers ──────────────────────────────────────────────────────

export const looksLikePlanningRequest = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [
    /ต้องรู้อะไร/, /ทำยังไง/, /เริ่มยังไง/, /ควรเริ่ม/,
    /แนวทาง/, /framework/, /roadmap/, /strategy/, /guide/,
    /\bplan\b/, /\bstep\b/, /แบ่งงาน/, /แตกงาน/
  ];
  return patterns.some((re) => re.test(text));
};

export const wantsAutoCapturePlan = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [/จัดให้/, /ทำให้/, /บันทึก/, /สร้างให้/, /แตก task/, /split task/, /ช่วยวาง/];
  return patterns.some((re) => re.test(text));
};

/**
 * Detect capability questions — "ทำได้มั้ย", "สามารถ...ได้มั้ย", "can you X?"
 * These are questions, NOT commands. Should never trigger auto-create.
 */
export const looksLikeCapabilityQuestion = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [
    /สามารถ.{0,40}(ได้มั้ย|ได้ไหม|ได้เลยไหม|ได้หรือเปล่า)/,
    /ทำ.{0,30}(ได้มั้ย|ได้ไหม|ได้เลยไหม)/,
    /บันทึก.{0,30}(ได้มั้ย|ได้ไหม|ได้เลยไหม)/,
    /รับ.{0,20}(ได้มั้ย|ได้ไหม)/,
    /can (you|it).{0,40}\?/i,
    /is it possible/i,
    /able to/i,
    /support.{0,20}\?/i,
  ];
  return patterns.some((re) => re.test(text));
};

/**
 * Detect meta/debug questions — user asking WHY something happened or didn't happen.
 * These should always get a real explanation, never be silently sanitized.
 */
export const looksLikeMetaQuestion = (message: string): boolean => {
  const text = normalizeMessage(message).toLowerCase();
  if (!text) return false;
  const patterns = [
    /ทำไม(ไม่|ถึง|จึง)/,
    /เพราะ(อะไร|ไร)/,
    /ทำไม\b/,
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

// ─── Context lookup helpers ───────────────────────────────────────────────────

export const findByTitle = (rows: any[], title: string): any | null => {
  const needle = String(title || '').trim().toLowerCase();
  if (!needle) return null;
  const exact = rows.find((row) => String(row.title || row.name || '').trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = rows.find((row) => String(row.title || row.name || '').trim().toLowerCase().includes(needle));
  return partial || null;
};

// ─── Travel/area routing ──────────────────────────────────────────────────────

export const toTripProjectTitle = (seed: string): string => {
  const cleaned = normalizeMessage(seed).replace(/^trip\s*[:\-]?\s*/i, '');
  if (!cleaned) return 'Trip Plan';
  return `Trip: ${truncate(cleaned, 48)}`;
};

export const resolveTravelAreaRouting = (params: {
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
    return { applied: false, reason: decision.reason, ruleVersion: ROUTING_RULES_VERSION };
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

// ─── Planning / Alfred guidance ───────────────────────────────────────────────

export const buildAlfredGuidanceText = (modelOutput: CaptureModelOutput): string => {
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

export const buildPlanningTaskContent = (params: {
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
