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

const SNAPSHOT_STORAGE_KEY = 'para-thailand-pulse-snapshots-v1';
const INTEREST_STORAGE_KEY = 'para-thailand-pulse-interests-v1';
const SOURCE_POLICY_STORAGE_KEY = 'para-thailand-pulse-source-policy-v1';
const FEEDBACK_STORAGE_KEY = 'para-thailand-pulse-feedback-v1';

const MAX_HISTORY_DAYS = 7;
const MAX_INTERESTS = 12;
const PULSE_API_BASE = '/api/world-pulse';

const getCaptureKey = (): string => {
  try {
    return String((import.meta as any)?.env?.VITE_CAPTURE_API_SECRET || '').trim();
  } catch {
    return '';
  }
};

const pulseAuthHeaders = (json = false): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (json) headers['Content-Type'] = 'application/json';
  const key = getCaptureKey();
  if (key) headers['x-capture-key'] = key;
  return headers;
};

const REGION_LABEL: Record<PulseRegion, string> = {
  TH: 'Thailand',
  GLOBAL: 'Global'
};

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
const cleanDomain = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .replace(/:\d+$/, '')
    .replace(/\.+$/, '');

export const sanitizeInterests = (values: string[]) => {
  const unique = new Set<string>();
  values.forEach((value) => {
    const cleaned = cleanInterest(value);
    if (cleaned) unique.add(cleaned);
  });
  return Array.from(unique).slice(0, MAX_INTERESTS);
};

export const sanitizeDomains = (values: string[]) => {
  const unique = new Set<string>();
  values.forEach((value) => {
    const cleaned = cleanDomain(value);
    if (cleaned) unique.add(cleaned);
  });
  return Array.from(unique).slice(0, 80);
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

export const getPulseSourcePolicy = (): PulseSourcePolicy => {
  if (typeof window === 'undefined') {
    return { allowDomains: [], denyDomains: [] };
  }
  const stored = safeJsonParse<PulseSourcePolicy>(
    window.localStorage.getItem(SOURCE_POLICY_STORAGE_KEY),
    { allowDomains: [], denyDomains: [] }
  );
  return {
    allowDomains: sanitizeDomains(stored?.allowDomains || []),
    denyDomains: sanitizeDomains(stored?.denyDomains || [])
  };
};

export const savePulseSourcePolicy = (policy: PulseSourcePolicy) => {
  if (typeof window === 'undefined') return;
  const sanitized = {
    allowDomains: sanitizeDomains(policy.allowDomains || []),
    denyDomains: sanitizeDomains(policy.denyDomains || [])
  };
  window.localStorage.setItem(SOURCE_POLICY_STORAGE_KEY, JSON.stringify(sanitized));
};

export const getPulseFeedbackMap = (): Record<string, boolean> => {
  if (typeof window === 'undefined') return {};
  return safeJsonParse<Record<string, boolean>>(window.localStorage.getItem(FEEDBACK_STORAGE_KEY), {});
};

const persistPulseFeedbackMap = (map: Record<string, boolean>) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(map));
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

const toRegion = (value: unknown): PulseRegion => (value === 'GLOBAL' ? 'GLOBAL' : 'TH');

const normalizeCategory = (category: PulseCategorySnapshot, regionHint?: PulseRegion): PulseCategorySnapshot => {
  const region = category.region ? toRegion(category.region) : regionHint;
  return {
    ...category,
    region,
    trustedSources: Array.isArray(category.trustedSources)
      ? category.trustedSources
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 3)
      : []
  };
};

const sectionsFromCategories = (categories: PulseCategorySnapshot[]): PulseSectionSnapshot[] => {
  const grouped: Record<PulseRegion, PulseCategorySnapshot[]> = { TH: [], GLOBAL: [] };
  categories.forEach((category) => {
    const region = toRegion(category.region);
    grouped[region].push(normalizeCategory(category, region));
  });
  return (['TH', 'GLOBAL'] as PulseRegion[])
    .filter((region) => grouped[region].length > 0)
    .map((region) => ({
      id: region,
      label: REGION_LABEL[region],
      categories: grouped[region]
    }));
};

const normalizeSnapshot = (snapshot: ThailandPulseSnapshot): ThailandPulseSnapshot => {
  const categories = Array.isArray(snapshot.categories)
    ? snapshot.categories.map((category) => normalizeCategory(category))
    : [];

  if (Array.isArray(snapshot.sections) && snapshot.sections.length > 0) {
    const sections = snapshot.sections.map((section) => {
      const id = toRegion(section.id);
      return {
        id,
        label: String(section.label || REGION_LABEL[id]),
        categories: Array.isArray(section.categories)
          ? section.categories.map((category) => normalizeCategory(category, id))
          : []
      };
    });
    const flattened = sections.flatMap((section) => section.categories);
    return {
      ...snapshot,
      categories: flattened,
      sections
    };
  }

  const sections = sectionsFromCategories(categories);
  return {
    ...snapshot,
    categories,
    sections
  };
};

const writeSnapshotHistory = (snapshots: ThailandPulseSnapshot[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(trimHistory(snapshots)));
};

export const getPulseSnapshotHistory = (): ThailandPulseSnapshot[] => {
  if (typeof window === 'undefined') return [];
  const snapshots = safeJsonParse<ThailandPulseSnapshot[]>(
    window.localStorage.getItem(SNAPSHOT_STORAGE_KEY),
    []
  );
  return trimHistory(snapshots.map((snapshot) => normalizeSnapshot(snapshot)));
};

export const getLatestPulseSnapshot = (): ThailandPulseSnapshot | null => {
  const history = getPulseSnapshotHistory();
  return history[0] || null;
};

export const persistPulseSnapshot = (snapshot: ThailandPulseSnapshot) => {
  if (typeof window === 'undefined') return;
  const existing = getPulseSnapshotHistory();
  const merged = trimHistory([normalizeSnapshot(snapshot), ...existing]);
  writeSnapshotHistory(merged);
};

export const fetchPulseSnapshotHistoryFromServer = async (days = 7): Promise<ThailandPulseSnapshot[]> => {
  const safeDays = Math.max(1, Math.min(30, Math.floor(Number(days) || 7)));
  const response = await fetch(`${PULSE_API_BASE}?mode=history&days=${safeDays}`, { headers: pulseAuthHeaders() });
  if (!response.ok) {
    throw new Error(`History request failed (${response.status})`);
  }
  const payload = await response.json();
  const snapshots = payload?.snapshots;
  if (!Array.isArray(snapshots)) return [];
  return trimHistory((snapshots as ThailandPulseSnapshot[]).map((snapshot) => normalizeSnapshot(snapshot)));
};

export const syncPulseHistoryFromServer = async (days = 7): Promise<ThailandPulseSnapshot[]> => {
  const local = getPulseSnapshotHistory();
  try {
    const remote = await fetchPulseSnapshotHistoryFromServer(days);
    if (remote.length === 0) return local;
    const merged = trimHistory([...remote, ...local]);
    writeSnapshotHistory(merged);
    return merged;
  } catch {
    return local;
  }
};

const buildFallbackSnapshot = (interests: string[]): ThailandPulseSnapshot => {
  const now = new Date();
  const generatedAt = now.toISOString();
  const dateKey = toDateKey(now);
  const buildCategory = (interest: string, index: number, region: PulseRegion): PulseCategorySnapshot => {
    const query = region === 'TH' ? `${interest} Thailand` : `${interest} global`;
    const trustedSources = region === 'TH'
      ? ['Bangkok Post', 'Thai PBS', 'Reuters']
      : ['Reuters', 'Bloomberg', 'BBC'];
    return {
      id: `${region.toLowerCase()}-${cleanInterest(interest).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      name: interest,
      region,
      query,
      trustedSources,
      articles: [
        {
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
          citations: [
            {
              label: 'Google News Search',
              url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
              provider: 'FALLBACK',
              retrievedAt: generatedAt
            }
          ]
        }
      ]
    };
  };

  const sections: PulseSectionSnapshot[] = (['TH', 'GLOBAL'] as PulseRegion[]).map((region) => ({
    id: region,
    label: REGION_LABEL[region],
    categories: interests.map((interest, index) => buildCategory(interest, index, region))
  }));
  const categories = sections.flatMap((section) => section.categories);

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
    categories
  });
};

interface PulseFetchOptions {
  ownerKey?: string;
  sourcePolicy?: PulseSourcePolicy;
}

export const fetchPulseSourcePolicyFromServer = async (ownerKey?: string): Promise<PulseSourcePolicy | null> => {
  const params = new URLSearchParams({ mode: 'policy' });
  if (ownerKey) params.set('ownerKey', ownerKey);
  const response = await fetch(`${PULSE_API_BASE}?${params.toString()}`, { headers: pulseAuthHeaders() });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const policy = payload?.policy;
  if (!policy || typeof policy !== 'object') return null;
  return {
    allowDomains: sanitizeDomains(policy.allowDomains || []),
    denyDomains: sanitizeDomains(policy.denyDomains || [])
  };
};

export const savePulseSourcePolicyToServer = async (
  policy: PulseSourcePolicy,
  ownerKey?: string
): Promise<boolean> => {
  const response = await fetch(PULSE_API_BASE, {
    method: 'POST',
    headers: pulseAuthHeaders(true),
    body: JSON.stringify({
      mode: 'policy',
      ownerKey,
      allowDomains: sanitizeDomains(policy.allowDomains || []),
      denyDomains: sanitizeDomains(policy.denyDomains || [])
    })
  });
  return response.ok;
};

export const submitPulseFeedback = async (payload: {
  article: PulseArticle;
  relevant: boolean;
  ownerKey?: string;
  snapshotDate?: string;
}) => {
  const feedbackMap = getPulseFeedbackMap();
  feedbackMap[payload.article.id] = payload.relevant;
  persistPulseFeedbackMap(feedbackMap);

  const response = await fetch(PULSE_API_BASE, {
    method: 'POST',
    headers: pulseAuthHeaders(true),
    body: JSON.stringify({
      mode: 'feedback',
      ownerKey: payload.ownerKey,
      articleId: payload.article.id,
      articleUrl: payload.article.url,
      source: payload.article.source,
      domain: payload.article.domain,
      category: payload.article.category,
      keywords: payload.article.keywords || [],
      relevant: payload.relevant,
      snapshotDate: payload.snapshotDate,
      confidenceScore: payload.article.confidenceScore,
      metadata: {
        provider: payload.article.provider,
        trustTier: payload.article.trustTier
      }
    })
  });

  return response.ok;
};

export const fetchThailandPulseSnapshot = async (
  interests: string[],
  options: PulseFetchOptions = {}
): Promise<ThailandPulseSnapshot> => {
  const sanitized = sanitizeInterests(interests);
  const effectiveInterests = sanitized.length > 0 ? sanitized : [...DEFAULT_PULSE_INTERESTS];
  const params = new URLSearchParams({
    interests: effectiveInterests.join(',')
  });
  if (options.ownerKey) params.set('ownerKey', options.ownerKey);
  if (options.sourcePolicy) {
    params.set('allowDomains', sanitizeDomains(options.sourcePolicy.allowDomains || []).join(','));
    params.set('denyDomains', sanitizeDomains(options.sourcePolicy.denyDomains || []).join(','));
  }
  const response = await fetch(`${PULSE_API_BASE}?${params.toString()}`, { headers: pulseAuthHeaders() });

  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const payload = await response.json();
  const snapshot = payload?.snapshot as ThailandPulseSnapshot | undefined;
  if (!snapshot || !Array.isArray(snapshot.categories)) {
    throw new Error('Invalid feed payload');
  }
  return normalizeSnapshot(snapshot);
};

export const loadPulseSnapshotWithFallback = async (
  interests: string[],
  options: PulseFetchOptions = {}
): Promise<ThailandPulseSnapshot> => {
  try {
    const snapshot = await fetchThailandPulseSnapshot(interests, options);
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
