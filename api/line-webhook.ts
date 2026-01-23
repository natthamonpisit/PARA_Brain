
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Initialize Services
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

export default async function handler(req: any, res: any) {
  // 1. Method Validation
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { events } = req.body;
    const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const authorizedUserId = process.env.LINE_USER_ID;

    // Check Critical Config
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

        // --- COMMAND HANDLERS (Priority) ---

        // Command: "id" -> Reveal User ID
        if (userMessage.toLowerCase() === 'id') {
            await replyToLine(replyToken, channelAccessToken, `Your User ID is:\n${userId}`);
            continue;
        }

        // Command: "test" -> System Check
        if (userMessage.toLowerCase() === 'test') {
            await replyToLine(replyToken, channelAccessToken, "🟢 Ouk OS Webhook is active!");
            continue;
        }

        // --- SECURITY CHECK ---
        // Only authorized user can access The Brain (Database & AI)
        if (authorizedUserId && userId !== authorizedUserId) {
            console.warn(`⛔ Unauthorized access attempt from: ${userId}`);
            // Silent reject to avoid spam billing
            continue; 
        }

        // --- AI BRAIN LOGIC ---
        await handleAIResponse(userMessage, replyToken, channelAccessToken);
      }
    }

    return res.status(200).json({ success: true });

  } catch (error: any) {
    console.error("Webhook Critical Error:", error);
    // Return 200 OK to prevent LINE from retrying endlessly on internal errors
    return res.status(200).json({ error: error.message });
  }
}

// --- HELPER FUNCTIONS ---

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

async function handleAIResponse(userMessage: string, replyToken: string, accessToken: string) {
    // 1. Initialize DB
    if (!supabaseUrl || !supabaseKey) {
        await replyToLine(replyToken, accessToken, "⚠️ Server Error: Supabase config missing.");
        return;
    }
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 2. Fetch Context
    const { data: tasks } = await supabase
        .from('tasks')
        .select('title, category')
        .eq('is_completed', false)
        .limit(10);
    
    const { data: finance } = await supabase
        .from('accounts')
        .select('name, balance')
        .limit(5);

    // 3. Format Context
    let taskContext = "No pending tasks.";
    if (tasks && tasks.length > 0) {
        taskContext = tasks.map((t: any) => `- [${t.category}] ${t.title}`).join('\n');
    }

    let financeContext = "No finance data.";
    if (finance && finance.length > 0) {
        financeContext = finance.map((f: any) => `- ${f.name}: ${f.balance}`).join('\n');
    }

    // 4. Ask Gemini
    const prompt = `
Role: You are "Jay" (เจ), a personal Life OS assistant for Ouk (พี่อุ๊ก).
User Input: "${userMessage}"

--- REAL-TIME CONTEXT ---
[Pending Tasks]
${taskContext}

[Finance Overview]
${financeContext}

--- INSTRUCTIONS ---
1. Answer in **Thai** (Natural, Polite, Smart).
2. Use the context provided to answer questions about tasks or money.
3. Keep it concise (under 200 chars) suitable for chat.
`;

    let replyText = "";
    try {
        const result = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });
        replyText = result.text || "เจคิดไม่ออกครับ (AI Error)";
    } catch (error) {
        console.error("Gemini Error:", error);
        replyText = "ขอโทษครับ เจมีปัญหาในการติดต่อ AI";
    }

    // 5. Send Reply
    await replyToLine(replyToken, accessToken, replyText);
}
