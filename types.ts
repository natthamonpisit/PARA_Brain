
// ---------------------------------------------------------------------------
// JAY'S NOTE: Core Data Structure
// ออกแบบให้ flexible ครับ ทุกอย่างคือ "Item" ที่ถูก Tag ด้วย PARA Type
// ---------------------------------------------------------------------------

export enum ParaType {
  PROJECT = 'Projects', // Goal with a deadline
  AREA = 'Areas',       // Responsibility to maintain
  RESOURCE = 'Resources', // Topic of ongoing interest
  ARCHIVE = 'Archives',   // Inactive items
  TASK = 'Tasks',        // JAY'S NOTE: New actionable unit linked to projects
  FINANCE = 'Finance'    // JAY'S NOTE: New Module for Wealth Engine
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
  
  // Sync with Supabase Schema (Optional Fields)
  emoji?: string;      // For Areas
  dueDate?: string;    // For Tasks
  deadline?: string;   // For Projects
  status?: string;     // For Projects
  energyLevel?: string;// For Tasks
}

// --- FINANCE MODULE TYPES ---

export type FinanceAccountType = 'CASH' | 'BANK' | 'CREDIT' | 'INVESTMENT';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';

export interface FinanceAccount {
  id: string;
  name: string;
  type: FinanceAccountType;
  balance: number;
  currency: string;
  isIncludeNetWorth: boolean;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  accountId: string;
  projectId?: string; // Link to PARA Project
  transactionDate: string;
}

// --- DYNAMIC MODULE TYPES (PLATFORM ENGINE) ---

export interface ModuleField {
  key: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox';
  label: string;
  options?: string[]; // For select type, comma separated in UI
}

export interface AppModule {
  id: string;
  key: string;
  name: string;
  description?: string;
  icon: string; // Lucide icon name string
  schemaConfig: {
    fields: ModuleField[];
  };
}

export interface ModuleItem {
  id: string;
  moduleId: string;
  title: string;
  data: Record<string, any>; // JSONB Data
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------

// โครงสร้างที่ส่งให้ AI ช่วยวิเคราะห์
export interface AIAnalysisResult {
  // JAY'S NOTE: Expanded operations to cover Finance and Modules
  operation: 'CREATE' | 'COMPLETE' | 'CHAT' | 'TRANSACTION' | 'MODULE_ITEM'; 
  
  // PARA Fields
  type?: ParaType;
  category?: string;
  title?: string;
  summary?: string;
  suggestedTags?: string[];
  relatedItemIdsCandidates?: string[]; 
  
  // Finance Fields
  amount?: number;
  transactionType?: TransactionType;
  accountId?: string;
  
  // Dynamic Module Fields
  targetModuleId?: string;
  moduleData?: Record<string, any>;

  // Common
  chatResponse: string; 
  reasoning: string; 
}

// Context structures for AI
export interface ExistingItemContext {
  id: string;
  title: string;
  category: string;
  type: ParaType;
  isCompleted?: boolean;
}

export interface FinanceContext {
  accounts: { id: string; name: string; balance: number }[];
}

export interface ModuleContext {
  id: string;
  name: string;
  fields: ModuleField[];
}

// JAY'S NOTE: Chat Message Structure สำหรับหน้าจอขวา
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  // ถ้า AI ทำการบันทึกข้อมูล จะแนบ Item ที่สร้างมาโชว์ด้วย
  createdItem?: ParaItem | Transaction | ModuleItem; 
  itemType?: 'PARA' | 'TRANSACTION' | 'MODULE'; // To help UI render correctly
  
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
  itemType: ParaType | 'Finance' | 'Module';
  timestamp: string;
}
