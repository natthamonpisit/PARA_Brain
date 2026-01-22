import { GoogleGenAI, Type } from "@google/genai";
import { ParaType, AIAnalysisResult, ExistingItemContext } from "../types";

// JAY'S NOTE: ย้ายการ init AI เข้าไปข้างในฟังก์ชันครับ
// เพื่อป้องกัน App Crash ถ้า Environment ยังไม่ได้ Set API_KEY
// ทำให้พี่อุ๊กเปิด App ขึ้นมาดู UI ได้ก่อนแม้จะยังไม่มี Key

/**
 * ฟังก์ชันหลักในการให้ AI ตัดสินใจว่าจะเอาข้อมูลไปวางตรงไหนใน PARA
 * input: ข้อความจาก user
 * existingItems: รายการของที่มีอยู่แล้ว (ส่งไปแค่ id, title, category เพื่อประหยัด token)
 */
export const analyzeParaInput = async (
  input: string,
  existingItems: ExistingItemContext[]
): Promise<AIAnalysisResult> => {
  
  // 1. Safety Check for API Key
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const modelName = "gemini-3-flash-preview"; 

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
        description: "The PARA method classification. Use 'Tasks' for specific actionable to-dos."
      },
      category: {
        type: Type.STRING,
        description: "The specific category name. Use existing categories if relevant."
      },
      title: {
        type: Type.STRING,
        description: "A clear, concise title for this note/task."
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
        description: "List of IDs from 'Existing Items' that are strongly related. IMPORTANT: If operation is 'COMPLETE', this MUST contain the ID of the task to complete."
      },
      reasoning: {
        type: Type.STRING,
        description: "Brief explanation why this fits here."
      }
    },
    required: ["operation", "type", "category", "title", "summary", "suggestedTags", "reasoning"]
  };

  const prompt = `
    You are an expert personal knowledge manager using the PARA method (Projects, Areas, Resources, Archives) + Tasks.
    
    Existing Items Context:
    ${JSON.stringify(existingItems)}
    
    User Input: "${input}"
    
    Task:
    1. Analyze the user input.
    2. Determine Intent (Operation):
       - If the user says "I finished X", "Done with Y", "Complete Z", set operation to 'COMPLETE'.
       - Otherwise, set operation to 'CREATE'.
    3. Classify into PARA + Task:
       - Projects: Goals with deadlines.
       - Areas: Responsibilities.
       - Resources: Information/Notes.
       - Tasks: Small, actionable units (e.g., "Buy milk", "Email John"). 
    4. Connect Relations:
       - Look at "Existing Items Context".
       - If creating a TASK, try to link it to an existing PROJECT or AREA ID in 'relatedItemIdsCandidates'.
       - If operation is 'COMPLETE', find the specific Task ID from context that matches the user's description and put it in 'relatedItemIdsCandidates'.
    5. Return JSON.
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
