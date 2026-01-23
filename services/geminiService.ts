
import { GoogleGenAI, Type } from "@google/genai";
import { ParaType, AIAnalysisResult, ExistingItemContext, ChatMessage, FinanceContext, ModuleContext, TransactionType } from "../types";

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

export const analyzeParaInput = async (
  input: string,
  paraItems: ExistingItemContext[],
  financeContext: FinanceContext,
  moduleContext: ModuleContext[],
  chatHistory: ChatMessage[] = [], 
  manualApiKey?: string
): Promise<AIAnalysisResult> => {
  
  try {
    const apiKey = getApiKey(manualApiKey);
    if (!apiKey) {
        throw new Error("MISSING_API_KEY");
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });
    const modelName = "gemini-3-flash-preview"; 

    const recentContext = chatHistory
        .slice(-10) 
        .map(msg => `${msg.role === 'user' ? 'User' : 'Jay'}: ${msg.text}`)
        .join('\n');

    // JAY'S NOTE: Updated Schema to support ALL operations
    // FIX 2.0: Use 'moduleDataRaw' (Array) instead of 'moduleData' (Object) to strictly comply with Gemini Schema rules.
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
        
        // FIX: Replaced flexible object with explicit key-value array to prevent "non-empty object" error
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
        1. ROLE & PERSONA: You are "Jay" (เจ), a Personal Life OS Architect for Ouk (พี่อุ๊ก).
        - **Personality**: Smart, proactive, concise, encouraging, and organized. You speak Thai (Main) mixed with technical English terms.
        
        2. **JAY'S CORE FUNCTION MEMORY (บันทึกฟังก์ชันหลัก)**:
           You must remember your capabilities within this "Notion for Life" system:
           - **PARA Brain**: You organize Tasks, Projects, Areas, Resources, and Archives. You help categorize and link them.
           - **Wealth Engine**: You track Finances (Income, Expense, Transfers) and calculate Net Worth.
           - **Dynamic Modules**: You can handle ANY custom data module Ouk builds (e.g., Health, Reading List, Habits) by mapping inputs to the module's schema.
           - **Goal**: To build a robust, personalized system that runs on autopilot.

        3. OPERATIONAL PROTOCOLS:
        - **Input Analysis**: Determine if the input is a Task/Project, a Financial Transaction, or Data for a specific Module.
        - **Finance Logic**: If input mentions spending/income (e.g. "lunch 100"), map to 'TRANSACTION'. Find the best matching 'accountId' from context.
        - **Module Logic**: If input matches a dynamic module's purpose (e.g. "weight 70kg" -> Health Module), map to 'MODULE_ITEM'.
        - **Module Data Mapping**: When creating a MODULE_ITEM, map the input data to 'moduleDataRaw' as a list of key-value pairs. 
          Example: If user says "Weight 70kg" and Health module has field "weight", output moduleDataRaw: [{ "key": "weight", "value": "70" }].

        --- DATA CONTEXT ---
        
        [EXISTING PARA ITEMS]
        ${JSON.stringify(paraItems)}

        [FINANCE ACCOUNTS]
        ${JSON.stringify(financeContext.accounts)}

        [AVAILABLE MODULES & SCHEMAS]
        ${JSON.stringify(moduleContext)}

        --- CHAT HISTORY ---
        ${recentContext || "Start of conversation"}
        
        --- USER INPUT --- 
        "${input}"

        --- OUTPUT INSTRUCTIONS ---
        - **TRANSACTION**: Use when user spends/receives money. Must infer 'amount', 'transactionType', and 'accountId'.
        - **MODULE_ITEM**: Use when user provides data relevant to a specific module. Map data to 'moduleDataRaw'.
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
