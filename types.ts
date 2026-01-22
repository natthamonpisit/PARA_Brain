// ---------------------------------------------------------------------------
// JAY'S NOTE: Core Data Structure
// ออกแบบให้ flexible ครับ ทุกอย่างคือ "Item" ที่ถูก Tag ด้วย PARA Type
// ---------------------------------------------------------------------------

export enum ParaType {
  PROJECT = 'Projects', // Goal with a deadline
  AREA = 'Areas',       // Responsibility to maintain
  RESOURCE = 'Resources', // Topic of ongoing interest
  ARCHIVE = 'Archives'   // Inactive items
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
}

// โครงสร้างที่ส่งให้ AI ช่วยวิเคราะห์
export interface AIAnalysisResult {
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
}
