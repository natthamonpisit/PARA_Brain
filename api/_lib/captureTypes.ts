// ─── Capture Pipeline — Types & Interfaces ────────────────────────────────────
// All shared types for the capture pipeline modules.

export type CaptureSource = 'WEB' | 'TELEGRAM';
export type CaptureOperation = 'CREATE' | 'TRANSACTION' | 'MODULE_ITEM' | 'COMPLETE' | 'CHAT';
export type CaptureIntent =
  | 'CHITCHAT'
  | 'ACTIONABLE_NOTE'
  | 'PROJECT_IDEA'
  | 'TASK_CAPTURE'
  | 'RESOURCE_CAPTURE'
  | 'FINANCE_CAPTURE'
  | 'COMPLETE_TASK'
  | 'MODULE_CAPTURE';
export type CaptureItemType = 'PARA' | 'TRANSACTION' | 'MODULE';

export interface DedupHints {
  isDuplicate: boolean;
  reason: string;
  method?: 'EXACT_MESSAGE' | 'URL_MATCH' | 'SEMANTIC_VECTOR' | 'NONE';
  similarity?: number;
  matchedItemId?: string;
  matchedTable?: string;
  matchedTitle?: string;
  matchedLink?: string;
  matchedLogId?: string;
  matchedActionType?: string;
  matchedStatus?: string;
  exactMessageNoWriteIgnored?: boolean;
}

export interface SessionTurn {
  userMessage: string;
  intent?: string;
  actionType?: string;
  createdTitle?: string;
  projectTitle?: string;
  areaTitle?: string;
}

export interface CaptureContext {
  projects: any[];
  areas: any[];
  tasks: any[];
  resources: any[];
  accounts: any[];
  modules: any[];
}

export interface AreaRoutingDecision {
  applied: boolean;
  reason: string;
  ruleVersion?: string;
  areaName?: string;
  suggestedProjectTitle?: string;
  ensureProjectLink?: boolean;
  extraTags?: string[];
}

export interface CaptureModelOutput {
  intent?: CaptureIntent;
  confidence?: number;
  isActionable?: boolean;
  operation?: CaptureOperation;
  chatResponse?: string;
  title?: string;
  summary?: string;
  category?: string;
  type?: 'Tasks' | 'Projects' | 'Resources' | 'Areas' | 'Archives';
  relatedItemId?: string;
  relatedProjectTitle?: string;
  relatedAreaTitle?: string;
  createProjectIfMissing?: boolean;
  askForParent?: boolean;
  clarifyingQuestion?: string;
  suggestedTags?: string[];
  dueDate?: string;
  amount?: number;
  transactionType?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  accountId?: string;
  targetModuleId?: string;
  moduleDataRaw?: Array<{ key: string; value: string }>;
  dedupRecommendation?: 'NEW' | 'LIKELY_DUPLICATE' | 'DUPLICATE';
  goal?: string;
  assumptions?: string[];
  prerequisites?: string[];
  starterTasks?: Array<{ title: string; description?: string }>;
  nextActions?: string[];
  clarifyingQuestions?: string[];
  riskNotes?: string[];
  recommendedProjectTitle?: string;
  recommendedAreaTitle?: string;
}

export interface ConfirmCommand {
  force: boolean;
  message: string;
  completeTarget?: string;
}

export interface MessageHints {
  tags: string[];
  areaHint: string | null;
}

export interface JayMemoryEntry {
  key: string;
  value: string;
  category: string;
  confidence: number;
  source?: string;
}

export interface JayLearningEntry {
  lesson: string;
  category: string;
  outcome: string;
}

export interface CapturePipelineInput {
  supabase: any;
  userMessage: string;
  source: CaptureSource;
  geminiApiKey: string;
  approvalGatesEnabled?: boolean;
  timezone?: string;
  excludeLogId?: string;
}

export interface CapturePipelineResult {
  success: boolean;
  source: CaptureSource;
  intent: CaptureIntent;
  confidence: number;
  isActionable: boolean;
  operation: CaptureOperation;
  chatResponse: string;
  itemType?: CaptureItemType;
  createdItem?: Record<string, any> | null;
  createdItems?: Record<string, any>[];
  actionType: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'SKIPPED_DUPLICATE';
  dedup: DedupHints;
  meta?: Record<string, any>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PARA_TYPE_TO_TABLE: Record<string, string> = {
  Tasks: 'tasks',
  Projects: 'projects',
  Resources: 'resources',
  Areas: 'areas',
  Archives: 'archives'
};

export const DEFAULT_INTENT: CaptureIntent = 'CHITCHAT';
export const DEFAULT_OPERATION: CaptureOperation = 'CHAT';
export const CONFIDENCE_CONFIRM_THRESHOLD = Number(process.env.CAPTURE_CONFIRM_THRESHOLD || 0.72);
export const SEMANTIC_DEDUP_THRESHOLD = Number(process.env.CAPTURE_SEMANTIC_DEDUP_THRESHOLD || 0.9);
export const ALFRED_AUTO_CAPTURE_ENABLED = process.env.ALFRED_AUTO_CAPTURE_ENABLED !== 'false';
export const CAPTURE_MODEL_NAME = process.env.CAPTURE_MODEL_NAME || 'gemini-3-flash-preview';
export const WRITE_ACTION_TYPES = new Set(['CREATE_PARA', 'CREATE_TX', 'CREATE_MODULE', 'COMPLETE_TASK']);
