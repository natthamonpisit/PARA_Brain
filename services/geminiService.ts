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
      type: {
        type: Type.STRING,
        enum: [ParaType.PROJECT, ParaType.AREA, ParaType.RESOURCE, ParaType.ARCHIVE],
        description: "The PARA method classification based on user input."
      },
      category: {
        type: Type.STRING,
        description: "The specific category name. Use existing categories if relevant."
      },
      title: {
        type: Type.STRING,
        description: "A clear, concise title for this note."
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
        description: "List of IDs from 'Existing Items' that are strongly related to this new input."
      },
      reasoning: {
        type: Type.STRING,
        description: "Brief explanation why this fits here."
      }
    },
    required: ["type", "category", "title", "summary", "suggestedTags", "reasoning"]
  };

  const prompt = `
    You are an expert personal knowledge manager using the PARA method (Projects, Areas, Resources, Archives).
    
    Existing Items Context:
    ${JSON.stringify(existingItems)}
    
    User Input: "${input}"
    
    Task:
    1. Analyze the user input.
    2. Classify it into one of the PARA types.
    3. Determine a Category. Prefer using one from the "Existing Items" list if it fits well.
    4. **CRITICAL**: Look at "Existing Items Context". Does this new input relate to any existing items? 
       - If yes, add their IDs to 'relatedItemIdsCandidates'.
       - Example: If input is "Buy running shoes" and there is an existing Area "Health" or Project "Marathon", link them.
    5. Generate a clean Title and Summary.
    6. Return the result in JSON format.
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
    // Rethrow specific errors so App.tsx can handle them nicely
    if (error instanceof Error && error.message === "MISSING_API_KEY") {
        throw error;
    }
    
    // Fallback for other AI errors
    return {
      type: ParaType.RESOURCE,
      category: "Inbox",
      title: "Untitled Note",
      summary: input,
      suggestedTags: ["error-fallback"],
      reasoning: "AI Service unavailable, saved to Inbox.",
      relatedItemIdsCandidates: []
    };
  }
};
