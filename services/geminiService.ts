
import { GoogleGenAI, Type } from "@google/genai";
import { ParaItem, ParaType, FinanceAccount, AppModule, AIAnalysisResult, HistoryLog, Transaction } from "../types";

// Helper to safely get API Key from various environment locations
const getApiKey = (): string => {
    // 1. Try process.env (Node/Webpack/Vercel)
    try {
        if (typeof process !== 'undefined' && process.env?.API_KEY) {
            return process.env.API_KEY;
        }
    } catch (e) {}

    // 2. Try import.meta.env (Vite)
    try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_KEY) {
            // @ts-ignore
            return import.meta.env.VITE_API_KEY;
        }
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env?.API_KEY) {
            // @ts-ignore
            return import.meta.env.API_KEY;
        }
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
        summariesContext?: string;
    }
): Promise<AIAnalysisResult> => {
    const { paraItems, financeContext, modules, recentContext, summariesContext } = context;
    
    // CURRENT TIME CONTEXT (Crucial for "Tomorrow", "Next Friday")
    const now = new Date();
    const dateTimeContext = `Current Date/Time: ${now.toLocaleString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    // 4. Define Strict Output Schema
    // This ensures we get executable JSON, not just markdown text.
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
        operation: {
            type: Type.STRING,
            enum: ['CREATE', 'BATCH_CREATE', 'COMPLETE', 'CHAT', 'TRANSACTION', 'MODULE_ITEM'],
            description: "Determine the action. Use BATCH_CREATE for multiple items."
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
        // JAY'S UPGRADE: Title is NO LONGER NULLABLE. AI MUST GENERATE IT.
        title: { type: Type.STRING, description: "A short, punchy title. If user input is short, use it as title. NEVER use 'Untitled'." },
        summary: { type: Type.STRING, nullable: true },
        suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        // JAY'S FIX: Explicitly allow AI to suggest Parent IDs
        relatedItemIdsCandidates: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING }, 
            nullable: true,
            description: "Array of IDs of EXISTING Projects or Areas that this new item belongs to." 
        },
        
        // BATCH ITEMS (For BATCH_CREATE)
        batchItems: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "Must not be empty." },
                    type: { type: Type.STRING, enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK] },
                    category: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    // JAY'S FIX: Allow linking inside batch items too
                    relatedItemIdsCandidates: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true }
                }
            },
            nullable: true
        },

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
        required: ["operation", "chatResponse", "reasoning", "title"] // Title is now required
    };

    const modulesManual = modules.map(m => {
        const fields = m.schemaConfig.fields.map(f => `${f.key} (${f.label})`).join(', ');
        return `- Module "${m.name}" (ID: ${m.id}): Fields [${fields}]`;
    }).join('\n');

    const prompt = `
        1. ROLE & PERSONA: You are "Jay" (เจ), a Personal Life OS Architect for Ouk.
        - **Personality**: Smart, proactive, concise, encouraging, and organized. You speak Thai (Main) mixed with technical English terms.
        - **Core Logic**: You never create items named "Untitled". You always infer a title from the context.
        
        2. **JAY'S CORE FUNCTION MEMORY**:
           - **PARA Brain**: Organize Tasks, Projects, Areas.
           - **Wealth Engine**: Track Finances.
           - **Dynamic Modules**: Handle custom data modules based on the Schema provided below.

        3. **TIME AWARENESS**:
           ${dateTimeContext}
           (Use this to calculate Due Dates correctly. e.g., "Next Friday" means calculate from today)

        4. **DYNAMIC MODULES SCHEMA (Updated Live)**:
           The user has defined the following custom modules. You MUST use these IDs and Field Keys when mapping 'MODULE_ITEM'.
           
           ${modulesManual || "No custom modules found."}

        --- DATA CONTEXT ---
        
        [EXISTING PARA ITEMS (ID: Title [Type])]
        ${JSON.stringify(paraItems.slice(0, 100).map(i => `${i.id}: ${i.title} [${i.type}]`))}

        [FINANCE ACCOUNTS]
        ${JSON.stringify(financeContext.accounts.map(a => ({id: a.id, name: a.name, type: a.type})))}

        --- CHAT HISTORY ---
        ${recentContext || "Start of conversation"}
        
        --- USER INPUT --- 
        "${input}"

        --- INTELLIGENT RULES ---
        1. **TITLE GENERATION**: 
           - If user says "Buy Milk", Title = "Buy Milk".
           - If user says a long sentence, SUMMARIZE it into a Title (max 5-7 words).
        
        2. **SMART LINKING (CRITICAL)**:
           - Scan [EXISTING PARA ITEMS] to find a relevant Parent (Project or Area).
           - Example: If user says "Fix nav bug", and there is a Project "Launch Website", you MUST return its ID in 'relatedItemIdsCandidates'.
           - Example: If user says "Run 5km", and there is an Area "Health", link it!
           - **Do NOT** leave items floating in "Inbox" if they clearly belong to an existing Project/Area.

        3. **CATEGORIZATION**:
           - Use the Category of the Parent item if linked.
           - Otherwise, infer a smart category (e.g., Work, Personal, Dev).

        4. **TRANSACTION**:
           - If input involves money, use 'TRANSACTION'.

        Output JSON only.
    `;

    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("API Key not found. Please check VITE_API_KEY in .env");
    }

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
    if (!apiKey) {
        return "Error: API Key missing. Cannot perform analysis.";
    }

    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
        Analyze the following user activity logs and financial transactions from the last 30 days.
        Provide a "Life OS Status Report" in Markdown format.
        
        Structure:
        1. **Productivity Pulse**: Analysis of completed tasks and created projects.
        2. **Financial Health**: Summary of spending vs income patterns.
        3. **Focus Areas**: Which areas (Health, Work, etc.) got the most attention?
        4. **Recommendations**: 3 actionable tips to improve organization next week.

        [ACTIVITY LOGS]
        ${JSON.stringify(logs.slice(0, 50))}

        [TRANSACTIONS]
        ${JSON.stringify(transactions.slice(0, 20))}
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt
    });

    return response.text || "Analysis failed.";
}
