
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

        // --- AI BRAIN LOGIC (SMART AGENT) ---
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

    // 2. Fetch minimal context
    const { data: accounts } = await supabase.from('accounts').select('id, name').limit(5);

    // 3. Define AI Schema (Same as Frontend)
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            operation: {
                type: Type.STRING,
                enum: ['CREATE', 'TRANSACTION', 'CHAT'],
                description: "Determine action. Use CREATE for tasks/ideas. Use TRANSACTION for spending/income."
            },
            chatResponse: { type: Type.STRING, description: "Polite Thai response." },
            // PARA Fields
            title: { type: Type.STRING, nullable: true },
            category: { type: Type.STRING, nullable: true },
            type: { type: Type.STRING, enum: ['Tasks', 'Projects', 'Resources'], nullable: true },
            content: { type: Type.STRING, nullable: true },
            // Finance Fields
            amount: { type: Type.NUMBER, nullable: true },
            transactionType: { type: Type.STRING, enum: ['INCOME', 'EXPENSE'], nullable: true },
            accountId: { type: Type.STRING, nullable: true }
        },
        required: ["operation", "chatResponse"]
    };

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
    Role: You are "Jay", a Life OS Assistant for Ouk via LINE.
    User Input: "${userMessage}"
    
    Current Finance Accounts: ${JSON.stringify(accounts)}

    Instructions:
    - If user wants to remember something/do something -> operation: "CREATE", type: "Tasks"
    - If user spent money -> operation: "TRANSACTION", map to best accountId.
    - Otherwise -> operation: "CHAT"
    - Answer in Thai.
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
        const { operation, chatResponse, title, category, type, content, amount, transactionType, accountId } = rawJSON;

        // 4. EXECUTE ACTIONS
        if (operation === 'CREATE') {
            // Insert into PARA
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
            // Insert into Finance
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

        } else {
            await logSystemEvent('CHAT', 'SUCCESS', chatResponse);
        }

        // 5. Reply to User
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
