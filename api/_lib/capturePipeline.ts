// ─── Capture Pipeline — Orchestrator ─────────────────────────────────────────
// Entry point: coordinates all sub-modules to route a capture message to the
// correct PARA / finance / module write operation, or a conversational reply.
//
// Sub-modules:
//   captureTypes.ts   — types, interfaces, constants
//   captureUtils.ts   — pure functions: parsers, classifiers, coercions, routing
//   captureLoaders.ts — DB reads/writes: context, dedup, JAY memory/learning
//   capturePrompt.ts  — prompt builder + Gemini response schema

import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { runWithRetry } from './externalPolicy.js';

// ─── Re-export public surface ─────────────────────────────────────────────────
export type {
  CaptureSource, CaptureOperation, CaptureIntent, CaptureItemType,
  CapturePipelineInput, CapturePipelineResult
} from './captureTypes.js';

import {
  CapturePipelineInput, CapturePipelineResult, CaptureModelOutput,
  PARA_TYPE_TO_TABLE, CONFIDENCE_CONFIRM_THRESHOLD, ALFRED_AUTO_CAPTURE_ENABLED,
  CAPTURE_MODEL_NAME, WRITE_ACTION_TYPES
} from './captureTypes.js';

import {
  truncate, normalizeMessage, toIntent, toOperation, toSafeNumber,
  parseAmountShorthand, toSafeTags, toSafeStarterTasks, normalizeType,
  parseConfirmCommand, extractUrls, extractMessageHints,
  looksLikePlanningRequest, wantsAutoCapturePlan,
  looksLikeCapabilityQuestion, looksLikeMetaQuestion,
  responseClaimsWrite, resolveTravelAreaRouting, findByTitle,
  buildAlfredGuidanceText, buildPlanningTaskContent
} from './captureUtils.js';

import {
  loadCaptureContext, loadRuntimeCustomInstructions, loadRecentSessionContext,
  loadJayMemory, loadJayLearnings, writeJayMemory, writeJayLearning,
  detectDuplicateHints, fetchUrlTitle
} from './captureLoaders.js';

import { buildCapturePrompt, buildResponseSchema } from './capturePrompt.js';

// ─── AI model call ────────────────────────────────────────────────────────────

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

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function runCapturePipeline(input: CapturePipelineInput): Promise<CapturePipelineResult> {
  const timezone = input.timezone || 'Asia/Bangkok';
  const approvalGatesEnabled = input.approvalGatesEnabled === true;
  const ownerKey = process.env.AGENT_OWNER_KEY || 'default';
  const confirmCommand = parseConfirmCommand(input.userMessage);
  const forceConfirmed = confirmCommand.force;
  const message = normalizeMessage(confirmCommand.message);

  const urls = extractUrls(message);

  const [context, dedup, runtimeCustomInstructions, urlMetaTitle, recentContext, jayMemory, jayLearnings] = await Promise.all([
    loadCaptureContext(input.supabase),
    detectDuplicateHints({
      supabase: input.supabase,
      message,
      urls,
      geminiApiKey: input.geminiApiKey,
      excludeLogId: input.excludeLogId
    }),
    loadRuntimeCustomInstructions({ supabase: input.supabase, ownerKey }),
    urls.length > 0 ? fetchUrlTitle(urls[0]) : Promise.resolve(null),
    loadRecentSessionContext({
      supabase: input.supabase,
      source: input.source,
      excludeLogId: input.excludeLogId
    }),
    loadJayMemory(input.supabase),
    loadJayLearnings(input.supabase)
  ]);

  const hints = extractMessageHints(message);

  const prompt = buildCapturePrompt({
    message, source: input.source, timezone, context, dedup, urls,
    customInstructions: runtimeCustomInstructions,
    urlMetaTitle, hints, recentContext, jayMemory, jayLearnings
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
  const capabilityQuestion = looksLikeCapabilityQuestion(message);
  const autoCapturePlan = ALFRED_AUTO_CAPTURE_ENABLED && planningRequest && wantsAutoCapturePlan(message);

  if (!modelOutput.relatedProjectTitle && modelOutput.recommendedProjectTitle) {
    modelOutput.relatedProjectTitle = normalizeMessage(String(modelOutput.recommendedProjectTitle || ''));
  }
  if (!modelOutput.relatedAreaTitle && modelOutput.recommendedAreaTitle) {
    modelOutput.relatedAreaTitle = normalizeMessage(String(modelOutput.recommendedAreaTitle || ''));
  }

  const travelRouting = resolveTravelAreaRouting({ message, modelOutput, context });
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

  if (!isActionable && operation !== 'CHAT') operation = 'CHAT';

  if (capabilityQuestion && operation !== 'CHAT') {
    operation = 'CHAT';
    chatResponse = `ได้เลยครับ! ${chatResponse}\n\nต้องการให้บันทึกเลยไหมครับ? ถ้าใช่ พิมพ์ยืนยันมาได้เลย`;
  }

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

  if (confirmCommand.completeTarget) {
    operation = 'COMPLETE';
    if (!modelOutput.relatedItemId) {
      const foundByShortcut = findByTitle(context.tasks, confirmCommand.completeTarget);
      if (foundByShortcut?.id) {
        modelOutput.relatedItemId = foundByShortcut.id;
      } else if (!modelOutput.title) {
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

  if (operation === 'CHAT' && !metaQuestion && responseClaimsWrite(chatResponse)) {
    const saveHint =
      intent === 'RESOURCE_CAPTURE' ? 'บันทึกเรื่องนี้เป็น Resource'
      : intent === 'PROJECT_IDEA'   ? 'สร้าง Project: <ชื่อโปรเจกต์>'
      : 'สร้าง Task: <ชื่องาน>';
    chatResponse = [
      'รับทราบครับ ผมยังไม่ได้บันทึกลงฐานข้อมูลในรอบนี้',
      `ถ้าต้องการให้บันทึกทันที ให้พิมพ์: ${saveHint}`
    ].join('\n');
    chatWriteClaimSanitized = true;
  }

  if (operation === 'CHAT' && chatResponse.length <= 10 && !metaQuestion) {
    chatResponse = 'รับทราบครับ ถ้าต้องการให้บันทึกหรือสร้างรายการ ให้ระบุเพิ่มเติมได้เลย';
  }

  // ─── Early-exit guards ────────────────────────────────────────────────────

  if (dedup.isDuplicate && operation !== 'CHAT' && !forceConfirmed) {
    operation = 'CHAT';
    chatResponse = `ข้อมูลนี้ดูเหมือนเคยมีแล้ว (${dedup.reason}) ผมยังไม่สร้างรายการซ้ำให้นะครับ`;
    return { success: true, source: input.source, intent, confidence, isActionable: false, operation, chatResponse,
      actionType: 'SKIP_DUPLICATE', status: 'SKIPPED_DUPLICATE', dedup,
      meta: { dedupRecommendation: modelOutput.dedupRecommendation || 'DUPLICATE', requiresConfirmation: false, writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
    };
  }

  const requiresConfirmation = !forceConfirmed && operation !== 'CHAT' && isActionable && confidence < CONFIDENCE_CONFIRM_THRESHOLD;
  if (requiresConfirmation) {
    const suggestedTitle = String(modelOutput.title || truncate(message, 80));
    const pendingMsg = [`${chatResponse}`, '', `ผมยังไม่บันทึกทันที เพราะความมั่นใจยังต่ำ (${Math.round(confidence * 100)}%).`,
      `ถ้าต้องการให้สร้างตอนนี้ ให้พิมพ์: ยืนยัน: ${suggestedTitle}`].join('\n');
    return { success: true, source: input.source, intent, confidence, isActionable, operation,
      chatResponse: pendingMsg, actionType: 'NEEDS_CONFIRMATION', status: 'PENDING', dedup,
      meta: { requiresConfirmation: true, suggestedTitle, confirmThreshold: CONFIDENCE_CONFIRM_THRESHOLD, writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
    };
  }

  if (approvalGatesEnabled && ['TRANSACTION', 'MODULE_ITEM', 'COMPLETE'].includes(operation)) {
    return { success: true, source: input.source, intent, confidence, isActionable, operation,
      chatResponse: `${chatResponse}\n\n⚠️ Action requires approval and was not executed automatically.`,
      actionType: 'PENDING_APPROVAL', status: 'PENDING', dedup,
      meta: { requestedOperation: operation, writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
    };
  }

  if (modelOutput.askForParent && operation === 'CREATE' && !forceConfirmed) {
    const question = String(modelOutput.clarifyingQuestion || modelOutput.chatResponse || '').trim()
      || `ควรให้ "${String(modelOutput.title || truncate(message, 60))}" อยู่ใน Project หรือ Area ไหนครับ?`;
    return { success: true, source: input.source, intent, confidence, isActionable, operation,
      chatResponse: question, actionType: 'NEEDS_PARENT_CLARIFICATION', status: 'PENDING', dedup,
      meta: { requiresConfirmation: true, suggestedTitle: String(modelOutput.title || truncate(message, 80)), writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
    };
  }

  // ─── DB write operations ──────────────────────────────────────────────────

  try {
    const nowIso = new Date().toISOString();
    const baseTitle = String(modelOutput.title || '').trim() || truncate(message, 80);
    const baseCategory = String(modelOutput.category || '').trim() || 'Inbox';
    const routeTags = toSafeTags(travelRouting.extraTags || []);
    const tags = Array.from(new Set([...toSafeTags(modelOutput.suggestedTags), ...routeTags])).slice(0, 12);

    if (operation === 'CHAT') {
      return { success: true, source: input.source, intent, confidence, isActionable, operation, chatResponse,
        actionType: alfredGuidance ? 'CHAT_WITH_GUIDANCE' : 'CHAT', status: 'SUCCESS', dedup,
        meta: { planningRequest, guidanceIncluded: Boolean(alfredGuidance), travelRouting, writeExecuted: false, chatWriteClaimSanitized, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
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
            const projectList = context.projects.slice(0, 8).map(p => `"${p.title}"`).join(', ');
            const clarifyMsg = [
              `หา project "${modelOutput.relatedProjectTitle}" ไม่เจอครับ`,
              projectList ? `Project ที่มีอยู่: ${projectList}` : '',
              `ถ้าชื่อถูกต้องและต้องการสร้าง project ใหม่ พิมพ์: ยืนยัน: ${input.userMessage}`,
              `หรือระบุชื่อ project ที่ถูกต้องมาใหม่ได้เลยครับ`
            ].filter(Boolean).join('\n');
            return { success: true, source: input.source, intent, confidence, isActionable, operation,
              chatResponse: clarifyMsg, actionType: 'NEEDS_PROJECT_CLARIFICATION', status: 'PENDING', dedup,
              meta: { requiresConfirmation: true, suggestedTitle: baseTitle, requestedProject: modelOutput.relatedProjectTitle, writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
            };
          }
        }

        if (relatedItemIds.length === 0 && (modelOutput.createProjectIfMissing || modelOutput.relatedProjectTitle)) {
          const targetProjectTitle = String(modelOutput.relatedProjectTitle || '').trim();
          if (targetProjectTitle) {
            const existingProject = findByTitle(context.projects, targetProjectTitle);
            if (existingProject?.id) {
              relatedItemIds = [existingProject.id];
            } else {
              const areaForProject = findByTitle(context.areas, modelOutput.relatedAreaTitle || baseCategory)
                || findByTitle(context.areas, baseCategory);
              const projectPayload: any = {
                id: uuidv4(), title: targetProjectTitle, type: 'Projects',
                category: String(modelOutput.relatedAreaTitle || areaForProject?.title || baseCategory || 'General'),
                content: `Auto-created from capture: ${truncate(message, 220)}`,
                tags: Array.from(new Set(['auto-capture', 'project', ...tags])),
                related_item_ids: areaForProject?.id ? [areaForProject.id] : [],
                is_completed: false, created_at: nowIso, updated_at: nowIso
              };
              const projectInsert = await input.supabase.from('projects').insert(projectPayload).select().single();
              if (projectInsert.error) throw new Error(projectInsert.error.message);
              const autoProject = projectInsert.data;
              relatedItemIds = autoProject?.id ? [autoProject.id] : [];
              if (autoProject) createdItems.push(autoProject);
            }
          }
        }

        if (relatedItemIds.length === 0 && modelOutput.relatedAreaTitle) {
          const area = findByTitle(context.areas, modelOutput.relatedAreaTitle);
          if (area?.id) relatedItemIds = [area.id];
        }

        const taskPayload: any = {
          id: uuidv4(), title: baseTitle, type: 'Tasks', category: baseCategory,
          content: buildPlanningTaskContent({ message, modelOutput, fallbackSummary: String(modelOutput.summary || message) }),
          tags, related_item_ids: relatedItemIds, is_completed: false, created_at: nowIso, updated_at: nowIso
        };
        if (modelOutput.dueDate && String(modelOutput.dueDate).includes('T')) {
          taskPayload.due_date = modelOutput.dueDate;
        } else {
          const tz = input.timezone || 'Asia/Bangkok';
          const defaultDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          const parts = defaultDue.toLocaleDateString('en-CA', { timeZone: tz }).split('-');
          taskPayload.due_date = `${parts[0]}-${parts[1]}-${parts[2]}T09:00:00`;
        }

        const insert = await input.supabase.from(table).insert(taskPayload).select().single();
        if (insert.error) throw new Error(insert.error.message);
        createdItems.push(insert.data);

        void (async () => {
          const projName = String(modelOutput.relatedProjectTitle || '').trim();
          if (projName) {
            await writeJayMemory(input.supabase, {
              key: `preferred_project_for_${intent.toLowerCase()}`,
              value: projName, category: 'project_context', confidence: confidence, source: 'inferred_from_capture'
            });
          }
          await writeJayLearning(input.supabase, {
            lesson: `บันทึก Task "${baseTitle}" สำเร็จ → project: ${projName || 'none'}, area: ${String(modelOutput.relatedAreaTitle || '').trim() || 'none'}`,
            triggerMessage: message, outcome: 'confirmation', category: 'routing'
          });
        })();

        return { success: true, source: input.source, intent, confidence, isActionable, operation, chatResponse,
          itemType: 'PARA', createdItem: createdItems.length === 1 ? createdItems[0] : null,
          createdItems: createdItems.length > 1 ? createdItems : undefined,
          actionType: 'CREATE_PARA', status: 'SUCCESS', dedup,
          meta: { table, paraType, autoProjectCreated: createdItems.length > 1, forceConfirmed, planningRequest, autoCapturePlan, guidanceIncluded: Boolean(alfredGuidance), travelRouting, writeExecuted: true, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
        };
      }

      // Projects / Resources / Areas
      let nonTaskRelatedIds: string[] = [];
      if (modelOutput.relatedItemId) {
        nonTaskRelatedIds = [String(modelOutput.relatedItemId)];
      } else if (paraType === 'Projects') {
        const areaLookup = modelOutput.relatedAreaTitle || modelOutput.category || baseCategory;
        const linkedArea = findByTitle(context.areas, areaLookup);
        if (linkedArea?.id) nonTaskRelatedIds = [linkedArea.id];
      } else if (paraType === 'Resources') {
        if (modelOutput.relatedProjectTitle) {
          const project = findByTitle(context.projects, modelOutput.relatedProjectTitle);
          if (project?.id) {
            nonTaskRelatedIds = [project.id];
          } else if (!forceConfirmed) {
            const projectList = context.projects.slice(0, 8).map(p => `"${p.title}"`).join(', ');
            const clarifyMsg = [
              `หา project "${modelOutput.relatedProjectTitle}" ไม่เจอครับ`,
              projectList ? `Project ที่มีอยู่: ${projectList}` : '',
              `ถ้าชื่อถูกต้อง พิมพ์: ยืนยัน: ${input.userMessage}`,
              `หรือระบุชื่อ project ที่ถูกต้องมาใหม่ได้เลยครับ`
            ].filter(Boolean).join('\n');
            return { success: true, source: input.source, intent, confidence, isActionable, operation,
              chatResponse: clarifyMsg, actionType: 'NEEDS_PROJECT_CLARIFICATION', status: 'PENDING', dedup,
              meta: { requiresConfirmation: true, suggestedTitle: baseTitle, requestedProject: modelOutput.relatedProjectTitle, writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
            };
          }
        }
        if (nonTaskRelatedIds.length === 0 && modelOutput.relatedAreaTitle) {
          const area = findByTitle(context.areas, modelOutput.relatedAreaTitle);
          if (area?.id) nonTaskRelatedIds = [area.id];
        }
      }

      const payload: any = {
        id: uuidv4(), title: baseTitle, type: paraType,
        category: String(modelOutput.relatedAreaTitle || baseCategory),
        content: String(modelOutput.summary || message),
        tags, related_item_ids: nonTaskRelatedIds, is_completed: false, created_at: nowIso, updated_at: nowIso
      };
      if (paraType === 'Areas') { payload.name = baseTitle; payload.category = baseCategory; }

      const insert = await input.supabase.from(table).insert(payload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      void (async () => {
        await writeJayLearning(input.supabase, {
          lesson: `บันทึก ${paraType} "${baseTitle}" สำเร็จ → area: ${String(modelOutput.relatedAreaTitle || '').trim() || 'none'}`,
          triggerMessage: message, outcome: 'confirmation', category: 'routing'
        });
      })();

      return { success: true, source: input.source, intent, confidence, isActionable, operation, chatResponse,
        itemType: 'PARA', createdItem: insert.data, actionType: 'CREATE_PARA', status: 'SUCCESS', dedup,
        meta: { table, paraType, forceConfirmed, planningRequest, guidanceIncluded: Boolean(alfredGuidance), travelRouting, writeExecuted: true, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
      };
    }

    if (operation === 'TRANSACTION') {
      const targetAccountId = modelOutput.accountId || context.accounts?.[0]?.id || null;
      if (!targetAccountId) {
        return { success: false, source: input.source, intent, confidence, isActionable, operation,
          chatResponse: '⚠️ หาบัญชีไม่เจอครับ', actionType: 'ERROR', status: 'FAILED', dedup,
          meta: { reason: 'ACCOUNT_NOT_FOUND', writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
        };
      }

      const txPayload = {
        id: uuidv4(), description: baseTitle,
        amount: parseAmountShorthand(modelOutput.amount) ?? toSafeNumber(modelOutput.amount, 0),
        type: modelOutput.transactionType || 'EXPENSE',
        category: baseCategory || 'General',
        account_id: targetAccountId, transaction_date: nowIso
      };

      const insert = await input.supabase.from('transactions').insert(txPayload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      void (async () => {
        const txType = String(modelOutput.transactionType || 'EXPENSE');
        await writeJayLearning(input.supabase, {
          lesson: `บันทึก Transaction "${baseTitle}" amount=${txPayload.amount} type=${txType} category=${baseCategory}`,
          triggerMessage: message, outcome: 'confirmation', category: 'finance'
        });
        if (baseCategory && baseCategory !== 'General' && baseCategory !== 'Inbox') {
          await writeJayMemory(input.supabase, {
            key: `finance_category_${txType.toLowerCase()}`,
            value: baseCategory, category: 'finance', confidence: 0.7, source: 'inferred_from_transaction'
          });
        }
      })();

      return { success: true, source: input.source, intent, confidence, isActionable, operation, chatResponse,
        itemType: 'TRANSACTION', createdItem: insert.data, actionType: 'CREATE_TX', status: 'SUCCESS', dedup,
        meta: { table: 'transactions', forceConfirmed, writeExecuted: true, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
      };
    }

    if (operation === 'MODULE_ITEM') {
      if (!modelOutput.targetModuleId) {
        return { success: false, source: input.source, intent, confidence, isActionable, operation,
          chatResponse: '⚠️ ไม่พบโมดูลเป้าหมายสำหรับบันทึกข้อมูล', actionType: 'ERROR', status: 'FAILED', dedup,
          meta: { reason: 'MODULE_TARGET_MISSING', writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
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
        id: uuidv4(), module_id: modelOutput.targetModuleId,
        title: baseTitle || 'Entry', data: moduleData, tags, created_at: nowIso, updated_at: nowIso
      };

      const insert = await input.supabase.from('module_items').insert(modulePayload).select().single();
      if (insert.error) throw new Error(insert.error.message);

      return { success: true, source: input.source, intent, confidence, isActionable, operation, chatResponse,
        itemType: 'MODULE', createdItem: insert.data, actionType: 'CREATE_MODULE', status: 'SUCCESS', dedup,
        meta: { table: 'module_items', forceConfirmed, writeExecuted: true, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
      };
    }

    if (operation === 'COMPLETE') {
      let targetTaskId = modelOutput.relatedItemId || '';
      if (!targetTaskId && baseTitle) {
        const foundTask = findByTitle(context.tasks, baseTitle);
        if (foundTask?.id) targetTaskId = foundTask.id;
      }

      if (!targetTaskId) {
        return { success: true, source: input.source, intent, confidence, isActionable, operation: 'CHAT',
          chatResponse: 'ยังหา task ที่จะ complete ไม่เจอครับ ลองระบุชื่องานอีกครั้ง',
          actionType: 'COMPLETE_TASK_NOT_FOUND', status: 'SUCCESS', dedup,
          meta: { requestedOperation: 'COMPLETE', writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
        };
      }

      const update = await input.supabase.from('tasks')
        .update({ is_completed: true, updated_at: nowIso })
        .eq('id', targetTaskId).select().single();
      if (update.error) throw new Error(update.error.message);

      void (async () => {
        await writeJayLearning(input.supabase, {
          lesson: `Task completed: "${baseTitle}" — user used "เสร็จ" shortcut`,
          triggerMessage: message, outcome: 'confirmation', category: 'routing'
        });
      })();

      return { success: true, source: input.source, intent, confidence, isActionable, operation, chatResponse,
        itemType: 'PARA', createdItem: update.data, actionType: 'COMPLETE_TASK', status: 'SUCCESS', dedup,
        meta: { table: 'tasks', forceConfirmed, writeExecuted: true, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
      };
    }

    // Fallback
    return { success: true, source: input.source, intent, confidence, isActionable, operation: 'CHAT', chatResponse,
      actionType: 'CHAT', status: 'SUCCESS', dedup,
      meta: { writeExecuted: false, chatWriteClaimSanitized, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
    };

  } catch (error: any) {
    return { success: false, source: input.source, intent, confidence, isActionable, operation,
      chatResponse: 'ระบบขัดข้องชั่วคราวครับ', actionType: 'ERROR', status: 'FAILED', dedup,
      meta: { reason: 'PIPELINE_EXCEPTION', error: error?.message || 'Unknown error', writeExecuted: false, dedupExactMessageNoWriteIgnored: Boolean(dedup.exactMessageNoWriteIgnored) }
    };
  }
}

// ─── Log payload serializer ───────────────────────────────────────────────────

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
