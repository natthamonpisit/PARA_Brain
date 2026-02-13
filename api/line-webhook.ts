
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { fetchWithTimeoutRetry, runWithRetry } from './_lib/externalPolicy';

// Initialize Services
const supabaseUrl = process.env.VITE_SUPABASE_URL;
// Priority: Try to use Service Role Key (for backend bypass) -> Fallback to Anon Key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req: any, res: any) {
  // 1. Method Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      console.error("❌ MISSING: LINE_CHANNEL_SECRET");
      return res.status(500).json({ error: "Server Config Error" });
    }

    if (!verifyLineSignature(req, channelSecret)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const { events } = req.body;
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const authorizedUserId = process.env.LINE_USER_ID;
    if (!supabaseUrl || !supabaseKey) {
      console.error("❌ MISSING: Supabase credentials");
      return res.status(500).json({ error: "Server Config Error" });
    }

    // Use Supabase instance inside handler to ensure freshness
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    if (!channelAccessToken) {
        console.error("❌ MISSING: LINE_CHANNEL_ACCESS_TOKEN");
        return res.status(500).json({ error: "Server Config Error" });
    }

    if (!events || events.length === 0) {
      return res.status(200).json({ message: 'No events' });
    }

    // 2. Process Events Loop
    await Promise.all(events.map(async (event: any) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        const userMessage = event.message.text.trim();
        const eventId = event.webhookEventId;

        console.log(`📩 Message from ${userId}: ${userMessage}`);

        // --- SECURITY CHECK ---
        if (authorizedUserId && userId !== authorizedUserId) {
            console.warn(`⛔ Unauthorized access attempt from: ${userId}`);
            return;
        }

        // --- COMMAND HANDLERS ---
        if (userMessage.toLowerCase() === 'id') {
            await replyToLine(replyToken, channelAccessToken, `Your User ID is:\n${userId}`);
            return;
        }

        // --- IDEMPOTENCY CHECK ---
        const { data: existingLog } = await supabase
            .from('system_logs')
            .select('id')
            .eq('event_id', eventId)
            .maybeSingle();

        if (existingLog) return;

        // --- LOCK THE EVENT ---
        const { data: newLog, error: logError } = await supabase.from('system_logs').insert({
            event_source: 'LINE',
            event_id: eventId,
            user_message: userMessage,
            status: 'PROCESSING',
            action_type: 'THINKING'
        }).select().single();

        if (logError) {
             console.error("Failed to lock event:", logError);
             return; 
        }

        // --- EXECUTE AI BRAIN ---
        await processSmartAgentRequest(userMessage, replyToken, channelAccessToken, newLog.id, supabase);
      }
    }));

    return res.status(200).json({ success: true });

  } catch (error: any) {
    console.error("Webhook Critical Error:", error);
    return res.status(500).json({ error: error.message });
  }
}

function verifyLineSignature(req: any, channelSecret: string): boolean {
  const signature = req.headers['x-line-signature'] || req.headers['X-Line-Signature'];
  if (!signature || typeof signature !== 'string') return false;

  const rawBody =
    req.rawBody ||
    (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

  const digest = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');

  try {
    const sigBuf = Buffer.from(signature);
    const digestBuf = Buffer.from(digest);
    if (sigBuf.length !== digestBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, digestBuf);
  } catch {
    return false;
  }
}

// --- SMART AGENT LOGIC ---

async function processSmartAgentRequest(
    userMessage: string, 
    replyToken: string, 
    accessToken: string, 
    logId: string,
    supabase: any
) {
    const apiKey = process.env.GEMINI_API_KEY;
    const approvalGatesEnabled = process.env.ENABLE_APPROVAL_GATES === 'true';

    const updateLog = async (action: string, status: string, response: string) => {
        supabase.from('system_logs').update({
            ai_response: response,
            action_type: action,
            status: status
        }).eq('id', logId).then(() => {}); 
    };

    if (!apiKey) {
        await replyToLine(replyToken, accessToken, "⚠️ Server Error: API Key missing.");
        return;
    }

    try {
        // --- 1. SMART CONTEXT LOADING ---
        const msgLower = userMessage.toLowerCase();
        const isFinanceRelated = /money|baht|bath|บาท|จ่าย|ซื้อ|โอน|income|expense|cost|price|฿/.test(msgLower);
        const isTaskRelated = /task|job|project|remind|งาน|โปรเจ|จำ|ลืม|ทำ/.test(msgLower);
        
        // Load Context
        const accountsPromise = isFinanceRelated 
            ? supabase.from('accounts').select('id, name').limit(10) 
            : Promise.resolve({ data: [] });
        const modulesPromise = supabase.from('modules').select('id, name, schema_config');
        
        // JAY: Load both Tasks AND Projects to allow linking
        const itemsPromise = isTaskRelated 
            ? supabase.from('projects').select('id, title, type').limit(20) // Load projects to link tasks
            : Promise.resolve({ data: [] });

        const [
            { data: accounts }, 
            { data: modules }, 
            { data: existingProjects }
        ] = await Promise.all([accountsPromise, modulesPromise, itemsPromise]);

        // --- 2. BUILD PROMPT ---
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                operation: {
                    type: Type.STRING,
                    enum: ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT'],
                    description: "Action type."
                },
                chatResponse: { type: Type.STRING, description: "Short Thai response." },
                
                // PARA Fields
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['Tasks', 'Projects', 'Resources', 'Areas'], nullable: true },
                content: { type: Type.STRING, nullable: true },
                relatedItemId: { type: Type.STRING, nullable: true, description: "ID of the PARENT Project/Area if found in context." },
                suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                dueDate: { type: Type.STRING, nullable: true, description: "Full ISO 8601 Timestamp (YYYY-MM-DDTHH:mm:ssZ)" },

                // Finance
                amount: { type: Type.NUMBER, nullable: true },
                transactionType: { type: Type.STRING, enum: ['INCOME', 'EXPENSE', 'TRANSFER'], nullable: true },
                accountId: { type: Type.STRING, nullable: true },

                // Module
                targetModuleId: { type: Type.STRING, nullable: true },
                moduleDataRaw: { 
                    type: Type.ARRAY, 
                    nullable: true,
                    items: {
                        type: Type.OBJECT,
                        properties: { key: { type: Type.STRING }, value: { type: Type.STRING } },
                        required: ["key", "value"]
                    }
                },
            },
            required: ["operation", "chatResponse"]
        };

        const ai = new GoogleGenAI({ apiKey });
        
        // Format Context
        const projectsList = existingProjects?.length ? existingProjects.map((p: any) => `Project:${p.title}(ID:${p.id})`).join('\n') : "";
        const accountsList = accounts?.length ? accounts.map((a: any) => `${a.name}(ID:${a.id})`).join('\n') : "";
        
        // JAY: ADD TIME CONTEXT (Crucial for relative time parsing like "Tomorrow 7pm")
        const now = new Date();
        const timeContext = `Current Date/Time: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (ISO Reference: ${now.toISOString()})`;

        const prompt = `
        Role: "Jay" (Life OS). User: "${userMessage}"
        
        ${timeContext}

        CONTEXT:
        ${projectsList ? `[Existing Projects]\n${projectsList}` : ''}
        ${accountsList ? `[Accounts]\n${accountsList}` : ''}

        Detect: CREATE, TRANSACTION, MODULE_ITEM, COMPLETE, or CHAT.
        
        RULES:
        1. If user wants to add task to a project, put Project ID in 'relatedItemId'.
        2. 'dueDate': If user specifies time (e.g. "tonight", "tomorrow 9am"), you MUST convert it to strict ISO 8601 format (YYYY-MM-DDTHH:mm:ssZ) relative to Current Date/Time. 
           Example: User says "19:00", you return "2024-05-10T19:00:00+07:00" (Full Timestamp). Do NOT return just "19:00".
        3. Reply: Thai, Concise.
        `;

        const result = await runWithRetry(() => ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        }));

        const rawJSON = JSON.parse(result.text || "{}");
        const { operation, chatResponse, title, category, type, content, amount, transactionType, accountId, targetModuleId, moduleDataRaw, relatedItemId, suggestedTags, dueDate } = rawJSON;

        if (approvalGatesEnabled && ['TRANSACTION', 'MODULE_ITEM', 'COMPLETE'].includes(operation)) {
            const pendingMsg = `${chatResponse}\n\n⚠️ Action requires approval and was not executed automatically.`;
            await replyToLine(replyToken, accessToken, pendingMsg);
            await updateLog('PENDING_APPROVAL', 'PENDING', pendingMsg);
            return;
        }

        // --- 3. EXECUTE ACTION ---
        let dbPromise = Promise.resolve<{error: any, data?: any} | null>(null);
        let logAction = 'CHAT';

        if (operation === 'CREATE') {
            logAction = 'CREATE_PARA';
            let tableName = 'tasks';
            if (type === 'Projects') tableName = 'projects';
            else if (type === 'Areas') tableName = 'areas';
            else if (type === 'Resources') tableName = 'resources';
            else if (type === 'Archives') tableName = 'archives';

            // JAY: Prepare Payload properly
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
                related_item_ids: relatedItemId ? [relatedItemId] : [] // Fix: Wrap in array
            };

            if (tableName === 'tasks' && dueDate) {
                // Safeguard: Verify date format briefly, though AI should handle it now
                if (dueDate.includes('T')) {
                    payload.due_date = dueDate;
                } else {
                    console.warn("AI returned invalid date format, skipping due_date:", dueDate);
                }
            }

            // JAY FIX: Add .select() to ensure we get data back and catch RLS errors immediately
            dbPromise = supabase.from(tableName).insert(payload).select();

        } else if (operation === 'TRANSACTION') {
            logAction = 'CREATE_TX';
            const targetAcc = accountId || (accounts && accounts.length > 0 ? accounts[0].id : null);
            if (targetAcc) {
                dbPromise = supabase.from('transactions').insert({
                    id: uuidv4(),
                    description: title || userMessage,
                    amount: amount,
                    type: transactionType,
                    category: category || 'General',
                    account_id: targetAcc,
                    transaction_date: new Date().toISOString()
                }).select();
            } else {
                await replyToLine(replyToken, accessToken, "⚠️ หาบัญชีไม่เจอครับ");
                return;
            }

        } else if (operation === 'MODULE_ITEM') {
            logAction = 'CREATE_MODULE';
            if (targetModuleId) {
                let moduleData: Record<string, any> = {};
                if (moduleDataRaw && Array.isArray(moduleDataRaw)) {
                    moduleDataRaw.forEach((item: any) => {
                         let val: any = item.value;
                         if (!isNaN(Number(item.value)) && item.value.trim() !== '') val = Number(item.value);
                         moduleData[item.key] = val;
                    });
                }
                dbPromise = supabase.from('module_items').insert({
                    id: uuidv4(),
                    module_id: targetModuleId,
                    title: title || "Entry",
                    data: moduleData,
                    created_at: new Date().toISOString()
                }).select();
            }

        } else if (operation === 'COMPLETE') {
             logAction = 'COMPLETE_TASK';
             if (relatedItemId) {
                // Try to complete task by ID (if AI found it)
                dbPromise = supabase.from('tasks').update({ is_completed: true }).eq('id', relatedItemId).select();
             } else {
                // If AI couldn't find ID, maybe try finding by title (fuzzy)
                 // Skipping for now to keep it safe.
             }
        }

        // Wait for DB Action
        const dbResult = await dbPromise;

        if (dbResult && dbResult.error) {
             console.error("DB Insert Error:", dbResult.error);
             const errorMsg = `บันทึกไม่สำเร็จ: ${dbResult.error.message}`;
             await replyToLine(replyToken, accessToken, errorMsg);
             updateLog('ERROR', 'DB_FAILED', dbResult.error.message);
             return;
        }

        // --- 4. REPLY ---
        await replyToLine(replyToken, accessToken, chatResponse);
        await updateLog(logAction, 'SUCCESS', chatResponse);

    } catch (error: any) {
        console.error("AI Logic Error:", error);
        await replyToLine(replyToken, accessToken, "ระบบขัดข้องชั่วคราวครับ");
        updateLog('ERROR', 'FAILED', error.message);
    }
}

async function replyToLine(replyToken: string, accessToken: string, text: string) {
    try {
        await fetchWithTimeoutRetry("https://api.line.me/v2/bot/message/reply", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                replyToken: replyToken,
                messages: [{ type: 'text', text: text }],
            }),
        });
    } catch (e) {
        console.error("Failed to reply to LINE:", e);
    }
}
