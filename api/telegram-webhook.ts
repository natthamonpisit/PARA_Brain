import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { runWithRetry } from './_lib/externalPolicy';
import { sendTelegramText } from './_lib/telegram';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

function verifyTelegramSecret(req: any): boolean {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  const provided = req.headers?.['x-telegram-bot-api-secret-token'];
  return String(provided || '') === expected;
}

function getTextMessage(update: any) {
  const message = update?.message || update?.edited_message;
  if (!message || typeof message?.text !== 'string') return null;
  return {
    updateId: String(update?.update_id || ''),
    messageId: Number(message?.message_id || 0),
    chatId: String(message?.chat?.id || ''),
    userId: String(message?.from?.id || ''),
    text: String(message.text || '').trim()
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const allowedUserId = process.env.TELEGRAM_USER_ID;
    const allowedChatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken) {
      return res.status(500).json({ error: 'Missing TELEGRAM_BOT_TOKEN' });
    }
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Missing Supabase credentials' });
    }
    if (!verifyTelegramSecret(req)) {
      return res.status(401).json({ error: 'Invalid webhook secret' });
    }

    const incoming = getTextMessage(req.body);
    if (!incoming) {
      return res.status(200).json({ success: true, message: 'Ignored non-text update' });
    }

    if (allowedUserId && incoming.userId !== String(allowedUserId)) {
      return res.status(200).json({ success: true, message: 'Ignored unauthorized user' });
    }
    if (allowedChatId && incoming.chatId !== String(allowedChatId)) {
      return res.status(200).json({ success: true, message: 'Ignored unauthorized chat' });
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!);

    if (incoming.text.toLowerCase() === 'id') {
      await sendTelegramText({
        botToken,
        chatId: incoming.chatId,
        text: `user_id=${incoming.userId}\nchat_id=${incoming.chatId}`,
        replyToMessageId: incoming.messageId
      });
      return res.status(200).json({ success: true });
    }

    const eventId = incoming.updateId || `${incoming.chatId}:${incoming.messageId}`;
    const { data: existingLog } = await supabase
      .from('system_logs')
      .select('id')
      .eq('event_id', eventId)
      .maybeSingle();
    if (existingLog) {
      return res.status(200).json({ success: true, message: 'Duplicate ignored' });
    }

    const { data: newLog, error: logError } = await supabase
      .from('system_logs')
      .insert({
        event_source: 'TELEGRAM',
        event_id: eventId,
        user_message: incoming.text,
        status: 'PROCESSING',
        action_type: 'THINKING'
      })
      .select()
      .single();
    if (logError) {
      return res.status(500).json({ error: logError.message });
    }

    await processSmartAgentRequest({
      userMessage: incoming.text,
      botToken,
      chatId: incoming.chatId,
      replyToMessageId: incoming.messageId,
      logId: newLog.id,
      supabase
    });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[telegram-webhook] failed', error);
    return res.status(500).json({ error: error.message || 'Internal error' });
  }
}

async function processSmartAgentRequest(params: {
  userMessage: string;
  botToken: string;
  chatId: string;
  replyToMessageId: number;
  logId: string;
  supabase: any;
}) {
  const { userMessage, botToken, chatId, replyToMessageId, logId, supabase } = params;
  const apiKey = process.env.GEMINI_API_KEY;
  const approvalGatesEnabled = process.env.ENABLE_APPROVAL_GATES === 'true';

  const updateLog = async (action: string, status: string, response: string) => {
    await supabase
      .from('system_logs')
      .update({
        ai_response: response,
        action_type: action,
        status
      })
      .eq('id', logId);
  };

  const safeReply = async (text: string) => {
    await sendTelegramText({
      botToken,
      chatId,
      text,
      replyToMessageId
    });
  };

  if (!apiKey) {
    await safeReply('⚠️ Server Error: API Key missing.');
    return;
  }

  try {
    const msgLower = userMessage.toLowerCase();
    const isFinanceRelated = /money|baht|bath|บาท|จ่าย|ซื้อ|โอน|income|expense|cost|price|฿/.test(msgLower);
    const isTaskRelated = /task|job|project|remind|งาน|โปรเจ|จำ|ลืม|ทำ/.test(msgLower);

    const accountsPromise = isFinanceRelated
      ? supabase.from('accounts').select('id, name').limit(10)
      : Promise.resolve({ data: [] });
    const modulesPromise = supabase.from('modules').select('id, name, schema_config');
    const itemsPromise = isTaskRelated
      ? supabase.from('projects').select('id, title, type').limit(20)
      : Promise.resolve({ data: [] });

    const [{ data: accounts }, { data: modules }, { data: existingProjects }] = await Promise.all([
      accountsPromise,
      modulesPromise,
      itemsPromise
    ]);

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        operation: {
          type: Type.STRING,
          enum: ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT'],
          description: 'Action type.'
        },
        chatResponse: { type: Type.STRING, description: 'Short Thai response.' },
        title: { type: Type.STRING },
        category: { type: Type.STRING },
        type: { type: Type.STRING, enum: ['Tasks', 'Projects', 'Resources', 'Areas'], nullable: true },
        content: { type: Type.STRING, nullable: true },
        relatedItemId: { type: Type.STRING, nullable: true, description: 'ID of parent Project/Area if found in context.' },
        suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        dueDate: { type: Type.STRING, nullable: true, description: 'ISO 8601 timestamp' },
        amount: { type: Type.NUMBER, nullable: true },
        transactionType: { type: Type.STRING, enum: ['INCOME', 'EXPENSE', 'TRANSFER'], nullable: true },
        accountId: { type: Type.STRING, nullable: true },
        targetModuleId: { type: Type.STRING, nullable: true },
        moduleDataRaw: {
          type: Type.ARRAY,
          nullable: true,
          items: {
            type: Type.OBJECT,
            properties: { key: { type: Type.STRING }, value: { type: Type.STRING } },
            required: ['key', 'value']
          }
        }
      },
      required: ['operation', 'chatResponse']
    };

    const ai = new GoogleGenAI({ apiKey });
    const projectsList = existingProjects?.length
      ? existingProjects.map((p: any) => `Project:${p.title}(ID:${p.id})`).join('\n')
      : '';
    const now = new Date();
    const timeContext = `Current Date/Time: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (ISO: ${now.toISOString()})`;

    const prompt = `
Role: "Jay" (Life OS). User: "${userMessage}"

${timeContext}

CONTEXT:
${projectsList ? `[Existing Projects]\n${projectsList}` : ''}

Detect: CREATE, TRANSACTION, MODULE_ITEM, COMPLETE, or CHAT.

RULES:
1. If user wants to add task to a project, put Project ID in 'relatedItemId'.
2. If user specifies time (e.g. tonight, tomorrow 9am), convert to strict ISO 8601.
3. Reply in concise Thai.
`;

    const result = await runWithRetry(() =>
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema
        }
      })
    );

    const rawJSON = JSON.parse(result.text || '{}');
    const {
      operation,
      chatResponse,
      title,
      category,
      type,
      content,
      amount,
      transactionType,
      accountId,
      targetModuleId,
      moduleDataRaw,
      relatedItemId,
      suggestedTags,
      dueDate
    } = rawJSON;

    if (approvalGatesEnabled && ['TRANSACTION', 'MODULE_ITEM', 'COMPLETE'].includes(operation)) {
      const pendingMsg = `${chatResponse}\n\n⚠️ Action requires approval and was not executed automatically.`;
      await safeReply(pendingMsg);
      await updateLog('PENDING_APPROVAL', 'PENDING', pendingMsg);
      return;
    }

    let dbPromise = Promise.resolve<{ error: any; data?: any } | null>(null);
    let logAction = 'CHAT';

    if (operation === 'CREATE') {
      logAction = 'CREATE_PARA';
      let tableName = 'tasks';
      if (type === 'Projects') tableName = 'projects';
      else if (type === 'Areas') tableName = 'areas';
      else if (type === 'Resources') tableName = 'resources';
      else if (type === 'Archives') tableName = 'archives';

      const payload: any = {
        id: uuidv4(),
        title: title || userMessage,
        category: category || 'Inbox',
        type: type || 'Tasks',
        content: content || '',
        is_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: suggestedTags || [],
        related_item_ids: relatedItemId ? [relatedItemId] : []
      };
      if (tableName === 'tasks' && dueDate && String(dueDate).includes('T')) {
        payload.due_date = dueDate;
      }
      dbPromise = supabase.from(tableName).insert(payload).select();
    } else if (operation === 'TRANSACTION') {
      logAction = 'CREATE_TX';
      const targetAcc = accountId || (accounts && accounts.length > 0 ? accounts[0].id : null);
      if (!targetAcc) {
        await safeReply('⚠️ หาบัญชีไม่เจอครับ');
        return;
      }
      dbPromise = supabase
        .from('transactions')
        .insert({
          id: uuidv4(),
          description: title || userMessage,
          amount,
          type: transactionType,
          category: category || 'General',
          account_id: targetAcc,
          transaction_date: new Date().toISOString()
        })
        .select();
    } else if (operation === 'MODULE_ITEM') {
      logAction = 'CREATE_MODULE';
      if (targetModuleId) {
        const moduleData: Record<string, any> = {};
        if (moduleDataRaw && Array.isArray(moduleDataRaw)) {
          moduleDataRaw.forEach((item: any) => {
            let value: any = item.value;
            if (!isNaN(Number(item.value)) && String(item.value).trim() !== '') value = Number(item.value);
            moduleData[item.key] = value;
          });
        }
        dbPromise = supabase
          .from('module_items')
          .insert({
            id: uuidv4(),
            module_id: targetModuleId,
            title: title || 'Entry',
            data: moduleData,
            created_at: new Date().toISOString()
          })
          .select();
      }
    } else if (operation === 'COMPLETE') {
      logAction = 'COMPLETE_TASK';
      if (relatedItemId) {
        dbPromise = supabase.from('tasks').update({ is_completed: true }).eq('id', relatedItemId).select();
      }
    }

    const dbResult = await dbPromise;
    if (dbResult && dbResult.error) {
      const errorMsg = `บันทึกไม่สำเร็จ: ${dbResult.error.message}`;
      await safeReply(errorMsg);
      await updateLog('ERROR', 'DB_FAILED', dbResult.error.message);
      return;
    }

    await safeReply(chatResponse || 'รับทราบครับ');
    await updateLog(logAction, 'SUCCESS', chatResponse || '');
  } catch (error: any) {
    console.error('[telegram-webhook] AI logic failed', error);
    await safeReply('ระบบขัดข้องชั่วคราวครับ');
    await updateLog('ERROR', 'FAILED', error.message || 'Unknown error');
  }
}

