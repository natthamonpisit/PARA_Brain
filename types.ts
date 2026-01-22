// ---------------------------------------------------------------------------
// JAY'S NOTE: Core Data Structure
// ออกแบบให้ flexible ครับ ทุกอย่างคือ "Item" ที่ถูก Tag ด้วย PARA Type
// ---------------------------------------------------------------------------

export enum ParaType {
  PROJECT = 'Projects', // Goal with a deadline
  AREA = 'Areas',       // Responsibility to maintain
  RESOURCE = 'Resources', // Topic of ongoing interest
  ARCHIVE = 'Archives',   // Inactive items
  TASK = 'Tasks'        // JAY'S NOTE: New actionable unit linked to projects
}

export interface ParaItem {
  id: string;
  title: string;
  content: string; // Markdown supported
  type: ParaType;
  category: string; // เช่น "Health", "Renovation", "Coding" (AI จะช่วย group ให้)
  tags: string[];
  // JAY'S NOTE: เพิ่ม field นี้เพื่อทำ Relation Database แบบง่ายๆ
  relatedItemIds?: string[]; 
  createdAt: string;
  updatedAt: string;
  isAiGenerated?: boolean;
  // JAY'S NOTE: New field for Tasks
  isCompleted?: boolean;
}

// โครงสร้างที่ส่งให้ AI ช่วยวิเคราะห์
export interface AIAnalysisResult {
  operation: 'CREATE' | 'COMPLETE'; // AI ตัดสินใจว่าจะสร้างใหม่ หรือ แค่จะมาปิดงาน
  type: ParaType;
  category: string;
  title: string;
  summary: string;
  suggestedTags: string[];
  // JAY'S NOTE: ให้ AI ช่วยหาว่า item นี้ควร connect กับ item ไหนที่มีอยู่แล้ว
  relatedItemIdsCandidates?: string[]; 
  reasoning: string; // ให้ AI อธิบายว่าทำไมถึงจัดเข้าหมวดนี้
}

// Minimal structure sent to AI for context (save tokens)
export interface ExistingItemContext {
  id: string;
  title: string;
  category: string;
  type: ParaType;
  isCompleted?: boolean;
}

// JAY'S NOTE: Chat Message Structure สำหรับหน้าจอขวา
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  // ถ้า AI ทำการบันทึกข้อมูล จะแนบ Item ที่สร้างมาโชว์ด้วย
  createdItem?: ParaItem; 
  // JAY'S NOTE: ถ้า AI เสนอให้ปิดงาน จะส่งรายการ Task ที่น่าสงสัยมาให้ User กดเลือก
  suggestedCompletionItems?: ParaItem[];
  timestamp: Date;
}

// JAY'S NOTE: Structure สำหรับเก็บ History Log
export type HistoryAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'COMPLETE';

export interface HistoryLog {
  id: string;
  action: HistoryAction;
  itemTitle: string;
  itemType: ParaType;
  timestamp: string;
}
