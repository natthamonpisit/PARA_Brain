// ─── pulseStorage ─────────────────────────────────────────────────────────────
// All types, constants, local-storage helpers, snapshot normalisation, and
// feedback persistence for the World Pulse feature.
// No network calls live here — see pulseApi.ts for those.

export type PulseTrustTier = 'A' | 'B' | 'C' | 'UNKNOWN';
export type PulseProvider = 'RSS' | 'EXA' | 'EXA+FIRECRAWL' | 'MIXED' | 'FALLBACK';
export type PulseRegion = 'TH' | 'GLOBAL';

export interface PulseCitation {
  label: string;
  url: string;
  publisher?: string;
  publishedAt?: string;
  retrievedAt?: string;
  provider?: PulseProvider;
  evidence?: string;
}

export interface PulseArticle {
  id: string;
  title: string;
  summary: string;
  url: string;
  source: string;
  sourceUrl?: string;
  publishedAt: string;
  trustTier: PulseTrustTier;
  category: string;
  keywords: string[];
  domain?: string;
  confidenceScore?: number;
  confidenceLabel?: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReasons?: string[];
  relevanceBias?: number;
  provider?: PulseProvider;
  citations?: PulseCitation[];
  region?: PulseRegion;
}

export interface PulseCategorySnapshot {
  id?: string;
  name: string;
  region?: PulseRegion;
  query: string;
  trustedSources?: string[];
  articles: PulseArticle[];
}

export interface PulseSectionSnapshot {
  id: PulseRegion;
  label: string;
  categories: PulseCategorySnapshot[];
}

export interface PulseTrendSignal {
  label: string;
  count: number;
  categories: string[];
}

export interface PulseSourceCoverage {
  source: string;
  tier: PulseTrustTier;
  count: number;
}

export interface ThailandPulseSnapshot {
  id: string;
  dateKey: string;
  generatedAt: string;
  interests: string[];
  categories: PulseCategorySnapshot[];
  sections?: PulseSectionSnapshot[];
  trends: PulseTrendSignal[];
  sourceCoverage: PulseSourceCoverage[];
  notes: string[];
  isFallback?: boolean;
  provider?: PulseProvider;
  quality?: {
    scoringVersion: string;
    feedbackSignals: number;
    allowDomains: string[];
    denyDomains: string[];
  };
}

export interface PulseSourcePolicy {
  allowDomains: string[];
  denyDomains: string[];
}

// ─── constants ────────────────────────────────────────────────────────────────

const SNAPSHOT_STORAGE_KEY   = 'para-thailand-pulse-snapshots-v1';
const INTEREST_STORAGE_KEY   = 'para-thailand-pulse-interests-v1';
const SOURCE_POLICY_STORAGE_KEY = 'para-thailand-pulse-source-policy-v1';
const FEEDBACK_STORAGE_KEY   = 'para-thailand-pulse-feedback-v1';

const MAX_HISTORY_DAYS = 7;
const MAX_INTERESTS    = 12;

export const DEFAULT_PULSE_INTERESTS = [
  'Technology', 'AI', 'Economic', 'Political', 'Business'
];

const REGION_LABEL: Record<PulseRegion, string> = { TH: 'Thailand', GLOBAL: 'Global' };

// ─── input sanitisers ─────────────────────────────────────────────────────────

const cleanInterest = (value: string) => value.trim().replace(/\s+/g, ' ');

const cleanDomain = (value: string) =>
  value.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '');

export const sanitizeInterests = (values: string[]): string[] => {
  const unique = new Set<string>();
  values.forEach(v => { const c = cleanInterest(v); if (c) unique.add(c); });
  return Array.from(unique).slice(0, MAX_INTERESTS);
};

export const sanitizeDomains = (values: string[]): string[] => {
  const unique = new Set<string>();
  values.forEach(v => { const c = cleanDomain(v); if (c) unique.add(c); });
  return Array.from(unique).slice(0, 80);
};

// ─── safe JSON parse ──────────────────────────────────────────────────────────

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
};

// ─── snapshot normalisation ───────────────────────────────────────────────────

const toDateKey = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
};

const toRegion = (value: unknown): PulseRegion => (value === 'GLOBAL' ? 'GLOBAL' : 'TH');

const normalizeCategory = (
  category: PulseCategorySnapshot,
  regionHint?: PulseRegion
): PulseCategorySnapshot => {
  const region = category.region ? toRegion(category.region) : regionHint;
  return {
    ...category,
    region,
    trustedSources: Array.isArray(category.trustedSources)
      ? category.trustedSources.map(s => String(s || '').trim()).filter(Boolean).slice(0, 3)
      : []
  };
};

const sectionsFromCategories = (categories: PulseCategorySnapshot[]): PulseSectionSnapshot[] => {
  const grouped: Record<PulseRegion, PulseCategorySnapshot[]> = { TH: [], GLOBAL: [] };
  categories.forEach(cat => {
    const region = toRegion(cat.region);
    grouped[region].push(normalizeCategory(cat, region));
  });
  return (['TH', 'GLOBAL'] as PulseRegion[])
    .filter(region => grouped[region].length > 0)
    .map(region => ({ id: region, label: REGION_LABEL[region], categories: grouped[region] }));
};

export const normalizeSnapshot = (snapshot: ThailandPulseSnapshot): ThailandPulseSnapshot => {
  const categories = Array.isArray(snapshot.categories)
    ? snapshot.categories.map(cat => normalizeCategory(cat))
    : [];

  if (Array.isArray(snapshot.sections) && snapshot.sections.length > 0) {
    const sections = snapshot.sections.map(section => {
      const id = toRegion(section.id);
      return {
        id,
        label: String(section.label || REGION_LABEL[id]),
        categories: Array.isArray(section.categories)
          ? section.categories.map(cat => normalizeCategory(cat, id))
          : []
      };
    });
    return { ...snapshot, categories: sections.flatMap(s => s.categories), sections };
  }

  return { ...snapshot, categories, sections: sectionsFromCategories(categories) };
};

// ─── snapshot history ─────────────────────────────────────────────────────────

const sortSnapshots = (snapshots: ThailandPulseSnapshot[]) =>
  [...snapshots].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

const trimHistory = (snapshots: ThailandPulseSnapshot[]) => {
  const byDate = new Map<string, ThailandPulseSnapshot>();
  sortSnapshots(snapshots).forEach(s => { if (!byDate.has(s.dateKey)) byDate.set(s.dateKey, s); });
  return sortSnapshots(Array.from(byDate.values())).slice(0, MAX_HISTORY_DAYS);
};

const writeSnapshotHistory = (snapshots: ThailandPulseSnapshot[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(trimHistory(snapshots)));
};

export const getPulseSnapshotHistory = (): ThailandPulseSnapshot[] => {
  if (typeof window === 'undefined') return [];
  const snapshots = safeJsonParse<ThailandPulseSnapshot[]>(
    window.localStorage.getItem(SNAPSHOT_STORAGE_KEY), []
  );
  return trimHistory(snapshots.map(s => normalizeSnapshot(s)));
};

export const getLatestPulseSnapshot = (): ThailandPulseSnapshot | null =>
  getPulseSnapshotHistory()[0] || null;

export const persistPulseSnapshot = (snapshot: ThailandPulseSnapshot) => {
  if (typeof window === 'undefined') return;
  const existing = getPulseSnapshotHistory();
  writeSnapshotHistory([normalizeSnapshot(snapshot), ...existing]);
};

// ─── interests ────────────────────────────────────────────────────────────────

export const getPulseInterests = (): string[] => {
  if (typeof window === 'undefined') return [...DEFAULT_PULSE_INTERESTS];
  const stored = safeJsonParse<string[]>(window.localStorage.getItem(INTEREST_STORAGE_KEY), []);
  const sanitized = sanitizeInterests(stored);
  return sanitized.length > 0 ? sanitized : [...DEFAULT_PULSE_INTERESTS];
};

export const savePulseInterests = (interests: string[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(INTEREST_STORAGE_KEY, JSON.stringify(sanitizeInterests(interests)));
};

// ─── source policy ────────────────────────────────────────────────────────────

export const getPulseSourcePolicy = (): PulseSourcePolicy => {
  if (typeof window === 'undefined') return { allowDomains: [], denyDomains: [] };
  const stored = safeJsonParse<PulseSourcePolicy>(
    window.localStorage.getItem(SOURCE_POLICY_STORAGE_KEY),
    { allowDomains: [], denyDomains: [] }
  );
  return {
    allowDomains: sanitizeDomains(stored?.allowDomains || []),
    denyDomains:  sanitizeDomains(stored?.denyDomains  || [])
  };
};

export const savePulseSourcePolicy = (policy: PulseSourcePolicy) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SOURCE_POLICY_STORAGE_KEY, JSON.stringify({
    allowDomains: sanitizeDomains(policy.allowDomains || []),
    denyDomains:  sanitizeDomains(policy.denyDomains  || [])
  }));
};

// ─── feedback ─────────────────────────────────────────────────────────────────

export const getPulseFeedbackMap = (): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  return safeJsonParse<Record<string, boolean>>(window.localStorage.getItem(FEEDBACK_STORAGE_KEY), {});
};

export const persistPulseFeedbackMap = (map: Record<string, boolean>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(map));
};

// ─── fallback snapshot builder ────────────────────────────────────────────────

export const buildFallbackSnapshot = (interests: string[]): ThailandPulseSnapshot => {
  const now = new Date();
  const generatedAt = now.toISOString();
  const dateKey = toDateKey(now);

  const buildCategory = (interest: string, index: number, region: PulseRegion): PulseCategorySnapshot => {
    const query = region === 'TH' ? `${interest} Thailand` : `${interest} global`;
    const trustedSources = region === 'TH'
      ? ['Bangkok Post', 'Thai PBS', 'Reuters']
      : ['Reuters', 'Bloomberg', 'BBC'];
    return {
      id: `${region.toLowerCase()}-${interest.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: interest, region, query, trustedSources,
      articles: [{
        id: `fallback-${region.toLowerCase()}-${index}`,
        title: `No live articles for ${interest} (${region === 'TH' ? 'Thailand' : 'Global'})`,
        summary: 'Feed is temporarily unavailable. Refresh again to load latest updates.',
        url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
        source: 'Google News',
        sourceUrl: 'https://news.google.com/',
        publishedAt: generatedAt,
        trustTier: 'B',
        category: interest,
        keywords: [interest],
        provider: 'FALLBACK',
        region,
        citations: [{ label: 'Google News Search', url: `https://news.google.com/search?q=${encodeURIComponent(query)}`, provider: 'FALLBACK', retrievedAt: generatedAt }]
      }]
    };
  };

  const sections: PulseSectionSnapshot[] = (['TH', 'GLOBAL'] as PulseRegion[]).map(region => ({
    id: region,
    label: REGION_LABEL[region],
    categories: interests.map((interest, index) => buildCategory(interest, index, region))
  }));

  return normalizeSnapshot({
    id: `pulse-fallback-${dateKey}`,
    dateKey,
    generatedAt,
    interests,
    isFallback: true,
    provider: 'FALLBACK',
    notes: [
      'Live feed unavailable. Showing fallback snapshot.',
      'Try refresh again when the feed endpoint is reachable.'
    ],
    trends: [
      { label: 'Open Source AI', count: 1, categories: ['AI'] },
      { label: 'GLM-5', count: 1, categories: ['AI'] },
      { label: 'กกต', count: 1, categories: ['Political'] }
    ],
    sourceCoverage: [],
    sections,
    categories: sections.flatMap(s => s.categories)
  });
};
