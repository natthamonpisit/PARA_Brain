
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
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        const userMessage = event.message.text.trim();
        const eventId = event.webhookEventId; // Unique ID from LINE for this specific message

        console.log(`📩 Message from ${userId} (EventID: ${eventId}): ${userMessage}`);

        // --- SECURITY CHECK ---
        if (authorizedUserId && userId !== authorizedUserId) {
            console.warn(`⛔ Unauthorized access attempt from: ${userId}`);
            continue; 
        }

        // --- COMMAND HANDLERS (Special commands bypass AI) ---
        if (userMessage.toLowerCase() === 'id') {
            await replyToLine(replyToken, channelAccessToken, `Your User ID is:\n${userId}`);
            continue;
        }

        // --- IDEMPOTENCY CHECK (กันข้อความซ้ำ) ---
        // เช็คว่า Event ID นี้เคยเข้ามาหรือยัง
        // CRITICAL FIX: Use maybeSingle() instead of single() so it doesn't throw error if row is missing
        const { data: existingLog } = await supabase
            .from('system_logs')
            .select('id, status')
            .eq('event_id', eventId)
            .maybeSingle();

        if (existingLog) {
            console.log(`🔄 Duplicate Event Detected (${eventId}). Status: ${existingLog.status}. Skipping...`);
            continue; // ข้ามเลย เพราะทำไปแล้ว หรือกำลังทำอยู่
        }

        // --- LOCK THE EVENT ---
        // บันทึกลง DB ทันทีว่า "กำลังประมวลผล" (PROCESSING)
        // ถ้า LINE ยิงซ้ำมาอีก จะติด Check ข้างบน
        const { data: newLog, error: logError } = await supabase.from('system_logs').insert({
            event_source: 'LINE',
            event_id: eventId,
            user_message: userMessage,
            status: 'PROCESSING',
            action_type: 'THINKING'
        }).select().single();

        if (logError) {
            console.error("Failed to lock event:", logError);
            // If insert fails (likely race condition on unique constraint), skip
            continue; 
        }

        // --- AI BRAIN LOGIC ---
        // ส่ง logId ไปด้วย เพื่อให้ function ไป update record เดิม ไม่ใช่ create ใหม่
        await processSmartAgentRequest(userMessage, replyToken, channelAccessToken, newLog.id, supabase);
      }
    }

    return res.status(200).json({ success: true });

  } catch (error: any) {
    console.error("Webhook Critical Error:", error);
    return res.status(200).json({ error: error.message });
  }
}

// --- SMART AGENT LOGIC (Refactored) ---

async function processSmartAgentRequest(
    userMessage: string, 
    replyToken: string, 
    accessToken: string, 
    logId: string,
    supabase: any
) {
    const apiKey = process.env.API_KEY;

    // Helper to update the existing log entry
    const updateLog = async (action: string, status: string, response: string) => {
        try {
            await supabase.from('system_logs').update({
                ai_response: response,
                action_type: action,
                status: status
            }).eq('id', logId);
        } catch (e) { console.error("Log update failed", e); }
    };

    if (!apiKey) {
        const msg = "⚠️ Server Error: API Key missing.";
        await replyToLine(replyToken, accessToken, msg);
        await updateLog('ERROR', 'FAILED', msg);
        return;
    }

    try {
        // 1. Fetch Context
        const { data: accounts } = await supabase.from('accounts').select('id, name').limit(10);
        const { data: modules } = await supabase.from('modules').select('id, name, schema_config');
        const { data: recentTasks } = await supabase.from('tasks').select('id, title').eq('is_completed', false).limit(5);

        // 2. Define Schema & Prompt
        const responseSchema = {
            type: Type.OBJECT,
            properties: {
                operation: {
                    type: Type.STRING,
                    enum: ['CREATE', 'TRANSACTION', 'MODULE_ITEM', 'COMPLETE', 'CHAT'],
                    description: "Determine action based on input."
                },
                chatResponse: { type: Type.STRING, description: "Polite Thai response." },
                
                // PARA Fields
                title: { type: Type.STRING, nullable: true },
                category: { type: Type.STRING, nullable: true },
                type: { type: Type.STRING, enum: ['Tasks', 'Projects', 'Resources', 'Areas'], nullable: true },
                content: { type: Type.STRING, nullable: true },
                relatedItemId: { type: Type.STRING, nullable: true },

                // Finance Fields
                amount: { type: Type.NUMBER, nullable: true },
                transactionType: { type: Type.STRING, enum: ['INCOME', 'EXPENSE', 'TRANSFER'], nullable: true },
                accountId: { type: Type.STRING, nullable: true },

                // Module Fields
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
                        required: ["key", "value"]
                    }
                },
            },
            required: ["operation", "chatResponse"]
        };

        const ai = new GoogleGenAI({ apiKey });
        
        const modulesManual = modules?.map((m: any, index: number) => {
            const fields = m.schema_config?.fields.map((f: any) => 
                `- Field "${f.key}" (${f.type}): ${f.label}`
            ).join('\n');
            return `MODULE ${index + 1}: "${m.name}" (ID: ${m.id})\nStructure:\n${fields}`;
        }).join('\n\n');

        const accountsList = accounts?.map((a: any) => `- ${a.name} (ID: ${a.id})`).join('\n');
        const tasksList = recentTasks?.map((t: any) => `- Task: "${t.title}" (ID: ${t.id})`).join('\n');

        const prompt = `
        Role: You are "Jay" (เจ), a Personal Life OS Assistant.
        User Input: "${userMessage}"

        --- DYNAMIC SYSTEM MANUAL ---
        ${modulesManual || "No custom modules."}

        --- ACCOUNTS ---
        ${accountsList || "No accounts."}

        --- PENDING TASKS ---
        ${tasksList || "No tasks."}

        --- INSTRUCTIONS ---
        Analyze user intent (CREATE, TRANSACTION, MODULE_ITEM, COMPLETE, CHAT).
        Answer in Thai.
        `;

        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        });

        const rawJSON = JSON.parse(result.text || "{}");
        const { operation, chatResponse, title, category, type, content, amount, transactionType, accountId, targetModuleId, moduleDataRaw, relatedItemId } = rawJSON;

        // 3. EXECUTE ACTIONS
        if (operation === 'CREATE') {
            const { error } = await supabase.from(type === 'Projects' ? 'projects' : 'tasks').insert({
                id: uuidv4(),
                title: title || userMessage,
                category: category || 'Inbox',
                type: type || 'Tasks',
                content: content || '',
                is_completed: false,
                created_at: new Date().toISOString()
            });
            if (error) throw error;
            await updateLog('CREATE_PARA', 'SUCCESS', chatResponse);

        } else if (operation === 'TRANSACTION') {
            const targetAcc = accountId || (accounts && accounts.length > 0 ? accounts[0].id : null);
            if (targetAcc) {
                const { error } = await supabase.from('transactions').insert({
                    id: uuidv4(),
                    description: title || userMessage,
                    amount: amount,
                    type: transactionType,
                    category: category || 'General',
                    account_id: targetAcc,
                    transaction_date: new Date().toISOString()
                });
                if (error) throw error;
                await updateLog('CREATE_TX', 'SUCCESS', chatResponse);
            } else {
                await updateLog('CREATE_TX', 'FAILED', 'No Account Found');
            }

        } else if (operation === 'MODULE_ITEM') {
            if (targetModuleId) {
                let moduleData: Record<string, any> = {};
                if (moduleDataRaw && Array.isArray(moduleDataRaw)) {
                    moduleDataRaw.forEach((item: any) => {
                         let val: any = item.value;
                         if (!isNaN(Number(item.value)) && item.value.trim() !== '') val = Number(item.value);
                         else if (item.value === 'true') val = true;
                         else if (item.value === 'false') val = false;
                         moduleData[item.key] = val;
                    });
                }
                const { error } = await supabase.from('module_items').insert({
                    id: uuidv4(),
                    module_id: targetModuleId,
                    title: title || "Entry",
                    data: moduleData,
                    created_at: new Date().toISOString()
                });
                if (error) throw error;
                await updateLog('CREATE_MODULE', 'SUCCESS', chatResponse);
            } else {
                await updateLog('CREATE_MODULE', 'FAILED', 'Module ID not found');
            }

        } else if (operation === 'COMPLETE') {
            if (relatedItemId) {
                const { error } = await supabase.from('tasks').update({ is_completed: true }).eq('id', relatedItemId);
                if (error) throw error;
                await updateLog('COMPLETE_TASK', 'SUCCESS', chatResponse);
            } else {
                 await updateLog('COMPLETE_TASK', 'FAILED', 'Task ID not identified');
            }

        } else {
            await updateLog('CHAT', 'SUCCESS', chatResponse);
        }

        // 4. Reply to User
        await replyToLine(replyToken, accessToken, chatResponse);

    } catch (error: any) {
        console.error("AI/DB Error:", error);
        await replyToLine(replyToken, accessToken, "เจขอโทษครับ ระบบหลังบ้านขัดข้องนิดหน่อย");
        await updateLog('ERROR', 'FAILED', error.message);
    }
}

async function replyToLine(replyToken: string, accessToken: string, text: string) {
    try {
        await fetch("https://api.line.me/v2/bot/message/reply", {
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
