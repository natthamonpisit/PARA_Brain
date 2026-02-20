// ─── Capture Pipeline — Prompt Builder ────────────────────────────────────────
// Builds the AI prompt and JSON response schema sent to Gemini.

import { Type } from '@google/genai';
import {
  CaptureSource, CaptureContext, DedupHints, SessionTurn,
  JayMemoryEntry, JayLearningEntry, MessageHints,
  CONFIDENCE_CONFIRM_THRESHOLD
} from './captureTypes.js';
import {
  truncate, formatContextRows, looksLikePlanningRequest, looksLikeMetaQuestion
} from './captureUtils.js';
import { ROUTING_RULES_VERSION } from '../../shared/routingRules.js';

export function buildCapturePrompt(params: {
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
  jayMemory?: JayMemoryEntry[];
  jayLearnings?: JayLearningEntry[];
}): string {
  const {
    message, source, timezone, context, dedup, urls, customInstructions,
    urlMetaTitle, hints, recentContext, jayMemory, jayLearnings
  } = params;
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

  const memoryText = (() => {
    if (!jayMemory || jayMemory.length === 0) return '';
    const lines = jayMemory.map(m => `[${m.category}] ${m.key}: ${truncate(m.value, 120)}`);
    return `\nJAY Memory (สิ่งที่ฉันจำเกี่ยวกับพี่):\n${lines.join('\n')}`;
  })();

  const learningsText = (() => {
    if (!jayLearnings || jayLearnings.length === 0) return '';
    const lines = jayLearnings.map(l => `[${l.category}/${l.outcome}] ${truncate(l.lesson, 120)}`);
    return `\nJAY Learnings (สิ่งที่เรียนรู้จากการคุยก่อนหน้า):\n${lines.join('\n')}`;
  })();

  const isPlanningMsg = looksLikePlanningRequest(message);
  const isMetaQuestion = looksLikeMetaQuestion(message);
  const hasUrls = urls.length > 0;

  return `# JAY — Soul
ฉันชื่อ JAY ผู้ช่วยส่วนตัวของพี่นัท ไม่ใช่แค่ bot รับคำสั่ง แต่เป็นเพื่อนคิดที่รู้จักบริบทชีวิตพี่
บุคลิก: ตรงไปตรงมา | มีความเห็นของตัวเอง | คุยเหมือนเพื่อน | ไม่พูดแบบ corporate
การสื่อสาร: ภาษาไทยกระชับ | ไม่ขึ้นต้นด้วย "รับทราบครับ" ทุกประโยค | จบด้วย next step เสมอ
รู้จักพี่นัท: ทำหลายโปรเจกต์พร้อมกัน | ให้ความสำคัญ passive income | ใช้ PARA method | คุย Telegram → ข้อความสั้นแปลว่าไว้ใจให้เดาบริบท

# Task: PARA Brain Capture Router. Return strict JSON only.
Now: ${nowText} (${timezone}) | ISO: ${now.toISOString()} | Source: ${source}
Msg: "${message}"${hasUrls ? `\nURLs: ${urls.join(', ')}` : ''}${urlMetaTitle ? `\nURL Title: "${urlMetaTitle}" (use this as the resource title)` : ''}${hints?.tags.length ? `\nUser tags: ${hints.tags.map(t => `#${t}`).join(' ')} (add to suggestedTags)` : ''}${hints?.areaHint ? `\nUser area hint: "${hints.areaHint}" (use as relatedAreaTitle if area exists)` : ''}
Dedup: dup=${dedup.isDuplicate}; reason=${dedup.reason}${dedup.matchedItemId ? `; id=${dedup.matchedItemId}` : ''}${isMetaQuestion ? `\nMeta-question detected: user is asking WHY/EXPLAIN. You MUST give a clear, informative explanation in chatResponse. Do NOT reply with just "รับทราบ". Explain what happened and what to do next.` : ''}

Rules:
1. CHITCHAT→operation=CHAT (no DB write). ACTIONABLE→map to PARA/finance/module.
2. URL RULE (CRITICAL): Any message containing a URL is ALWAYS actionable. Set isActionable=true, operation=CREATE, type=Resources. If user adds context like "Resource for X project" or "สำหรับโปรเจกต์ X" → set relatedProjectTitle=X. Never treat URL messages as CHITCHAT.
3. CAPABILITY QUESTION RULE (CRITICAL): If the message is asking WHETHER you CAN do something — patterns like "ทำได้มั้ย", "สามารถ...ได้มั้ย", "ได้ไหม", "can you", "is it possible" — this is a QUESTION, NOT a command. Set operation=CHAT, isActionable=false. Answer by confirming the capability and asking the user to confirm: "ได้เลยครับ ต้องการให้บันทึกเลยไหม?" Never auto-execute based on a capability question.
4. If operation=CHAT: never claim saved/created. Be honest about no DB write this turn. BUT if user asks WHY something didn't happen, explain clearly — don't just say "รับทราบ".
5. META-QUESTION rule: If user asks "ทำไม", "why", "explain", "อธิบาย" or any question about system behavior → operation=CHAT, isActionable=false, but chatResponse MUST contain a real explanation of what happened and how to fix it (2-4 sentences minimum). Never give a one-line non-answer.
6. Dedup: if isDuplicate=true, skip create unless user explicitly asks again.
7. Low confidence (<${CONFIDENCE_CONFIRM_THRESHOLD.toFixed(2)}): keep operation, data; system will confirm.
8. Reminder ("remind me/เตือน"): type=Tasks, dueDate=ISO8601+tz, title=action (not "remind me to..."), tag="reminder". Default 09:00 if no time given.
9. dueDate — Thai time expressions (ISO8601, timezone ${timezone}):
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
${accountsText ? `\nAccounts:\n${accountsText}` : ''}${modulesText ? `\nModules:\n${modulesText}` : ''}${customInstructions.length ? `\nCustom:\n${customInstructions.map((l, i) => `${i + 1}. ${l}`).join('\n')}` : ''}${memoryText}${learningsText}${sessionContextText}${sessionContextText ? `\nSession rule: If this message is short/ambiguous (no explicit project/area named) and a recent turn mentions a specific project, assume the same project. Override only if user names a different project.` : ''}`;
}

export function buildResponseSchema() {
  return {
    type: Type.OBJECT,
    properties: {
      intent: {
        type: Type.STRING,
        enum: [
          'CHITCHAT', 'ACTIONABLE_NOTE', 'PROJECT_IDEA', 'TASK_CAPTURE',
          'RESOURCE_CAPTURE', 'FINANCE_CAPTURE', 'COMPLETE_TASK', 'MODULE_CAPTURE'
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
      suggestedTags: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } },
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
      assumptions: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } },
      prerequisites: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } },
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
      nextActions: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } },
      clarifyingQuestions: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } },
      riskNotes: { type: Type.ARRAY, nullable: true, items: { type: Type.STRING } },
      recommendedProjectTitle: { type: Type.STRING, nullable: true },
      recommendedAreaTitle: { type: Type.STRING, nullable: true }
    },
    required: ['intent', 'confidence', 'isActionable', 'operation', 'chatResponse']
  };
}
