import { GoogleGenAI, Type } from "@google/genai";
import { ParaType, AIAnalysisResult, ExistingItemContext, ChatMessage } from "../types";

// JAY'S NOTE: ย้ายการ init AI เข้าไปข้างในฟังก์ชันครับ
// เพื่อป้องกัน App Crash ถ้า Environment ยังไม่ได้ Set API_KEY
// ทำให้พี่อุ๊กเปิด App ขึ้นมาดู UI ได้ก่อนแม้จะยังไม่มี Key

/**
 * ฟังก์ชันหลักในการให้ AI ตัดสินใจว่าจะเอาข้อมูลไปวางตรงไหนใน PARA
 * input: ข้อความจาก user
 * existingItems: รายการของที่มีอยู่แล้ว (ส่งไปแค่ id, title, category เพื่อประหยัด token)
 * chatHistory: ประวัติการคุยล่าสุด เพื่อให้ AI เข้าใจ Context ต่อเนื่อง
 */
export const analyzeParaInput = async (
  input: string,
  existingItems: ExistingItemContext[],
  chatHistory: ChatMessage[] = [] // JAY'S NOTE: รับ History เข้ามาวิเคราะห์
): Promise<AIAnalysisResult> => {
  
  // 1. Safety Check for API Key
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const modelName = "gemini-3-flash-preview"; 

  // เตรียม Chat Context ย้อนหลัง 5 ข้อความล่าสุด (ไม่รวมข้อความปัจจุบัน)
  const recentContext = chatHistory
    .slice(-5)
    .map(msg => `${msg.role === 'user' ? 'User' : 'AI'}: ${msg.text}`)
    .join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['CREATE', 'COMPLETE'],
        description: "Set to 'COMPLETE' ONLY if user explicitly says they finished/completed a specific task. Otherwise 'CREATE'."
      },
      type: {
        type: Type.STRING,
        enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE, ParaType.TASK],
        description: "The PARA method classification."
      },
      category: {
        type: Type.STRING,
        description: "The specific category name. IMPORTANT: Use an EXISTING category if the topic fits. Create a NEW high-level Category (Area) only if the topic is completely new."
      },
      title: {
        type: Type.STRING,
        description: "A clear, concise title."
      },
      summary: {
        type: Type.STRING,
        description: "A cleaned up version of the user's input, formatted in Markdown."
      },
      suggestedTags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "Up to 3 relevant tags."
      },
      relatedItemIdsCandidates: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "List of IDs from 'Existing Items' that are strongly related. If creating a Task/Project, link to the parent Area."
      },
      reasoning: {
        type: Type.STRING,
        description: "Brief explanation. If creating a new Area/Category, explain why it was necessary based on the conversation context."
      }
    },
    required: ["operation", "type", "category", "title", "summary", "suggestedTags", "reasoning"]
  };

  const prompt = `
    You are an expert Personal Knowledge Architect using the PARA method.
    Your goal is to organize the user's life PROACTIVELY.

    --- CONTEXT ---
    Existing Database Structure:
    ${JSON.stringify(existingItems)}

    Recent Conversation History:
    ${recentContext || "No previous context."}
    
    Current User Input: 
    "${input}"

    --- INTELLIGENT RULES ---
    1. **Context Awareness**: Analyze the "Recent Conversation History". If the user is discussing a broad topic (e.g., "World War III", "Renovating House", "Learning Python"), and the "Existing Database" lacks a corresponding AREA or PROJECT, you must CREATE it.
    
    2. **Proactive Structuring**:
       - If the user talks about a Goal (deadline driven) -> Create a PROJECT.
       - If the user talks about a Standard/Responsibility (ongoing) -> Create an AREA.
       - If the user talks about specific actions -> Create a TASK and LINK it to the relevant Project/Area (find ID in Existing Database).
       - If the user talks about knowledge/notes -> Create a RESOURCE.

    3. **Deduplication**: 
       - Before creating a new Category/Area, check "Existing Database Structure". 
       - If a similar category exists (e.g., User says "Stocks", DB has "Finance"), USE THE EXISTING ONE. Do not create duplicates.

    4. **Intent Recognition**:
       - If the user implies they finished something ("I did it", "Check off the bug fix"), set operation: 'COMPLETE'.
       - Otherwise, set operation: 'CREATE'.

    --- OUTPUT ---
    Return a JSON object matching the schema.
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
    if (error instanceof Error && error.message === "MISSING_API_KEY") {
        throw error;
    }
    
    return {
      operation: 'CREATE',
      type: ParaType.TASK,
      category: "Inbox",
      title: "Untitled Task",
      summary: input,
      suggestedTags: ["error-fallback"],
      reasoning: "AI Service unavailable, saved to Inbox.",
      relatedItemIdsCandidates: []
    };
  }
};
