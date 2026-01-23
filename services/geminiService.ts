
import { GoogleGenAI, Type } from "@google/genai";
import { ParaType, AIAnalysisResult, ExistingItemContext, ChatMessage, FinanceContext, ModuleContext, TransactionType, DailySummary } from "../types";

// JAY'S NOTE: REMOVED HARDCODED KEY for Security. 
// User must provide key via Vercel Environment Variables (VITE_API_KEY) or Manual Input in UI.
const FALLBACK_API_KEY = "";

// JAY'S NOTE: Helper to safely retrieve API Key
const getApiKey = (manualOverride?: string): string | undefined => {
  if (manualOverride && manualOverride.trim().length > 0) return manualOverride;
  
  try {
    // Check import.meta.env (Vite Standard)
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
       // @ts-ignore
       return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  try {
    // Check process.env (Node/Compat)
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) return process.env.API_KEY;
  } catch (e) {}

  return FALLBACK_API_KEY;
};

/**
 * 🧠 THE BRAIN FUNCTION
 * 
 * This function creates the "Context Window" for Gemini. 
 * Instead of just sending the user's text, we construct a massive prompt that includes:
 * 1. Who Jay is (Persona)
 * 2. What Jay knows (Long-term Memory/Summaries)
 * 3. What Jay sees (Current Tasks, Bank Balance, Custom Modules)
 * 4. How Jay should act (Schema definition for JSON output)
 */
export const analyzeParaInput = async (
  input: string,
  paraItems: ExistingItemContext[],
  financeContext: FinanceContext,
  moduleContext: ModuleContext[],
  chatHistory: ChatMessage[] = [], 
  manualApiKey?: string,
  recentSummaries: DailySummary[] = []
): Promise<AIAnalysisResult> => {
  
  try {
    const apiKey = getApiKey(manualApiKey);
    if (!apiKey) {
        throw new Error("MISSING_API_KEY");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const modelName = "gemini-3-flash-preview"; 

    // 1. Construct Chat History Context
    const recentContext = chatHistory
        .slice(-10) 
        .map(msg => `${msg.role === 'user' ? 'User' : 'Jay'}: ${msg.text}`)
        .join('\n');

    // 2. Construct Dynamic Module Manual
    // This tells AI how to structure data for user-created apps (e.g. Reading Tracker)
    const modulesManual = moduleContext.map((m, i) => {
        const fields = m.fields.map(f => `- ${f.key} (${f.type}): ${f.label}`).join('\n');
        return `MODULE ${i+1}: "${m.name}" (ID: ${m.id})\nFields:\n${fields}`;
    }).join('\n\n');

    // 3. Construct Memory Context (LTM)
    const summariesContext = recentSummaries
        .map(s => `[${s.date}] Summary: ${s.summary}`)
        .join('\n');

    // 4. Define Strict Output Schema
    // This ensures we get executable JSON, not just markdown text.
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
        operation: {
            type: Type.STRING,
            enum: ['CREATE', 'COMPLETE', 'CHAT', 'TRANSACTION', 'MODULE_ITEM'],
            description: "Determine the action: CREATE (PARA item), TRANSACTION (Finance), MODULE_ITEM (Dynamic App), COMPLETE (Task), or CHAT."
        },
        chatResponse: {
            type: Type.STRING,
            description: "Your conversational response in Thai."
        },
        // PARA Fields
        type: {
            type: Type.STRING,
            enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK],
            nullable: true
        },
        category: { type: Type.STRING, nullable: true },
        title: { type: Type.STRING, nullable: true },
        summary: { type: Type.STRING, nullable: true },
        suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        relatedItemIdsCandidates: { type: Type.ARRAY, items: { type: Type.STRING } },
        
        // Finance Fields
        amount: { type: Type.NUMBER, nullable: true },
        transactionType: { type: Type.STRING, enum: ['INCOME', 'EXPENSE', 'TRANSFER'], nullable: true },
        accountId: { type: Type.STRING, nullable: true, description: "ID of the finance account to use." },

        // Module Fields
        targetModuleId: { type: Type.STRING, nullable: true, description: "ID of the dynamic module (e.g. Health Tracker ID)." },
        
        moduleDataRaw: { 
            type: Type.ARRAY, 
            nullable: true,
            description: "Data for the module as key-value pairs. All values must be strings.",
            items: {
                type: Type.OBJECT,
                properties: {
                    key: { type: Type.STRING },
                    value: { type: Type.STRING }
                },
                required: ["key", "value"]
            }
        },

        reasoning: { type: Type.STRING }
        },
        required: ["operation", "chatResponse", "reasoning"]
    };

    const prompt = `
        1. ROLE & PERSONA: You are "Jay" (เจ), a Personal Life OS Architect for Ouk.
        - **Personality**: Smart, proactive, concise, encouraging, and organized. You speak Thai (Main) mixed with technical English terms.
        
        2. **JAY'S CORE FUNCTION MEMORY**:
           - **PARA Brain**: Organize Tasks, Projects, Areas.
           - **Wealth Engine**: Track Finances.
           - **Dynamic Modules**: Handle custom data modules based on the Schema provided below.

        3. **LONG TERM MEMORY (Context from previous days)**:
           ${summariesContext || "No previous summaries found."}

        4. **DYNAMIC MODULES SCHEMA (Updated Live)**:
           The user has defined the following custom modules. You MUST use these IDs and Field Keys when mapping 'MODULE_ITEM'.
           
           ${modulesManual || "No custom modules found."}

        --- DATA CONTEXT ---
        
        [EXISTING PARA ITEMS]
        ${JSON.stringify(paraItems.slice(0, 50))}

        [FINANCE ACCOUNTS]
        ${JSON.stringify(financeContext.accounts)}

        --- CHAT HISTORY ---
        ${recentContext || "Start of conversation"}
        
        --- USER INPUT --- 
        "${input}"

        --- OUTPUT INSTRUCTIONS ---
        - **TRANSACTION**: Use when user spends/receives money. Must infer 'amount', 'transactionType', and 'accountId'.
        - **MODULE_ITEM**: Use when user provides data relevant to a specific module from the list above. Map data to 'moduleDataRaw'.
        - **CREATE**: Use for Tasks, Projects, Areas, Resources.
        - **CHAT**: Use for questions, advice, or clarification.

        Output JSON only.
    `;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const rawResult = JSON.parse(text);
    
    // Transform moduleDataRaw back to Object for the App to use
    let moduleData: Record<string, any> = {};
    if (rawResult.moduleDataRaw && Array.isArray(rawResult.moduleDataRaw)) {
        rawResult.moduleDataRaw.forEach((item: any) => {
            if (item.key) {
                 // Attempt basic type inference
                 const valStr = item.value;
                 let val: any = valStr;
                 // Try to convert to number if it looks like one
                 if (!isNaN(Number(valStr)) && valStr.trim() !== '') {
                     val = Number(valStr);
                 } 
                 // Try to convert boolean
                 else if (valStr.toLowerCase() === 'true') {
                     val = true;
                 } else if (valStr.toLowerCase() === 'false') {
                     val = false;
                 }
                 moduleData[item.key] = val;
            }
        });
    }

    const result: AIAnalysisResult = {
        ...rawResult,
        moduleData
    };

    return result;

  } catch (error: any) {
    console.error("Gemini Analysis Error:", error);
    const errorMsg = error.message || "";
    
    // 1. Missing Key Case
    if (errorMsg === "MISSING_API_KEY") {
        return {
            operation: 'CHAT',
            chatResponse: "⛔ **ยังไม่ได้ใส่ API Key ครับพี่อุ๊ก**\n\nรบกวนพี่สร้าง Key ใหม่ (อันเก่าโดน Google เตือน) แล้วใส่ใน **Vercel Env Vars** หรือกดปุ่ม **System > Set Key** ด้านซ้ายล่างชั่วคราวได้ครับ",
            reasoning: "Missing API Key"
        };
    }

    // 2. Invalid Key / Domain Restriction Case (Common on Production)
    if (errorMsg.includes("403") || errorMsg.includes("API key not valid") || errorMsg.includes("fetch failed")) {
         return {
            operation: 'CHAT',
            chatResponse: "⛔ **API Key ใช้งานไม่ได้บนเว็บจริงครับ**\n\nสาเหตุอาจเกิดจาก:\n1. Google ระงับ Key เก่าเพราะ Exposed (ต้องสร้างใหม่)\n2. Domain Restriction (ต้องปลดล็อคใน Google Console)\n3. ยังไม่ได้ใส่ `VITE_API_KEY` ใน Vercel\n\nลองสร้าง Key ใหม่แล้วอัปเดตใน Vercel นะครับ",
            reasoning: "Invalid API Key on Production"
        };
    }

    // 3. General Fallback
    return {
      operation: 'CHAT',
      chatResponse: `ระบบเจขัดข้องชั่วคราวครับ (Error: ${errorMsg})\nลองเช็คอินเทอร์เน็ตดูนะครับ`,
      reasoning: "Error fallback"
    };
  }
};
