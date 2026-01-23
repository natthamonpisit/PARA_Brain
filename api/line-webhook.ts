
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from 'uuid';

// Initialize Services
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req: any, res: any) {
  // 1. Method Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { events } = req.body;
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const authorizedUserId = process.env.LINE_USER_ID;

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
    // We use Promise.all to process multiple messages in parallel (though usually just 1)
    await Promise.all(events.map(async (event: any) => {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        const userMessage = event.message.text.trim();
        const eventId = event.webhookEventId;

        console.log(`📩 Message from ${userId} (EventID: ${eventId}): ${userMessage}`);

        // --- SECURITY CHECK ---
        if (authorizedUserId && userId !== authorizedUserId) {
            console.warn(`⛔ Unauthorized access attempt from: ${userId}`);
            return;
        }

        // --- COMMAND HANDLERS (Bypass AI for speed) ---
        if (userMessage.toLowerCase() === 'id') {
            await replyToLine(replyToken, channelAccessToken, `Your User ID is:\n${userId}`);
            return;
        }

        // --- IDEMPOTENCY CHECK ---
        const { data: existingLog } = await supabase
            .from('system_logs')
            .select('id, status')
            .eq('event_id', eventId)
            .maybeSingle();

        if (existingLog) {
            console.log(`🔄 Duplicate Event Detected (${eventId}). Skipping...`);
            return;
        }

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
    return res.status(200).json({ error: error.message });
  }
}

// --- SMART AGENT LOGIC (OPTIMIZED FOR SPEED) ---

async function processSmartAgentRequest(
    userMessage: string, 
    replyToken: string, 
    accessToken: string, 
    logId: string,
    supabase: any
) {
    const apiKey = process.env.API_KEY;

    // Helper to update the log
    const updateLog = async (action: string, status: string, response: string) => {
        // Fire and forget log update to save time
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
        // --- 1. SMART CONTEXT LOADING (Parallel & Conditional) ---
        // Only load heavy data if the user message suggests it's needed
        
        const msgLower = userMessage.toLowerCase();
        const isFinanceRelated = /money|baht|bath|บาท|จ่าย|ซื้อ|โอน|income|expense|cost|price|฿/.test(msgLower);
        const isTaskRelated = /task|job|project|remind|งาน|โปรเจ|จำ|ลืม|ทำ/.test(msgLower);
        
        // Define Promises
        const accountsPromise = isFinanceRelated 
            ? supabase.from('accounts').select('id, name').limit(10) 
            : Promise.resolve({ data: [] });
            
        const modulesPromise = supabase.from('modules').select('id, name, schema_config'); // Always load modules (usually light)
        
        const tasksPromise = isTaskRelated 
            ? supabase.from('tasks').select('id, title').eq('is_completed', false).limit(10)
            : Promise.resolve({ data: [] });

        // Wait for all data concurrently (Fast!)
        const [
            { data: accounts }, 
            { data: modules }, 
            { data: recentTasks }
        ] = await Promise.all([accountsPromise, modulesPromise, tasksPromise]);

        // --- 2. BUILD PROMPT ---
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                operation: {
                    type: Type.STRING,
                    enum: ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT'],
                    description: "Action type."
                },
                chatResponse: { type: Type.STRING, description: "Short Thai response." }, // Emphasize SHORT
                
                // PARA
                title: { type: Type.STRING, nullable: true },
                category: { type: Type.STRING, nullable: true },
                type: { type: Type.STRING, enum: ['Tasks', 'Projects', 'Resources', 'Areas'], nullable: true },
                content: { type: Type.STRING, nullable: true },
                relatedItemId: { type: Type.STRING, nullable: true },

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
        
        // Format Context Strings
        const modulesManual = modules?.length ? modules.map((m: any, i: number) => {
             const fields = m.schema_config?.fields.map((f: any) => `${f.key}`).join(',');
             return `MOD${i}:${m.name}(ID:${m.id})[${fields}]`;
        }).join('\n') : "";

        const accountsList = accounts?.length ? accounts.map((a: any) => `${a.name}(ID:${a.id})`).join('\n') : "";
        const tasksList = recentTasks?.length ? recentTasks.map((t: any) => `Task:${t.title}(ID:${t.id})`).join('\n') : "";

        const prompt = `
        Role: "Jay" (Life OS). User: "${userMessage}"
        
        CTXT:
        ${modulesManual ? `[Modules]\n${modulesManual}` : ''}
        ${accountsList ? `[Accs]\n${accountsList}` : ''}
        ${tasksList ? `[Tasks]\n${tasksList}` : ''}

        Detect: CREATE, TRANSACTION, MODULE_ITEM, COMPLETE, or CHAT.
        Reply: Thai, Concise.
        `;

        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview', // Speed King
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        });

        const rawJSON = JSON.parse(result.text || "{}");
        const { operation, chatResponse, title, category, type, content, amount, transactionType, accountId, targetModuleId, moduleDataRaw, relatedItemId } = rawJSON;

        // --- 3. EXECUTE ACTION (Parallel with Reply where possible) ---
        // We start the DB operation but don't strictly await the result before replying if we want to be super fast.
        // But to be safe (ensure data is saved), we await. Database inserts are usually < 100ms.

        let dbPromise = Promise.resolve<any>(null);
        let logAction = 'CHAT';

        if (operation === 'CREATE') {
            logAction = 'CREATE_PARA';
            dbPromise = supabase.from(type === 'Projects' ? 'projects' : 'tasks').insert({
                id: uuidv4(),
                title: title || userMessage,
                category: category || 'Inbox',
                type: type || 'Tasks',
                content: content || '',
                is_completed: false,
                created_at: new Date().toISOString()
            });

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
                });
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
                });
            }

        } else if (operation === 'COMPLETE') {
             logAction = 'COMPLETE_TASK';
             if (relatedItemId) {
                dbPromise = supabase.from('tasks').update({ is_completed: true }).eq('id', relatedItemId);
             }
        }

        // Wait for DB Action
        await dbPromise;

        // --- 4. REPLY (FREE TOKEN) ---
        await replyToLine(replyToken, accessToken, chatResponse);
        
        // Log Update (Background)
        updateLog(logAction, 'SUCCESS', chatResponse);

    } catch (error: any) {
        console.error("AI Logic Error:", error);
        // Even if error, try to reply so user isn't ghosted
        await replyToLine(replyToken, accessToken, "เจทำงานไม่ทันครับ (Timeout) ลองอีกทีนะครับ");
        updateLog('ERROR', 'FAILED', error.message);
    }
}

async function replyToLine(replyToken: string, accessToken: string, text: string) {
    try {
        const res = await fetch("https://api.line.me/v2/bot/message/reply", {
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
        // Check for validity
        if (!res.ok) {
            console.error("LINE Reply Error:", await res.text());
        }
    } catch (e) {
        console.error("Failed to reply to LINE:", e);
    }
}
