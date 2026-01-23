
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

        console.log(`📩 Message from ${userId}: ${userMessage}`);

        // --- COMMAND HANDLERS ---
        if (userMessage.toLowerCase() === 'id') {
            await replyToLine(replyToken, channelAccessToken, `Your User ID is:\n${userId}`);
            continue;
        }

        // --- SECURITY CHECK ---
        if (authorizedUserId && userId !== authorizedUserId) {
            console.warn(`⛔ Unauthorized access attempt from: ${userId}`);
            continue; 
        }

        // --- AI BRAIN LOGIC (SMART AGENT - FULL CAPABILITY) ---
        await handleSmartAgent(userMessage, replyToken, channelAccessToken);
      }
    }

    return res.status(200).json({ success: true });

  } catch (error: any) {
    console.error("Webhook Critical Error:", error);
    return res.status(200).json({ error: error.message });
  }
}

// --- SMART AGENT LOGIC ---

async function handleSmartAgent(userMessage: string, replyToken: string, accessToken: string) {
    const supabase = createClient(supabaseUrl!, supabaseKey!);
    const apiKey = process.env.API_KEY;

    // 1. Logging Helper
    const logSystemEvent = async (action: string, status: string, response: string) => {
        try {
            await supabase.from('system_logs').insert({
                event_source: 'LINE',
                user_message: userMessage,
                ai_response: response,
                action_type: action,
                status: status
            });
        } catch (e) { console.error("Log failed", e); }
    };

    if (!apiKey) {
        const msg = "⚠️ Server Error: API Key missing.";
        await replyToLine(replyToken, accessToken, msg);
        await logSystemEvent('ERROR', 'FAILED', msg);
        return;
    }

    // 2. Fetch Full Context (Dynamic Learning)
    // AI จะ "เรียนรู้ใหม่" ทุกครั้งที่มี request เข้ามา โดยการอ่าน DB ล่าสุด
    const { data: accounts } = await supabase.from('accounts').select('id, name').limit(10);
    const { data: modules } = await supabase.from('modules').select('id, name, schema_config');
    const { data: recentTasks } = await supabase.from('tasks').select('id, title').eq('is_completed', false).limit(5);

    // 3. Define AI Schema
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
    
    // 4. Construct Dynamic "User Manual" for AI
    // นี่คือส่วนที่ทำให้ AI ฉลาดขึ้นเรื่อยๆ ตาม Module ที่พี่สร้าง
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
    You manage Ouk's life data.

    --- DYNAMIC SYSTEM MANUAL (READ CAREFULLY) ---
    The user has created the following custom data modules. You must strictly follow their structure.

    ${modulesManual || "No custom modules created yet."}

    --- FINANCE ACCOUNTS ---
    ${accountsList || "No accounts."}

    --- PENDING TASKS ---
    ${tasksList || "No pending tasks."}

    --- USER INPUT ---
    "${userMessage}"

    --- INSTRUCTIONS ---
    1. **Analyze Intent**:
       - If input matches a Module's purpose (e.g., "Weight 70" for Health Module), set operation='MODULE_ITEM'.
       - If spending/money, set operation='TRANSACTION'.
       - If completing a task, set operation='COMPLETE'.
       - If creating a generic task/note, set operation='CREATE'.
    
    2. **For MODULE_ITEM**:
       - Identify the 'targetModuleId' from the System Manual above.
       - Map the user's input to 'moduleDataRaw' using the keys defined in the Manual.
       - Example: If user says "Read 20 pages", and Book Module has field "pages_read", output { key: "pages_read", value: "20" }.

    3. **Response**:
       - Answer in Thai (Natural, Polite, Encouraging).
    `;

    try {
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

        // 5. EXECUTE ACTIONS
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
            await logSystemEvent('CREATE_PARA', 'SUCCESS', chatResponse);

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
                await logSystemEvent('CREATE_TX', 'SUCCESS', chatResponse);
            } else {
                await logSystemEvent('CREATE_TX', 'FAILED', 'No Account Found');
            }

        } else if (operation === 'MODULE_ITEM') {
            if (targetModuleId) {
                // Convert raw KV to Object
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
                await logSystemEvent('CREATE_MODULE', 'SUCCESS', chatResponse);
            } else {
                await logSystemEvent('CREATE_MODULE', 'FAILED', 'Module ID not found');
            }

        } else if (operation === 'COMPLETE') {
            if (relatedItemId) {
                const { error } = await supabase.from('tasks').update({ is_completed: true }).eq('id', relatedItemId);
                if (error) throw error;
                await logSystemEvent('COMPLETE_TASK', 'SUCCESS', chatResponse);
            } else {
                 await logSystemEvent('COMPLETE_TASK', 'FAILED', 'Task ID not identified');
            }

        } else {
            await logSystemEvent('CHAT', 'SUCCESS', chatResponse);
        }

        // 6. Reply to User
        await replyToLine(replyToken, accessToken, chatResponse);

    } catch (error: any) {
        console.error("AI/DB Error:", error);
        await replyToLine(replyToken, accessToken, "เจขอโทษครับ ระบบหลังบ้านขัดข้องนิดหน่อย");
        await logSystemEvent('ERROR', 'FAILED', error.message);
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
