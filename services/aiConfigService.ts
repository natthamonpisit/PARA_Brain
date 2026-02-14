import { generateId } from '../utils/helpers';

export interface CustomAiInstruction {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'para.ai.custom.instructions';

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const safeString = (value: unknown, maxLen: number): string => String(value || '').trim().slice(0, maxLen);

const getOptionalCaptureKey = (): string => {
  try {
    return String((import.meta as any)?.env?.VITE_CAPTURE_API_SECRET || '').trim();
  } catch {
    return '';
  }
};

const buildApiHeaders = (json = false): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const captureKey = getOptionalCaptureKey();
  if (captureKey) headers['x-capture-key'] = captureKey;
  return headers;
};

const normalizeInstruction = (value: any): CustomAiInstruction | null => {
  const title = safeString(value?.title, 120);
  const content = safeString(value?.content, 4000);
  if (!title || !content) return null;
  const nowIso = new Date().toISOString();
  return {
    id: safeString(value?.id, 80) || generateId(),
    title,
    content,
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : true,
    createdAt: safeString(value?.createdAt, 40) || nowIso,
    updatedAt: safeString(value?.updatedAt, 40) || nowIso
  };
};

const normalizeInstructionList = (value: unknown): CustomAiInstruction[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeInstruction(item))
    .filter(Boolean)
    .slice(0, 50) as CustomAiInstruction[];
};

const getLocalInstructions = (): CustomAiInstruction[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return normalizeInstructionList(JSON.parse(raw));
  } catch {
    return [];
  }
};

const setLocalInstructions = (instructions: CustomAiInstruction[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(instructions));
};

export const getCustomAiInstructions = async (): Promise<CustomAiInstruction[]> => {
  try {
    const response = await fetch('/api/ai-config', {
      method: 'GET',
      headers: buildApiHeaders()
    });
    if (!response.ok) throw new Error(`API failed (${response.status})`);
    const body = await response.json().catch(() => ({}));
    const normalized = normalizeInstructionList(body?.customInstructions || []);
    setLocalInstructions(normalized);
    return normalized;
  } catch {
    return getLocalInstructions();
  }
};

export const saveCustomAiInstructions = async (instructions: CustomAiInstruction[]): Promise<CustomAiInstruction[]> => {
  const normalized = normalizeInstructionList(instructions);
  try {
    const response = await fetch('/api/ai-config', {
      method: 'POST',
      headers: buildApiHeaders(true),
      body: JSON.stringify({ instructions: normalized })
    });
    if (!response.ok) throw new Error(`API failed (${response.status})`);
    const body = await response.json().catch(() => ({}));
    const saved = normalizeInstructionList(body?.customInstructions || normalized);
    setLocalInstructions(saved);
    return saved;
  } catch {
    setLocalInstructions(normalized);
    return normalized;
  }
};

export const createCustomInstruction = (title: string, content: string): CustomAiInstruction => {
  const nowIso = new Date().toISOString();
  return {
    id: generateId(),
    title: normalizeSpace(title).slice(0, 120),
    content: String(content || '').trim().slice(0, 4000),
    enabled: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };
};
