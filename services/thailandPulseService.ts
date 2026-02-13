export type PulseTrustTier = 'A' | 'B' | 'C' | 'UNKNOWN';
export type PulseProvider = 'RSS' | 'EXA' | 'EXA+FIRECRAWL' | 'MIXED' | 'FALLBACK';

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
  provider?: PulseProvider;
  citations?: PulseCitation[];
}

export interface PulseCategorySnapshot {
  name: string;
  query: string;
  articles: PulseArticle[];
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
  trends: PulseTrendSignal[];
  sourceCoverage: PulseSourceCoverage[];
  notes: string[];
  isFallback?: boolean;
  provider?: PulseProvider;
}

const SNAPSHOT_STORAGE_KEY = 'para-thailand-pulse-snapshots-v1';
const INTEREST_STORAGE_KEY = 'para-thailand-pulse-interests-v1';

const MAX_HISTORY_DAYS = 7;
const MAX_INTERESTS = 12;

export const DEFAULT_PULSE_INTERESTS = [
  'Technology',
  'AI',
  'Economic',
  'Political',
  'Business'
];

const toDateKey = (value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? new Date().toISOString().slice(0, 10)
    : date.toISOString().slice(0, 10);
};

const safeJsonParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const cleanInterest = (value: string) => value.trim().replace(/\s+/g, ' ');

export const sanitizeInterests = (values: string[]) => {
  const unique = new Set<string>();
  values.forEach((value) => {
    const cleaned = cleanInterest(value);
    if (cleaned) unique.add(cleaned);
  });
  return Array.from(unique).slice(0, MAX_INTERESTS);
};

export const getPulseInterests = (): string[] => {
  if (typeof window === 'undefined') return [...DEFAULT_PULSE_INTERESTS];
  const stored = safeJsonParse<string[]>(
    window.localStorage.getItem(INTEREST_STORAGE_KEY),
    []
  );
  const sanitized = sanitizeInterests(stored);
  return sanitized.length > 0 ? sanitized : [...DEFAULT_PULSE_INTERESTS];
};

export const savePulseInterests = (interests: string[]) => {
  if (typeof window === 'undefined') return;
  const sanitized = sanitizeInterests(interests);
  window.localStorage.setItem(INTEREST_STORAGE_KEY, JSON.stringify(sanitized));
};

const sortSnapshots = (snapshots: ThailandPulseSnapshot[]) =>
  [...snapshots].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

const trimHistory = (snapshots: ThailandPulseSnapshot[]) => {
  const byDate = new Map<string, ThailandPulseSnapshot>();
  sortSnapshots(snapshots).forEach((snapshot) => {
    if (!byDate.has(snapshot.dateKey)) {
      byDate.set(snapshot.dateKey, snapshot);
    }
  });
  return sortSnapshots(Array.from(byDate.values())).slice(0, MAX_HISTORY_DAYS);
};

export const getPulseSnapshotHistory = (): ThailandPulseSnapshot[] => {
  if (typeof window === 'undefined') return [];
  const snapshots = safeJsonParse<ThailandPulseSnapshot[]>(
    window.localStorage.getItem(SNAPSHOT_STORAGE_KEY),
    []
  );
  return trimHistory(snapshots);
};

export const getLatestPulseSnapshot = (): ThailandPulseSnapshot | null => {
  const history = getPulseSnapshotHistory();
  return history[0] || null;
};

export const persistPulseSnapshot = (snapshot: ThailandPulseSnapshot) => {
  if (typeof window === 'undefined') return;
  const existing = getPulseSnapshotHistory();
  const merged = trimHistory([snapshot, ...existing]);
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(merged));
};

const buildFallbackSnapshot = (interests: string[]): ThailandPulseSnapshot => {
  const now = new Date();
  const generatedAt = now.toISOString();
  const dateKey = toDateKey(now);

  return {
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
    categories: interests.map((interest, index) => ({
      name: interest,
      query: `${interest} Thailand`,
      articles: [
        {
          id: `fallback-${index}`,
          title: `No live articles for ${interest} right now`,
          summary: 'Feed is temporarily unavailable. Refresh again to load latest updates.',
          url: `https://news.google.com/search?q=${encodeURIComponent(`${interest} Thailand`)}`,
          source: 'Google News',
          sourceUrl: 'https://news.google.com/',
          publishedAt: generatedAt,
          trustTier: 'B',
          category: interest,
          keywords: [interest],
          provider: 'FALLBACK',
          citations: [
            {
              label: 'Google News Search',
              url: `https://news.google.com/search?q=${encodeURIComponent(`${interest} Thailand`)}`,
              provider: 'FALLBACK',
              retrievedAt: generatedAt
            }
          ]
        }
      ]
    }))
  };
};

export const fetchThailandPulseSnapshot = async (
  interests: string[]
): Promise<ThailandPulseSnapshot> => {
  const sanitized = sanitizeInterests(interests);
  const effectiveInterests = sanitized.length > 0 ? sanitized : [...DEFAULT_PULSE_INTERESTS];
  const query = encodeURIComponent(effectiveInterests.join(','));
  const response = await fetch(`/api/thailand-pulse?interests=${query}`);

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const payload = await response.json();
  const snapshot = payload?.snapshot as ThailandPulseSnapshot | undefined;
  if (!snapshot || !Array.isArray(snapshot.categories)) {
    throw new Error('Invalid feed payload');
  }
  return snapshot;
};

export const loadPulseSnapshotWithFallback = async (
  interests: string[]
): Promise<ThailandPulseSnapshot> => {
  try {
    const snapshot = await fetchThailandPulseSnapshot(interests);
    persistPulseSnapshot(snapshot);
    return snapshot;
  } catch {
    const sanitized = sanitizeInterests(interests);
    const fallback = buildFallbackSnapshot(
      sanitized.length ? sanitized : [...DEFAULT_PULSE_INTERESTS]
    );
    persistPulseSnapshot(fallback);
    return fallback;
  }
};
