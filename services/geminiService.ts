
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
    .slice(-10) // Increase history window for better conversational flow
    .map(msg => `${msg.role === 'user' ? 'User' : 'Jay'}: ${msg.text}`)
    .join('\n');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      operation: {
        type: Type.STRING,
        enum: ['CREATE', 'COMPLETE', 'CHAT'],
        description: "Choose 'CHAT' if suggesting a missing parent (Area/Project) or asking for details. Choose 'CREATE' only when the parent exists or the user insists."
      },
      chatResponse: {
        type: Type.STRING,
        description: "Your conversational response in Thai. If a parent Area is missing, explain why we should create it first."
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
        description: "IDs of related items (e.g. Area parent of a Project, or Project parent of a Task)."
      },
      reasoning: {
        type: Type.STRING,
        description: "Internal explanation."
      }
    },
    required: ["operation", "chatResponse", "reasoning"]
  };

  const prompt = `
    คุณคือ "เจ" (Jay) สถาปนิกทางความคิดส่วนตัว (Personal Architect & Mentor)
    เป้าหมายของคุณคือช่วยผู้ใช้จัดระเบียบชีวิตด้วยวิธี PARA Method โดยเน้นการสร้างความเชื่อมโยง (Relations)

    --- กฎเหล็กของ PARA (Hierarchy Logic) ---
    คุณต้องตรวจสอบความสัมพันธ์ของข้อมูล (Existing Items) ก่อนตัดสินใจสร้างเสมอ:

    1. **Project ต้องมี Area (Parent Check)**: 
       - หากผู้ใช้ต้องการสร้าง Project ใหม่ (เช่น "ทำเว็บใหม่") ให้ตรวจสอบรายการ 'Areas' ใน Database ก่อน
       - **Case A: ยังไม่มี Area ที่เหมาะสม** (เช่น มีแค่ Health แต่จะทำ Coding):
         - **ห้าม** สร้าง Project ทันที
         - ให้ตอบกลับด้วย **CHAT** เพื่อเสนอให้สร้าง Area ก่อน เช่น "พี่อุ๊กครับ โปรเจกต์นี้ดูเหมือนจะเป็นเรื่องงาน/Coding แต่เรายังไม่มี Area ด้านนี้เลย ให้เจช่วยสร้าง Area 'Coding' ให้ก่อนไหมครับ?"
       - **Case B: มี Area อยู่แล้ว**:
         - ให้สร้าง Project ได้เลย และ **ต้อง** ใส่ ID ของ Area นั้นลงใน \`relatedItemIdsCandidates\`

    2. **Task ต้องมี Project**:
       - งานชิ้นเล็กๆ ควรสังกัด Project เสมอ ถ้าหาไม่เจอ ให้ถามหรือเสนอสร้าง Project

    --- กฎการสนทนา ---
    1. **เน้นคุย (CHAT First)**: อย่าเพิ่งรีบจด ถ้าข้อมูลไม่ครบหรือขาดความเชื่อมโยง
    2. **Smart Linking**: หน้าที่ของคุณคือการผูกโยงข้อมูล ถ้าผู้ใช้ลืม คุณต้องเตือน

    --- ข้อมูลปัจจุบัน (Database) ---
    ${JSON.stringify(existingItems)}

    --- ประวัติการคุย ---
    ${recentContext || "เริ่มบทสนทนาใหม่"}
    
    --- คำสั่งล่าสุดของผู้ใช้ --- 
    "${input}"

    --- วิธีตัดสินใจเลือก Operation ---
    - **CHAT**: ใช้เมื่อต้องถามเพิ่ม, เสนอสร้าง Area ที่ขาดหายไป, หรือให้คำปรึกษา
    - **CREATE**: ใช้เมื่อโครงสร้างครบถ้วน (มี Parent รองรับ) และผู้ใช้ยืนยัน
    - **COMPLETE**: ใช้เมื่อผู้ใช้บอกว่าทำเสร็จแล้ว

    ส่งคำตอบเป็น JSON ตามโครงสร้างที่กำหนด
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
      chatResponse: "ขอโทษครับพี่อุ๊ก พอดีเจมึนๆ นิดหน่อย รบกวนพี่พิมพ์ใหม่อีกทีได้ไหมครับ?",
      reasoning: "Error fallback"
    };
  }
};
