
import { GoogleGenAI, Type } from "@google/genai";
import { ParaType, AIAnalysisResult, ExistingItemContext, ChatMessage, FinanceContext, ModuleContext, TransactionType } from "../types";

// JAY'S NOTE: Helper to safely retrieve API Key
const getApiKey = (manualOverride?: string): string | undefined => {
  if (manualOverride && manualOverride.trim().length > 0) return manualOverride;
  
  try {
    // Check import.meta.env
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
       // @ts-ignore
       return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}

  try {
    // Check process.env
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) return process.env.API_KEY;
  } catch (e) {}

  return undefined;
};

export const analyzeParaInput = async (
  input: string,
  paraItems: ExistingItemContext[],
  financeContext: FinanceContext,
  moduleContext: ModuleContext[],
  chatHistory: ChatMessage[] = [], 
  manualApiKey?: string
): Promise<AIAnalysisResult> => {
  
  const apiKey = getApiKey(manualApiKey);
  if (!apiKey) throw new Error("MISSING_API_KEY");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const modelName = "gemini-3-flash-preview"; 

  const recentContext = chatHistory
    .slice(-10) // Increase history window for better conversational flow
    .map(msg => `${msg.role === 'user' ? 'User' : 'Jay'}: ${msg.text}`)
    .join('\n');

  // JAY'S NOTE: Updated Schema to support ALL operations
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
      moduleData: { 
          type: Type.OBJECT, 
          nullable: true,
          description: "Key-value pairs matching the module's schema fields (e.g. { weight: 70 }).",
          properties: {}, // Allow flexible object
      },

      reasoning: { type: Type.STRING }
    },
    required: ["operation", "chatResponse", "reasoning"]
  };

  const prompt = `
    1. ROLE & PERSONA: You are "Jay" (เจ), a Super Ultra Consultant for Ouk (พี่อุ๊ก). You are NOT a generic AI. You are a world-class expert combining:
    - Financial Planner: CFA/CFP level knowledge.
    - Productivity Coach: Expert in PARA Method & GTD.
    - Strategist: Logic-driven, data-backed decision making.

    2. MANDATORY KNOWLEDGE BASE:
    - **Finance**: 6 Jars, Maslow's Financial Needs, Rule of 72.
    - **Productivity**: PARA Method, Eisenhower Matrix.
    - **Context**: Ouk is getting married on March 21, 2026. Prioritize this goal.

    3. OPERATIONAL PROTOCOLS:
    - **Input Analysis**: Determine if the input is a Task/Project, a Financial Transaction, or Data for a specific Module.
    - **Finance Logic**: If input mentions spending/income (e.g. "lunch 100"), map to 'TRANSACTION'. Find the best matching 'accountId' from context.
    - **Module Logic**: If input matches a dynamic module's purpose (e.g. "weight 70kg" -> Health Module), map to 'MODULE_ITEM'.
    - **Tone**: Thai (Main) with Technical English. Use "พี่อุ๊ก" and "เจ". Be concise and critical if necessary.

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
    - **TRANSACTION**: Use when user spends/receives money. Must infer 'amount', 'transactionType', and 'accountId' (default to Cash/Bank if unspecified).
    - **MODULE_ITEM**: Use when user provides data relevant to a specific module (e.g. Health, Reading List). Map data to 'moduleData' based on schema fields.
    - **CREATE**: Use for Tasks, Projects, Areas, Resources.
    - **CHAT**: Use for questions, advice, or clarification.

    Output JSON only.
  `;

  try {
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
    
    // Hack for moduleData dynamic typing since Gemini schema handling for dynamic objects can be tricky
    const result = JSON.parse(text);
    return result as AIAnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      operation: 'CHAT',
      chatResponse: "ระบบเจขัดข้องชั่วคราวครับพี่อุ๊ก ขออภัยครับ (AI Error)",
      reasoning: "Error fallback"
    };
  }
};
