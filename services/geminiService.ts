
import { GoogleGenAI, Type } from "@google/genai";
import { ParaType, AIAnalysisResult, ExistingItemContext, ChatMessage } from "../types";

// JAY'S NOTE: Helper to safely retrieve API Key
const getApiKey = (manualOverride?: string): string | undefined => {
  if (manualOverride && manualOverride.trim().length > 0) return manualOverride;
  try {
    // @ts-ignore
    if (import.meta && import.meta.env) {
       // @ts-ignore
       if (import.meta.env.VITE_API_KEY) return import.meta.env.VITE_API_KEY;
    }
  } catch (e) {}
  if (typeof process !== 'undefined' && process.env && process.env.API_KEY) return process.env.API_KEY;
  return undefined;
};

export const analyzeParaInput = async (
  input: string,
  existingItems: ExistingItemContext[],
  chatHistory: ChatMessage[] = [], 
  manualApiKey?: string
): Promise<AIAnalysisResult> => {
  
  const apiKey = getApiKey(manualApiKey);
  if (!apiKey) throw new Error("MISSING_API_KEY");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const modelName = "gemini-3-flash-preview"; 

  const recentContext = chatHistory
    .slice(-8) // ส่ง context เยอะขึ้นเพื่อให้คุยรู้เรื่องขึ้น
    .map(msg => `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.text}`)
    .join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['CREATE', 'COMPLETE', 'CHAT'],
        description: "'CHAT' for conversation/advice only. 'CREATE' to save info. 'COMPLETE' to finish tasks."
      },
      chatResponse: {
        type: Type.STRING,
        description: "Your human-like response. Be supportive, ask follow-up questions, provide mentorship or advice. This is the main text the user sees."
      },
      type: {
        type: Type.STRING,
        enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK],
        nullable: true
      },
      category: { type: Type.STRING, nullable: true },
      title: { type: Type.STRING, nullable: true },
      summary: { type: Type.STRING, nullable: true, description: "Markdown summary if creating an item." },
      suggestedTags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        nullable: true
      },
      relatedItemIdsCandidates: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "IDs of related items from the provided list."
      },
      reasoning: {
        type: Type.STRING,
        description: "Internal explanation for why you chose this action."
      }
    },
    required: ["operation", "chatResponse", "reasoning"]
  };

  const prompt = `
    You are NOT a database entry tool. You are a **Brilliant Personal Architect and Mentor** named "Jay".
    Your mission is to help the user organize their life using the PARA method, but also to provide insight, coaching, and meaningful conversation.

    --- YOUR PERSONALITY ---
    - **Insightful**: Don't just record what the user says. Suggest "Why" and "How" to make it better.
    - **Proactive**: If they mention a goal, suggest breaking it into specific tasks.
    - **Curious**: Ask follow-up questions to understand the context. (e.g., "That sounds like a big project! Do you have a deadline in mind?")
    - **Empathetic**: If they sound overwhelmed, offer support before organizing.

    --- CONTEXT ---
    Existing Database:
    ${JSON.stringify(existingItems)}

    Conversation History:
    ${recentContext || "New conversation started."}
    
    User Input: 
    "${input}"

    --- DECISION LOGIC ---
    1. **CHAT**: Choose this if the user is just talking, asking for advice, or if you need more info before creating something.
    2. **CREATE**: Choose this if the user provides clear information that SHOULD be saved (e.g., a new idea, a specific task, a project goal). 
    3. **COMPLETE**: Choose this if the user implies they are finished with something already in the DB.

    --- RULES ---
    - If choosing CREATE, use the PARA method rules: Project (Deadline), Area (Responsibility), Resource (Interest).
    - In 'chatResponse', address the user directly. Be conversational. Don't be too formal. Use a friendly tone.
    - If the user says something vague, use 'CHAT' to ask for clarification instead of creating an "Untitled Task".

    Return valid JSON.
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
    
    return JSON.parse(text) as AIAnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      operation: 'CHAT',
      chatResponse: "I'm sorry, I'm having a bit of a brain fog. Can you repeat that?",
      reasoning: "Error fallback"
    };
  }
};
