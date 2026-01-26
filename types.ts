
export enum ParaType {
  PROJECT = 'Projects',
  AREA = 'Areas',
  RESOURCE = 'Resources',
  ARCHIVE = 'Archives',
  TASK = 'Tasks',
}

export type ViewMode = 'GRID' | 'LIST' | 'TABLE' | 'CALENDAR' | 'HABIT' | 'HIERARCHY';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type FinanceAccountType = 'BANK' | 'CASH' | 'CREDIT' | 'INVESTMENT';
export type HistoryAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'COMPLETE';

export interface ParaItem {
  id: string;
  title: string;
  content: string;
  type: ParaType;
  category: string;
  tags: string[];
  isCompleted?: boolean;
  isAiGenerated?: boolean;
  relatedItemIds?: string[];
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  deadline?: string;
  status?: string;
  energyLevel?: string;
  emoji?: string;
  attachments?: string[];
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  category: string;
  accountId: string;
  projectId?: string;
  transactionDate: string;
}

export interface FinanceAccount {
  id: string;
  name: string;
  type: FinanceAccountType;
  balance: number;
  currency: string;
  isIncludeNetWorth: boolean;
}

export interface ModuleField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox';
  options?: string[];
}

export interface AppModule {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  schemaConfig: {
    fields: ModuleField[];
  };
}

export interface ModuleItem {
  id: string;
  moduleId: string;
  title: string;
  data: Record<string, any>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HistoryLog {
  id: string;
  action: HistoryAction;
  itemTitle: string;
  itemType: string;
  timestamp: string;
}

export interface DailySummary {
  date: string;
  summary: string;
  mood?: string;
  completedTasksCount: number;
}

export interface SystemLog {
  id: string;
  event_source: string;
  event_id: string;
  user_message: string;
  ai_response?: string;
  action_type?: string;
  status: string;
  created_at: string;
}

export interface AIAnalysisResult {
  // JAY'S NOTE: The 'Dispatcher' Field. This tells the UI Hook what function to call.
  // Added BATCH_CREATE for multiple items support
  operation: 'CREATE' | 'BATCH_CREATE' | 'COMPLETE' | 'CHAT' | 'TRANSACTION' | 'MODULE_ITEM' | 'SUMMARY'; 
  
  // PARA Fields (Single)
  type?: ParaType;
  category?: string;
  title?: string;
  summary?: string;
  suggestedTags?: string[];
  relatedItemIdsCandidates?: string[];
  
  // BATCH ITEMS (For BATCH_CREATE)
  batchItems?: {
      title: string;
      type: ParaType;
      category: string;
      summary: string;
      suggestedTags: string[];
  }[];

  // Finance Fields
  amount?: number;
  transactionType?: TransactionType;
  accountId?: string;

  // Module Fields
  targetModuleId?: string;
  moduleDataRaw?: {
      key: string;
      value: string;
  }[];

  chatResponse: string;
  reasoning?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  createdItem?: ParaItem | Transaction | ModuleItem;
  createdItems?: ParaItem[]; // For batch
  suggestedCompletionItems?: ParaItem[];
  itemType?: 'PARA' | 'TRANSACTION' | 'MODULE';
}
