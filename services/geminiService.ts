
import { GoogleGenAI, Type } from "@google/genai";
import { ParaItem, ParaType, FinanceAccount, AppModule, AIAnalysisResult, HistoryLog, Transaction } from "../types";

export const analyzeLifeOS = async (
    input: string,
    apiKey: string,
    context: {
        paraItems: ParaItem[];
        financeContext: { accounts: FinanceAccount[] };
        modules: AppModule[];
        recentContext?: string;
        summariesContext?: string;
    }
): Promise<AIAnalysisResult> => {
    const { paraItems, financeContext, modules, recentContext, summariesContext } = context;

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
        title: { type: Type.STRING, nullable: true },
        summary: { type: Type.STRING, nullable: true },
        suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        relatedItemIdsCandidates: { type: Type.ARRAY, items: { type: Type.STRING }, nullable: true },
        
        // BATCH ITEMS (For BATCH_CREATE)
        batchItems: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    type: { type: Type.STRING, enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK] },
                    category: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } }
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
        required: ["operation", "chatResponse", "reasoning"]
    };

    const modulesManual = modules.map(m => {
        const fields = m.schemaConfig.fields.map(f => `${f.key} (${f.label})`).join(', ');
        return `- Module "${m.name}" (ID: ${m.id}): Fields [${fields}]`;
    }).join('\n');

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
        ${JSON.stringify(paraItems.slice(0, 50).map(i => ({id: i.id, title: i.title, type: i.type, category: i.category})))}

        [FINANCE ACCOUNTS]
        ${JSON.stringify(financeContext.accounts.map(a => ({id: a.id, name: a.name, type: a.type})))}

        --- CHAT HISTORY ---
        ${recentContext || "Start of conversation"}
        
        --- USER INPUT --- 
        "${input}"

        --- OUTPUT INSTRUCTIONS ---
        - **TRANSACTION**: Use when user spends/receives money. Must infer 'amount', 'transactionType', and 'accountId'.
        - **MODULE_ITEM**: Use when user provides data relevant to a specific module from the list above. Map data to 'moduleDataRaw'.
        - **CREATE**: Use for CREATING A SINGLE Task, Project, Area, or Resource.
        - **BATCH_CREATE**: Use when user asks to create MULTIPLE items (e.g., "List 3 tasks", "Add project and area"). Fill 'batchItems' array.
        - **CHAT**: Use for questions, advice, or clarification.
        
        CRITICAL REVIEW LOOP:
        - If the user provides a list of tasks, you MUST capture ALL of them in 'batchItems'. Do not truncate.
        - If the user asks for a Project AND Tasks, put the Project FIRST in the 'batchItems' array. The system will automatically link subsequent tasks to it.

        Output JSON only.
    `;

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
    transactions: Transaction[], 
    apiKey: string
): Promise<string> => {
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
