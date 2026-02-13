
import { GoogleGenAI, Type } from "@google/genai";
import { ParaItem, ParaType, FinanceAccount, AppModule, AIAnalysisResult, HistoryLog, Transaction } from "../types";

// Helper to safely get API Key from various environment locations
const getApiKey = (): string => {
    try {
        if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    } catch (e) {}
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env?.GEMINI_API_KEY) return import.meta.env.GEMINI_API_KEY;
    } catch (e) {}
    return '';
};

export const analyzeLifeOS = async (
    input: string,
    context: {
        paraItems: ParaItem[];
        financeContext: { accounts: FinanceAccount[] };
        modules: AppModule[];
        recentContext?: string;
    }
): Promise<AIAnalysisResult> => {
    const { paraItems, financeContext, modules, recentContext } = context;
    
    // TIME CONTEXT
    const now = new Date();
    const dateTimeContext = `Current Date/Time: ${now.toLocaleString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    // SCHEMA DEFINITION
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
        operation: {
            type: Type.STRING,
            enum: ['CREATE', 'BATCH_CREATE', 'COMPLETE', 'CHAT', 'TRANSACTION', 'MODULE_ITEM'],
            description: "Determine the action. Use BATCH_CREATE if you need to create a Parent AND a Child together."
        },
        chatResponse: {
            type: Type.STRING,
            description: "Conversational response in Thai. Explain WHERE you put the item (e.g., 'Put in Project X under Area Y')."
        },
        
        // SINGLE ITEM FIELDS
        type: { type: Type.STRING, enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK], nullable: true },
        category: { type: Type.STRING, nullable: true },
        title: { type: Type.STRING },
        summary: { type: Type.STRING, nullable: true },
        suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        relatedItemIdsCandidates: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            nullable: true,
            description: "IDs of EXISTING Parents (Project/Area)." 
        },
        
        // BATCH ITEMS FIELDS (For creating Project + Tasks together)
        batchItems: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    tempId: { type: Type.STRING, description: "Temporary ID (e.g., 'p1', 't1') to link items within this batch." },
                    title: { type: Type.STRING },
                    type: { type: Type.STRING, enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK] },
                    category: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    // Link to EXISTING DB Items
                    relatedItemIdsCandidates: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
                    // Link to NEW Items in this batch
                    parentTempId: { type: Type.STRING, nullable: true, description: "The 'tempId' of the parent created in this batch." }
                }
            },
            nullable: true
        },

        // Finance & Module Fields
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
                required: ["key", "value"]
            }
        },
        reasoning: { type: Type.STRING }
        },
        required: ["operation", "chatResponse", "reasoning", "title"]
    };

    const prompt = `
        You are "Jay" (เจ), a Personal Life OS Architect. 
        Your goal is to organize the user's life using the **PARA Method**.
        
        **THE STANDARD PROTOCOL (STRICT RULES):**
        1. **NO ORPHANS:** Every 'Task' MUST belong to a 'Project' or an 'Area'. Do not dump items in 'Inbox' unless absolutely necessary.
        2. **AUTO-PARENTING:** 
           - If user adds a Task (e.g., "Write Chapter 1"), but no relevant Project exists:
             -> You MUST use 'BATCH_CREATE' to create the Project ("Write Book") AND the Task ("Write Chapter 1").
             -> Link the Task to the Project.
        3. **HIERARCHY SCANNING:**
           - Scan [EXISTING PARA ITEMS]. match semantic meaning, not just exact words.
           - "Jogging" -> matches Area "Health".
           - "Fix Bug" -> matches Project "Website Launch".
        4. **PROJECT PLACEMENT:** Projects MUST belong to an Area (e.g., Project "Build App" -> Area "Work" or "Side Hustle").

        **DATA CONTEXT:**
        ${dateTimeContext}
        
        [EXISTING STRUCTURE]
        ${JSON.stringify(paraItems.map(i => `ID:${i.id} | ${i.type} | "${i.title}" | Cat:${i.category}`))}

        [FINANCE ACCOUNTS]
        ${JSON.stringify(financeContext.accounts.map(a => `${a.name} (${a.id})`))}

        **USER INPUT:** "${input}"

        **INSTRUCTIONS:**
        - If input is simple (e.g. "Buy Milk"), find Area "Life Admin" or "Health". If not found, create single TASK linked to best guess Category.
        - If input implies a Project (e.g. "Plan Japan Trip"), create PROJECT "Japan Trip" linked to Area "Travel" or "Life".
        - If input implies a goal + steps, use BATCH_CREATE.
        - If input is financial, use TRANSACTION.

        Output JSON only.
    `;

    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key not found.");

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema
        }
    });

    return JSON.parse(response.text || "{}") as AIAnalysisResult;
};

export const performLifeAnalysis = async (
    logs: HistoryLog[], 
    transactions: Transaction[]
): Promise<string> => {
    const apiKey = getApiKey();
    if (!apiKey) return "Error: API Key missing.";

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
        Analyze logs and transactions (Last 30 days). Give a "Life OS Status Report" (Markdown).
        Focus on: Productivity Pulse, Financial Health, Focus Areas, Recommendations.
        Logs: ${JSON.stringify(logs.slice(0, 50))}
        Transactions: ${JSON.stringify(transactions.slice(0, 20))}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });

    return response.text || "Analysis failed.";
}

export const classifyQuickCapture = async (
    text: string,
    paraItems: ParaItem[]
): Promise<{
    title: string;
    type: ParaType;
    category: string;
    summary: string;
    confidence: number;
    suggestedTags: string[];
}> => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("API Key not found.");

    const ai = new GoogleGenAI({ apiKey });
    const now = new Date();
    const context = paraItems
        .slice(0, 80)
        .map(i => `ID:${i.id} | ${i.type} | "${i.title}" | Cat:${i.category}`)
        .join('\n');

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            type: { type: Type.STRING, enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK] },
            category: { type: Type.STRING },
            summary: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "type", "category", "summary", "confidence", "suggestedTags"]
    };

    const prompt = `
Quick Capture Classifier for PARA.
Current Date/Time: ${now.toISOString()}

Input:
"${text}"

Existing PARA context:
${context}

Rules:
1) Return the best PARA type for this capture.
2) confidence must be 0..1 (high confidence only when clear intent).
3) Keep title concise and actionable.
4) category should be realistic from user's current structure.
5) summary should preserve original intent.
Output JSON only.
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema
        }
    });

    const out = JSON.parse(response.text || '{}');
    const safeType = (Object.values(ParaType) as string[]).includes(out.type) ? out.type : ParaType.TASK;
    const conf = typeof out.confidence === 'number' ? Math.max(0, Math.min(1, out.confidence)) : 0.5;

    return {
        title: out.title || text.slice(0, 60),
        type: safeType as ParaType,
        category: out.category || 'Inbox',
        summary: out.summary || text,
        confidence: conf,
        suggestedTags: Array.isArray(out.suggestedTags) ? out.suggestedTags : []
    };
};
