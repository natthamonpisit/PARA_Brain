
// ---------------------------------------------------------------------------
// 🧠 JAY'S LIFE OS: DATA DNA
// ---------------------------------------------------------------------------
//
// [PHILOSOPHY]
// This file defines the shape of the user's life. 
// We distinguish between:
// 1. "Hard" Types (PARA, Finance) - Things that require specific business logic.
// 2. "Soft" Types (Modules) - Flexible data containers for anything else.
//
// [AI INTERACTION]
// The AIAnalysisResult interface is crucial. It acts as the API Contract 
// between the fuzzy world of LLMs (Gemini) and the strict world of App Code.
// ---------------------------------------------------------------------------

export enum ParaType {
  PROJECT = 'Projects', // Goal with a deadline
  AREA = 'Areas',       // Responsibility to maintain
  RESOURCE = 'Resources', // Topic of ongoing interest
  ARCHIVE = 'Archives',   // Inactive items
  TASK = 'Tasks',        // JAY'S NOTE: New actionable unit linked to projects
  FINANCE = 'Finance'    // JAY'S NOTE: New Module for Wealth Engine
}

export type ViewMode = 'GRID' | 'LIST' | 'TABLE';

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
// This allows the user to build their own "mini-apps" inside the system.
// The AI reads this schema to understand how to insert data.

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
// AI INTERFACE LAYER
// This is the structure we force Gemini to output.
// ---------------------------

export interface AIAnalysisResult {
  // JAY'S NOTE: The 'Dispatcher' Field. This tells the UI Hook what function to call.
  operation: 'CREATE' | 'COMPLETE' | 'CHAT' | 'TRANSACTION' | 'MODULE_ITEM' | 'SUMMARY'; 
  
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

// Context structures for AI (What we feed INTO the brain)
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

// Chat Message Structure for UI
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  // If AI took an action, we attach the object here to render a nice UI card
  createdItem?: ParaItem | Transaction | ModuleItem; 
  itemType?: 'PARA' | 'TRANSACTION' | 'MODULE'; 
  
  // Suggestion UI for completing tasks
  suggestedCompletionItems?: ParaItem[];
  timestamp: Date;
}

// Activity Logging (Audit Trail)
export type HistoryAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'COMPLETE' | 'DAILY_SUMMARY';

export interface HistoryLog {
  id: string;
  action: HistoryAction;
  itemTitle: string;
  itemType: ParaType | 'Finance' | 'Module' | 'System';
  timestamp: string;
}

// Memory System (Long Term)
export interface DailySummary {
  id: string;
  date: string; // YYYY-MM-DD
  summary: string;
  key_achievements: string[];
  mood?: string;
  created_at: string;
}

// Line Debugger Logs
export interface SystemLog {
  id: string;
  event_source: 'LINE' | 'WEB';
  user_message: string;
  ai_response: string;
  action_type: string;
  status: 'SUCCESS' | 'FAILED';
  created_at: string;
}
