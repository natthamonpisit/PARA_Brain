export interface CustomAiInstruction {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const normalizeSpace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const toIsoNow = (): string => new Date().toISOString();

const toSafeString = (value: unknown, maxLen: number): string => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.slice(0, maxLen);
};

const toSafeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  return fallback;
};

const createId = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const normalizeCustomAiInstructions = (value: unknown): CustomAiInstruction[] => {
  if (!Array.isArray(value)) return [];
  const nowIso = toIsoNow();

  return value
    .map((row: any): CustomAiInstruction | null => {
      const title = toSafeString(row?.title, 120);
      const content = toSafeString(row?.content, 4000);
      if (!title || !content) return null;
      return {
        id: toSafeString(row?.id, 80) || createId(),
        title,
        content,
        enabled: toSafeBoolean(row?.enabled, true),
        createdAt: toSafeString(row?.createdAt, 40) || nowIso,
        updatedAt: toSafeString(row?.updatedAt, 40) || nowIso
      };
    })
    .filter(Boolean)
    .slice(0, 50) as CustomAiInstruction[];
};

export const extractCustomInstructionsFromPreferences = (preferences: any): CustomAiInstruction[] => {
  const raw = preferences?.ai_custom_instructions;
  return normalizeCustomAiInstructions(raw);
};

export const toRuntimeInstructionSnippets = (
  instructions: CustomAiInstruction[],
  maxItems = 12
): string[] => {
  return instructions
    .filter((item) => item.enabled !== false)
    .map((item) => {
      const title = normalizeSpace(item.title);
      const content = normalizeSpace(item.content).slice(0, 1200);
      return title ? `[${title}] ${content}` : content;
    })
    .filter(Boolean)
    .slice(0, maxItems);
};
